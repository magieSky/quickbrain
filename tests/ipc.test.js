import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRequire } from 'module'
import path from 'path'

const req = createRequire(import.meta.url)
const Module = await import('module')

// Intercept CJS requires via Module._cache hijack (vi.mock does not intercept
// CJS require() chains for plain .js files in vitest 1.x).
const mockHandlers = {}
const electronStub = {
  ipcMain: {
    handle: (channel, handler) => { mockHandlers[channel] = handler },
    on: (channel, handler) => { mockHandlers[channel] = handler }
  },
  BrowserWindow: { fromWebContents: vi.fn() }
}
const electronResolved = req.resolve('electron')
Module.default._cache[electronResolved] = { exports: electronStub, id: electronResolved, loaded: true, children: [], paths: [] }

const mockAddNote = vi.fn().mockReturnValue(1)
const mockSearchNotes = vi.fn().mockReturnValue([{ id: 1, title: 'test' }])

const searchStub = {
  addNote: (...args) => mockAddNote(...args),
  searchNotes: (...args) => mockSearchNotes(...args)
}
const searchResolved = req.resolve('../main/db/search.js')
Module.default._cache[searchResolved] = { exports: searchStub, id: searchResolved, loaded: true, children: [], paths: [] }

const mockGetDB = vi.fn().mockReturnValue({
  prepare: vi.fn().mockReturnValue({
    run: vi.fn(),
    get: vi.fn().mockReturnValue({ id: 1 }),
    all: vi.fn().mockReturnValue([])
  })
})
const dbInitStub = { getDB: mockGetDB }
const dbInitResolved = req.resolve('../main/db-init.js')
Module.default._cache[dbInitResolved] = { exports: dbInitStub, id: dbInitResolved, loaded: true, children: [], paths: [] }

describe('ipc', () => {
  beforeEach(async () => {
    Object.keys(mockHandlers).forEach(k => delete mockHandlers[k])
    vi.resetModules()
    const ipcModule = await import('../main/ipc.js')
    ipcModule.registerIpcHandlers()
  })

  it('registers add-note handler', () => {
    expect(mockHandlers['add-note']).toBeDefined()
  })

  it('registers search-notes handler', () => {
    expect(mockHandlers['search-notes']).toBeDefined()
  })

  it('registers format-with-ai handler', () => {
    expect(mockHandlers['format-with-ai']).toBeDefined()
  })

  it('search-notes handler calls searchNotes', async () => {
    const result = await mockHandlers['search-notes'](null, { search: 'hello' })
    expect(mockSearchNotes).toHaveBeenCalled()
    expect(result).toEqual([{ id: 1, title: 'test' }])
  })
})