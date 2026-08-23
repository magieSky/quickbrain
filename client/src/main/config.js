const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

function configPath() {
  const { app } = require('electron')
  return path.join(app.getPath('userData'), 'config.json')
}

function read() {
  const p = configPath()
  if (!fs.existsSync(p)) return { ai: {}, sync: { enabled: false } }
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return { ai: {}, sync: { enabled: false } } }
}

function write(cfg) {
  const p = configPath()
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2), 'utf8')
}

function ensureDeviceId() {
  const cfg = read()
  if (cfg.sync && cfg.sync.deviceId) return cfg.sync.deviceId
  const id = crypto.randomUUID()
  cfg.sync = Object.assign({}, cfg.sync || {}, { deviceId: id })
  write(cfg)
  return id
}

function buildBearer() {
  const cfg = read()
  const sync = cfg.sync || {}
  if (!sync.enabled || !sync.token || !sync.deviceId) return null
  const { encode } = require('@quickbrain/shared/sync/token')
  return encode({ deviceId: sync.deviceId, token: sync.token })
}

module.exports = { read, write, ensureDeviceId, buildBearer, configPath }