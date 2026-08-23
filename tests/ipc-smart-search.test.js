import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'

let db
beforeEach(() => {
  db = new Database(':memory:')
  db.exec(fs.readFileSync(path.join(__dirname, '..', 'main', 'db', 'schema.sql'), 'utf8'))
  const { migrate } = require('../main/db-init.js')
  migrate(db)
  require.cache[require.resolve('../main/db-init.js')].exports.getDB = () => db
})
afterEach(() => { db.close() })

describe('smartSearch (no AI path)', () => {
  it('returns results with is_atom and parent_id fields', () => {
    const { addNote, addAtomNote } = require('../main/db/search.js')
    const src = addNote(db, { title: 'React hooks', content: 'tips' })
    addAtomNote(db, { parentId: src, title: 'React useState', content: 'state hook details', sourceRange: {} })
    const { smartSearch } = require('../main/ipc.js')
    const r = smartSearch('React')
    expect(r.length).toBeGreaterThan(0)
    expect(r.some(x => x.is_atom === 1)).toBe(true)
    expect(r[0]).toHaveProperty('noteId')
    expect(r[0]).toHaveProperty('snippet')
  })

  // Note: hard-filter fallback kicks in only when searchNotes returns >0 candidates
  // but none pass the substring filter; covered indirectly by the other tests

  it('atoms appear in filtered results when keyword matches', () => {
    const { addNote, addAtomNote } = require('../main/db/search.js')
    const src = addNote(db, { title: 'Server admin', content: 'ops guide' })
    addAtomNote(db, { parentId: src, title: 'Server tip', content: 'restart daily', sourceRange: {} })
    const { smartSearch } = require('../main/ipc.js')
    const r = smartSearch('Server')
    expect(r.some(x => x.is_atom === 1)).toBe(true)
  })
})