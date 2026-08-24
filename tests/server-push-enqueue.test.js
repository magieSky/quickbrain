import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import Fastify from 'fastify'
import crypto from 'node:crypto'
import tokenMod from '../shared/sync/token.js'
import { fakeDb } from './helpers/fake-db.js'

const syncUrl = 'file:///' + path.resolve('server/src/routes/sync.js').replace(/\\/g, '/')

describe('POST /v1/sync/push enqueue integration', () => {
  let originalEnv
  beforeEach(() => {
    originalEnv = { ...process.env }
    process.env.MODE = 'byos'
    process.env.MASTER_KEY = 'a'.repeat(64)
    process.env.OWNER_TOKEN = 'h'.repeat(32)
    process.env.DB_URL = 'postgres://x'
  })
  afterEach(() => {
    for (const k of Object.keys(process.env)) if (!(k in originalEnv)) delete process.env[k]
    for (const k of Object.keys(originalEnv)) process.env[k] = originalEnv[k]
  })

  it('calls _enqueueExtract for upsert of a source note (not atom, not yet extracted)', async () => {
    const db = fakeDb({ token: process.env.OWNER_TOKEN })
    const syncMod = await import(syncUrl + '?t=' + Date.now())
    const enqueued = []
    syncMod.setEnqueueExtract(async (cid) => { enqueued.push(cid) })
    const app = Fastify({ logger: false })
    await app.register(syncMod.default || syncMod, { db })
    const deviceId = crypto.randomUUID()
    const bearer = tokenMod.encode({ deviceId, token: process.env.OWNER_TOKEN })
    const body = { ops: [
      { op: 'upsert', note: { client_id: 'src-A', updated_at: Date.now(), rev: 1, content: 'hello', is_atom: 0, extracted_at: null, user_id: 1 } }
    ] }
    const res = await app.inject({ method: 'POST', url: '/v1/sync/push', headers: { authorization: 'Bearer ' + bearer, 'x-qb-device': deviceId }, payload: body })
    expect(res.statusCode).toBe(200)
    expect(enqueued).toContain('src-A')
    await app.close()
  })

  it('does NOT call _enqueueExtract for atom notes', async () => {
    const db = fakeDb({ token: process.env.OWNER_TOKEN })
    const syncMod = await import(syncUrl + '?t=' + (Date.now() + 1))
    const enqueued = []
    syncMod.setEnqueueExtract(async (cid) => { enqueued.push(cid) })
    const app = Fastify({ logger: false })
    await app.register(syncMod.default || syncMod, { db })
    const deviceId = crypto.randomUUID()
    const bearer = tokenMod.encode({ deviceId, token: process.env.OWNER_TOKEN })
    const body = { ops: [
      { op: 'upsert', note: { client_id: 'src-A:atom:0', updated_at: Date.now(), rev: 1, content: 'atom', is_atom: 1, parent_id: 'src-A', extracted_at: 1, user_id: 1 } }
    ] }
    const res = await app.inject({ method: 'POST', url: '/v1/sync/push', headers: { authorization: 'Bearer ' + bearer, 'x-qb-device': deviceId }, payload: body })
    expect(res.statusCode).toBe(200)
    expect(enqueued).toEqual([])
    await app.close()
  })

  it('does NOT call _enqueueExtract when source already has extracted_at set', async () => {
    const db = fakeDb({ token: process.env.OWNER_TOKEN })
    const syncMod = await import(syncUrl + '?t=' + (Date.now() + 2))
    const enqueued = []
    syncMod.setEnqueueExtract(async (cid) => { enqueued.push(cid) })
    const app = Fastify({ logger: false })
    await app.register(syncMod.default || syncMod, { db })
    const deviceId = crypto.randomUUID()
    const bearer = tokenMod.encode({ deviceId, token: process.env.OWNER_TOKEN })
    const body = { ops: [
      { op: 'upsert', note: { client_id: 'src-A', updated_at: Date.now(), rev: 1, content: 'already extracted', is_atom: 0, extracted_at: 12345, user_id: 1 } }
    ] }
    const res = await app.inject({ method: 'POST', url: '/v1/sync/push', headers: { authorization: 'Bearer ' + bearer, 'x-qb-device': deviceId }, payload: body })
    expect(res.statusCode).toBe(200)
    expect(enqueued).toEqual([])
    await app.close()
  })
})
