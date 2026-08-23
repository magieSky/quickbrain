import { describe, it, expect, beforeEach } from 'vitest'
import path from 'node:path'

const url = 'file:///' + path.resolve('server/src/auth/bootstrap.js').replace(/\\/g, '/')

describe('BYOS bootstrap', () => {
  beforeEach(() => {
    delete process.env.MASTER_KEY
    delete process.env.OWNER_TOKEN
  })

  it('ensureSecrets generates MASTER_KEY + OWNER_TOKEN when env missing', async () => {
    const mod = await import(url + '?t=' + Date.now())
    const out = mod.ensureSecrets()
    expect(out.masterKey.length).toBe(32)
    expect(out.ownerToken.length).toBeGreaterThanOrEqual(20)
  })

  it('ensureSecrets memoises generated secrets across calls', async () => {
    const mod = await import(url + '?t=' + (Date.now() + 1))
    const first = mod.ensureSecrets()
    const second = mod.ensureSecrets()
    expect(second.masterKey.equals(first.masterKey)).toBe(true)
    expect(second.ownerToken).toBe(first.ownerToken)
  })
})