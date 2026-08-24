import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import Fastify from 'fastify'
import crypto from 'node:crypto'
import tokenMod from '../shared/sync/token.js'
import { fakeDb } from './helpers/fake-db.js'

const syncUrl = 'file:///' + path.resolve('server/src/routes/sync.js').replace(/\\/g, '/')

describe('GET /v1/sync/pull', () => {
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

  it('returns notes updated after `since` cursor', async () => {
    const db = fakeDb({ token: process.env.OWNER_TOKEN })
    db.stored.set('a', { client_id: 'a', user_id: 1, updated_at: 100, content: 'a' })
    db.stored.set('b', { client_id: 'b', user_id: 1, updated_at: 200, content: 'b' })
    db.stored.set('c', { client_id: 'c', user_id: 1, updated_at: 300, content: 'c' })
    const syncMod = await import(syncUrl + '?t=' + Date.now())
    const app = Fastify({ logger: false })
    await app.register(syncMod.default || syncMod, { db })
    const deviceId = crypto.randomUUID()
    const bearer = tokenMod.encode({ deviceId, token: process.env.OWNER_TOKEN })
    const res = await app.inject({ method: 'GET', url: '/v1/sync/pull?since=150&limit=10', headers: { authorization: 'Bearer ' + bearer, 'x-qb-device': deviceId } })
    expect(res.statusCode).toBe(200)
    const json = res.json()
    expect(json.changes.map(c => c.client_id)).toEqual(['b', 'c'])
    expect(json.next_cursor).toBe(300)
    await app.close()
  })

  it('returns 400 for invalid `since` cursor', async () => {
    const db = fakeDb({ token: process.env.OWNER_TOKEN })
    const syncMod = await import(syncUrl + '?t=' + Date.now())
    const app = Fastify({ logger: false })
    await app.register(syncMod.default || syncMod, { db })
    const deviceId = crypto.randomUUID()
    const bearer = tokenMod.encode({ deviceId, token: process.env.OWNER_TOKEN })
    const res = await app.inject({ method: 'GET', url: '/v1/sync/pull?since=abc', headers: { authorization: 'Bearer ' + bearer, 'x-qb-device': deviceId } })
    expect(res.statusCode).toBe(400)
    await app.close()
  })

  it('returns 401 without bearer', async () => {
    const db = fakeDb({ token: process.env.OWNER_TOKEN })
    const syncMod = await import(syncUrl + '?t=' + Date.now())
    const app = Fastify({ logger: false })
    await app.register(syncMod.default || syncMod, { db })
    const res = await app.inject({ method: 'GET', url: '/v1/sync/pull' })
    expect(res.statusCode).toBe(401)
    await app.close()
  })
})
