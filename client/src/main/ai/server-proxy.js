const cfg = require('../config')

async function req({ serverUrl, bearer, deviceId, path, body }) {
  try {
  const url = (serverUrl || '').replace(/\/$/, '') + path
  const headers = {
    authorization: 'Bearer ' + bearer,
    'x-qb-device': deviceId || '',
    'content-type': 'application/json'
  }
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  const t = await res.text()
  let parsed
  try { parsed = JSON.parse(t) } catch { parsed = t }
  if (!res.ok) {
    const err = (parsed && parsed.error) || ('http-' + res.status)
    const detail = (parsed && (parsed.message || parsed.reason)) ? ': ' + (parsed.message || parsed.reason) : ''
    return { success: false, error: err + detail }
  }
  return parsed
  } catch (e) {
    return { success: false, error: 'proxy-fetch-failed: ' + (e.message || String(e)) }
  }
}

function getProxyContext() {
  const c = cfg.read()
  const sync = c.sync || {}
  const ai = c.ai || {}
  if (ai.mode !== 'server') return null
  if (!sync.enabled || !sync.serverUrl || !sync.token || !sync.deviceId) return null
  return { serverUrl: sync.serverUrl, bearer: cfg.buildBearer(), deviceId: sync.deviceId }
}

async function formatViaServer({ content, style }) {
  const ctx = getProxyContext()
  if (!ctx) return { success: false, error: 'server-mode-disabled' }
  return req({
    serverUrl: ctx.serverUrl,
    bearer: ctx.bearer,
    deviceId: ctx.deviceId,
    path: '/v1/ai/format',
    body: { content, style }
  })
}

async function categorizeViaServer({ content }) {
  const ctx = getProxyContext()
  if (!ctx) return { success: false, error: 'server-mode-disabled' }
  return req({
    serverUrl: ctx.serverUrl,
    bearer: ctx.bearer,
    deviceId: ctx.deviceId,
    path: '/v1/ai/categorize',
    body: { content }
  })
}

async function semanticSearchViaServer({ query, candidateSummaries }) {
  const ctx = getProxyContext()
  if (!ctx) return { success: false, error: 'server-mode-disabled' }
  return req({
    serverUrl: ctx.serverUrl,
    bearer: ctx.bearer,
    deviceId: ctx.deviceId,
    path: '/v1/ai/semantic-search',
    body: { query, candidateSummaries }
  })
}

module.exports = { formatViaServer, categorizeViaServer, semanticSearchViaServer, getProxyContext }