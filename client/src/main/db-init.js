const { app } = require('electron')
const path = require('path')
const fs = require('fs')
const Database = require('better-sqlite3')
const { applyAll } = require('@quickbrain/shared/schema/sqlite/migrations')
const vec = require('./db/vec')

let dbInstance = null

async function initDatabase() {
  if (dbInstance) return dbInstance

  const userDataPath = app.getPath('userData')
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true })
  }

  const dbPath = path.join(userDataPath, 'quickbrain.db')
  dbInstance = new Database(dbPath)

  applyAll(dbInstance)

  // Try to load sqlite-vec for optional semantic recall. Failures are
  // logged and turned into no-ops by the wrapper, so the rest of the app
  // keeps working without vector search.
  try {
    const cfg = require('./config').read()
    const dims = cfg && cfg.embedding && cfg.embedding.dims
    vec.ensureLoaded(dbInstance, dims || undefined)
  } catch (e) {
    console.warn('[db-init] vec load skipped:', e.message)
  }

  return dbInstance
}

function getDB() {
  return dbInstance
}

function closeDatabase() {
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
  }
}

module.exports = { initDatabase, getDB, closeDatabase }
