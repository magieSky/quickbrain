const users = require('../services/users')
const token = require('@quickbrain/shared/sync/token')

function extract(headers) {
  const h = headers || {}
  const auth = h.authorization || h.Authorization
  const dev = h['x-qb-device'] || h['X-QB-Device']
  if (!auth || typeof auth !== 'string') return { ok: false, reason: 'missing-auth' }
  const m = auth.match(/^Bearer\s+(.+)$/)
  if (!m) return { ok: false, reason: 'bad-auth-format' }
  if (!dev) return { ok: false, reason: 'missing-device' }
  return { ok: true, bearer: m[1], deviceId: dev }
}

/**
 * Multi-tenant bearer verification.
 *
 * Flow:
 *  1. Parse Authorization header + X-QB-Device.
 *  2. Decode bearer -> deviceId (must match header).
 *  3. Server stores users with a per-user `secret` (HMAC key). To verify a
 *     signature we need the original secret, so we keep it retrievable.
 *     Lookup strategy: bearer signature is HMAC(secret, deviceId); we don't
 *     know the secret a priori, so we look up candidates by `deviceId` hint
 *     (each user only has a few devices), or fall back to scanning all users.
 *     For simplicity v1 scans all users with this deviceId in their device
 *     list (TODO: per-device registration).
 *
 *     v2 short-circuit: if a `X-QB-User` header is supplied (login-bound
 *     calls from web/admin), we look up by username directly.
 *
 * Returns { ok, userId, username, deviceId } on success.
 */
async function verifyBearer(db, headers) {
  const ex = extract(headers)
  if (!ex.ok) return ex
  const usernameHint = (headers['x-qb-user'] || headers['X-QB-User'] || '').toString().trim() || null

  let candidates = []
  if (usernameHint) {
    const u = await users.getByUsername(db, usernameHint)
    if (u) candidates = [u]
  } else {
    // v1 fallback: try every user. Cheap at small scale; safe even at 1k users.
    candidates = await db.selectFrom('users').selectAll().execute()
  }

  for (const u of candidates) {
    if (token.verify({ bearer: ex.bearer, deviceId: ex.deviceId, token: u.secret })) {
      return { ok: true, userId: u.id, username: u.username, deviceId: ex.deviceId }
    }
  }
  return { ok: false, reason: 'hmac-mismatch' }
}

module.exports = { verifyBearer, extract }
