const crypto = require('crypto')

function encrypt(plaintext, masterKey) {
  if (!Buffer.isBuffer(masterKey) || masterKey.length !== 32) throw new Error('masterKey must be 32 bytes')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv)
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return { iv: iv.toString('base64'), ct: enc.toString('base64'), tag: tag.toString('base64') }
}

function decrypt({ iv, ct, tag }, masterKey) {
  if (!Buffer.isBuffer(masterKey) || masterKey.length !== 32) throw new Error('masterKey must be 32 bytes')
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  const dec = Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()])
  return dec.toString('utf8')
}

function tryDecrypt(payload, masterKey) {
  if (!payload) return null
  try { return decrypt(payload, masterKey) } catch (_) { return null }
}

module.exports = { encrypt, decrypt, tryDecrypt }