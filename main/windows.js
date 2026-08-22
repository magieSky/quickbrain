const { BrowserWindow, screen } = require('electron')
const path = require('path')

let paletteWindow = null
let mainWindow = null

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

function createPaletteWindow(preloadPath) {
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
      preload: path.join(preloadPath, 'palette-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    }
  })

  paletteWindow.loadFile(path.join(__dirname, '..', 'renderer', 'palette', 'index.html'))
  paletteWindow.on('blur', () => {
    if (paletteWindow && paletteWindow.isVisible()) {
      paletteWindow.hide()
    }
  })

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

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'main', 'index.html'))
  mainWindow.on('closed', () => { mainWindow = null })

  return mainWindow
}

function showPalette() {
  if (!paletteWindow || paletteWindow.isDestroyed()) return
  if (!paletteWindow.isVisible()) {
    const pos = getPalettePosition()
    paletteWindow.setBounds(pos)
  }
  paletteWindow.show()
  paletteWindow.focus()
  paletteWindow.webContents.send('palette-reset')
}

function hidePalette() {
  if (paletteWindow && !paletteWindow.isDestroyed() && paletteWindow.isVisible()) {
    paletteWindow.hide()
  }
}

function togglePalette() {
  if (paletteWindow && paletteWindow.isVisible()) hidePalette()
  else showPalette()
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
  mainWindow.webContents.send('locate-note', id)
}

function getMainWindow() { return mainWindow }
function getPaletteWindow() { return paletteWindow }

module.exports = {
  createPaletteWindow, createMainWindow,
  showPalette, hidePalette, togglePalette,
  toggleMainWindow, showMainWindow, locateNoteInMain,
  getMainWindow, getPaletteWindow
}
