const { contextBridge, ipcRenderer } = require('electron')
function getFilePath(file) { if (file && typeof file.path === 'string') return file.path; return '' }

contextBridge.exposeInMainWorld('quickbrain', {
  // Notes operations
  getAllNotes: () => ipcRenderer.invoke('get-all-notes'),
  searchNotes: (filters) => ipcRenderer.invoke('search-notes', filters),
  addNote: (noteData) => ipcRenderer.invoke('add-note', noteData),
  updateNote: (data) => ipcRenderer.invoke('update-note', data),
  openEditor: (id) => ipcRenderer.invoke('open-editor', id),
  deleteNote: (id) => ipcRenderer.invoke('delete-note', id),

  // Custom window controls (frameless main window: minimize / toggle maximize / hide)
  windowControl: (action) => ipcRenderer.send('window-control', action),
  onWindowState: (cb) => { ipcRenderer.on('window-state', (_e, maximized) => cb(maximized)) },

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

  // Embedding (semantic recall) configuration
  getEmbeddingConfig: () => ipcRenderer.invoke('get-embedding-config'),
  setEmbeddingConfig: (patch) => ipcRenderer.invoke('set-embedding-config', patch),
  getEmbeddingStats: () => ipcRenderer.invoke('get-embedding-stats'),
  debugVecPath: () => ipcRenderer.invoke('debug-vec-path'),
  // Settings (privacy defaults, future per-user prefs)
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (patch) => ipcRenderer.invoke('set-settings', patch),

  // Per-note privacy ops
  setNotePrivate: (id, isPrivate) => ipcRenderer.invoke('set-note-private', { id, isPrivate: !!isPrivate }),
  setNotesPrivateBulk: (ids, isPrivate) => ipcRenderer.invoke('set-notes-private-bulk', { ids, isPrivate: !!isPrivate }),

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

  // Report composer (streaming)
  startReport: (params) => ipcRenderer.invoke('compose-report-start', params),
  cancelReport: (jobId) => ipcRenderer.invoke('compose-report-cancel', jobId),
  onReportMeta: (cb) => { ipcRenderer.on('compose-report-meta', (_e, jobId, meta) => cb(jobId, meta)) },
  onReportChunk: (cb) => { ipcRenderer.on('compose-report-chunk', (_e, jobId, chunk) => cb(jobId, chunk)) },
  onReportLog: (cb) => { ipcRenderer.on('compose-report-log', (_e, jobId, log) => cb(jobId, log)) },
  onReportDone: (cb) => { ipcRenderer.on('compose-report-done', (_e, jobId, info) => cb(jobId, info)) },
  onReportError: (cb) => { ipcRenderer.on('compose-report-error', (_e, jobId, err) => cb(jobId, err)) },

  // Listen for notes-updated event (broadcast when notes change from anywhere)
  onNotesUpdated: (callback) => {
    ipcRenderer.on('notes-updated', (event, detail) => callback(detail))
  },
})