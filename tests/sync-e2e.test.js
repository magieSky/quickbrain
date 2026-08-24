import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import Fastify from 'fastify'
import Database from 'better-sqlite3'
import crypto from 'node:crypto'

const root = path.resolve('.').replace(/\\/g, '/')
const syncUrl = 'file:///' + root + '/server/src/routes/sync.js'
const migrationUrl = 'file:///' + root + '/client/src/main/sync/migration.js'
const tokenUrl = 'file:///' + root + '/shared/sync/token.js'
const migratorUrl = 'file:///' + root + '/shared/schema/sqlite/migrations.js'

let originalEnv
function setEnv() {
  originalEnv = { ...process.env }
  process.env.MODE = 'byos'
  process.env.MASTER_KEY = 'b'.repeat(64)
  process.env.OWNER_TOKEN = 'e'.repeat(32)
  process.env.DB_URL = 'postgres://x'
}
function restoreEnv() {
  for (const k of Object.keys(process.env)) if (!(k in originalEnv)) delete process.env[k]
  for (const k of Object.keys(originalEnv)) process.env[k] = originalEnv[k]
}

function makeServerDb() {
  const tables = { notes: new Map(), devices: new Map(), users: new Map([
    [1, { id: 1, username: 'owner', secret: process.env.OWNER_TOKEN, is_owner: 1, password_hash: '', created_at: 0, updated_at: 0 }]
  ]) }
  function buildQuery(t) {
    const filters = []
    function exec() {
      const all = tables[t] ? Array.from(tables[t].values()) : []
      const rows = all.filter(r => filters.every(f => {
        if (f.op === '=') return r[f.col] === f.val
        if (f.op === '>') return r[f.col] > f.val
        if (f.op === '<') return r[f.col] < f.val
        if (f.op === 'is' && f.val === null) return r[f.col] == null
        return true
      }))
      return rows
    }
    const builder = {
      where: (col, op, val) => { filters.push({ col, op, val }); return builder },
      orderBy: (col2, dir) => ({
        execute: async () => {
          const arr = exec()
          arr.sort((a, b) => (dir === 'asc' ? (a[col2] - b[col2]) : (b[col2] - a[col2])))
          return arr
        },
        limit: (n) => ({
          execute: async () => {
            const arr = exec()
            arr.sort((a, b) => (dir === 'asc' ? (a[col2] - b[col2]) : (b[col2] - a[col2])))
            return arr.slice(0, n)
          }
        })
      }),
      limit: (n) => ({
        execute: async () => exec().slice(0, n)
      }),
      execute: async () => exec(),
      executeTakeFirst: async () => exec()[0] || null
    }
    return builder
  }
  return {
    _tables: tables,
    fn: { count: (col) => ({ as: () => ({ _count: col }) }) },
    exec: (sql) => {
      if (/CREATE TABLE.*notes/.test(sql)) tables.notes = new Map()
      if (/CREATE TABLE.*devices/.test(sql)) tables.devices = new Map()
    },
    prepare: (sql) => {
      if (/FROM notes WHERE client_id/.test(sql)) {
        return { get: (cid) => tables.notes.get(cid) || null }
      }
      if (/INSERT INTO notes/.test(sql)) {
        return {
          run: (v) => { tables.notes.set(v.client_id, v); return { changes: 1 } },
          all: () => Array.from(tables.notes.values())
        }
      }
      if (/UPDATE notes/.test(sql)) {
        return { run: (deleted_at, cid) => { const r = tables.notes.get(cid); if (r) { r.deleted_at = deleted_at; r.updated_at = deleted_at } return { changes: 1 } } }
      }
      if (/FROM devices/.test(sql)) {
        return { get: (id) => tables.devices.get(id) || null, all: () => Array.from(tables.devices.values()) }
      }
      if (/INSERT INTO devices/.test(sql)) {
        return { run: (v) => { tables.devices.set(v.device_id, v); return { changes: 1 } } }
      }
      if (/UPDATE devices/.test(sql)) {
        return { run: (last_seen_at, id) => { const r = tables.devices.get(id); if (r) r.last_seen_at = last_seen_at; return { changes: 1 } } }
      }
      return { get: () => null, all: () => [], run: () => ({ changes: 0 }) }
    },
    selectFrom: (t) => ({
      selectAll: () => buildQuery(t),
      select: (sel) => ({
        executeTakeFirst: async () => {
          const obj = {}
          obj.c = tables[t] ? tables[t].size : 0
          return obj
        }
      })
    }),
    insertInto: (t) => ({
      values: (v) => {
        const result = {
          executeTakeFirst: async () => { tables[t].set(v.client_id, v); return { client_id: v.client_id } },
          onConflict: (cb) => {
            const oc = {
              column: (col) => ({
                doUpdateSet: (set) => {
                  result._conflictSet = set
                  return { executeTakeFirst: async () => { tables[t].set(v.client_id, { ...v, ...set }); return { client_id: v.client_id } } }
                },
                doNothing: () => ({ executeTakeFirst: async () => { return { client_id: v.client_id } } })
              })
            }
            cb(oc)
            return result
          }
        }
        return result
      }
    }),
    updateTable: (t) => ({
      set: (set) => ({
        where: (col, op, val) => {
          if (col === 'client_id' && op === '=') {
            if (tables[t] && tables[t].has(val)) Object.assign(tables[t].get(val), set)
          }
          return { executeTakeFirst: async () => ({ client_id: val }) }
        }
      })
    }),
    deleteFrom: (t) => ({ where: () => ({ executeTakeFirst: async () => ({ count: 0 }) }) })
  }
}

