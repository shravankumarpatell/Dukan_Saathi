-- Analyst certified views, read-only role, GUC-based RLS, SQL-plan cache, traces.
-- Apply after 0001_init.sql (Supabase SQL editor or psql).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- Shop setting: strict (default) never sends rows to the LLM.
-- ---------------------------------------------------------------------------
ALTER TABLE shops
    ADD COLUMN IF NOT EXISTS chat_privacy_mode text NOT NULL DEFAULT 'strict'
        CHECK (chat_privacy_mode IN ('strict', 'rich'));

-- ---------------------------------------------------------------------------
-- Line items with the same money math as backend/app/common/calc.py item_amount.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_invoice_lines AS
SELECT
    ii.id,
    ii.shop_id,
    ii.invoice_id,
    i.invoice_no,
    i.bill_date,
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
        WHEN ii.unit = 'piece' THEN ROUND((ii.qty * ii.rate)::numeric, 2)
        ELSE ROUND(
            (
                ii.qty * ii.rate
                + ii.pieces * (ii.rate / NULLIF(ii.pieces_per_box, 0))
            )::numeric,
            2
        )
    END AS line_amount,
    i.grand_total,
    i.amount_pending,
    i.payment_status
FROM invoice_items ii
JOIN invoices i ON i.id = ii.invoice_id
LEFT JOIN products p ON p.id = ii.product_id;

