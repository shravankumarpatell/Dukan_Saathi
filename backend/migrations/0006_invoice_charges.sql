-- Extra labeled charges on a sale (loading, transport, …).
-- Apply after 0005 on the direct Postgres connection (port 5432).

ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS extra_charges jsonb NOT NULL DEFAULT '[]'::jsonb;
