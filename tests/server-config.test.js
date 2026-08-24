import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const cfgPath = path.join(process.cwd(), 'server', 'src', 'config.js')

let prevEnv = {}
beforeEach(() => {
  prevEnv = { MASTER_KEY: process.env.MASTER_KEY, ADMIN_BOOTSTRAP_TOKEN: process.env.ADMIN_BOOTSTRAP_TOKEN, DB_URL: process.env.DB_URL }
  process.env.MASTER_KEY = 'a'.repeat(64)
  process.env.ADMIN_BOOTSTRAP_TOKEN = 'b'.repeat(32)
  process.env.DB_URL = 'postgres://x:y@h:5432/db'
})
afterEach(() => {
  for (const k of Object.keys(prevEnv)) process.env[k] = prevEnv[k]
})

async function load() {
  // Reload module each time so env changes are picked up
  const url = pathToFileURL(cfgPath).href
  const mod = await import(url + '?t=' + Date.now())
  return mod.loadConfig()
}

describe('server config loader', () => {
  it('reads env into typed object', async () => {
    const cfg = await load()
    expect(cfg.port).toBe(7422)
    expect(cfg.masterKey.length).toBe(32)
    expect(cfg.adminBootstrapToken).toBe('b'.repeat(32))
    expect(cfg.dbUrl).toBe('postgres://x:y@h:5432/db')
    expect(cfg.mode).toBeUndefined()
  })

  it('rejects missing MASTER_KEY', async () => {
    delete process.env.MASTER_KEY
    await expect(load()).rejects.toThrow(/MASTER_KEY/)
  })

  it('rejects missing ADMIN_BOOTSTRAP_TOKEN', async () => {
    delete process.env.ADMIN_BOOTSTRAP_TOKEN
    await expect(load()).rejects.toThrow(/ADMIN_BOOTSTRAP_TOKEN/)
  })

  it('honours PORT override', async () => {
    process.env.PORT = '9999'
    const cfg = await load()
    expect(cfg.port).toBe(9999)
  })
})