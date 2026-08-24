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

function freshTmp() {
  return nodeFs.mkdtempSync(path.join(os.tmpdir(), 'qb-ipc-proxy-'))
}

function writeConfig(tmpDir, obj) {
  electronStub.app.getPath.mockReturnValue(tmpDir)
  nodeFs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify(obj))
}

describe('ipc AI handlers proxy routing', () => {
  let tmp
  let proxyMock

  beforeEach(async () => {
    Object.keys(mockHandlers).forEach(k => delete mockHandlers[k])
    vi.resetModules()
    if (tmp && nodeFs.existsSync(tmp)) nodeFs.rmSync(tmp, { recursive: true, force: true })
    tmp = freshTmp()

    proxyMock = {
      formatViaServer: vi.fn().mockResolvedValue({ success: true, formattedContent: '[server-formatted]' }),
      categorizeViaServer: vi.fn().mockResolvedValue({ success: true, tags: ['server-tag'] }),
      semanticSearchViaServer: vi.fn().mockResolvedValue({ success: true, results: [] }),
      getProxyContext: vi.fn()
    }
    const proxyResolved = req.resolve('../client/src/main/ai/server-proxy.js')
    Module.default._cache[proxyResolved] = { exports: proxyMock, id: proxyResolved, loaded: true, children: [], paths: [] }
  })

  it('format-with-ai routes through server proxy when proxy ctx exists', async () => {
    proxyMock.getProxyContext.mockReturnValue({ serverUrl: 'http://s', bearer: 'tk', deviceId: 'd1' })
    writeConfig(tmp, { ai: { serverUrl: 'http://s', serverToken: 'tk', deviceId: 'd1' } })

    const ipcModule = await import('../client/src/main/ipc.js')
    ipcModule.registerIpcHandlers()

    const r = await mockHandlers['format-with-ai'](null, { content: 'hi', style: 'summary' })
    expect(proxyMock.formatViaServer).toHaveBeenCalledWith({ content: 'hi', style: 'summary' })
    expect(r.formattedContent).toBe('[server-formatted]')
  })

  it('format-with-ai falls back to local aiService when proxy ctx is null', async () => {
    proxyMock.getProxyContext.mockReturnValue(null)
    writeConfig(tmp, {})

    const localSvc = { formatContent: vi.fn().mockResolvedValue({ success: true, formattedContent: '[local-formatted]' }) }
    const ipcModule = await import('../client/src/main/ipc.js')
    ipcModule.registerIpcHandlers()
    ipcModule.setAIService(localSvc)

    const r = await mockHandlers['format-with-ai'](null, { content: 'hi', style: null })
    expect(proxyMock.formatViaServer).not.toHaveBeenCalled()
    expect(localSvc.formatContent).toHaveBeenCalledWith('hi', null)
    expect(r.formattedContent).toBe('[local-formatted]')
  })

  it('categorize-with-ai routes through server proxy when proxy ctx exists', async () => {
    proxyMock.getProxyContext.mockReturnValue({ serverUrl: 'http://s', bearer: 'tk', deviceId: 'd1' })
    writeConfig(tmp, { ai: { serverUrl: 'http://s', serverToken: 'tk', deviceId: 'd1' } })

    const ipcModule = await import('../client/src/main/ipc.js')
    ipcModule.registerIpcHandlers()

    const r = await mockHandlers['categorize-with-ai'](null, { content: 'doc body' })
    expect(proxyMock.categorizeViaServer).toHaveBeenCalledWith({ content: 'doc body' })
    expect(r.tags).toEqual(['server-tag'])
  })

  it('categorize-with-ai falls back to local aiService when proxy ctx is null', async () => {
    proxyMock.getProxyContext.mockReturnValue(null)
    writeConfig(tmp, { ai: { mode: 'direct' } })

    const localSvc = { categorizeContent: vi.fn().mockResolvedValue({ success: true, tags: ['local-tag'] }) }
    const ipcModule = await import('../client/src/main/ipc.js')
    ipcModule.registerIpcHandlers()
    ipcModule.setAIService(localSvc)

    const r = await mockHandlers['categorize-with-ai'](null, { content: 'x' })
    expect(proxyMock.categorizeViaServer).not.toHaveBeenCalled()
    expect(localSvc.categorizeContent).toHaveBeenCalledWith('x')
    expect(r.tags).toEqual(['local-tag'])
  })
})