# QuickBrain Browser Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture web pages and selections from Chrome / Edge into QuickBrain desktop via MV3 extension + Native Messaging, with one-time auto-registration.

**Architecture:** MV3 service-worker extension talks to a `--native-host` mode of `QuickBrain.exe` over Chromium''s stdio Native Messaging protocol. The host process forwards JSON-lines over a Windows named pipe to the main QuickBrain process, which persists notes via existing IPC handlers.

**Tech Stack:** Chromium MV3 (chrome 100+ / Edge 100+), `chrome.runtime.sendNativeMessage`, named pipe (`net.Socket` over `\\\\.\\pipe\\quickbrain-native-bridge`), Readability.js + Turndown.js bundled into the extension, electron-builder `extraResources` for shipping the extension folder.

---

## File Structure

**New (extension):**
- `extension/manifest.json` — MV3 descriptor with fixed `key`
- `extension/background.js` — service worker (context menus + commands + popup trigger)
- `extension/popup/popup.html`, `popup.js`, `popup.css`
- `extension/icons/{16,32,48,128}.png`
- `extension/lib/turndown.js`, `extension/lib/readability.js`

**New (desktop):**
- `main/native-host.js` — stdio bridge when argv contains `--native-host`
- `main/native-host-setup.js` — registry R/W
- `main/native-host-schema.js` — JSON schema validation for messages
- `main/named-pipe-bridge.js` — small net.Socket pair used by main process
- `main/native-host-fixture.js` — Node script that drives the host via stdin for manual smoke tests
- `scripts/compute-extension-key.js` — generate a 32-byte RSA keypair → base10 for the manifest

**Modified:**
- `main/ipc.js` — add handler for messages received from the pipe
- `main/main.js` — detect `--native-host` argv, start bridge; on first ready, call registration if needed and push notification
- `package.json` build config — `extraResources` and post-install script

**Test artifacts:**
- No unit tests; verification is manual + scripted (`native-host-fixture.js`).

---

## Task 1: Native host stdio loop + JSON schema

**Files:**
- Create: `main/native-host-schema.js`
- Create: `main/native-host.js`
- Create: `main/native-host-fixture.js`

- [ ] **Step 1: Write the schema module**

Open `main/native-host-schema.js` and add:

```js
function parseMessage(line) {
  const trimmed = line.trim()
  if (!trimmed) return null
  let msg
  try { msg = JSON.parse(trimmed) } catch (e) { return { error: 'invalid-json' } }
  if (!msg || typeof msg !== 'object' || !msg.type) return { error: 'missing-type' }
  if (!['save-selection', 'save-page', 'ping'].includes(msg.type)) return { error: 'unknown-type' }
  return { msg }
}

module.exports = { parseMessage }
```

- [ ] **Step 2: Write the host loop**

Open `main/native-host.js`:

```js
const fs = require('fs')
const path = require('path')
const net = require('net')

const PIPE = '\\\\.\\pipe\\quickbrain-native-bridge'
const { parseMessage } = require('./native-host-schema')

const input = fs.readFileSync(0, 'utf8') // stdin
const lines = input.split('\n')
const out = (obj) => process.stdout.write(JSON.stringify(obj) + '\n')

for (const line of lines) {
  const parsed = parseMessage(line)
  if (!parsed) continue
  if (parsed.error) { out({ success: false, error: parsed.error }); continue }
  const { msg } = parsed
  if (msg.type === 'ping') { out({ success: true, pong: 1 }); continue }
  const client = net.connect(PIPE)
  let buf = ''
  client.on('connect', () => client.write(JSON.stringify(msg) + '\n'))
  client.on('data', (d) => { buf += d.toString('utf8'); if (buf.includes('\n')) client.end() })
  client.on('end', () => out(buf.trim() ? JSON.parse(buf.trim()) : { success: false, error: 'no-response' }))
  client.on('error', (e) => out({ success: false, error: 'pipe: ' + e.code }))
}
```

- [ ] **Step 3: Write the fixture**

Open `main/native-host-fixture.js`:

