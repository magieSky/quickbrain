const Fastify = require('fastify')
const path = require('path')
const { loadConfig } = require('./config')
const healthRoutes = require('./routes/health')
const devicesRoutes = require('./routes/devices')
const syncRoutes = require('./routes/sync')
const extensionNotesRoutes = require('./routes/extension-notes')
const authRoutes = require('./routes/auth')
const extractionQueue = require('./queues/extraction')
const { extractAtomsForSource } = require('./extractor')
const aiRoutes = require('./routes/ai')
const aiSvc = require('./services/ai')
const { applyAll } = require('@quickbrain/shared/schema/pg/migrations')
const { enforceNotesUserNotNull } = require('./db/bootstrap')

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
    app.register(authRoutes, { db, adminBootstrapToken: cfg.adminBootstrapToken })
    app.register(devicesRoutes, { db })
    app.register(syncRoutes, { db })
    app.register(extensionNotesRoutes, { db })
    // Wire push -> queue
    syncRoutes.setEnqueueExtract(async (clientId, opts) => {
      try { await extractionQueue.enqueue(clientId, { redisUrl: cfg.redisUrl }) }
      catch (e) { console.error('[sync] enqueue extract failed:', e.message) }
    })
  }
  app.get('/', async () => ({ name: 'quickbrain-server', port: cfg.port }))
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

async function bootstrapDb(db) {
  // SaaS bootstrap: just run schema migrations + enforce per-user scoping.
  // The first admin user is created out-of-band via POST /v1/auth/register-admin
  // (gated by ADMIN_BOOTSTRAP_TOKEN env). No more auto-seeded owner.
  await applyAll(db)
  await enforceNotesUserNotNull(db)
}

module.exports = { build, startExtractionWorker, bootstrapDb }

if (require.main === module) {
  (async () => {
    const db = require('./db/pool').createPool()
    try {
      await bootstrapDb(db)
    } catch (e) {
      console.error('[bootstrap] failed:', e.message)
      process.exit(1)
    }
    const app = build({ db })
    const cfg = loadConfig()
    await app.listen({ port: cfg.port, host: '0.0.0.0' })
  })().catch(e => { console.error(e); process.exit(1) })
}
