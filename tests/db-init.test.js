import { describe, it, expect, vi } from 'vitest'
import { createRequire } from 'module'

const req = createRequire(import.meta.url)

// Intercept CJS require('electron') by hijacking Module._cache.
const Module = await import('module')
const electronStub = {
  app: { getPath: vi.fn().mockReturnValue('/tmp/test-quickbrain') }
}
const electronResolved = req.resolve('electron')
Module.default._cache[electronResolved] = { exports: electronStub, id: electronResolved, loaded: true, children: [], paths: [] }

vi.mock('fs', () => {
  const fsMock = {
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue('-- mock schema --')
  }
  return {
    default: fsMock,
    ...fsMock
  }
})

vi.mock('better-sqlite3', () => {
  const Database = vi.fn().mockImplementation(() => ({
    exec: vi.fn(),
    prepare: vi.fn().mockReturnValue({ get: vi.fn(), run: vi.fn() })
  }))
  return {
    default: Database,
    Database
  }
})

describe('db-init', () => {
  it('initDatabase returns a database instance', async () => {
    const { initDatabase } = await import('../main/db-init.js')
    const db = await initDatabase()
    expect(db).toBeDefined()
  })
})
