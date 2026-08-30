"""Template fill — result rows stay on the server; Gemini only shapes placeholders."""

from __future__ import annotations

import re
from typing import Any

from app.analyst.sqlgen import AnalystTemplate

_PLACEHOLDER = re.compile(r"\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}")
_DIGIT = re.compile(r"\d")
PHONE_COLS = frozenset({"phone", "customer_phone", "mobile"})

_NAME_HINTS = ("name", "product", "customer", "invoice", "company", "code")
_QTY_HINTS = (
    "qty",
    "sold",
    "kamai",
    "udhari",
    "stock",
    "total",
    "amount",
    "grand",
    "pending",
    "bills",
    "karcha",
    "bachat",
)


def strip_phone_columns(
    columns: list[str],
    rows: list[dict[str, Any]],
    include_phone: bool,
) -> tuple[list[str], list[dict[str, Any]]]:
    if include_phone:
        return columns, rows
    drop = {c for c in columns if c.lower() in PHONE_COLS or c.lower().endswith("_phone")}
    cols = [c for c in columns if c not in drop]
    cleaned = [{k: v for k, v in row.items() if k not in drop} for row in rows]
    return cols, cleaned


def drop_blank_columns(
    columns: list[str],
    rows: list[dict[str, Any]],
) -> tuple[list[str], list[dict[str, Any]]]:
    if not rows:
        return columns, rows
    keep = [
        c
        for c in columns
        if any(str(row.get(c) if row.get(c) is not None else "").strip() for row in rows)
    ]
    if not keep:
        return columns, rows
    cleaned = [{k: row.get(k) for k in keep} for row in rows]
    return keep, cleaned


def markdown_table(columns: list[str], rows: list[dict[str, Any]], limit: int = 80) -> str:
    if not columns:
        return ""
    shown = rows[:limit]
    header = "| " + " | ".join(columns) + " |"
    sep = "| " + " | ".join("---" for _ in columns) + " |"
    lines = [header, sep]
    for row in shown:
        cells = []
        for c in columns:
            v = row.get(c)
            if v is None:
                cells.append("")
            elif isinstance(v, float):
                cells.append(f"{v:.2f}" if abs(v) >= 0.005 else "0.00")
            else:
                cells.append(str(v).replace("|", "/"))
        lines.append("| " + " | ".join(cells) + " |")
    extra = len(rows) - len(shown)
    if extra > 0:
        lines.append(f"\n_poore {len(rows)} rows mein se pehle {len(shown)}._")
    return "\n".join(lines)


def _fmt(value: Any) -> str:
    if value is None:
        return "—"
    if isinstance(value, float):
        return f"{value:.2f}"
    return str(value)


def _moneyish(col: str) -> bool:
    c = (col or "").lower()
    return any(
        x in c
        for x in (
            "kamai",
            "karcha",
            "bachat",
            "udhari",
            "amount",
            "total",
            "grand",
            "pending",
            "cash",
            "online",
        )
    )


def fill_template(template: str, columns: list[str], rows: list[dict[str, Any]]) -> str:
    values: dict[str, Any] = {"row_count": len(rows)}
    if rows:
        first = rows[0]
        values.update(first)
        if len(rows) > 1:
            for c in columns:
                nums = [r.get(c) for r in rows if isinstance(r.get(c), (int, float))]
                if nums and c not in first:
                    values[c] = sum(float(n) for n in nums)

    def repl(match: re.Match) -> str:
        key = match.group(1)
        if key in values:
            return _fmt(values[key])
        for k, v in values.items():
            if k.lower() == key.lower():
                return _fmt(v)
        return match.group(0)

    text = _PLACEHOLDER.sub(repl, template or "")
    return text.strip()


def template_has_raw_digits(template: str) -> bool:
    stripped = _PLACEHOLDER.sub("", template or "")
    return bool(_DIGIT.search(stripped))


def _pick_col(columns: list[str], hints: tuple[str, ...]) -> str | None:
    for c in columns:
        low = c.lower()
        if any(h in low for h in hints):
            return c
    return None


def _single_row_sentence(columns: list[str], row: dict[str, Any]) -> str:
    useful = columns[:4]
    if len(useful) == 1:
        c = useful[0]
        v = row.get(c)
        low = c.lower()
        if "kamai" in low:
            return f"Kamai ₹{_fmt(v)}"
        if "karcha" in low:
            return f"Karcha ₹{_fmt(v)}"
        if "bachat" in low:
            return f"Bachat ₹{_fmt(v)}"
        if "udhari" in low:
            return f"Udhari ₹{_fmt(v)}"
        if "stock" in low:
            return f"Stock {_fmt(v)}"
        if _moneyish(c):
            return f"₹{_fmt(v)}"
        return _fmt(v)
    if len(useful) == 2:
        a, b = useful[0], useful[1]
        va, vb = row.get(a), row.get(b)
        if _moneyish(b) and not _moneyish(a):
            return f"{_fmt(va)} — ₹{_fmt(vb)}"
        if _moneyish(a) and not _moneyish(b):
            return f"{_fmt(vb)} — ₹{_fmt(va)}"
        return f"{_fmt(va)} — {_fmt(vb)}"
    return " — ".join(_fmt(row.get(c)) for c in useful[:3])


