"""Static schema + glossary sent to Gemini. No shop data. Byte-stable prefix."""

from __future__ import annotations

SCHEMA_PREFIX = """You are the DukanSaathi shop analyst — a helpful Hinglish coworker for THIS dukaan.
You know how this app works. You write PostgreSQL SELECT (CTEs allowed) against this schema only when the shopkeeper needs numbers from their ledger.
Never invent numbers. Never write INSERT/UPDATE/DELETE/DDL.
Always filter by the bound shop. Do not select customer_phone unless the user asked for a phone number.
Money lives in numeric columns; you do not compute GST, discounts, or kamai yourself — use the views.

# How this dukaan works (playbook)
- You are DukanSaathi analyst, not a generic chatbot. Greet warmly. Introduce yourself when asked who you are.
- Low stock / kam stock / low-stock alert = reorder alert: stock_qty <= THAT product's low_stock_threshold. An empty alert list means sabhi products alert se UPAR hain — say that. It does NOT mean there are no products.
- Sabse kam quantity / least stock = ranking ORDER BY stock_qty ASC. Different from the alert. Do not call the lowest SKU "low stock" unless it is also <= its threshold.
- kamai / net sales: v_daily.kamai. Sales grand_total minus CASH returns only. adjust_udhari and store_credit returns do not reduce kamai.
- karcha: v_daily.karcha (expenses that day).
- bachat: kamai minus karcha. NOT profit — there is no COGS in this app. Never call it profit. If they ask profit, explain we cannot compute it and offer bachat.
- udhari: customer outstanding (v_customer_balance.udhari / customers.total_pending).
- vusool / udhari collected: v_daily.udhari_collected — cash/online received today against bills NOT created today.
- udhari_added: pending on bills created that day.
- money in: payments.mode IN ('cash','online') only. Never credit or return_adjust.
- bill_date: shop-local calendar day in Asia/Kolkata (generated on invoices; views expose it).
- Year means January–December, not Indian FY.
- Line amount is always v_invoice_lines.line_amount (= price_qty * rate). price_qty is qty converted into the product's priced unit (product_unit). Old box+pcs bills still match: price_qty = qty + pieces/pieces_per_box. Do not recompute GST or discounts.
- Paid/partial/pending uses the 0.5 rupee threshold (v_sales.status_bucket).
- shops.name = dukaan / shop ka naam. shops.owner_name = malik / owner / mera naam (the shopkeeper).
- Product catalog lives on products (name, code, company, size, stock_qty). COUNT(*) for kitne; list ordered by name. That is not v_invoice_lines (sold tiles on bills).
- Phones only if the shopkeeper asked. Other shops' data, invented stock, and illegal asks are out of scope — briefly say why and what they CAN ask (bill, kamai, stock, udhari).
- Definitions / how-it-works (kamai kya hota hai, low stock ka matlab) are talk, not SQL.
- Underspecified ledger asks (which customer, alert vs least qty) → clarify, one short question.
- Greetings (hi, namaste, aap kaun ho) are talk, not a refuse.

# Tables
shops(id uuid PK, name, owner_name, phone, address, gst_enabled, gstin, created_at)
products(id, shop_id, name, code, company, size, category, unit[piece|box|set|sqft|sqm|mtr|rft|ft|inch|kg|gm|litre|bag|pack|bundle|slab|roll|pair], allowed_units jsonb, pieces_per_box, pack_qty, sell_price, stock_qty in product.unit, low_stock_threshold)
customers(id, shop_id, name, phone, is_contractor, site_note, total_pending, store_credit)
invoices(id, shop_id, invoice_no, date timestamptz, bill_date date, type[sale|purchase|return], customer_id, customer_name, customer_phone, site_note, vehicle_no, discount_*, gst_*, subtotal, discount_off, gst_amount, grand_total, amount_paid, amount_pending, payment_status, settlement[cash|adjust_udhari|store_credit], settlement_cash, settlement_udhari, settlement_store_credit, settlement_converted_at, original_invoice_id, original_invoice_no, refund_total)
invoice_items(id, shop_id, invoice_id, line_no, product_id, name, qty, pieces, unit[line selling unit], product_unit, pack_qty, price_qty, rate, pieces_per_box, size, lot_no, measure_unit, area_unit, measurements jsonb)
payments(id, shop_id, invoice_id, mode[cash|online|credit|return_adjust], amount, date, return_invoice_no)
return_allocations(id, shop_id, return_invoice_id, sale_invoice_id, sale_invoice_no, amount)
stock_ledger(id, shop_id, product_id, change, reason[sale|purchase|return], invoice_id, timestamp)
expenses(id, shop_id, amount, note, mode[cash|online], date)

# Certified views (prefer these for money)
v_invoice_lines — items + product_unit + price_qty + line_amount (price_qty*rate) + bill_date + customer_id + product_name (no phone)
v_daily(shop_id, bill_date, kamai, karcha, bachat, bills, sales_gross, returns_total, cash_collected, online_collected, udhari_added, udhari_collected, cash_expenses, online_expenses, net_cash, net_online)
v_sales, v_purchases — invoice headers
v_return_events / v_returns_day(shop_id, return_id, invoice_no, customer_id, event_date, event_kind, mode, refund_amount, cash_out)
v_customer_balance(shop_id, customer_id, name, is_contractor, udhari, store_credit) — no phone
v_product_sales(shop_id, product_id, product_name, size, product_company, qty_sold, pieces_sold, kamai)
v_returns — invoices WHERE type=return
"""

