import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import Fastify from 'fastify'
import crypto from 'node:crypto'
import { fakeDb } from './helpers/fake-db.js'

const root = path.resolve('.').replace(/\\/g, '/')
const aiUrl = 'file:///' + root + '/server/src/routes/ai.js'
const tokenUrl = 'file:///' + root + '/shared/sync/token.js'

let originalEnv
function setEnv() {
  originalEnv = { ...process.env }
  process.env.MODE = 'byos'
  process.env.MASTER_KEY = 'c'.repeat(64)
  process.env.OWNER_TOKEN = 'f'.repeat(32)
  process.env.DB_URL = 'postgres://x'
}
function restoreEnv() {
  for (const k of Object.keys(process.env)) if (!(k in originalEnv)) delete process.env[k]
  for (const k of Object.keys(originalEnv)) process.env[k] = originalEnv[k]
}

describe('server /v1/ai/* proxy', () => {
  beforeEach(setEnv)
  afterEach(restoreEnv)

  async function buildAppWith(stub) {
    const mod = await import(aiUrl + '?t=' + Date.now() + Math.random())
    const aiMod = await import('file:///' + root + '/server/src/services/ai.js')
    aiMod.setForTesting(stub)
    const db = fakeDb({ token: process.env.OWNER_TOKEN })
    const app = Fastify({ logger: false })
    await app.register(mod.default || mod, { db })
    return app
  }

  async function bearer() {
    const tokenMod = await import(tokenUrl + '?t=' + Date.now())
    const deviceId = crypto.randomUUID()
    return { bearer: tokenMod.encode({ deviceId, token: process.env.OWNER_TOKEN }), deviceId }
  }

  it('rejects unauthenticated requests', async () => {
    const app = await buildAppWith(null)
    const res = await app.inject({ method: 'POST', url: '/v1/ai/format', payload: { content: 'x' } })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('returns 503 ai-not-configured when no service set', async () => {
    const app = await buildAppWith(null)
    const { bearer: b, deviceId } = await bearer()
    const res = await app.inject({
      method: 'POST', url: '/v1/ai/format',
      headers: { authorization: 'Bearer ' + b, 'x-qb-device': deviceId },
      payload: { content: 'x' }
    })
    expect(res.statusCode).toBe(503)
    await app.close()
  })

  it('returns 400 content-required for missing content field', async () => {
    const fakeSvc = { hasService: () => true, formatContent: async () => ({}) }
    const app = await buildAppWith(fakeSvc)
    const { bearer: b, deviceId } = await bearer()
    const res = await app.inject({
      method: 'POST', url: '/v1/ai/format',
      headers: { authorization: 'Bearer ' + b, 'x-qb-device': deviceId },
      payload: {}
    })
    expect(res.statusCode).toBe(400)
    await app.close()
  })

  it('calls formatContent and returns result', async () => {
    const fakeSvc = { hasService: () => true, formatContent: async (c) => ({ formatted: '<<' + c + '>>' }) }
    const app = await buildAppWith(fakeSvc)
    const { bearer: b, deviceId } = await bearer()
    const res = await app.inject({
      method: 'POST', url: '/v1/ai/format',
      headers: { authorization: 'Bearer ' + b, 'x-qb-device': deviceId },
      payload: { content: 'hello' }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ formatted: '<<hello>>' })
    await app.close()
  })

  it('returns 500 when formatContent throws', async () => {
    const fakeSvc = { hasService: () => true, formatContent: async () => { throw new Error('boom') } }
    const app = await buildAppWith(fakeSvc)
    const { bearer: b, deviceId } = await bearer()
    const res = await app.inject({
      method: 'POST', url: '/v1/ai/format',
      headers: { authorization: 'Bearer ' + b, 'x-qb-device': deviceId },
      payload: { content: 'hello' }
    })
    expect(res.statusCode).toBe(500)
    await app.close()
  })

  it('categorize endpoint returns result', async () => {
    const fakeSvc = { hasService: () => true, categorizeContent: async () => ({ category: 'note' }) }
    const app = await buildAppWith(fakeSvc)
    const { bearer: b, deviceId } = await bearer()
    const res = await app.inject({
      method: 'POST', url: '/v1/ai/categorize',
      headers: { authorization: 'Bearer ' + b, 'x-qb-device': deviceId },
      payload: { content: 'x' }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ category: 'note' })
    await app.close()
  })

  it('semantic-search endpoint returns result', async () => {
    const fakeSvc = { hasService: () => true, semanticSearch: async () => ({ best: 'idx-0' }) }
    const app = await buildAppWith(fakeSvc)
    const { bearer: b, deviceId } = await bearer()
    const res = await app.inject({
      method: 'POST', url: '/v1/ai/semantic-search',
      headers: { authorization: 'Bearer ' + b, 'x-qb-device': deviceId },
      payload: { query: 'q', candidateSummaries: ['a', 'b'] }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ best: 'idx-0' })
    await app.close()
  })
})




