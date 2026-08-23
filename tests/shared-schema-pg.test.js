import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readMigrations } from '../shared/schema/pg/migrations.js'

const here = path.dirname(fileURLToPath(import.meta.url))

describe('shared/schema/pg', () => {
  it('ships init migration with notes + devices + config + sync_outbox_shadow', () => {
    const files = readMigrations()
    expect(files.some(f => f.name === '0001_init.sql')).toBe(true)
    const init = fs.readFileSync(path.join(here, '..', 'shared', 'schema', 'pg', '0001_init.sql'), 'utf8')
    expect(init).toMatch(/CREATE TABLE IF NOT EXISTS notes/)
    expect(init).toMatch(/client_id\s+TEXT NOT NULL/)
    expect(init).toMatch(/CREATE TABLE IF NOT EXISTS devices/)
    expect(init).toMatch(/CREATE TABLE IF NOT EXISTS config/)
    expect(init).toMatch(/CREATE TABLE IF NOT EXISTS sync_outbox_shadow/)
  })

  it('applyAll is exported as an async function', () => {
    const mod = fs.readFileSync(path.join(here, '..', 'shared', 'schema', 'pg', 'migrations.js'), 'utf8')
    expect(mod).toMatch(/async function applyAll/)
    expect(mod).toMatch(/module\.exports/)
  })
})