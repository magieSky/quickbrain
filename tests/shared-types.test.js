import { describe, it, expect } from 'vitest'
import note from '../shared/types/note.js'

describe('shared/types/note', () => {
  it('exposes required sync columns', () => {
    expect(note.SYNC_COLUMNS).toEqual([
      'client_id', 'updated_at', 'deleted_at', 'rev'
    ])
  })

  it('atom has parent_id pointing to source client_id', () => {
    expect(note.ATOM_FIELDS).toContain('parent_id')
  })

  it('op enum covers upsert + delete', () => {
    expect(note.OPS).toEqual(['upsert', 'delete'])
  })

  it('isAtomFields recognises atom-specific fields', () => {
    expect(note.isAtomFields('parent_id')).toBe(true)
    expect(note.isAtomFields('content')).toBe(false)
  })
})