def _multi_row_lead(
    columns: list[str],
    first: dict[str, Any],
    n: int,
    *,
    singular: bool = False,
) -> str:
    """First row is the ranked answer (SQL already ORDER BY … DESC/ASC)."""
    name_c = _pick_col(columns, _NAME_HINTS)
    qty_c = _pick_col(columns, _QTY_HINTS)
    if name_c and qty_c and name_c != qty_c:
        name, qty = first.get(name_c), first.get(qty_c)
        money = _moneyish(qty_c)
        if singular:
            if money:
                return f"Sabse zyada: {_fmt(name)} — ₹{_fmt(qty)}."
            return f"Sabse zyada: {_fmt(name)} — {_fmt(qty)}."
        if money:
            return f"Sabse upar {_fmt(name)} — ₹{_fmt(qty)} (top of {n})."
        return f"Sabse upar {_fmt(name)} — {_fmt(qty)} (top of {n})."
    if name_c:
        if singular:
            return f"Sabse zyada: {_fmt(first.get(name_c))}."
        return f"Sabse upar {_fmt(first.get(name_c))} (top of {n})."
    useful = columns[:2]
    bits = " — ".join(_fmt(first.get(c)) for c in useful)
    if singular:
        return f"Sabse zyada: {bits}."
    return f"Sabse upar {bits} (top of {n})."


def local_fallback_sentence(
    columns: list[str],
    rows: list[dict[str, Any]],
    assumptions: str = "",
    question: str = "",
) -> str:
    useful = _display_columns(columns)
    if not rows:
        return EMPTY_GENERIC
    if len(rows) == 1:
        return _single_row_sentence(useful, rows[0])
    singular = bool(_SINGULAR_RANK.search(question or ""))
    return _multi_row_lead(useful, rows[0], len(rows), singular=singular)


EMPTY_ALERT = (
    "Sabhi products low-stock alert se upar hain. "
    "Alert tab lagta hai jab stock product ke threshold se neeche ho."
)
EMPTY_WINDOW = "Is dates mein koi bill/kamai nahi mili."
EMPTY_CUSTOMER = "Is naam se koi match nahi. Naam / phone dobara try karo."
EMPTY_GENERIC = "Is sawal ke hisaab se koi row nahi. Thoda aur clearly poochho?"


def interpret_empty(
    *,
    kind: str | None = None,
    metric: str | None = None,
    sql: str = "",
    had_customer: bool = False,
) -> str:
    metric_key = (metric or "").lower()
    sql_l = (sql or "").lower()
    kind_key = kind or ""
    if (
        kind_key == "product_alert"
        or metric_key == "low_stock"
        or ("low_stock_threshold" in sql_l and "<=" in sql_l)
    ):
        return EMPTY_ALERT
    if had_customer or ":c1" in sql_l:
        return EMPTY_CUSTOMER
    if metric_key in {
        "kamai",
        "karcha",
        "bachat",
        "bills",
        "cash_collected",
        "daily",
        "udhari_collected",
    } or "v_daily" in sql_l or "from v_sales" in sql_l:
        return EMPTY_WINDOW
    return EMPTY_GENERIC


def _display_columns(columns: list[str]) -> list[str]:
    """Shopkeeper-facing columns only — never internal ids / UUIDs."""
    out = []
    for c in columns or []:
        low = (c or "").lower()
        if low in {"shop_id", "id", "invoice_id", "customer_id", "product_id", "return_id"}:
            continue
        if low.endswith("_id") or low.endswith("_uuid"):
            continue
        out.append(c)
    return out or []


def _public_rows(columns: list[str], rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    cols = _display_columns(columns)
    if not cols:
        return []
    return [{c: row.get(c) for c in cols} for row in rows]


def public_result_set(
    columns: list[str],
    rows: list[dict[str, Any]],
) -> tuple[list[str], list[dict[str, Any]]]:
    """Drop internal ids before any shopkeeper-facing answer is built."""
    cols = _display_columns(columns)
    return cols, _public_rows(columns, rows)


_SINGULAR_RANK = re.compile(
    r"\b("
    r"konsa|kaunsa|konsi|kaunsi|which|"
    r"sabse\s+(jada|zyada|zyaada|kam)|"
    r"top\s+(product|seller|item)|"
    r"most\s+sold|highest"
    r")\b",
    re.IGNORECASE,
)


def should_show_table(
    columns: list[str],
    rows: list[dict[str, Any]],
    question: str = "",
) -> bool:
    # "konsa / sabse jada" → one clear sentence, not a full ledger dump
    if _SINGULAR_RANK.search(question or "") and len(rows) >= 1:
        return False
    if len(rows) > 1:
        return True
    if len(rows) == 1 and len(_display_columns(columns)) > 2:
        return True
    return False


def render_answer(
    template: AnalystTemplate | None,
    columns: list[str],
    rows: list[dict[str, Any]],
    assumptions: str = "",
    empty_message: str | None = None,
    question: str = "",
) -> str:
    useful = _display_columns(columns)
    public = _public_rows(columns, rows)
    if not rows:
        return empty_message or EMPTY_GENERIC
    if not useful and not public:
        # Only ids came back — still try a bare fallback from raw first row values that aren't ids
        return empty_message or EMPTY_GENERIC
    sentence = ""
    use_template = (
        template
        and template.template
        and not template_has_raw_digits(template.template)
        and not (len(rows) <= 1 and len(useful) <= 2)
    )
    if use_template:
        sentence = fill_template(template.template, useful or columns, public or rows)
    if not sentence:
        sentence = local_fallback_sentence(
            useful or columns, public or rows, "", question=question
        )
    chunks = [sentence] if sentence else []
    if should_show_table(useful or columns, public or rows, question=question):
        # Cap list answers — never dump the whole warehouse; never include ids
        table = markdown_table(useful, public[:10])
        if table:
            chunks.append(table)
    return "\n\n".join(c for c in chunks if c)