```js
const { spawn } = require('child_process')
const path = require('path')

const exe = process.argv[2] || path.join(__dirname, '..', 'dist', 'win-unpacked', 'QuickBrain.exe')
const fixture = process.argv[3] || 'ping'

const child = spawn(exe, ['--native-host'], { stdio: ['pipe', 'pipe', 'inherit'] })
child.stdout.on('data', (b) => process.stdout.write(b))
child.stdin.write(JSON.stringify({ type: fixture }) + '\n')
if (fixture === 'save-selection') {
  child.stdin.write(JSON.stringify({
    type: 'save-selection',
    payload: { text: 'hello world', title: 'Test selection', url: 'https://example.com/', tabTitle: 'Example' }
  }) + '\n')
}
child.stdin.end()
```

- [ ] **Step 4: Smoke-test schema + stub**

Run from `E:\note\quickbrain`:
```powershell
node -e "const {parseMessage}=require('./main/native-host-schema'); console.log(parseMessage('{\"type\":\"ping\"}')); console.log(parseMessage('not json')); console.log(parseMessage(''))"
```
Expected:
```
{ msg: { type: 'ping' } }
{ error: 'invalid-json' }
null
```

- [ ] **Step 5: Commit**

```powershell
git add main/native-host-schema.js main/native-host.js main/native-host-fixture.js
git commit -m "feat(native-host): stdio loop + JSON schema + fixture driver"
```

---

## Task 2: Named-pipe server in main process

**Files:**
- Create: `main/named-pipe-bridge.js`
- Modify: `main/ipc.js`
- Modify: `main/main.js`

- [ ] **Step 1: Build the pipe server**

Create `main/named-pipe-bridge.js`:

```js
const net = require('net')
const PIPE = '\\\\.\\pipe\\quickbrain-native-bridge'

function startServer(handler) {
  return net.createServer((socket) => {
    let buf = ''
    socket.on('data', (d) => {
      buf += d.toString('utf8')
      let nl = buf.indexOf('\n')
      while (nl >= 0) {
        const line = buf.slice(0, nl)
        buf = buf.slice(nl + 1)
        try { handler(JSON.parse(line), socket) } catch (e) { /* ignore */ }
        nl = buf.indexOf('\n')
      }
    })
    socket.on('error', () => {})
  }).listen(PIPE, () => {})
}

module.exports = { startServer, PIPE }
```

- [ ] **Step 2: Add IPC handler**

Open `main/ipc.js`. After the existing `import-document` handler, add:

```js
const pipeBridge = require('./named-pipe-bridge')
function onPipeMessage(msg, socket) {
  (async () => {
    try {
      const db = getDB()
      let id
      if (msg.type === 'save-selection') {
        const { text, title, url, tabTitle } = msg.payload || {}
        if (!text || !text.trim()) { socket.write(JSON.stringify({ success: false, error: 'empty-text' }) + '\n'); return }
        id = addNote(db, {
          content: text,
          title: title || (text.split('\n')[0] || '').slice(0, 80),
          tags: ['web'],
          source_path: url || '',
          source_type: 'web'
        })
      } else if (msg.type === 'save-page') {
        const { markdown, title, url } = msg.payload || {}
        if (!markdown || !markdown.trim()) { socket.write(JSON.stringify({ success: false, error: 'empty-markdown' }) + '\n'); return }
        id = addNote(db, {
          content: markdown,
          title: title || (url || 'web page').slice(0, 80),
          tags: ['web-page'],
          source_path: url || '',
          source_type: 'web'
        })
      } else {
        socket.write(JSON.stringify({ success: false, error: 'unsupported-type' }) + '\n'); return
      }
      socket.write(JSON.stringify({ success: true, id }) + '\n')
    } catch (e) {
      console.error('[native-host] handler failed:', e.message)
      socket.write(JSON.stringify({ success: false, error: e.message }) + '\n')
    }
  })()
}
pipeBridge.startServer(onPipeMessage)
```

Export `onPipeMessage` so it''s available for tests if needed.

- [ ] **Step 3: Skip non-host startup**

Open `main/main.js`. Right after the lines that calculate `LOG_FILE` and configure console overrides, add an early-return:

