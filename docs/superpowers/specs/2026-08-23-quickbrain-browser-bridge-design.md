# QuickBrain Browser Bridge — Design Spec

**Date**: 2026-08-23
**Status**: Approved (pending)
**Owner**: QuickBrain Dev

## 1. Goal

Allow users of Chrome / Edge to capture web content — selected text or an entire page — into the local QuickBrain desktop app from inside the browser, without switching windows or copy-pasting.

Success criteria:
1. With QuickBrain running, a user can right-click any selection and choose **"保存选中到 QuickBrain"** and see a brief confirmation.
2. From the toolbar icon popup, a user can click **保存整页** and have the page saved as a markdown note with the page title as the note title.
3. No data leaves the local machine; everything happens through Chromium''s Native Messaging channel.
4. Initial install flow takes at most one click after QuickBrain launches for the first time.

## 2. Non-goals (out of scope)

- Floating + buttons in pages
- In-extension search
- Chrome Web Store / Edge Add-ons publishing in v1
- Cloud sync, multi-device, conflict resolution
- AI reformatting of captured content (the existing `format-with-ai` IPC stays available but is not auto-invoked by the extension)
- Capturing dynamic-page screenshots

## 3. System architecture

```
┌──────────────────┐  Native Messaging  ┌────────────────────────┐
│  Chrome / Edge   │ ─────────────────▶ │  QuickBrain.exe          │
│  Extension MV3   │  JSON-per-line     │  --native-host argv     │
│                  │ ◀───────────────── │  stdin / stdout bridge   │
└──────────────────┘                    └──────────┬──────────────┘
                                                     │ Named pipe
                                                     ▼
                                          ┌──────────────────────────┐
                                          │  QuickBrain main process  │
                                          │  → addNote / importDoc   │
                                          └──────────────────────────┘
```

Both Edge and Chrome speak the same Native Messaging protocol. We register one host (`com.quickbrain.app`) once, and Chromium will launch it whenever any allowed-extension sends a message.

## 4. Extension components

| Path | Purpose |
|---|---|
| `extension/manifest.json` | MV3, fixed `key`, permissions (`contextMenus`, `nativeMessaging`, `storage`, `activeTab`, `scripting`) |
| `extension/background.js` | Service worker: registers context menus, popup launcher, keyboard commands, fixed extension id |
| `extension/popup/popup.html` + `.js` + `.css` | 140×260 popup with three actions |
| `extension/icons/{16,32,48,128}.png` | Toolbar / store icons (reuse QuickBrain Q icon) |
| `extension/lib/turndown.js` | HTML → Markdown (bundled, no CDN) |
| `extension/lib/readability.js` | Mozilla Readability (bundled) |

### 4.1 UX

- **Toolbar click** → opens popup (140×260):
  - Button `保存选中` (only enabled when there''s an active selection)
  - Button `保存整页`
  - Status line under buttons (`已保存 #123 ✓` / `失败: <err>`)
- **Right-click menu**:
  - `保存选中到 QuickBrain` (selection only)
  - `保存整页到 QuickBrain`
- **Keyboard** (`commands` in manifest):
  - `Alt+Shift+S` → save selection
  - `Alt+Shift+P` → save page

### 4.2 Save selection flow

1. `chrome.contextMenus.onClick` or popup handler → `chrome.runtime.sendNativeMessage('com.quickbrain.app', {type:'save-selection', payload:{text, title, url, tabTitle}})`.
2. Browser launches Native Host (`QuickBrain.exe --native-host`) and pipes the message.
3. Native host writes to named pipe; main process IPC handler persists as note.

### 4.3 Save page flow

1. Popup / context menu runs `chrome.scripting.executeScript` to extract `<title>` + `document.body.innerHTML` via Readability.js (full-article mode, fallback to plain innerHTML).
2. Convert HTML → Markdown via Turndown.
3. Truncate to 800 KB hard cap.
4. Send `{type:'save-page', payload:{markdown, title, url, tabTitle}}` to native host.

## 5. Desktop components

| Path | Purpose |
|---|---|
| `main/native-host.js` | Detects `argv.includes('--native-host')` and enters stdio loop |
| `main/native-host-setup.js` | Registers / unregisters Windows registry keys |
| `main/native-host.json` | Native Messaging Manifest template |
| `main/ipc.js` | New IPC handlers to receive pipe messages |
| `main/main.js` | On first launch: register native host if not registered, log status |
| `package.json` (build.extraResources) | Bundle `extension/` and the host json to a stable path |

### 5.1 Native Messaging Manifest

`native-host.json` lives at `C:\Users\<user>\AppData\Local\Programs\QuickBrain\resources\native-host.json`:

```json
{
  "name": "com.quickbrain.app",
  "description": "QuickBrain Native Messaging Host",
  "path": "C:\\Users\\<user>\\AppData\\Local\\Programs\\QuickBrain\\QuickBrain.exe",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://<FIXED_ID>/"]
}
```

