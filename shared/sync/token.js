const crypto = require('crypto')

function hmac(key, msg) { return crypto.createHmac('sha256', key).update(msg).digest() }

function encode({ deviceId, token }) {
  if (!deviceId || !token) throw new Error('deviceId and token required')
  const a = Buffer.from(deviceId, 'utf8').toString('base64url')
  const m = hmac(token, deviceId)
  const b = Buffer.from(m).toString('base64url')
  return a + '.' + b
}

function verify({ bearer, deviceId, token }) {
  if (!bearer || !deviceId || !token) return false
  const [a, b] = String(bearer).split('.')
  if (!a || !b) return false
  let deviceIdBytes, macBytes
  try {
    deviceIdBytes = Buffer.from(a, 'base64url').toString('utf8')
    macBytes = Buffer.from(b, 'base64url')
  } catch { return false }
  if (deviceIdBytes !== deviceId) return false
  const expected = hmac(token, deviceId)
  if (expected.length !== macBytes.length) return false
  return crypto.timingSafeEqual(expected, macBytes)
}

function decodeBearerDeviceId(bearer) {
  if (!bearer || typeof bearer !== "string") return null
  const parts = bearer.split(".")
  if (parts.length !== 2) return null
  const [a] = parts
  let decoded
  try { decoded = Buffer.from(a, "base64url").toString("utf8") } catch { return null }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded)) return null
  return decoded
}

module.exports = { encode, verify, decodeBearerDeviceId }