"""Hinglish date windows and fuzzy entity resolution with name tokenization."""

from __future__ import annotations

import calendar
import re
from dataclasses import dataclass, field
from datetime import date, timedelta
from difflib import SequenceMatcher
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

IST = ZoneInfo("Asia/Kolkata")
ENTITY_THRESHOLD = 0.45
AMBIGUOUS_GAP = 0.08

# Tokens that must never fuzzy-match customer/product names.
_ENTITY_STOPWORDS = frozenset(
    {
        "aaj", "aj", "kal", "parson", "today", "yesterday",
        "kitna", "kitni", "kitne", "kya", "hai", "he", "ho", "hua", "hui", "hue",
        "sale", "sales", "kamai", "kamaya", "karcha", "bachat", "udhari", "vusool",
        "bill", "bills", "invoice", "stock", "product", "products", "item", "items",
        "last", "this", "that", "week", "month", "year", "hafte", "mahine", "saal",
        "pichle", "pichhla", "is", "the", "and", "for", "total", "net", "gross",
        "dikhao", "batao", "bata", "dikha", "do", "me", "mein", "se", "ka", "ki", "ke",
        "wala", "wali", "wale", "sabse", "zyada", "kam", "low", "high",
    }
)

# Shop-wide totals — do not ask "kaunsa customer?"
_SHOP_AGGREGATE = re.compile(
    r"\b("
    r"kamai|kamaya|karcha|bachat|vusool|daybook|"
    r"sale|sales|revenue|turnover|"
    r"kitni\s+sale|kitna\s+(sale|kamaya|kamai)|"
    r"total\s+(sale|sales|kamai)|"
    r"aaj\s+ki\s+(sale|kamai|karcha)|"
    r"kal\s+ki\s+(sale|kamai)|"
    r"pichle\s+(mahine|hafte|saal)\s+ki\s+(sale|kamai|karcha|bachat)"
    r")\b",
    re.IGNORECASE,
)

_MONTHS = {
    "january": 1, "jan": 1, "जनवरी": 1,
    "february": 2, "feb": 2, "फरवरी": 2,
    "march": 3, "mar": 3, "मार्च": 3,
    "april": 4, "apr": 4, "अप्रैल": 4,
    "may": 5, "मई": 5,
    "june": 6, "jun": 6, "जून": 6,
    "july": 7, "jul": 7, "जुलाई": 7,
    "august": 8, "aug": 8, "अगस्त": 8,
    "september": 9, "sep": 9, "sept": 9, "सितंबर": 9, "सितम्बर": 9,
    "october": 10, "oct": 10, "अक्टूबर": 10,
    "november": 11, "nov": 11, "नवंबर": 11, "नवम्बर": 11,
    "december": 12, "dec": 12, "दिसंबर": 12, "दिसम्बर": 12,
}


@dataclass
class DateWindow:
    start: date
    end: date
    label: str
    assumed: bool = False


@dataclass
class EntityHit:
    kind: str  # customer | product | company
    token: str
    id: str
    display: str
    score: float
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class ResolveResult:
    window: DateWindow
    entities: list[EntityHit]
    tokenized_question: str
    original_question: str
    ambiguous: list[EntityHit] = field(default_factory=list)
    include_phone: bool = False


def shop_today(now: date | None = None) -> date:
    if now is not None:
        return now
    from datetime import datetime

    return datetime.now(IST).date()


def _month_end(year: int, month: int) -> date:
    return date(year, month, calendar.monthrange(year, month)[1])


