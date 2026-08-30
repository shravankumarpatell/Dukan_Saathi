"""Local greetings, identity, and product catalog — no planner."""

from __future__ import annotations

import re
from typing import Literal, Sequence

TalkKind = Literal[
    "greet",
    "who",
    "owner_role",
    "owner_name",
    "shop_name",
    "product_count",
    "product_list",
    "product_alert",
    "product_least",
]

CATALOG_KINDS = frozenset(
    {"product_count", "product_list", "product_alert", "product_least"}
)
TALK_KINDS = frozenset({"greet", "who", "owner_role"})

TALK_GREET = (
    "Hello — main yahan help ke liye hoon. Bill, kamai, stock, udhari poochho."
)
TALK_WHO = (
    "Main DukanSaathi analyst AI chatbot hoon. "
    "Is dukaan ke bills, stock, kamai, udhari mein madad karta hoon."
)
TALK_OWNER_ROLE = (
    "Aap is dukaan ke shopkeeper / malik ho. "
    "Main aapka AI Saathi hoon — bill, kamai, stock, udhari bataata hoon."
)
TALK_REPLY = TALK_GREET

SQL_OWNER = "SELECT owner_name FROM shops"
SQL_SHOP = "SELECT name FROM shops"
SQL_PRODUCT_COUNT = "SELECT COUNT(*) AS products FROM products"
SQL_PRODUCT_LIST = (
    "SELECT name, code, company, size, stock_qty FROM products ORDER BY name"
)
SQL_PRODUCT_ALERT = (
    "SELECT name, code, size, stock_qty, low_stock_threshold FROM products "
    "WHERE stock_qty <= low_stock_threshold ORDER BY stock_qty ASC, name"
)
SQL_PRODUCT_LEAST = (
    "SELECT name, code, company, size, stock_qty FROM products "
    "ORDER BY stock_qty ASC, name"
)

_SHOP_NAME = re.compile(
    r"\b(shop|dukaan|dukan|store)\b.{0,24}\bnaam\b|"
    r"\bnaam\b.{0,16}\b(shop|dukaan|dukan)\b|"
    r"\bshop\s*name\b|"
    r"\bdukaan\s*ka\s*(kya\s+)?naam\b",
    re.IGNORECASE,
)

_OWNER_NAME = re.compile(
    r"\b(mera|meri|mere)\s+(kya\s+)?naam\b|"
    r"\b(owner|malik)\b.{0,20}\bnaam\b|"
    r"\bnaam\b.{0,16}\b(owner|malik)\b|"
    r"\bowner\s*name\b|"
    r"^(me|mai|main|mein)\s+(kaun|kon)\b|"
    r"\bwho\s+am\s+i\b",
    re.IGNORECASE,
)

_OWNER_ROLE = re.compile(
    r"\b(mera|meri|mere)\s+(kya\s+)?kaam\b|"
    r"\b(main|mein|mai|me)\s+kya\s+(karta|karti|karata|karati)\b|"
    r"\bwhat\s+(is\s+)?my\s+(job|role|work)\b|"
    r"\bmy\s+(job|role|work)\b",
    re.IGNORECASE,
)

_GREET_ONLY = re.compile(
    r"^(hi+|hii+|hello+|hey+|namaste|namaskar|yo)[\s!?.]*$",
    re.IGNORECASE,
)

_WHO = re.compile(
    r"(aap|ap|tum)\s*(kaun|kon)(\s*(ho|h|hai|he))?(\?)?$|"
    r"(aap|ap|tum)\s*(kaun|kon)\s*(ho|h)|"
    r"who\s+are\s+you",
    re.IGNORECASE,
)

_CAN_DO = re.compile(
    r"kya\s+kar\s+sakte\s*(ho|h)|kya\s+kar\s+sakti|what\s+can\s+you\s+do",
    re.IGNORECASE,
)

_LEDGER = re.compile(
    r"\b(kamai|karcha|bachat|udhari|bill|invoice|stock|phone|customer|"
    r"tiles|product|kharid|sale|return|vusool)\b",
    re.IGNORECASE,
)

_PRODUCT_COUNT = re.compile(
    r"(kitne|kitna|how many|count).{0,32}(product|item)|"
    r"(product|item)s?.{0,32}(kitne|kitna|count|number)|"
    r"stock\s+me\s+(kitne|kitna)",
    re.IGNORECASE,
)

_PRODUCT_LIST = re.compile(
    r"(product|item)s?.{0,20}list|"
    r"list.{0,20}(product|item)|"
    r"saare\s+product|"
    r"all\s+products|"
    r"products?\s+(dikha|bata|do|hai|he)|"
    r"stock\s+(me|ki)\s+(kya|kons|kaun)|"
    r"stock\s+list|"
    r"^(stock|inventory)\s+(kitna|kitne|kya|dikhao|batao|dikha|bata|list|hai|he)\b|"
    r"^(kitna|kitne)\s+stock\b|"
    r"\bstock\b.{0,16}(dikha|bata|list)|"
    r"(dikha|bata).{0,16}\bstock\b|"
    r"^(mera|poora|total|sara|saara)\s+stock\b|"
    r"^stock\s*$",
    re.IGNORECASE,
)

