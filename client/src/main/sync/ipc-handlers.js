const { ipcMain } = require('electron')
const cfg = require('../config')
const meta = require('./meta')
const outbox = require('./outbox')
const syncClient = require('./client')
const runtime = require('./runtime')
const migration = require('./migration')

/**
 * Sign up a new account on the SaaS server. POST {serverUrl}/v1/auth/register
 * with {username, password}. On success, write the resulting secret into
 * local config under sync.* and enable sync.
 *
 * Returns: { ok, username, secret } on success; { ok: false, error } on failure.
 */
async function registerWithServer({ serverUrl, username, password }) {
  if (!serverUrl || typeof serverUrl !== 'string') return { ok: false, error: 'missing-server-url' }
  if (!username || typeof username !== 'string') return { ok: false, error: 'missing-username' }
  if (!password || typeof password !== 'string') return { ok: false, error: 'missing-password' }
  let base = serverUrl; while (base.endsWith('/')) base = base.slice(0, -1)
  let res, text
  try {
    res = await fetch(base + '/v1/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password })
    })
    text = await res.text()
  } catch (e) {
    return { ok: false, error: 'network-error: ' + (e.message || String(e)) }
  }
  let body
  try { body = JSON.parse(text) } catch { body = { error: 'invalid-response: ' + text.slice(0, 80) } }
  if (!res.ok || !body.ok) return { ok: false, error: body.error || ('http-' + res.status) }
  // Persist as enabled sync with this server
  const cur = cfg.read()
  const sync = Object.assign({}, cur.sync || {}, {
    enabled: true,
    serverUrl: base,
    token: body.secret
  })
  sync.deviceId = sync.deviceId || cfg.ensureDeviceId()
  cur.sync = sync
  cfg.write(cur)
  return { ok: true, username: body.username, user_id: body.user_id, secret: body.secret }
}

/**
 * Sign in with an existing token (paste from another device or recovered from
 * a backup). Validates by calling /v1/auth/me, then persists serverUrl + token
 * into local config and enables sync.
 */
async function signInWithToken({ serverUrl, token }) {
  if (!serverUrl || typeof serverUrl !== 'string') return { ok: false, error: 'missing-server-url' }
  if (!token || typeof token !== 'string') return { ok: false, error: 'missing-token' }
  let base = serverUrl; while (base.endsWith('/')) base = base.slice(0, -1)
  // Build a bearer from the token + our deviceId, then probe /v1/auth/me
  const deviceId = cfg.ensureDeviceId()
  const bearer = cfg.buildBearer({ deviceId, token })
  if (!bearer) return { ok: false, error: 'build-bearer-failed' }
  let res, text
  try {
    res = await fetch(base + '/v1/auth/me', {
      method: 'GET',
      headers: { authorization: 'Bearer ' + bearer, 'x-qb-device': deviceId }
    })
    text = await res.text()
  } catch (e) {
    return { ok: false, error: 'network-error: ' + (e.message || String(e)) }
  }
  let body
  try { body = JSON.parse(text) } catch { body = {} }
  if (!res.ok) return { ok: false, error: body.error || ('http-' + res.status) }
  const cur = cfg.read()
  const sync = Object.assign({}, cur.sync || {}, { enabled: true, serverUrl: base, token })
  sync.deviceId = deviceId
  cur.sync = sync
  cfg.write(cur)
  return { ok: true, username: body.username, user_id: body.user_id }
}

