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

  // 1) Load sqlite-vec BEFORE running migrations. The 0009_vec_table.sql
  //    migration creates a vec0 virtual table and will fail if the
  //    extension is not loaded yet. If loading fails we skip that one
  //    file so the rest of the schema (and the app) still comes up.
  let cfg = {}
  try { cfg = require('./config').read() || {} } catch (e) { /* fresh install */ }
  const dims = cfg && cfg.embedding && cfg.embedding.dims
  vec.ensureLoaded(dbInstance, dims || undefined)

  const skipFiles = vec.isLoaded()
    ? new Set()
    : new Set(['0009_vec_table.sql'])

  // 2) Apply migrations, skipping the vec virtual-table file when vec0
  //    is unavailable. The notes_vec_meta table (0008_vec_meta.sql) and
  //    the rest of the schema always apply.
  try {
    applyAll(dbInstance, { skipFiles })
  } catch (e) {
    console.error('[db-init] migration failed:', e.message)
    // Reset and rethrow so main.js can show the error to the user
    // instead of silently crashing on unhandled rejection.
    try { dbInstance.close() } catch {}
    dbInstance = null
    throw e
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