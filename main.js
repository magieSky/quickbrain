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
const { initDatabase, closeDatabase, getDB } = require('./main/db-init')
const { registerIpcHandlers, setAIService } = require('./main/ipc')
const { registerShortcuts, unregisterAll } = require('./main/shortcuts')
const { createTray, notify } = require('./main/tray')
const {
  createPaletteWindow, createMainWindow,
  showPalette, hidePalette, togglePalette,
  toggleMainWindow, showMainWindow, getMainWindow
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
    onAddNote: showAddDialog
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
