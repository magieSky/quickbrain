const fs = require('fs');
const os = require('os');
const path = require('path');

// 日志文件
const LOG_FILE = path.join(os.homedir(), 'quickbrain-debug.log');
try { fs.appendFileSync(LOG_FILE, '\n=== QuickBrain Debug Log ' + new Date().toISOString() + ' ===\n'); } catch (e) {}

// 重写 console.log/error 写入文件
const _log = console.log.bind(console);
const _err = console.error.bind(console);
function logToFile(level, args) {
  const line = '[' + new Date().toISOString() + '] [' + level + '] ' +
    args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ') + '\n';
  try { fs.appendFileSync(LOG_FILE, line); } catch (e) {}
}
console.log = function(...args) { logToFile('log', args); _log(...args); };
console.error = function(...args) { logToFile('error', args); _err(...args); };
console.warn = function(...args) { logToFile('warn', args); _log('WARN:', ...args); };

console.log('[main] log file: ' + LOG_FILE);



const { app, dialog } = require('electron')
const { initDatabase, closeDatabase, getDB } = require('./db-init')
const { registerIpcHandlers, setAIService } = require('./ipc')
const { registerShortcuts, unregisterAll } = require('./shortcuts')
const { createTray, notify } = require('./tray')
const {
  createPaletteWindow, createMainWindow,
  showPalette, hidePalette, togglePalette,
  toggleMainWindow, showMainWindow, getMainWindow
} = require('./windows')

function loadAIConfig(AIService) {
  const configPath = path.join(app.getPath('userData'), 'config.json')
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
      return new AIService(config)
    } catch (e) {
      console.error('Failed to load AI config:', e)
    }
  }
  return null
}

function openAISettings(AIService) {
  dialog.showOpenDialog({
    title: '选择配置文件',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  }).then(result => {
    if (!result.canceled && result.filePaths.length > 0) {
      const config = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'))
      setAIService(new AIService(config))
      fs.writeFileSync(
        path.join(app.getPath('userData'), 'config.json'),
        JSON.stringify(config, null, 2)
      )
      notify('QuickBrain', 'AI 配置已更新')
    }
  })
}


function showAddDialog() {
  showMainWindow()
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    // 等渲染进程 ready 后再发送事件
    setTimeout(() => {
      win.webContents.send('show-add-dialog')
    }, 100)
  }
}

