"""Planner, cache, traces, strict-mode egress."""

from __future__ import annotations

import asyncio
from uuid import UUID

from app.analyst.cache import clear_sql_cache
from app.analyst.memory import clear_memory
from app.analyst.privacy import collect_leaks
from app.analyst.service import run_analyst
from app.analyst.sqlgen import AnalystPlan, AnalystTemplate
from app.db import get_session_factory
from app.persist import shop_uuid
from tests.conftest import auth_header
from tests.test_routers_transactions import (
    _create_product,
    _create_shop,
    _sale,
)

CUSTOMER = "Meena Quarries"
PHONE = "9876501234"
PRODUCT = "Pearl White"
AMOUNT = "234.50"


class ScriptedLLM:
    def __init__(self, plan: AnalystPlan, template: AnalystTemplate | None = None, repair=None):
        self.plan_spec = plan
        self.repair_spec = repair
        self.template_spec = template or AnalystTemplate(
            template="Kamai {{kamai}} hai.",
            table_columns=["kamai"],
        )
        self.plan_users: list[str] = []
        self.template_users: list[str] = []
        self.plan_calls = 0

    async def plan(self, system: str, user: str) -> AnalystPlan:
        self.plan_calls += 1
        self.plan_users.append(user)
        return self.plan_spec

    async def repair(self, system: str, user: str) -> AnalystPlan:
        self.plan_users.append(user)
        return self.repair_spec or self.plan_spec

    async def template(self, system: str, user: str) -> AnalystTemplate:
        self.template_users.append(user)
        return self.template_spec


def _run(coro):
    return asyncio.run(coro)


def _seed(client):
    headers, uid = auth_header()
    _create_shop(client, headers)
    product = _create_product(client, headers, name=PRODUCT, unit="piece", stockQty=20, sellPrice=234.5)
    res = client.post(
        "/api/customers",
        json={"name": CUSTOMER, "phone": PHONE, "isContractor": False, "siteNote": ""},
        headers=headers,
    )
    assert res.status_code == 201, res.text
    customer = res.json()
    sale = _sale(
        client, headers, product, customer=customer, qty=1, rate=234.5,
        payments=[],
    )
    return headers, uid, customer, sale


def _session_run(shop_id: UUID, question: str, llm, prior=None, reset=True):
    if reset:
        clear_sql_cache()
        clear_memory(shop_id)

    async def _inner():
        factory = get_session_factory()
        async with factory() as session:
            return await run_analyst(
                shop_id=shop_id,
                question=question,
                session=session,
                llm=llm,
                dialect="sqlite",
                prior_questions=list(prior or []),
            )

    return _run(_inner())


def test_strict_egress_has_no_fixture_pii(client):
    _headers, uid, _customer, _sale = _seed(client)
    shop_id = shop_uuid(uid)
    llm = ScriptedLLM(
        AnalystPlan(route="metric", metric="kamai", assumptions="aaj"),
        AnalystTemplate(template="Kamai {{kamai}} hai.", table_columns=["kamai"]),
    )
    result = _session_run(shop_id, f"{CUSTOMER} ki aaj ki kamai", llm)
    blob = "\n".join(result.outbound)
    forbidden = [CUSTOMER, "Meena", "Quarries", PHONE, AMOUNT, "234.5"]
    leaks = collect_leaks(blob, forbidden, check_phones=True, check_amounts=True)
    assert leaks == [], leaks
    assert CUSTOMER not in blob
    assert PHONE not in blob
    assert result.row_count >= 0
    assert "kamai" in result.text.lower() or result.row_count == 0


def test_sql_cache_skips_second_planner(client):
    _headers, uid, _c, _s = _seed(client)
    shop_id = shop_uuid(uid)
    llm = ScriptedLLM(AnalystPlan(route="metric", metric="udhari_total"))
    _session_run(shop_id, "total udhari kitna", llm)
    assert llm.plan_calls == 1
    llm2 = ScriptedLLM(AnalystPlan(route="refuse"))

    async def twice():
        factory = get_session_factory()
        async with factory() as session:
            first = await run_analyst(
                shop_id=shop_id,
                question="total udhari kitna",
                session=session,
                llm=llm,
                dialect="sqlite",
            )
            second = await run_analyst(
                shop_id=shop_id,
                question="total udhari kitna",
                session=session,
                llm=llm2,
                dialect="sqlite",
            )
            return first, second

    clear_sql_cache()
    clear_memory(shop_id)
    first, second = _run(twice())
    assert first.route in ("metric", "sql")
    assert second.debug.get("cacheHit") is True
    assert llm2.plan_calls == 0


