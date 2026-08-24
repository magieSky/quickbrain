import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { searchNotes, addNote } from '../../client/src/main/db/search.js'

function freshDb() {
  const db = new Database(':memory:')
  const { applyAll } = require('@quickbrain/shared/schema/sqlite/migrations')
  applyAll(db)
  return db
}

describe('search', () => {
  let db

  beforeEach(() => {
    db = freshDb()
  })

  afterEach(() => {
    db.close()
  })

  it('returns notes matching FTS5 query', () => {
    addNote(db, { title: 'React 笔记', content: '关于 Hooks', tags: [] })
    addNote(db, { title: 'Vue 笔记', content: '关于 Composition API', tags: [] })

    const results = searchNotes(db, 'React')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].title).toContain('React')
  })

  it('returns multiple notes for common query', () => {
    addNote(db, { title: 'A', content: 'react content', tags: [] })
    addNote(db, { title: 'B', content: 'react tutorial', tags: [] })

    const results = searchNotes(db, 'react')
    expect(results.length).toBe(2)
  })

  it('ranks title hits higher than content hits', () => {
    addNote(db, { title: 'Other', content: 'react here', tags: [] })
    addNote(db, { title: 'React Top', content: 'nothing relevant', tags: [] })

    const results = searchNotes(db, 'react')
    expect(results[0].title).toContain('React')
  })

  it('falls back to pinyin when FTS5 has weak results', () => {
    addNote(db, { title: '北京旅游', content: '故宫长城', tags: [] })

    const results = searchNotes(db, 'bj')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].title).toContain('北京')
  })

  it('returns empty array for no match', () => {
    addNote(db, { title: 'A', content: 'B', tags: [] })
    const results = searchNotes(db, 'xyz123nomatch')
    expect(results).toEqual([])
  })

  it('respects limit parameter', () => {
    for (let i = 0; i < 20; i++) {
      addNote(db, { title: `note ${i}`, content: 'common content', tags: [] })
    }
    const results = searchNotes(db, 'common', 5)
    expect(results.length).toBeLessThanOrEqual(5)
  })

  it('returns empty array for empty or whitespace query', () => {
    addNote(db, { title: 'A', content: 'B', tags: [] })
    expect(searchNotes(db, '')).toEqual([])
    expect(searchNotes(db, '   ')).toEqual([])
  })

  it('handles FTS5 special characters without crashing', () => {
    addNote(db, { title: 'Note', content: 'something', tags: [] })
    expect(() => searchNotes(db, '100%')).not.toThrow()
    expect(() => searchNotes(db, '(test)')).not.toThrow()
    expect(() => searchNotes(db, 'a:b')).not.toThrow()
  })

  it('addNote applies default values for missing fields', () => {
    const id = addNote(db, { content: 'just content' })
    expect(id).toBeGreaterThan(0)
    const row = db.prepare('SELECT title, category, tags, original_content FROM notes WHERE id = ?').get(id)
    expect(row.title).toBe('')
    expect(row.category).toBe('uncategorized')
    expect(row.tags).toBe('[]')
    expect(row.original_content).toBe('')
  })
})
