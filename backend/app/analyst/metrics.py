"""Compile certified metric queries — no LLM SQL."""

from __future__ import annotations

from app.analyst.catalog import METRIC_SQL, resolve_metric_name
from app.analyst.resolvers import DateWindow, EntityHit


def compile_metric(
    metric: str,
    window: DateWindow,
    entities: list[EntityHit],
) -> tuple[str, dict]:
    key = resolve_metric_name(metric)
    if not key or key not in METRIC_SQL:
        raise ValueError(f"unknown metric: {metric}")
    sql = METRIC_SQL[key].strip()
    params: dict = {
        "start_date": window.start.isoformat(),
        "end_date": window.end.isoformat(),
    }
    cust = next((e for e in entities if e.kind == "customer"), None)
    prod = next((e for e in entities if e.kind in ("product", "company")), None)

    if cust and key in ("udhari", "bills"):
        clause = "customer_id = :customer_id"
        params["customer_id"] = cust.id
        if "WHERE" in sql.upper():
            sql = _append_and(sql, clause)
        else:
            sql = _insert_where(sql, clause)

    if prod and key == "top_products":
        params["product_id"] = prod.id
        sql = _insert_where(sql, "product_id = :product_id")
    return sql, params


def _append_and(sql: str, clause: str) -> str:
    upper = sql.upper()
    if "ORDER BY" in upper:
        head, tail = sql.rsplit("ORDER BY", 1)
        return f"{head} AND {clause} ORDER BY{tail}"
    return f"{sql} AND {clause}"


def _insert_where(sql: str, clause: str) -> str:
    upper = sql.upper()
    if "WHERE" in upper:
        return _append_and(sql, clause)
    if "ORDER BY" in upper:
        head, tail = sql.rsplit("ORDER BY", 1)
        return f"{head} WHERE {clause} ORDER BY{tail}"
    if "GROUP BY" in upper:
        return f"{sql} HAVING {clause}"
    return f"{sql} WHERE {clause}"
