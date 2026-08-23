import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import crypto from 'node:crypto'
import path from 'node:path'
import tokenMod from '../shared/sync/token.js'

const url = 'file:///' + path.resolve('server/src/auth/hmac.js').replace(/\\/g, '/')

describe('server auth hmac', () => {
  let originalEnv
  beforeEach(() => {
    originalEnv = { ...process.env }
    process.env.OWNER_TOKEN = 'e'.repeat(32)
  })
  afterEach(() => {
    for (const k of Object.keys(process.env)) if (!(k in originalEnv)) delete process.env[k]
    for (const k of Object.keys(originalEnv)) process.env[k] = originalEnv[k]
  })

  it('accepts a valid bearer + matching device header', async () => {
    const deviceId = crypto.randomUUID()
    const bearer = tokenMod.encode({ deviceId, token: process.env.OWNER_TOKEN })
    const mod = await import(url + '?t=' + Date.now())
    expect(mod.verifyBearer({ authorization: 'Bearer ' + bearer, 'x-qb-device': deviceId })).toEqual({ ok: true, deviceId })
  })

  it('rejects mismatched device id', async () => {
    const deviceId = crypto.randomUUID()
    const bearer = tokenMod.encode({ deviceId, token: process.env.OWNER_TOKEN })
    const mod = await import(url + '?t=' + (Date.now() + 1))
    const r = mod.verifyBearer({ authorization: 'Bearer ' + bearer, 'x-qb-device': 'spoof' }); expect(r.ok).toBe(false); expect(['device-mismatch', 'hmac-mismatch']).toContain(r.reason)
  })

  it('rejects missing header', async () => {
    const mod = await import(url + '?t=' + (Date.now() + 2))
    expect(mod.verifyBearer({})).toEqual({ ok: false, reason: 'missing-auth' })
  })

  it('rejects when OWNER_TOKEN not set', async () => {
    delete process.env.OWNER_TOKEN
    const deviceId = crypto.randomUUID()
    const bearer = tokenMod.encode({ deviceId, token: 'any' })
    const mod = await import(url + '?t=' + (Date.now() + 3))
    expect(mod.verifyBearer({ authorization: 'Bearer ' + bearer, 'x-qb-device': deviceId }).reason).toBe('server-not-bootstrapped')
  })
})