const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('quickbrain', {
  // Notes operations
  getAllNotes: () => ipcRenderer.invoke('get-all-notes'),
  searchNotes: (filters) => ipcRenderer.invoke('search-notes', filters),
  addNote: (noteData) => ipcRenderer.invoke('add-note', noteData),
  updateNote: (data) => ipcRenderer.invoke('update-note', data),
  deleteNote: (id) => ipcRenderer.invoke('delete-note', id),

  // AI operations
  formatWithAI: (params) => ipcRenderer.invoke('format-with-ai', params),
  categorizeWithAI: (params) => ipcRenderer.invoke('categorize-with-ai', params),

  // Window controls
  hideWindow: () => ipcRenderer.send('hide-window'),
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
