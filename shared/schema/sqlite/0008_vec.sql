-- 0008_vec.sql
-- Vector embeddings for semantic recall. Optional: notes without
-- embeddings simply have no row in notes_vec, and vectorSearch() falls
-- back to the FTS+pinyin pipeline when the embedding provider is
-- not configured / unreachable.
--
-- Layout: vec0 uses its own rowid namespace (note_id aliased via notes_vec_meta
-- so we can also store model, status, last error etc). Distance metric defaults
-- to L2; for cosine use distance_cosine(vec0 0.1+).

CREATE VIRTUAL TABLE IF NOT EXISTS notes_vec USING vec0(
  embedding float[1024]
);

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
