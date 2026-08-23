import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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

describe('extractAtomsForSource', () => {
  it('returns ai-not-configured when no service', async () => {
    const { setExtractorAIService, extractAtomsForSource } = require('../main/notes-extractor.js')
    setExtractorAIService(null)
    const { addNote } = require('../main/db/search.js')
    const id = addNote(db, { title: 't', content: 'c' })
    const r = await extractAtomsForSource(id)
    expect(r.ok).toBe(false)
    expect(r.error).toBe('ai-not-configured')
  })

  it('happy path inserts atoms and stamps extracted_at', async () => {
    const { setExtractorAIService, extractAtomsForSource } = require('../main/notes-extractor.js')
    const fakeAi = { extractAtoms: vi.fn().mockResolvedValue([
      { title: 'A', content: 'a', source_range: { start: 0, end: 1 } },
      { title: 'B', content: 'b', source_range: { start: 1, end: 2 } }
    ]) }
    setExtractorAIService(fakeAi)
    const { addNote, getSourceNotes } = require('../main/db/search.js')
    const id = addNote(db, { title: 't', content: 'content here' })
    const r = await extractAtomsForSource(id)
    expect(r.ok).toBe(true)
    expect(r.count).toBe(2)
    expect(getSourceNotes(db).length).toBe(1)
    expect(db.prepare('SELECT count(*) c FROM notes WHERE is_atom=1').get().c).toBe(2)
    const row = db.prepare('SELECT extracted_at FROM notes WHERE id=?').get(id)
    expect(row.extracted_at).toBeGreaterThan(0)
  })

  it('marks source as failed on AI error', async () => {
    const { setExtractorAIService, extractAtomsForSource } = require('../main/notes-extractor.js')
    setExtractorAIService({ extractAtoms: vi.fn().mockRejectedValue(new Error('boom')) })
    const { addNote } = require('../main/db/search.js')
    const id = addNote(db, { title: 't', content: 'c' })
    const r = await extractAtomsForSource(id)
    expect(r.ok).toBe(false)
    const row = db.prepare('SELECT extracted_at FROM notes WHERE id=?').get(id)
    expect(row.extracted_at).toBe(-1)
  })

  it('skips when source already extracted (no force)', async () => {
    const { setExtractorAIService, extractAtomsForSource } = require('../main/notes-extractor.js')
    const fakeAi = { extractAtoms: vi.fn() }
    setExtractorAIService(fakeAi)
    const { addNote } = require('../main/db/search.js')
    const id = addNote(db, { title: 't', content: 'c' })
    db.prepare('UPDATE notes SET extracted_at = ? WHERE id = ?').run(Date.now(), id)
    const r = await extractAtomsForSource(id)
    expect(r.ok).toBe(true)
    expect(r.skipped).toBe(true)
    expect(fakeAi.extractAtoms).not.toHaveBeenCalled()
  })

  it('force=true re-extracts and deletes existing atoms', async () => {
    const { setExtractorAIService, extractAtomsForSource } = require('../main/notes-extractor.js')
    const fakeAi = { extractAtoms: vi.fn().mockResolvedValue([
      { title: 'New', content: 'n', source_range: { start: 0, end: 1 } }
    ]) }
    setExtractorAIService(fakeAi)
    const { addNote, addAtomNote } = require('../main/db/search.js')
    const id = addNote(db, { title: 't', content: 'c' })
    addAtomNote(db, { parentId: id, title: 'Old', content: 'o', sourceRange: {} })
    expect(db.prepare('SELECT count(*) c FROM notes WHERE is_atom=1').get().c).toBe(1)
    const r = await extractAtomsForSource(id, { force: true })
    expect(r.ok).toBe(true)
    expect(r.count).toBe(1)
    const atoms = db.prepare('SELECT title FROM notes WHERE is_atom=1').all()
    expect(atoms.length).toBe(1)
    expect(atoms[0].title).toBe('New')
  })

  it('returns not-found for missing source id', async () => {
    const { setExtractorAIService, extractAtomsForSource } = require('../main/notes-extractor.js')
    setExtractorAIService({ extractAtoms: vi.fn() })
    const r = await extractAtomsForSource(99999)
    expect(r.ok).toBe(false)
    expect(r.error).toBe('not-found')
  })
})