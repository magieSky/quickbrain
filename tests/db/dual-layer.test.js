import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { addNote, addAtomNote, getSourceNotes, searchNotes, getNoteById } from '../../main/db/search.js'
import { migrate } from '../../main/db-init.js'

function freshDb() {
  const db = new Database(':memory:')
  db.exec(fs.readFileSync(path.join(__dirname, '..', '..', 'main', 'db', 'schema.sql'), 'utf8'))
  migrate(db)
  return db
}

let db
beforeEach(() => { db = freshDb() })
afterEach(() => { db.close() })

describe('dual-layer notes', () => {
  it('addAtomNote creates atom linked to parent', () => {
    const src = addNote(db, { title: 'Source', content: 'Long article...' })
    addAtomNote(db, {
      parentId: src,
      title: 'Key point',
      content: 'One sentence insight',
      sourceRange: { start: 0, end: 18 }
    })
    const atom = searchNotes(db, 'insight')[0]
    expect(atom.is_atom).toBe(1)
    expect(atom.parent_id).toBe(src)
    expect(JSON.parse(atom.source_range)).toEqual({ start: 0, end: 18 })
  })

  it('getSourceNotes returns only sources', () => {
    const src = addNote(db, { title: 'A', content: 'content a' })
    addAtomNote(db, { parentId: src, title: 'B', content: 'content b', sourceRange: {} })
    const sources = getSourceNotes(db)
    expect(sources.length).toBe(1)
    expect(sources[0].id).toBe(src)
    expect(sources[0].is_atom).toBe(0)
  })

  it('getSourceNotes filters by onlyUnExtracted', () => {
    const a = addNote(db, { title: 'A', content: 'x' })
    const b = addNote(db, { title: 'B', content: 'y' })
    db.prepare('UPDATE notes SET extracted_at = ? WHERE id = ?').run(Date.now(), a)
    const pending = getSourceNotes(db, { onlyUnExtracted: true })
    expect(pending.length).toBe(1)
    expect(pending[0].id).toBe(b)
  })

  it('getSourceNotes filters by keyword', () => {
    const a = addNote(db, { title: 'React hooks', content: 'tips' })
    addNote(db, { title: 'Other', content: 'unrelated' })
    const r = getSourceNotes(db, { keyword: 'React' })
    expect(r.length).toBe(1)
    expect(r[0].id).toBe(a)
  })

  it('searchNotes result includes is_atom and parent_id', () => {
    const src = addNote(db, { title: 'React', content: 'hooks tips' })
    addAtomNote(db, { parentId: src, title: 'React hooks detail', content: 'useState', sourceRange: {} })
    const r = searchNotes(db, 'React')
    expect(r.some(n => n.is_atom === 1)).toBe(true)
    expect(r.some(n => n.parent_id === src)).toBe(true)
  })

  it('getNoteById exposes new fields', () => {
    const src = addNote(db, { title: 'X', content: 'y' })
    addAtomNote(db, { parentId: src, title: 'Z', content: 'w', sourceRange: { start: 1, end: 5 } })
    const atom = getNoteById(db, getNoteById(db, src) ? 1 : src) // dummy
    // Use direct lookup
    const atomRow = db.prepare('SELECT * FROM notes WHERE is_atom = 1').get()
    const mapped = getNoteById(db, atomRow.id)
    expect(mapped.is_atom).toBe(1)
    expect(mapped.parent_id).toBe(src)
    expect(mapped.source_range).toBe('{"start":1,"end":5}')
  })

  it('deleting source cascades to atoms via FK', () => {
    const src = addNote(db, { title: 'Parent', content: 'p' })
    addAtomNote(db, { parentId: src, title: 'A1', content: 'a', sourceRange: {} })
    addAtomNote(db, { parentId: src, title: 'A2', content: 'b', sourceRange: {} })
    db.prepare('DELETE FROM notes WHERE id = ?').run(src)
    const remaining = db.prepare('SELECT count(*) c FROM notes WHERE is_atom = 1').get().c
    expect(remaining).toBe(0)
  })

})
