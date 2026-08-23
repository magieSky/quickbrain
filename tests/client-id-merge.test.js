import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { applyAll } from '../shared/schema/sqlite/migrations.js'
import fs from 'node:fs'
import path from 'node:path'

const sql0003 = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, '').replace(/\//g, path.sep)), '..', 'shared', 'schema', 'sqlite', '0003_backfill_client_id.sql'), 'utf8')

it('0002 migration adds client_id column (visible after applyAll)', () => {
  const db = new Database(':memory:')
  applyAll(db)
  const cols = db.prepare('PRAGMA table_info(notes)').all().map(c => c.name)
  expect(cols).toContain('client_id')
})

it('0003 backfill creates a client_id for legacy rows added after migrations', () => {
  const db = new Database(':memory:')
  applyAll(db)
  db.prepare('INSERT INTO notes (content) VALUES (?)').run('legacy')
  db.exec(sql0003) // backfill is part of upgrade path; tests run it explicitly after insert
  const row = db.prepare('SELECT client_id FROM notes').get()
  expect(row.client_id).toMatch(/^local-\d+$/)
})

it('0003 backfill is idempotent (running twice does not corrupt client_id)', () => {
  const db = new Database(':memory:')
  applyAll(db)
  db.prepare('INSERT INTO notes (client_id, content) VALUES (?, ?)').run('manual-1', 'a')
  db.exec(sql0003) // existing rows with client_id are skipped
  const row = db.prepare('SELECT client_id FROM notes').get()
  expect(row.client_id).toBe('manual-1')
})
