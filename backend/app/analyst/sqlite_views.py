"""SQLite stand-ins for certified analyst views (tests / in-memory).

Uses date(column) instead of Asia/Kolkata bill_date. Fixtures should store
ISO datetimes whose calendar date matches the intended shop-local day.
"""

SQLITE_DROP_VIEWS = [
    "DROP VIEW IF EXISTS v_daily",
    "DROP VIEW IF EXISTS v_product_sales",
    "DROP VIEW IF EXISTS v_returns_day",
    "DROP VIEW IF EXISTS v_return_events",
    "DROP VIEW IF EXISTS v_invoice_lines",
    "DROP VIEW IF EXISTS v_sales",
    "DROP VIEW IF EXISTS v_purchases",
    "DROP VIEW IF EXISTS v_customer_balance",
    "DROP VIEW IF EXISTS v_returns",
]

SQLITE_ANALYST_DDL = [
    """
    CREATE VIEW IF NOT EXISTS v_invoice_lines AS
    SELECT
        ii.id,
        ii.shop_id,
        ii.invoice_id,
        i.invoice_no,
        date(i.date) AS bill_date,
        i.date,
        i.type AS invoice_type,
        i.customer_id,
        i.customer_name,
        ii.product_id,
        ii.name AS product_name,
        ii.size,
        p.company AS product_company,
        p.code AS product_code,
        ii.qty,
        ii.pieces,
        ii.unit,
        ii.rate,
        ii.pieces_per_box,
        CASE
            WHEN ii.unit = 'piece' THEN ROUND(ii.qty * ii.rate, 2)
            ELSE ROUND(
                ii.qty * ii.rate
                + ii.pieces * (ii.rate / CASE WHEN ii.pieces_per_box = 0 THEN NULL ELSE ii.pieces_per_box END),
                2
            )
        END AS line_amount,
        i.grand_total,
        i.amount_pending,
        i.payment_status
    FROM invoice_items ii
    JOIN invoices i ON i.id = ii.invoice_id
    LEFT JOIN products p ON p.id = ii.product_id
    """,
    """
    CREATE VIEW IF NOT EXISTS v_return_events AS
    SELECT
        r.shop_id,
        r.id AS return_id,
        r.invoice_no,
        r.customer_id,
        r.customer_name,
        date(r.date) AS event_date,
        'create' AS event_kind,
        CASE
            WHEN r.settlement_converted_at IS NOT NULL
                 AND date(r.settlement_converted_at) IS NOT date(r.date)
                 AND COALESCE(r.settlement, '') <> 'store_credit'
                THEN 'store_credit'
            WHEN r.settlement IN ('cash', 'adjust_udhari', 'store_credit') THEN r.settlement
            WHEN COALESCE(r.settlement_store_credit, 0) > 0.01 THEN 'store_credit'
            WHEN COALESCE(r.settlement_udhari, 0) > 0.01 THEN 'adjust_udhari'
            ELSE 'cash'
        END AS mode,
        ROUND(COALESCE(r.refund_total, r.grand_total, 0), 2) AS refund_amount,
        ROUND(
            CASE
                WHEN r.settlement = 'cash' OR (
                    r.settlement IS NULL
                    AND COALESCE(r.settlement_store_credit, 0) <= 0.01
                    AND COALESCE(r.settlement_udhari, 0) <= 0.01
                ) THEN COALESCE(NULLIF(r.settlement_cash, 0), r.refund_total, r.grand_total, 0)
                ELSE COALESCE(r.settlement_cash, 0)
            END,
            2
        ) AS cash_out
    FROM invoices r
    WHERE r.type = 'return'
    UNION ALL
    SELECT
        r.shop_id,
        r.id,
        r.invoice_no,
        r.customer_id,
        r.customer_name,
        date(r.settlement_converted_at),
        'conversion',
        CASE
            WHEN r.settlement IN ('cash', 'adjust_udhari', 'store_credit') THEN r.settlement
            WHEN COALESCE(r.settlement_store_credit, 0) > 0.01 THEN 'store_credit'
            WHEN COALESCE(r.settlement_udhari, 0) > 0.01 THEN 'adjust_udhari'
            ELSE 'cash'
        END,
        ROUND(COALESCE(r.refund_total, r.grand_total, 0), 2),
        ROUND(
            CASE
                WHEN r.settlement = 'cash' THEN COALESCE(NULLIF(r.settlement_cash, 0), r.refund_total, r.grand_total, 0)
                ELSE COALESCE(r.settlement_cash, 0)
            END,
            2
        )
    FROM invoices r
    WHERE r.type = 'return'
      AND r.settlement_converted_at IS NOT NULL
      AND date(r.settlement_converted_at) IS NOT date(r.date)
    """,
    """
    CREATE VIEW IF NOT EXISTS v_returns_day AS
    SELECT * FROM v_return_events
    """,
    """
    CREATE VIEW IF NOT EXISTS v_returns AS
    SELECT * FROM invoices WHERE type = 'return'
    """,
    """
    CREATE VIEW IF NOT EXISTS v_sales AS
    SELECT
        shop_id,
        id AS invoice_id,
        invoice_no,
        date(date) AS bill_date,
        date,
        customer_id,
        customer_name,
        grand_total,
        amount_paid,
        amount_pending,
        payment_status,
        CASE
            WHEN amount_pending > 0.5 AND amount_paid > 0.5 THEN 'partial'
            WHEN amount_pending > 0.5 THEN 'pending'
            ELSE 'paid'
        END AS status_bucket
    FROM invoices
    WHERE type = 'sale'
    """,
    """
    CREATE VIEW IF NOT EXISTS v_purchases AS
    SELECT
        shop_id,
        id AS invoice_id,
        invoice_no,
        date(date) AS bill_date,
        date,
        customer_id,
        customer_name,
        grand_total,
        amount_paid,
        amount_pending,
        payment_status
    FROM invoices
    WHERE type = 'purchase'
    """,
    """
    CREATE VIEW IF NOT EXISTS v_customer_balance AS
    SELECT
        shop_id,
        id AS customer_id,
        name,
        is_contractor,
        site_note,
        total_pending AS udhari,
        store_credit
    FROM customers
    """,
    """
    CREATE VIEW IF NOT EXISTS v_product_sales AS
    SELECT
        l.shop_id,
        l.product_id,
        l.product_name,
        l.size,
        l.product_company,
        SUM(l.qty) AS qty_sold,
        SUM(l.pieces) AS pieces_sold,
        ROUND(SUM(l.line_amount), 2) AS kamai
    FROM v_invoice_lines l
    WHERE l.invoice_type = 'sale'
    GROUP BY l.shop_id, l.product_id, l.product_name, l.size, l.product_company
    """,
    """
    CREATE VIEW IF NOT EXISTS v_daily AS
    WITH calendar AS (
        SELECT shop_id, date(date) AS d FROM invoices
        UNION
        SELECT shop_id, date(date) FROM expenses
        UNION
        SELECT shop_id, event_date FROM v_return_events
        UNION
        SELECT shop_id, date(date) FROM payments
    ),
    sales AS (
        SELECT
            shop_id,
            date(date) AS d,
            ROUND(SUM(grand_total), 2) AS sales_gross,
            COUNT(*) AS bills,
            ROUND(SUM(amount_pending), 2) AS udhari_added
        FROM invoices
        WHERE type = 'sale'
        GROUP BY shop_id, date(date)
    ),
    rets AS (
        SELECT
            shop_id,
            event_date AS d,
            ROUND(SUM(CASE WHEN mode = 'cash' THEN refund_amount ELSE 0 END), 2) AS returns_cash,
            ROUND(SUM(CASE WHEN mode = 'cash' THEN cash_out ELSE 0 END), 2) AS cash_refunds
        FROM v_return_events
        GROUP BY shop_id, event_date
    ),
    pay AS (
        SELECT
            p.shop_id,
            date(COALESCE(p.date, i.date)) AS d,
            ROUND(SUM(CASE WHEN p.mode = 'cash' THEN p.amount ELSE 0 END), 2) AS cash_in,
            ROUND(SUM(CASE WHEN p.mode = 'online' THEN p.amount ELSE 0 END), 2) AS online_in,
            ROUND(
                SUM(
                    CASE
                        WHEN p.mode IN ('cash', 'online')
                             AND i.type = 'sale'
                             AND date(i.date) IS NOT date(COALESCE(p.date, i.date))
                            THEN p.amount
                        ELSE 0
                    END
                ),
                2
            ) AS udhari_collected
        FROM payments p
        JOIN invoices i ON i.id = p.invoice_id
        WHERE p.mode IN ('cash', 'online')
        GROUP BY p.shop_id, date(COALESCE(p.date, i.date))
    ),
    expn AS (
        SELECT
            shop_id,
            date(date) AS d,
            ROUND(SUM(amount), 2) AS karcha,
            ROUND(SUM(CASE WHEN mode = 'cash' THEN amount ELSE 0 END), 2) AS cash_expenses,
            ROUND(SUM(CASE WHEN mode = 'online' THEN amount ELSE 0 END), 2) AS online_expenses
        FROM expenses
        GROUP BY shop_id, date(date)
    )
    SELECT
        c.shop_id,
        c.d AS bill_date,
        ROUND(COALESCE(s.sales_gross, 0) - COALESCE(r.returns_cash, 0), 2) AS kamai,
        COALESCE(e.karcha, 0) AS karcha,
        ROUND(COALESCE(s.sales_gross, 0) - COALESCE(r.returns_cash, 0) - COALESCE(e.karcha, 0), 2) AS bachat,
        COALESCE(s.bills, 0) AS bills,
        COALESCE(s.sales_gross, 0) AS sales_gross,
        COALESCE(r.returns_cash, 0) AS returns_total,
        ROUND(COALESCE(p.cash_in, 0) - COALESCE(r.cash_refunds, 0), 2) AS cash_collected,
        COALESCE(p.online_in, 0) AS online_collected,
        COALESCE(s.udhari_added, 0) AS udhari_added,
        COALESCE(p.udhari_collected, 0) AS udhari_collected,
        COALESCE(e.cash_expenses, 0) AS cash_expenses,
        COALESCE(e.online_expenses, 0) AS online_expenses,
        ROUND(COALESCE(p.cash_in, 0) - COALESCE(r.cash_refunds, 0) - COALESCE(e.cash_expenses, 0), 2) AS net_cash,
        ROUND(COALESCE(p.online_in, 0) - COALESCE(e.online_expenses, 0), 2) AS net_online
    FROM calendar c
    LEFT JOIN sales s ON s.shop_id = c.shop_id AND s.d = c.d
    LEFT JOIN rets r ON r.shop_id = c.shop_id AND r.d = c.d
    LEFT JOIN pay p ON p.shop_id = c.shop_id AND p.d = c.d
    LEFT JOIN expn e ON e.shop_id = c.shop_id AND e.d = c.d
    WHERE c.d IS NOT NULL
    """,
    """
    CREATE TABLE IF NOT EXISTS analyst_sql_cache (
        id TEXT PRIMARY KEY,
        shop_id TEXT NOT NULL,
        question_norm TEXT NOT NULL,
        sql TEXT NOT NULL,
        created_at TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS analyst_traces (
        id TEXT PRIMARY KEY,
        shop_id TEXT NOT NULL,
        question_tokenized TEXT NOT NULL DEFAULT '',
        route TEXT NOT NULL DEFAULT '',
        sql TEXT,
        row_count INTEGER,
        latency_ms INTEGER,
        repaired INTEGER NOT NULL DEFAULT 0,
        cache_hit INTEGER NOT NULL DEFAULT 0,
        created_at TEXT
    )
    """,
]


async def apply_sqlite_analyst_schema(conn) -> None:
    from sqlalchemy import text

    for stmt in SQLITE_DROP_VIEWS:
        await conn.execute(text(stmt))
    for stmt in SQLITE_ANALYST_DDL:
        await conn.execute(text(stmt))
