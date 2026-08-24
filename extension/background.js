const DEFAULT_BASE = 'http://127.0.0.1:7421'
const crypto = globalThis.crypto || require('crypto').webcrypto

function uuid() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4-xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

async function loadConfig() {
  return new Promise(resolve => {
    chrome.storage.local.get(['endpointUrl', 'authToken', 'deviceId'], data => {
      resolve({
        endpointUrl: (data.endpointUrl || DEFAULT_BASE).replace(/\/$/, ''),
        authToken: data.authToken || '',
        deviceId: data.deviceId || ''
      })
    })
  })
}

async function ensureDeviceId() {
  const cfg = await loadConfig()
  if (cfg.deviceId) return cfg
  const id = uuid()
  await new Promise(r => chrome.storage.local.set({ deviceId: id }, r))
  return { ...cfg, deviceId: id }
}

// Build HMAC bearer identical to client config.buildBearer / shared/sync/token
async function buildBearer(deviceId, token) {
  if (!deviceId || !token) return ''
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(token), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(deviceId))
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const didB64 = btoa(unescape(encodeURIComponent(deviceId))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return didB64 + '.' + b64
}

async function ping(cfg) {
  try {
    const r = await fetch(cfg.endpointUrl + '/v1/sync/health', { method: 'GET' })
    return r.ok
  } catch (e) { return false }
}

async function sendNote(cfg, note) {
  const headers = { 'Content-Type': 'application/json' }
  if (cfg.authToken) {
    const b = await buildBearer(cfg.deviceId, cfg.authToken)
    if (b) {
      headers['Authorization'] = 'Bearer ' + b
      headers['X-QB-Device'] = cfg.deviceId
    }
  }
  const r = await fetch(cfg.endpointUrl + '/v1/notes', {
    method: 'POST',
    headers,
    body: JSON.stringify(note)
  })
  if (!r.ok) {
    const txt = await r.text().catch(() => '')
    throw new Error('http ' + r.status + ': ' + txt)
  }
  return await r.json()
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'qb-save-selection', title: '保存选中到速脑', contexts: ['selection'] })
  chrome.contextMenus.create({ id: 'qb-save-page',      title: '保存整页到速脑',   contexts: ['page'] })
  ensureDeviceId().catch(() => {})
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    const cfg = await ensureDeviceId()
    if (!(await ping(cfg))) { console.error('[qb] endpoint not reachable:', cfg.endpointUrl); return }
    if (info.menuItemId === 'qb-save-selection') {
      const r = await sendNote(cfg, {
        content: info.selectionText || '',
        title: tab.title || '',
        tags: ['web-page', 'extension', 'selection'],
        source_path: info.pageUrl || '',
        source_type: 'web',
        original_content: info.selectionText || ''
      })
      console.log('[qb] save-selection:', r)
    } else if (info.menuItemId === 'qb-save-page') {
      const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => document.title + '\n---\n' + document.body.innerText })
      const r = await sendNote(cfg, {
        content: result,
        title: tab.title || '',
        tags: ['web-page', 'extension'],
        source_path: info.pageUrl || '',
        source_type: 'web'
      })
      console.log('[qb] save-page:', r)
    }
  } catch (e) {
    console.error('[qb] contextMenus error:', e.message)
  }
})

chrome.commands.onCommand.addListener(async (command) => {
  try {
    const cfg = await ensureDeviceId()
    if (!(await ping(cfg))) { console.error('[qb] endpoint not reachable:', cfg.endpointUrl); return }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab) return
    if (command === 'save-selection') {
      const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.getSelection().toString() })
      if (result) {
        const r = await sendNote(cfg, {
          content: result,
          title: tab.title || '',
          tags: ['web-page', 'extension', 'selection'],
          source_path: tab.url || '',
          source_type: 'web',
          original_content: result
        })
        console.log('[qb] save-selection cmd:', r)
      }
    } else if (command === 'save-page') {
      const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => document.title + '\n---\n' + document.body.innerText })
      const r = await sendNote(cfg, {
        content: result,
        title: tab.title || '',
        tags: ['web-page', 'extension'],
        source_path: tab.url || '',
        source_type: 'web'
      })
      console.log('[qb] save-page cmd:', r)
    }
  } catch (e) {
    console.error('[qb] commands error:', e.message)
  }
})
