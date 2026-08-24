import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import Fastify from 'fastify'
import crypto from 'node:crypto'
import tokenMod from '../shared/sync/token.js'

const routeUrl = 'file:///' + path.resolve('server/src/routes/extension-notes.js').replace(/\\/g, '/')

function buildBearer(deviceId, token) {
  return tokenMod.encode({ deviceId, token })
}

function fakeDb(opts = {}) {
  const users = opts.users || [{ id: 1, username: 'tester', secret: opts.token || 'h'.repeat(32) }]
  const stored = new Map()
  const buildChain = () => ({
    where: () => ({
      orderBy: () => ({
        limit: (n) => ({
          execute: async () => Array.from(stored.values()).sort((a, b) => a.updated_at - b.updated_at).slice(0, n)
        })
      })
    }),
    orderBy: () => ({
      limit: (n) => ({
        execute: async () => Array.from(stored.values()).sort((a, b) => a.updated_at - b.updated_at).slice(0, n)
      })
    }),
    executeTakeFirst: async () => null
  })
  return {
    stored, users,
    selectFrom: (table) => {
      if (table === 'users') {
        return {
          selectAll: () => ({
            where: () => ({ executeTakeFirst: async () => users[0] || null }),
            execute: async () => users
          })
        }
      }
      return { selectAll: () => buildChain() }
    },
    insertInto: () => ({
      values: (v) => ({
        onConflict: () => ({
          doUpdateSet: () => ({
            executeTakeFirst: async () => { stored.set(v.client_id, v); return { client_id: v.client_id } }
          }),
          executeTakeFirst: async () => { stored.set(v.client_id, v); return { client_id: v.client_id } }
        })
      })
    })
  }
}

async function buildApp(db) {
  const mod = await import(routeUrl + '?t=' + Date.now() + Math.random())
  const app = Fastify({ logger: false })
  await app.register(mod.default || mod, { db })
  await app.ready()
  return app
}

describe('extension /v1/notes routes (multi-tenant)', () => {
  let originalEnv
  beforeEach(() => {
    originalEnv = { ...process.env }
    process.env.MODE = 'byos'
    process.env.MASTER_KEY = 'a'.repeat(64)
    process.env.OWNER_TOKEN = 'h'.repeat(32)
  })
  afterEach(() => {
    for (const k of Object.keys(process.env)) if (!(k in originalEnv)) delete process.env[k]
    for (const k of Object.keys(originalEnv)) process.env[k] = originalEnv[k]
  })

  it('rejects POST /v1/notes without bearer (401)', async () => {
    const db = fakeDb()
    const app = await buildApp(db)
    const r = await app.inject({ method: 'POST', url: '/v1/notes', payload: { content: 'hi' } })
    expect(r.statusCode).toBe(401)
  })

  it('rejects POST /v1/notes with empty content (400)', async () => {
    const db = fakeDb()
    const app = await buildApp(db)
    const deviceId = crypto.randomUUID()
    const bearer = buildBearer(deviceId, process.env.OWNER_TOKEN)
    const r = await app.inject({
      method: 'POST', url: '/v1/notes',
      headers: { authorization: 'Bearer ' + bearer, 'x-qb-device': deviceId },
      payload: { content: '   ' }
    })
    expect(r.statusCode).toBe(400)
  })

  it('accepts POST /v1/notes with valid bearer, persists, returns client_id + user_id', async () => {
    const db = fakeDb()
    const app = await buildApp(db)
    const deviceId = crypto.randomUUID()
    const bearer = buildBearer(deviceId, process.env.OWNER_TOKEN)
    const r = await app.inject({
      method: 'POST', url: '/v1/notes',
      headers: { authorization: 'Bearer ' + bearer, 'x-qb-device': deviceId },
      payload: {
        content: 'hello world', title: 'test page', tags: ['web-page', 'extension'],
        source_path: 'https://example.com', source_type: 'web'
      }
    })
    expect(r.statusCode).toBe(200)
    const body = r.json()
    expect(body.success).toBe(true)
    expect(body.client_id).toBeTruthy()
    expect(body.user_id).toBe(1)
    expect(db.stored.size).toBe(1)
    const row = db.stored.values().next().value
    expect(row.content).toBe('hello world')
    expect(row.title).toBe('test page')
    expect(row.tags).toBe(JSON.stringify(['web-page', 'extension']))
    expect(row.source_path).toBe('https://example.com')
    expect(row.user_id).toBe(1)
  })

  it('upserts same client_id (idempotent re-save)', async () => {
    const db = fakeDb()
    const app = await buildApp(db)
    const deviceId = crypto.randomUUID()
    const bearer = buildBearer(deviceId, process.env.OWNER_TOKEN)
    const client_id = 'fixed-uuid-1'
    for (const title of ['first', 'updated']) {
      const r = await app.inject({
        method: 'POST', url: '/v1/notes',
        headers: { authorization: 'Bearer ' + bearer, 'x-qb-device': deviceId },
        payload: { client_id, content: 'content', title, source_type: 'web' }
      })
      expect(r.statusCode).toBe(200)
    }
    expect(db.stored.size).toBe(1)
    expect(db.stored.get(client_id).title).toBe('updated')
  })

  it('GET /v1/notes returns recent notes', async () => {
    const db = fakeDb()
    const app = await buildApp(db)
    const deviceId = crypto.randomUUID()
    const bearer = buildBearer(deviceId, process.env.OWNER_TOKEN)
    for (let i = 0; i < 2; i++) {
      await app.inject({
        method: 'POST', url: '/v1/notes',
        headers: { authorization: 'Bearer ' + bearer, 'x-qb-device': deviceId },
        payload: { content: 'note ' + i, title: 't' + i, source_type: 'web' }
      })
    }
    const r = await app.inject({
      method: 'GET', url: '/v1/notes',
      headers: { authorization: 'Bearer ' + bearer, 'x-qb-device': deviceId }
    })
    expect(r.statusCode).toBe(200)
    const body = r.json()
    expect(body.notes.length).toBe(2)
    expect(typeof body.next_cursor).toBe('number')
  })

  it('rejects GET /v1/notes without bearer', async () => {
    const db = fakeDb()
    const app = await buildApp(db)
    const r = await app.inject({ method: 'GET', url: '/v1/notes' })
    expect(r.statusCode).toBe(401)
  })
})
