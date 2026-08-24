const crypto = require('crypto')

let _memo = null

/**
 * Process-local secret helper. Generates MASTER_KEY if env is missing
 * (dev convenience; in production the operator MUST set MASTER_KEY).
 *
 * Note: ADMIN_BOOTSTRAP_TOKEN is NEVER auto-generated. The operator must
 * set it explicitly before the first deploy, and call POST /v1/auth/register-admin
 * with it once. After that the token should be removed from env.
 */
function ensureSecrets() {
  if (_memo) return _memo
  const masterKey = process.env.MASTER_KEY
    ? Buffer.from(process.env.MASTER_KEY, 'hex')
    : crypto.randomBytes(32)
  _memo = { masterKey }
  if (!process.env.MASTER_KEY) console.log('[bootstrap] generated MASTER_KEY, persist it')
  return _memo
}

module.exports = { ensureSecrets }
