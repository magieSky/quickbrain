const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

// Production default. Tests and dev runs can override via env so a freshly
// installed client always opens Settings pointing at a real server instead
// of an empty input.
const DEFAULT_SYNC_SERVER_URL = process.env.QB_SYNC_DEFAULT_URL || 'https://api.quickbrain.app'

function defaultSyncServerUrl() {
  return DEFAULT_SYNC_SERVER_URL
}

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

function buildBearer(override) {
  const cfg = read()
  if (override && override.deviceId && override.token) {
    const { encode } = require('@quickbrain/shared/sync/token')
    return encode({ deviceId: override.deviceId, token: override.token })
  }
  const sync = cfg.sync || {}
  if (!sync.enabled || !sync.token || !sync.deviceId) return null
  const { encode } = require('@quickbrain/shared/sync/token')
  return encode({ deviceId: sync.deviceId, token: sync.token })
}

function ensureAIDeviceId() {
  const cfg = read()
  const ai = cfg.ai || {}
  if (ai.deviceId) return ai.deviceId
  const id = crypto.randomUUID()
  cfg.ai = Object.assign({}, ai, { deviceId: id })
  write(cfg)
  return id
}

module.exports = { read, write, ensureDeviceId, ensureAIDeviceId, buildBearer, configPath, defaultSyncServerUrl }