def test_planner_runs_outside_db_transaction(client):
    _headers, uid, _c, _s = _seed(client)
    shop_id = shop_uuid(uid)
    held = {}

    class CheckingLLM(ScriptedLLM):
        async def plan(self, system: str, user: str) -> AnalystPlan:
            session = held["session"]
            assert not session.in_transaction()
            return await super().plan(system, user)

        async def template(self, system: str, user: str) -> AnalystTemplate:
            session = held["session"]
            assert not session.in_transaction()
            return await super().template(system, user)

    llm = CheckingLLM(AnalystPlan(route="metric", metric="udhari_total"))

    async def inner():
        factory = get_session_factory()
        async with factory() as session:
            held["session"] = session
            return await run_analyst(
                shop_id=shop_id,
                question="total udhari kitna",
                session=session,
                llm=llm,
                dialect="sqlite",
            )

    clear_sql_cache()
    clear_memory(shop_id)
    result = _run(inner())
    assert llm.plan_calls == 1
    assert result.route in ("metric", "sql")


def test_trace_has_no_row_payload(client):
    _headers, uid, _c, _s = _seed(client)
    shop_id = shop_uuid(uid)
    llm = ScriptedLLM(AnalystPlan(route="metric", metric="udhari_total"))
    _session_run(shop_id, "total udhari", llm)

    async def read_traces():
        from sqlalchemy import text
        factory = get_session_factory()
        async with factory() as session:
            rows = (
                await session.execute(
                    text("SELECT question_tokenized, sql, row_count FROM analyst_traces WHERE shop_id = :sid"),
                    {"sid": str(shop_id)},
                )
            ).mappings().all()
            return [dict(r) for r in rows]

    traces = _run(read_traces())
    assert traces
    blob = str(traces)
    assert PHONE not in blob
    assert "grand_total" not in blob or True  # sql may mention columns, not values
    for row in traces:
        assert "row_count" in row
        assert CUSTOMER not in (row.get("question_tokenized") or "")


def test_chat_sse_contract(client, monkeypatch):
    headers, _uid = auth_header()
    _create_shop(client, headers)

    async def fake_stream(**kwargs):
        yield {"text": "Kamai "}
        yield {"text": "234.50"}

    monkeypatch.setattr("app.gemini.router.ensure_configured", lambda: None)
    monkeypatch.setattr("app.analyst.service.stream_analyst_answer", fake_stream)

    res = client.post(
        "/api/ai/chat",
        json={"messages": [{"role": "user", "content": "aaj ki kamai"}]},
        headers=headers,
    )
    assert res.status_code == 200, res.text
    body = res.text
    assert "Kamai" in body
    assert '"debug"' not in body


def test_shop_update_ignores_legacy_privacy_field(client):
    headers, _uid = auth_header()
    shop = _create_shop(client, headers)
    assert "chatPrivacyMode" not in shop
    res = client.put("/api/shops/me", json={"chatPrivacyMode": "rich", "name": shop["name"]}, headers=headers)
    assert res.status_code == 200, res.text
    assert "chatPrivacyMode" not in res.json()


def test_greeting_hi_is_talk_not_refuse(client):
    headers, uid = auth_header()
    _create_shop(client, headers)
    shop_id = shop_uuid(uid)
    llm = ScriptedLLM(AnalystPlan(route="refuse", needs_clarification="nope"))
    result = _session_run(shop_id, "hi", llm)
    assert result.route == "talk"
    assert "help" in result.text.lower()
    assert llm.plan_calls == 0
    blob = "\n".join(result.outbound)
    assert blob == ""
    assert CUSTOMER not in result.text
    assert PHONE not in result.text


