const { verifyBearer } = require('../auth/hmac')
const notes = require('../services/notes')
const { randomUUID } = require('crypto')

module.exports = async function extensionNotesRoutes(fastify, opts) {
  const db = opts.db

  // POST /v1/notes - single-note upsert used by browser extension / external clients
  fastify.post('/v1/notes', async (req, reply) => {
    const v = await verifyBearer(db, req.headers)
    if (!v.ok) return reply.code(401).send({ error: 'unauthorized', reason: v.reason })
    const body = req.body || {}
    if (typeof body.content !== 'string' || !body.content.trim()) {
      return reply.code(400).send({ error: 'content-required' })
    }
    const now = Date.now()
    const incoming = {
      client_id: body.client_id || randomUUID(),
      content: body.content,
      title: (body.title || '').slice(0, 500),
      category: body.category || 'uncategorized',
      tags: Array.isArray(body.tags) ? body.tags : [],
      is_formatted: body.is_formatted ? 1 : 0,
      original_content: body.original_content || '',
      source_path: (body.source_path || '').slice(0, 2000),
      source_type: body.source_type || 'web',
      parent_id: body.parent_id || null,
      source_range: body.source_range || '',
      is_atom: body.is_atom ? 1 : 0,
      extracted_at: body.extracted_at || null,
      created_at: body.created_at || now,
      updated_at: body.updated_at || now,
      deleted_at: null,
      rev: body.rev || 1
    }
    try {
      const r = await notes.upsertNote(db, v.userId, incoming)
      if (r.status === 'accepted') {
        return { success: true, client_id: incoming.client_id, user_id: v.userId }
      }
      if (r.status === 'conflict') {
        return reply.code(409).send({ error: 'conflict', server: { updated_at: r.server && r.server.updated_at } })
      }
      return reply.code(500).send({ error: 'upsert-failed', message: r.error })
    } catch (e) {
      return reply.code(500).send({ error: 'server-error', error: e.message })
    }
  })

  // GET /v1/notes - list recent notes for current user
  fastify.get('/v1/notes', async (req, reply) => {
    const v = await verifyBearer(db, req.headers)
    if (!v.ok) return reply.code(401).send({ error: 'unauthorized', reason: v.reason })
    const limit = Math.min(Number(req.query.limit || 50), 200)
    const since = Number(req.query.since || 0)
    try {
      const rows = since > 0
        ? await notes.listChangedSince(db, v.userId, since, limit)
        : await notes.listAll(db, v.userId, limit)
      return {
        notes: rows,
        next_cursor: rows.length ? Number(rows[rows.length - 1].updated_at) : since
      }
    } catch (e) {
      return reply.code(500).send({ error: 'server-error', error: e.message })
    }
  })
}
