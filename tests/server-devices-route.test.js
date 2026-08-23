import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import crypto from 'node:crypto'
import Fastify from 'fastify'
import tokenMod from '../shared/sync/token.js'

const indexUrl = 'file:///' + path.resolve('server/src/index.js').replace(/\\/g, '/')
const devicesUrl = 'file:///' + path.resolve('server/src/routes/devices.js').replace(/\\/g, '/')

describe('server devices route', () => {
  let originalEnv
  beforeEach(() => {
    originalEnv = { ...process.env }
    process.env.MODE = 'byos'
    process.env.MASTER_KEY = 'a'.repeat(64)
    process.env.OWNER_TOKEN = 'f'.repeat(32)
    process.env.DB_URL = 'postgres://x:h/db'
  })
  afterEach(() => {
    for (const k of Object.keys(process.env)) if (!(k in originalEnv)) delete process.env[k]
    for (const k of Object.keys(originalEnv)) process.env[k] = originalEnv[k]
  })

  async function buildAppWithFakeDb() {
    const fakeDb = {
      selectFrom: () => ({ selectAll: () => ({ orderBy: () => ({ execute: async () => [] }) }) }),
      insertInto: () => ({ values: () => ({ onConflict: () => ({ doUpdateSet: () => ({ executeTakeFirst: async () => ({}) }) }) }) }),
      updateTable: () => ({ set: () => ({ where: () => ({ executeTakeFirst: async () => ({}) }) }) })
    }
    const routesMod = await import(devicesUrl + '?t=' + Date.now())
    const app = Fastify({ logger: false })
    await app.register(routesMod.default || routesMod, { db: fakeDb })
    return app
  }

  it('GET /v1/admin/devices requires bearer; rejects missing headers', async () => {
    const app = await buildAppWithFakeDb()
    const res = await app.inject({ method: 'GET', url: '/v1/admin/devices' })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('GET /v1/admin/devices with valid bearer returns the (empty) list', async () => {
    const app = await buildAppWithFakeDb()
    const deviceId = crypto.randomUUID()
    const bearer = tokenMod.encode({ deviceId, token: process.env.OWNER_TOKEN })
    const res = await app.inject({ method: 'GET', url: '/v1/admin/devices', headers: { authorization: 'Bearer ' + bearer, 'x-qb-device': deviceId, 'x-qb-name': 'TestPC', 'x-qb-platform': 'win32' } })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([])
    await app.close()
  })

  it('POST /v1/admin/devices/:id/revoke works with valid bearer', async () => {
    const app = await buildAppWithFakeDb()
    const deviceId = crypto.randomUUID()
    const bearer = tokenMod.encode({ deviceId, token: process.env.OWNER_TOKEN })
    const res = await app.inject({ method: 'POST', url: '/v1/admin/devices/some-dev/revoke', headers: { authorization: 'Bearer ' + bearer, 'x-qb-device': deviceId } })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
    await app.close()
  })
})