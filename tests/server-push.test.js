import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import Fastify from 'fastify'
import crypto from 'node:crypto'
import tokenMod from '../shared/sync/token.js'
import { fakeDb } from './helpers/fake-db.js'

const syncUrl = 'file:///' + path.resolve('server/src/routes/sync.js').replace(/\\/g, '/')

describe('POST /v1/sync/push', () => {
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

  it('accepts ops, reports 1 accepted + 1 conflict when LWW rejects one', async () => {
    const db = fakeDb({ token: process.env.OWNER_TOKEN })
    db.stored.set('c1', { client_id: 'c1', updated_at: 200, rev: 2, user_id: 1 })
    const syncMod = await import(syncUrl + '?t=' + Date.now())
    const app = Fastify({ logger: false })
    await app.register(syncMod.default || syncMod, { db })
    const deviceId = crypto.randomUUID()
    const bearer = tokenMod.encode({ deviceId, token: process.env.OWNER_TOKEN })
    const body = { ops: [
      { op: 'upsert', note: { client_id: 'c1', updated_at: 100, rev: 1, content: 'old', user_id: 1 } },
      { op: 'upsert', note: { client_id: 'c2', updated_at: 300, rev: 1, content: 'new', user_id: 1 } }
    ] }
    const res = await app.inject({ method: 'POST', url: '/v1/sync/push', headers: { authorization: 'Bearer ' + bearer, 'x-qb-device': deviceId }, payload: body })
    expect(res.statusCode).toBe(200)
    const json = res.json()
    expect(json.accepted).toBe(1)
    expect(json.conflicts).toHaveLength(1)
    await app.close()
  })

  it('returns 400 for invalid ops payload', async () => {
    const db = fakeDb({ token: process.env.OWNER_TOKEN })
    const syncMod = await import(syncUrl + '?t=' + Date.now())
    const app = Fastify({ logger: false })
    await app.register(syncMod.default || syncMod, { db })
    const deviceId = crypto.randomUUID()
    const bearer = tokenMod.encode({ deviceId, token: process.env.OWNER_TOKEN })
    const res = await app.inject({ method: 'POST', url: '/v1/sync/push', headers: { authorization: 'Bearer ' + bearer, 'x-qb-device': deviceId }, payload: { ops: 'nope' } })
    expect(res.statusCode).toBe(400)
    await app.close()
  })

  it('returns 401 without bearer', async () => {
    const db = fakeDb({ token: process.env.OWNER_TOKEN })
    const syncMod = await import(syncUrl + '?t=' + Date.now())
    const app = Fastify({ logger: false })
    await app.register(syncMod.default || syncMod, { db })
    const res = await app.inject({ method: 'POST', url: '/v1/sync/push', payload: { ops: [] } })
    expect(res.statusCode).toBe(401)
    await app.close()
  })
})
