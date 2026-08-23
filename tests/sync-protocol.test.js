import { describe, it, expect } from 'vitest'
import proto from '../shared/sync/protocol.js'
import v from '../shared/sync/version.js'

describe('shared/sync', () => {
  it('protocol version is a positive integer', () => {
    expect(Number.isInteger(v.SYNC_PROTOCOL_VERSION)).toBe(true)
    expect(v.SYNC_PROTOCOL_VERSION).toBeGreaterThan(0)
  })

  it('validates pull request payload', () => {
    expect(proto.validatePull({ since: 0, limit: 100 })).toBeNull()
    expect(proto.validatePull({ since: 0, limit: 0 })).toBeTruthy()
    expect(proto.validatePull({ since: -1, limit: 100 })).toBeTruthy()
    expect(proto.validatePull({ since: 'abc', limit: 100 })).toBeTruthy()
  })

  it('validates each push op', () => {
    const ok = [
      { op: 'upsert', note: { client_id: 'c1', updated_at: 1, rev: 1, content: 'x' } },
      { op: 'delete', client_id: 'c2', updated_at: 2 }
    ]
    expect(proto.validatePushOps(ok)).toEqual([])
    const bad = [
      { op: 'upsert' },
      { op: 'delete', client_id: 'c2' },
      { op: 'unknown', client_id: 'c3', updated_at: 1 }
    ]
    expect(proto.validatePushOps(bad)).toHaveLength(3)
  })

  it('rejects non-array ops', () => {
    expect(proto.validatePushOps('not-an-array')).toContain('ops-must-be-array')
  })

  it('each upsert op needs client_id, updated_at, rev, content', () => {
    const errs = proto.validatePushOps([{ op: 'upsert', note: { client_id: 'c1' } }])
    expect(errs.length).toBeGreaterThan(0)
  })
})