def resolve_dates(question: str, today: date | None = None, memory_window: DateWindow | None = None) -> DateWindow:
    today = shop_today(today)
    q = (question or "").lower()

    if re.search(r"\b(uska|uske|woh|wo|aur pichla|pehle wale)\b", q) and memory_window:
        if "mahine" in q or "month" in q:
            start = (memory_window.start.replace(day=1) - timedelta(days=1)).replace(day=1)
            return DateWindow(start, _month_end(start.year, start.month), "previous month vs last turn", True)
        if "hafte" in q or "week" in q:
            start = memory_window.start - timedelta(days=7)
            end = memory_window.end - timedelta(days=7)
            return DateWindow(start, end, "previous week vs last turn", True)

    if re.search(r"\b(aaj|today|aj)\b", q):
        return DateWindow(today, today, "aaj")
    if re.search(r"\b(kal|yesterday)\b", q) and "parson" not in q:
        d = today - timedelta(days=1)
        return DateWindow(d, d, "kal")
    if re.search(r"\b(parson)\b", q):
        d = today - timedelta(days=2)
        return DateWindow(d, d, "parson")
    if re.search(r"\b(is hafte|this week)\b", q):
        start = today - timedelta(days=today.weekday())
        return DateWindow(start, today, "is hafte")
    if re.search(r"\b(pichle hafte|last week|pichhla hafta)\b", q):
        end = today - timedelta(days=today.weekday() + 1)
        start = end - timedelta(days=6)
        return DateWindow(start, end, "pichle hafte")
    if re.search(r"\b(is mahine|this month|is month)\b", q):
        start = today.replace(day=1)
        return DateWindow(start, today, "is mahine")
    if re.search(r"\b(pichle mahine|last month|pichhla mahina)\b", q):
        first = today.replace(day=1)
        end = first - timedelta(days=1)
        start = end.replace(day=1)
        return DateWindow(start, end, "pichle mahine")
    if re.search(r"\b(is saal|this year)\b", q):
        return DateWindow(date(today.year, 1, 1), today, "is saal")
    if re.search(r"\b(pichle saal|last year)\b", q):
        y = today.year - 1
        return DateWindow(date(y, 1, 1), date(y, 12, 31), "pichle saal")

    m = re.search(r"\b(\d{1,2})\s*(tarikh|th|st|nd|rd)?\b", q)
    month_hit = None
    for name, num in _MONTHS.items():
        if re.search(rf"\b{re.escape(name)}\b", q):
            month_hit = num
            break
    if m and month_hit:
        day_n = int(m.group(1))
        year = today.year
        ym = re.search(r"\b(20\d{2})\b", q)
        if ym:
            year = int(ym.group(1))
        try:
            d = date(year, month_hit, day_n)
            return DateWindow(d, d, d.isoformat())
        except ValueError:
            pass
    if month_hit:
        year = today.year
        ym = re.search(r"\b(20\d{2})\b", q)
        if ym:
            year = int(ym.group(1))
        start = date(year, month_hit, 1)
        end = _month_end(year, month_hit)
        if year == today.year and month_hit == today.month:
            end = today
        return DateWindow(start, end, start.strftime("%B %Y"))

    if re.search(r"\b(diwali|deepavali)\b", q):
        # Stated window, not a silent guess — late Oct through mid Nov.
        start = date(today.year, 10, 20)
        end = date(today.year, 11, 15)
        if end > today:
            end = today
        if "pichle saal" in q or "last year" in q:
            start = date(today.year - 1, 10, 20)
            end = date(today.year - 1, 11, 15)
        return DateWindow(start, end, "Diwali ke aas-paas (20 Oct–15 Nov)", True)

    iso = re.search(r"\b(20\d{2}-\d{2}-\d{2})\b", q)
    if iso:
        d = date.fromisoformat(iso.group(1))
        return DateWindow(d, d, d.isoformat())

    # Unspecified range = full history through today (plan).
    return DateWindow(date(2000, 1, 1), today, "signup se aaj tak", True)


def wants_phone(question: str) -> bool:
    q = (question or "").lower()
    return bool(re.search(r"\b(phone|mobile|number|nambar|nomer|call)\b", q))


def is_shop_aggregate_question(question: str) -> bool:
    """True for dukaan-wide kamai/sale totals — no customer pick needed."""
    return bool(_SHOP_AGGREGATE.search(question or ""))


def _question_name_tokens(question: str) -> list[str]:
    toks = re.findall(r"[A-Za-z\u0900-\u097F]{3,}", question or "")
    return [t for t in toks if t.lower() not in _ENTITY_STOPWORDS]


