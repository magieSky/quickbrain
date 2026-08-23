const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

// Chrome 扩展 ID = SHA256(SPKI DER) 前 16 字节，每字节高/低半字节映射到 'a'..'p'
// 参考 chromium/src/extensions/common/extension_id.cc
function deriveId(spkiBuf) {
  const sha = crypto.createHash('sha256').update(spkiBuf).digest()
  let id = ''
  for (let i = 0; i < 16; i++) {
    id += String.fromCharCode(97 + ((sha[i] >> 4) & 0x0f))
    id += String.fromCharCode(97 + (sha[i] & 0x0f))
  }
  return id
}

const KEY_FILE = path.join(__dirname, '..', 'extension', '.key.txt')

let b64
if (fs.existsSync(KEY_FILE)) {
  b64 = fs.readFileSync(KEY_FILE, 'utf8').trim()
} else {
  const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
  const spki = publicKey.export({ format: 'der', type: 'spki' })
  b64 = spki.toString('base64')
  fs.writeFileSync(KEY_FILE, b64 + '\n')
  console.error('[qb] generated new keypair -> ' + KEY_FILE)
}

const spki = Buffer.from(b64, 'base64')
const id = deriveId(spki)

console.log(b64)
console.log(id)