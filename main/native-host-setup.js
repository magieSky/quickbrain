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

module.exports = { register, manifestPath, HOST_NAME }
