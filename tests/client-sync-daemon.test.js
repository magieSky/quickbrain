import { describe, it, expect } from 'vitest'
import path from 'node:path'

const url = 'file:///' + path.resolve('client/src/main/sync/daemon.js').replace(/\\/g, '/')

describe('client sync daemon', () => {
  it('schedulePush debounces burst writes into one push', async () => {
    const mod = await import(url + '?t=' + Date.now())
    let pushes = 0
    const d = mod.default.createDaemon({
      getConfig: () => ({ enabled: true, serverUrl: 'x', bearer: 't', deviceId: 'd1' }),
      intervalMs: 100000,
      debounceMs: 20,
      onPush: async () => { pushes++ }
    })
    d.schedulePush(); d.schedulePush(); d.schedulePush()
    await new Promise(r => setTimeout(r, 80))
    expect(pushes).toBe(1)
    d.stop()
  })

  it('does not push when disabled', async () => {
    const mod = await import(url + '?t=' + (Date.now() + 1))
    let pushes = 0
    const d = mod.default.createDaemon({
      getConfig: () => ({ enabled: false }),
      debounceMs: 10,
      onPush: async () => { pushes++ }
    })
    d.schedulePush()
    await new Promise(r => setTimeout(r, 50))
    expect(pushes).toBe(0)
    d.stop()
  })

  it('start/stop sets running state', async () => {
    const mod = await import(url + '?t=' + (Date.now() + 2))
    const d = mod.default.createDaemon({ getConfig: () => ({ enabled: true }) })
    d.start()
    expect(d._hasPullTimer()).toBe(true)
    d.stop()
    expect(d._hasPullTimer()).toBe(false)
  })
})
