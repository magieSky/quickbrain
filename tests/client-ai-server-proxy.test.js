import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

const root = path.resolve('.').replace(/\\/g, '/')
const proxyUrl = 'file:///' + root + '/client/src/main/ai/server-proxy.js'

function freshTmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qb-proxy-'))
  return dir
}

describe('client/src/main/ai/server-proxy', () => {
  let originalApp, originalGetPath
  let tmp

  beforeEach(() => {
    originalApp = (require.cache[require.resolve('electron')] || {}).exports
    // Stub electron.app.getPath('userData') via a fresh require of cfg
    tmp = freshTmp()
    require.cache[require.resolve('electron')] = {
      exports: { app: { getPath: () => tmp } }
    }
  })

  afterEach(() => {
    delete require.cache[require.resolve('electron')]
    if (tmp && fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('exports the expected API', async () => {
    const m = await import(proxyUrl + '?t=' + Date.now())
    expect(typeof m.formatViaServer).toBe('function')
    expect(typeof m.categorizeViaServer).toBe('function')
    expect(typeof m.semanticSearchViaServer).toBe('function')
    expect(typeof m.getProxyContext).toBe('function')
  })

  it('getProxyContext returns null when ai.mode is not "server"', async () => {
    fs.writeFileSync(path.join(tmp, 'config.json'), JSON.stringify({ ai: { mode: 'direct' }, sync: { enabled: true, serverUrl: 'http://x', token: 'tk', deviceId: 'd' } }))
    const m = await import(proxyUrl + '?t=' + (Date.now() + 1))
    expect(m.getProxyContext()).toBeNull()
  })

  it('getProxyContext returns null when sync not configured', async () => {
    fs.writeFileSync(path.join(tmp, 'config.json'), JSON.stringify({ ai: { mode: 'server' }, sync: { enabled: false } }))
    const m = await import(proxyUrl + '?t=' + (Date.now() + 2))
    expect(m.getProxyContext()).toBeNull()
  })

  it('getProxyContext returns ctx when ai.mode=server and sync enabled', async () => {
    fs.writeFileSync(path.join(tmp, 'config.json'), JSON.stringify({ ai: { mode: 'server' }, sync: { enabled: true, serverUrl: 'http://qb', token: 'tk', deviceId: 'd1' } }))
    const m = await import(proxyUrl + '?t=' + (Date.now() + 3))
    const ctx = m.getProxyContext()
    expect(ctx).not.toBeNull()
    expect(ctx.serverUrl).toBe('http://qb')
    expect(ctx.deviceId).toBe('d1')
    expect(typeof ctx.bearer).toBe('string')
    expect(ctx.bearer.length).toBeGreaterThan(10)
  })

  it('formatViaServer returns error when proxy disabled', async () => {
    fs.writeFileSync(path.join(tmp, 'config.json'), JSON.stringify({ ai: {}, sync: { enabled: false } }))
    const m = await import(proxyUrl + '?t=' + (Date.now() + 4))
    const r = await m.formatViaServer({ content: 'x' })
    expect(r.success).toBe(false)
    expect(r.error).toBe('server-mode-disabled')
  })

  it('formatViaServer POSTs to /v1/ai/format with bearer + deviceId headers', async () => {
    fs.writeFileSync(path.join(tmp, 'config.json'), JSON.stringify({ ai: { mode: 'server' }, sync: { enabled: true, serverUrl: 'http://stub.test', token: 'tk', deviceId: 'd1' } }))
    let captured = null
    globalThis.fetch = async (url, init) => {
      captured = { url, init }
      return { ok: true, status: 200, text: async () => JSON.stringify({ success: true, formattedContent: 'X' }) }
    }
    const m = await import(proxyUrl + '?t=' + (Date.now() + 5))
    const r = await m.formatViaServer({ content: 'hello', style: 'summary' })
    expect(r.success).toBe(true)
    expect(r.formattedContent).toBe('X')
    expect(captured.url).toBe('http://stub.test/v1/ai/format')
    expect(captured.init.method).toBe('POST')
    expect(captured.init.headers.authorization).toMatch(/^Bearer /)
    expect(captured.init.headers['x-qb-device']).toBe('d1')
    expect(JSON.parse(captured.init.body)).toEqual({ content: 'hello', style: 'summary' })
  })

  it('semanticSearchViaServer returns error object on non-2xx', async () => {
    fs.writeFileSync(path.join(tmp, 'config.json'), JSON.stringify({ ai: { mode: 'server' }, sync: { enabled: true, serverUrl: 'http://stub.test', token: 'tk', deviceId: 'd1' } }))
    globalThis.fetch = async () => ({ ok: false, status: 503, text: async () => JSON.stringify({ error: 'ai-not-configured' }) })
    const m = await import(proxyUrl + '?t=' + (Date.now() + 6))
    const r = await m.semanticSearchViaServer({ query: 'q', candidateSummaries: [] })
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/ai-not-configured/)
  })
})