_PRODUCT_LEAST = re.compile(
    r"sabse\s+kam(\s+stock)?|"
    r"least\s+stock|"
    r"sabse\s+kam\s+quantity|"
    r"minimum\s+stock",
    re.IGNORECASE,
)

_PRODUCT_ALERT = re.compile(
    r"low\s*stock|"
    r"stock.{0,24}\bkam\b|"
    r"\bkam\b.{0,16}stock|"
    r"kiska\s+stock|"
    r"kons[aei].{0,24}stock|"
    r"inme\s+se.{0,32}(kam|low)|"
    r"mese.{0,24}(kam|low\s*stock)|"
    r"alert",
    re.IGNORECASE,
)

_WHICH_ONES = re.compile(
    r"^(konse|kaunse|konsi|kaunsi|which)(\s+\1)?(\s+(he|hai|h|wal[ea]|ones?))?[\s?]*$",
    re.IGNORECASE,
)


def _compact(question: str) -> str:
    text = re.sub(r"[^\w\s]+", " ", question or "", flags=re.UNICODE)
    return re.sub(r"\s+", " ", text).strip()


def _prior_about_products(prior_questions: Sequence[str] | None) -> bool:
    blob = " ".join(prior_questions or [])
    return bool(re.search(r"\b(product|stock|inventory)\b", blob, re.IGNORECASE))


def classify_local(
    question: str,
    prior_questions: Sequence[str] | None = None,
) -> TalkKind | None:
    q = (question or "").strip()
    if not q:
        return None
    if _SHOP_NAME.search(q):
        return "shop_name"
    if _OWNER_NAME.search(q):
        return "owner_name"
    if _OWNER_ROLE.search(q):
        return "owner_role"
    compact = _compact(q)
    if not compact:
        return None
    if _OWNER_NAME.search(compact):
        return "owner_name"
    if _OWNER_ROLE.search(compact):
        return "owner_role"
    if _PRODUCT_COUNT.search(compact):
        return "product_count"
    if _PRODUCT_LEAST.search(compact):
        return "product_least"
    if _PRODUCT_ALERT.search(compact):
        return "product_alert"
    if _PRODUCT_LIST.search(compact):
        return "product_list"
    if _WHICH_ONES.match(compact) and _prior_about_products(prior_questions):
        return "product_list"
    if _GREET_ONLY.match(compact):
        return "greet"
    if _WHO.search(compact) or _CAN_DO.search(compact):
        return "who"
    if re.match(r"^(hi+|hello+|hey+|namaste|namaskar)\b", compact, re.I):
        rest = re.sub(
            r"^(hi+|hello+|hey+|namaste|namaskar)\s+",
            "",
            compact,
            flags=re.I,
        )
        if not rest:
            return "greet"
        if _WHO.search(rest) or _CAN_DO.search(rest):
            return "who"
    if _LEDGER.search(compact):
        return None
    return None


def talk_text(kind: TalkKind | None) -> str:
    if kind == "who":
        return TALK_WHO
    if kind == "owner_role":
        return TALK_OWNER_ROLE
    return TALK_GREET


def identity_sql(kind: TalkKind | None) -> str | None:
    if kind == "owner_name":
        return SQL_OWNER
    if kind == "shop_name":
        return SQL_SHOP
    if kind == "product_count":
        return SQL_PRODUCT_COUNT
    if kind == "product_list":
        return SQL_PRODUCT_LIST
    if kind == "product_alert":
        return SQL_PRODUCT_ALERT
    if kind == "product_least":
        return SQL_PRODUCT_LEAST
    return None


_CATALOG_WORD = re.compile(r"\b(stock|product|inventory|tile)s?\b", re.IGNORECASE)
_PROFIT_WORD = re.compile(r"\b(profit|cogs)\b", re.IGNORECASE)

TALK_NO_PROFIT = (
    "Is app mein COGS nahi hai isliye profit nahi nikal sakte. "
    "Bachat poochho — kamai minus karcha."
)
PLANNER_DOWN = (
    "Abhi yeh sawal nikal nahi paya. "
    "Stock list, kamai, bill, udhari seedha poochho."
)


def planner_down_local(question: str) -> tuple[str | None, str | None]:
    """When Gemini is down: catalog SQL, or a short why — never the profit refuse."""
    kind = classify_local(question)
    if kind in CATALOG_KINDS or kind in {"owner_name", "shop_name"}:
        return kind, identity_sql(kind)
    compact = _compact(question)
    if _PROFIT_WORD.search(compact):
        return "no_profit", None
    if _CATALOG_WORD.search(compact):
        return "product_list", SQL_PRODUCT_LIST
    return None, None
