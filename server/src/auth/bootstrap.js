const crypto = require('crypto')

let _memo = null

function ensureSecrets() {
  if (_memo) return _memo
  const masterKey = process.env.MASTER_KEY
    ? Buffer.from(process.env.MASTER_KEY, 'hex')
    : crypto.randomBytes(32)
  const ownerToken = process.env.OWNER_TOKEN || crypto.randomBytes(24).toString('base64url')
  _memo = { masterKey, ownerToken }
  if (!process.env.OWNER_TOKEN) console.log('[bootstrap] OWNER_TOKEN=' + ownerToken)
  if (!process.env.MASTER_KEY) console.log('[bootstrap] generated MASTER_KEY, persist it')
  return _memo
}

module.exports = { ensureSecrets }