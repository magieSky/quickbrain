const bcrypt = require('bcryptjs')
const crypto = require('crypto')

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/
const MIN_PW = 6
const MAX_PW = 200

function newSecret() {
  // 32 random bytes -> base64url = 43 chars. Same role as the old OWNER_TOKEN.
  return crypto.randomBytes(32).toString('base64url')
}

function validateUsername(u) {
  return typeof u === 'string' && USERNAME_RE.test(u)
}

function validatePassword(p) {
  return typeof p === 'string' && p.length >= MIN_PW && p.length <= MAX_PW
}

async function getById(db, id) {
  if (!id) return null
  return db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirst()
}

async function getByUsername(db, username) {
  if (!username) return null
  return db.selectFrom('users').selectAll().where('username', '=', username).executeTakeFirst()
}

/**
 * Look up a user by the secret. Used by verifyBearer to find which user a request
 * belongs to. HMAC verification still needs the secret itself, so we keep
 * plaintext secret in DB (access-token semantics).
 */
async function getBySecret(db, secret) {
  if (!secret) return null
  return db.selectFrom('users').selectAll().where('secret', '=', secret).executeTakeFirst()
}

async function register(db, { username, password }, opts = {}) {
  if (!validateUsername(username)) return { ok: false, error: 'invalid-username' }
  if (!validatePassword(password)) return { ok: false, error: 'invalid-password' }
  const dupe = await getByUsername(db, username)
  if (dupe) return { ok: false, error: 'username-taken' }
  const now = Date.now()
  const secret = newSecret()
  const passwordHash = bcrypt.hashSync(password, 10)
  try {
    const row = await db.insertInto('users')
      .values({
        username,
        password_hash: passwordHash,
        secret,
        is_owner: opts.isOwner ? 1 : 0,
        created_at: now,
        updated_at: now
      })
      .returningAll()
      .executeTakeFirst()
    return { ok: true, user: row, secret }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

async function login(db, { username, password }) {
  if (!validateUsername(username)) return { ok: false, error: 'invalid-username' }
  if (!validatePassword(password)) return { ok: false, error: 'invalid-password' }
  const u = await getByUsername(db, username)
  if (!u) return { ok: false, error: 'invalid-credentials' }
  if (!bcrypt.compareSync(password, u.password_hash)) return { ok: false, error: 'invalid-credentials' }
  return { ok: true, user: u, secret: u.secret }
}

/**
 * Change password for a user. Rotates the secret so any leaked bearer becomes
 * invalid. Caller must supply the OLD password for confirmation.
 */
async function changePassword(db, userId, { oldPassword, newPassword }) {
  if (!validatePassword(newPassword)) return { ok: false, error: 'invalid-password' }
  const u = await getById(db, userId)
  if (!u) return { ok: false, error: 'no-such-user' }
  if (!bcrypt.compareSync(oldPassword, u.password_hash)) return { ok: false, error: 'wrong-password' }
  const newHash = bcrypt.hashSync(newPassword, 10)
  const newSecret = (function () { return crypto.randomBytes(32).toString('base64url') })()
  await db.updateTable('users')
    .set({ password_hash: newHash, secret: newSecret, updated_at: Date.now() })
    .where('id', '=', userId)
    .execute()
  return { ok: true, secret: newSecret }
}

/**
 * Rotate only the secret (token leak recovery). Owner can be rotated without
 * old password (assumes server admin access).
 */
async function rotateSecret(db, userId) {
  const newSecret_ = newSecret()
  await db.updateTable('users')
    .set({ secret: newSecret_, updated_at: Date.now() })
    .where('id', '=', userId)
    .execute()
  return newSecret_
}

module.exports = {
  validateUsername, validatePassword, newSecret,
  getById, getByUsername, getBySecret,
  register, login, changePassword, rotateSecret
}
