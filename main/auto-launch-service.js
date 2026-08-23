const AutoLaunch = require('auto-launch')

const NAME = 'QuickBrain'

let launcher = null
function getLauncher() {
  if (!launcher) {
    launcher = new AutoLaunch({
      name: NAME,
      path: process.execPath
    })
  }
  return launcher
}

async function isEnabled() {
  try { return await getLauncher().isEnabled() }
  catch (e) { console.error('[auto-launch] isEnabled failed:', e.message); return false }
}

async function setEnabled(enabled) {
  try {
    const l = getLauncher()
    const cur = await l.isEnabled()
    if (enabled && !cur) await l.enable()
    if (!enabled && cur) await l.disable()
    return { success: true, enabled: enabled }
  } catch (e) {
    console.error('[auto-launch] setEnabled failed:', e.message)
    return { success: false, error: e.message }
  }
}

module.exports = { isEnabled, setEnabled, NAME }