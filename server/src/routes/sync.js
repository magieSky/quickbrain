const { verifyBearer } = require('../auth/hmac')
const { validatePull, validatePushOps } = require('@quickbrain/shared/sync/protocol')
const notes = require('../services/notes')

const DEFAULT_LIMIT = 500
const NOTIFY_EXTRACT = { state: 'pending' } // placeholder, used for enqueue integration in Task 27

function setEnqueueExtract(fn) { module.exports._enqueueExtract = fn }

async function applyOps(db, ops) {
  // Apply each op under a sequential await (atomicity comes from PG transactions later).
  const accepted = []
  const conflicts = []
  for (const op of ops) {
    if (op.op === 'upsert') {
      const r = await notes.upsertNote(db, op.note)
      if (r.status === 'accepted') {
        accepted.push(op.note.client_id)
        if (!op.note.is_atom && op.note.extracted_at == null && module.exports._enqueueExtract) {
          try { await module.exports._enqueueExtract(op.note.client_id, { force: false }) }
          catch (e) { console.error('[sync] enqueue failed', e.message) }
        }
      } else {
        conflicts.push({ client_id: op.note.client_id, server_version: r.server })
      }
    } else if (op.op === 'delete') {
      const r = await notes.softDelete(db, op.client_id, op.updated_at)
      if (r && r.conflict) conflicts.push({ client_id: op.client_id, server_version: 'kept' })
      else accepted.push(op.client_id)
    }
  }
  return { accepted, conflicts }
}

module.exports = async function syncRoutes(fastify, opts) {
  const db = opts.db

  fastify.get('/v1/sync/health', async () => ({ ok: true, server_time: Date.now() }))

  fastify.get('/v1/sync/cursor', async (req, reply) => {
    const v = verifyBearer(req.headers)
    if (!v.ok) return reply.code(401).send({ error: 'unauthorized', reason: v.reason })
    return { server_now: Date.now(), head_cursor: Date.now() }
  })

  fastify.get('/v1/sync/pull', async (req, reply) => {
    const v = verifyBearer(req.headers)
    if (!v.ok) return reply.code(401).send({ error: 'unauthorized', reason: v.reason })
    const q = { since: Number(req.query.since || 0), limit: Number(req.query.limit || DEFAULT_LIMIT) }
    const err = validatePull(q)
    if (err) return reply.code(400).send({ error: err })
    const rows = await notes.listChangedSince(db, q.since, q.limit)
    const next_cursor = rows.length ? Number(rows[rows.length - 1].updated_at) : q.since
    return { changes: rows, next_cursor, has_more: rows.length === q.limit }
  })

  fastify.post('/v1/sync/push', async (req, reply) => {
    const v = verifyBearer(req.headers)
    if (!v.ok) return reply.code(401).send({ error: 'unauthorized', reason: v.reason })
    const ops = (req.body && req.body.ops) || []
    const validation = validatePushOps(ops)
    if (validation.length) return reply.code(400).send({ error: 'invalid-ops', details: validation })
    const result = await applyOps(db, ops)
    return { accepted: result.accepted.length, conflicts: result.conflicts }
  })
}

module.exports.setEnqueueExtract = setEnqueueExtract
module.exports.applyOps = applyOps