const Fastify = require('fastify')
const { loadConfig } = require('./config')
const healthRoutes = require('./routes/health')

function build() {
  const cfg = loadConfig()
  const app = Fastify({ logger: { level: 'info' } })
  app.register(healthRoutes)
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