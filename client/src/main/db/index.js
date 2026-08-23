const Database = require('better-sqlite3')
const fs = require('fs')
const path = require('path')

function migrate(db) {
  const cols = db.prepare("PRAGMA table_info(notes)").all().map(c => c.name)
  if (!cols.includes('source_path')) db.exec("ALTER TABLE notes ADD COLUMN source_path TEXT DEFAULT ''")
  if (!cols.includes('source_type')) db.exec("ALTER TABLE notes ADD COLUMN source_type TEXT DEFAULT ''")
}

function createDatabase(dbPath) {
  const db = new Database(dbPath)
  const schemaPath = path.join(__dirname, 'schema.sql')
  const schema = fs.readFileSync(schemaPath, 'utf8')
  db.exec(schema)
  migrate(db)
  return db
}

module.exports = { createDatabase }