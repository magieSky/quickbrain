import { describe, it, expect } from 'vitest'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { readMigrations, applyAll } from '../shared/schema/sqlite/migrations.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const dir = path.join(here, '..', 'shared', 'schema', 'sqlite')

describe('shared/schema/sqlite migrations', () => {
  it('ships at least one migration file', () => {
    const files = readMigrations()
    expect(files.length).toBeGreaterThanOrEqual(1)
    expect(files[0].name).toMatch(/0001_init\.sql$/)
    expect(fs.existsSync(path.join(dir, '0001_init.sql'))).toBe(true)
  })

  it('applyAll opens an in-memory sqlite, runs migrations, leaves notes + sync_meta + sync_outbox + schema_version', () => {
    const db = new Database(':memory:')
    applyAll(db)
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name)
    expect(tables).toContain('notes')
    expect(tables).toContain('sync_meta')
    expect(tables).toContain('sync_outbox')
    expect(tables).toContain('schema_version')
  })

  it('is idempotent (re-running applyAll does not duplicate work or duplicate-version error)', () => {
    const db = new Database(':memory:')
    applyAll(db)
    applyAll(db)
    const counts = db.prepare('SELECT count(*) c FROM schema_version').get().c
    expect(counts).toBe(readMigrations().length)
  })
})