const { app, BrowserWindow, ipcMain, globalShortcut, tray, Menu, dialog, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');
const AIService = require('./ai-service');

let mainWindow;
let db;
let aiService;

async function initDatabase() {
  const SQL = await initSqlJs();
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'quickbrain.db');
  
  let initialData = null;
  if (fs.existsSync(dbPath)) {
    initialData = new Uint8Array(fs.readFileSync(dbPath));
  }
  
  db = new SQL.Database(initialData);
  
  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      title TEXT DEFAULT '',
      category TEXT DEFAULT 'uncategorized',
      tags TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_formatted INTEGER DEFAULT 0
    );
    
    CREATE INDEX IF NOT EXISTS idx_notes_content ON notes(content);
    CREATE INDEX IF NOT EXISTS idx_notes_category ON notes(category);
    CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at);
  `);
  
  saveDatabase();
  return db;
}

function saveDatabase() {
  if (!db) return;
  const data = db.export();
  const userDataPath = app.getPath('userData');
  fs.writeFileSync(path.join(userDataPath, 'quickbrain.db'), Buffer.from(data));
}

function loadAIConfig() {
  const configPath = path.join(app.getPath('userData'), 'config.json');
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      aiService = new AIService(config);
      return true;
    } catch (e) {
      console.error('Failed to load AI config:', e);
    }
  }
  return false;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 700,
    minWidth: 400,
    minHeight: 500,
    frame: false,
    transparent: true,
    hasShadow: true,
    alwaysOnTop: false,
    skipTaskbar: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'preload', 'main-preload.js')
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  trayIcon = new tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    { label: '显示窗口 (Ctrl+Q)', click: () => mainWindow.show(), accelerator: 'CommandOrControl+Q' },
    { label: '快速添加 (Ctrl+A)', click: () => showAddDialogFromTray(), accelerator: 'CommandOrControl+A' },
    { type: 'separator' },
    { label: '设置', click: () => openSettings() },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ]);
  trayIcon.setToolTip('QuickBrain - 个人知识助手\n快捷键: Ctrl+Q 显示/隐藏');
  trayIcon.setContextMenu(contextMenu);
}

function showAddDialogFromTray() {
  if (!mainWindow.isVisible()) mainWindow.show();
  setTimeout(() => mainWindow.webContents.send('show-add-dialog'), 300);
}

function openSettings() {
  dialog.showOpenDialog(mainWindow, {
    title: '选择配置文件',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  }).then(result => {
    if (!result.canceled && result.filePaths.length > 0) {
      const config = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
      aiService = new AIService(config);
      fs.writeFileSync(path.join(app.getPath('userData'), 'config.json'), JSON.stringify(config, null, 2));
      new Notification({ title: 'QuickBrain', body: 'AI配置已加载成功' }).show();
    }
  });
}

// ---- IPC Handlers ----
ipcMain.handle('get-notes', async (event, filters = {}) => {
  let sql = 'SELECT * FROM notes WHERE 1=1';
  const params = [];
  if (filters.search) {
    sql += ' AND (content LIKE ? OR title LIKE ? OR tags LIKE ?)';
    const s = `%${filters.search}%`;
    params.push(s, s, s);
  }
  if (filters.category && filters.category !== 'all') {
    sql += ' AND category = ?';
    params.push(filters.category);
  }
  sql += ' ORDER BY created_at DESC';
  const rows = db.exec(sql, params);
  if (rows.length === 0) return [];
  const cols = rows[0].columns;
  return rows[0].values.map(row => {
    const obj = {};
    cols.forEach((col, i) => obj[col] = row[i]);
    // Parse JSON fields
    if (obj.tags) { try { obj.tags = JSON.parse(obj.tags); } catch(e) {} }
    return obj;
  });
});

ipcMain.handle('add-note', async (event, noteData) => {
  const { content, title, category, tags } = noteData;
  db.run(
    'INSERT INTO notes (content, title, category, tags) VALUES (?, ?, ?, ?)',
    [content, title || '', category || 'uncategorized', JSON.stringify(tags || [])]
  );
  saveDatabase();
  const id = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
  return { id, ...noteData };
});

ipcMain.handle('update-note', async (event, { id, ...updates }) => {
  const keys = Object.keys(updates);
  if (keys.length === 0) return;
  const setClause = keys.map(k => `${k} = ?`).join(', ');
  db.run(`UPDATE notes SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [...Object.values(updates), id]);
  saveDatabase();
});

ipcMain.handle('delete-note', async (event, id) => {
  db.run('DELETE FROM notes WHERE id = ?', [id]);
  saveDatabase();
  return true;
});

ipcMain.handle('format-with-ai', async (event, { content, style }) => {
  if (!aiService) {
    return { success: false, error: '未配置AI服务，请右键托盘图标选择"设置"加载配置' };
  }
  try {
    return await aiService.formatContent(content, style);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('categorize-with-ai', async (event, { content }) => {
  if (!aiService) return { success: false, error: '未配置AI服务' };
  try {
    return await aiService.categorizeContent(content);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

const registerShortcut = () => {
  globalShortcut.register('CommandOrControl+Q', () => {
    if (mainWindow.isVisible()) mainWindow.hide();
    else { mainWindow.show(); mainWindow.focus(); }
  });
  globalShortcut.register('CommandOrControl+A', () => showAddDialogFromTray());
};

app.whenReady().then(async () => {
  await initDatabase();
  loadAIConfig();
  createWindow();
  createTray();
  registerShortcut();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (db) { saveDatabase(); db.close && db.close(); }
});

module.exports = { getDB: () => db };
