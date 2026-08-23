import { describe, it, expect, afterAll, beforeEach, afterEach } from 'vitest'
import path from 'node:path'

let originalEnv
beforeEach(() => {
  originalEnv = { ...process.env }
  process.env.MODE = 'byos'
  process.env.MASTER_KEY = 'a'.repeat(64)
  process.env.OWNER_TOKEN = 'b'.repeat(32)
  process.env.DB_URL = 'postgres://x:y@h/db'
})
afterEach(() => { for (const k of Object.keys(process.env)) if (!(k in originalEnv)) delete process.env[k]; for (const k of Object.keys(originalEnv)) process.env[k] = originalEnv[k] })

const url = 'file:///' + path.resolve('server/src/index.js').replace(/\\/g, '/')

describe('server hello', () => {
  it('GET /v1/sync/health returns ok', async () => {
    const mod = await import(url + '?t=' + Date.now())
    const app = mod.build()
    const res = await app.inject({ method: 'GET', url: '/v1/sync/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json().ok).toBe(true)
    await app.close()
  })

  it('GET / returns server banner', async () => {
    const mod = await import(url + '?t=' + (Date.now() + 1))
    const app = mod.build()
    const res = await app.inject({ method: 'GET', url: '/' })
    expect(res.statusCode).toBe(200)
    expect(res.json().name).toBe('quickbrain-server')
    await app.close()
  })
})