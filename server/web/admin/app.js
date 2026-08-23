const els = {
  ownerToken: document.getElementById('owner-token'),
  serverUrl: document.getElementById('server-url'),
  connectBtn: document.getElementById('connect-btn'),
  refreshBtn: document.getElementById('refresh-btn'),
  loginError: document.getElementById('login-error'),
  loginSection: document.getElementById('login-section'),
  statusSection: document.getElementById('status-section'),
  statusText: document.getElementById('status-text'),
  statusJson: document.getElementById('status-json'),
  aiSection: document.getElementById('ai-section'),
  aiConfigured: document.getElementById('ai-configured'),
  aiProvider: document.getElementById('ai-provider'),
  aiApiKey: document.getElementById('ai-api-key'),
  aiModel: document.getElementById('ai-model'),
  aiBaseUrl: document.getElementById('ai-base-url'),
  aiSaveBtn: document.getElementById('ai-save-btn'),
  aiClearBtn: document.getElementById('ai-clear-btn'),
  aiSaveStatus: document.getElementById('ai-save-status'),
  devicesSection: document.getElementById('devices-section'),
  devicesTbody: document.querySelector('#devices-table tbody')
}

function authHeaders() { return { authorization: 'Bearer ' + (els.ownerToken.value || '').trim(), 'content-type': 'application/json' } }

function api(path, opts = {}) {
  const base = (els.serverUrl.value || '').trim().replace(/\/$/, '')
  return fetch(base + path, Object.assign({ headers: authHeaders() }, opts))
    .then(async r => {
      const t = await r.text()
      let body
      try { body = JSON.parse(t) } catch { body = t }
      if (!r.ok) throw new Error(body && body.error ? body.error : ('HTTP ' + r.status))
      return body
    })
}

async function refreshStatus() {
  try {
    const s = await api('/v1/admin/status')
    els.statusJson.textContent = JSON.stringify(s, null, 2)
    els.statusText.textContent = 'Connected'
  } catch (e) {
    els.statusText.textContent = 'Error: ' + e.message
    return
  }
  try {
    const d = await api('/v1/admin/devices')
    renderDevices(d.devices || d || [])
  } catch (e) {
    els.devicesTbody.innerHTML = '<tr><td colspan="6" class="error">' + e.message + '</td></tr>'
  }
  try {
    const c = await api('/v1/admin/ai-config')
    els.aiConfigured.textContent = c.configured ? 'AI configured (provider=' + (c.config.provider || '?') + ', model=' + (c.config.model || '?') + ')' : 'AI not configured'
    if (c.config) {
      if (c.config.provider) els.aiProvider.value = c.config.provider
      if (c.config.model) els.aiModel.value = c.config.model
      if (c.config.baseURL) els.aiBaseUrl.value = c.config.baseURL
    }
  } catch (e) {
    els.aiConfigured.textContent = 'Error: ' + e.message
  }
}

function renderDevices(rows) {
  if (!rows.length) { els.devicesTbody.innerHTML = '<tr><td colspan="6">No devices yet.</td></tr>'; return }
  els.devicesTbody.innerHTML = rows.map(d => (
    '<tr><td>' + (d.device_id || '').slice(0, 8) + '</td>' +
    '<td>' + (d.name || '') + '</td>' +
    '<td>' + (d.platform || '') + '</td>' +
    '<td>' + (d.last_seen_at ? new Date(d.last_seen_at).toLocaleString() : '') + '</td>' +
    '<td>' + (d.revoked ? 'revoked' : 'active') + '</td>' +
    '<td>' + (d.revoked ? '' : '<button data-id="' + d.device_id + '" class="revoke danger">Revoke</button>') + '</td></tr>'
  )).join('')
  for (const b of document.querySelectorAll('.revoke')) {
    b.onclick = async () => {
      if (!confirm('Revoke this device?')) return
      try { await api('/v1/admin/devices/' + b.dataset.id + '/revoke', { method: 'POST' }); refreshStatus() }
      catch (e) { alert('Revoke failed: ' + e.message) }
    }
  }
}

els.connectBtn.onclick = async () => {
  els.loginError.textContent = ''
  try {
    await refreshStatus()
    els.loginSection.classList.add('hidden')
    els.statusSection.classList.remove('hidden')
    els.aiSection.classList.remove('hidden')
    els.devicesSection.classList.remove('hidden')
  } catch (e) {
    els.loginError.textContent = e.message
  }
}

els.refreshBtn.onclick = refreshStatus

els.aiSaveBtn.onclick = async () => {
  els.aiSaveStatus.textContent = ''
  const body = {
    provider: els.aiProvider.value,
    apiKey: els.aiApiKey.value,
    model: els.aiModel.value,
    baseURL: els.aiBaseUrl.value
  }
  try {
    await api('/v1/admin/ai-config', { method: 'POST', body: JSON.stringify(body) })
    els.aiSaveStatus.textContent = 'Saved.'
    els.aiApiKey.value = ''
    refreshStatus()
  } catch (e) {
    els.aiSaveStatus.textContent = 'Error: ' + e.message
  }
}

els.aiClearBtn.onclick = async () => {
  if (!confirm('Clear AI config?')) return
  try { await api('/v1/admin/ai-config', { method: 'DELETE' }); els.aiSaveStatus.textContent = 'Cleared.'; refreshStatus() }
  catch (e) { els.aiSaveStatus.textContent = 'Error: ' + e.message }
}