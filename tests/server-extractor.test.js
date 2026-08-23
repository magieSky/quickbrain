import { describe, it, expect } from 'vitest'

const extractorUrl = 'file:///' + require('node:path').resolve('server/src/extractor/index.js').replace(/\\/g, '/')

function fakeDb(sourceRow) {
  let inserted = []
  let deleted = []
  let updated = []
  return {
    _inserted: inserted,
    _deleted: deleted,
    _updated: updated,
    selectFrom: () => ({
      selectAll: () => ({
        where: (col, op, val) => ({
          executeTakeFirst: async () => sourceRow && sourceRow.client_id === val ? sourceRow : null
        })
      })
    }),
    insertInto: () => ({
      values: (v) => ({
        onConflict: () => ({
          doUpdateSet: () => ({
            executeTakeFirst: async () => { inserted.push(v); return { client_id: v.client_id } }
          }),
          executeTakeFirst: async () => { inserted.push(v); return { client_id: v.client_id } }
        })
      })
    }),
    updateTable: () => ({
      set: (set) => ({
        where: (col, op, val) => ({
          executeTakeFirst: async () => { updated.push({ set, val }); return { client_id: val } }
        })
      })
    }),
    deleteFrom: () => ({
      where: (col, op, val) => ({
        executeTakeFirst: async () => { deleted.push({ val }); return { count: 1 } }
      })
    })
  }
}

describe('server/src/extractor', () => {
  it('returns not-found when source row missing', async () => {
    const { extractAtomsForSource } = await import(extractorUrl)
    const db = fakeDb(null)
    const r = await extractAtomsForSource(db, 'missing', { aiService: null })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('not-found')
  })

  it('skips when source already extracted and not forced', async () => {
    const { extractAtomsForSource } = await import(extractorUrl)
    const db = fakeDb({ client_id: 'src-1', title: 't', content: 'c', extracted_at: 12345, is_atom: 0 })
    const r = await extractAtomsForSource(db, 'src-1', { aiService: null })
    expect(r.ok).toBe(true)
    expect(r.skipped).toBe(true)
  })

  it('stamps extracted_at = -1 when no aiService', async () => {
    const { extractAtomsForSource } = await import(extractorUrl)
    const db = fakeDb({ client_id: 'src-1', title: 't', content: 'c', extracted_at: null, is_atom: 0 })
    const r = await extractAtomsForSource(db, 'src-1', { aiService: null })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('ai-not-configured')
    expect(db._updated.length).toBeGreaterThan(0)
    expect(db._updated[0].set.extracted_at).toBe(-1)
  })

  it('inserts atoms with deterministic client_id and parent_id', async () => {
    const { extractAtomsForSource } = await import(extractorUrl)
    const db = fakeDb({ client_id: 'src-1', title: 't', content: 'c', extracted_at: null, is_atom: 0 })
    const aiService = {
      extractAtoms: async () => [
        { title: 'a1', content: 'A1', source_range: { start: 0, end: 10 } },
        { title: 'a2', content: 'A2', source_range: { start: 11, end: 20 } }
      ]
    }
    const r = await extractAtomsForSource(db, 'src-1', { aiService })
    expect(r.ok).toBe(true)
    expect(r.count).toBe(2)
    expect(db._inserted).toHaveLength(2)
    expect(db._inserted[0].client_id).toBe('src-1:atom:0')
    expect(db._inserted[0].parent_id).toBe('src-1')
    expect(db._inserted[0].is_atom).toBe(1)
    expect(db._inserted[1].client_id).toBe('src-1:atom:1')
  })

  it('force=true deletes existing atoms before reinserting', async () => {
    const { extractAtomsForSource } = await import(extractorUrl)
    const db = fakeDb({ client_id: 'src-1', title: 't', content: 'c', extracted_at: 999, is_atom: 0 })
    const aiService = { extractAtoms: async () => [{ title: 'new', content: 'N' }] }
    const r = await extractAtomsForSource(db, 'src-1', { aiService, force: true })
    expect(r.ok).toBe(true)
    expect(db._deleted).toHaveLength(1)
    expect(db._deleted[0].val).toBe('src-1')
  })

  it('stamps extracted_at on success', async () => {
    const { extractAtomsForSource } = await import(extractorUrl)
    const db = fakeDb({ client_id: 'src-1', title: 't', content: 'c', extracted_at: null, is_atom: 0 })
    const aiService = { extractAtoms: async () => [] }
    await extractAtomsForSource(db, 'src-1', { aiService })
    const last = db._updated[db._updated.length - 1]
    expect(last.set.extracted_at).toBeGreaterThan(0)
  })

  it('stamps extracted_at = -1 on AI error', async () => {
    const { extractAtomsForSource } = await import(extractorUrl)
    const db = fakeDb({ client_id: 'src-1', title: 't', content: 'c', extracted_at: null, is_atom: 0 })
    const aiService = { extractAtoms: async () => { throw new Error('boom') } }
    const r = await extractAtomsForSource(db, 'src-1', { aiService })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('boom')
    expect(db._updated[0].set.extracted_at).toBe(-1)
  })
})