const { Kysely, PostgresDialect } = require('kysely')
const { Pool } = require('pg')

function createPool() {
  const dialect = new PostgresDialect({
    pool: new Pool({ connectionString: process.env.DB_URL, max: 5 })
  })
  return new Kysely({ dialect })
}

module.exports = { createPool }