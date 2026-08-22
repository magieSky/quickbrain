const { ipcMain, BrowserWindow } = require('electron')
const { getDB } = require('./db-init')
const { addNote, searchNotes, getNoteById } = require('./db/search')

let aiService = null

function setAIService(service) {
  aiService = service
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
    console.log('[ipc search-notes] query=' + JSON.stringify(q) + ' db=' + (db ? 'OK' : 'NULL'))
    const start = Date.now()
    const r = searchNotes(db, q, 20)
    console.log('[ipc search-notes] result.length=' + r.length + ' cost=' + (Date.now() - start) + 'ms')
    return r
  })

  ipcMain.handle('add-note', async (event, noteData) => {
    const db = getDB()
    const id = addNote(db, noteData)
    return { id, ...noteData }
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
    if (!aiService) return { success: false, error: '未配置 AI 服务' }
    return await aiService.formatContent(content, style)
  })

  ipcMain.handle('categorize-with-ai', async (event, { content }) => {
    if (!aiService) return { success: false, error: '未配置 AI 服务' }
    return await aiService.categorizeContent(content)
  })

  ipcMain.handle('semantic-search', async (event, { query, candidateSummaries }) => {
    if (!aiService) return { success: false, error: '未配置 AI 服务' }
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

  ipcMain.on('hide-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) win.hide()
  })

  ipcMain.on('show-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) win.show()
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