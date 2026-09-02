"""AnalystService — schema in, rows stay home."""

from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Protocol
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.db import brief_session
from app.analyst.cache import lookup_sql, store_sql
from app.analyst.executor import ExecError, execute_select
from app.analyst.guard import GuardError, guard_sql
from app.analyst.memory import get_memory, put_memory
from app.analyst.metrics import compile_metric
from app.analyst.catalog import resolve_metric_name
from app.analyst.privacy import PrivacyLeak, assert_strict_payload, collect_leaks
from app.analyst.resolvers import (
    EntityHit,
    focus_from_result_rows,
    is_shop_aggregate_question,
    merge_focus_product,
    pick_entities,
    refers_to_prior_product,
    resolve_dates,
    resolve_entities,
    shop_today,
    tokenize_question,
    wants_phone,
)
from app.analyst.sqlgen import (
    PLANNER_SYSTEM,
    TEMPLATE_SYSTEM,
    AnalystPlan,
    AnalystTemplate,
    planner_user_message,
    template_user_message,
)
from app.analyst.synthesis import (
    drop_blank_columns,
    interpret_empty,
    render_answer,
    should_show_table,
    strip_phone_columns,
    public_result_set,
)
from app.analyst.talk import (
    CATALOG_KINDS,
    PLANNER_DOWN,
    SQL_PRODUCT_LEAST,
    TALK_KINDS,
    TALK_NO_PROFIT,
    classify_local,
    identity_sql,
    planner_down_local,
    talk_text,
)
from app.analyst.trace import write_trace

logger = logging.getLogger(__name__)

SQL_PRODUCT_FOCUS_KAMAI = (
    "SELECT product_name, qty_sold, kamai FROM v_product_sales WHERE product_id = :p1"
)
SQL_PRODUCT_FOCUS_STOCK = (
    "SELECT name, code, size, stock_qty FROM products WHERE id = :p1"
)

_FOCUS_KAMAI = re.compile(
    r"\b(kamai|sale|sales|bikri|revenue|kitni|kitna)\b",
    re.IGNORECASE,
)
_FOCUS_STOCK = re.compile(r"\b(stock|qty|quantity)\b", re.IGNORECASE)


async def _ensure_product_id(
    session: AsyncSession,
    shop_id: UUID,
    hit: EntityHit,
    dialect: str,
) -> EntityHit:
    """Fill product id when focus was remembered by name only."""
    if hit.kind != "product" or hit.id:
        return hit
    name = (hit.display or "").strip()
    if not name:
        return hit
    sid = shop_id.hex if dialect == "sqlite" else shop_id
    from sqlalchemy import text

    row = (
        await session.execute(
            text(
                "SELECT id, name FROM products WHERE shop_id = :sid AND lower(name) = lower(:n) LIMIT 1"
            ),
            {"sid": sid, "n": name},
        )
    ).mappings().first()
    if not row:
        row = (
            await session.execute(
                text(
                    "SELECT id, name FROM products WHERE shop_id = :sid "
                    "AND lower(name) LIKE lower(:n) LIMIT 1"
                ),
                {"sid": sid, "n": f"%{name}%"},
            )
        ).mappings().first()
    if not row:
        return hit
    return EntityHit(
        kind="product",
        token=":p1",
        id=str(row["id"]),
        display=str(row["name"] or name),
        score=1.0,
        extra=hit.extra,
    )


def _focus_sql(question: str, chosen: list[EntityHit]) -> str | None:
    if not refers_to_prior_product(question):
        return None
    if not any(e.kind == "product" and e.id for e in chosen):
        return None
    if _FOCUS_STOCK.search(question or "") and not _FOCUS_KAMAI.search(question or ""):
        return SQL_PRODUCT_FOCUS_STOCK
    if _FOCUS_KAMAI.search(question or ""):
        return SQL_PRODUCT_FOCUS_KAMAI
    return SQL_PRODUCT_FOCUS_KAMAI


class AnalystLLM(Protocol):
    async def plan(self, system: str, user: str) -> AnalystPlan: ...

    async def repair(self, system: str, user: str) -> AnalystPlan: ...

    async def template(self, system: str, user: str) -> AnalystTemplate: ...


@dataclass
class AnalystResult:
    text: str
    sql: str | None
    row_count: int
    route: str
    assumptions: str
    debug: dict[str, Any] = field(default_factory=dict)
    outbound: list[str] = field(default_factory=list)


