const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('quickbrain', {
  // Notes operations
  getAllNotes: () => ipcRenderer.invoke('get-all-notes'),
  searchNotes: (filters) => ipcRenderer.invoke('search-notes', filters),
  addNote: (noteData) => ipcRenderer.invoke('add-note', noteData),
  updateNote: (data) => ipcRenderer.invoke('update-note', data),
  deleteNote: (id) => ipcRenderer.invoke('delete-note', id),

  // Document import
  importDocument: (filePath) => ipcRenderer.invoke('import-document', filePath),
  revealInFolder: (filePath) => ipcRenderer.invoke('reveal-in-folder', filePath),
  getPathForFile: (file) => webUtils.getPathForFile(file),

  // AI operations
  formatWithAI: (params) => ipcRenderer.invoke('format-with-ai', params),
  categorizeWithAI: (params) => ipcRenderer.invoke('categorize-with-ai', params),

  // AI config
  getProviders: () => ipcRenderer.invoke('get-ai-providers'),
  getAIConfig: () => ipcRenderer.invoke('get-ai-config'),
  saveAIConfig: (cfg) => ipcRenderer.invoke('save-ai-config', cfg),
  testAIConnection: (cfg) => ipcRenderer.invoke('test-ai-connection', cfg),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Forward renderer logs to main process log file
  log: (level, args) => ipcRenderer.send('debug-log', { level, args }),

  // Window controls
  hideWindow: () => ipcRenderer.send('hide-window'),
  notify: (params) => ipcRenderer.invoke('notify', params),
  showWindow: () => ipcRenderer.send('show-window'),

  // Listen for locate-note event
  onLocateNote: (callback) => {
    ipcRenderer.on('locate-note', (event, id) => callback(id))
  },

  // Listen for show-add-dialog event (triggered by Ctrl+A)
  onShowAddDialog: (callback) => {
    ipcRenderer.on('show-add-dialog', () => callback())
  }
})