`<FIXED_ID>` comes from a `key` in `extension/manifest.json` (32-byte RSA modulus encoded in base10).

### 5.2 Registry registration

`native-host-setup.js` writes:

```
HKCU\Software\Google\Chrome\NativeMessagingHosts\com.quickbrain.app
  (Default) = "C:\Users\<user>\AppData\Local\Programs\QuickBrain\resources\native-host.json"

HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.quickbrain.app
  (Default) = <same path>
```

Both browsers share the same host process; registration is idempotent.

### 5.3 Process model

When the browser invokes Native Messaging, it spawns `QuickBrain.exe --native-host` as a separate process. argv contains `--native-host`, so `main.js` skips normal init (`windows.js`, tray, etc.) and runs only the stdio bridge, talking to the main process via a Windows named pipe: `\\.\pipe\quickbrain-native-bridge` (length-bounded, JSON-lines protocol).

If no main process is running, the host process creates a minimal one-shot file under `userData` and exits after responding — but the user already has the desktop app, so we can assume main process is reachable.

### 5.4 IPC handlers in main

- `native-host-message` (handle): receives a JSON message from the pipe, calls either:
  - `addNote({content, title, tags:['web']})` for selection, or
  - `importDocument(markdownPath, opts)` for page (writing the markdown to a temp file).
  Returns `{success, id}` or `{success:false, error}` to the pipe writer.

## 6. Protocol details

- **Wire format**: one JSON object per line. Stdout only used for responses.
- **Max payload**: 800 KB after Markdown conversion. Above this, the extension truncates with a `…(truncated)` marker.
- **Timeouts**: native-host answers within 5 s; UI shows error if exceeded.
- **Logging**: each incoming / outgoing message is appended to `os.homedir()/quickbrain-debug.log` (already used).

## 7. Installation flow

1. User installs `QuickBrain Setup 1.X.exe` (existing NSIS installer).
2. On first launch, `main.js` checks the registry. If absent, it writes it and pops a one-time notification:
   > "QuickBrain can save web pages from Chrome / Edge.
   > Click here to load the extension."
3. Notification button opens `chrome://extensions/` (Edge: `edge://extensions/`). User toggles Developer Mode, clicks **Load unpacked**, points at `C:\Users\<user>\AppData\Local\Programs\QuickBrain\resources\browser-extension\`.
4. Extension loads with the fixed ID; Native Messaging is now wired.
5. Future installs / upgrades preserve the registry key (only re-write if missing or path changed).

## 8. Security considerations

- **Fixed extension ID**: `manifest.json` ships a `"key"` field; unpacked installs keep the same ID across machines → allowed_origins stays valid.
- **Stdout isolation**: native-host never logs secrets; only structured messages.
- **Source URL captured**: every note stores its `source_url` and `source_type='web'` for future use (open-from-note round-trip).
- **No file system access from extension** beyond what Readability / Turndown gives us.
- **Same-user scope**: HKCU only; no admin elevation required.

## 9. Build & packaging

- `package.json.build.extraResources` adds `extension/` and `native-host.json` to the unpacked output:
  ```
  "extraResources": [
    { "from": "extension", "to": "browser-extension" },
    { "from": "main/native-host.json", "to": "native-host.json" }
  ]
  ```
- `native-host.json`''s `path` is rewritten at install / first-run time (reg script uses the actual install path).
- Re-build only requires re-running `npx electron-builder --win --config.npmRebuild=false`.

## 10. Test plan

| Layer | Test |
|---|---|
| Extension: capture | Manually click popup on a page with and without selection |
| Extension: page | Save a long article; verify markdown has title + body + source_url |
| Native host | Send crafted JSON via stdin to `QuickBrain.exe --native-host`; expect JSON response |
| IPC | Save triggers a row in `notes` with `source_path=''`, `source_type='web'` |
| Auto-register | Reset registry; launch QuickBrain; verify both `HKCU\\Google\\Chrome\\...` and `HKCU\\Microsoft\\Edge\\...` written |
| Edge | Run same manual tests on Edge with same registry |
| Fix-ID | After repack, the same extension ID is reported by `chrome://extensions/` |

## 11. Rollout plan / commit slices

1. **Native host protocol + pipe + main IPC** — small, no UI
2. **Manual unpacked extension skeleton (no contextMenus yet)** — just a popup that sends a fixture
3. **Context menus + popup actions for selection**
4. **Save page (Readability + Turndown)**
5. **Auto-register + first-launch notification + bundle extraResources**
6. **Edge cross-check + regression**

Each slice lands as its own commit (or grouped pairs where tightly coupled).

## 12. Open questions

None — user picked A for scope, channel, and install; Chrome + Edge both targeted.
