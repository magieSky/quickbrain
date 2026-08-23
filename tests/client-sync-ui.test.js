import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('client sync IPC handlers registered', () => {
  it('client/src/main/sync/ipc-handlers.js exposes registerSyncHandlers', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'client/src/main/sync/ipc-handlers.js'), 'utf8')
    expect(src).toMatch(/registerSyncHandlers/)
    expect(src).toMatch(/get-sync-config/)
    expect(src).toMatch(/set-sync-config/)
    expect(src).toMatch(/sync-status/)
  })
})

describe('client sync daemon + helpers integration', () => {
  it('config + meta + outbox + client modules export the right functions', async () => {
    const cfg = (await import('file:///' + path.resolve('client/src/main/config.js').replace(/\\/g, '/'))).default
    expect(typeof cfg.read).toBe('function')
    expect(typeof cfg.write).toBe('function')
    expect(typeof cfg.ensureDeviceId).toBe('function')
    expect(typeof cfg.buildBearer).toBe('function')
    const meta = (await import('file:///' + path.resolve('client/src/main/sync/meta.js').replace(/\\/g, '/'))).default
    expect(typeof meta.get).toBe('function')
    expect(typeof meta.setCursor).toBe('function')
    const outbox = (await import('file:///' + path.resolve('client/src/main/sync/outbox.js').replace(/\\/g, '/'))).default
    expect(typeof outbox.append).toBe('function')
    expect(typeof outbox.markAcked).toBe('function')
  })
})