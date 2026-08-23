-- 0002_client_id.sql: stable per-note merge key for sync
ALTER TABLE notes ADD COLUMN client_id TEXT;