import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'module'

const req = createRequire(import.meta.url)

let Database, db, tmp, addNote, outbox
beforeEach(async () => {
  const mod = await import('better-sqlite3')
  Database = mod.default || mod
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qb-priv-'))
  db = new Database(tmp + '/test.db')
  const { applyAll } = req('@quickbrain/shared/schema/sqlite/migrations')
  applyAll(db)
  const searchMod = req('../client/src/main/db/search.js')
  addNote = searchMod.addNote
  outbox = req('../client/src/main/sync/outbox')
})
afterEach(() => {
  try { db.close() } catch {}
  try { fs.rmSync(tmp, { recursive: true, force: true }) } catch {}
})

describe('addNote + is_private plumbing', () => {
  it('addNote defaults is_private to 1 (private) when the caller does not pass it', () => {
    const id = addNote(db, { title: 't', content: 'c' })
    const row = db.prepare('SELECT is_private FROM notes WHERE id = ?').get(id)
    expect(row.is_private).toBe(1)
  })

  it('addNote honours is_private: 0 (public) when the caller passes it', () => {
    const id = addNote(db, { title: 't', content: 'c', is_private: 0 })
    const row = db.prepare('SELECT is_private FROM notes WHERE id = ?').get(id)
    expect(row.is_private).toBe(0)
  })

  it('addNote honours is_private: 1 (private) explicitly', () => {
    const id = addNote(db, { title: 't', content: 'c', is_private: 1 })
    const row = db.prepare('SELECT is_private FROM notes WHERE id = ?').get(id)
    expect(row.is_private).toBe(1)
  })

  it('rowToNote exposes is_private as 0 or 1 for the renderer', () => {
    const { rowToNote } = req('../client/src/main/db/search.js')
    const pubId = addNote(db, { title: 'pub', content: 'p', is_private: 0 })
    const privId = addNote(db, { title: 'priv', content: 'p', is_private: 1 })
    expect(rowToNote(db.prepare('SELECT * FROM notes WHERE id = ?').get(pubId)).is_private).toBe(0)
    expect(rowToNote(db.prepare('SELECT * FROM notes WHERE id = ?').get(privId)).is_private).toBe(1)
  })

  it('the schema index on is_private exists so the bulk-migration filter stays cheap', () => {
    const idx = db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_notes_is_private'").get()
    expect(idx).toBeDefined()
  })
})
