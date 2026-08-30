"""Gold-set execution accuracy (no live LLM)."""

from __future__ import annotations

import asyncio
from uuid import UUID

from eval.chat.metric import execution_accuracy
from eval.chat.run import load_gold
from app.analyst.executor import execute_select
from app.analyst.guard import guard_sql
from app.persist import shop_uuid
from tests.conftest import auth_header
from tests.test_routers_transactions import (
    _create_customer,
    _create_product,
    _create_shop,
    _sale,
)


def _run(coro):
    return asyncio.run(coro)


def _seed(client):
    headers, uid = auth_header()
    _create_shop(client, headers)
    product = _create_product(
        client, headers, name="Pearl White", unit="piece", stockQty=30, sellPrice=234.5
    )
    customer = _create_customer(client, headers, name="Meena Quarries")
    inv = _sale(
        client, headers, product, customer=customer, qty=1, rate=234.5, payments=[]
    )
    client.post(
        "/api/expenses",
        json={"amount": 40, "note": "rent", "mode": "cash"},
        headers=headers,
    )
    return headers, shop_uuid(uid), customer, inv


def _exec(shop_id: UUID, sql: str, params: dict):
    guarded = guard_sql(sql, shop_id, dialect="sqlite")
    return _run(execute_select(guarded, shop_id, params))


def test_gold_set_execution_accuracy(client):
    _headers, shop_id, customer, inv = _seed(client)
    params = {
        "start_date": "2000-01-01",
        "end_date": "2099-12-31",
        "c1": UUID(customer["id"]).hex,
        "customer_id": UUID(customer["id"]).hex,
    }
    expected = {
        "fixture_kamai": [{"kamai": 234.5, "sales_gross": 234.5, "returns_total": 0.0}],
        "fixture_bachat": [{"kamai": 234.5, "karcha": 40.0, "bachat": 194.5}],
        "fixture_last_bill": [
            {"invoice_no": inv["invoiceNo"], "grand_total": 234.5, "amount_pending": 234.5}
        ],
        "fixture_udhari": [{"name": "Meena Quarries", "udhari": 234.5}],
        "fixture_lines": [{"product_name": "Pearl White", "line_amount": 234.5}],
    }
    gold = load_gold()
    assert len(gold) >= 5
    for case in gold:
        if case["route"] == "refuse":
            assert case["sql"] in (None, "")
            continue
        cols, rows = _exec(shop_id, case["sql"], params)
        want = expected[case["expect_from"]]
        keys = list(want[0].keys())
        assert execution_accuracy(rows, want, keys=keys), (case["id"], rows, want)


def test_execution_accuracy_helper_rounds():
    assert execution_accuracy(
        [{"kamai": 234.499}],
        [{"kamai": 234.50}],
        keys=["kamai"],
    )
    assert not execution_accuracy(
        [{"kamai": 100}],
        [{"kamai": 90}],
        keys=["kamai"],
    )
