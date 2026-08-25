const { BrowserWindow, screen } = require('electron')
const path = require('path')

let paletteWindow = null
let mainWindow = null
let preloadPathCache = null
let suppressBlurHide = false  // showPalette 期间临时屏蔽 blur 触发�?hide

function getPalettePosition() {
  const display = screen.getPrimaryDisplay()
  const { width, height } = display.workAreaSize
  const winWidth = 400
  const winHeight = 500
  return {
    x: Math.round((width - winWidth) / 2),
    y: Math.round(height / 6),
    width: winWidth,
    height: winHeight
  }
}

function attachBlurHandler() {
  if (!paletteWindow || paletteWindow.isDestroyed()) return
  paletteWindow.on('blur', () => {
    console.log('[palette blur] event, suppress=' + suppressBlurHide + ' visible=' + (paletteWindow && !paletteWindow.isDestroyed() ? paletteWindow.isVisible() : 'N/A'))
    if (suppressBlurHide) return
    if (paletteWindow && paletteWindow.isVisible()) {
      paletteWindow.hide()
      console.log('[palette blur] hidden')
    }
  })
}

function createPaletteWindow(preloadPath) {
  if (preloadPath) preloadPathCache = preloadPath
  if (paletteWindow && !paletteWindow.isDestroyed()) return paletteWindow

  const pos = getPalettePosition()
  paletteWindow = new BrowserWindow({
    ...pos,
    frame: false,
    transparent: true,
    hasShadow: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(preloadPathCache, 'palette-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    }
  })

  console.log('[windows] createPaletteWindow: loading index.html, id=' + paletteWindow.id)
  paletteWindow.webContents.on('did-finish-load', () => console.log('[windows] palette did-finish-load'))
  paletteWindow.webContents.on('preload-error', (e, p, err) => console.log('[windows] palette preload-error:', p, err.message))
  paletteWindow.webContents.on('console-message', (e, level, msg) => console.log('[windows] palette console:', level, msg))
  paletteWindow.webContents.on('render-process-gone', (e, d) => console.log('[windows] palette render-process-gone:', JSON.stringify(d)))
  paletteWindow.on('closed', () => {
    console.log('[windows] palette closed')
    paletteWindow = null
  })
  paletteWindow.loadFile(path.join(__dirname, '..', 'renderer', 'palette', 'index.html'))
  attachBlurHandler()

  return paletteWindow
}


function getMainPosition() {
  const display = screen.getPrimaryDisplay()
  const { width, height } = display.workAreaSize
  const winWidth = 480
  const winHeight = Math.min(700, height - 80)
  return {
    x: width - winWidth - 20,
    y: 40,
    width: winWidth,
    height: winHeight
  }
}

function createMainWindow(preloadPath) {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow

  const pos = getMainPosition()
  mainWindow = new BrowserWindow({
    ...pos,
    minWidth: 400,
    minHeight: 500,
    frame: false,
    transparent: true,
    hasShadow: true,
    alwaysOnTop: false,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(preloadPath, 'main-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    }
  })

  console.log('[windows] createMainWindow: loading index.html, pos=' + JSON.stringify(pos))
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'main', 'index.html'))
  mainWindow.webContents.on('did-finish-load', () => console.log('[windows] main did-finish-load, visible=' + mainWindow.isVisible() + ' bounds=' + JSON.stringify(mainWindow.getBounds())))
  mainWindow.webContents.on('did-fail-load', (e, code, desc) => console.log('[windows] main did-fail-load code=' + code + ' desc=' + desc))
  mainWindow.webContents.on('console-message', (e, level, msg) => console.log('[windows] main console: ' + level + ' ' + msg))
  mainWindow.webContents.on('preload-error', (e, p, err) => console.log('[windows] main preload-error path=' + p + ' err=' + err.message))
  mainWindow.webContents.on('render-process-gone', (e, d) => console.log('[windows] main render-process-gone reason=' + d.reason))
  mainWindow.on('show', () => console.log('[windows] main show'))
  mainWindow.on('hide', () => console.log('[windows] main hide'))
  mainWindow.on('closed', () => { console.log('[windows] main closed'); mainWindow = null })
  mainWindow.on('maximize', () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('window-state', true) })
  mainWindow.on('unmaximize', () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('window-state', false) })

  return mainWindow
}

