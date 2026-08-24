import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import crypto from 'node:crypto'
import path from 'node:path'
import tokenMod from '../shared/sync/token.js'
import { fakeDb } from './helpers/fake-db.js'

const url = 'file:///' + path.resolve('server/src/auth/hmac.js').replace(/\\/g, '/')

describe('server auth hmac (multi-tenant)', () => {
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
    const db = fakeDb({ token: process.env.OWNER_TOKEN })
    const r = await mod.verifyBearer(db, { authorization: 'Bearer ' + bearer, 'x-qb-device': deviceId })
    expect(r.ok).toBe(true)
    expect(r.deviceId).toBe(deviceId)
    expect(r.userId).toBe(1)
  })

  it('rejects mismatched device id', async () => {
    const deviceId = crypto.randomUUID()
    const bearer = tokenMod.encode({ deviceId, token: process.env.OWNER_TOKEN })
    const mod = await import(url + '?t=' + (Date.now() + 1))
    const db = fakeDb({ token: process.env.OWNER_TOKEN })
    const r = await mod.verifyBearer(db, { authorization: 'Bearer ' + bearer, 'x-qb-device': 'spoof' })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('hmac-mismatch')
  })

  it('rejects missing bearer', async () => {
    const mod = await import(url + '?t=' + (Date.now() + 2))
    const db = fakeDb({ token: process.env.OWNER_TOKEN })
    const r = await mod.verifyBearer(db, { 'x-qb-device': crypto.randomUUID() })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('missing-auth')
  })

  it('rejects missing device header', async () => {
    const deviceId = crypto.randomUUID()
    const bearer = tokenMod.encode({ deviceId, token: process.env.OWNER_TOKEN })
    const mod = await import(url + '?t=' + (Date.now() + 3))
    const db = fakeDb({ token: process.env.OWNER_TOKEN })
    const r = await mod.verifyBearer(db, { authorization: 'Bearer ' + bearer })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('missing-device')
  })
})