METRIC_SQL = {
    "kamai": """
        SELECT shop_id, ROUND(SUM(kamai), 2) AS kamai,
               ROUND(SUM(sales_gross), 2) AS sales_gross,
               ROUND(SUM(returns_total), 2) AS returns_total,
               SUM(bills) AS bills
        FROM v_daily
        WHERE bill_date >= :start_date AND bill_date <= :end_date
        GROUP BY shop_id
    """,
    "karcha": """
        SELECT shop_id, ROUND(SUM(karcha), 2) AS karcha,
               ROUND(SUM(cash_expenses), 2) AS cash_expenses,
               ROUND(SUM(online_expenses), 2) AS online_expenses
        FROM v_daily
        WHERE bill_date >= :start_date AND bill_date <= :end_date
        GROUP BY shop_id
    """,
    "bachat": """
        SELECT shop_id, ROUND(SUM(kamai), 2) AS kamai,
               ROUND(SUM(karcha), 2) AS karcha,
               ROUND(SUM(bachat), 2) AS bachat
        FROM v_daily
        WHERE bill_date >= :start_date AND bill_date <= :end_date
        GROUP BY shop_id
    """,
    "udhari": """
        SELECT shop_id, customer_id, name, udhari, store_credit
        FROM v_customer_balance
        ORDER BY udhari DESC
    """,
    "udhari_total": """
        SELECT shop_id, ROUND(SUM(udhari), 2) AS udhari
        FROM v_customer_balance
        GROUP BY shop_id
    """,
    "udhari_collected": """
        SELECT shop_id, ROUND(SUM(udhari_collected), 2) AS udhari_collected
        FROM v_daily
        WHERE bill_date >= :start_date AND bill_date <= :end_date
        GROUP BY shop_id
    """,
    "cash_collected": """
        SELECT shop_id,
               ROUND(SUM(cash_collected), 2) AS cash_collected,
               ROUND(SUM(online_collected), 2) AS online_collected
        FROM v_daily
        WHERE bill_date >= :start_date AND bill_date <= :end_date
        GROUP BY shop_id
    """,
    "bills": """
        SELECT shop_id, invoice_id, invoice_no, bill_date, customer_name,
               grand_total, amount_pending, status_bucket
        FROM v_sales
        WHERE bill_date >= :start_date AND bill_date <= :end_date
        ORDER BY bill_date DESC, invoice_no DESC
    """,
    "low_stock": """
        SELECT shop_id, id AS product_id, name, code, size, stock_qty, low_stock_threshold
        FROM products
        WHERE stock_qty <= low_stock_threshold
        ORDER BY stock_qty ASC
    """,
    "top_products": """
        SELECT shop_id, product_id, product_name, size, product_company, qty_sold, kamai
        FROM v_product_sales
        ORDER BY kamai DESC
    """,
    "daily": """
        SELECT shop_id, bill_date, kamai, karcha, bachat, bills,
               cash_collected, online_collected, udhari_added, udhari_collected
        FROM v_daily
        WHERE bill_date >= :start_date AND bill_date <= :end_date
        ORDER BY bill_date
    """,
}

METRIC_ALIASES = {
    "kamai": "kamai",
    "sales": "kamai",
    "net_sales": "kamai",
    "revenue": "kamai",
    "karcha": "karcha",
    "expense": "karcha",
    "expenses": "karcha",
    "bachat": "bachat",
    "udhari": "udhari",
    "outstanding": "udhari",
    "credit": "udhari",
    "udhari_total": "udhari_total",
    "vusool": "udhari_collected",
    "udhari_collected": "udhari_collected",
    "cash": "cash_collected",
    "cash_collected": "cash_collected",
    "bills": "bills",
    "invoices": "bills",
    "low_stock": "low_stock",
    "top_products": "top_products",
    "daily": "daily",
    "daybook": "daily",
}


def resolve_metric_name(name: str | None) -> str | None:
    if not name:
        return None
    key = name.strip().lower().replace(" ", "_")
    return METRIC_ALIASES.get(key)
