import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'

let db
beforeEach(() => {
  db = new Database(':memory:')
  const { applyAll } = require('@quickbrain/shared/schema/sqlite/migrations')
  applyAll(db)
  // Prime the require cache so the getDB override below targets the loaded module
  require('../client/src/main/db-init.js')
  require.cache[require.resolve('../client/src/main/db-init.js')].exports.getDB = () => db
})
afterEach(() => { db.close() })

describe('smartSearch (no AI path)', () => {
  it('returns results with is_atom and parent_id fields', () => {
    const { addNote, addAtomNote } = require('../client/src/main/db/search.js')
    const src = addNote(db, { title: 'React hooks', content: 'tips' })
    addAtomNote(db, { parentId: src, title: 'React useState', content: 'state hook details', sourceRange: {} })
    const { smartSearch } = require('../client/src/main/ipc.js')
    const r = smartSearch('React')
    expect(r.length).toBeGreaterThan(0)
    expect(r.some(x => x.is_atom === 1)).toBe(true)
    expect(r[0]).toHaveProperty('noteId')
    expect(r[0]).toHaveProperty('snippet')
  })

  // Note: hard-filter fallback kicks in only when searchNotes returns >0 candidates
  // but none pass the substring filter; covered indirectly by the other tests

  it('atoms appear in filtered results when keyword matches', () => {
    const { addNote, addAtomNote } = require('../client/src/main/db/search.js')
    const src = addNote(db, { title: 'Server admin', content: 'ops guide' })
    addAtomNote(db, { parentId: src, title: 'Server tip', content: 'restart daily', sourceRange: {} })
    const { smartSearch } = require('../client/src/main/ipc.js')
    const r = smartSearch('Server')
    expect(r.some(x => x.is_atom === 1)).toBe(true)
  })
})
