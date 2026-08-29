-- 0009_vec_table.sql
-- Vector index for semantic recall. Requires the sqlite-vec extension to be
-- loaded first; db-init.js calls vec.ensureLoaded() before applyAll() and
-- adds this filename to skipFiles when the load fails, so a missing/broken
-- sqlite-vec build will silently downgrade to FTS+pinyin search instead
-- of crashing the main process.

CREATE VIRTUAL TABLE IF NOT EXISTS notes_vec USING vec0(
  embedding float[1024]
);