function registerSyncHandlers(getDB) {
  ipcMain.handle('get-sync-config', () => {
    const c = cfg.read().sync || {}
    return { enabled: !!c.enabled, serverUrl: c.serverUrl || '', hasToken: !!c.token, deviceId: c.deviceId || cfg.ensureDeviceId() }
  })

  // Returns the bundled SaaS URL as a suggestion when the user explicitly
  // opts into cloud sync. The renderer surfaces this as a one-click link,
  // not an auto-fill, so local mode stays the obvious default.
  ipcMain.handle('get-default-sync-server-url', () => {
    return { serverUrl: cfg.defaultSyncServerUrl() }
  })

  ipcMain.handle('set-sync-config', (_e, payload) => {
    const cur = cfg.read()
    const sync = cur.sync || {}
    if (payload && payload.enabled === false) sync.enabled = false
    else {
      sync.enabled = true
      if (typeof payload.serverUrl === 'string') sync.serverUrl = payload.serverUrl
      if (typeof payload.token === 'string') sync.token = payload.token
      if (typeof payload.deviceName === 'string') sync.deviceName = payload.deviceName
    }
    sync.deviceId = sync.deviceId || cfg.ensureDeviceId()
    cur.sync = sync
    cfg.write(cur)
    return { ok: true, sync }
  })

  ipcMain.handle('sync-status', () => {
    const c = cfg.read().sync || {}
    const m = c.deviceId ? meta.get(getDB(), c.deviceId) : null
    const pending = outbox.pending(getDB()).length
    return { enabled: !!c.enabled, lastPullCursor: m ? m.last_pull_cursor : 0, pending }
  })

  ipcMain.handle('push-local', async () => {
    const c = cfg.read().sync || {}
    if (!c.enabled || !c.serverUrl) return { ok: false, error: 'sync-disabled' }
    const bearer = cfg.buildBearer()
    if (!bearer) return { ok: false, error: 'no-bearer' }
    const rows = outbox.listForPush(getDB(), 500)
    if (!rows.length) return { ok: true, accepted: 0, conflicts: [] }
    const ops = rows.map(r => r.op === 'upsert'
      ? { op: 'upsert', note: { ...r.payload, client_id: r.payload.client_id || ((c.deviceId || 'unknown') + ':' + (r.noteId || '')) } }
      : { op: 'delete', client_id: r.payload.client_id, updated_at: r.payload.updated_at })
    try {
      const r = await syncClient.push({ serverUrl: c.serverUrl, bearer, deviceId: c.deviceId, ops })
      const conflictIds = new Set((r.conflicts || []).map(cf => cf.client_id))
      for (const row of rows) {
        if (conflictIds.has(row.payload.client_id)) outbox.setLastError(getDB(), row.seq, 'server-conflict')
      }
      const ok = rows.filter(x => !conflictIds.has(x.payload.client_id)).map(x => x.seq)
      outbox.markAcked(getDB(), ok)
      if (c.deviceId) meta.setLastPushAt(getDB(), c.deviceId, Date.now())
      return { ok: true, accepted: ok.length, conflicts: r.conflicts || [] }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('pull-now', async () => {
    const d = runtime.get()
    if (!d) return { ok: false, error: 'daemon-not-running' }
    if (typeof d.tickPull === 'function') {
      await d.tickPull()
      return { ok: true }
    }
    return { ok: false, error: 'tickPull-not-available' }
  })

  ipcMain.handle('register-with-server', async (_e, payload) => {
    try { return await registerWithServer(payload || {}) }
    catch (e) { return { ok: false, error: 'unexpected: ' + (e.message || String(e)) } }
  })

  ipcMain.handle('sign-in-with-token', async (_e, payload) => {
    try { return await signInWithToken(payload || {}) }
    catch (e) { return { ok: false, error: 'unexpected: ' + (e.message || String(e)) } }
  })

    ipcMain.handle('push-all', async () => {
    const c = cfg.read().sync || {}
    if (!c.enabled || !c.serverUrl) return { ok: false, error: 'sync-disabled' }
    const bearer = cfg.buildBearer()
    if (!bearer) return { ok: false, error: 'no-bearer' }
    try {
      const r = await migration.pushAllToServer({ db: getDB(), serverUrl: c.serverUrl, bearer, deviceId: c.deviceId })
      return r
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })
}

module.exports = { registerSyncHandlers, registerWithServer, signInWithToken }