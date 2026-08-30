"""Planner + SQL generation structured schemas and prompt assembly."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

from app.analyst.catalog import SCHEMA_PREFIX
from app.analyst.resolvers import DateWindow, EntityHit


class AnalystPlan(BaseModel):
    route: Literal["metric", "sql", "clarify", "refuse", "talk"] = "sql"
    metric: Optional[str] = Field(default=None, description="kamai, karcha, bachat, udhari, ...")
    sql: Optional[str] = Field(default=None, description="Single SELECT or CTE. No shop_id literal needed.")
    reply: str = Field(
        default="",
        description="Hinglish shopkeeper-facing line for talk/clarify/refuse. No digits, names, or phones.",
    )
    assumptions: str = ""
    needs_clarification: str = ""
    include_phone: bool = False
    done: bool = True


class AnalystTemplate(BaseModel):
    template: str = Field(
        default="",
        description="Hinglish sentence using {{column}} placeholders only. No digits, names, or phones.",
    )
    table_columns: list[str] = Field(default_factory=list)
    assumptions: str = ""


GOLD_EXAMPLES = [
    {
        "q": "pichle mahine ki kamai",
        "sql": "SELECT ROUND(SUM(kamai), 2) AS kamai FROM v_daily WHERE bill_date >= :start_date AND bill_date <= :end_date",
    },
    {
        "q": "customer :c1 ka last bill",
        "sql": "SELECT invoice_no, bill_date, grand_total, amount_pending FROM v_sales WHERE customer_id = :c1 ORDER BY bill_date DESC",
    },
    {
        "q": "sabse zyada udhari kiska",
        "sql": "SELECT name, udhari FROM v_customer_balance ORDER BY udhari DESC",
    },
    {
        "q": "customer :c1 ne kaunsi tiles li",
        "sql": "SELECT bill_date, invoice_no, product_name, size, qty, pieces, line_amount FROM v_invoice_lines WHERE invoice_type = 'sale' AND customer_id = :c1 ORDER BY bill_date DESC",
    },
    {
        "q": "mera naam / owner ka naam",
        "sql": "SELECT owner_name FROM shops",
    },
    {
        "q": "shop ka naam / dukaan ka naam",
        "sql": "SELECT name FROM shops",
    },
    {
        "q": "stock me kitne products",
        "sql": "SELECT COUNT(*) AS products FROM products",
    },
    {
        "q": "products ki list / stock list dikhao / stock kitna",
        "sql": "SELECT name, code, company, size, stock_qty FROM products ORDER BY name",
    },
    {
        "q": "low stock / kiska stock kam",
        "sql": "SELECT name, code, size, stock_qty, low_stock_threshold FROM products WHERE stock_qty <= low_stock_threshold ORDER BY stock_qty ASC",
    },
    {
        "q": "sabse kam stock",
        "sql": "SELECT name, code, size, stock_qty FROM products ORDER BY stock_qty ASC",
    },
    {
        "q": "sabse zyada sale / jada selling product / top product",
        "sql": (
            "SELECT product_name, qty_sold AS total_qty_sold, kamai "
            "FROM v_product_sales ORDER BY qty_sold DESC"
        ),
    },
]


def _fewshot(tokenized: str) -> str:
    q = tokenized.lower()
    scored = []
    for ex in GOLD_EXAMPLES:
        words = set(ex["q"].split()) & set(q.split())
        scored.append((len(words), ex))
    scored.sort(key=lambda x: x[0], reverse=True)
    lines = []
    for _, ex in scored[:4]:
        lines.append(f"Q: {ex['q']}\nSQL: {ex['sql']}")
    return "\n\n".join(lines)


def planner_user_message(
    tokenized_question: str,
    window: DateWindow,
    entities: list[EntityHit],
    today_iso: str,
    history_note: str = "",
    dialect_note: str = "postgresql",
) -> str:
    ent_lines = []
    for e in entities:
        ent_lines.append(f"{e.token} = {e.kind} id {e.id}")
    return (
        f"TODAY={today_iso} timezone=Asia/Kolkata dialect={dialect_note}\n"
        f"DATE_WINDOW start={window.start.isoformat()} end={window.end.isoformat()} "
        f"label={window.label} assumed={window.assumed}\n"
        f"ENTITIES:\n" + ("\n".join(ent_lines) or "(none)") + "\n"
        f"HISTORY: {history_note or '(none)'}\n"
        f"QUESTION (tokenized, no real names):\n{tokenized_question}\n\n"
        "Choose route=talk for greetings, who-are-you, and how-this-shop-works / definitions "
        "(kamai kya hota hai, profit kyun nahi, low stock ka matlab). Put the Hinglish answer in reply. Empty sql.\n"
        "Choose route=metric when the question is kamai/karcha/bachat/udhari/vusool/daybook, "
        "or the reorder alert (low_stock = stock_qty <= low_stock_threshold).\n"
        "Empty low_stock is a real answer (sabhi alert se upar) — do not switch to ranking.\n"
        "sabse kam / least stock → SQL ORDER BY stock_qty ASC (ranking, not the alert).\n"
        "jada sale / sabse zyada sale / top selling / inme se jada selling product → "
        "route=metric top_products OR SQL on v_product_sales ORDER BY qty_sold/kamai DESC. "
        "Do NOT answer a sales-ranking question with the products stock list.\n"
        "Choose route=sql for bills, line items, named customers, shop name, owner name, product catalog "
        "(use tokens :c1/:p1 as bound ids in SQL).\n"
        "mera naam / owner / malik → SELECT owner_name FROM shops. dukaan/shop ka naam → SELECT name FROM shops.\n"
        "kitne products / stock me kitne → SELECT COUNT(*) AS products FROM products.\n"
        "products ki list / stock list / stock kitna / stock dikhao → SELECT name, code, company, size, stock_qty FROM products ORDER BY name.\n"
        "Product catalog uses the products table, NOT v_invoice_lines, and does not need :c1 or :shop_id.\n"
        "Do not write WHERE 1=1 or WHERE shop_id = shop_id. Tenant wrap is injected for you.\n"
        "Choose route=clarify if several customers could match or alert vs least qty is unclear — one short question in reply.\n"
        "Choose route=refuse ONLY for other shops, invented stock, profit/COGS numbers, or illegal requests. "
        "Put a short why in reply plus what they can ask (bill, kamai, stock, udhari). Never refuse hi or identity.\n"
        "SQL must be a single SELECT. Use :start_date :end_date :c1 :p1 as parameters when needed.\n"
        "Bind customer_id = :c1 not a name. Do not select customer_phone unless include_phone=true.\n"
        "If HISTORY has focus_product / ENTITIES has :p1 and the question says "
        "'is product' / 'yeh' / 'uski kamai', reuse :p1 — do NOT clarify which product.\n"
        "Prefer certified views for money. LIMIT is injected for you.\n"
        "reply must be Hinglish with no digits, rupee amounts, names, or phones.\n"
        f"EXAMPLES:\n{_fewshot(tokenized_question)}"
    )


PLANNER_SYSTEM = SCHEMA_PREFIX + """
Output JSON with keys: route, metric, sql, reply, assumptions, needs_clarification, include_phone, done.
If route=sql, sql is required. If route=metric, metric is required (one of kamai, karcha, bachat, udhari, udhari_total, udhari_collected, cash_collected, bills, low_stock, top_products, daily).
If route=talk, clarify, or refuse: fill reply (Hinglish, no digits). sql may be empty.
Never put user-facing English intent in assumptions — that field is logs only.
"""


TEMPLATE_SYSTEM = """You write a SHORT answer TEMPLATE for a shopkeeper.
You see ONLY column names, row_count, route, and metric — never row values.
Rules:
- For 1 row and 1-2 columns, template MUST be only {{column}} or {{col1}} — {{col2}}. Nothing else.
- Do not restate the question. Do not write English intent ("The user is asking…").
- Do not copy assumptions into the template.
- Use placeholders exactly like {{column_name}} for any number, date, name, or id.
- Do not invent digits, rupee amounts, names, or phone numbers.
- Do not write any digit 0-9 except inside a placeholder.
- If row_count is 0, leave template empty — the backend explains empty results with shop rules.
- If row_count > 1, ALWAYS write one short Hinglish line that answers with the TOP/FIRST row
  (SQL is already ranked). Example: "Sabse upar {{product_name}} — {{total_qty_sold}}."
  Never leave template empty for ranked lists (top sale, zyada udhari, low stock ranking).
- Copy column names exactly as given.
"""


def template_user_message(
    columns: list[str],
    row_count: int,
    route: str,
    assumptions: str,
    metric: str = "",
) -> str:
    return (
        f"route={route}\nmetric={metric}\nrow_count={row_count}\ncolumns={', '.join(columns)}\n"
        "Return JSON {template, table_columns}."
    )
