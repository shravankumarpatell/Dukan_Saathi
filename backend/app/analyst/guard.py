"""sqlglot allowlist, tenant wrap, LIMIT cap."""

from __future__ import annotations

import re
from uuid import UUID

import sqlglot
from sqlglot import exp

from app.config import settings

ALLOWED_RELATIONS = frozenset(
    {
        "shops",
        "products",
        "customers",
        "invoices",
        "invoice_items",
        "payments",
        "return_allocations",
        "stock_ledger",
        "expenses",
        "v_returns",
        "v_invoice_lines",
        "v_daily",
        "v_sales",
        "v_purchases",
        "v_return_events",
        "v_returns_day",
        "v_customer_balance",
        "v_product_sales",
        "analyst_sql_cache",
        "analyst_traces",
    }
)

SHOP_ID_COLUMN = {
    "shops": "id",
}

_FORBIDDEN_FUNCS = frozenset(
    {
        "pg_read_file",
        "pg_ls_dir",
        "pg_read_binary_file",
        "lo_import",
        "lo_export",
        "dblink",
        "dblink_exec",
        "pg_sleep",
        "set_config",
        "current_setting",
    }
)

_MULTI_STMT = re.compile(r";\s*\S")
# sqlglot postgres dialect emits %(name)s; SQLAlchemy text() then doubles % → %%(name)s.
_PYFORMAT_BIND = re.compile(r"%\(([A-Za-z_][A-Za-z0-9_]*)\)s")


def _normalize_binds(sql: str) -> str:
    """Keep :name binds so SQLAlchemy + psycopg agree."""
    return _PYFORMAT_BIND.sub(r":\1", sql or "")


class GuardError(ValueError):
    pass


def _dialect(name: str | None) -> str:
    if name == "sqlite":
        return "sqlite"
    return "postgres"


def _is_tautology(node: exp.Expression | None) -> bool:
    if node is None:
        return False
    if isinstance(node, exp.Boolean) and node.this is True:
        return True
    if isinstance(node, exp.EQ):
        left, right = node.left, node.right
        if isinstance(left, exp.Literal) and isinstance(right, exp.Literal):
            return left.this == right.this
        if isinstance(left, exp.Column) and isinstance(right, exp.Column):
            return left.sql().lower() == right.sql().lower()
    return False


def _relation_name(table: exp.Table) -> str:
    return (table.name or "").lower()


def _cte_aliases(parsed: exp.Expression) -> set[str]:
    names: set[str] = set()
    for cte in parsed.find_all(exp.CTE):
        alias = cte.alias
        if alias:
            names.add(str(alias).lower())
    return names


def _shop_predicate(col: str, shop_id: UUID, dialect: str) -> exp.Expression:
    dashed = str(shop_id)
    hexed = dashed.replace("-", "")
    if dialect == "sqlite":
        return exp.or_(
            exp.EQ(this=exp.column(col), expression=exp.Literal.string(dashed)),
            exp.EQ(this=exp.column(col), expression=exp.Literal.string(hexed)),
        )
    return exp.EQ(this=exp.column(col), expression=exp.Literal.string(dashed))


def _wrap_table(table: exp.Table, shop_id: UUID, dialect: str) -> exp.Subquery:
    name = _relation_name(table)
    col = SHOP_ID_COLUMN.get(name, "shop_id")
    alias = table.alias or name or "t"
    inner = exp.select(exp.Star()).from_(name).where(
        _shop_predicate(col, shop_id, dialect)
    )
    return inner.subquery(alias=alias)


def _inject_tenant(parsed: exp.Expression, shop_id: UUID, dialect: str, cte_aliases: set[str]) -> None:
    for table in list(parsed.find_all(exp.Table)):
        name = _relation_name(table)
        if not name or name in cte_aliases or name not in ALLOWED_RELATIONS:
            continue
        table.replace(_wrap_table(table, shop_id, dialect))


def _cap_limit(select: exp.Select, limit_n: int) -> None:
    existing = select.args.get("limit")
    n = None
    if existing is not None:
        try:
            n = int(existing.expression.this)
        except (TypeError, ValueError, AttributeError):
            n = None
    if n is None or n > limit_n:
        select.set("limit", exp.Limit(expression=exp.Literal.number(limit_n)))


def _apply_limit(parsed: exp.Expression, limit_n: int) -> exp.Expression:
    if isinstance(parsed, exp.Select):
        _cap_limit(parsed, limit_n)
        return parsed
    if isinstance(parsed, exp.With):
        inner = parsed.this
        if isinstance(inner, exp.Select):
            _cap_limit(inner, limit_n)
            return parsed
        wrapped = exp.select(exp.Star()).from_(inner.subquery(alias="_u"))
        wrapped.set("limit", exp.Limit(expression=exp.Literal.number(limit_n)))
        parsed.set("this", wrapped)
        return parsed
    wrapped = exp.select(exp.Star()).from_(parsed.subquery(alias="_u"))
    wrapped.set("limit", exp.Limit(expression=exp.Literal.number(limit_n)))
    return wrapped


def guard_sql(sql: str, shop_id: UUID, dialect: str | None = None) -> str:
    """Parse, allowlist, wrap every shop table, inject LIMIT. Returns SQL string."""
    raw = (sql or "").strip().rstrip(";")
    if not raw:
        raise GuardError("empty SQL")
    if _MULTI_STMT.search(raw):
        raise GuardError("multiple statements are not allowed")

    lowered = raw.lower()
    for bad in (
        "insert ",
        "update ",
        "delete ",
        "drop ",
        "alter ",
        "create ",
        "truncate ",
        "copy ",
        "grant ",
        "revoke ",
        "vacuum ",
        "into outfile",
        "load_file",
        "for update",
        "for share",
    ):
        if bad in lowered:
            raise GuardError(f"forbidden keyword: {bad.strip()}")

    dia = _dialect(dialect)
    try:
        parsed = sqlglot.parse_one(raw, read=dia)
    except sqlglot.errors.ParseError as exc:
        raise GuardError(f"SQL parse error: {exc}") from exc

    if parsed is None:
        raise GuardError("SQL parse error")
    if not isinstance(parsed, (exp.Select, exp.Union, exp.With)):
        raise GuardError("only SELECT / CTE queries are allowed")

    for node in parsed.find_all(
        exp.Delete, exp.Insert, exp.Update, exp.Drop, exp.Create, exp.Command
    ):
        raise GuardError(f"forbidden node: {node.key}")

    for func in parsed.find_all(exp.Anonymous, exp.Func):
        name = (getattr(func, "name", None) or "").lower()
        if name in _FORBIDDEN_FUNCS:
            raise GuardError(f"forbidden function: {name}")

    cte_aliases = _cte_aliases(parsed)
    for table in parsed.find_all(exp.Table):
        name = _relation_name(table)
        if name and name not in ALLOWED_RELATIONS and name not in cte_aliases:
            raise GuardError(f"relation not allowed: {name}")

    where = parsed.find(exp.Where)
    if where is not None and _is_tautology(where.this):
        raise GuardError("always-true WHERE is not allowed")

    _inject_tenant(parsed, shop_id, dia, cte_aliases)
    limited = _apply_limit(parsed, settings.ANALYST_ROW_LIMIT)
    return _normalize_binds(limited.sql(dialect=dia))
