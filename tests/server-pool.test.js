import { describe, it, expect } from 'vitest'
import { createPool } from '../server/src/db/pool.js'

describe('server pg pool', () => {
  it('createPool returns an object with destroy method (no connection opened yet)', () => {
    process.env.DB_URL = 'postgres://qb:qb@localhost:5432/qb_test'
    const db = createPool()
    expect(typeof db.destroy).toBe('function')
    // Don't actually open a connection - just smoke test the construction.
  })
})