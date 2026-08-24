function hexToBuf(name, expectedBytes) {
  const v = process.env[name]
  if (!v) throw new Error('env ' + name + ' required')
  if (!/^[0-9a-fA-F]+$/.test(v) || v.length !== expectedBytes * 2) {
    throw new Error('env ' + name + ' must be ' + (expectedBytes * 2) + ' hex chars')
  }
  return Buffer.from(v, 'hex')
}

function loadConfig() {
  const port = parseInt(process.env.PORT || '7422', 10)
  if (!Number.isFinite(port) || port < 1 || port > 65535) throw new Error('PORT invalid')
  const dbUrl = process.env.DB_URL || 'postgres://qb:qb@localhost:5432/qb'
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
  const masterKey = hexToBuf('MASTER_KEY', 32)
  const adminBootstrapToken = process.env.ADMIN_BOOTSTRAP_TOKEN
  if (!adminBootstrapToken) throw new Error('env ADMIN_BOOTSTRAP_TOKEN required')
  return { port, dbUrl, redisUrl, masterKey, adminBootstrapToken }
}

module.exports = { loadConfig }