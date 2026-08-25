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

const mockGetNoteById = vi.fn().mockReturnValue({ id: 1, title: 'test', content: 'x' })
const searchStub = {
  addNote: (...args) => mockAddNote(...args),
  searchNotes: (...args) => mockSearchNotes(...args),
  getNoteById: (...args) => mockGetNoteById(...args)
}
const searchResolved = req.resolve('../client/src/main/db/search.js')
Module.default._cache[searchResolved] = { exports: searchStub, id: searchResolved, loaded: true, children: [], paths: [] }

const mockGetDB = vi.fn().mockReturnValue({
  prepare: vi.fn().mockReturnValue({
    run: vi.fn(),
    get: vi.fn((id) => (id === 1 ? { id: 1, title: 'test', content: 'x', is_private: 0, tags: '[]' } : null)),
    all: vi.fn().mockReturnValue([])
  })
})
const dbInitStub = { getDB: mockGetDB }
const dbInitResolved = req.resolve('../client/src/main/db-init.js')
Module.default._cache[dbInitResolved] = { exports: dbInitStub, id: dbInitResolved, loaded: true, children: [], paths: [] }

describe('ipc', () => {
  beforeEach(async () => {
    Object.keys(mockHandlers).forEach(k => delete mockHandlers[k])
    vi.resetModules()
    const ipcModule = await import('../client/src/main/ipc.js')
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

  it('registers get-note handler', () => {
    expect(mockHandlers['get-note']).toBeDefined()
  })

  it('get-note handler calls getNoteById', async () => {
    const result = await mockHandlers['get-note'](null, 1)
    expect(mockGetNoteById).toHaveBeenCalled()
    expect(result).toEqual({ id: 1, title: 'test', content: 'x' })
  })

  it('registers write-clipboard handler', () => {
    expect(mockHandlers['write-clipboard']).toBeDefined()
  })

  it('registers notify handler', () => {
    expect(mockHandlers['notify']).toBeDefined()
  })

  it('registers relaunch and quit handlers', () => {
    expect(mockHandlers['relaunch']).toBeDefined()
    expect(mockHandlers['quit']).toBeDefined()
  })

  it('registers open-editor handler', () => {
    expect(mockHandlers['open-editor']).toBeDefined()
  })

  it('registers editor-save handler', () => {
    expect(mockHandlers['editor-save']).toBeDefined()
  })

  it('open-editor returns missing-id when id is null', async () => {
    const r = await mockHandlers['open-editor'](null, null)
    expect(r.ok).toBe(false)
    expect(r.error).toBe('missing-id')
  })

  it('open-editor returns not-found for unknown id', async () => {
    const r = await mockHandlers['open-editor'](null, 99999)
    expect(r.ok).toBe(false)
    expect(r.error).toBe('not-found')
  })

  it('editor-save returns missing-id when id is null', async () => {
    const r = await mockHandlers['editor-save'](null, { id: null, title: 'x', content: 'y' })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('missing-id')
  })
})