function showPalette() {
  console.log('[showPalette] called, t=' + Date.now())
  if (!paletteWindow || paletteWindow.isDestroyed()) {
    console.log('[showPalette] window missing, recreating')
    if (!preloadPathCache) {
      console.log('[showPalette] ABORT: no preload path cached')
      return
    }
    createPaletteWindow(preloadPathCache)
  }

  suppressBlurHide = true
  console.log('[showPalette] suppressBlurHide=true')

  try {
    if (!paletteWindow.isVisible()) {
      const pos = getPalettePosition()
      console.log('[showPalette] setBounds to', JSON.stringify(pos))
      paletteWindow.setBounds(pos)
    } else {
      console.log('[showPalette] already visible, skipping setBounds')
    }
    paletteWindow.show()
    console.log('[showPalette] show() called, isVisible=' + paletteWindow.isVisible())
    paletteWindow.focus()
    console.log('[showPalette] focus() called, isFocused=' + paletteWindow.isFocused())
    paletteWindow.webContents.send('palette-reset')
    console.log('[showPalette] sent palette-reset')
  } catch (e) {
    console.log('[showPalette] ERROR:', e && e.message)
  }

  setTimeout(() => {
    suppressBlurHide = false
    console.log('[showPalette] suppressBlurHide=false (released)')
  }, 400)
}

function hidePalette() {
  console.log('[hidePalette] called, t=' + Date.now() + ' visible=' + (paletteWindow && !paletteWindow.isDestroyed() ? paletteWindow.isVisible() : 'N/A'))
  if (paletteWindow && !paletteWindow.isDestroyed() && paletteWindow.isVisible()) {
    paletteWindow.hide()
    console.log('[hidePalette] hidden')
  } else {
    console.log('[hidePalette] noop')
  }
}

function togglePalette() {
  console.log('[togglePalette] start, t=' + Date.now() + ' exists=' + !!paletteWindow + ' destroyed=' + (paletteWindow && paletteWindow.isDestroyed()) + ' visible=' + (paletteWindow && !paletteWindow.isDestroyed() ? paletteWindow.isVisible() : 'N/A'))
  if (!paletteWindow || paletteWindow.isDestroyed()) {
    console.log('[togglePalette] (re)creating window')
    if (!preloadPathCache) {
      console.log('[togglePalette] ABORT: no preload path')
      return
    }
    createPaletteWindow(preloadPathCache)
    showPalette()
    return
  }
  if (paletteWindow.isVisible()) {
    console.log('[togglePalette] hiding')
    hidePalette()
  } else {
    console.log('[togglePalette] showing')
    showPalette()
  }
}

function toggleMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isVisible()) mainWindow.hide()
  else { mainWindow.show(); mainWindow.focus() }
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.show()
  mainWindow.focus()
}

function locateNoteInMain(id) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  showMainWindow()
  mainWindow.webContents.send('locate-note', { id, range: null })
}

function getMainWindow() { return mainWindow }

// Track open editor windows so the same note opens in one window at a time.
const editorWindows = new Map() // noteId -> BrowserWindow

function createNoteEditorWindow(note, preloadPath) {
  if (!note || note.id == null) return null
  if (preloadPath) preloadPathCache = preloadPath
  const existing = editorWindows.get(note.id)
  if (existing && !existing.isDestroyed()) { existing.focus(); return existing }
  const editor = new BrowserWindow({
    width: 880,
    height: 640,
    minWidth: 480,
    minHeight: 320,
    backgroundColor: '#0e1118',
    title: (note.title ? '速脑 ·  ' + note.title : '速脑 · 笔记编辑'),
    show: false,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'editor-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    }
  })
  editor.loadFile(path.join(__dirname, '..', 'renderer', 'editor', 'index.html'))
  editorWindows.set(note.id, editor)
  editor.once('ready-to-show', function () { editor.show() })
  editor.webContents.on('did-finish-load', function () {
    editor.webContents.send('editor-load', {
      id: note.id,
      title: note.title || '',
      content: note.content || '',
      is_private: !!note.is_private
    })
    console.log('[editor] loaded note #' + note.id)
  })
  editor.on('closed', function () { editorWindows.delete(note.id); console.log('[editor] window closed for #' + note.id) })
  editor.on('maximize', function () { if (!editor.isDestroyed()) editor.webContents.send('window-state', true) })
  editor.on('unmaximize', function () { if (!editor.isDestroyed()) editor.webContents.send('window-state', false) })
  return editor
}
function getPaletteWindow() { return paletteWindow }

module.exports = {
  createPaletteWindow, createMainWindow, createNoteEditorWindow,
  showPalette, hidePalette, togglePalette,
  toggleMainWindow, showMainWindow, locateNoteInMain,
  getMainWindow, getPaletteWindow
}
