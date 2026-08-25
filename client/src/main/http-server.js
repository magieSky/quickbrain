const http = require('http')
const { addNote, searchNotes, getRecentNotes } = require('./db/search')

const HOST = '127.0.0.1'
const PORT = 7421

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', c => {
      size += c.length
      if (size > 1_000_000) { reject(new Error('payload-too-large')); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8') || '{}'
      try { resolve(JSON.parse(raw)) } catch (e) { reject(new Error('invalid-json')) }
    })
    req.on('error', reject)
  })
}

function send(res, code, body) {
  const data = typeof body === 'string' ? body : JSON.stringify(body)
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  })
  res.end(data)
}

function handleNoteMessage(msg, getDB) {
  const payload = (msg && msg.payload) || {}
  if (msg && msg.type === 'save-selection') {
    const text = payload.text
    const title = payload.title
    const url = payload.url
    if (!text || !text.trim()) return { success: false, error: 'empty-text' }
    const db = getDB()
    const id = addNote(db, {
      content: text,
      title: title || (text.split('\n')[0] || '').slice(0, 80),
      tags: ['web'],
      source_path: url || '',
      source_type: 'web'
    })
    return { success: true, id }
  }
  if (msg && msg.type === 'save-page') {
    const markdown = payload.markdown
    const title = payload.title
    const url = payload.url
    if (!markdown || !markdown.trim()) return { success: false, error: 'empty-markdown' }
    const db = getDB()
    const id = addNote(db, {
      content: markdown,
      title: title || (url || 'web page').slice(0, 80),
      tags: ['web-page'],
      source_path: url || '',
      source_type: 'web'
    })
    return { success: true, id }
  }
  return { success: false, error: 'unsupported-type' }
}

function start({ getDB, onNotesUpdated }) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost')
      const route = req.method + ' ' + url.pathname

      if (req.method === 'OPTIONS') return send(res, 204, '')

      if (route === 'GET /health') {
        return send(res, 200, { ok: true, port: PORT, ts: Date.now() })
      }

      // SaaS-style health for extension ping
      if (route === 'GET /v1/sync/health') {
        return send(res, 200, { ok: true, port: PORT, ts: Date.now(), local: true })
      }

      // SaaS-style note write for extension
      if (route === 'POST /v1/notes') {
        const body = await readJson(req)
        console.log('[http-server] POST /v1/notes url=' + (body.source_path || ''))
        if (!body || typeof body.content !== 'string' || !body.content.trim()) {
          return send(res, 400, { error: 'content-required' })
        }
        const db = getDB()
        const noteTitle = (body.title || body.content.split('\n')[0] || '').slice(0, 80)
        const id = addNote(db, {
          content: body.content,
          title: noteTitle,
          tags: Array.isArray(body.tags) ? body.tags : ['web'],
          source_path: body.source_path || '',
          source_type: body.source_type || 'web',
          original_content: body.original_content || ''
        })
        if (onNotesUpdated) onNotesUpdated({ type: body.source_type === 'web' ? 'save-page' : 'save-selection', id })
        // Fire-and-forget extraction (matches local /notes behavior)
        try {
          const { extractAtomsForSource } = require('./notes-extractor')
          setImmediate(() => {
            extractAtomsForSource(id).catch(err =>
              console.error('[http-server] extract failed:', err.message))
          })
        } catch (e) { console.error('[http-server] extract setup failed:', e.message) }
        // SaaS-style response shape so the extension is happy
        return send(res, 200, { client_id: 'local-' + id, id, local: true })
      }

      if (route === 'GET /notes') {
        const q = url.searchParams.get('q') || ''
        const limit = Math.max(1, Math.min(parseInt(url.searchParams.get('limit'), 10) || 20, 200))
        const { smartSearch } = require('./ipc')
        const result = await smartSearch(q, limit)
        return send(res, 200, result)
      }

      if (route === 'GET /recent-notes') {
        const limit = Math.max(1, Math.min(parseInt(url.searchParams.get('limit'), 10) || 20, 200))
        return send(res, 200, getRecentNotes(getDB(), limit))
      }

      if (route === 'POST /notes') {
        const body = await readJson(req)
        console.log('[http-server] POST /notes type=' + body.type)
        const result = handleNoteMessage(body, getDB)
        if (result.success && onNotesUpdated) {
          onNotesUpdated({ type: body.type, id: result.id })
          try {
            const { extractAtomsForSource } = require('./notes-extractor')
            console.log('[http-server] scheduling extraction for', result.id)
            setImmediate(() => {
              extractAtomsForSource(result.id).then(r =>
                console.log('[http-server] extract result for', result.id, JSON.stringify(r))
              ).catch(err =>
                console.error('[http-server] extract failed:', err.message))
            })
          } catch (e) { console.error('[http-server] extract setup failed:', e.message) }
        }
        return send(res, 200, result)
      }

      send(res, 404, { error: 'not-found' })
    } catch (e) {
      console.error('[http-server] handler failed:', e.message)
      send(res, 500, { error: e.message })
    }
  })

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error('[http-server] port ' + PORT + ' in use; extension bridge disabled')
    } else {
      console.error('[http-server] server error:', err.message)
    }
  })

  server.listen(PORT, HOST, () => {
    console.log('[http-server] listening on http://' + HOST + ':' + PORT)
  })

  return server
}

module.exports = { start, handleNoteMessage, PORT }