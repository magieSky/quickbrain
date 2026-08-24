import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'module'

const req = createRequire(import.meta.url)

// Use the native better-sqlite3 binding that ships with Node. The shared
// migrator + search.addNote only touch the local SQLite handle.
let Database
beforeAll(async () => {
  const mod = await import('better-sqlite3')
  Database = mod.default || mod
})

let db, tmp, nowBefore
const { addNote } = req('../client/src/main/db/search.js')
const { applyAll } = req('@quickbrain/shared/schema/sqlite/migrations')

describe('addNote stores updated_at as INTEGER ms epoch', () => {
  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qb-updated-'))
    db = new Database(tmp + '/test.db')
    applyAll(db)
    nowBefore = Date.now()
    addNote(db, { title: 't1', content: 'c1' })
  })
  afterAll(() => {
    try { db.close() } catch {}
    try { fs.rmSync(tmp, { recursive: true, force: true }) } catch {}
  })

  it('the freshly written row has updated_at as a finite integer near now', () => {
    const row = db.prepare('SELECT updated_at FROM notes ORDER BY id DESC LIMIT 1').get()
    expect(typeof row.updated_at).toBe('number')
    expect(Number.isFinite(row.updated_at)).toBe(true)
    // Should be within a 2-second window of nowBefore (since addNote ran inside this test).
    const delta = Math.abs(row.updated_at - nowBefore)
    expect(delta).toBeLessThan(2000)
  })

  it('every row after a fresh add has a ms-epoch updated_at, not a DATETIME string', () => {
    addNote(db, { title: 't2', content: 'c2' })
    const rows = db.prepare('SELECT updated_at FROM notes ORDER BY id DESC').all()
    for (const r of rows) {
      expect(typeof r.updated_at).toBe('number')
      expect(Number.isFinite(r.updated_at)).toBe(true)
    }
  })
})