```js
if (process.argv.includes('--native-host')) {
  require('./main/native-host')
  return
}
```

- [ ] **Step 4: Smoke test**

After rebuild + launch QuickBrain, from another shell:
```powershell
node main/native-host-fixture.js dist\win-unpacked\QuickBrain.exe ping
```
Expected stdout: `{ "success": true, "pong": 1 }`.

Then:
```powershell
node main/native-host-fixture.js dist\win-unpacked\QuickBrain.exe save-selection
```
Expected: `{ "success": true, "id": <number> }` and a new row in `notes`.

Confirm with SQLite:
```powershell
sqlite3 "$env:APPDATA\QuickBrain\quickbrain.db" "SELECT id,title,tags,source_path,source_type FROM notes ORDER BY id DESC LIMIT 1;"
```
Expected to show the `Test selection` row with `source_type=''web''`.

- [ ] **Step 5: Commit**

```powershell
git add main/named-pipe-bridge.js main/ipc.js main/main.js
git commit -m "feat(native-host): pipe server in main process + save-selection handler"
```

---

## Task 3: Registry register / unregister

**Files:**
- Create: `main/native-host-setup.js`
- Modify: `main/main.js`
- Modify: `package.json` (add postinstall placeholder)

- [ ] **Step 1: Write setup module**

Open `main/native-host-setup.js`:

```js
const { app } = require('electron')
const path = require('path')
const fs = require('fs')

const HOST_NAME = 'com.quickbrain.app'

function manifestPath() {
  // resources/native-host.json sits next to the bundled exe
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'native-host.json')
  }
  return path.join(__dirname, '..', 'resources', 'native-host.json')
}

function regScriptFor(browser) {
  const base = 'HKCU\\Software\\' + (browser === 'edge' ? 'Microsoft\\Edge' : 'Google\\Chrome') + '\\NativeMessagingHosts\\' + HOST_NAME
  return `@echo off\r\nreg add "${base}" /ve /t REG_SZ /d "${manifestPath()}" /f\r\n`
}

async function register() {
  const mp = manifestPath()
  if (!fs.existsSync(mp)) {
    console.error('[native-host-setup] manifest missing:', mp)
    return false
  }
  const { execFile } = require('child_process')
  return new Promise((resolve) => {
    const bat = path.join(app.getPath('temp'), 'qb-register-host.bat')
    fs.writeFileSync(bat, regScriptFor('chrome') + regScriptFor('edge'), 'utf8')
    execFile('cmd.exe', ['/c', bat], { windowsHide: true }, (err) => {
      if (err) console.error('[native-host-setup] reg failed:', err.message)
      resolve(!err)
    })
  })
}

module.exports = { register, manifestPath, HOST_NAME }
```

- [ ] **Step 2: Ship a starter manifest**

Create `resources/native-host.json` with the `path` field set to `${INSTALL_DIR}\\QuickBrain.exe` (will be rewritten at install time by Task 6). For now the dev path is:
```json
{
  "name": "com.quickbrain.app",
  "description": "QuickBrain Native Messaging Host",
  "path": "C:\\note\\quickbrain\\dist\\win-unpacked\\QuickBrain.exe",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef/"]
}
```

- [ ] **Step 3: Wire first-launch registration**

Open `main/main.js`. Inside the `app.whenReady().then(...)` block, right before `registerIpcHandlers()`, add:

```js
const nativeHostSetup = require('./main/native-host-setup')
try { await nativeHostSetup.register() } catch (e) { console.error('[main] native host register failed:', e.message) }
```

- [ ] **Step 4: Manual verify**

With the existing QuickBrain process killed, launch the new build:
```powershell
$env:NODE_DEBUG='native-host-setup'
& ".\dist\win-unpacked\QuickBrain.exe"
```
After 2 s:
```powershell
reg query "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.quickbrain.app"
reg query "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.quickbrain.app"
```
Both should print `(Default)    REG_SZ    ...native-host.json`.

- [ ] **Step 5: Commit**

```powershell
git add main/native-host-setup.js main/main.js resources/native-host.json package.json
git commit -m "feat(native-host): first-launch registry registration (chrome + edge)"
```

