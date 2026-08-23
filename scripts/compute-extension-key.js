const crypto = require('crypto')
const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const spki = publicKey.export({ format: 'der', type: 'spki' })
const b64 = spki.toString('base64')
const sha = crypto.createHash('sha256').update(spki).digest()
let id = ''
for (let i = 0; i < 32; i++) id += String.fromCharCode(97 + (sha[i] & 0x0f))
console.log(b64)
console.log(id)