-- ---------------------------------------------------------------------------
-- Return events that belong on a calendar day (create and/or conversion).
-- Mirrors frontend/src/lib/daybook.js returnModeForDay.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_return_events AS
SELECT
    r.shop_id,
    r.id AS return_id,
    r.invoice_no,
    r.customer_id,
    r.customer_name,
    (r.date AT TIME ZONE 'Asia/Kolkata')::date AS event_date,
    'create'::text AS event_kind,
    CASE
        WHEN r.settlement_converted_at IS NOT NULL
             AND (r.settlement_converted_at AT TIME ZONE 'Asia/Kolkata')::date
                 IS DISTINCT FROM (r.date AT TIME ZONE 'Asia/Kolkata')::date
             AND COALESCE(r.settlement, '') <> 'store_credit'
            THEN 'store_credit'
        WHEN r.settlement IN ('cash', 'adjust_udhari', 'store_credit') THEN r.settlement
        WHEN COALESCE(r.settlement_store_credit, 0) > 0.01 THEN 'store_credit'
        WHEN COALESCE(r.settlement_udhari, 0) > 0.01 THEN 'adjust_udhari'
        ELSE 'cash'
    END AS mode,
    ROUND(COALESCE(r.refund_total, r.grand_total, 0)::numeric, 2) AS refund_amount,
    ROUND(
        CASE
            WHEN r.settlement = 'cash' OR (
                r.settlement IS NULL
                AND COALESCE(r.settlement_store_credit, 0) <= 0.01
                AND COALESCE(r.settlement_udhari, 0) <= 0.01
            ) THEN COALESCE(NULLIF(r.settlement_cash, 0), r.refund_total, r.grand_total, 0)
            ELSE COALESCE(r.settlement_cash, 0)
        END::numeric,
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
    (r.settlement_converted_at AT TIME ZONE 'Asia/Kolkata')::date,
    'conversion'::text,
    CASE
        WHEN r.settlement IN ('cash', 'adjust_udhari', 'store_credit') THEN r.settlement
        WHEN COALESCE(r.settlement_store_credit, 0) > 0.01 THEN 'store_credit'
        WHEN COALESCE(r.settlement_udhari, 0) > 0.01 THEN 'adjust_udhari'
        ELSE 'cash'
    END,
    ROUND(COALESCE(r.refund_total, r.grand_total, 0)::numeric, 2),
    ROUND(
        CASE
            WHEN r.settlement = 'cash' THEN COALESCE(NULLIF(r.settlement_cash, 0), r.refund_total, r.grand_total, 0)
            ELSE COALESCE(r.settlement_cash, 0)
        END::numeric,
        2
    )
FROM invoices r
WHERE r.type = 'return'
  AND r.settlement_converted_at IS NOT NULL
  AND (r.settlement_converted_at AT TIME ZONE 'Asia/Kolkata')::date
      IS DISTINCT FROM (r.date AT TIME ZONE 'Asia/Kolkata')::date;

CREATE OR REPLACE VIEW v_returns_day AS
SELECT * FROM v_return_events;

CREATE OR REPLACE VIEW v_returns AS
SELECT * FROM invoices WHERE type = 'return';

CREATE OR REPLACE VIEW v_sales AS
SELECT
    shop_id,
    id AS invoice_id,
    invoice_no,
    bill_date,
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
WHERE type = 'sale';

CREATE OR REPLACE VIEW v_purchases AS
SELECT
    shop_id,
    id AS invoice_id,
    invoice_no,
    bill_date,
    date,
    customer_id,
    customer_name,
    grand_total,
    amount_paid,
    amount_pending,
    payment_status
FROM invoices
WHERE type = 'purchase';

CREATE OR REPLACE VIEW v_customer_balance AS
SELECT
    shop_id,
    id AS customer_id,
    name,
    is_contractor,
    site_note,
    total_pending AS udhari,
    store_credit
FROM customers;

CREATE OR REPLACE VIEW v_product_sales AS
SELECT
    l.shop_id,
    l.product_id,
    l.product_name,
    l.size,
    l.product_company,
    SUM(l.qty) AS qty_sold,
    SUM(l.pieces) AS pieces_sold,
    ROUND(SUM(l.line_amount)::numeric, 2) AS kamai
FROM v_invoice_lines l
WHERE l.invoice_type = 'sale'
GROUP BY l.shop_id, l.product_id, l.product_name, l.size, l.product_company;

CREATE OR REPLACE VIEW v_daily AS
WITH calendar AS (
    SELECT shop_id, bill_date AS d FROM invoices
    UNION
    SELECT shop_id, (date AT TIME ZONE 'Asia/Kolkata')::date FROM expenses
    UNION
    SELECT shop_id, event_date FROM v_return_events
    UNION
    SELECT shop_id, (date AT TIME ZONE 'Asia/Kolkata')::date FROM payments
),
sales AS (
    SELECT
        shop_id,
        bill_date AS d,
        ROUND(SUM(grand_total)::numeric, 2) AS sales_gross,
        COUNT(*)::integer AS bills,
        ROUND(SUM(amount_pending)::numeric, 2) AS udhari_added
    FROM invoices
    WHERE type = 'sale'
    GROUP BY shop_id, bill_date
),
rets AS (
    SELECT
        shop_id,
        event_date AS d,
        ROUND(SUM(CASE WHEN mode = 'cash' THEN refund_amount ELSE 0 END)::numeric, 2) AS returns_cash,
        ROUND(SUM(CASE WHEN mode = 'cash' THEN cash_out ELSE 0 END)::numeric, 2) AS cash_refunds
    FROM v_return_events
    GROUP BY shop_id, event_date
),
pay AS (
    SELECT
        p.shop_id,
        (COALESCE(p.date, i.date) AT TIME ZONE 'Asia/Kolkata')::date AS d,
        ROUND(SUM(CASE WHEN p.mode = 'cash' THEN p.amount ELSE 0 END)::numeric, 2) AS cash_in,
        ROUND(SUM(CASE WHEN p.mode = 'online' THEN p.amount ELSE 0 END)::numeric, 2) AS online_in,
        ROUND(
            SUM(
                CASE
                    WHEN p.mode IN ('cash', 'online')
                         AND i.type = 'sale'
                         AND i.bill_date IS DISTINCT FROM (COALESCE(p.date, i.date) AT TIME ZONE 'Asia/Kolkata')::date
                        THEN p.amount
                    ELSE 0
                END
            )::numeric,
            2
        ) AS udhari_collected
    FROM payments p
    JOIN invoices i ON i.id = p.invoice_id
    WHERE p.mode IN ('cash', 'online')
    GROUP BY p.shop_id, (COALESCE(p.date, i.date) AT TIME ZONE 'Asia/Kolkata')::date
),
expn AS (
    SELECT
        shop_id,
        (date AT TIME ZONE 'Asia/Kolkata')::date AS d,
        ROUND(SUM(amount)::numeric, 2) AS karcha,
        ROUND(SUM(CASE WHEN mode = 'cash' THEN amount ELSE 0 END)::numeric, 2) AS cash_expenses,
        ROUND(SUM(CASE WHEN mode = 'online' THEN amount ELSE 0 END)::numeric, 2) AS online_expenses
    FROM expenses
    GROUP BY shop_id, (date AT TIME ZONE 'Asia/Kolkata')::date
)
SELECT
    c.shop_id,
    c.d AS bill_date,
    ROUND((COALESCE(s.sales_gross, 0) - COALESCE(r.returns_cash, 0))::numeric, 2) AS kamai,
    COALESCE(e.karcha, 0) AS karcha,
    ROUND((COALESCE(s.sales_gross, 0) - COALESCE(r.returns_cash, 0) - COALESCE(e.karcha, 0))::numeric, 2) AS bachat,
    COALESCE(s.bills, 0) AS bills,
    COALESCE(s.sales_gross, 0) AS sales_gross,
    COALESCE(r.returns_cash, 0) AS returns_total,
    ROUND((COALESCE(p.cash_in, 0) - COALESCE(r.cash_refunds, 0))::numeric, 2) AS cash_collected,
    COALESCE(p.online_in, 0) AS online_collected,
    COALESCE(s.udhari_added, 0) AS udhari_added,
    COALESCE(p.udhari_collected, 0) AS udhari_collected,
    COALESCE(e.cash_expenses, 0) AS cash_expenses,
    COALESCE(e.online_expenses, 0) AS online_expenses,
    ROUND(
        (COALESCE(p.cash_in, 0) - COALESCE(r.cash_refunds, 0) - COALESCE(e.cash_expenses, 0))::numeric,
        2
    ) AS net_cash,
    ROUND((COALESCE(p.online_in, 0) - COALESCE(e.online_expenses, 0))::numeric, 2) AS net_online
FROM calendar c
LEFT JOIN sales s ON s.shop_id = c.shop_id AND s.d = c.d
LEFT JOIN rets r ON r.shop_id = c.shop_id AND r.d = c.d
LEFT JOIN pay p ON p.shop_id = c.shop_id AND p.d = c.d
LEFT JOIN expn e ON e.shop_id = c.shop_id AND e.d = c.d
WHERE c.d IS NOT NULL;

DO $$
DECLARE
    v text;
BEGIN
    FOREACH v IN ARRAY ARRAY[
        'v_invoice_lines',
        'v_return_events',
        'v_returns_day',
        'v_returns',
        'v_sales',
        'v_purchases',
        'v_customer_balance',
        'v_product_sales',
        'v_daily'
    ]
    LOOP
        BEGIN
            EXECUTE format('ALTER VIEW %I SET (security_invoker = true)', v);
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS customers_name_trgm
    ON customers USING gin (lower(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_name_trgm
    ON products USING gin (lower(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_company_trgm
    ON products USING gin (lower(company) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS invoices_customer_name_trgm
    ON invoices USING gin (lower(customer_name) gin_trgm_ops);

CREATE TABLE IF NOT EXISTS analyst_sql_cache (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES shops (id) ON DELETE CASCADE,
    question_norm text NOT NULL,
    sql text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analyst_sql_cache_shop_q
    ON analyst_sql_cache (shop_id, question_norm);
CREATE INDEX IF NOT EXISTS analyst_sql_cache_q_trgm
    ON analyst_sql_cache USING gin (question_norm gin_trgm_ops);

-- Content-free: tokenized question, SQL, counts. Never row payloads.
CREATE TABLE IF NOT EXISTS analyst_traces (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES shops (id) ON DELETE CASCADE,
    question_tokenized text NOT NULL DEFAULT '',
    route text NOT NULL DEFAULT '',
    sql text,
    row_count integer,
    latency_ms integer,
    repaired boolean NOT NULL DEFAULT false,
    cache_hit boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analyst_traces_shop_created
    ON analyst_traces (shop_id, created_at DESC);

ALTER TABLE analyst_sql_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyst_sql_cache FORCE ROW LEVEL SECURITY;
ALTER TABLE analyst_traces ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyst_traces FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- analyst_ro: SELECT only. Writer connections SET ROLE inside a transaction.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'analyst_ro') THEN
        CREATE ROLE analyst_ro NOINHERIT;
    END IF;
END $$;

ALTER ROLE analyst_ro SET default_transaction_read_only = on;
ALTER ROLE analyst_ro SET statement_timeout = '2s';

GRANT USAGE ON SCHEMA public TO analyst_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO analyst_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO analyst_ro;

DO $$
BEGIN
    EXECUTE format('GRANT analyst_ro TO %I', current_user);
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- GUC-based isolation for the analyst role (auth.uid() is not set on this path).
DROP POLICY IF EXISTS shops_analyst ON shops;
DROP POLICY IF EXISTS products_analyst ON products;
DROP POLICY IF EXISTS customers_analyst ON customers;
DROP POLICY IF EXISTS invoices_analyst ON invoices;
DROP POLICY IF EXISTS invoice_items_analyst ON invoice_items;
DROP POLICY IF EXISTS payments_analyst ON payments;
DROP POLICY IF EXISTS return_allocations_analyst ON return_allocations;
DROP POLICY IF EXISTS stock_ledger_analyst ON stock_ledger;
DROP POLICY IF EXISTS expenses_analyst ON expenses;
DROP POLICY IF EXISTS analyst_sql_cache_analyst ON analyst_sql_cache;
DROP POLICY IF EXISTS analyst_traces_analyst ON analyst_traces;
DROP POLICY IF EXISTS analyst_sql_cache_own ON analyst_sql_cache;
DROP POLICY IF EXISTS analyst_traces_own ON analyst_traces;

CREATE POLICY shops_analyst ON shops
    FOR SELECT TO analyst_ro
    USING (id = NULLIF(current_setting('app.shop_id', true), '')::uuid);

CREATE POLICY products_analyst ON products
    FOR SELECT TO analyst_ro
    USING (shop_id = NULLIF(current_setting('app.shop_id', true), '')::uuid);

CREATE POLICY customers_analyst ON customers
    FOR SELECT TO analyst_ro
    USING (shop_id = NULLIF(current_setting('app.shop_id', true), '')::uuid);

CREATE POLICY invoices_analyst ON invoices
    FOR SELECT TO analyst_ro
    USING (shop_id = NULLIF(current_setting('app.shop_id', true), '')::uuid);

CREATE POLICY invoice_items_analyst ON invoice_items
    FOR SELECT TO analyst_ro
    USING (shop_id = NULLIF(current_setting('app.shop_id', true), '')::uuid);

CREATE POLICY payments_analyst ON payments
    FOR SELECT TO analyst_ro
    USING (shop_id = NULLIF(current_setting('app.shop_id', true), '')::uuid);

CREATE POLICY return_allocations_analyst ON return_allocations
    FOR SELECT TO analyst_ro
    USING (shop_id = NULLIF(current_setting('app.shop_id', true), '')::uuid);

CREATE POLICY stock_ledger_analyst ON stock_ledger
    FOR SELECT TO analyst_ro
    USING (shop_id = NULLIF(current_setting('app.shop_id', true), '')::uuid);

CREATE POLICY expenses_analyst ON expenses
    FOR SELECT TO analyst_ro
    USING (shop_id = NULLIF(current_setting('app.shop_id', true), '')::uuid);

CREATE POLICY analyst_sql_cache_analyst ON analyst_sql_cache
    FOR SELECT TO analyst_ro
    USING (shop_id = NULLIF(current_setting('app.shop_id', true), '')::uuid);

CREATE POLICY analyst_traces_analyst ON analyst_traces
    FOR SELECT TO analyst_ro
    USING (shop_id = NULLIF(current_setting('app.shop_id', true), '')::uuid);

CREATE POLICY analyst_sql_cache_own ON analyst_sql_cache
    FOR ALL TO authenticated
    USING (shop_id = (SELECT auth.uid()))
    WITH CHECK (shop_id = (SELECT auth.uid()));

CREATE POLICY analyst_traces_own ON analyst_traces
    FOR ALL TO authenticated
    USING (shop_id = (SELECT auth.uid()))
    WITH CHECK (shop_id = (SELECT auth.uid()));