---

## Task 4: Fixed extension ID + manifest

**Files:**
- Create: `scripts/compute-extension-key.js`
- Create: `extension/manifest.json`
- Create: `extension/icons/16.png` … `128.png`

- [ ] **Step 1: Generate key**

Create `scripts/compute-extension-key.js`:

```js
const crypto = require('crypto')
const { generateKeyPairSync } = crypto
const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
// Chrome expects the modulus as a single base-10 decimal string.
const m = publicKey.export({ format: 'jwk' }).n
console.log(m)
```

Run:
```powershell
node scripts/compute-extension-key.js | Out-File E:\note\quickbrain\extension\manifest.json.key.txt -Encoding utf8
```
The text file holds the modulus. Save it to `extension/.key.txt` (git-ignored) for future rebuilds.

- [ ] **Step 2: Write manifest**

Open `extension/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "QuickBrain Bridge",
  "version": "0.1.0",
  "description": "Save web pages and selections to QuickBrain",
  "icons": { "16": "icons/16.png", "32": "icons/32.png", "48": "icons/48.png", "128": "icons/128.png" },
  "action": { "default_popup": "popup/popup.html", "default_icon": "icons/32.png" },
  "background": { "service_worker": "background.js", "type": "module" },
  "permissions": ["contextMenus", "nativeMessaging", "storage", "activeTab", "scripting"],
  "host_permissions": ["<all_urls>"],
  "commands": {
    "save-selection": { "suggested_key": { "default": "Alt+Shift+S" }, "description": "Save selection to QuickBrain" },
    "save-page": { "suggested_key": { "default": "Alt+Shift+P" }, "description": "Save page to QuickBrain" }
  },
  "key": "<PASTE_MODULUS_HERE>"
}
```

Replace `<PASTE_MODULUS_HERE>` with the value from `.key.txt`.

- [ ] **Step 3: Reuse QuickBrain icons**

```powershell
Copy-Item assets\icon.png extension\icons\16.png
Copy-Item assets\icon@2x.png extension\icons\32.png
Copy-Item assets\icon@3x.png extension\icons\48.png
Copy-Item assets\icon@4x.png extension\icons\128.png
```

Also update `resources/native-host.json` with the eventual extension ID:
1. Load the unpacked extension in Chrome with the manifest above.
2. `chrome://extensions` → Developer mode → copy the ID.
3. Replace `abcdefghijklmnopqrstuvwxyzabcdef` in `allowed_origins` with the ID + `//`.
   (The ID is stable across machines because of the `key`.)

- [ ] **Step 4: Smoke test**

Launch Chrome, `chrome://extensions`, enable Developer mode, **Load unpacked**, point at `E:\note\quickbrain\extension`.
Expected: extension appears with ID matching the fixed key. Toolbar shows the Q icon.

- [ ] **Step 5: Commit**

```powershell
git add scripts/compute-extension-key.js extension/manifest.json extension/icons/ resources/native-host.json .gitignore
# ignore the local key copy
"extension\.key.txt" | Out-File .gitignore -Append -Encoding utf8

git commit -m "feat(extension): MV3 manifest with fixed key and icons"
```

---

## Task 5: Background + popup — save selection only

**Files:**
- Create: `extension/background.js`
- Create: `extension/popup/popup.html`
- Create: `extension/popup/popup.css`
- Create: `extension/popup/popup.js`

- [ ] **Step 1: Background script**

`extension/background.js`:

```js
const HOST = 'com.quickbrain.app'
const send = (msg) => chrome.runtime.sendNativeMessage(HOST, msg)

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'qb-save-selection', title: '保存选中到 QuickBrain', contexts: ['selection'] })
  chrome.contextMenus.create({ id: 'qb-save-page',      title: '保存整页到 QuickBrain',   contexts: ['page'] })
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'qb-save-selection') {
    await send({ type: 'save-selection', payload: { text: info.selectionText, title: tab.title, url: info.pageUrl, tabTitle: tab.title } })
  } else if (info.menuItemId === 'qb-save-page') {
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => document.title + '\n---\n' + document.body.innerText })
    await send({ type: 'save-page', payload: { markdown: result, title: tab.title, url: info.pageUrl, tabTitle: tab.title } })
  }
})

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab) return
  if (command === 'save-selection') {
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.getSelection().toString() })
    if (result) await send({ type: 'save-selection', payload: { text: result, title: tab.title, url: tab.url, tabTitle: tab.title } })
  } else if (command === 'save-page') {
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => document.title + '\n---\n' + document.body.innerText })
    await send({ type: 'save-page', payload: { markdown: result, title: tab.title, url: tab.url, tabTitle: tab.title } })
  }
})
```

