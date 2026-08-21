const { app } = require('electron')
const path = require('path')
const fs = require('fs')
const Database = require('better-sqlite3')

let dbInstance = null

async function initDatabase() {
  if (dbInstance) return dbInstance

  const userDataPath = app.getPath('userData')
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true })
  }

  const dbPath = path.join(userDataPath, 'quickbrain.db')
  dbInstance = new Database(dbPath)

  const schemaPath = path.join(__dirname, 'db', 'schema.sql')
  const schema = fs.readFileSync(schemaPath, 'utf8')
  dbInstance.exec(schema)

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
