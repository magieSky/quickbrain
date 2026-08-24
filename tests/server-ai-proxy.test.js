import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import Fastify from 'fastify'
import crypto from 'node:crypto'

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
    const app = Fastify({ logger: false })
    await app.register(mod.default || mod, { db: null })
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
      method: 'POST',
      url: '/v1/ai/format',
      headers: { authorization: 'Bearer ' + b, 'x-qb-device': deviceId, 'content-type': 'application/json' },
      payload: { content: 'hello' }
    })
    expect(res.statusCode).toBe(503)
    expect(res.json().error).toBe('ai-not-configured')
    await app.close()
  })

  it('returns 400 when content missing on /format', async () => {
    const app = await buildAppWith({
      formatContent: async () => ({ success: true, formattedContent: 'x' }),
      categorizeContent: async () => ({ success: true }),
      semanticSearch: async () => ({ success: true, results: [] })
    })
    const { bearer: b, deviceId } = await bearer()
    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/format',
      headers: { authorization: 'Bearer ' + b, 'x-qb-device': deviceId, 'content-type': 'application/json' },
      payload: {}
    })
    expect(res.statusCode).toBe(400)
    await app.close()
  })

  it('POST /v1/ai/format calls service.formatContent', async () => {
    let captured = null
    const app = await buildAppWith({
      formatContent: async (content, style) => { captured = { content, style }; return { success: true, formattedContent: 'X' } },
      categorizeContent: async () => ({ success: true }),
      semanticSearch: async () => ({ success: true })
    })
    const { bearer: b, deviceId } = await bearer()
    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/format',
      headers: { authorization: 'Bearer ' + b, 'x-qb-device': deviceId, 'content-type': 'application/json' },
      payload: { content: 'hello world', style: 'structured' }
    })
    expect(res.statusCode).toBe(200)
    expect(captured.content).toBe('hello world')
    expect(captured.style).toBe('structured')
    expect(res.json().formattedContent).toBe('X')
    await app.close()
  })

  it('POST /v1/ai/categorize calls service.categorizeContent', async () => {
    let captured = null
    const app = await buildAppWith({
      formatContent: async () => ({ success: true }),
      categorizeContent: async (content) => { captured = content; return { success: true, category: 'learning' } },
      semanticSearch: async () => ({ success: true })
    })
    const { bearer: b, deviceId } = await bearer()
    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/categorize',
      headers: { authorization: 'Bearer ' + b, 'x-qb-device': deviceId, 'content-type': 'application/json' },
      payload: { content: 'some text' }
    })
    expect(res.statusCode).toBe(200)
    expect(captured).toBe('some text')
    expect(res.json().category).toBe('learning')
    await app.close()
  })

  it('POST /v1/ai/semantic-search calls service.semanticSearch', async () => {
    let captured = null
    const app = await buildAppWith({
      formatContent: async () => ({ success: true }),
      categorizeContent: async () => ({ success: true }),
      semanticSearch: async (q, c) => { captured = { q, c }; return { success: true, results: [{ id: 'a' }] } }
    })
    const { bearer: b, deviceId } = await bearer()
    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/semantic-search',
      headers: { authorization: 'Bearer ' + b, 'x-qb-device': deviceId, 'content-type': 'application/json' },
      payload: { query: 'find foo', candidateSummaries: [{ id: 'a', title: 'foo' }] }
    })
    expect(res.statusCode).toBe(200)
    expect(captured.q).toBe('find foo')
    expect(captured.c).toEqual([{ id: 'a', title: 'foo' }])
    expect(res.json().results).toEqual([{ id: 'a' }])
    await app.close()
  })

  it('returns 500 on service throw', async () => {
    const app = await buildAppWith({
      formatContent: async () => { throw new Error('boom') },
      categorizeContent: async () => ({ success: true }),
      semanticSearch: async () => ({ success: true })
    })
    const { bearer: b, deviceId } = await bearer()
    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/format',
      headers: { authorization: 'Bearer ' + b, 'x-qb-device': deviceId, 'content-type': 'application/json' },
      payload: { content: 'x' }
    })
    expect(res.statusCode).toBe(500)
    expect(res.json().error).toBe('format-failed')
    await app.close()
  })
})