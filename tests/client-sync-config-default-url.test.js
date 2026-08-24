import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

// Stub electron.app.getPath to a per-test temp dir
let tmp
let cfgModule

beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qb-cfg-default-'))
  const electronStub = { app: { getPath: () => tmp } }
  const Module = (await import('module')).default
  const electronResolved = Module.createRequire(import.meta.url).resolve('electron')
  Module._cache[electronResolved] = { exports: electronStub, id: electronResolved, loaded: true, children: [], paths: [] }
  cfgModule = (await import('file:///' + path.resolve('client/src/main/config.js').replace(/\\/g, '/') + '?t=' + Date.now())).default
})
afterEach(() => {
  if (tmp && fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true })
  delete process.env.QB_SYNC_DEFAULT_URL
})

describe('client sync config default URL', () => {
  it('defaultSyncServerUrl() returns the production URL by default', () => {
    expect(cfgModule.defaultSyncServerUrl()).toBe('https://api.quickbrain.app')
  })

  it('QB_SYNC_DEFAULT_URL env var overrides the production default', () => {
    process.env.QB_SYNC_DEFAULT_URL = 'http://127.0.0.1:7422'
    // Re-import so the module-level constant picks up the new env
    return import('file:///' + path.resolve('client/src/main/config.js').replace(/\\/g, '/') + '?t=' + Date.now() + Math.random())
      .then((mod) => {
        expect(mod.default.defaultSyncServerUrl()).toBe('http://127.0.0.1:7422')
      })
  })
})

describe('client sync config does not auto-fill', () => {
  it('read() with no config file returns sync.serverUrl undefined, NOT the default', async () => {
    // The renderer asks for the default URL only when the user clicks the
    // "使用官方地址" link. Local mode is the default; auto-filling would
    // make the Settings modal look like something is broken.
    const fs = await import('node:fs')
    const cfgOnDisk = cfgModule.read().sync || {}
    expect(cfgOnDisk.serverUrl || '').toBe('')
    // sanity: the helper still exists so the renderer can wire the link
    expect(typeof cfgModule.defaultSyncServerUrl).toBe('function')
  })
})
