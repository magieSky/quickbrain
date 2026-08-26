const fs = require('fs');
// updater.js: thin wrapper around electron-updater that prompts the user
// before downloading and before installing. Skipped in dev (electron-builder
// dev launches) and in unsigned dev builds where the signature check would
// fail anyway.
const log = (...a) => console.log('[updater]', ...a)

let started = false
let state = 'idle'  // 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error'

function status() { return state }

async function setupAutoUpdater(opts = {}) {
  if (started) return
  started = true
  if (!opts.app || !opts.dialog) {
    log('skipped: app/dialog not provided')
    return
  }
  const { app, dialog } = opts
  // Skip in dev mode (electron launched via `npm start` has no app.isPackaged false here,
  // but we also skip if the user explicitly opts out via env).
  if (process.env.QB_SKIP_UPDATER === '1') { log('skipped: QB_SKIP_UPDATER=1'); return }
  if (!app.isPackaged) { log('skipped: not packaged'); return }

  const { autoUpdater } = require('electron-updater')
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  // logger so electron-updater's own logs land in our log file
  autoUpdater.logger = { info: log, warn: log, error: log, debug: () => {} }

  autoUpdater.on('checking-for-update', () => { state = 'checking'; log('checking for update') })
  autoUpdater.on('update-available', async (info) => {
    state = 'available'
    log('update available:', info.version, 'releaseDate=', info.releaseDate)
    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: '速脑 有新版本',
      message: `发现新版本 ${info.version}`,
      detail: '是否现在下载并安装？下载过程中可以继续使用。',
      buttons: ['稍后', '下载并安装'],
      defaultId: 1,
      cancelId: 0,
      noLink: true
    })
    if (response === 1) {
      state = 'downloading'
      try { await autoUpdater.downloadUpdate() } catch (e) { state = 'error'; log('download failed:', e.message) }
    } else {
      state = 'idle'
    }
  })
  autoUpdater.on('update-not-available', (info) => { state = 'up-to-date'; log('up to date:', info.version) })
  autoUpdater.on('download-progress', (p) => { state = 'downloading'; log('progress:', p.percent.toFixed(1) + '%') })
  autoUpdater.on('update-downloaded', async (info) => {
    state = 'downloaded'
    log('downloaded:', info.version)
    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: '更新已下载',
      message: `版本 ${info.version} 已下载完成`,
      detail: '立即重启应用以完成安装。',
      buttons: ['稍后', '立即重启'],
      defaultId: 1,
      cancelId: 0,
      noLink: true
    })
    if (response === 1) {
      // isSilent=false -> show installer; isForceRunAfter=true -> run after
      autoUpdater.quitAndInstall(false, true)
    } else {
      state = 'idle'
    }
  })
  autoUpdater.on('error', (err) => { state = 'error'; log('error:', err && err.stack || err) })

  // First check after a short delay so app startup isn't blocked.
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((e) => { state = 'error'; log('check failed:', e.message) })
  }, 6000)
}

module.exports = { setupAutoUpdater, status }
