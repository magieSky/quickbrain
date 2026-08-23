const { ipcMain } = require('electron')
const cfg = require('../config')
const meta = require('./meta')
const outbox = require('./outbox')

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
}

module.exports = { registerSyncHandlers }