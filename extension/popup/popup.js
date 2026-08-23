const BASE = 'http://127.0.0.1:7421'
const $ = (s) => document.querySelector(s)
const setStatus = (m) => { $('#status').textContent = m }

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } }
  if (body !== undefined) opts.body = JSON.stringify(body)
  const r = await fetch(BASE + path, opts)
  if (!r.ok) throw new Error('http ' + r.status)
  return await r.json()
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab
}

async function ping() {
  try { const r = await fetch(BASE + '/health'); return r.ok } catch (e) { return false }
}

(async () => {
  if (!(await ping())) { setStatus('QuickBrain 未运行'); return }
  setStatus('已连接 QuickBrain')
})()

$('#save-selection').addEventListener('click', async () => {
  try {
    const tab = await activeTab()
    const [{ result: text }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.getSelection().toString() })
    if (!text) { setStatus('没有选中文本'); return }
    setStatus('保存中...')
    const r = await api('POST', '/notes', { type: 'save-selection', payload: { text, title: tab.title, url: tab.url, tabTitle: tab.title } })
    setStatus(r.success ? '已保存 #' + r.id + ' ✓' : '失败: ' + r.error)
  } catch (e) {
    setStatus('失败: ' + e.message)
  }
})

$('#save-page').addEventListener('click', async () => {
  try {
    const tab = await activeTab()
    const [{ result: body }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => document.title + '\n---\n' + document.body.innerText })
    setStatus('保存中...')
    const r = await api('POST', '/notes', { type: 'save-page', payload: { markdown: body, title: tab.title, url: tab.url, tabTitle: tab.title } })
    setStatus(r.success ? '已保存 #' + r.id + ' ✓' : '失败: ' + r.error)
  } catch (e) {
    setStatus('失败: ' + e.message)
  }
})