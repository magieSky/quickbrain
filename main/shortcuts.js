const { globalShortcut } = require('electron')

function registerShortcuts({ onPalette, onMainWindow, onAddNote }) {
  const unregister = []

  const palette = globalShortcut.register('Alt+K', () => onPalette && onPalette())
  if (palette) unregister.push('Alt+K')

  const main = globalShortcut.register('CommandOrControl+Q', () => onMainWindow && onMainWindow())
  if (main) unregister.push('CommandOrControl+Q')

  const add = globalShortcut.register('CommandOrControl+A', () => onAddNote && onAddNote())
  if (add) unregister.push('CommandOrControl+A')

  return unregister
}

function unregisterAll() {
  globalShortcut.unregisterAll()
}

module.exports = { registerShortcuts, unregisterAll }