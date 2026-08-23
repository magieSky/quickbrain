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

function verifyBearer(headers) {
  const ex = extract(headers)
  if (!ex.ok) return ex
  const ownerToken = process.env.OWNER_TOKEN
  if (!ownerToken) return { ok: false, reason: 'server-not-bootstrapped' }
  const verified = token.verify({ bearer: ex.bearer, deviceId: ex.deviceId, token: ownerToken })
  if (!verified) return { ok: false, reason: 'hmac-mismatch' }
  return { ok: true, deviceId: ex.deviceId }
}

module.exports = { verifyBearer }