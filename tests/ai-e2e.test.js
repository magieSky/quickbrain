import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import Fastify from 'fastify'
import crypto from 'node:crypto'

const root = path.resolve('.').replace(/\\/g, '/')
const aiUrl = 'file:///' + root + '/server/src/routes/ai.js'
const aiSvcUrl = 'file:///' + root + '/server/src/services/ai.js'
const tokenUrl = 'file:///' + root + '/shared/sync/token.js'
const proxyUrl = 'file:///' + root + '/client/src/main/ai/server-proxy.js'

let originalEnv
function setEnv() {
  originalEnv = { ...process.env }
  process.env.MODE = 'byos'
  process.env.MASTER_KEY = 'd'.repeat(64)
  process.env.OWNER_TOKEN = 'g'.repeat(32)
  process.env.DB_URL = 'postgres://x'
}
function restoreEnv() {
  for (const k of Object.keys(process.env)) if (!(k in originalEnv)) delete process.env[k]
  for (const k of Object.keys(originalEnv)) process.env[k] = originalEnv[k]
}

describe('e2e: desktop AI via server proxy', () => {
  beforeEach(setEnv)
  afterEach(restoreEnv)

  it('client /v1/ai/format round-trips to stub server and returns formatted content', async () => {
    // 1. start server with stub AI
    const aiMod = await import(aiSvcUrl)
    aiMod.setForTesting({
      formatContent: async (content, style) => ({ success: true, formattedContent: 'FORMATTED[' + style + ']: ' + content }),
      categorizeContent: async (c) => ({ success: true, category: 'work' }),
      semanticSearch: async (q, cs) => ({ success: true, results: [{ id: 'x' }] })
    })
    const mod = await import(aiUrl + '?t=' + Date.now())
    const app = Fastify({ logger: false })
    await app.register(mod.default || mod, { db: {
      selectFrom: () => ({
        selectAll: () => ({ execute: async () => [
          { id: 1, username: 'owner', secret: process.env.OWNER_TOKEN, is_owner: 1, password_hash: '', created_at: 0, updated_at: 0 }
        ] })
      })
    } })
    await app.listen({ port: 0, host: '127.0.0.1' })
    const addr = app.server.address()
    const url = 'http://127.0.0.1:' + addr.port

    // 2. setup client config: ai.mode = server, sync pointing to server
    const tmp = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'qb-e2e-'))
    const userDataPath = tmp
    require.cache[require.resolve('electron')] = { exports: { app: { getPath: () => userDataPath } } }
    const tokenMod = await import(tokenUrl + '?t=' + Date.now())
    const deviceId = crypto.randomUUID()
    const bearer = tokenMod.encode({ deviceId, token: process.env.OWNER_TOKEN })
    require('fs').writeFileSync(require('path').join(userDataPath, 'config.json'), JSON.stringify({
      ai: { mode: 'server' },
      sync: { enabled: true, serverUrl: url, token: process.env.OWNER_TOKEN, deviceId }
    }))

    // 3. import proxy and call
    const proxyMod = await import(proxyUrl + '?t=' + Date.now())
    const ctx = proxyMod.getProxyContext()
    expect(ctx).not.toBeNull()
    expect(ctx.bearer).toBe(bearer)
    expect(ctx.deviceId).toBe(deviceId)
    const r = await proxyMod.formatViaServer({ content: 'hello world', style: 'summary' })
    expect(r.success).toBe(true)
    expect(r.formattedContent).toContain('FORMATTED[summary]: hello world')

    // cleanup
    delete require.cache[require.resolve('electron')]
    await app.close()
    require('fs').rmSync(tmp, { recursive: true, force: true })
  })

  it('falls back gracefully when server unreachable', async () => {
    // start app on a port then immediately close — port may still be TIME_WAIT but connect refused
    // Simpler: use a port we know nothing is on
    const aiMod = await import(aiSvcUrl + '?t=' + Date.now())
    aiMod.setForTesting({
      formatContent: async () => ({ success: true, formattedContent: 'should-not-reach' }),
      categorizeContent: async () => ({ success: true }),
      semanticSearch: async () => ({ success: true })
    })
    // Client config points to a port nothing is listening on
    const tmp = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'qb-e2e-fail-'))
    const userDataPath = tmp
    require.cache[require.resolve('electron')] = { exports: { app: { getPath: () => userDataPath } } }
    require('fs').writeFileSync(require('path').join(userDataPath, 'config.json'), JSON.stringify({
      ai: { mode: 'server' },
      sync: { enabled: true, serverUrl: 'http://127.0.0.1:65111', token: 'x', deviceId: 'd1' }
    }))
    const proxyMod = await import(proxyUrl + '?t=' + Date.now())
    const r = await proxyMod.formatViaServer({ content: 'hi' })
    expect(r.success).toBe(false)
    expect(typeof r.error).toBe('string')
    delete require.cache[require.resolve('electron')]
    require('fs').rmSync(tmp, { recursive: true, force: true })
  })
})