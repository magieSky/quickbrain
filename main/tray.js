const { Tray, Menu, Notification, nativeImage } = require('electron')
const path = require('path')

function createTray({ onShowPalette, onShowMain, onSettings, onQuit }) {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png')
  let tray

  try {
    tray = new Tray(iconPath)
  } catch (err) {
    console.error('[tray] icon not found at', iconPath, '- using empty icon as fallback')
    tray = new Tray(nativeImage.createEmpty())
  }

  const contextMenu = Menu.buildFromTemplate([
    { label: '命令面板 (Alt+K)', click: () => onShowPalette && onShowPalette() },
    { label: '主窗口 (Ctrl+Q)', click: () => onShowMain && onShowMain() },
    { type: 'separator' },
    { label: '设置', click: () => onSettings && onSettings() },
    { type: 'separator' },
    { label: '退出', click: () => onQuit && onQuit() }
  ])

  tray.setToolTip('QuickBrain - 个人知识助手\n快捷键: Alt+K 命令面板 | Ctrl+Q 主窗口')
  tray.setContextMenu(contextMenu)
  tray.on('click', () => onShowPalette && onShowPalette())

  return tray
}

function notify(title, body) {
  new Notification({ title, body }).show()
}

module.exports = { createTray, notify }
