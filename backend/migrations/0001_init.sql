-- DukanSaathi initial schema (Supabase Postgres).
-- Apply in the Supabase SQL editor (or `psql $DATABASE_URL -f migrations/0001_init.sql`).
-- Fresh start: no Firestore data is migrated.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE shops (
    id uuid PRIMARY KEY,
    name text NOT NULL DEFAULT '',
    owner_name text NOT NULL DEFAULT '',
    phone text NOT NULL DEFAULT '',
    address text NOT NULL DEFAULT '',
    gst_enabled boolean NOT NULL DEFAULT true,
    gstin text NOT NULL DEFAULT '',
    invoice_seq integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'auth' AND table_name = 'users'
    ) THEN
        ALTER TABLE shops
            DROP CONSTRAINT IF EXISTS shops_id_fkey;
        ALTER TABLE shops
            ADD CONSTRAINT shops_id_fkey
            FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE TABLE products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES shops (id) ON DELETE CASCADE,
    name text NOT NULL,
    code text NOT NULL DEFAULT '',
    company text NOT NULL DEFAULT '',
    size text NOT NULL DEFAULT '',
    unit text NOT NULL DEFAULT 'box' CHECK (unit IN ('box', 'piece')),
    pieces_per_box integer NOT NULL DEFAULT 1 CHECK (pieces_per_box >= 1),
    sell_price numeric(12, 2) NOT NULL DEFAULT 0 CHECK (sell_price >= 0),
    stock_qty numeric(12, 2) NOT NULL DEFAULT 0,
    low_stock_threshold integer NOT NULL DEFAULT 10 CHECK (low_stock_threshold >= 0)
);

CREATE TABLE customers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES shops (id) ON DELETE CASCADE,
    name text NOT NULL,
    phone text NOT NULL DEFAULT '',
    is_contractor boolean NOT NULL DEFAULT false,
    site_note text NOT NULL DEFAULT '',
    total_pending numeric(12, 2) NOT NULL DEFAULT 0,
    store_credit numeric(12, 2) NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX customers_shop_name_lower
    ON customers (shop_id, lower(name));

CREATE TABLE invoices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES shops (id) ON DELETE CASCADE,
    invoice_no text NOT NULL,
    date timestamptz NOT NULL DEFAULT now(),
    bill_date date GENERATED ALWAYS AS ((date AT TIME ZONE 'Asia/Kolkata')::date) STORED,
    type text NOT NULL CHECK (type IN ('sale', 'purchase', 'return')),
    customer_id uuid REFERENCES customers (id) ON DELETE SET NULL,
    customer_name text NOT NULL DEFAULT '',
    customer_phone text NOT NULL DEFAULT '',
    is_contractor boolean NOT NULL DEFAULT false,
    site_note text NOT NULL DEFAULT '',
    discount_type text CHECK (discount_type IS NULL OR discount_type IN ('flat', 'percent')),
    discount_value numeric(12, 2),
    gst_enabled boolean NOT NULL DEFAULT false,
    gst_rate numeric(12, 2) NOT NULL DEFAULT 0,
    subtotal numeric(12, 2) NOT NULL DEFAULT 0,
    discount_off numeric(12, 2) NOT NULL DEFAULT 0,
    gst_amount numeric(12, 2) NOT NULL DEFAULT 0,
    grand_total numeric(12, 2) NOT NULL DEFAULT 0,
    amount_paid numeric(12, 2) NOT NULL DEFAULT 0,
    amount_pending numeric(12, 2) NOT NULL DEFAULT 0,
    payment_status text NOT NULL DEFAULT '',
    created_via text NOT NULL DEFAULT 'manual',
    settlement text CHECK (settlement IS NULL OR settlement IN ('cash', 'adjust_udhari', 'store_credit')),
    settlement_cash numeric(12, 2) NOT NULL DEFAULT 0,
    settlement_udhari numeric(12, 2) NOT NULL DEFAULT 0,
    settlement_store_credit numeric(12, 2) NOT NULL DEFAULT 0,
    settlement_converted_at timestamptz,
    original_invoice_id uuid REFERENCES invoices (id) ON DELETE SET NULL,
    original_invoice_no text,
    refund_total numeric(12, 2),
    UNIQUE (shop_id, invoice_no)
);

CREATE TABLE invoice_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES shops (id) ON DELETE CASCADE,
    invoice_id uuid NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
    line_no integer NOT NULL DEFAULT 0,
    product_id uuid NOT NULL REFERENCES products (id),
    name text NOT NULL DEFAULT '',
    qty numeric(12, 4) NOT NULL DEFAULT 0,
    pieces numeric(12, 4) NOT NULL DEFAULT 0,
    unit text NOT NULL DEFAULT 'box',
    rate numeric(12, 2) NOT NULL DEFAULT 0,
    pieces_per_box integer NOT NULL DEFAULT 1,
    size text NOT NULL DEFAULT ''
);

