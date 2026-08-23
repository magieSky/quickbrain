const { ipcMain } = require('electron')
const cfg = require('../config')
const meta = require('./meta')
const outbox = require('./outbox')
const syncClient = require('./client')
const runtime = require('./runtime')
const migration = require('./migration')

function registerSyncHandlers(getDB) {
  ipcMain.handle('get-sync-config', () => {
    const c = cfg.read().sync || {}
    return { enabled: !!c.enabled, serverUrl: c.serverUrl || '', hasToken: !!c.token, deviceId: c.deviceId || cfg.ensureDeviceId() }
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

module.exports = { registerSyncHandlers }