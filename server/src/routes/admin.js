const { verifyBearer } = require('../auth/hmac')
const devices = require('../services/devices')
const configSvc = require('../services/config')

const SENSITIVE_KEYS = new Set(['apiKey', 'api_key', 'token'])

function redact(value) {
  if (!value || typeof value !== 'object') return value
  const out = {}
  for (const [k, v] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(k)) out[k] = v ? '<set>' : ''
    else out[k] = v
  }
  return out
}

function safeParse(s, fallback) { try { return JSON.parse(s) } catch (_) { return fallback } }

module.exports = async function adminRoutes(fastify, opts) {
  const db = opts.db
  const masterKey = opts.masterKey
  const ownerToken = opts.ownerToken
  configSvc.ensureSchema(db)

  // Owner-only middleware (separate from device bearer)
  async function requireOwner(req, reply) {
    const auth = req.headers.authorization || ''
    const expected = 'Bearer ' + ownerToken
    if (auth !== expected) {
      return reply.code(401).send({ error: 'unauthorized', reason: 'owner-token-required' })
    }
  }

  fastify.get('/v1/admin/status', { preHandler: requireOwner }, async () => {
    let notes = 0, devicesCount = 0, outboxCount = 0, configCount = 0
    try {
      notes = (await db.selectFrom('notes').select(db.fn.count('client_id').as('c')).executeTakeFirst()).c
    } catch (_) {}
    try { devicesCount = (await db.selectFrom('devices').select(db.fn.count('device_id').as('c')).executeTakeFirst()).c } catch (_) {}
    try { outboxCount = (await db.selectFrom('sync_outbox_shadow').select(db.fn.count('seq').as('c')).executeTakeFirst()).c } catch (_) {}
    try { configCount = db.prepare('SELECT COUNT(*) AS c FROM config').get().c } catch (_) {}
    return {
      ok: true,
      server_time: Date.now(),
      notes,
      devices: devicesCount,
      outbox_pending: outboxCount,
      config_keys: configCount
    }
  })

  fastify.get('/v1/admin/ai-config', { preHandler: requireOwner }, async () => {
    const raw = configSvc.get(db, 'ai-config', masterKey)
    const parsed = raw ? safeParse(raw, null) : null
    return { configured: !!parsed, config: redact(parsed || {}) }
  })

  fastify.post('/v1/admin/ai-config', { preHandler: requireOwner }, async (req, reply) => {
    const body = req.body || {}
    const provider = (body.provider || '').toString().trim()
    if (!provider) return reply.code(400).send({ error: 'provider-required' })
    const next = {
      provider,
      apiKey: (body.apiKey || '').toString(),
      model: (body.model || '').toString(),
      baseURL: (body.baseURL || '').toString(),
      updated_at: Date.now()
    }
    configSvc.set(db, 'ai-config', JSON.stringify(next), masterKey)
    return { ok: true, config: redact(next) }
  })

  fastify.delete('/v1/admin/ai-config', { preHandler: requireOwner }, async () => {
    configSvc.remove(db, 'ai-config')
    return { ok: true }
  })

  fastify.get('/v1/admin/devices', { preHandler: requireOwner }, async () => {
    return devices.listDevices(db)
  })

  fastify.post('/v1/admin/devices/:id/revoke', { preHandler: requireOwner }, async (req) => {
    await devices.revoke(db, req.params.id)
    return { ok: true }
  })
}

module.exports.requireOwner = null