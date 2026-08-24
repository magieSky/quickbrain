const { verifyBearer } = require('../auth/hmac')
const devices = require('../services/devices')

module.exports = async function devicesRoutes(fastify, opts) {
  const db = opts.db

  fastify.addHook('preHandler', async (req, reply) => {
    const v = await verifyBearer(db, req.headers)
    if (!v.ok) return
    try {
      await devices.recordSeen(db, {
        deviceId: v.deviceId,
        name: req.headers['x-qb-name'] || '',
        platform: req.headers['x-qb-platform'] || 'unknown',
        clientVer: req.headers['x-qb-client'] || 'unknown'
      })
    } catch (e) {
      fastify.log.warn({ err: e.message }, 'recordSeen failed')
    }
    req.deviceId = v.deviceId
    req.userId = v.userId
  })

  fastify.get('/v1/admin/devices', async (req, reply) => {
    const v = await verifyBearer(db, req.headers)
    if (!v.ok) return reply.code(401).send({ error: 'unauthorized', reason: v.reason })
    return devices.listDevices(db)
  })

  fastify.post('/v1/admin/devices/:id/revoke', async (req, reply) => {
    const v = await verifyBearer(db, req.headers)
    if (!v.ok) return reply.code(401).send({ error: 'unauthorized', reason: v.reason })
    await devices.revoke(db, req.params.id)
    return { ok: true }
  })
}
