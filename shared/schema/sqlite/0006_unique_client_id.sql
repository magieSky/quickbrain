-- 0006_unique_client_id.sql: enforce one-row-per-client_id for sync merge
CREATE UNIQUE INDEX IF NOT EXISTS uniq_notes_client_id ON notes(client_id) WHERE client_id IS NOT NULL;
