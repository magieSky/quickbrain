import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRequire } from 'module'
import path from 'path'
import nodeFs from 'fs'
import os from 'os'

const req = createRequire(import.meta.url)
const Module = await import('module')

const mockHandlers = {}
const electronStub = {
  ipcMain: {
    handle: (channel, handler) => { mockHandlers[channel] = handler },
    on: (channel, handler) => { mockHandlers[channel] = handler }
  },
  BrowserWindow: { fromWebContents: vi.fn(), getAllWindows: vi.fn(() => []) },
  app: { relaunch: vi.fn(), quit: vi.fn(), getPath: vi.fn() },
  shell: { showItemInFolder: vi.fn(), openExternal: vi.fn() },
  clipboard: { writeText: vi.fn() },
  Notification: vi.fn()
}
const electronResolved = req.resolve('electron')
Module.default._cache[electronResolved] = { exports: electronStub, id: electronResolved, loaded: true, children: [], paths: [] }

const mockGetDB = vi.fn().mockReturnValue({
  prepare: vi.fn().mockReturnValue({ run: vi.fn(), get: vi.fn(), all: vi.fn() })
})
const dbInitResolved = req.resolve('../client/src/main/db-init.js')
Module.default._cache[dbInitResolved] = { exports: { getDB: mockGetDB }, id: dbInitResolved, loaded: true, children: [], paths: [] }

const searchStub = {
  addNote: vi.fn().mockReturnValue(1),
  searchNotes: vi.fn().mockReturnValue([]),
  getNoteById: vi.fn().mockReturnValue(null),
  getRecentNotes: vi.fn().mockReturnValue([])
}
const searchResolved = req.resolve('../client/src/main/db/search.js')
Module.default._cache[searchResolved] = { exports: searchStub, id: searchResolved, loaded: true, children: [], paths: [] }

const importStub = { importDocument: vi.fn().mockReturnValue({ ok: true, count: 0 }) }
const importResolved = req.resolve('../client/src/main/import/store.js')
Module.default._cache[importResolved] = { exports: importStub, id: importResolved, loaded: true, children: [], paths: [] }

const autoLaunchStub = { isEnabled: vi.fn().mockResolvedValue(false), setEnabled: vi.fn().mockResolvedValue(true) }
const autoLaunchResolved = req.resolve('../client/src/main/auto-launch-service.js')
Module.default._cache[autoLaunchResolved] = { exports: autoLaunchStub, id: autoLaunchResolved, loaded: true, children: [], paths: [] }

const pipeBridgeStub = { startServer: vi.fn() }
const pipeBridgeResolved = req.resolve('../client/src/main/named-pipe-bridge.js')
Module.default._cache[pipeBridgeResolved] = { exports: pipeBridgeStub, id: pipeBridgeResolved, loaded: true, children: [], paths: [] }

const proxyStub = {
  formatViaServer: vi.fn(), categorizeViaServer: vi.fn(), semanticSearchViaServer: vi.fn(),
  getProxyContext: vi.fn().mockReturnValue(null)
}
const proxyResolved = req.resolve('../client/src/main/ai/server-proxy.js')
Module.default._cache[proxyResolved] = { exports: proxyStub, id: proxyResolved, loaded: true, children: [], paths: [] }

function freshTmp() {
  return nodeFs.mkdtempSync(path.join(os.tmpdir(), 'qb-savecfg-'))
}

function seedConfig(tmpDir, obj) {
  electronStub.app.getPath.mockReturnValue(tmpDir)
  if (obj !== null) nodeFs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify(obj))
}

describe('ipc save-ai-config preserves unrelated config fields', () => {
  let tmp

  beforeEach(async () => {
    Object.keys(mockHandlers).forEach(k => delete mockHandlers[k])
    vi.resetModules()
    if (tmp && nodeFs.existsSync(tmp)) nodeFs.rmSync(tmp, { recursive: true, force: true })
    tmp = freshTmp()
    const ipcModule = await import('../client/src/main/ipc.js')
    ipcModule.registerIpcHandlers()
  })

  it('preserves ai.mode and sync.* when saving provider config', async () => {
    seedConfig(tmp, {
      provider: 'deepseek', apiKey: 'old-key', model: 'deepseek-chat',
      ai: { mode: 'server' },
      sync: { enabled: true, serverUrl: 'http://s:7422', token: 'tk', deviceId: 'd1' }
    })
    const r = await mockHandlers['save-ai-config'](null, {
      provider: 'moonshot', apiKey: 'new-key', model: 'moonshot-v1-8k', baseURL: null
    })
    expect(r.success).toBe(true)
    const written = JSON.parse(nodeFs.readFileSync(path.join(tmp, 'config.json'), 'utf8'))
    expect(written.provider).toBe('moonshot')
    expect(written.apiKey).toBe('new-key')
    expect(written.model).toBe('moonshot-v1-8k')
    expect(written.ai).toEqual({ mode: 'server' })
    expect(written.sync).toEqual({ enabled: true, serverUrl: 'http://s:7422', token: 'tk', deviceId: 'd1' })
  })

  it('keeps existing apiKey when cfg.apiKey is empty/whitespace', async () => {
    seedConfig(tmp, { provider: 'deepseek', apiKey: 'preserved-key', model: 'deepseek-chat' })
    const r1 = await mockHandlers['save-ai-config'](null, { provider: 'deepseek', apiKey: '', model: 'deepseek-chat' })
    expect(r1.success).toBe(true)
    let written = JSON.parse(nodeFs.readFileSync(path.join(tmp, 'config.json'), 'utf8'))
    expect(written.apiKey).toBe('preserved-key')
    const r2 = await mockHandlers['save-ai-config'](null, { provider: 'deepseek', apiKey: '   ', model: 'deepseek-chat' })
    expect(r2.success).toBe(true)
    written = JSON.parse(nodeFs.readFileSync(path.join(tmp, 'config.json'), 'utf8'))
    expect(written.apiKey).toBe('preserved-key')
  })

  it('rejects provider switch to ollama without preserving key but allows empty', async () => {
    seedConfig(tmp, { provider: 'deepseek', apiKey: 'k', model: 'm' })
    const r = await mockHandlers['save-ai-config'](null, { provider: 'ollama', apiKey: '', model: 'qwen2.5:7b', baseURL: 'http://localhost:11434/v1' })
    expect(r.success).toBe(true)
    const written = JSON.parse(nodeFs.readFileSync(path.join(tmp, 'config.json'), 'utf8'))
    expect(written.provider).toBe('ollama')
    expect(written.apiKey).toBe('k')
  })

  it('fails when requiresApiKey provider is selected and no key exists anywhere', async () => {
    seedConfig(tmp, { ai: { mode: 'direct' } })
    const r = await mockHandlers['save-ai-config'](null, { provider: 'deepseek', apiKey: '', model: 'deepseek-chat' })
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/API Key/i)
  })

  it('rejects unknown provider', async () => {
    seedConfig(tmp, {})
    const r = await mockHandlers['save-ai-config'](null, { provider: 'unknown-provider', apiKey: 'k', model: 'm' })
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/provider/i)
  })
})