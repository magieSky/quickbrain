import { describe, it, expect } from 'vitest'
import notes from '../server/src/services/notes.js'

function fakeDb({ stored = new Map() } = {}) {
  function build(filters = []) {
    const filteredExec = () => Array.from(stored.values()).filter(r =>
      filters.every(f => f.op === '=' ? r[f.col] === f.val : true)
    )
    return {
      where: (col, op, val) => build([...filters, { col, op, val }]),
      orderBy: () => build(filters),
      limit: (n) => ({
        execute: async () => filteredExec().slice(0, n),
        where: (col, op, val) => ({
          execute: async () => filteredExec().slice(0, n),
          orderBy: () => ({
            limit: (m) => ({ execute: async () => filteredExec().slice(0, m) })
          })
        }),
        orderBy: () => ({
          limit: (m) => ({ execute: async () => filteredExec().slice(0, m) })
        })
      }),
      execute: async () => filteredExec(),
      executeTakeFirst: async () => filteredExec()[0] || null
    }
  }
  const builder = {
    selectFrom: () => ({ selectAll: () => build() }),
    insertInto: () => ({
      values: (v) => {
        const chain = {
          onConflict: (cb) => chain,
          doUpdateSet: (s) => { chain._set = s; return chain },
          executeTakeFirst: async () => {
            stored.set(v.client_id, { ...v, ...(chain._set || {}) })
            return { client_id: v.client_id }
          }
        }
        return chain
      }
    }),
    updateTable: () => ({
      set: (s) => ({
        where: (col, op, val) => {
          if (col === 'client_id' && op === '=' && stored.has(val)) {
            stored.set(val, { ...stored.get(val), ...s })
          } else if (col === 'user_id' && op === '=') {
            for (const [k, v] of stored) if (v.user_id === val) stored.set(k, { ...v, ...s })
          }
          return { executeTakeFirst: async () => ({}), execute: async () => 1 }
        }
      })
    })
  }
  return builder
}

describe('server notes service (LWW)', () => {
  it('accepts incoming row whose updated_at > stored', async () => {
    const db = fakeDb({ stored: new Map([['c1', { client_id: 'c1', user_id: 1, updated_at: 100, rev: 1, content: 'old' }]]) })
    const r = await notes.upsertNote(db, 1, { client_id: 'c1', updated_at: 200, rev: 2, content: 'new' })
    expect(r.status).toBe('accepted')
  })

  it('rejects incoming row whose updated_at < stored (conflict)', async () => {
    const db = fakeDb({ stored: new Map([['c1', { client_id: 'c1', user_id: 1, updated_at: 200, rev: 2, content: 'new' }]]) })
    const r = await notes.upsertNote(db, 1, { client_id: 'c1', updated_at: 100, rev: 1, content: 'old' })
    expect(r.status).toBe('conflict')
    expect(r.server).toMatchObject({ content: 'new' })
  })

  it('tie-break on client_id lexicographically when updated_at equal', () => {
    expect(notes.lwwIncomingWins({ client_id: 'aaa', updated_at: 100 }, { client_id: 'bbb', updated_at: 100 })).toBe(true)
    expect(notes.lwwIncomingWins({ client_id: 'bbb', updated_at: 100 }, { client_id: 'aaa', updated_at: 100 })).toBe(false)
  })

  it('softDelete returns conflict if existing updated_at is newer', async () => {
    const db = fakeDb({ stored: new Map([['c1', { client_id: 'c1', user_id: 1, updated_at: 200 }]]) })
    const r = await notes.softDelete(db, 1, 'c1', 100)
    expect(r.conflict).toBe(true)
  })

  it('softDelete marks the row when incoming is newer', async () => {
    const db = fakeDb({ stored: new Map([['c1', { client_id: 'c1', user_id: 1, updated_at: 100 }]]) })
    const r = await notes.softDelete(db, 1, 'c1', 200)
    expect(r.conflict).toBe(false)
  })
})
