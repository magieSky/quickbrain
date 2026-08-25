const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('paletteAPI', {
  // Search and notes
  searchNotes: (query, limit) => ipcRenderer.invoke('search-notes', { search: query, limit }),
  getRecentNotes: (limit) => ipcRenderer.invoke('get-recent-notes', { limit }),
  addNote: (noteData) => ipcRenderer.invoke('add-note', noteData),
  deleteNote: (id) => ipcRenderer.invoke('delete-note', id),
  updateNote: (data) => ipcRenderer.invoke('update-note', data),

  // AI
  formatWithAI: (params) => ipcRenderer.invoke('format-with-ai', params),
  semanticSearch: (params) => ipcRenderer.invoke('semantic-search', params),
  aiExtract: (params) => ipcRenderer.invoke('ai-extract', params),

  getNote: (id) => ipcRenderer.invoke('get-note', id),
  writeClipboard: (text) => ipcRenderer.invoke('write-clipboard', text),
  notify: (params) => ipcRenderer.invoke('notify', params),
  relaunch: () => ipcRenderer.invoke('relaunch'),
  quit: () => ipcRenderer.invoke('quit'),

  // Cross-window navigation
  locateNoteInMain: (id) => ipcRenderer.send('locate-note', id),
  revealInFolder: (filePath) => ipcRenderer.invoke('reveal-in-folder', filePath),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Forward renderer logs to main process log file
  log: (level, args) => ipcRenderer.send('debug-log', { level, args }),

  // Listen for palette reset event
  onPaletteReset: (callback) => {
    ipcRenderer.on('palette-reset', () => callback())
  },
  extractSource: (id, force) => ipcRenderer.invoke('extract-source', { id, force }),
  extractSearch: (keyword, force) => ipcRenderer.invoke('extract-search', { keyword, force }),
})
