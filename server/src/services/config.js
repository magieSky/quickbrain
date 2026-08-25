// Generated: Kysely-compatible config service for Postgres.
// Original SQLite-only version replaced; no migration needed (config table was never populated under PG).

const { encrypt, decrypt } = require('../auth/crypto')

const SCHEMA_VERSION = 0x01

function serialize(plaintext, masterKey) {
  const encObj = encrypt(plaintext, masterKey)
  const iv = Buffer.from(encObj.iv, 'base64')
  const tag = Buffer.from(encObj.tag, 'base64')
  const ct = Buffer.from(encObj.ct, 'base64')
  const out = Buffer.alloc(1 + iv.length + tag.length + ct.length)
  out[0] = SCHEMA_VERSION
  iv.copy(out, 1)
  tag.copy(out, 1 + iv.length)
  ct.copy(out, 1 + iv.length + tag.length)
  return out
}

function deserialize(blob, masterKey) {
  if (!blob || blob.length < 1 + 12 + 16) return null
  if (blob[0] !== SCHEMA_VERSION) return null
  const iv = blob.subarray(1, 13)
  const tag = blob.subarray(13, 29)
  const ct = blob.subarray(29)
  const encObj = { iv: iv.toString('base64'), tag: tag.toString('base64'), ct: ct.toString('base64') }
  try { return decrypt(encObj, masterKey) } catch (_) { return null }
}

function normalize(db) {
  // Some call sites pass a Kysely instance; some legacy code may pass raw better-sqlite3.
  // Detect by presence of selectFrom (Kysely).
  if (typeof db.selectFrom === 'function') return db
  if (db && db.client && db.client.constructor && db.client.constructor.name === 'Client') return db
  return null
}

async function ensureSchema(db) {
  // Postgres schema lives in shared/schema/pg/0001_init.sql — table already created on bootstrap.
  // This function is kept for API compatibility with SQLite callers (e.g. tests).
  const k = normalize(db)
  if (k) return
  if (db && typeof db.exec === 'function') {
    db.exec(`CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      iv TEXT NOT NULL,
      ct TEXT NOT NULL,
      tag TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`)
  }
}

async function get(db, key, masterKey) {
  const k = normalize(db)
  if (!k) return null
  try {
    const row = await k.selectFrom('config').select('value_enc').where('key', '=', key).executeTakeFirst()
    if (!row || !row.value_enc) return null
    const buf = Buffer.isBuffer(row.value_enc) ? row.value_enc : Buffer.from(row.value_enc)
    return deserialize(buf, masterKey)
  } catch (_) { return null }
}

async function set(db, key, value, masterKey) {
  const k = normalize(db)
  if (!k) throw new Error('kysely-required')
  const blob = serialize(value, masterKey)
  const ts = Date.now()
  await k.insertInto('config').values({ key, value_enc: blob, updated_at: ts })
    .onConflict(oc => oc.column('key').doUpdateSet({ value_enc: blob, updated_at: ts }))
    .execute()
  return ts
}

async function list(db) {
  const k = normalize(db)
  if (!k) return []
  try { return await k.selectFrom('config').select('key').select('updated_at').orderBy('key').execute() }
  catch (_) { return [] }
}

async function remove(db, key) {
  const k = normalize(db)
  if (!k) return 0
  try {
    const r = await k.deleteFrom('config').where('key', '=', key).execute()
    return r.length || r.numDeletedRows || 0
  } catch (_) { return 0 }
}

module.exports = { ensureSchema, get, set, list, remove, serialize, deserialize }
