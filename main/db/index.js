const Database = require('better-sqlite3')
const fs = require('fs')
const path = require('path')

function createDatabase(dbPath) {
  const db = new Database(dbPath)
  const schemaPath = path.join(__dirname, 'schema.sql')
  const schema = fs.readFileSync(schemaPath, 'utf8')
  db.exec(schema)
  return db
}

module.exports = { createDatabase }