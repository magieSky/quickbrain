/**
 * sqlite-vec wrapper.
 *
 * Provides:
 *   - ensureLoaded(db)            load the vec0 extension once per db
 *   - upsertEmbedding(db, noteId, vec, model)
 *   - deleteEmbedding(db, noteId)
 *   - vectorSearch(db, queryVec, k)  returns [{note_id, distance}]
 *   - countIndexed(db)            for diagnostics
 *
 * All operations are best-effort: if sqlite-vec is missing or the extension
 * load fails (e.g. running outside Electron, or the platform package was
 * not installed), the wrapper logs a warning and turns into a no-op so the
 * rest of the app keeps working without semantic recall.
 */

const sqliteVec = require('sqlite-vec')

const FALLBACK_DIMS = 1024
let _loadTried = false
let _loadOk = false
let _expectedDims = FALLBACK_DIMS

function expectedDims() {
  return _expectedDims
}

function ensureLoaded(db, dims) {
  if (dims && Number.isInteger(dims) && dims > 0) _expectedDims = dims
  if (_loadTried) return _loadOk
  _loadTried = true
  try {
    sqliteVec.load(db)
    _loadOk = true
    console.log('[vec] sqlite-vec loaded; dims=' + _expectedDims)
  } catch (e) {
    _loadOk = false
    console.warn('[vec] sqlite-vec load failed, semantic recall disabled:', e.message)
  }
  return _loadOk
}

function isLoaded() {
  return _loadOk
}

function upsertEmbedding(db, noteId, vec, model) {
  if (!_loadOk) return false
  if (!noteId || !Array.isArray(vec) || vec.length === 0) return false
  if (vec.length !== _expectedDims) {
    console.warn('[vec] skip note', noteId, ': dim mismatch', vec.length, '!=', _expectedDims)
    return false
  }
  const f32 = vec instanceof Float32Array ? vec : new Float32Array(vec)
  const tx = db.transaction(() => {
    // vec0 has no UPSERT; mirror a write-or-replace via rowid.
    db.prepare('DELETE FROM notes_vec WHERE rowid = ?').run(noteId)
    db.prepare('INSERT INTO notes_vec(rowid, embedding) VALUES (?, ?)').run(noteId, f32)
    const now = Date.now()
    db.prepare(`
      INSERT INTO notes_vec_meta(note_id, model, dims, updated_at, status, error)
      VALUES (?, ?, ?, ?, 'ok', NULL)
      ON CONFLICT(note_id) DO UPDATE SET
        model = excluded.model,
        dims = excluded.dims,
        updated_at = excluded.updated_at,
        status = 'ok',
        error = NULL
    `).run(noteId, model || 'bge-m3', _expectedDims, now)
  })
  tx()
  return true
}

function deleteEmbedding(db, noteId) {
  if (!_loadOk) return
  if (!noteId) return
  db.prepare('DELETE FROM notes_vec WHERE rowid = ?').run(noteId)
  db.prepare('DELETE FROM notes_vec_meta WHERE note_id = ?').run(noteId)
}

function markFailed(db, noteId, error) {
  const now = Date.now()
  db.prepare(`
    INSERT INTO notes_vec_meta(note_id, model, dims, updated_at, status, error)
    VALUES (?, 'bge-m3', ?, ?, 'failed', ?)
    ON CONFLICT(note_id) DO UPDATE SET
      updated_at = excluded.updated_at,
      status = 'failed',
      error = excluded.error
  `).run(noteId, _expectedDims, now, (error || '').slice(0, 200))
}

function markPending(db, noteId) {
  const now = Date.now()
  db.prepare(`
    INSERT INTO notes_vec_meta(note_id, model, dims, updated_at, status)
    VALUES (?, 'bge-m3', ?, ?, 'pending')
    ON CONFLICT(note_id) DO UPDATE SET
      updated_at = excluded.updated_at,
      status = 'pending',
      error = NULL
  `).run(noteId, _expectedDims, now)
}

/**
 * Top-K nearest neighbours for the given query vector.
 * Returns [] when sqlite-vec is not loaded or vec has wrong dim.
 */
function vectorSearch(db, queryVec, k) {
  if (!_loadOk) return []
  if (!Array.isArray(queryVec) || queryVec.length !== _expectedDims) return []
  const limit = Math.max(1, Math.min(parseInt(k, 10) || 20, 200))
  const f32 = queryVec instanceof Float32Array ? queryVec : new Float32Array(queryVec)
  const rows = db.prepare(`
    SELECT rowid AS note_id, distance
    FROM notes_vec
    WHERE embedding MATCH ?
    ORDER BY distance
    LIMIT ?
  `).all(f32, limit)
  return rows
}

function countIndexed(db) {
  if (!_loadOk) return 0
  return db.prepare("SELECT COUNT(*) AS c FROM notes_vec_meta WHERE status = 'ok'").get().c
}

module.exports = {
  ensureLoaded, isLoaded, expectedDims,
  upsertEmbedding, deleteEmbedding, markFailed, markPending,
  vectorSearch, countIndexed
}
