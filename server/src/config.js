function hexToBuf(name, expectedBytes) {
  const v = process.env[name]
  if (!v) throw new Error('env ' + name + ' required')
  if (!/^[0-9a-fA-F]+$/.test(v) || v.length !== expectedBytes * 2) {
    throw new Error('env ' + name + ' must be ' + (expectedBytes * 2) + ' hex chars')
  }
  return Buffer.from(v, 'hex')
}

function loadConfig() {
  const mode = process.env.MODE || 'byos'
  if (!['byos', 'local', 'saas'].includes(mode)) throw new Error('unknown MODE ' + mode)
  const port = parseInt(process.env.PORT || '7422', 10)
  if (!Number.isFinite(port) || port < 1 || port > 65535) throw new Error('PORT invalid')
  const dbUrl = process.env.DB_URL || 'postgres://qb:qb@localhost:5432/qb'
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
  const masterKey = hexToBuf('MASTER_KEY', 32)
  const ownerToken = process.env.OWNER_TOKEN
  if (!ownerToken) throw new Error('env OWNER_TOKEN required')
  return { mode, port, dbUrl, redisUrl, masterKey, ownerToken }
}

module.exports = { loadConfig }