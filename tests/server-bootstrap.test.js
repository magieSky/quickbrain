import { describe, it, expect, beforeEach } from 'vitest'
import path from 'node:path'

const url = 'file:///' + path.resolve('server/src/auth/bootstrap.js').replace(/\\/g, '/')

describe('SaaS secret bootstrap', () => {
  beforeEach(() => {
    delete process.env.MASTER_KEY
  })

  it('ensureSecrets generates MASTER_KEY when env missing', async () => {
    const mod = await import(url + '?t=' + Date.now())
    const out = mod.ensureSecrets()
    expect(out.masterKey.length).toBe(32)
    expect(out.adminBootstrapToken).toBeUndefined()
  })

  it('ensureSecrets memoises generated MASTER_KEY across calls', async () => {
    const mod = await import(url + '?t=' + (Date.now() + 1))
    const first = mod.ensureSecrets()
    const second = mod.ensureSecrets()
    expect(second.masterKey.equals(first.masterKey)).toBe(true)
  })

  it('does NOT auto-generate ADMIN_BOOTSTRAP_TOKEN (operator must set it)', async () => {
    const mod = await import(url + '?t=' + (Date.now() + 2))
    const out = mod.ensureSecrets()
    expect(out.adminBootstrapToken).toBeUndefined()
    expect(process.env.ADMIN_BOOTSTRAP_TOKEN).toBeUndefined()
  })
})