class GeminiAnalystLLM:
    """Planner/template LLM pinned to app.config model + region (asia-south1)."""

    async def _structured(self, system: str, user: str, schema):
        from app.config import settings
        from app.gemini.client import generate_content
        from app.genai.llm import _schema_to_json_schema

        text = await generate_content(
            model=settings.GEMINI_MODEL,
            user_text=user,
            system_instruction=system,
            temperature=0.0,
            json_mode=True,
            response_schema=_schema_to_json_schema(schema),
        )
        cleaned = (text or "").replace("```json", "").replace("```", "").strip()
        if not cleaned:
            raise ValueError("empty Gemini response")
        return schema.model_validate(json.loads(cleaned))

    async def plan(self, system: str, user: str) -> AnalystPlan:
        return await self._structured(system, user, AnalystPlan)

    async def repair(self, system: str, user: str) -> AnalystPlan:
        return await self.plan(system, user)

    async def template(self, system: str, user: str) -> AnalystTemplate:
        return await self._structured(system, user, AnalystTemplate)


def bind_uuid(value, dialect: str = "sqlite") -> str:
    """Format a UUID for raw SQL binds. SQLite stores CHAR hex; Postgres wants dashed."""
    u = value if isinstance(value, UUID) else UUID(str(value))
    if dialect in ("sqlite",):
        return u.hex
    return str(u)


def _bind_entity_params(sql: str, entities: list[EntityHit], params: dict, dialect: str = "sqlite") -> dict:
    out = dict(params)
    for e in entities:
        token = e.token.lstrip(":")
        uid = bind_uuid(e.id, dialect)
        out[token] = uid
        if e.kind == "customer":
            out["c1"] = uid
            out["customer_id"] = uid
        if e.kind in ("product", "company"):
            out["p1"] = uid
            out["product_id"] = uid
    return out


def _used_params(sql: str, params: dict) -> dict:
    lower = (sql or "").lower()
    return {k: v for k, v in params.items() if f":{str(k).lower()}" in lower}


def _clarify_text(ambiguous: list[EntityHit]) -> str:
    lines = ["Kaunsa customer? Ek chuniye:"]
    for i, e in enumerate(ambiguous, 1):
        pending = e.extra.get("pending")
        extra = f" — udhari ₹{float(pending):.2f}" if pending is not None else ""
        lines.append(f"{i}. {e.display}{extra}")
    return "\n".join(lines)


REFUSE_FALLBACK = (
    "Yeh is dukaan ke ledger se nahi nikal sakta. "
    "Bill, kamai, stock, udhari poochho — profit/COGS is app mein nahi hai."
)


def _safe_reply(plan: AnalystPlan | None, chosen: list[EntityHit], fallback: str) -> str:
    if plan is None:
        return fallback
    raw = (plan.reply or plan.needs_clarification or "").strip()
    if not raw:
        return fallback
    try:
        assert_strict_payload(
            raw,
            [e.display for e in chosen],
            check_amounts=True,
        )
        return raw
    except PrivacyLeak:
        return fallback


def _history_note(mem, prior_questions: list[str], chosen: list[EntityHit]) -> str:
    bits = []
    if mem.window:
        bits.append(
            f"last_window={mem.window.start.isoformat()}..{mem.window.end.isoformat()}"
        )
    ents = chosen or mem.entities
    for e in ents:
        bits.append(f"{e.token}={e.kind}:{e.id}")
    if mem.focus_product and mem.focus_product.id:
        bits.append(
            f"focus_product=:p1:{mem.focus_product.id}"
        )
    raw = [q for q in (prior_questions or [])[-6:] if (q or "").strip()]
    if raw:
        tokenized_prior = [tokenize_question(q, ents) for q in raw]
    else:
        tokenized_prior = list(mem.last_user_questions[-6:])
    if tokenized_prior:
        bits.append("PRIOR_USER: " + " || ".join(tokenized_prior))
    return "; ".join(bits)


