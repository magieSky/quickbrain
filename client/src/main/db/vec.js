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

const fs = require('fs')
const sqliteVec = require('sqlite-vec')

let _loadError = null

function getLoadError() {
  return _loadError
}


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
    // vec.js's sqliteVec wrapper calls getLoadablePath() which uses
    // require.resolve(). In packaged Electron apps, that returns an
    // "app.asar\node_modules\...\vec0.dll" path. Windows LoadLibrary
    // does not understand the asar stream protocol, so we manually
    // rewrite the path to the unpacked variant when needed.
    const rawPath = sqliteVec.getLoadablePath()
    const asarIdx = rawPath.lastIndexOf('app.asar\\')
    const dllPath = asarIdx > 0
      ? rawPath.slice(0, asarIdx) + 'app.asar.unpacked' + rawPath.slice(asarIdx + 'app.asar'.length)
      : rawPath
    // asar-unpacked translation complete
    if (!fs.existsSync(dllPath)) {
      throw new Error('vec0.dll not found at ' + dllPath)
    }
    db.loadExtension(dllPath)
    _loadOk = true
    console.log('[vec] sqlite-vec loaded; dims=' + _expectedDims)
  } catch (e) {
    _loadOk = false
    _loadError = e.message
    console.warn('[vec] sqlite-vec load failed, semantic recall disabled:', e.message)
  }
  return _loadOk
}

function isLoaded() {
  return _loadOk
}

function upsertEmbedding(db, noteId, vec, model) {
  // Accept plain JS Array OR any TypedArray (Float32Array is the canonical
  // form better-sqlite3 binds to vec0's float[N] column).
  const isVec = vec && (Array.isArray(vec) || ArrayBuffer.isView(vec))
  if (!_loadOk) return false
  if (!noteId || !isVec || vec.length === 0) return false
  // sqlite-vec's vec0 rowid check refuses JS Number 閳?it expects a true
  // SQLITE_INTEGER, which better-sqlite3 binds from BigInt. Passing a
  // Number (even 36.0) triggers "Only integers are allows for primary
  // key values on notes_vec". Coerce to BigInt here so callers can
  // pass Number (from IPC payloads / search.js addNote) without thinking.
  const nid = (function (n) {
    if (typeof n === 'bigint') return n
    if (typeof n === 'number' && Number.isInteger(n)) return BigInt(n)
    if (typeof n === 'string' && /^\d+$/.test(n)) return BigInt(n)
    console.warn('[vec] skip upsert: non-integer noteId', typeof n, n)
    return null
  })(noteId)
  if (nid == null) return false
  if (vec.length !== _expectedDims) {
    console.warn('[vec] skip note', Number(nid), ': dim mismatch', vec.length, '!=', _expectedDims)
    return false
  }
  const f32 = vec instanceof Float32Array ? vec : new Float32Array(vec)
  const tx = db.transaction(() => {
    // vec0 has no UPSERT; mirror a write-or-replace via rowid.
    db.prepare('DELETE FROM notes_vec WHERE rowid = ?').run(nid)
    db.prepare('INSERT INTO notes_vec(rowid, embedding) VALUES (?, ?)').run(nid, f32)
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
    `).run(nid, model || 'bge-m3', _expectedDims, now)
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
  ensureLoaded, isLoaded, expectedDims, getLoadError, _loadError,
  upsertEmbedding, deleteEmbedding, markFailed, markPending,
  vectorSearch, countIndexed
}
