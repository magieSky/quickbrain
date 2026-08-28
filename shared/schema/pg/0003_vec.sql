-- 0003_vec.sql
-- Vector embeddings for semantic recall. Opt-in: notes without
-- embeddings simply have no row in notes_vec, and semanticSearch
-- falls back to FTS+ranking when the embedding service is not
-- configured / unreachable.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS notes_vec (
  note_id    BIGINT PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
  embedding  VECTOR(1024) NOT NULL,
  model      TEXT NOT NULL DEFAULT 'bge-m3',
  status     TEXT NOT NULL DEFAULT 'ok',
  error      TEXT,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_vec_embedding
  ON notes_vec USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_notes_vec_status
  ON notes_vec(status, updated_at);
