const { ipcMain, BrowserWindow, app, shell } = require('electron')
const fs = require('fs')
const path = require('path')
const { PROVIDERS } = require('./ai/providers.js')
const { getDB } = require('./db-init')
const { addNote, searchNotes, getNoteById, getRecentNotes } = require('./db/search')
const { importDocument } = require('./import/store')

let aiService = null

function setAIService(service) {
  aiService = service
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


function registerIpcHandlers() {
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
  })

  ipcMain.handle('delete-note', async (event, id) => {
    const db = getDB()
    db.prepare('DELETE FROM notes WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle('format-with-ai', async (event, { content, style }) => {
    if (!aiService) return { success: false, error: '鏈厤缃?AI 鏈嶅姟' }
    return await aiService.formatContent(content, style)
  })

  ipcMain.handle('categorize-with-ai', async (event, { content }) => {
    if (!aiService) return { success: false, error: '鏈厤缃?AI 鏈嶅姟' }
    return await aiService.categorizeContent(content)
  })

  ipcMain.handle('semantic-search', async (event, { query, candidateSummaries }) => {
    if (!aiService) return { success: false, error: '鏈厤缃?AI 鏈嶅姟' }
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
      const clean = {
        provider: cfg.provider,
        apiKey: cfg.apiKey || '',
        model: cfg.model || undefined,
        baseURL: cfg.baseURL || undefined
      }
      const provider = PROVIDERS.find(p => p.id === clean.provider)
      if (!provider) return { success: false, error: '未知的 provider' }
      if (provider.requiresApiKey && !clean.apiKey) return { success: false, error: '请填写 API Key' }
      writeConfig(clean)
      const newService = await buildService(clean)
      setAIService(newService)
      console.log('[ipc] save-ai-config: provider=' + clean.provider + ' service=' + (newService ? 'OK' : 'NULL'))
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

module.exports = { registerIpcHandlers, setAIService }

