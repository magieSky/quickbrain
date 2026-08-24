module.exports = async function healthRoutes(fastify) {
  fastify.get('/v1/sync/health', async () => ({ ok: true, server_time: Date.now() }))
}
