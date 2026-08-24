import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// We test the daemon in isolation by stubbing onPush/onPull so we can observe
// whether triggerPushNow / triggerPullNow actually call them. The behaviour
// we care about is: schedulePush is debounced, but triggerPushNow runs
// immediately; triggerPullNow bypasses the intervalMs delay.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qb-sync-daemon-'))
const daemonModulePath = path.resolve('client/src/main/sync/daemon.js').replace(/\\/g, '/')

describe('sync daemon immediate triggers', () => {
  it('triggerPushNow runs onPush right away and ignores pending debounce', async () => {
    let pushCalls = 0
    const { createDaemon } = await import(daemonModulePath + '?t=' + Date.now())
    const daemon = createDaemon({
      getConfig: () => ({ enabled: true }),
      intervalMs: 60000,
      debounceMs: 60000,
      onPush: async () => { pushCalls++ },
      onPull: async () => {}
    })
    // Schedule a push (this would normally fire after 60s)
    daemon.schedulePush()
    expect(pushCalls).toBe(0)
    // Immediate push fires now
    const r = await daemon.triggerPushNow()
    expect(r).toEqual({ ok: true })
    expect(pushCalls).toBe(1)
    // Pending debounce was cancelled so the scheduled push should NOT fire
    await new Promise(r => setTimeout(r, 30))
    expect(pushCalls).toBe(1)
  })

  it('triggerPushNow skips when sync is disabled', async () => {
    let pushCalls = 0
    const { createDaemon } = await import(daemonModulePath + '?t=' + Date.now())
    const daemon = createDaemon({
      getConfig: () => ({ enabled: false }),
      intervalMs: 60000,
      debounceMs: 1000,
      onPush: async () => { pushCalls++ },
      onPull: async () => {}
    })
    const r = await daemon.triggerPushNow()
    expect(r).toEqual({ skipped: 'sync-disabled' })
    expect(pushCalls).toBe(0)
  })

  it('triggerPullNow runs tickPull even if intervalMs is huge', async () => {
    let pullCalls = 0
    const { createDaemon } = await import(daemonModulePath + '?t=' + Date.now())
    const daemon = createDaemon({
      getConfig: () => ({ enabled: true }),
      intervalMs: 60000,
      debounceMs: 1000,
      onPush: async () => {},
      onPull: async () => { pullCalls++ }
    })
    // Don't call start() - so setInterval is not running
    expect(pullCalls).toBe(0)
    const r = await daemon.triggerPullNow()
    expect(r).toEqual({ ok: true })
    expect(pullCalls).toBe(1)
  })

  it('triggerPullNow skips when sync is disabled', async () => {
    let pullCalls = 0
    const { createDaemon } = await import(daemonModulePath + '?t=' + Date.now())
    const daemon = createDaemon({
      getConfig: () => ({ enabled: false }),
      intervalMs: 60000,
      debounceMs: 1000,
      onPush: async () => {},
      onPull: async () => { pullCalls++ }
    })
    const r = await daemon.triggerPullNow()
    expect(r).toEqual({ skipped: 'sync-disabled' })
    expect(pullCalls).toBe(0)
  })
})

describe('runtime exports the new immediate helpers', () => {
  it('runtime.triggerPushNow / triggerPullNow delegate to the daemon', async () => {
    const runtimeModulePath = path.resolve('client/src/main/sync/runtime.js').replace(/\\/g, '/')
    const runtime = await import(runtimeModulePath + '?t=' + Date.now())
    expect(typeof runtime.triggerPushNow).toBe('function')
    expect(typeof runtime.triggerPullNow).toBe('function')

    // No daemon set -> both should resolve to { skipped: 'no-daemon' }
    const a = await runtime.triggerPushNow()
    const b = await runtime.triggerPullNow()
    expect(a).toEqual({ skipped: 'no-daemon' })
    expect(b).toEqual({ skipped: 'no-daemon' })
  })
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})
