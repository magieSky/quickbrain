const Fastify = require('fastify')
const { loadConfig } = require('./config')
const healthRoutes = require('./routes/health')
const devicesRoutes = require('./routes/devices')

function build({ db = null } = {}) {
  const cfg = loadConfig()
  const app = Fastify({ logger: { level: 'info' } })
  app.register(healthRoutes)
  if (db) {
    app.register(devicesRoutes, { db })
  }
  app.get('/', async () => ({ name: 'quickbrain-server', mode: cfg.mode, port: cfg.port }))
  return app
}

module.exports = { build }

if (require.main === module) {
  build().then(async (app) => {
    const cfg = loadConfig()
    await app.listen({ port: cfg.port, host: '0.0.0.0' })
  }).catch(e => { console.error(e); process.exit(1) })
}