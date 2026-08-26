const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

async function afterPack(context) {
  const exe = path.join(context.appOutDir, 'QuickBrain.exe');
  const ico = path.resolve(__dirname, '..', 'client', 'src', 'assets', 'icon.ico');
  const cacheRoot = process.env.LOCALAPPDATA + String.fromCharCode(92) + 'electron-builder' + String.fromCharCode(92) + 'Cache' + String.fromCharCode(92) + 'winCodeSign';
  let rcedit = null;
  try {
    for (const sub of fs.readdirSync(cacheRoot)) {
      const p = path.join(cacheRoot, sub, 'rcedit-x64.exe');
      if (fs.existsSync(p)) { rcedit = p; break; }
    }
  } catch (e) {}
  if (!rcedit) { console.warn('[afterPack] rcedit-x64.exe not found, skipping icon rewrite'); return; }
  if (!fs.existsSync(ico)) { console.warn('[afterPack] icon.ico missing, skipping'); return; }
  console.log('[afterPack] rewriting icon on', exe);
  const r = spawnSync(rcedit, [exe, '--set-icon', ico], { stdio: 'inherit' });
  if (r.status !== 0) console.error('[afterPack] rcedit exited', r.status);
  else console.log('[afterPack] icon updated');
}

module.exports = afterPack;
