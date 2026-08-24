import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import crypto from 'node:crypto'
import Fastify from 'fastify'
import tokenMod from '../shared/sync/token.js'
import { fakeDb } from './helpers/fake-db.js'

const devicesUrl = 'file:///' + path.resolve('server/src/routes/devices.js').replace(/\\/g, '/')

describe('server devices route (multi-tenant)', () => {
  let originalEnv
  beforeEach(() => {
    originalEnv = { ...process.env }
    process.env.MODE = 'byos'
    process.env.MASTER_KEY = 'a'.repeat(64)
    process.env.OWNER_TOKEN = 'f'.repeat(32)
  })
  afterEach(() => {
    for (const k of Object.keys(process.env)) if (!(k in originalEnv)) delete process.env[k]
    for (const k of Object.keys(originalEnv)) process.env[k] = originalEnv[k]
  })

  async function buildApp() {
    const db = fakeDb({ token: process.env.OWNER_TOKEN })
    const routesMod = await import(devicesUrl + '?t=' + Date.now())
    const app = Fastify({ logger: false })
    await app.register(routesMod.default || routesMod, { db })
    return app
  }

  it('records last_seen via preHandler hook on authed request', async () => {
    const app = await buildApp()
    const deviceId = crypto.randomUUID()
    const bearer = tokenMod.encode({ deviceId, token: process.env.OWNER_TOKEN })
    const r = await app.inject({
      method: 'GET', url: '/v1/admin/devices',
      headers: { authorization: 'Bearer ' + bearer, 'x-qb-device': deviceId, 'x-qb-platform': 'darwin' }
    })
    expect(r.statusCode).toBe(200)
    await app.close()
  })

  it('returns 401 without bearer on /v1/admin/devices', async () => {
    const app = await buildApp()
    const r = await app.inject({ method: 'GET', url: '/v1/admin/devices' })
    expect(r.statusCode).toBe(401)
    await app.close()
  })

  it('returns 401 without bearer on revoke', async () => {
    const app = await buildApp()
    const r = await app.inject({ method: 'POST', url: '/v1/admin/devices/x/revoke' })
    expect(r.statusCode).toBe(401)
    await app.close()
  })
})
