import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import Fastify from 'fastify'

const adminUrl = 'file:///' + path.resolve('server/src/routes/admin.js').replace(/\\/g, '/')
const configSvcUrl = 'file:///' + path.resolve('server/src/services/config.js').replace(/\\/g, '/')
const cryptoUrl = 'file:///' + path.resolve('server/src/auth/crypto.js').replace(/\\/g, '/')

function makeMasterKey() {
  const buf = Buffer.alloc(32)
  for (let i = 0; i < 32; i++) buf[i] = (i * 7 + 13) & 0xff
  return buf
}

function makeDb() {
  const tables = new Map()
  return {
    exec: (sql) => {
      if (/CREATE TABLE.*config/.test(sql)) tables.set('config', [])
    },
    prepare: (sql) => {
      if (/FROM config WHERE key/.test(sql)) {
        return {
          get: (key) => (tables.get('config') || []).find(r => r.key === key)
        }
      }
      if (/INSERT INTO config/.test(sql)) {
        return {
          run: (key, iv, ct, tag, ts) => {
            const arr = tables.get('config') || []
            const idx = arr.findIndex(r => r.key === key)
            const row = { key, iv, ct, tag, updated_at: ts }
            if (idx >= 0) arr[idx] = row; else arr.push(row)
            tables.set('config', arr)
            return { changes: 1 }
          }
        }
      }
      if (/SELECT key, updated_at FROM config/.test(sql)) {
        return { all: () => (tables.get('config') || []).map(r => ({ key: r.key, updated_at: r.updated_at })) }
      }
      if (/DELETE FROM config WHERE key/.test(sql)) {
        return { run: (key) => { const arr = tables.get('config') || []; const i = arr.findIndex(r => r.key === key); if (i >= 0) arr.splice(i, 1); return { changes: 1 } } }
      }
      return { get: () => null, all: () => [], run: () => ({ changes: 0 }) }
    },
    selectFrom: () => ({
      select: (sel) => ({
        executeTakeFirst: async () => ({ c: 0 })
      })
    })
  }
}

describe('server/src/auth/crypto (AES-256-GCM)', () => {
  it('roundtrips a plaintext', async () => {
    const { encrypt, decrypt } = await import(cryptoUrl)
    const key = makeMasterKey()
    const enc = encrypt('hello-secret', key)
    expect(enc.iv).toBeTruthy()
    expect(enc.ct).toBeTruthy()
    expect(enc.tag).toBeTruthy()
    expect(decrypt(enc, key)).toBe('hello-secret')
  })

  it('rejects wrong key', async () => {
    const { encrypt, decrypt } = await import(cryptoUrl + '?t=' + Date.now())
    const key = makeMasterKey()
    const enc = encrypt('hello', key)
    const other = Buffer.alloc(32, 0x99)
    expect(() => decrypt(enc, other)).toThrow()
  })

  it('rejects tampered ciphertext', async () => {
    const { encrypt, decrypt } = await import(cryptoUrl + '?t=' + (Date.now() + 1))
    const key = makeMasterKey()
    const enc = encrypt('hello', key)
    const tampered = { iv: enc.iv, ct: enc.ct.slice(0, -2) + (enc.ct.endsWith('A') ? 'B' : 'A'), tag: enc.tag }
    expect(() => decrypt(tampered, key)).toThrow()
  })
})

describe('server/src/services/config (encrypted KV)', () => {
  it('roundtrips a JSON value', async () => {
    const { ensureSchema, get, set } = await import(configSvcUrl)
    const db = makeDb()
    ensureSchema(db)
    const key = makeMasterKey()
    set(db, 'ai-config', JSON.stringify({ provider: 'openai', apiKey: 'sk-test' }), key)
    const raw = get(db, 'ai-config', key)
    expect(JSON.parse(raw).provider).toBe('openai')
    expect(JSON.parse(raw).apiKey).toBe('sk-test')
  })

  it('returns null on missing key', async () => {
    const { ensureSchema, get } = await import(configSvcUrl + '?t=' + Date.now())
    const db = makeDb()
    ensureSchema(db)
    expect(get(db, 'nope', makeMasterKey())).toBeNull()
  })

  it('returns null when decryption fails', async () => {
    const { ensureSchema, get, set } = await import(configSvcUrl + '?t=' + (Date.now() + 1))
    const db = makeDb()
    ensureSchema(db)
    set(db, 'k', 'value', makeMasterKey())
    expect(get(db, 'k', Buffer.alloc(32, 0xee))).toBeNull()
  })
})

describe('admin routes', () => {
  let originalEnv
  beforeEach(() => {
    originalEnv = { ...process.env }
    process.env.MODE = 'byos'
    process.env.MASTER_KEY = 'a'.repeat(64)
    process.env.OWNER_TOKEN = 'owner-secret-token'
    process.env.DB_URL = 'postgres://x'
  })
  afterEach(() => {
    for (const k of Object.keys(process.env)) if (!(k in originalEnv)) delete process.env[k]
    for (const k of Object.keys(originalEnv)) process.env[k] = originalEnv[k]
  })

  async function buildApp() {
    const mod = await import(adminUrl + '?t=' + Date.now() + Math.random())
    const db = makeDb()
    const app = Fastify({ logger: false })
    await app.register(mod.default || mod, { db, masterKey: makeMasterKey(), ownerToken: 'owner-secret-token' })
    return { app, db }
  }

  it('rejects unauthenticated requests', async () => {
    const { app } = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/v1/admin/status' })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('GET /v1/admin/ai-config returns configured=false initially', async () => {
    const { app } = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/v1/admin/ai-config', headers: { authorization: 'Bearer owner-secret-token' } })
    expect(res.statusCode).toBe(200)
    const j = res.json()
    expect(j.configured).toBe(false)
    await app.close()
  })

  it('POST /v1/admin/ai-config saves and redacts secrets on read', async () => {
    const { app } = await buildApp()
    const post = await app.inject({ method: 'POST', url: '/v1/admin/ai-config', headers: { authorization: 'Bearer owner-secret-token' }, payload: { provider: 'openai', apiKey: 'sk-12345', model: 'gpt-4o-mini', baseURL: '' } })
    expect(post.statusCode).toBe(200)
    const get = await app.inject({ method: 'GET', url: '/v1/admin/ai-config', headers: { authorization: 'Bearer owner-secret-token' } })
    const j = get.json()
    expect(j.configured).toBe(true)
    expect(j.config.provider).toBe('openai')
    expect(j.config.apiKey).toBe('<set>')
    await app.close()
  })

  it('GET /v1/admin/status returns counts', async () => {
    const { app } = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/v1/admin/status', headers: { authorization: 'Bearer owner-secret-token' } })
    expect(res.statusCode).toBe(200)
    expect(res.json().ok).toBe(true)
    await app.close()
  })

  it('rejects wrong owner token', async () => {
    const { app } = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/v1/admin/status', headers: { authorization: 'Bearer wrong' } })
    expect(res.statusCode).toBe(401)
    await app.close()
  })
})