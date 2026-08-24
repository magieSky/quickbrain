const { ipcMain, BrowserWindow, app, shell } = require('electron')
const fs = require('fs')
const path = require('path')
const { PROVIDERS } = require('./ai/providers.js')
const { getDB } = require('./db-init')
const { addNote, searchNotes, getNoteById, getRecentNotes } = require('./db/search')
const { importDocument } = require('./import/store')
const autoLaunch = require('./auto-launch-service')
const pipeBridge = require('./named-pipe-bridge')

let aiService = null

function setAIService(service) {
  aiService = service
  try { require('./notes-extractor').setExtractorAIService(service) } catch (e) {}
}

function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json')
}

function readConfig() {
  const p = getConfigPath()
  if (!fs.existsSync(p)) return {}
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) }
  catch (e) { console.error('[ipc] readConfig failed:', e.message); return {} }
}

function writeConfig(cfg) {
  fs.writeFileSync(getConfigPath(), JSON.stringify(cfg, null, 2), 'utf8')
}

async function buildService(cfg) {
  if (!cfg || !cfg.provider) return null
  const provider = PROVIDERS.find(p => p.id === cfg.provider)
  if (!provider) return null
  if (provider.requiresApiKey && !cfg.apiKey) return null
  const { AIService } = await import('./ai/service.mjs')
  return new AIService(cfg)
}



function onPipeMessage(msg, socket) {
  try {
    const payload = (msg && msg.payload) || {}
    if (msg && msg.type === 'save-selection') {
      const text = payload.text
      const title = payload.title
      const url = payload.url
      if (!text || !text.trim()) {
        socket.write(JSON.stringify({ success: false, error: 'empty-text' }) + '\n')
        return
      }
      const db = getDB()
      const id = addNote(db, {
        content: text,
        title: title || (text.split('\n')[0] || '').slice(0, 80),
        tags: ['web'],
        source_path: url || '',
        source_type: 'web'
      })
      socket.write(JSON.stringify({ success: true, id }) + '\n')
      broadcastNotesUpdated({ type: msg.type, id })
      return
    }
    if (msg && msg.type === 'save-page') {
      const markdown = payload.markdown
      const title = payload.title
      const url = payload.url
      if (!markdown || !markdown.trim()) {
        socket.write(JSON.stringify({ success: false, error: 'empty-markdown' }) + '\n')
        return
      }
      const db = getDB()
      const id = addNote(db, {
        content: markdown,
        title: title || (url || 'web page').slice(0, 80),
        tags: ['web-page'],
        source_path: url || '',
        source_type: 'web'
      })
      socket.write(JSON.stringify({ success: true, id }) + '\n')
      broadcastNotesUpdated({ type: msg.type, id })
      return
    }
    socket.write(JSON.stringify({ success: false, error: 'unsupported-type' }) + '\n')
  } catch (e) {
    console.error('[native-host] handler failed:', e.message)
    try { socket.write(JSON.stringify({ success: false, error: e.message }) + '\n') } catch (_) {}
  }
}

pipeBridge.startServer(onPipeMessage)

function toResult(n) {
  return {
    noteId: n.id,
    title: n.title,
    content: n.content,
    is_atom: n.is_atom || 0,
    parent_id: n.parent_id || null,
    source_range: n.source_range || '',
    snippet: (n.content || '').slice(0, 200),
    score: 1.0
  }
}

function smartSearch(keyword, limit = 20) {
  const db = getDB()
  const candidates = searchNotes(db, keyword, 50)
  if (!candidates.length) return []

  const kw = keyword.toLowerCase()
  let filtered = candidates.filter(n =>
    (n.title || '').toLowerCase().includes(kw) ||
    (n.content || '').toLowerCase().includes(kw))
  if (!filtered.length) filtered = candidates

  if (aiService) {
    return Promise.resolve(aiService.semanticSearch(keyword, filtered.slice(0, 20), limit))
      .then(r => (r && r.results) || filtered.slice(0, limit).map(toResult))
      .catch(() => filtered.slice(0, limit).map(toResult))
  }
  return filtered.slice(0, limit).map(toResult)
}

