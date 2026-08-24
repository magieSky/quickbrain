const DEFAULT_BASE = 'http://127.0.0.1:7421'

const $ = (s) => document.querySelector(s)
const setStatus = (msg, kind) => {
  const el = $('#status')
  el.textContent = msg
  el.className = 'status' + (kind ? ' ' + kind : '')
}

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
        endpointUrl: data.endpointUrl || DEFAULT_BASE,
        authToken: data.authToken || '',
        deviceId: data.deviceId || ''
      })
    })
  })
}

async function saveConfig(cfg) {
  return new Promise(resolve => chrome.storage.local.set(cfg, resolve))
}

async function clearConfig() {
  return new Promise(resolve => chrome.storage.local.clear(resolve))
}

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
    const r = await fetch(cfg.endpointUrl.replace(/\/$/, '') + '/v1/sync/health')
    return r.ok
  } catch (e) { return false }
}

async function sendNote(cfg, note) {
  const headers = { 'Content-Type': 'application/json' }
  if (cfg.authToken && cfg.deviceId) {
    const b = await buildBearer(cfg.deviceId, cfg.authToken)
    if (b) {
      headers['Authorization'] = 'Bearer ' + b
      headers['X-QB-Device'] = cfg.deviceId
    }
  }
  const r = await fetch(cfg.endpointUrl.replace(/\/$/, '') + '/v1/notes', {
    method: 'POST',
    headers,
    body: JSON.stringify(note)
  })
  if (!r.ok) throw new Error('http ' + r.status + ': ' + (await r.text().catch(() => '')))
  return await r.json()
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab
}

// ----- main view -----
async function initMain() {
  let cfg = await loadConfig()
  if (!cfg.deviceId) {
    cfg.deviceId = uuid()
    await saveConfig({ deviceId: cfg.deviceId })
  }
  const reachable = await ping(cfg)
  if (reachable) {
    const mode = cfg.authToken ? '云端' : '本地'
    setStatus('已连接 ' + cfg.endpointUrl + ' · ' + mode, 'ok')
  } else {
    setStatus('未连接: ' + cfg.endpointUrl + '（点击 ⚙ 配置）', 'err')
  }
}

$('#open-settings').addEventListener('click', async () => {
  await renderSettings()
  document.getElementById('view-main').classList.remove('view-active')
  document.getElementById('view-settings').classList.add('view-active')
})

async function renderSettings() {
  const cfg = await loadConfig()
  $('#endpoint-url').value = cfg.endpointUrl || ''
  $('#auth-token').value = cfg.authToken || ''
  $('#device-id').value = cfg.deviceId || ''
  $('#settings-status').textContent = ''
}

$('#back-main').addEventListener('click', () => {
  document.getElementById('view-settings').classList.remove('view-active')
  document.getElementById('view-main').classList.add('view-active')
  initMain()
})

$('#save-config').addEventListener('click', async () => {
  const url = $('#endpoint-url').value.trim()
  const token = $('#auth-token').value.trim()
  let deviceId = $('#device-id').value.trim()
  if (!url) { $('#settings-status').textContent = '后端地址不能为空'; return }
  if (!deviceId) deviceId = uuid()
  await saveConfig({ endpointUrl: url, authToken: token, deviceId })
  $('#settings-status').textContent = '已保存 ✓'
  setTimeout(() => { $('#settings-status').textContent = '' }, 1500)
})

$('#reset-config').addEventListener('click', async () => {
  await clearConfig()
  await renderSettings()
  $('#settings-status').textContent = '已恢复默认'
})

// ----- save actions -----
async function withStatus(msg, fn) {
  const old = $('#status').textContent
  setStatus(msg)
  try {
    const r = await fn()
    setStatus('已保存 ✓ id=' + (r && r.client_id ? r.client_id.slice(0, 8) : 'ok'), 'ok')
  } catch (e) {
    setStatus('失败: ' + e.message, 'err')
  }
}

$('#save-selection').addEventListener('click', async () => {
  await withStatus('保存中…', async () => {
    const tab = await activeTab()
    const [{ result: text }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.getSelection().toString() })
    if (!text) throw new Error('没有选中文本')
    const cfg = await loadConfig()
    return await sendNote(cfg, {
      content: text,
      title: tab.title || '',
      tags: ['web-page', 'extension', 'selection'],
      source_path: tab.url || '',
      source_type: 'web',
      original_content: text
    })
  })
})

$('#save-page').addEventListener('click', async () => {
  await withStatus('保存中…', async () => {
    const tab = await activeTab()
    const [{ result: body }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => document.title + '\n---\n' + document.body.innerText })
    const cfg = await loadConfig()
    return await sendNote(cfg, {
      content: body,
      title: tab.title || '',
      tags: ['web-page', 'extension'],
      source_path: tab.url || '',
      source_type: 'web'
    })
  })
})

initMain()
