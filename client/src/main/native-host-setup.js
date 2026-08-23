const { app } = require('electron')
const path = require('path')
const fs = require('fs')
const { execFile } = require('child_process')

const HOST_NAME = 'com.quickbrain.app'

function manifestPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'native-host.json')
  }
  return path.join(__dirname, '..', 'resources', 'native-host.json')
}

function regKeysFor(browser) {
  const base = 'HKCU\\Software\\' + (browser === 'edge' ? 'Microsoft\\Edge' : 'Google\\Chrome') + '\\NativeMessagingHosts\\' + HOST_NAME
  return base
}

function regScript() {
  const mp = manifestPath()
  let s = '@echo off\r\n'
  for (const b of ['chrome', 'edge']) {
    s += `reg add "${regKeysFor(b)}" /ve /t REG_SZ /d "${mp}" /f\r\n`
  }
  return s
}

async function register() {
  const mp = manifestPath()
  if (!fs.existsSync(mp)) {
    console.error('[native-host-setup] manifest missing:', mp)
    return false
  }
  const bat = path.join(app.getPath('temp'), 'qb-register-host.bat')
  fs.writeFileSync(bat, regScript(), 'utf8')
  return new Promise((resolve) => {
    execFile('cmd.exe', ['/c', bat], { windowsHide: true }, (err) => {
      if (err) { console.error('[native-host-setup] reg failed:', err.message); resolve(false); return }
      console.log('[native-host-setup] registered host at', mp)
      resolve(true)
    })
  })
}

function rewriteManifestPath() {
  const mp = manifestPath()
  if (!fs.existsSync(mp)) return false
  try {
    const json = JSON.parse(fs.readFileSync(mp, 'utf8'))
    const target = app.isPackaged
      ? process.execPath
      : path.join(__dirname, '..', 'dist', 'win-unpacked', 'QuickBrain.exe')
    if (json.path !== target) {
      json.path = target
      fs.writeFileSync(mp, JSON.stringify(json, null, 2) + '\n', 'utf8')
      console.log('[native-host-setup] rewrote manifest path ->', target)
    }
    return true
  } catch (e) {
    console.error('[native-host-setup] rewrite failed:', e.message)
    return false
  }
}

function firstRunMarkerPath() {
  return path.join(app.getPath('userData'), 'native-host-installed.json')
}

function isFirstRunComplete() {
  const f = firstRunMarkerPath()
  try {
    if (!fs.existsSync(f)) return false
    const json = JSON.parse(fs.readFileSync(f, 'utf8'))
    return json && json.installed === true
  } catch (e) {
    return false
  }
}

function markFirstRunComplete() {
  try {
    const f = firstRunMarkerPath()
    fs.writeFileSync(f, JSON.stringify({ installed: true, ts: Date.now() }, null, 2) + '\n', 'utf8')
    console.log('[native-host-setup] first-run marker written:', f)
    return true
  } catch (e) {
    console.error('[native-host-setup] markFirstRunComplete failed:', e.message)
    return false
  }
}

module.exports = { register, manifestPath, HOST_NAME, rewriteManifestPath, isFirstRunComplete, markFirstRunComplete }
