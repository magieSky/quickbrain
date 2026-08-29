-- 0008_vec_meta.sql
-- Metadata table for vector embeddings. Kept separate from the vec0 virtual
-- table so this migration always runs, even on installs where sqlite-vec
-- could not be loaded (e.g. the platform-specific binding is missing or
-- the embedding provider is not configured). The corresponding vec0
-- virtual-table migration is gated by vec.isLoaded() at db-init time.

CREATE TABLE IF NOT EXISTS notes_vec_meta (
  note_id     INTEGER PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
  model       TEXT NOT NULL DEFAULT 'bge-m3',
  dims        INTEGER NOT NULL DEFAULT 1024,
  updated_at  INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'ok',   -- ok | pending | failed
  error       TEXT
);

CREATE INDEX IF NOT EXISTS idx_notes_vec_meta_status
  ON notes_vec_meta(status, updated_at);