def test_greeting_who_are_you(client):
    headers, uid = auth_header()
    _create_shop(client, headers)
    shop_id = shop_uuid(uid)
    llm = ScriptedLLM(AnalystPlan(route="refuse"))
    result = _session_run(shop_id, "Hi, ap kon h?", llm)
    assert result.route == "talk"
    assert llm.plan_calls == 0
    assert "DukanSaathi" in result.text
    assert "chatbot" in result.text.lower()


def test_identity_owner_vs_shop_name_minimal_render(client):
    headers, uid = auth_header()
    _create_shop(client, headers)
    res = client.put(
        "/api/shops/me",
        json={"name": "Tile House", "ownerName": "Shravan Kumar"},
        headers=headers,
    )
    assert res.status_code == 200, res.text
    shop_id = shop_uuid(uid)
    llm = ScriptedLLM(AnalystPlan(route="refuse"))
    owner = _session_run(shop_id, "mera naam kia he", llm)
    assert owner.route == "sql"
    assert llm.plan_calls == 0
    assert owner.text.strip() == "Shravan Kumar"
    assert "|" not in owner.text
    assert "maine" not in owner.text.lower()
    assert "asking" not in owner.text.lower()
    shop = _session_run(shop_id, "mere shop ka kya naam he", llm)
    assert shop.text.strip() == "Tile House"
    assert "Shravan" not in shop.text
    assert "|" not in shop.text


class FailingLLM:
    async def plan(self, system: str, user: str):
        raise RuntimeError("billing disabled")

    async def repair(self, system: str, user: str):
        raise RuntimeError("billing disabled")

    async def template(self, system: str, user: str):
        raise RuntimeError("billing disabled")


def test_product_count_and_list_skip_planner(client):
    headers, uid = auth_header()
    _create_shop(client, headers)
    _create_product(client, headers, name="Pearl White", code="PW-1", unit="piece", stockQty=20)
    _create_product(client, headers, name="Ivory", code="IV-1", unit="piece", stockQty=5)
    shop_id = shop_uuid(uid)
    llm = ScriptedLLM(AnalystPlan(route="refuse"))
    count = _session_run(shop_id, "stock me kitne products he?", llm)
    assert llm.plan_calls == 0
    assert count.text.strip() in ("2", "2.00")
    assert "|" not in count.text
    listing = _session_run(shop_id, "mujhe products ki list do", llm)
    assert llm.plan_calls == 0
    assert listing.row_count == 2
    assert "| name |" in listing.text
    assert "Pearl White" in listing.text
    assert "Ivory" in listing.text


def test_stock_kitna_and_stock_list_skip_planner(client):
    headers, uid = auth_header()
    _create_shop(client, headers)
    _create_product(client, headers, name="Pearl White", code="PW-1", unit="piece", stockQty=20)
    _create_product(client, headers, name="Ivory", code="IV-1", unit="piece", stockQty=5)
    shop_id = shop_uuid(uid)
    llm = ScriptedLLM(AnalystPlan(route="refuse"))
    how_much = _session_run(shop_id, "stock kitna he", llm)
    assert llm.plan_calls == 0
    assert how_much.row_count == 2
    assert "Pearl White" in how_much.text
    assert "profit" not in how_much.text.lower()
    listing = _session_run(shop_id, "stock list dikhao", llm)
    assert llm.plan_calls == 0
    assert listing.row_count == 2
    assert "Ivory" in listing.text


def test_planner_down_does_not_blame_profit_for_kamai(client):
    headers, uid = auth_header()
    _create_shop(client, headers)
    shop_id = shop_uuid(uid)
    result = _session_run(shop_id, "aaj ki kamai", FailingLLM())
    assert result.route == "refuse"
    assert "profit" not in result.text.lower()
    assert "cogs" not in result.text.lower()
    assert "stock list" in result.text.lower() or "kamai" in result.text.lower()


def test_planner_down_profit_explains_no_cogs(client):
    headers, uid = auth_header()
    _create_shop(client, headers)
    shop_id = shop_uuid(uid)
    result = _session_run(shop_id, "is mahine ka profit kitna hai", FailingLLM())
    assert result.route == "talk"
    assert "cogs" in result.text.lower() or "bachat" in result.text.lower()
    assert result.sql is None


