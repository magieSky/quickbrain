const { app, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const { initDatabase, closeDatabase, getDB } = require('./main/db-init')
const { registerIpcHandlers, setAIService } = require('./main/ipc')
const { registerShortcuts, unregisterAll } = require('./main/shortcuts')
const { createTray, notify } = require('./main/tray')
const {
  createPaletteWindow, createMainWindow,
  showPalette, hidePalette, togglePalette,
  toggleMainWindow, showMainWindow
} = require('./main/windows')

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

app.whenReady().then(async () => {
  await initDatabase()

  // AIService 是 ESM 模块（CJS 不能 require .mjs）
  const { AIService } = await import('./main/ai/service.mjs')
  const aiService = loadAIConfig(AIService)
  if (aiService) setAIService(aiService)

  registerIpcHandlers()

  createPaletteWindow(path.join(__dirname, 'preload'))
  createMainWindow(path.join(__dirname, 'preload'))

  createTray({
    onShowPalette: showPalette,
    onShowMain: toggleMainWindow,
    onSettings: () => openAISettings(AIService),
    onQuit: () => app.quit()
  })

  registerShortcuts({
    onPalette: togglePalette,
    onMainWindow: toggleMainWindow,
    onAddNote: () => showPalette()
  })

  app.on('activate', () => {
    if (!mainWindowExists()) createMainWindow(path.join(__dirname, 'preload'))
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
