import { describe, it, expect } from 'vitest'
import notes from '../server/src/services/notes.js'

function fakeDb({ stored = new Map() } = {}) {
  const builder = {
    selectFrom: () => ({
      selectAll: () => ({
        where: (col, op, val) => ({
          executeTakeFirst: async () => stored.get(val) || null,
          orderBy: () => ({ limit: () => ({ execute: async () => Array.from(stored.values()) }) }),
          execute: async () => Array.from(stored.values())
        })
      })
    }),
    insertInto: () => ({
      values: (v) => {
        const write = async (s) => { stored.set(v.client_id, { ...v, ...s }); return { client_id: v.client_id } };
        const chain = { onConflict: (cb) => chain, doUpdateSet: (s) => { chain._set = s; return chain }, executeTakeFirst: async () => write(chain._set || {}) };
        return chain;
      }
    }),
    updateTable: () => ({
      set: (s) => ({
        where: (col, op, val) => ({
          executeTakeFirst: async () => { const r = stored.get(val); if (r) stored.set(val, { ...r, ...s }); return r ? { client_id: val } : null },
          execute: async () => { stored.set(val, { ...stored.get(val), ...s }); return 1 }
        })
      })
    })
  };
  return builder;
}

describe('server notes service (LWW)', () => {
  it('accepts incoming row whose updated_at > stored', async () => {
    const db = fakeDb({ stored: new Map([['c1', { client_id: 'c1', updated_at: 100, rev: 1, content: 'old' }]]) })
    const r = await notes.upsertNote(db, { client_id: 'c1', updated_at: 200, rev: 2, content: 'new' })
    expect(r.status).toBe('accepted')
  })

  it('rejects incoming row whose updated_at < stored (conflict)', async () => {
    const db = fakeDb({ stored: new Map([['c1', { client_id: 'c1', updated_at: 200, rev: 2, content: 'new' }]]) })
    const r = await notes.upsertNote(db, { client_id: 'c1', updated_at: 100, rev: 1, content: 'old' })
    expect(r.status).toBe('conflict')
    expect(r.server).toMatchObject({ content: 'new' })
  })

  it('tie-break on client_id lexicographically when updated_at equal', () => {
    expect(notes.lwwIncomingWins({ client_id: 'aaa', updated_at: 100 }, { client_id: 'bbb', updated_at: 100 })).toBe(true)
    expect(notes.lwwIncomingWins({ client_id: 'bbb', updated_at: 100 }, { client_id: 'aaa', updated_at: 100 })).toBe(false)
  })

  it('softDelete returns conflict if existing updated_at is newer', async () => {
    const db = fakeDb({ stored: new Map([['c1', { client_id: 'c1', updated_at: 200 }]]) })
    const r = await notes.softDelete(db, 'c1', 100)
    expect(r.conflict).toBe(true)
  })

  it('softDelete marks the row when incoming is newer', async () => {
    const db = fakeDb({ stored: new Map([['c1', { client_id: 'c1', updated_at: 100 }]]) })
    const r = await notes.softDelete(db, 'c1', 200)
    expect(r.conflict).toBe(false)
  })
})