def _score(a: str, b: str) -> float:
    a = (a or "").lower().strip()
    b = (b or "").lower().strip()
    if not a or not b:
        return 0.0
    if a in b or b in a:
        return 0.9
    return SequenceMatcher(None, a, b).ratio()


async def resolve_entities(
    session: AsyncSession,
    shop_id: UUID,
    question: str,
    dialect: str = "sqlite",
) -> list[EntityHit]:
    q = (question or "").strip()
    if len(q) < 2:
        return []

    hits: list[EntityHit] = []
    sid = shop_id.hex if dialect == "sqlite" else shop_id
    use_trgm = dialect == "postgresql"

    if use_trgm:
        cust_sql = text(
            """
            SELECT id, name, phone, total_pending,
                   similarity(lower(name), lower(:q)) AS score
            FROM customers
            WHERE shop_id = :sid AND similarity(lower(name), lower(:q)) > 0.2
            ORDER BY score DESC
            LIMIT 8
            """
        )
        prod_sql = text(
            """
            SELECT id, name, company, code, size,
                   GREATEST(
                     similarity(lower(name), lower(:q)),
                     similarity(lower(company), lower(:q))
                   ) AS score
            FROM products
            WHERE shop_id = :sid
              AND (
                similarity(lower(name), lower(:q)) > 0.2
                OR similarity(lower(company), lower(:q)) > 0.2
              )
            ORDER BY score DESC
            LIMIT 8
            """
        )
        params = {"sid": sid, "q": q}
    else:
        cust_sql = text(
            """
            SELECT id, name, phone, total_pending
            FROM customers WHERE shop_id = :sid
            """
        )
        prod_sql = text(
            """
            SELECT id, name, company, code, size
            FROM products WHERE shop_id = :sid
            """
        )
        params = {"sid": sid}

    cust_rows = (await session.execute(cust_sql, params)).mappings().all()
    prod_rows = (await session.execute(prod_sql, params)).mappings().all()

    c_i = 1
    name_tokens = _question_name_tokens(q)
    for row in cust_rows:
        name = str(row["name"] or "")
        score = 0.0
        if "score" in row and row["score"] is not None and name_tokens:
            # pg_trgm on the full sentence is noisy; only keep if a name-like token exists.
            score = float(row["score"])
        for tok in name_tokens:
            score = max(score, _score(tok, name))
        if score < ENTITY_THRESHOLD:
            continue
        hits.append(
            EntityHit(
                kind="customer",
                token=f":c{c_i}",
                id=str(row["id"]),
                display=name,
                score=score,
                extra={"pending": float(row.get("total_pending") or 0)},
            )
        )
        c_i += 1

    p_i = 1
    for row in prod_rows:
        name = str(row["name"] or "")
        company = str(row.get("company") or "")
        score = 0.0
        if "score" in row and row["score"] is not None and name_tokens:
            score = float(row["score"])
        for tok in name_tokens:
            score = max(score, _score(tok, name), _score(tok, company))
        if score < ENTITY_THRESHOLD:
            continue
        kind = "company" if company and _score(" ".join(name_tokens), company) > _score(" ".join(name_tokens), name) else "product"
        if not name_tokens:
            kind = "product"
        hits.append(
            EntityHit(
                kind=kind,
                token=f":p{p_i}",
                id=str(row["id"]),
                display=name if kind == "product" else company,
                score=score,
                extra={"company": company, "size": row.get("size") or ""},
            )
        )
        p_i += 1

    hits.sort(key=lambda h: h.score, reverse=True)
    return hits[:8]


def tokenize_question(question: str, entities: list[EntityHit]) -> str:
    text = question
    # Longest display first so "Sharma Traders" beats "Sharma".
    for ent in sorted(entities, key=lambda e: len(e.display), reverse=True):
        if not ent.display:
            continue
        replacement = f"{ent.kind} {ent.token}"
        text = re.sub(re.escape(ent.display), replacement, text, flags=re.IGNORECASE)
        for part in ent.display.split():
            if len(part) >= 3:
                text = re.sub(
                    rf"\b{re.escape(part)}\b", replacement, text, flags=re.IGNORECASE
                )
    return text


