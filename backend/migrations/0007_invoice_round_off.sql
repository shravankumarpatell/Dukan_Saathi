-- Round-off adjustment on a sale (nearest rupee, cashier may override).
-- Apply after 0006 on the direct Postgres connection (port 5432).

ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS round_off numeric(12, 2) NOT NULL DEFAULT 0;
