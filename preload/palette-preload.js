const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('paletteAPI', {
  // Search and notes
  searchNotes: (query) => ipcRenderer.invoke('search-notes', { search: query }),
  addNote: (noteData) => ipcRenderer.invoke('add-note', noteData),
  deleteNote: (id) => ipcRenderer.invoke('delete-note', id),
  updateNote: (data) => ipcRenderer.invoke('update-note', data),

  // AI
  formatWithAI: (params) => ipcRenderer.invoke('format-with-ai', params),
  semanticSearch: (params) => ipcRenderer.invoke('semantic-search', params),

  // Cross-window navigation
  locateNoteInMain: (id) => ipcRenderer.send('locate-note', id),

  // Listen for palette reset event
  onPaletteReset: (callback) => {
    ipcRenderer.on('palette-reset', () => callback())
  }
})
