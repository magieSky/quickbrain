const users = require('../services/users')

module.exports = async function authRoutes(fastify, opts) {
  const db = opts.db

  // POST /v1/auth/register { username, password }
  // Returns: { ok: true, username, user_id, secret }
  // `secret` is shown ONCE on registration. Client must store it locally.
  fastify.post('/v1/auth/register', async (req, reply) => {
    const { username, password } = req.body || {}
    const r = await users.register(db, { username, password })
    if (!r.ok) return reply.code(r.error === 'username-taken' ? 409 : 400).send({ error: r.error })
    return reply.code(201).send({
      ok: true,
      user_id: r.user.id,
      username: r.user.username,
      secret: r.secret
    })
  })

  // POST /v1/auth/login { username, password }
  // Returns: { ok, user_id, username, secret }
  fastify.post('/v1/auth/login', async (req, reply) => {
    const { username, password } = req.body || {}
    const r = await users.login(db, { username, password })
    if (!r.ok) return reply.code(401).send({ error: r.error })
    return {
      ok: true,
      user_id: r.user.id,
      username: r.user.username,
      secret: r.secret
    }
  })

  // POST /v1/auth/change-password { old_password, new_password }
  // Rotates secret too (any leaked bearer becomes invalid).
  // Requires: Authorization: Bearer <current_bearer>, X-QB-Device: <uuid>
  fastify.post('/v1/auth/change-password', async (req, reply) => {
    const { verifyBearer } = require('../auth/hmac')
    const v = await verifyBearer(db, req.headers)
    if (!v.ok) return reply.code(401).send({ error: 'unauthorized', reason: v.reason })
    const { old_password, new_password } = req.body || {}
    if (!old_password || !new_password) return reply.code(400).send({ error: 'missing-fields' })
    const r = await users.changePassword(db, v.userId, { oldPassword: old_password, newPassword: new_password })
    if (!r.ok) return reply.code(r.error === 'wrong-password' ? 403 : 400).send({ error: r.error })
    return { ok: true, secret: r.secret, rotated: true }
  })

  // GET /v1/auth/me - returns current user info (for verifying the connection)
  fastify.get('/v1/auth/me', async (req, reply) => {
    const { verifyBearer } = require('../auth/hmac')
    const v = await verifyBearer(db, req.headers)
    if (!v.ok) return reply.code(401).send({ error: 'unauthorized', reason: v.reason })
    return {
      user_id: v.userId,
      username: v.username,
      device_id: v.deviceId
    }
  })
}
