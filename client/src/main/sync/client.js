async function req({ serverUrl, path, method = 'GET', bearer, body }) {
  const url = serverUrl.replace(/\/$/, '') + path
  const res = await fetch(url, {
    method,
    headers: {
      authorization: 'Bearer ' + bearer,
      'content-type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error('sync-' + method + '-' + res.status + ' ' + t.slice(0, 200))
  }
  return res.json()
}

async function pull({ serverUrl, bearer, since, limit }) {
  return req({ serverUrl, path: '/v1/sync/pull?since=' + (since || 0) + '&limit=' + (limit || 500), bearer })
}

async function push({ serverUrl, bearer, ops }) {
  return req({ serverUrl, path: '/v1/sync/push', method: 'POST', bearer, body: { ops } })
}

async function health({ serverUrl, bearer }) {
  return req({ serverUrl, path: '/v1/sync/health', bearer })
}

module.exports = { pull, push, health, req }