const crypto = require('crypto')
const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwk = publicKey.export({ format: 'jwk' })
const n = jwk.n
// Convert base64url to BigInt
const b64 = n.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((n.length + 3) % 4)
const hex = Buffer.from(b64, 'base64').toString('hex')
const big = BigInt('0x' + hex)
console.log(big.toString(10))