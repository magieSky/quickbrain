const fs = require('fs')
const { Tray, Menu, Notification, nativeImage } = require('electron')
const path = require('path')

function createTray({ onShowPalette, onShowMain, onSettings, onQuit }) {
  // Try .ico first (multi-size for Windows tray), fallback to PNG
  const candidates = [
    path.join(__dirname, '..', 'assets', 'icon.ico'),
    path.join(__dirname, '..', 'assets', 'icon.png')
  ]
  let tray = null
  let chosenIcon = null
  for (const iconPath of candidates) {
    if (!fs.existsSync(iconPath)) continue
    const img = nativeImage.createFromPath(iconPath)
    if (img.isEmpty()) { console.log('[tray] empty image:', iconPath); continue }
    try {
      tray = new Tray(img)
      chosenIcon = iconPath
      console.log('[tray] loaded icon:', iconPath, 'w=' + img.getSize().width, 'h=' + img.getSize().height)
      break
    } catch (err) {
      console.log('[tray] failed to load:', iconPath, err.message)
    }
  }
  if (!tray) {
    console.error('[tray] no working icon, using empty fallback')
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