async def run_analyst(
    *,
    shop_id: UUID,
    question: str,
    llm: AnalystLLM,
    session: AsyncSession | None = None,
    dialect: str = "sqlite",
    prior_questions: list[str] | None = None,
) -> AnalystResult:
    t0 = time.perf_counter()
    outbound: list[str] = []
    repaired = False
    cache_hit = False
    sql: str | None = None
    route = "sql"
    assumptions = ""
    cols: list[str] = []
    rows: list[dict[str, Any]] = []
    prior = list(prior_questions or [])

    mem = get_memory(shop_id)
    if prior:
        for q in prior[-6:]:
            tok = tokenize_question(q, mem.entities)
            if tok and tok not in mem.last_user_questions:
                mem.last_user_questions.append(tok)
        mem.last_user_questions = mem.last_user_questions[-6:]

    local = classify_local(question, prior)
    if local in TALK_KINDS:
        text = talk_text(local)
        await write_trace(
            shop_id,
            question_tokenized=tokenize_question(question, []),
            route="talk",
            sql=None,
            row_count=0,
            latency_ms=int((time.perf_counter() - t0) * 1000),
            repaired=False,
            cache_hit=False,
        )
        put_memory(shop_id, None, mem.entities, "", tokenize_question(question, mem.entities))
        return AnalystResult(
            text=text,
            sql=None,
            row_count=0,
            route="talk",
            assumptions="",
            debug={"route": "talk", "rowCount": 0},
            outbound=[],
        )

    window = resolve_dates(question, memory_window=mem.window)
    today = shop_today().isoformat()
    raw_hits: list = []
    chosen: list = []
    ambiguous: list = []
    include_phone = False
    tokenized = tokenize_question(question, [])
    cached = None
    identity = None
    focus_sql = None

    async with brief_session(session) as db:
        if local not in CATALOG_KINDS:
            raw_hits = await resolve_entities(db, shop_id, question, dialect=dialect)
            chosen, ambiguous = pick_entities(raw_hits)
            if mem.entities and not chosen:
                chosen = list(mem.entities)
            chosen = merge_focus_product(chosen, mem.focus_product, question)
            fixed: list[EntityHit] = []
            for e in chosen:
                if e.kind == "product" and not e.id:
                    fixed.append(await _ensure_product_id(db, shop_id, e, dialect))
                else:
                    fixed.append(e)
            chosen = fixed
            include_phone = wants_phone(question)
            tokenized = tokenize_question(question, chosen)

        if (
            ambiguous
            and not is_shop_aggregate_question(question)
            and not refers_to_prior_product(question)
            and not re.search(r"\b[123]\b", question or "")
        ):
            text = _clarify_text(ambiguous)
            await write_trace(
                shop_id,
                question_tokenized=tokenized,
                route="clarify",
                sql=None,
                row_count=0,
                latency_ms=int((time.perf_counter() - t0) * 1000),
                repaired=False,
                cache_hit=False,
            )
            return AnalystResult(
                text=text,
                sql=None,
                row_count=0,
                route="clarify",
                assumptions="",
                debug={"route": "clarify", "rowCount": 0},
                outbound=[],
            )

        identity = identity_sql(local) if local else None
        focus_sql = None if identity else _focus_sql(question, chosen)
        if not identity and not focus_sql:
            cached = await lookup_sql(db, shop_id, tokenized)

    params: dict = {
        "start_date": window.start.isoformat(),
        "end_date": window.end.isoformat(),
        "shop_id": bind_uuid(shop_id, dialect),
    }
    params = _bind_entity_params("", chosen, params, dialect)

    user_msg = ""
    plan: AnalystPlan | None = None
    metric_used = ""
    skip_repair = bool(identity) or bool(focus_sql)
    if identity:
        sql = identity
        route = "sql"
        assumptions = ""
        cache_hit = False
    elif focus_sql:
        sql = focus_sql
        route = "sql"
        assumptions = "prior product focus"
        cache_hit = False
    else:
        user_msg = planner_user_message(
            tokenized,
            window,
            chosen,
            today,
            history_note=_history_note(mem, prior, chosen),
            dialect_note=dialect,
        )
        leaks = collect_leaks(user_msg, [e.display for e in chosen])
        if leaks:
            user_msg = tokenize_question(user_msg, chosen)
            logger.warning("planner payload scrubbed: %s", leaks)
        outbound.append(user_msg)

        plan = None

        if cached and cached.reuse:
            sql = cached.sql
            cache_hit = True
            route = "sql"
            assumptions = ""
        else:
            guide = ""
            if cached and not cached.reuse:
                guide = f"\nSIMILAR_SQL:\n{cached.sql}\n"
            try:
                plan = await llm.plan(PLANNER_SYSTEM, user_msg + guide)
            except Exception:
                logger.exception("planner failed")
                down_kind, down_sql = planner_down_local(question)
                if down_sql:
                    sql = down_sql
                    local = down_kind or local
                    skip_repair = True
                    route = "sql"
                    assumptions = "planner unavailable"
                    plan = None
                elif down_kind == "no_profit":
                    put_memory(shop_id, window, chosen, "", tokenized)
                    return AnalystResult(
                        text=TALK_NO_PROFIT,
                        sql=None,
                        row_count=0,
                        route="talk",
                        assumptions="planner unavailable",
                        debug={"route": "talk", "rowCount": 0},
                        outbound=outbound,
                    )
                else:
                    return AnalystResult(
                        text=PLANNER_DOWN,
                        sql=None,
                        row_count=0,
                        route="refuse",
                        assumptions="planner unavailable",
                        debug={"route": "refuse", "rowCount": 0},
                        outbound=outbound,
                    )

            if plan is not None:
                route = plan.route
                assumptions = plan.assumptions or ""
                include_phone = include_phone or plan.include_phone

                if plan.route == "talk":
                    put_memory(shop_id, window, chosen, "", tokenized)
                    return AnalystResult(
                        text=_safe_reply(plan, chosen, talk_text("who")),
                        sql=None,
                        row_count=0,
                        route="talk",
                        assumptions="",
                        debug={"route": "talk", "rowCount": 0},
                        outbound=outbound,
                    )

                if plan.route == "refuse":
                    text = _safe_reply(plan, chosen, REFUSE_FALLBACK)
                    return AnalystResult(
                        text=text, sql=None, row_count=0, route="refuse", assumptions=assumptions
                    )

                if plan.route == "clarify":
                    fallback = (
                        _clarify_text(chosen or raw_hits)
                        if (chosen or raw_hits)
                        else "Thoda aur clearly poochho — kaunsa customer, kaunsi date?"
                    )
                    text = _safe_reply(plan, chosen, fallback)
                    return AnalystResult(
                        text=text, sql=None, row_count=0, route="clarify", assumptions=assumptions
                    )

                if plan.route == "metric":
                    try:
                        metric_used = resolve_metric_name(plan.metric) or (plan.metric or "")
                        sql, mparams = compile_metric(plan.metric or "", window, chosen)
                        params.update(mparams)
                    except ValueError:
                        sql = plan.sql
                else:
                    sql = plan.sql

    if not sql:
        text = "Is sawal ke liye query nahi bana paya."
        return AnalystResult(text=text, sql=None, row_count=0, route=route, assumptions=assumptions)

    params = _bind_entity_params(sql, chosen, params, dialect)

    last_error = None
    source_sql = sql
    executed = False
    for attempt in range(3):
        try:
            guarded = guard_sql(sql, shop_id, dialect=dialect)
            used = _used_params(guarded, params)
            cols, rows = await execute_select(guarded, shop_id, used)
            source_sql = sql
            sql = guarded
            executed = True
            break
        except (GuardError, ExecError) as exc:
            last_error = str(exc)
            logger.warning("analyst sql failed attempt=%s: %s | sql=%s", attempt, last_error, sql)
            if skip_repair or identity or attempt >= 2:
                text = "Yeh data se nikal nahi paya."
                await write_trace(
                    shop_id,
                    question_tokenized=tokenized,
                    route=route,
                    sql=sql,
                    row_count=None,
                    latency_ms=int((time.perf_counter() - t0) * 1000),
                    repaired=repaired,
                    cache_hit=cache_hit,
                )
                return AnalystResult(
                    text=text,
                    sql=sql,
                    row_count=0,
                    route=route,
                    assumptions=assumptions,
                    debug={"route": route, "sql": sql, "error": last_error, "rowCount": 0},
                    outbound=outbound,
                )
            repaired = True
            repair_user = (
                user_msg
                + f"\nPREVIOUS_SQL:\n{sql}\nERROR:\n{last_error}\n"
                + "Fix the SQL. Same route. Empty results are valid — do not invent a different question."
            )
            outbound.append(repair_user)
            try:
                plan = await llm.repair(PLANNER_SYSTEM, repair_user)
                sql = plan.sql or sql
                if plan.route == "metric" and plan.metric:
                    sql, mparams = compile_metric(plan.metric, window, chosen)
                    params.update(mparams)
                    metric_used = resolve_metric_name(plan.metric) or plan.metric
            except Exception as exc:
                logger.warning("planner repair failed (%s); keeping previous SQL", type(exc).__name__)

    if not executed:
        text = "Yeh data se nikal nahi paya."
        return AnalystResult(
            text=text,
            sql=sql,
            row_count=0,
            route=route,
            assumptions=assumptions,
            debug={"route": route, "sql": sql, "error": last_error, "rowCount": 0},
            outbound=outbound,
        )

    cols, rows = strip_phone_columns(cols, rows, include_phone)
    cols, rows = drop_blank_columns(cols, rows)
    focus = focus_from_result_rows(cols, rows, question=question, chosen=chosen)
    if focus and not focus.id:
        async with brief_session(session) as db:
            focus = await _ensure_product_id(db, shop_id, focus, dialect)
    cols, rows = public_result_set(cols, rows)

    footnote = ""
    if not rows and (local == "product_alert" or metric_used == "low_stock"):
        try:
            guarded_min = guard_sql(SQL_PRODUCT_LEAST, shop_id, dialect=dialect)
            min_cols, min_rows = await execute_select(guarded_min, shop_id, {})
            min_cols, min_rows = strip_phone_columns(min_cols, min_rows, False)
            min_cols, min_rows = drop_blank_columns(min_cols, min_rows)
            if min_rows:
                first = min_rows[0]
                name = first.get("name")
                if name is None:
                    name = first.get("NAME")
                qty = first.get("stock_qty")
                if qty is None:
                    qty = first.get("STOCK_QTY")
                if name is not None and qty is not None:
                    qtxt = f"{qty:.2f}" if isinstance(qty, float) else str(qty)
                    footnote = f"Sabse kam quantity {name} ({qtxt}) — lekin alert se upar."
        except (GuardError, ExecError):
            pass

    empty_message = interpret_empty(
        kind=local,
        metric=metric_used,
        sql=source_sql or sql or "",
        had_customer=any(e.kind == "customer" for e in chosen),
    )

    # Empty result is a real answer — do not repair; interpret with shop rules.
    # Rows never leave the server: Gemini only sees column shape + placeholders.
    tpl: AnalystTemplate | None = None
    skip_template = (not rows) or (not should_show_table(cols, rows, question=question))
    if skip_template:
        tpl = None
    else:
        shape_user = template_user_message(cols, len(rows), route, assumptions, metric=metric_used)
        outbound.append(shape_user)
        try:
            tpl = await llm.template(TEMPLATE_SYSTEM, shape_user)
            if tpl and tpl.template:
                assert_strict_payload(
                    tpl.template,
                    [e.display for e in chosen],
                    check_amounts=True,
                )
        except PrivacyLeak:
            tpl = AnalystTemplate(template="", table_columns=cols, assumptions=assumptions)
        except Exception:
            logger.exception("template failed")
            tpl = None

    text = render_answer(
        tpl,
        cols,
        rows,
        assumptions,
        empty_message=empty_message,
        question=question,
    )
    if footnote and not rows:
        text = f"{text}\n{footnote}"
    put_memory(
        shop_id,
        window,
        chosen,
        sql or "",
        tokenized,
        focus_product=focus if (focus and focus.id) else None,
    )
    try:
        await store_sql(None, shop_id, tokenized, source_sql)
    except Exception as exc:
        logger.warning("store_sql failed (%s)", type(exc).__name__)

    await write_trace(
        shop_id,
        question_tokenized=tokenized,
        route=route,
        sql=sql,
        row_count=len(rows),
        latency_ms=int((time.perf_counter() - t0) * 1000),
        repaired=repaired,
        cache_hit=cache_hit,
    )
    return AnalystResult(
        text=text,
        sql=sql,
        row_count=len(rows),
        route=route,
        assumptions=assumptions,
        debug={"route": route, "sql": sql, "rowCount": len(rows), "cacheHit": cache_hit},
        outbound=outbound,
    )


async def stream_analyst_answer(
    *,
    shop_id: UUID,
    question: str,
    llm: AnalystLLM,
    session: AsyncSession | None = None,
    dialect: str = "sqlite",
    prior_questions: list[str] | None = None,
) -> AsyncIterator[dict[str, Any]]:
    result = await run_analyst(
        shop_id=shop_id,
        question=question,
        session=session,
        llm=llm,
        dialect=dialect,
        prior_questions=prior_questions,
    )
    text = result.text or ""
    step = 80
    if not text:
        yield {"text": "Kuch jawab nahi bana."}
        return
    for i in range(0, len(text), step):
        yield {"text": text[i : i + step]}