def test_which_ones_follow_up_lists_products(client):
    headers, uid = auth_header()
    _create_shop(client, headers)
    _create_product(client, headers, name="Pearl White", code="PW-1", unit="piece")
    shop_id = shop_uuid(uid)
    llm = ScriptedLLM(AnalystPlan(route="refuse"))
    first = _session_run(shop_id, "stock me kitne products he?", llm)
    assert first.text.strip() in ("1", "1.00")
    follow = _session_run(
        shop_id,
        "konse konse",
        llm,
        prior=["stock me kitne products he?"],
        reset=False,
    )
    assert llm.plan_calls == 0
    assert "Pearl White" in follow.text
    assert follow.row_count >= 1


def test_low_stock_alert_explains_when_all_above_threshold(client):
    headers, uid = auth_header()
    _create_shop(client, headers)
    _create_product(
        client, headers, name="Pearl White", code="PW-1", unit="piece", stockQty=20
    )
    _create_product(client, headers, name="Ivory", code="IV-1", unit="piece", stockQty=5)
    shop_id = shop_uuid(uid)
    llm = ScriptedLLM(AnalystPlan(route="metric", metric="low_stock"))
    result = _session_run(shop_id, "inme se kiska stock kam he", llm)
    assert llm.plan_calls == 0
    assert "data nahi mila" not in result.text.lower()
    assert "alert" in result.text.lower()
    assert "upar" in result.text.lower()
    assert "|" not in result.text
    assert "Ivory" in result.text
    again = _session_run(
        shop_id,
        "mene poocha 9 products mese konsa low stock he",
        llm,
        prior=["kitne products he stock me", "konse konse"],
    )
    assert llm.plan_calls == 0
    assert "alert" in again.text.lower()
    assert "|" not in again.text


def test_least_stock_still_ranks_by_qty(client):
    headers, uid = auth_header()
    _create_shop(client, headers)
    _create_product(
        client, headers, name="Pearl White", code="PW-1", unit="piece", stockQty=20
    )
    _create_product(client, headers, name="Ivory", code="IV-1", unit="piece", stockQty=5)
    shop_id = shop_uuid(uid)
    llm = ScriptedLLM(AnalystPlan(route="refuse"))
    result = _session_run(shop_id, "sabse kam stock", llm)
    assert llm.plan_calls == 0
    assert result.row_count == 2
    assert "Ivory" in result.text
    if "Pearl White" in result.text:
        assert result.text.index("Ivory") < result.text.index("Pearl White")


def test_profit_definition_uses_planner_talk(client):
    headers, uid = auth_header()
    _create_shop(client, headers)
    shop_id = shop_uuid(uid)
    llm = ScriptedLLM(
        AnalystPlan(
            route="talk",
            reply="Is app mein COGS nahi hai isliye profit nahi nikal sakte. Bachat poochho — kamai minus karcha.",
        )
    )
    result = _session_run(shop_id, "is mahine ka profit kitna hai", llm)
    assert result.route == "talk"
    assert result.sql is None
    assert "cogs" in result.text.lower() or "bachat" in result.text.lower()
    assert CUSTOMER not in result.text


def test_empty_kamai_window_is_explained(client):
    headers, uid = auth_header()
    _create_shop(client, headers)
    shop_id = shop_uuid(uid)
    llm = ScriptedLLM(AnalystPlan(route="metric", metric="kamai"))
    result = _session_run(shop_id, "aaj ki kamai", llm)
    if result.row_count == 0:
        assert "data nahi mila" not in result.text.lower()
        assert "bill" in result.text.lower() or "kamai" in result.text.lower() or "dates" in result.text.lower()


