const { encrypt, decrypt } = require('../auth/crypto')

function ensureSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    iv TEXT NOT NULL,
    ct TEXT NOT NULL,
    tag TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`)
}

function get(db, key, masterKey) {
  const row = db.prepare('SELECT iv, ct, tag FROM config WHERE key = ?').get(key)
  if (!row) return null
  try { return decrypt({ iv: row.iv, ct: row.ct, tag: row.tag }, masterKey) } catch (_) { return null }
}

function set(db, key, value, masterKey) {
  const enc = encrypt(value, masterKey)
  const ts = Date.now()
  db.prepare(`INSERT INTO config (key, iv, ct, tag, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET iv = excluded.iv, ct = excluded.ct, tag = excluded.tag, updated_at = excluded.updated_at`)
    .run(key, enc.iv, enc.ct, enc.tag, ts)
  return ts
}

function list(db) {
  return db.prepare('SELECT key, updated_at FROM config ORDER BY key ASC').all()
}

function remove(db, key) {
  const r = db.prepare('DELETE FROM config WHERE key = ?').run(key)
  return r.changes || 0
}

module.exports = { ensureSchema, get, set, list, remove }