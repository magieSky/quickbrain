import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

// npm workspaces hoist shared deps to the root node_modules.
// Tests assert the hoisted symlinks resolve the right workspace folders
// and that the shared package.json exports map honours each subpath.
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

  it('require.resolve from project root locates declared shared subpaths', () => {
    const req = createRequire(import.meta.url)
    // shared/package.json exports map: each of these must resolve to the underlying file.
    const expected = [
      ['@quickbrain/shared/types/note', 'shared/types/note.js'],
      ['@quickbrain/shared/types/providers', 'shared/types/providers.js'],
      ['@quickbrain/shared/schema/sqlite/migrations', 'shared/schema/sqlite/migrations.js'],
      ['@quickbrain/shared/schema/pg/migrations', 'shared/schema/pg/migrations.js'],
      ['@quickbrain/shared/sync/protocol', 'shared/sync/protocol.js'],
      ['@quickbrain/shared/sync/token', 'shared/sync/token.js']
    ]
    for (const [subpath, expectFile] of expected) {
      const resolved = req.resolve(subpath)
      expect(resolved.replace(/\\/g, '/')).toContain(expectFile)
    }
  })
})