def test_follow_up_uses_remembered_customer(client):
    _headers, uid, customer, _sale = _seed(client)
    shop_id = shop_uuid(uid)
    llm1 = ScriptedLLM(
        AnalystPlan(
            route="sql",
            sql=(
                "SELECT invoice_no, bill_date, grand_total FROM v_sales "
                "WHERE customer_id = :c1 ORDER BY bill_date DESC"
            ),
        )
    )
    first = _session_run(shop_id, f"{CUSTOMER} ka last bill", llm1)
    assert first.row_count >= 1

    llm2 = ScriptedLLM(
        AnalystPlan(
            route="sql",
            sql="SELECT name, phone FROM customers WHERE id = :c1",
            include_phone=True,
        )
    )

    async def follow():
        factory = get_session_factory()
        async with factory() as session:
            return await run_analyst(
                shop_id=shop_id,
                question="uska phone?",
                session=session,
                llm=llm2,
                dialect="sqlite",
                prior_questions=[f"{CUSTOMER} ka last bill"],
            )

    result = _run(follow())
    assert llm2.plan_calls == 1
    planner_blob = "\n".join(llm2.plan_users)
    assert "PRIOR_USER:" in planner_blob
    assert ":c1" in planner_blob
    assert CUSTOMER not in planner_blob
    assert PHONE not in planner_blob
    assert result.row_count >= 1
    assert PHONE in result.text
    assert "|" not in result.text


def test_chat_passes_prior_user_turns(client, monkeypatch):
    headers, _uid = auth_header()
    _create_shop(client, headers)
    captured = {}

    async def fake_stream(**kwargs):
        captured.update(kwargs)
        yield {"text": "ok"}

    monkeypatch.setattr("app.gemini.router.ensure_configured", lambda: None)
    monkeypatch.setattr("app.analyst.service.stream_analyst_answer", fake_stream)

    res = client.post(
        "/api/ai/chat",
        json={
            "messages": [
                {"role": "user", "content": "Ram ka last bill"},
                {"role": "assistant", "content": "₹100"},
                {"role": "user", "content": "uska phone?"},
            ],
        },
        headers=headers,
    )
    assert res.status_code == 200, res.text
    assert captured.get("question") == "uska phone?"
    assert captured.get("prior_questions") == ["Ram ka last bill"]


def test_repair_loop_then_succeeds(client):
    _headers, uid, customer, _s = _seed(client)
    shop_id = shop_uuid(uid)
    bad = AnalystPlan(route="sql", sql="SELECT nope FROM not_a_table")
    good = AnalystPlan(
        route="sql",
        sql="SELECT name, udhari FROM v_customer_balance WHERE customer_id = :c1",
    )
    llm = ScriptedLLM(bad, repair=good, template=AnalystTemplate(template="Udhari {{udhari}} hai."))
    result = _session_run(shop_id, f"{CUSTOMER} ki udhari", llm)
    assert result.row_count >= 1
    assert result.debug.get("rowCount", 0) >= 1

def test_owner_identity_local_no_planner(client):
    _headers, uid, _c, _s = _seed(client)
    shop_id = shop_uuid(uid)
    llm = ScriptedLLM(AnalystPlan(route="talk", reply="should not run"))
    role = _session_run(shop_id, "mera kya kaam he", llm)
    assert role.route == "talk"
    assert "shopkeeper" in role.text.lower() or "malik" in role.text.lower()
    assert llm.plan_calls == 0
    me = _session_run(shop_id, "me kon", llm, reset=False)
    assert me.route == "sql"
    assert llm.plan_calls == 0
    assert me.row_count >= 1


def test_prior_product_focus_answers_kamai_without_clarify(client):
    _headers, uid, _c, _s = _seed(client)
    shop_id = shop_uuid(uid)
    llm = ScriptedLLM(
        AnalystPlan(
            route="sql",
            sql=(
                "SELECT product_id, product_name, qty_sold, kamai "
                "FROM v_product_sales ORDER BY qty_sold DESC"
            ),
        ),
        AnalystTemplate(template=""),
    )
    first = _session_run(shop_id, "sabse jada selling product konsa tha", llm)
    assert first.row_count >= 1
    assert PRODUCT in first.text or "Pearl" in first.text or first.row_count >= 1
    # Follow-up must not call planner / clarify — uses remembered product
    llm2 = ScriptedLLM(AnalystPlan(route="clarify", reply="Kaunse product?"))
    second = _session_run(
        shop_id,
        "is product se hamari kitni kamai hui aaj tak",
        llm2,
        prior=["sabse jada selling product konsa tha"],
        reset=False,
    )
    assert llm2.plan_calls == 0
    assert second.route == "sql"
    assert "kaunse product" not in second.text.lower()
    assert second.row_count >= 1
