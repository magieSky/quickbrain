import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'

describe('schema', () => {
  let db

  beforeEach(() => {
    db = new Database(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  it('creates notes table with all columns', () => {
    const fs = require('fs')
    const path = require('path')
    const schema = fs.readFileSync(
      path.join(__dirname, '..', '..', 'main', 'db', 'schema.sql'),
      'utf8'
    )
    db.exec(schema)

    const cols = db.prepare('PRAGMA table_info(notes)').all()
    const names = cols.map(c => c.name)
    expect(names).toContain('id')
    expect(names).toContain('content')
    expect(names).toContain('title')
    expect(names).toContain('category')
    expect(names).toContain('tags')
    expect(names).toContain('is_formatted')
    expect(names).toContain('original_content')
    expect(names).toContain('created_at')
    expect(names).toContain('updated_at')
  })

  it('creates notes_fts virtual table', () => {
    const fs = require('fs')
    const path = require('path')
    const schema = fs.readFileSync(
      path.join(__dirname, '..', '..', 'main', 'db', 'schema.sql'),
      'utf8'
    )
    db.exec(schema)

    const result = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='notes_fts'"
    ).get()
    expect(result).toBeDefined()
  })

  it('creates notes_pinyin table', () => {
    const fs = require('fs')
    const path = require('path')
    const schema = fs.readFileSync(
      path.join(__dirname, '..', '..', 'main', 'db', 'schema.sql'),
      'utf8'
    )
    db.exec(schema)

    const result = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='notes_pinyin'"
    ).get()
    expect(result).toBeDefined()
  })
})