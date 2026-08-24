import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

const url = 'file:///' + path.resolve('client/src/main/sync/ipc-handlers.js').replace(/\\/g, '/')

let originalFetch
let originalEnv
let userDataDir

beforeEach(() => {
  originalFetch = globalThis.fetch
  originalEnv = { ...process.env }
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qb-sync-register-'))
  process.env.QUICKBRAIN_USER_DATA = userDataDir
})

afterEach(() => {
  globalThis.fetch = originalFetch
  for (const k of Object.keys(process.env)) if (!(k in originalEnv)) delete process.env[k]
  for (const k of Object.keys(originalEnv)) process.env[k] = originalEnv[k]
  try { fs.rmSync(userDataDir, { recursive: true, force: true }) } catch (_) { /* ignore */ }
})

// We mock electron.app.getPath via require.cache injection
function installElectronMock(userData) {
  const electronPath = require.resolve('electron')
  require.cache[electronPath] = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    children: [],
    paths: [],
    exports: { app: { getPath: () => userData } }
  }
}

describe('registerWithServer', () => {
  it('POSTs to {serverUrl}/v1/auth/register and persists secret on success', async () => {
    installElectronMock(userDataDir)
    const captured = []
    globalThis.fetch = async (u, init) => {
      captured.push({ url: u, init })
      return {
        ok: true,
        status: 201,
        text: async () => JSON.stringify({ ok: true, user_id: '7', username: 'alice', secret: 'sec-xyz' })
      }
    }
    const mod = await import(url + '?t=' + Date.now())
    const r = await mod.registerWithServer({ serverUrl: 'http://127.0.0.1:7422', username: 'alice', password: 'hunter2-strong' })
    expect(r.ok).toBe(true)
    expect(r.username).toBe('alice')
    expect(r.secret).toBe('sec-xyz')
    // Fetch was called with the right URL + payload
    expect(captured).toHaveLength(1)
    expect(captured[0].url).toBe('http://127.0.0.1:7422/v1/auth/register')
    expect(captured[0].init.method).toBe('POST')
    expect(JSON.parse(captured[0].init.body)).toEqual({ username: 'alice', password: 'hunter2-strong' })
    // Config was persisted with enabled=true + token=secret
    const cfgPath = path.join(userDataDir, 'config.json')
    const stored = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
    expect(stored.sync.enabled).toBe(true)
    expect(stored.sync.serverUrl).toBe('http://127.0.0.1:7422')
    expect(stored.sync.token).toBe('sec-xyz')
    expect(typeof stored.sync.deviceId).toBe('string')
    expect(stored.sync.deviceId.length).toBeGreaterThan(20)
  })

  it('trims trailing slashes from serverUrl before POSTing', async () => {
    installElectronMock(userDataDir)
    const captured = []
    globalThis.fetch = async (u) => { captured.push(u); return { ok: true, status: 201, text: async () => JSON.stringify({ ok: true, user_id: '1', username: 'a', secret: 's' }) } }
    const mod = await import(url + '?t=' + Date.now() + 'a')
    await mod.registerWithServer({ serverUrl: 'http://127.0.0.1:7422/////', username: 'a', password: 'hunter2-strong' })
    expect(captured[0]).toBe('http://127.0.0.1:7422/v1/auth/register')
  })

  it('returns {ok:false, error} when server returns 409 username-taken', async () => {
    installElectronMock(userDataDir)
    globalThis.fetch = async () => ({ ok: false, status: 409, text: async () => JSON.stringify({ error: 'username-taken' }) })
    const mod = await import(url + '?t=' + Date.now() + 'b')
    const r = await mod.registerWithServer({ serverUrl: 'http://127.0.0.1:7422', username: 'taken', password: 'hunter2-strong' })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('username-taken')
    // Config must NOT be touched
    expect(fs.existsSync(path.join(userDataDir, 'config.json'))).toBe(false)
  })

  it('returns {ok:false, error:missing-*} for empty fields', async () => {
    installElectronMock(userDataDir)
    const mod = await import(url + '?t=' + Date.now() + 'c')
    expect((await mod.registerWithServer({ username: 'a', password: 'b' })).error).toBe('missing-server-url')
    expect((await mod.registerWithServer({ serverUrl: 'http://x', password: 'b' })).error).toBe('missing-username')
    expect((await mod.registerWithServer({ serverUrl: 'http://x', username: 'a' })).error).toBe('missing-password')
  })

  it('returns network-error on fetch rejection', async () => {
    installElectronMock(userDataDir)
    globalThis.fetch = async () => { throw new Error('ECONNREFUSED') }
    const mod = await import(url + '?t=' + Date.now() + 'd')
    const r = await mod.registerWithServer({ serverUrl: 'http://127.0.0.1:65111', username: 'a', password: 'hunter2-strong' })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/network-error/)
    expect(r.error).toMatch(/ECONNREFUSED/)
  })
})

describe('signInWithToken', () => {
  it('probes /v1/auth/me with bearer and persists token on success', async () => {
    installElectronMock(userDataDir)
    const captured = []
    globalThis.fetch = async (u, init) => {
      captured.push({ url: u, headers: init && init.headers })
      return { ok: true, status: 200, text: async () => JSON.stringify({ user_id: '7', username: 'alice', device_id: 'd1' }) }
    }
    const mod = await import(url + '?t=' + Date.now() + 'e')
    const r = await mod.signInWithToken({ serverUrl: 'http://127.0.0.1:7422', token: 'paste-secret' })
    expect(r.ok).toBe(true)
    expect(r.username).toBe('alice')
    expect(captured[0].url).toBe('http://127.0.0.1:7422/v1/auth/me')
    expect(captured[0].headers.authorization).toMatch(/^Bearer /)
    expect(captured[0].headers['x-qb-device']).toBeTruthy()
    const stored = JSON.parse(fs.readFileSync(path.join(userDataDir, 'config.json'), 'utf8'))
    expect(stored.sync.enabled).toBe(true)
    expect(stored.sync.token).toBe('paste-secret')
  })

  it('returns {ok:false} when /v1/auth/me rejects the token', async () => {
    installElectronMock(userDataDir)
    globalThis.fetch = async () => ({ ok: false, status: 401, text: async () => JSON.stringify({ error: 'hmac-mismatch' }) })
    const mod = await import(url + '?t=' + Date.now() + 'f')
    const r = await mod.signInWithToken({ serverUrl: 'http://127.0.0.1:7422', token: 'bad' })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('hmac-mismatch')
    // config.json may have been touched by ensureDeviceId but must NOT have a sync token
    const cfgPath = path.join(userDataDir, 'config.json')
    if (fs.existsSync(cfgPath)) {
      const stored = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
      expect(stored.sync && stored.sync.token).toBeUndefined()
    }
  })

  it('returns missing-* errors for empty fields', async () => {
    installElectronMock(userDataDir)
    const mod = await import(url + '?t=' + Date.now() + 'g')
    expect((await mod.signInWithToken({ token: 'x' })).error).toBe('missing-server-url')
    expect((await mod.signInWithToken({ serverUrl: 'http://x' })).error).toBe('missing-token')
  })
})