function registerIpcHandlers() {
  function enqueueNoteOutbox(db, noteId, op, extra) {
    try {
      const cfg = require('./config')
      const outbox = require('./sync/outbox')
      const sync = cfg.read().sync || {}
      if (!sync.deviceId) return
      const row = db.prepare('SELECT client_id, content, title, category, tags, source_path, source_type, parent_id, source_range, is_atom, updated_at, rev, deleted_at FROM notes WHERE id = ?').get(noteId)
      if (!row || !row.client_id) return
      const payload = op === 'upsert' ? {
        client_id: row.client_id,
        content: row.content || '',
        title: row.title || '',
        category: row.category || 'uncategorized',
        tags: row.tags ? JSON.parse(row.tags) : [],
        source_path: row.source_path || '',
        source_type: row.source_type || '',
        parent_id: row.parent_id || null,
        source_range: row.source_range || '',
        is_atom: row.is_atom || 0,
        updated_at: row.updated_at,
        rev: row.rev || 1,
        deleted_at: row.deleted_at || null
      } : {
        client_id: row.client_id,
        updated_at: row.updated_at,
        deleted_at: (extra && extra.deleted_at) || row.deleted_at || Date.now()
      }
      outbox.append(db, { op, noteId, payload })
      try { require('./sync/runtime').triggerPush() } catch (_) {}
    } catch (e) {
      console.error('[sync] outbox enqueue failed:', e.message)
    }
  }

  ipcMain.on('reveal-source', (event, { id, range }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) win.webContents.send('locate-note', { id, range: range || null })
  })

  ipcMain.handle('extract-source', async (event, { id, force = false } = {}) => {
    const { extractAtomsForSource } = require('./notes-extractor')
    return extractAtomsForSource(id, { force })
  })

  ipcMain.handle('extract-search', async (event, { keyword, force = false } = {}) => {
    const { getSourceNotes } = require('./db/search')
    const sources = getSourceNotes(getDB(), { keyword: keyword || null, onlyUnExtracted: !force })
    const { extractAtomsForSource } = require('./notes-extractor')
    let count = 0
    for (const s of sources) {
      const r = await extractAtomsForSource(s.id, { force })
      if (r.ok && !r.skipped) count++
    }
    return { ok: true, processed: sources.length, extracted: count }
  })

  ipcMain.on('debug-log', (event, { level, args }) => {
    const line = '[' + new Date().toISOString() + '] [renderer] [' + level + '] ' +
      (args || []).map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ') + '\n';
    try { require('fs').appendFileSync(require('path').join(require('os').homedir(), 'quickbrain-debug.log'), line); } catch (e) {}
  })
  ipcMain.handle('search-notes', async (event, filters = {}) => {
    const db = getDB()
    const q = filters.search || ''
    const requestedLimit = parseInt(filters.limit, 10)
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 200) : 20
    console.log('[ipc search-notes] query=' + JSON.stringify(q) + ' limit=' + limit + ' db=' + (db ? 'OK' : 'NULL'))
    const start = Date.now()
    const r = searchNotes(db, q, limit)
    console.log('[ipc search-notes] result.length=' + r.length + ' cost=' + (Date.now() - start) + 'ms')
    return r
  })

  ipcMain.handle('get-recent-notes', async (event, params = {}) => {
    const db = getDB()
    const limit = Math.max(1, Math.min(parseInt(params.limit, 10) || 20, 200))
    const start = Date.now()
    const r = getRecentNotes(db, limit)
    console.log('[ipc get-recent-notes] limit=' + limit + ' result.length=' + r.length + ' cost=' + (Date.now() - start) + 'ms')
    return r
  })

  ipcMain.handle('add-note', async (event, noteData) => {
    const db = getDB()
    const id = addNote(db, noteData)
    enqueueNoteOutbox(db, id, 'upsert')
    return { id, ...noteData }
  })

  ipcMain.handle('import-document', async (event, filePath) => {
    if (!filePath || typeof filePath !== 'string') {
      return { success: false, error: '缺少文件路径' }
    }
    console.log('[ipc import-document] filePath=' + filePath)
    const start = Date.now()
    try {
      const db = getDB()
      const result = await importDocument(db, filePath)
      console.log('[ipc import-document] OK id=' + result.id + ' title=' + JSON.stringify(result.title) + ' cost=' + (Date.now() - start) + 'ms')
      enqueueNoteOutbox(db, result.id, 'upsert')
            try {
        const { extractAtomsForSource } = require('./notes-extractor')
        setImmediate(() => {
          extractAtomsForSource(result.id).catch(err =>
            console.error('[import] extract failed:', err.message))
        })
      } catch (e) { console.error('[import] extract setup failed:', e.message) }
return { success: true, ...result }
    } catch (error) {
      console.log('[ipc import-document] error: ' + error.message)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('reveal-in-folder', async (event, filePath) => {
    if (!filePath || typeof filePath !== 'string') {
      return { success: false, error: '缺少文件路径' }
    }
    if (!fs.existsSync(filePath)) {
      return { success: false, error: '文件不存在: ' + filePath }
    }
    console.log('[ipc reveal-in-folder] filePath=' + filePath)
    shell.showItemInFolder(filePath)
    return { success: true }
  })

  ipcMain.handle('update-note', async (event, { id, ...updates }) => {
    const db = getDB()
    const keys = Object.keys(updates)
    if (keys.length === 0) return
    const setClause = keys.map(k => `${k} = ?`).join(', ')
    db.prepare(`UPDATE notes SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(...keys.map(k => typeof updates[k] === 'object' ? JSON.stringify(updates[k]) : updates[k]), id)
    enqueueNoteOutbox(db, id, 'upsert')
  })

  ipcMain.handle('delete-note', async (event, id) => {
    const db = getDB()
    const row = db.prepare('SELECT client_id FROM notes WHERE id = ?').get(id)
    if (row) {
      const ts = Date.now()
      db.prepare('UPDATE notes SET deleted_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(ts, id)
      enqueueNoteOutbox(db, id, 'delete', { deleted_at: ts })
    } else {
      db.prepare('DELETE FROM notes WHERE id = ?').run(id)
    }
    return true
  })

  ipcMain.handle('get-ai-mode', () => {
    const cfg = require('./config')
    const c = cfg.read()
    return { mode: (c.ai && c.ai.mode) || 'direct', serverConfigured: !!(c.sync && c.sync.enabled && c.sync.serverUrl && c.sync.token) }
  })

  ipcMain.handle('set-ai-mode', (_e, mode) => {
    const cfg = require('./config')
    const c = cfg.read()
    c.ai = c.ai || {}
    c.ai.mode = mode === 'server' ? 'server' : 'direct'
    cfg.write(c)
    return { ok: true, mode: c.ai.mode }
  })

  ipcMain.handle('format-with-ai', async (event, { content, style }) => {
    console.log('[ipc] format-with-ai style=' + style + ' contentLen=' + (content || '').length)
    try {
      const serverProxy = require('./ai/server-proxy')
      const ctx = serverProxy.getProxyContext ? serverProxy.getProxyContext() : null
      if (ctx) {
        const r = await serverProxy.formatViaServer({ content, style })
        console.log('[ipc] format-with-ai (server) success=' + r.success + (r.error ? ' err=' + r.error : ''))
        return r
      }
    } catch (e) { console.error('[ipc] format-with-ai server proxy error:', e.message) }
    if (!aiService) { console.log('[ipc] format-with-ai: no AI service'); return { success: false, error: 'no-ai' } }
    const r = await aiService.formatContent(content, style)
    console.log('[ipc] format-with-ai result: success=' + r.success + ' bodyLen=' + ((r && r.formattedContent) || '').length + (r.error ? ' err=' + r.error : ''))
    return r
  })

  ipcMain.handle('categorize-with-ai', async (event, { content }) => {
    try {
      const serverProxy = require('./ai/server-proxy')
      const ctx = serverProxy.getProxyContext ? serverProxy.getProxyContext() : null
      if (ctx) {
        return await serverProxy.categorizeViaServer({ content })
      }
    } catch (e) { console.error('[ipc] categorize-with-ai server proxy error:', e.message) }
    if (!aiService) return { success: false, error: 'no-ai' }
    return await aiService.categorizeContent(content)
  })
  ipcMain.handle('semantic-search', async (event, { query, candidateSummaries }) => {
    try {
      const serverProxy = require('./ai/server-proxy')
      const ctx = serverProxy.getProxyContext ? serverProxy.getProxyContext() : null
      if (ctx) return await serverProxy.semanticSearchViaServer({ query, candidateSummaries })
    } catch (e) { console.error('[ipc] server proxy error:', e.message) }
    if (!aiService) return { success: false, error: 'no-ai' }
    return await aiService.semanticSearch(query, candidateSummaries)
  })

  ipcMain.handle('get-all-notes', async () => {
    const db = getDB()
    return db.prepare('SELECT * FROM notes ORDER BY created_at DESC').all()
      .map(row => ({ ...row, tags: safeParse(row.tags, []) }))
  })


  ipcMain.handle('get-note', async (event, id) => {
    const db = getDB()
    return getNoteById(db, id)
  })

  ipcMain.handle('write-clipboard', async (event, text) => {
    const { clipboard } = require('electron')
    clipboard.writeText(text || '')
    return true
  })

  ipcMain.handle('notify', async (event, { title, body }) => {
    const { Notification } = require('electron')
    new Notification({ title, body }).show()
    return true
  })

  ipcMain.handle('relaunch', async () => {
    const { app } = require('electron')
    app.relaunch()
    app.quit()
  })

  ipcMain.handle('quit', async () => {
    const { app } = require('electron')
    app.quit()
  })

  ipcMain.handle('open-external', async (event, url) => {
    const { shell } = require('electron')
    if (/^https?:\/\//.test(url)) await shell.openExternal(url)
    return true
  })

  ipcMain.handle('get-auto-launch', async () => {
    try { return await autoLaunch.isEnabled() }
    catch (e) { console.error('[ipc get-auto-launch]', e.message); return false }
  })

  ipcMain.handle('set-auto-launch', async (event, enabled) => {
    console.log('[ipc set-auto-launch] enabled=' + !!enabled)
    return await autoLaunch.setEnabled(!!enabled)
  })

  ipcMain.on('hide-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) win.hide()
  })

  ipcMain.on('show-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) win.show()
  })


  ipcMain.handle('get-ai-providers', async () => {
    return PROVIDERS.map(p => ({
      id: p.id, name: p.name, icon: p.icon, description: p.description,
      defaultModel: p.defaultModel, models: p.models,
      requiresApiKey: p.requiresApiKey, customBaseURL: !!p.customBaseURL,
      customModel: !!p.customModel, keyHint: p.keyHint, keyUrl: p.keyUrl,
      baseURL: p.baseURL
    }))
  })

  ipcMain.handle('get-ai-config', async () => {
    const cfg = readConfig()
    const provider = cfg.provider ? PROVIDERS.find(p => p.id === cfg.provider) : null
    return {
      provider: cfg.provider || null,
      hasApiKey: !!cfg.apiKey,
      apiKeyPreview: cfg.apiKey ? cfg.apiKey.slice(0, 4) + '****' : null,
      model: cfg.model || (provider && provider.defaultModel) || null,
      baseURL: cfg.baseURL || null
    }
  })

  ipcMain.handle('save-ai-config', async (event, cfg) => {
    try {
      const provider = PROVIDERS.find(p => p.id === cfg.provider)
      if (!provider) return { success: false, error: 'unknown provider' }
      const existing = readConfig() || {}
      const incomingKey = (cfg.apiKey && String(cfg.apiKey).trim()) || ''
      const apiKey = incomingKey || existing.apiKey || ''
      if (provider.requiresApiKey && !apiKey) return { success: false, error: 'API Key required' }
      const clean = Object.assign({}, existing, {
        provider: cfg.provider,
        apiKey: apiKey,
        model: cfg.model || existing.model || undefined,
        baseURL: cfg.baseURL || existing.baseURL || undefined
      })
      writeConfig(clean)
      const newService = await buildService(clean)
      setAIService(newService)
      const preserved = Object.keys(existing).filter(k => !(k in { provider: 1, apiKey: 1, model: 1, baseURL: 1 }))
      console.log('[ipc] save-ai-config: provider=' + clean.provider + ' service=' + (newService ? 'OK' : 'NULL') + ' preservedFields=' + preserved.join(','))
      return { success: true, info: newService ? newService.getInfo() : null }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('test-ai-connection', async (event, cfg) => {
    try {
      const provider = PROVIDERS.find(p => p.id === cfg.provider)
      if (!provider) return { success: false, error: '未知的 provider' }
      if (provider.requiresApiKey && !cfg.apiKey) return { success: false, error: '请填写 API Key' }
      const service = await buildService(cfg)
      if (!service) return { success: false, error: '无法创建服务' }
      return await service.testConnection()
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.on('locate-note', (event, id) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      win.webContents.send('locate-note', id)
    }
  })
}

function safeParse(str, fallback) {
  try { return JSON.parse(str) } catch { return fallback }
}


function broadcastNotesUpdated(detail) {
  try {
    const { BrowserWindow } = require('electron')
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send('notes-updated', detail)
    }
  } catch (e) {
    console.error('[native-host] broadcast failed:', e.message)
  }
}
module.exports = { registerIpcHandlers, setAIService, autoLaunch, onPipeMessage, nativeBridge: pipeBridge, broadcastNotesUpdated, smartSearch, toResult }

