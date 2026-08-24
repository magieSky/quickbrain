const { verifyBearer } = require('../auth/hmac')
const aiSvc = require('../services/ai')

module.exports = async function aiRoutes(fastify, opts) {
  fastify.post('/v1/ai/format', async (req, reply) => {
    const v = verifyBearer(req.headers)
    if (!v.ok) return reply.code(401).send({ error: 'unauthorized', reason: v.reason })
    if (!aiSvc.hasService()) return reply.code(503).send({ error: 'ai-not-configured' })
    const body = req.body || {}
    if (typeof body.content !== 'string') return reply.code(400).send({ error: 'content-required' })
    try {
      const r = await aiSvc.get().formatContent(body.content, body.style || null)
      return r
    } catch (e) {
      return reply.code(500).send({ error: 'format-failed', message: e.message })
    }
  })

  fastify.post('/v1/ai/categorize', async (req, reply) => {
    const v = verifyBearer(req.headers)
    if (!v.ok) return reply.code(401).send({ error: 'unauthorized', reason: v.reason })
    if (!aiSvc.hasService()) return reply.code(503).send({ error: 'ai-not-configured' })
    const body = req.body || {}
    if (typeof body.content !== 'string') return reply.code(400).send({ error: 'content-required' })
    try {
      const r = await aiSvc.get().categorizeContent(body.content)
      return r
    } catch (e) {
      return reply.code(500).send({ error: 'categorize-failed', message: e.message })
    }
  })

  fastify.post('/v1/ai/semantic-search', async (req, reply) => {
    const v = verifyBearer(req.headers)
    if (!v.ok) return reply.code(401).send({ error: 'unauthorized', reason: v.reason })
    if (!aiSvc.hasService()) return reply.code(503).send({ error: 'ai-not-configured' })
    const body = req.body || {}
    if (typeof body.query !== 'string') return reply.code(400).send({ error: 'query-required' })
    if (!Array.isArray(body.candidateSummaries)) return reply.code(400).send({ error: 'candidateSummaries-required' })
    try {
      const r = await aiSvc.get().semanticSearch(body.query, body.candidateSummaries)
      return r
    } catch (e) {
      return reply.code(500).send({ error: 'semantic-search-failed', message: e.message })
    }
  })
}