async function buildServer() {
  const syncMod = await import(syncUrl + '?t=' + Date.now() + Math.random())
  const db = makeServerDb()
  const app = Fastify({ logger: false })
  await app.register(syncMod.default || syncMod, { db })
  // Get a free port by listening on 0
  await app.listen({ port: 0, host: '127.0.0.1' })
  const addr = app.server.address()
  const url = 'http://127.0.0.1:' + addr.port
  return { app, db, url }
}

async function buildClientDb() {
  const Database = (await import('better-sqlite3')).default
  const { applyAll } = await import(migratorUrl + '?t=' + Date.now() + Math.random())
  const db = new Database(':memory:')
  applyAll(db)
  return db
}

describe('e2e sync round-trip', () => {
  beforeEach(setEnv)
  afterEach(restoreEnv)

  it('client pushAllToServer → server pull → second client receives all notes', async () => {
    const { app, db: srvDb, url } = await buildServer()
    const clientDb = await buildClientDb()
    const { addNote } = await import('file:///' + root + '/client/src/main/db/search.js' + '?t=' + Date.now())
    const id1 = addNote(clientDb, { content: 'first note', title: 'First', tags: ['a'] })
    const id2 = addNote(clientDb, { content: 'second note', title: 'Second', tags: ['b'] })
    const migration = await import(migrationUrl + '?t=' + Date.now())
    const deviceId = crypto.randomUUID()
    const tokenMod = await import(tokenUrl + '?t=' + Date.now())
    const bearer = tokenMod.encode({ deviceId, token: process.env.OWNER_TOKEN })
    const r = await migration.pushAllToServer({ db: clientDb, serverUrl: url, bearer, deviceId })
    expect(r.ok).toBe(true)
    expect(r.total).toBe(2)
    expect(r.accepted).toBe(2)
    expect(r.conflicts).toBe(0)
    await app.close()
  })

  it('server pull returns notes with cursor, client pull applies to local DB', async () => {
    const { app, db: srvDb } = await buildServer()
    srvDb._tables.notes.set('a1', { user_id: 1, client_id: 'a1', content: 'A1', title: 'A1', updated_at: 1000, deleted_at: null, rev: 1, category: 'uncategorized', tags: '[]', is_atom: 0, parent_id: null, source_path: '', source_type: '', source_range: '', extracted_at: null, is_formatted: 0, original_content: '', created_at: 1000 })
    srvDb._tables.notes.set('a2', { user_id: 1, client_id: 'a2', content: 'A2', title: 'A2', updated_at: 2000, deleted_at: null, rev: 1, category: 'uncategorized', tags: '[]', is_atom: 0, parent_id: null, source_path: '', source_type: '', source_range: '', extracted_at: null, is_formatted: 0, original_content: '', created_at: 2000 })
    const clientDb = await buildClientDb()
    const deviceId = crypto.randomUUID()
    const tokenMod = await import(tokenUrl + '?t=' + Date.now())
    const bearer = tokenMod.encode({ deviceId, token: process.env.OWNER_TOKEN })
    const res = await app.inject({ method: 'GET', url: '/v1/sync/pull?since=0&limit=10', headers: { authorization: 'Bearer ' + bearer, 'x-qb-device': deviceId } })
    expect(res.statusCode).toBe(200)
    const json = res.json()
    expect(json.changes.length).toBe(2)
    expect(json.next_cursor).toBeGreaterThan(0)
    // Apply to client DB
    const upsert = clientDb.prepare(`INSERT INTO notes (client_id, content, title, category, tags, source_path, source_type, parent_id, source_range, is_atom, updated_at, rev) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    for (const r of json.changes) {
      upsert.run(r.client_id, r.content, r.title, r.category || 'uncategorized', JSON.stringify(r.tags || []), r.source_path || '', r.source_type || '', r.parent_id || null, r.source_range || '', r.is_atom || 0, r.updated_at, r.rev || 1)
    }
    const localCount = clientDb.prepare('SELECT COUNT(*) AS c FROM notes WHERE deleted_at IS NULL').get().c
    expect(localCount).toBe(2)
    await app.close()
  })

  it('LWW: pushing an older version of a note conflicts', async () => {
    const { app, db: srvDb } = await buildServer()
    srvDb._tables.notes.set('a1', { user_id: 1, client_id: 'a1', content: 'NEWER', updated_at: 2000, deleted_at: null, rev: 2, category: 'uncategorized', tags: '[]', is_atom: 0, parent_id: null, source_path: '', source_type: '', source_range: '', extracted_at: null, is_formatted: 0, original_content: '', created_at: 1000 })
    const deviceId = crypto.randomUUID()
    const tokenMod = await import(tokenUrl + '?t=' + Date.now())
    const bearer = tokenMod.encode({ deviceId, token: process.env.OWNER_TOKEN })
    const body = { ops: [
      { op: 'upsert', note: { client_id: 'a1', content: 'OLDER', updated_at: 1000, rev: 1 } }
    ] }
    const res = await app.inject({ method: 'POST', url: '/v1/sync/push', headers: { authorization: 'Bearer ' + bearer, 'x-qb-device': deviceId }, payload: body })
    expect(res.statusCode).toBe(200)
    const j = res.json()
    expect(j.conflicts.length).toBe(1)
    expect(j.conflicts[0].client_id).toBe('a1')
    expect(j.accepted).toBe(0)
    expect(srvDb._tables.notes.get('a1').content).toBe('NEWER')
    await app.close()
  })
})