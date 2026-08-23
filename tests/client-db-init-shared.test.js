import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

describe('client db-init uses shared migrator', () => {
  it('client/src/main/db-init.js does not reference schema.sql directly', () => {
    const src = fs.readFileSync(path.join(here, '..', 'client', 'src', 'main', 'db-init.js'), 'utf8')
    expect(src).not.toMatch(/schema\.sql/)
  })

  it('client/src/main/db-init.js delegates to @quickbrain/shared', () => {
    const src = fs.readFileSync(path.join(here, '..', 'client', 'src', 'main', 'db-init.js'), 'utf8')
    expect(src).toMatch(/@quickbrain\/shared/)
  })

  it('client/src/main/db/schema.sql has been removed', () => {
    const exists = fs.existsSync(path.join(here, '..', 'client', 'src', 'main', 'db', 'schema.sql'))
    expect(exists).toBe(false)
  })
})