CREATE TABLE payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES shops (id) ON DELETE CASCADE,
    invoice_id uuid NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
    mode text NOT NULL CHECK (mode IN ('cash', 'online', 'credit', 'return_adjust')),
    amount numeric(12, 2) NOT NULL DEFAULT 0,
    date timestamptz NOT NULL DEFAULT now(),
    return_invoice_no text
);

CREATE TABLE return_allocations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES shops (id) ON DELETE CASCADE,
    return_invoice_id uuid NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
    sale_invoice_id uuid REFERENCES invoices (id) ON DELETE SET NULL,
    sale_invoice_no text,
    amount numeric(12, 2) NOT NULL DEFAULT 0
);

CREATE TABLE stock_ledger (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES shops (id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES products (id),
    change numeric(12, 4) NOT NULL,
    reason text NOT NULL CHECK (reason IN ('sale', 'purchase', 'return')),
    invoice_id uuid REFERENCES invoices (id) ON DELETE SET NULL,
    timestamp timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE expenses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES shops (id) ON DELETE CASCADE,
    amount numeric(12, 2) NOT NULL CHECK (amount > 0),
    note text NOT NULL DEFAULT '',
    mode text NOT NULL DEFAULT 'cash' CHECK (mode IN ('cash', 'online')),
    date timestamptz NOT NULL DEFAULT now()
);

CREATE VIEW v_returns AS
    SELECT * FROM invoices WHERE type = 'return';

CREATE INDEX invoices_shop_bill_date ON invoices (shop_id, bill_date);
CREATE INDEX invoices_shop_date ON invoices (shop_id, date DESC);
CREATE INDEX invoices_shop_customer ON invoices (shop_id, customer_id);
CREATE INDEX invoices_original_no ON invoices (shop_id, original_invoice_no);
CREATE INDEX invoice_items_invoice ON invoice_items (invoice_id);
CREATE INDEX payments_invoice ON payments (invoice_id);
CREATE INDEX payments_shop_date ON payments (shop_id, date);
CREATE INDEX products_shop ON products (shop_id);
CREATE INDEX customers_shop ON customers (shop_id);
CREATE INDEX expenses_shop_date ON expenses (shop_id, date);
CREATE INDEX stock_ledger_shop ON stock_ledger (shop_id, timestamp);

-- Row-level security: FastAPI uses the service role (bypasses RLS).
-- Policies protect the PostgREST / anon key path if it is ever enabled.
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE shops FORCE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers FORCE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items FORCE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
ALTER TABLE return_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_allocations FORCE ROW LEVEL SECURITY;
ALTER TABLE stock_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_ledger FORCE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses FORCE ROW LEVEL SECURITY;

CREATE POLICY shops_own ON shops
    FOR ALL TO authenticated
    USING (id = (SELECT auth.uid()))
    WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY products_own ON products
    FOR ALL TO authenticated
    USING (shop_id = (SELECT auth.uid()))
    WITH CHECK (shop_id = (SELECT auth.uid()));

CREATE POLICY customers_own ON customers
    FOR ALL TO authenticated
    USING (shop_id = (SELECT auth.uid()))
    WITH CHECK (shop_id = (SELECT auth.uid()));

CREATE POLICY invoices_own ON invoices
    FOR ALL TO authenticated
    USING (shop_id = (SELECT auth.uid()))
    WITH CHECK (shop_id = (SELECT auth.uid()));

CREATE POLICY invoice_items_own ON invoice_items
    FOR ALL TO authenticated
    USING (shop_id = (SELECT auth.uid()))
    WITH CHECK (shop_id = (SELECT auth.uid()));

CREATE POLICY payments_own ON payments
    FOR ALL TO authenticated
    USING (shop_id = (SELECT auth.uid()))
    WITH CHECK (shop_id = (SELECT auth.uid()));

CREATE POLICY return_allocations_own ON return_allocations
    FOR ALL TO authenticated
    USING (shop_id = (SELECT auth.uid()))
    WITH CHECK (shop_id = (SELECT auth.uid()));

CREATE POLICY stock_ledger_own ON stock_ledger
    FOR ALL TO authenticated
    USING (shop_id = (SELECT auth.uid()))
    WITH CHECK (shop_id = (SELECT auth.uid()));

CREATE POLICY expenses_own ON expenses
    FOR ALL TO authenticated
    USING (shop_id = (SELECT auth.uid()))
    WITH CHECK (shop_id = (SELECT auth.uid()));