app.whenReady().then(async () => {
  await initDatabase()

  // AIService 是 ESM 模块（CJS 不能 require .mjs）
  const { AIService } = await import('./ai/service.mjs')
  const aiService = loadAIConfig(AIService)
  if (aiService) setAIService(aiService)

  const httpServer = require('./http-server')
  httpServer.start({
    getDB,
    onNotesUpdated: (detail) => {
      const { BrowserWindow } = require('electron')
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('notes-updated', detail)
      }
    }
  })

  registerIpcHandlers()

  createPaletteWindow(path.join(__dirname, '..', 'preload'))
  createMainWindow(path.join(__dirname, '..', 'preload'))

  createTray({
    onShowPalette: showPalette,
    onShowMain: toggleMainWindow,
    onSettings: () => openAISettings(AIService),
    onQuit: () => app.quit()
  })

  registerShortcuts({
    onPalette: togglePalette,
    onMainWindow: toggleMainWindow,
    onAddNote: showAddDialog
  })

  // Sync: register IPC + start daemon (Task 23)
  const cfg = require('./config')
  const meta = require('./sync/meta')
  const outbox = require('./sync/outbox')
  const syncClient = require('./sync/client')
  const { registerSyncHandlers } = require('./sync/ipc-handlers')
  const { createDaemon } = require('./sync/daemon')
  const runtime = require('./sync/runtime')
  registerSyncHandlers(getDB)
  cfg.ensureDeviceId()
  const syncDaemon = createDaemon({
    getConfig: () => {
      const c = cfg.read().sync || {}
      return {
        enabled: !!c.enabled,
        serverUrl: c.serverUrl,
        bearer: cfg.buildBearer(),
        deviceId: c.deviceId,
        getCursor: () => { const m = c.deviceId ? meta.get(getDB(), c.deviceId) : null; return m ? m.last_pull_cursor : 0 },
        setCursor: v => { if (c.deviceId) meta.setCursor(getDB(), c.deviceId, v) }
      }
    },
    onPull: async () => {
      const c = cfg.read().sync || {}
      if (!c.enabled) return
      try {
        const cur = c.deviceId ? (meta.get(getDB(), c.deviceId) || { last_pull_cursor: 0 }).last_pull_cursor : 0
        const r = await syncClient.pull({ serverUrl: c.serverUrl, bearer: cfg.buildBearer(), since: cur, limit: 200 })
        const rows = (r.changes || []).map(row => ({
          client_id: row.client_id, content: row.content || '', title: row.title || '',
          category: row.category || 'uncategorized', tags: row.tags || [], source_path: row.source_path || '',
          source_type: row.source_type || '', parent_id: row.parent_id || null,
          source_range: row.source_range || '', is_atom: row.is_atom || 0,
          updated_at: row.updated_at, rev: row.rev || 1, deleted_at: row.deleted_at || null
        }))
        for (const row of rows) {
          try { applyServerRowToDb(getDB(), row) } catch (e) { console.error('[sync] apply failed:', e.message) }
        }
        if (c.deviceId) meta.setCursor(getDB(), c.deviceId, r.next_cursor || Date.now())
      } catch (e) { console.error('[sync] pull failed:', e.message) }
    },
    onPush: async () => {
      const c = cfg.read().sync || {}
      if (!c.enabled) return
      try {
        const rows = outbox.listForPush(getDB(), 100)
        if (!rows.length) return
        const ops = rows.map(r => r.op === 'upsert'
          ? { op: 'upsert', note: { ...r.payload, client_id: r.payload.client_id || ((c.deviceId || 'unknown') + ':' + (r.noteId || '')) } }
          : { op: 'delete', client_id: r.payload.client_id, updated_at: r.payload.updated_at })
        const r = await syncClient.push({ serverUrl: c.serverUrl, bearer: cfg.buildBearer(), ops })
        const conflictIds = new Set((r.conflicts || []).map(cf => cf.client_id))
        for (const row of rows) {
          if (conflictIds.has(row.payload.client_id)) outbox.setLastError(getDB(), row.seq, 'server-conflict')
        }
        const ok = rows.filter(x => !conflictIds.has(x.payload.client_id)).map(x => x.seq)
        outbox.markAcked(getDB(), ok)
        if (c.deviceId) meta.setLastPushAt(getDB(), c.deviceId, Date.now())
      } catch (e) { console.error('[sync] push failed:', e.message) }
    }
  })
  syncDaemon.start()
  runtime.set(syncDaemon)

  function applyServerRowToDb(db, row) {
    if (row.deleted_at) {
      db.prepare('UPDATE notes SET deleted_at = ? WHERE client_id = ?').run(row.deleted_at, row.client_id)
      return
    }
    db.prepare(`INSERT INTO notes (client_id, content, title, category, tags, source_path, source_type, parent_id, source_range, is_atom, updated_at, rev) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(client_id) DO UPDATE SET content = excluded.content, title = excluded.title, category = excluded.category, tags = excluded.tags, source_path = excluded.source_path, source_type = excluded.source_type, parent_id = excluded.parent_id, source_range = excluded.source_range, is_atom = excluded.is_atom, updated_at = excluded.updated_at, rev = excluded.rev`).run(row.client_id, row.content, row.title, row.category, JSON.stringify(row.tags), row.source_path, row.source_type, row.parent_id, row.source_range, row.is_atom, row.updated_at, row.rev)
  }

  app.on('activate', () => {
    if (!mainWindowExists()) createMainWindow(path.join(__dirname, '..', 'preload'))
  })
})

function mainWindowExists() {
  const { BrowserWindow } = require('electron')
  return BrowserWindow.getAllWindows().some(w => !w.isDestroyed())
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  unregisterAll()
  closeDatabase()
})

module.exports = { getDB }
