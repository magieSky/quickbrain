import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import client from '../client/src/main/sync/client.js'

let fakeFetch
beforeEach(() => {
  fakeFetch = async () => ({ status: 200, json: async () => ({}) })
  globalThis.fetch = fakeFetch
})
afterEach(() => {
  delete globalThis.fetch
})

describe('client sync http client', () => {
  it('push POSTs to /v1/sync/push with bearer', async () => {
    let captured
    globalThis.fetch = async (url, init) => { captured = { url, init }; return { status: 200, ok: true, json: async () => ({ accepted: 1, conflicts: [{ client_id: 'c1' }] }) } }
    const r = await client.push({ serverUrl: 'https://qb.lan/', bearer: 'tok', ops: [{ op: 'upsert', note: { client_id: 'c1', updated_at: 1, rev: 1, content: 'x' } }] })
    expect(r.accepted).toBe(1)
    expect(captured.url).toBe('https://qb.lan/v1/sync/push')
    expect(captured.init.headers.authorization).toBe('Bearer tok')
    expect(captured.init.method).toBe('POST')
  })

  it('pull sends since + limit and parses changes/cursor', async () => {
    globalThis.fetch = async () => ({ status: 200, ok: true, json: async () => ({ changes: [{ client_id: 'c1' }], next_cursor: 100, has_more: false }) })
    const r = await client.pull({ serverUrl: 'https://qb.lan', bearer: 'tok', since: 0, limit: 50 })
    expect(r.next_cursor).toBe(100)
    expect(r.changes).toHaveLength(1)
  })

  it('throws on non-2xx with the status code in the message', async () => {
    globalThis.fetch = async () => ({ status: 401, ok: false, text: async () => 'unauthorized', json: async () => ({}) })
    await expect(client.pull({ serverUrl: 'https://qb', bearer: 'x', since: 0, limit: 10 })).rejects.toThrow(/sync-GET-401/)
  })
})