import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import Fastify from 'fastify'
import crypto from 'node:crypto'
import tokenMod from '../shared/sync/token.js'

const syncUrl = 'file:///' + path.resolve('server/src/routes/sync.js').replace(/\\/g, '/')

describe('GET /v1/sync/pull', () => {
  let originalEnv
  beforeEach(() => {
    originalEnv = { ...process.env }
    process.env.MODE = 'byos'
    process.env.MASTER_KEY = 'a'.repeat(64)
    process.env.OWNER_TOKEN = 'g'.repeat(32)
    process.env.DB_URL = 'postgres://x'
  })
  afterEach(() => {
    for (const k of Object.keys(process.env)) if (!(k in originalEnv)) delete process.env[k]
    for (const k of Object.keys(originalEnv)) process.env[k] = originalEnv[k]
  })

  async function buildAppWithFakeDb(stored = new Map()) {
    const db = {
      selectFrom: () => ({
        selectAll: () => ({
          where: (col, op, val) => ({
            executeTakeFirst: async () => stored.get(val) || null,
            orderBy: () => ({
              limit: (limit) => ({
                execute: async () => Array.from(stored.values()).filter(r => r.updated_at > val).slice(0, limit)
              })
            })
          })
        })
      })
    }
    const syncMod = await import(syncUrl + '?t=' + Date.now())
    const app = Fastify({ logger: false })
    await app.register(syncMod.default || syncMod, { db })
    return app
  }

  it('returns rows with cursor + has_more false when fewer than limit', async () => {
    const stored = new Map()
    stored.set('a', { client_id: 'a', updated_at: 100, content: 'A' })
    stored.set('b', { client_id: 'b', updated_at: 200, content: 'B' })
    const app = await buildAppWithFakeDb(stored)
    const deviceId = crypto.randomUUID()
    const bearer = tokenMod.encode({ deviceId, token: process.env.OWNER_TOKEN })
    const res = await app.inject({ method: 'GET', url: '/v1/sync/pull?since=0&limit=10', headers: { authorization: 'Bearer ' + bearer, 'x-qb-device': deviceId } })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.changes).toHaveLength(2)
    expect(body.next_cursor).toBe(200)
    expect(body.has_more).toBe(false)
    await app.close()
  })

  it('rejects with 401 if bearer missing', async () => {
    const app = await buildAppWithFakeDb()
    const res = await app.inject({ method: 'GET', url: '/v1/sync/pull?since=0&limit=10' })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('rejects with 400 on bad limit', async () => {
    const stored = new Map([['a', { client_id: 'a', updated_at: 100 }]])
    const app = await buildAppWithFakeDb(stored)
    const deviceId = crypto.randomUUID()
    const bearer = tokenMod.encode({ deviceId, token: process.env.OWNER_TOKEN })
    const res = await app.inject({ method: 'GET', url: '/v1/sync/pull?since=0&limit=0', headers: { authorization: 'Bearer ' + bearer, 'x-qb-device': deviceId } })
    expect(res.statusCode).toBe(400)
    await app.close()
  })
})