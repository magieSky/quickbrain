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
  formatViaServer: vi.fn().mockResolvedValue({ success: true, formattedContent: '' }),
  categorizeViaServer: vi.fn().mockResolvedValue({ success: true, tags: [] }),
  semanticSearchViaServer: vi.fn().mockResolvedValue({ success: true, results: [] }),
  getProxyContext: vi.fn().mockReturnValue(null)
}
const proxyResolved = req.resolve('../client/src/main/ai/server-proxy.js')
Module.default._cache[proxyResolved] = { exports: proxyStub, id: proxyResolved, loaded: true, children: [], paths: [] }

function freshTmp() {
  return nodeFs.mkdtempSync(path.join(os.tmpdir(), 'qb-ipc-savecfg-'))
}

function writeConfig(tmpDir, obj) {
  electronStub.app.getPath.mockReturnValue(tmpDir)
  nodeFs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify(obj))
}

function readConfig(tmpDir) {
  return JSON.parse(nodeFs.readFileSync(path.join(tmpDir, 'config.json'), 'utf8'))
}

describe('ipc save-ai-config preserves config fields', () => {
  let tmp

  beforeEach(async () => {
    Object.keys(mockHandlers).forEach(k => delete mockHandlers[k])
    vi.resetModules()
    if (tmp && nodeFs.existsSync(tmp)) nodeFs.rmSync(tmp, { recursive: true, force: true })
    tmp = freshTmp()
  })

  it('merges new ai config with existing ai.mode + sync.* fields (does not overwrite)', async () => {
    writeConfig(tmp, {
      ai: { mode: 'server' },
      sync: { enabled: true, serverUrl: 'https://sync.example', token: 'tk-xyz', deviceId: 'd-1' },
      ui: { lastTab: 'docs' }
    })

    const ipcModule = await import('../client/src/main/ipc.js')
    ipcModule.registerIpcHandlers()

    const r = await mockHandlers['save-ai-config'](null, {
      provider: 'deepseek',
      apiKey: 'sk-new',
      model: 'deepseek-chat',
      serverUrl: 'https://ai.example',
      serverToken: 'st-new'
    })
    expect(r.success).toBe(true)

    const saved = readConfig(tmp)
    expect(saved.ai.mode).toBe('server')
    expect(saved.sync.enabled).toBe(true)
    expect(saved.sync.serverUrl).toBe('https://sync.example')
    expect(saved.sync.token).toBe('tk-xyz')
    expect(saved.sync.deviceId).toBe('d-1')
    expect(saved.ui.lastTab).toBe('docs')
    expect(saved.provider).toBe('deepseek')
    expect(saved.apiKey).toBe('sk-new')
  })

  it('keeps existing apiKey when incoming apiKey is empty (provider switch case)', async () => {
    writeConfig(tmp, { apiKey: 'sk-old', provider: 'deepseek' })

    const ipcModule = await import('../client/src/main/ipc.js')
    ipcModule.registerIpcHandlers()

    const r = await mockHandlers['save-ai-config'](null, {
      provider: 'ollama',
      apiKey: ''
    })
    expect(r.success).toBe(true)
    const saved = readConfig(tmp)
    expect(saved.provider).toBe('ollama')
    expect(saved.apiKey).toBe('sk-old')
  })

  it('switching to ollama (no apiKey required) succeeds without key', async () => {
    writeConfig(tmp, {})

    const ipcModule = await import('../client/src/main/ipc.js')
    ipcModule.registerIpcHandlers()

    const r = await mockHandlers['save-ai-config'](null, {
      provider: 'ollama',
      apiKey: ''
    })
    expect(r.success).toBe(true)
    const saved = readConfig(tmp)
    expect(saved.provider).toBe('ollama')
  })

  it('rejects provider that requires apiKey when no existing key and no new key supplied', async () => {
    writeConfig(tmp, {})

    const ipcModule = await import('../client/src/main/ipc.js')
    ipcModule.registerIpcHandlers()

    const r = await mockHandlers['save-ai-config'](null, {
      provider: 'deepseek',
      apiKey: ''
    })
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/API Key/)
  })

  it('rejects unknown provider', async () => {
    writeConfig(tmp, {})

    const ipcModule = await import('../client/src/main/ipc.js')
    ipcModule.registerIpcHandlers()

    const r = await mockHandlers['save-ai-config'](null, {
      provider: 'mystery-provider',
      apiKey: ''
    })
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/provider/i)
  })
})