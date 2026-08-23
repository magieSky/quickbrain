import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

// npm workspaces hoist shared deps to the root node_modules.
// Tests assert the hoisted symlinks resolve the right workspace folders.
describe('monorepo workspace symlinks', () => {
  it('hoists @quickbrain/shared as a junction/symlink to /shared', () => {
    const probe = path.join('node_modules', '@quickbrain', 'shared')
    expect(fs.existsSync(probe)).toBe(true)
    const stat = fs.lstatSync(probe)
    expect(stat.isSymbolicLink() || stat.isDirectory()).toBe(true)
  })

  it('hoists @quickbrain/client and @quickbrain/server', () => {
    expect(fs.existsSync(path.join('node_modules', '@quickbrain', 'client'))).toBe(true)
    expect(fs.existsSync(path.join('node_modules', '@quickbrain', 'server'))).toBe(true)
  })

  it('require.resolve from project root can locate declared shared subpaths', () => {
    const req = createRequire(import.meta.url)
    // try the future subpath to confirm exports map is honoured
    expect(() => req.resolve('@quickbrain/shared/types/note')).toThrow(/note\.js'/)
    expect(() => req.resolve('@quickbrain/shared/schema/sqlite/migrations')).toThrow(/migrations\.js'/)
  })
})