const BASE = 'http://127.0.0.1:7421'

async function ping() {
  try {
    const r = await fetch(BASE + '/health', { method: 'GET' })
    return r.ok
  } catch (e) { return false }
}

async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  }
  if (body !== undefined) opts.body = JSON.stringify(body)
  const r = await fetch(BASE + path, opts)
  if (!r.ok) throw new Error('http ' + r.status)
  return await r.json()
}

const send = (msg) => api('POST', '/notes', msg)

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'qb-save-selection', title: '保存选中到 QuickBrain', contexts: ['selection'] })
  chrome.contextMenus.create({ id: 'qb-save-page',      title: '保存整页到 QuickBrain',   contexts: ['page'] })
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    if (!(await ping())) { console.error('[qb] QuickBrain 未运行 (http-server 不可达)'); return }
    if (info.menuItemId === 'qb-save-selection') {
      const r = await send({ type: 'save-selection', payload: { text: info.selectionText, title: tab.title, url: info.pageUrl, tabTitle: tab.title } })
      console.log('[qb] save-selection:', r)
    } else if (info.menuItemId === 'qb-save-page') {
      const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => document.title + '\n---\n' + document.body.innerText })
      const r = await send({ type: 'save-page', payload: { markdown: result, title: tab.title, url: info.pageUrl, tabTitle: tab.title } })
      console.log('[qb] save-page:', r)
    }
  } catch (e) {
    console.error('[qb] contextMenus error:', e.message)
  }
})

chrome.commands.onCommand.addListener(async (command) => {
  try {
    if (!(await ping())) { console.error('[qb] QuickBrain 未运行 (http-server 不可达)'); return }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab) return
    if (command === 'save-selection') {
      const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.getSelection().toString() })
      if (result) {
        const r = await send({ type: 'save-selection', payload: { text: result, title: tab.title, url: tab.url, tabTitle: tab.title } })
        console.log('[qb] save-selection cmd:', r)
      }
    } else if (command === 'save-page') {
      const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => document.title + '\n---\n' + document.body.innerText })
      const r = await send({ type: 'save-page', payload: { markdown: result, title: tab.title, url: tab.url, tabTitle: tab.title } })
      console.log('[qb] save-page cmd:', r)
    }
  } catch (e) {
    console.error('[qb] commands error:', e.message)
  }
})