const configSvc = require('./config')
const path = require('path')

const GLOBAL_KEY = '__qbServerAIService__'
const CONFIG_KEY = '__qbServerAIConfigRaw__'
function _service() { return globalThis[GLOBAL_KEY] || null }
function _configRaw() { return globalThis[CONFIG_KEY] || null }
let _db = null
let _masterKey = null

function safeParse(s, fallback) { try { return JSON.parse(s) } catch (_) { return fallback } }

async function loadAIConfig(db, masterKey) {
  _db = db
  _masterKey = masterKey
  const raw = await configSvc.get(db, 'ai-config', masterKey)
  const cfgRaw = raw ? safeParse(raw, null) : null
  globalThis[CONFIG_KEY] = cfgRaw
  if (!cfgRaw) { globalThis[GLOBAL_KEY] = null; return null }
  const mod = await import(path.join(__dirname, '..', '..', '..', 'client', 'src', 'main', 'ai', 'service.mjs'))
  globalThis[GLOBAL_KEY] = new mod.AIService(cfgRaw)
  return globalThis[GLOBAL_KEY]
}

function get() { return _service() }
function getConfig() { return _configRaw() }
function hasService() { return !!_service() }

function setForTesting(svc) { globalThis[GLOBAL_KEY] = svc; globalThis[CONFIG_KEY] = svc ? { provider: 'test' } : null }

module.exports = { loadAIConfig, get, getConfig, hasService, setForTesting }