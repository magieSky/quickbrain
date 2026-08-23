import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import token from '../shared/sync/token.js'

describe('shared/sync/token', () => {
  it('encode + verify roundtrip', () => {
    const deviceId = crypto.randomUUID()
    const token0 = 'b'.repeat(32)
    const bearer = token.encode({ deviceId, token: token0 })
    expect(bearer.split('.').length).toBe(2)
    expect(token.verify({ bearer, deviceId, token: token0 })).toBe(true)
  })

  it('verify rejects wrong device_id', () => {
    const deviceId = crypto.randomUUID(); const token0 = 'c'.repeat(32)
    const bearer = token.encode({ deviceId, token: token0 })
    expect(token.verify({ bearer, deviceId: 'other', token: token0 })).toBe(false)
  })

  it('verify rejects tampered HMAC', () => {
    const deviceId = crypto.randomUUID(); const token0 = 'd'.repeat(32)
    const bearer = token.encode({ deviceId, token: token0 })
    const [a] = bearer.split('.')
    const tampered = a + '.' + Buffer.from('zzz').toString('base64url')
    expect(token.verify({ bearer: tampered, deviceId, token: token0 })).toBe(false)
  })

  it('decodeBearerDeviceId extracts the deviceId from a valid bearer', () => {
    const deviceId = crypto.randomUUID()
    const bearer = token.encode({ deviceId, token: 'e'.repeat(32) })
    expect(token.decodeBearerDeviceId(bearer)).toBe(deviceId)
  })

  it('decodeBearerDeviceId returns null for malformed input', () => {
    expect(token.decodeBearerDeviceId(null)).toBeNull()
    expect(token.decodeBearerDeviceId('nope')).toBeNull()
  })
})