-- Product-level unit master: 18 units, category, allowed_units, pack_qty.
-- Apply after 0003_settlement_converted.sql.

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_unit_check;

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'tiles';

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS allowed_units jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS pack_qty numeric(12, 4) NOT NULL DEFAULT 1;

ALTER TABLE products
    ALTER COLUMN stock_qty TYPE numeric(12, 4);

ALTER TABLE invoice_items
    ADD COLUMN IF NOT EXISTS product_unit text NOT NULL DEFAULT 'box';

ALTER TABLE invoice_items
    ADD COLUMN IF NOT EXISTS pack_qty numeric(12, 4) NOT NULL DEFAULT 1;

ALTER TABLE invoice_items
    ADD COLUMN IF NOT EXISTS price_qty numeric(12, 4) NOT NULL DEFAULT 0;

UPDATE products
SET
    category = CASE WHEN unit = 'piece' THEN 'sanitaryware' ELSE 'tiles' END,
    allowed_units = CASE
        WHEN unit = 'piece' THEN '["piece"]'::jsonb
        ELSE '["box", "piece", "sqft"]'::jsonb
    END
WHERE allowed_units = '[]'::jsonb
   OR allowed_units IS NULL;

UPDATE invoice_items
SET
    product_unit = CASE WHEN unit = 'piece' THEN 'piece' ELSE 'box' END,
    price_qty = CASE
        WHEN unit = 'piece' THEN qty
        ELSE qty + (pieces / NULLIF(pieces_per_box, 0))
    END
WHERE COALESCE(price_qty, 0) = 0;

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_unit_check;
ALTER TABLE products
    ADD CONSTRAINT products_unit_check CHECK (unit IN (
        'piece', 'box', 'set', 'sqft', 'sqm', 'mtr', 'rft', 'ft', 'inch',
        'kg', 'gm', 'litre', 'bag', 'pack', 'bundle', 'slab', 'roll', 'pair'
    ));

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_category_check;
ALTER TABLE products
    ADD CONSTRAINT products_category_check CHECK (category IN (
        'tiles', 'sanitaryware', 'plumbing_fittings', 'bathroom_accessories',
        'bathtubs_shower', 'natural_stone', 'engineered_stone', 'kitchen',
        'tile_installation', 'laying_accessories', 'flooring_alternatives',
        'bathroom_furniture', 'water_utility', 'plumbing_construction', 'hardware'
    ));

-- CREATE OR REPLACE cannot insert columns in the middle of a view.
-- v_product_sales reads v_invoice_lines, so drop it first.
DROP VIEW IF EXISTS v_product_sales;
DROP VIEW IF EXISTS v_invoice_lines;

-- Line amount uses persisted price_qty (qty in the product's priced unit).
-- Old box/piece rows were backfilled above so this matches calc.item_amount.
CREATE VIEW v_invoice_lines AS
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
    ii.product_unit,
    ii.price_qty,
    ROUND((ii.price_qty * ii.rate)::numeric, 2) AS line_amount,
    i.grand_total,
    i.amount_pending,
    i.payment_status
FROM invoice_items ii
JOIN invoices i ON i.id = ii.invoice_id
LEFT JOIN products p ON p.id = ii.product_id;

CREATE VIEW v_product_sales AS
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

DO $$
BEGIN
    BEGIN
        EXECUTE 'ALTER VIEW v_invoice_lines SET (security_invoker = true)';
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
    BEGIN
        EXECUTE 'ALTER VIEW v_product_sales SET (security_invoker = true)';
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
    BEGIN
        EXECUTE 'GRANT SELECT ON v_invoice_lines TO analyst_ro';
        EXECUTE 'GRANT SELECT ON v_product_sales TO analyst_ro';
    EXCEPTION WHEN undefined_object THEN
        NULL;
    END;
END $$;
