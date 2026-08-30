-- Store-credit conversion receipt: how much credit moved, and to cash vs udhari.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS settlement_converted_amount numeric(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS settlement_converted_to text;

ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS invoices_settlement_converted_to_check;

ALTER TABLE invoices
  ADD CONSTRAINT invoices_settlement_converted_to_check
  CHECK (settlement_converted_to IS NULL OR settlement_converted_to IN ('cash', 'adjust_udhari'));
