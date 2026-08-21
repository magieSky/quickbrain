const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('quickbrain', {
  // Notes operations
  getNotes: (filters) => ipcRenderer.invoke('get-notes', filters),
  addNote: (noteData) => ipcRenderer.invoke('add-note', noteData),
  updateNote: (data) => ipcRenderer.invoke('update-note', data),
  deleteNote: (id) => ipcRenderer.invoke('delete-note', id),
  
  // AI operations
  formatWithAI: (params) => ipcRenderer.invoke('format-with-ai', params),
  
  // Window controls
  hideWindow: () => ipcRenderer.send('hide-window'),
  showWindow: () => ipcRenderer.send('show-window'),
  
  // Settings
  onOpenSettings: (callback) => {
    ipcRenderer.on('open-settings', callback);
  }
});
