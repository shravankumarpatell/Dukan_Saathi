-- Private link for a bill. The PDF is rebuilt when the link is opened; nothing is stored.
-- Apply after 0007 on the direct Postgres connection (port 5432).

ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS share_token text;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_share_token_key
    ON invoices (share_token);
