const { contextBridge, ipcRenderer } = require('electron')
function getFilePath(file) { if (file && typeof file.path === 'string') return file.path; return '' }

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
  getPathForFile: (file) => getFilePath(file),

  // Auto-launch
  getAutoLaunch: () => ipcRenderer.invoke('get-auto-launch'),
  setAutoLaunch: (enabled) => ipcRenderer.invoke('set-auto-launch', !!enabled),

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

  // Sync operations
  getSyncConfig: () => ipcRenderer.invoke('get-sync-config'),
  getDefaultSyncServerUrl: () => ipcRenderer.invoke('get-default-sync-server-url'),
  setSyncConfig: (payload) => ipcRenderer.invoke('set-sync-config', payload),
  syncStatus: () => ipcRenderer.invoke('sync-status'),
  pushLocal: () => ipcRenderer.invoke('push-local'),
  pushAll: () => ipcRenderer.invoke('push-all'),
  pullNow: () => ipcRenderer.invoke('pull-now'),
  registerWithServer: (payload) => ipcRenderer.invoke('register-with-server', payload),
  signInWithToken: (payload) => ipcRenderer.invoke('sign-in-with-token', payload),

  // Window controls
  hideWindow: () => ipcRenderer.send('hide-window'),
  notify: (params) => ipcRenderer.invoke('notify', params),
  showWindow: () => ipcRenderer.send('show-window'),

  // Listen for locate-note event
  openAISettingsInMain: () => ipcRenderer.send('open-ai-settings'),
  onLocateNote: (callback) => {
    ipcRenderer.on('locate-note', (event, id) => callback(id))
  },
  onOpenAISettings: (callback) => {
    ipcRenderer.on('open-ai-settings', () => callback())
  },

  // Listen for show-add-dialog event (triggered by Ctrl+A)
  onShowAddDialog: (callback) => {
    ipcRenderer.on('show-add-dialog', () => callback())
  },

  // Listen for notes-updated event (broadcast when notes change from anywhere)
  onNotesUpdated: (callback) => {
    ipcRenderer.on('notes-updated', (event, detail) => callback(detail))
  },
})