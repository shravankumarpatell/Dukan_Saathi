-- Slab / stone measurement billing: vehicle on the invoice, L×W grid on lines.
-- Apply after 0004_product_uom.sql. Historical tile lines keep empty measurements.

ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS vehicle_no text NOT NULL DEFAULT '';

ALTER TABLE invoice_items
    ADD COLUMN IF NOT EXISTS lot_no text NOT NULL DEFAULT '';

ALTER TABLE invoice_items
    ADD COLUMN IF NOT EXISTS measure_unit text NOT NULL DEFAULT 'ft';

ALTER TABLE invoice_items
    ADD COLUMN IF NOT EXISTS area_unit text NOT NULL DEFAULT 'sqft';

ALTER TABLE invoice_items
    ADD COLUMN IF NOT EXISTS measurements jsonb NOT NULL DEFAULT '[]'::jsonb;