def pick_entities(hits: list[EntityHit]) -> tuple[list[EntityHit], list[EntityHit]]:
    """Return (chosen, ambiguous). Multiple close customer matches -> ambiguous."""
    customers = [h for h in hits if h.kind == "customer"]
    others = [h for h in hits if h.kind != "customer"]
    if len(customers) >= 2 and abs(customers[0].score - customers[1].score) < AMBIGUOUS_GAP:
        return others, customers[:4]
    chosen = []
    if customers:
        chosen.append(customers[0])
    chosen.extend(others[:3])
    return chosen, []


_PRODUCT_DEIXIS = re.compile(
    r"\b("
    r"is|ye|yeh|usi|uska|uski|uske|woh|wo|this|that"
    r")\s+(product|item|tile|maal)\b|"
    r"\b(is|ye|yeh)\s+(se|ki|ka|ke|par)\b|"
    r"\bisme\b|"
    r"\bus(ki|ka|ke)\s+(kamai|sale|stock|qty|quantity)\b|"
    r"\b(is|ye|yeh)\s+product\b",
    re.IGNORECASE,
)

_SINGULAR_RANK_Q = re.compile(
    r"\b("
    r"konsa|kaunsa|konsi|kaunsi|which|"
    r"sabse\s+(jada|zyada|zyaada|kam)|"
    r"top\s+(product|seller|item)|"
    r"most\s+sold|highest"
    r")\b",
    re.IGNORECASE,
)


def refers_to_prior_product(question: str) -> bool:
    """True when the shopkeeper means 'that product we just talked about'."""
    return bool(_PRODUCT_DEIXIS.search(question or ""))


def _row_get(row: dict[str, Any], *names: str) -> Any:
    lower = {str(k).lower(): v for k, v in (row or {}).items()}
    for n in names:
        if n.lower() in lower:
            return lower[n.lower()]
    return None


def focus_from_result_rows(
    columns: list[str],
    rows: list[dict[str, Any]],
    *,
    question: str = "",
    chosen: list[EntityHit] | None = None,
) -> EntityHit | None:
    """Remember the product the last answer was about (for 'is product' follow-ups)."""
    if not rows:
        return None
    chosen = chosen or []
    cols_l = {(c or "").lower() for c in (columns or [])}
    has_name = bool(cols_l & {"product_name", "name"})
    if not has_name:
        return None
    remember = False
    if any(e.kind == "product" for e in chosen):
        remember = True
    elif len(rows) == 1:
        remember = True
    elif _SINGULAR_RANK_Q.search(question or ""):
        remember = True
    elif cols_l & {"qty_sold", "total_qty_sold", "pieces_sold", "kamai"}:
        # Ranked sales answer — top row is the focus
        remember = True
    if not remember:
        return None
    row = rows[0]
    name = _row_get(row, "product_name", "name")
    if name is None or str(name).strip() == "":
        return None
    pid = _row_get(row, "product_id")
    if pid is None and any(e.kind == "product" for e in chosen):
        prod = next(e for e in chosen if e.kind == "product")
        return EntityHit(
            kind="product",
            token=":p1",
            id=prod.id,
            display=str(name).strip(),
            score=1.0,
            extra=dict(prod.extra),
        )
    if pid is None:
        # Name-only focus — service may resolve id later
        return EntityHit(
            kind="product",
            token=":p1",
            id="",
            display=str(name).strip(),
            score=0.99,
            extra={},
        )
    return EntityHit(
        kind="product",
        token=":p1",
        id=str(pid),
        display=str(name).strip(),
        score=1.0,
        extra={},
    )


def merge_focus_product(
    chosen: list[EntityHit],
    focus: EntityHit | None,
    question: str,
) -> list[EntityHit]:
    """Inject remembered product when the question refers to it and none is chosen."""
    if focus is None or focus.kind != "product":
        return chosen
    if not refers_to_prior_product(question):
        return chosen
    if any(e.kind == "product" for e in chosen):
        return chosen
    out = [focus] + list(chosen)
    return out
