import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

// Stub electron.app.getPath to a per-test temp dir
let tmp
let cfgModule

beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qb-cfg-'))
  // Wire require('electron') to our stub
  const electronStub = { app: { getPath: () => tmp } }
  const Module = (await import('module')).default
  const electronResolved = Module.createRequire(import.meta.url).resolve('electron')
  Module._cache[electronResolved] = { exports: electronStub, id: electronResolved, loaded: true, children: [], paths: [] }
  cfgModule = (await import('file:///' + path.resolve('client/src/main/config.js').replace(/\\/g, '/') + '?t=' + Date.now())).default
})
afterEach(() => {
  if (tmp && fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true })
})

describe('client sync config', () => {
  it('read defaults to sync.enabled=false when no config file exists', () => {
    expect(cfgModule.read().sync.enabled).toBe(false)
  })

  it('ensureDeviceId creates a UUID on first call and persists', () => {
    const a = cfgModule.ensureDeviceId()
    const b = cfgModule.ensureDeviceId()
    expect(a).toBe(b)
    expect(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(a)).toBe(true)
  })

  it('write + read roundtrip survives reboot', () => {
    cfgModule.write({ sync: { enabled: true, serverUrl: 'https://qb', token: 'tk', deviceId: cfgModule.ensureDeviceId() } })
    const got = cfgModule.read().sync
    expect(got.enabled).toBe(true)
    expect(got.serverUrl).toBe('https://qb')
  })

  it('buildBearer returns null when sync disabled', () => {
    cfgModule.write({ sync: { enabled: false } })
    expect(cfgModule.buildBearer()).toBeNull()
  })
})