# Browser Extension — QuickBrain Bridge

QuickBrain ships with a Chrome and Edge extension that captures web pages and selections into the desktop app.

## What it does

- Right-click any selected text and choose **保存选中到 QuickBrain** to send it as a note.
- Right-click anywhere on a page and choose **保存整页到 QuickBrain** to send the page body as a Markdown note.
- Click the toolbar icon for a small popup with both buttons, useful on touch-only devices or for muscle-memory.
- Keyboard shortcuts (configurable in `chrome://extensions/shortcuts`):
  - `Alt+Shift+S` — save selection in the active tab
  - `Alt+Shift+P` — save the active tab page

Saved notes carry the source URL (`source_path`) and `source_type='web'` tag, so you can find them later by querying `#web` or by opening the source link from the main panel.

## How it talks to the desktop

The extension never opens a port or sends HTTP traffic. It uses Chromium's Native Messaging protocol:

1. Browser spawns `QuickBrain.exe --native-host` as a child process.
2. Stdin/stdout is JSON-lines (`{"type":"save-selection",...}` `<->` `{"success":true,"id":N}`).
3. `QuickBrain.exe --native-host` connects over a Windows named pipe `\\.\pipe\quickbrain-native-bridge` to the **main** QuickBrain process and persists the note.

The browser must know how to find the host, which is done via the Windows registry.

## Setup after install

On first launch, QuickBrain registers the host under HKCU:

```
HKCU\Software\Google\Chrome\NativeMessagingHosts\com.quickbrain.app
HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.quickbrain.app
```

It also fires a one-time notification and opens `chrome://extensions`. To finish:

1. In `chrome://extensions`, enable **Developer mode** (top-right).
2. Click **Load unpacked** and point to:
   ```
   C:\Users\<you>\AppData\Local\Programs\QuickBrain\resources\browser-extension
   ```
   (or `E:\note\quickbrain\dist\win-unpacked\resources\browser-extension` when running from a dev build).
3. The extension **QuickBrain Bridge** appears with a fixed ID. Selection and page saves work immediately.

After that first launch, `native-host-installed.json` is created in `%APPDATA%\QuickBrain\` and the prompt won't repeat. Re-running the installer updates the binary, the bundled extension, and the manifest path automatically.

## Verifying the host

From any shell:

```powershell
node main/native-host-fixture.js "E:\note\quickbrain\dist\win-unpacked\QuickBrain.exe" ping
node main/native-host-fixture.js "E:\note\quickbrain\dist\win-unpacked\QuickBrain.exe" save-selection
```

`save-selection` inserts a row tagged `#web` with `source_path` populated.

## Troubleshooting

- **"Native host has exited" in browser console** — the host crashed. Check `~/quickbrain-debug.log` for `[pipe] listen failed` or `[native-host-setup] reg failed`.
- **Manifest `path` is wrong** — `rewriteManifestPath()` rewrites it on each launch; a transient mismatch means the host process spawned before the rewrite finished. Restart QuickBrain once.
- **Selection right-click is greyed out** — Chrome may have its own default entries using `selection` context; ours appears below.

## Architecture sketch

```
┌──────────────────┐  Native Messaging  ┌────────────────────────┐
│  Chrome / Edge   │ ─────────────────▶ │  QuickBrain.exe          │
│  Extension MV3   │  JSON-per-line     │  --native-host          │
│                  │ ◀───────────────── │  stdin / stdout bridge   │
└──────────────────┘                    └──────────┬──────────────┘
                                                     │ Named pipe
                                                     ▼
                                          ┌──────────────────────────┐
                                          │  QuickBrain main process  │
                                          │  → addNote                │
                                          └──────────────────────────┘
```
## Dual-Layer Notes (Source + Atoms)

Each saved content becomes one source note plus AI-extracted atom notes.

- **Source note**: full content, includes extraction status (`extracted_at`):
  - `NULL` = not extracted
  - `-1` = failed
  - timestamp = succeeded
- **Atom note**: `is_atom=1`, `parent_id` points to source, `source_range` JSON points into source character range

Search returns atoms first; one click jumps back to source context.

### Source card status icons

| Icon | Meaning |
|---|---|
| `OK` | extracted successfully |
| `...` | extraction in flight (AI configured) |
| `!` | failed - click to retry |
| `AI` | AI not configured |

### Smart search pipeline

1. FTS5 recall (50 candidates)
2. Hard keyword filter (substring in title or content)
3. AI semantic re-rank + snippet extraction (if AI configured)

Empty hard-filter result falls back to the original FTS set (handles Chinese / pinyin).

### Commands

Palette:
- `extract <keyword>` - trigger extraction for matching sources
- `re-extract <keyword>` - delete existing atoms + re-extract
- `extract-all` - extract every unprocessed source

Browser extension HTTP bridge (port 7421, localhost only):
- `POST /notes` - create note + fire background extraction
- `GET /notes?q=&limit=` - smart search
- `GET /health` - server status

### Files

- Schema: `main/db/schema.sql` (notes has `parent_id`, `source_range`, `is_atom`, `extracted_at`)
- Migration: `main/db-init.js` (idempotent `migrate()`)
- Extractor: `main/notes-extractor.js` (orchestrator)
- AI: `main/ai/extract.js` (prompt + parser), `main/ai/service.mjs` (`extractAtoms`)
- HTTP bridge: `main/http-server.js`
- IPC: `main/ipc.js` (`smartSearch`, `extract-source`, `extract-search`, `reveal-source`)
- UI: `renderer/main/main.js`, `renderer/palette/commands/registry.js`