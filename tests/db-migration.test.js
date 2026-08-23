import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrate } from '../main/db-init.js'

let db
beforeEach(() => { db = new Database(':memory:') })
afterEach(() => { db.close() })

describe('schema migration', () => {
  it('adds new columns to existing legacy table', () => {
    db.exec("CREATE TABLE notes (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, title TEXT DEFAULT '')")
    migrate(db)
    const cols = db.prepare('PRAGMA table_info(notes)').all().map(c => c.name)
    expect(cols).toContain('parent_id')
    expect(cols).toContain('source_range')
    expect(cols).toContain('is_atom')
    expect(cols).toContain('extracted_at')
  })

  it('is idempotent on fresh schema', () => {
    db.exec(require('fs').readFileSync('main/db/schema.sql', 'utf8'))
    expect(() => migrate(db)).not.toThrow()
    expect(() => migrate(db)).not.toThrow()
  })

  it('creates the new indexes', () => {
    db.exec("CREATE TABLE notes (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL)")
    migrate(db)
    const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='notes'").all().map(r => r.name)
    expect(idx).toContain('idx_notes_parent_id')
    expect(idx).toContain('idx_notes_is_atom')
  })
})