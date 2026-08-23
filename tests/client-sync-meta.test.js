import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { applyAll } from '../shared/schema/sqlite/migrations.js'
import meta from '../client/src/main/sync/meta.js'
import outbox from '../client/src/main/sync/outbox.js'

let db
beforeEach(() => { db = new Database(':memory:'); applyAll(db) })

describe('client sync_meta + sync_outbox', () => {
  it('meta initialises to defaults for a device', () => {
    meta.ensure(db, 'dev-1')
    expect(meta.get(db, 'dev-1')).toEqual({ device_id: 'dev-1', last_pull_cursor: 0, last_push_at: 0, outbox_seq: 0 })
  })

  it('outbox append returns monotonic seq', () => {
    const a = outbox.append(db, { op: 'upsert', noteId: 1, payload: { client_id: 'c1' } })
    const b = outbox.append(db, { op: 'delete', noteId: 2, payload: { client_id: 'c2' } })
    expect(a).toBe(1); expect(b).toBe(2)
    expect(outbox.pending(db)).toHaveLength(2)
  })

  it('outbox mark acked removes rows', () => {
    const a = outbox.append(db, { op: 'upsert', noteId: 1, payload: {} })
    outbox.markAcked(db, [a])
    expect(outbox.pending(db)).toHaveLength(0)
  })

  it('outbox listForPush returns pending ordered by seq', () => {
    outbox.append(db, { op: 'upsert', noteId: 1, payload: { client_id: 'c1' } })
    outbox.append(db, { op: 'delete', noteId: 2, payload: { client_id: 'c2' } })
    const rows = outbox.listForPush(db, 10)
    expect(rows.map(r => r.op)).toEqual(['upsert', 'delete'])
  })

  it('setLastError increments attempts and records message', () => {
    const a = outbox.append(db, { op: 'upsert', noteId: 1, payload: {} })
    outbox.setLastError(db, a, 'server-conflict')
    const rows = outbox.listForPush(db, 1)
    expect(rows[0].attempts).toBe(1)
    expect(rows[0].last_error).toBe('server-conflict')
  })
})