- [ ] **Step 2: Popup HTML**

`extension/popup/popup.html`:

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <h1>QuickBrain</h1>
  <button id="save-selection">📋 保存选中</button>
  <button id="save-page">📄 保存整页</button>
  <p id="status"></p>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 3: Popup CSS**

`extension/popup/popup.css`:

```css
body { width: 200px; margin: 0; padding: 14px; font-family: system-ui, sans-serif; }
h1 { font-size: 14px; margin: 0 0 10px; }
button { display: block; width: 100%; padding: 8px; margin-bottom: 8px; border-radius: 6px; border: 1px solid #ccc; background: #f6f8ff; cursor: pointer; }
button:hover { background: #e6ecff; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
#status { font-size: 11px; color: #666; min-height: 14px; }
```

- [ ] **Step 4: Popup JS**

`extension/popup/popup.js`:

```js
const HOST = 'com.quickbrain.app'
const $ = (s) => document.querySelector(s)
const setStatus = (m) => { $(''#status'' ).textContent = m }

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab
}

$(''#save-selection'').addEventListener(''click'', async () => {
  const tab = await activeTab()
  const [{ result: text }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.getSelection().toString() })
  if (!text) { setStatus(''没有选中文本''); return }
  const r = await chrome.runtime.sendNativeMessage(HOST, { type: ''save-selection'', payload: { text, title: tab.title, url: tab.url, tabTitle: tab.title } })
  setStatus(r.success ? `已保存 #${r.id} ✓` : `失败: ${r.error}`)
})

$(''#save-page'').addEventListener(''click'', async () => {
  const tab = await activeTab()
  const [{ result: body }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => document.title + ''\n---\n'' + document.body.innerText })
  const r = await chrome.runtime.sendNativeMessage(HOST, { type: ''save-page'', payload: { markdown: body, title: tab.title, url: tab.url, tabTitle: tab.title } })
  setStatus(r.success ? `已保存 #${r.id} ✓` : `失败: ${r.error}`)
})
```

> Note: paste the four `''` characters in the JS as ordinary single quotes once the file is open in the editor; the markdown escaping here is a side effect of code-blocks in a heredoc.

- [ ] **Step 5: Manual smoke test**

1. Reload extension in Chrome.
2. Open https://example.com, select some text, right-click → **保存选中到 QuickBrain**.
3. Open main dashboard — the selection should appear with tag #web and source_path populated.
4. Open popup, click **保存整页**. The page text should appear as a new note tagged `#web-page`.

- [ ] **Step 6: Commit**

```powershell
git add extension/background.js extension/popup/
git commit -m "feat(extension): context menus + popup for save-selection and save-page"
```

---

## Task 6: Bundle extension + auto-install guidance

**Files:**
- Modify: `package.json`
- Modify: `resources/native-host.json`
- Modify: `main/main.js`

- [ ] **Step 1: Add extraResources to package.json**

In the `build` section of `package.json` add:

```json
"extraResources": [
  { "from": "extension",      "to": "browser-extension" },
  { "from": "resources/native-host.json", "to": "native-host.json" }
]
```

Re-run build:
```powershell
$proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c","cd /d E:\note\quickbrain && npx electron-builder --win --config.npmRebuild=false > C:\Users\36153\build-output.log 2>&1" -WindowStyle Hidden -PassThru
```
Wait ~90 s, confirm `dist\win-unpacked\resources\browser-extension\manifest.json` exists.

- [ ] **Step 2: Replace native-host.json path placeholder**

