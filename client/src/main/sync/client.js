async function req({ serverUrl, path, method = 'GET', bearer, deviceId, body }) {
  const url = serverUrl.replace(/\/$/, '') + path
  const headers = {
    authorization: 'Bearer ' + bearer,
    'content-type': 'application/json'
  }
  if (deviceId) headers['x-qb-device'] = deviceId
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error('sync-' + method + '-' + res.status + ' ' + t.slice(0, 200))
  }
  return res.json()
}

async function pull({ serverUrl, bearer, deviceId, since, limit }) {
  return req({ serverUrl, path: '/v1/sync/pull?since=' + (since || 0) + '&limit=' + (limit || 500), bearer, deviceId })
}

async function push({ serverUrl, bearer, deviceId, ops }) {
  return req({ serverUrl, path: '/v1/sync/push', method: 'POST', bearer, deviceId, body: { ops } })
}

async function health({ serverUrl, bearer, deviceId }) {
  return req({ serverUrl, path: '/v1/sync/health', bearer, deviceId })
}

module.exports = { pull, push, health, req }