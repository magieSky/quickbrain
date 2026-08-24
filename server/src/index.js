const Fastify = require('fastify')
const path = require('path')
const { loadConfig } = require('./config')
const healthRoutes = require('./routes/health')
const devicesRoutes = require('./routes/devices')
const syncRoutes = require('./routes/sync')
const extractionQueue = require('./queues/extraction')
const { extractAtomsForSource } = require('./extractor')
const aiRoutes = require('./routes/ai')
const aiSvc = require('./services/ai')

function build({ db = null } = {}) {
  const cfg = loadConfig()
  const app = Fastify({ logger: { level: 'info' } })
  app.register(healthRoutes)
  try {
    app.register(require('@fastify/static'), {
      root: path.join(__dirname, '..', 'web', 'admin'),
      prefix: '/admin/'
    })
    app.get('/admin', async (_req, reply) => reply.redirect('/admin/'))
  } catch (e) { console.warn('[server] admin static not available:', e.message) }
  if (db) {
    app.register(devicesRoutes, { db })
    app.register(syncRoutes, { db })
    // Wire push -> queue
    syncRoutes.setEnqueueExtract(async (clientId, opts) => {
      try { await extractionQueue.enqueue(clientId, { redisUrl: cfg.redisUrl }) }
      catch (e) { console.error('[sync] enqueue extract failed:', e.message) }
    })
  }
  app.get('/', async () => ({ name: 'quickbrain-server', mode: cfg.mode, port: cfg.port }))
  return app
}

async function startExtractionWorker({ db, aiService, redisUrl }) {
  if (!aiService) aiService = aiSvc.get() || undefined;
  if (!db) throw new Error('db required')
  if (!aiService) console.warn('[server] extraction worker started without aiService; jobs will fail until AI is configured')
  return extractionQueue.startWorker({
    redisUrl,
    runJob: async (clientId, opts) => extractAtomsForSource(db, clientId, { aiService, force: !!(opts && opts.force) })
  })
}

module.exports = { build, startExtractionWorker }

if (require.main === module) {
  build().then(async (app) => {
    const cfg = loadConfig()
    await app.listen({ port: cfg.port, host: '0.0.0.0' })
  }).catch(e => { console.error(e); process.exit(1) })
}