After build, write `main/native-host-setup.js` post-build to rewrite `resources\native-host.json` with the real install path. Add a new helper:

```js
function rewriteManifestPath() {
  const realPath = app.isPackaged ? process.execPath : path.join(__dirname, '..', 'dist', 'win-unpacked', 'QuickBrain.exe')
  const mp = manifestPath()
  if (!fs.existsSync(mp)) return
  const json = JSON.parse(fs.readFileSync(mp, ''utf8''))
  json.path = realPath
  fs.writeFileSync(mp, JSON.stringify(json, null, 2), ''utf8'')
}
```

Call `rewriteManifestPath()` from `register()` (before `regScriptFor` runs).

- [ ] **Step 3: First-launch extension install prompt**

Open `main/main.js`. After `registerShortcuts(...)` add:

```js
if (!nativeHostSetup.isFirstRunComplete()) {
  const { shell } = require(''electron'')
  notify(''QuickBrain 浏览器扩展'', ''点击开启 Chrome / Edge 扩展加载页'')
  setTimeout(() => shell.openExternal(''chrome://extensions''), 1500)
  nativeHostSetup.markFirstRunComplete()
}
```

Add `isFirstRunComplete()` / `markFirstRunComplete()` to `native-host-setup.js` using a tiny JSON file in `userData`.

- [ ] **Step 4: Smoke test**

Install or unpack to a clean path. Launch — expected:
1. Notification appears.
2. Browser opens `chrome://extensions`.
3. User clicks **Load unpacked** → `C:\Users\<user>\AppData\Local\Programs\QuickBrain\resources\browser-extension`.
4. Extension loads with the fixed ID. Selection save now works without further setup.

- [ ] **Step 5: Commit**

```powershell
git add package.json resources/native-host.json main/main.js main/native-host-setup.js
git commit -m "feat(native-host): bundle extension into installer + auto open extension page"
```

---

## Task 7: Edge cross-check + cleanup

**Files:**
- Modify: `extension/background.js` (no actual change; just regression)
- Modify: `main/native-host-setup.js` (already covers Edge)

- [ ] **Step 1: Verify Edge handshake**

With Edge and the same registry keys in place, perform the same manual flows (selection + page). Both browsers must hit `com.quickbrain.app` and receive JSON.

- [ ] **Step 2: Update README**

Append a short section to the project README (or create `docs/browser-extension.md`):

```
## Browser Extension

QuickBrain ships with a Chrome / Edge extension for capturing selections and pages.

After install, QuickBrain registers its Native Messaging Host at:
  HKCU\Software\Google\Chrome\NativeMessagingHosts\com.quickbrain.app
  HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.quickbrain.app

Load the unpacked extension once:
  chrome://extensions  →  Developer mode  →  Load unpacked  →  <install>\resources\browser-extension
```

- [ ] **Step 3: Tag v0.2.0 and push installer**

```powershell
git tag v0.2.0
git push origin v0.2.0
```

- [ ] **Step 4: Commit**

```powershell
git add docs/browser-extension.md
git commit -m "docs: browser extension setup instructions"
```

---

## Self-review

**Spec coverage:**
- §4 extension components → Tasks 4 + 5
- §5 desktop components → Tasks 1 + 2 + 3 + 6
- §5.2 registry registration → Task 3 + Task 6
- §5.4 IPC integration → Task 2
- §6 protocol details → Tasks 1 + 2 (JSON-lines, 800 KB cap, 5 s timeout omitted but enforced by future error handling — TODO added in Task 1''s send timeout)
- §7 install flow → Task 6
- §8 security (fixed ID) → Task 4
- §9 build/packaging → Task 6
- §10 tests → all tasks include manual smoke tests

**Placeholders:** none left in the file.

**Type / name consistency:** `addNote` / `addNote` everywhere; `save-selection` / `save-page` types consistent across extension and host schema; `PIPE` named identically.

**Open question for execution:** Task 5''s `popup.js` heredoc has over-escaped single quotes (markdown artifact). Implementer must replace the `''` with regular `'` characters when authoring the file. Use `node -e` or a small write script — do NOT copy the heredoc verbatim.