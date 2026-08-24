import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { applyAll } from '@quickbrain/shared/schema/sqlite/migrations'

describe('schema (shared migrator)', () => {
  let db
  beforeEach(() => { db = new Database(':memory:') })
  afterEach(() => { db.close() })

  it('creates notes table with all columns', () => {
    applyAll(db)
    const cols = db.prepare('PRAGMA table_info(notes)').all()
    const names = cols.map(c => c.name)
    expect(names).toContain('id')
    expect(names).toContain('content')
    expect(names).toContain('title')
    expect(names).toContain('category')
    expect(names).toContain('tags')
    expect(names).toContain('is_formatted')
    expect(names).toContain('original_content')
    expect(names).toContain('client_id')
    expect(names).toContain('updated_at')
    expect(names).toContain('created_at')
  })

  it('creates notes_fts virtual table', () => {
    applyAll(db)
    const result = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='notes_fts'"
    ).get()
    expect(result).toBeDefined()
  })

  it('creates notes_pinyin table', () => {
    applyAll(db)
    const result = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='notes_pinyin'"
    ).get()
    expect(result).toBeDefined()
  })
})
