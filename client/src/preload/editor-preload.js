// Preload for the standalone note editor window.
// Exposes: editorAPI.save(note) -> {ok, error?}, editorAPI.onLoad(cb)
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('editorAPI', {
  save: (note) => ipcRenderer.invoke('editor-save', note),
  onLoad: (cb) => { ipcRenderer.on('editor-load', (_e, note) => cb(note)) }
})