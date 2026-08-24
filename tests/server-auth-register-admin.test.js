import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import Fastify from 'fastify'

const authUrl = 'file:///' + path.resolve('server/src/routes/auth.js').replace(/\\/g, '/')

let originalEnv
beforeEach(() => {
  originalEnv = { ...process.env }
  process.env.MASTER_KEY = 'a'.repeat(64)
  process.env.ADMIN_BOOTSTRAP_TOKEN = 'tok-secret-1234567890'
  process.env.DB_URL = 'postgres://x'
})
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in originalEnv)) delete process.env[k]
  for (const k of Object.keys(originalEnv)) process.env[k] = originalEnv[k]
})

function fakeDb() {
  let nextId = 1
  const users = new Map()
  return {
    selectFrom: (table) => {
      if (table === 'users') {
        return {
          select: () => ({ executeTakeFirst: async () => ({ c: users.size }) }),
          selectAll: () => ({
            where: (col, op, val) => ({
              executeTakeFirst: async () => (op === '=' && col === 'username') ? (users.get(val) || null) : null,
              execute: async () => Array.from(users.values())
            }),
            execute: async () => Array.from(users.values())
          })
        }
      }
      return { selectAll: () => ({ executeTakeFirst: async () => null, execute: async () => [] }) }
    },
    insertInto: () => ({
      values: (v) => ({
        returningAll: () => ({
          executeTakeFirst: async () => {
            const id = nextId++
            const row = { id, ...v }
            users.set(v.username, row)
            return { ...row }
          }
        })
      })
    }),
    updateTable: () => ({ set: () => ({ where: () => ({ execute: async () => [] }) }) })
  }
}

async function buildApp(db, adminBootstrapToken) {
  const mod = await import(authUrl + '?t=' + Date.now() + Math.random())
  const app = Fastify({ logger: false })
  await app.register(mod.default || mod, { db, adminBootstrapToken })
  return app
}

describe('POST /v1/auth/register-admin', () => {
  it('creates first owner user with valid bootstrap token', async () => {
    const db = fakeDb()
    const app = await buildApp(db, 'tok-secret-1234567890')
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register-admin',
      headers: { 'x-qb-bootstrap': 'tok-secret-1234567890' },
      payload: { username: 'admin', password: 'hunter2-strong' }
    })
    expect(res.statusCode).toBe(201)
    const j = res.json()
    expect(j.ok).toBe(true)
    expect(j.username).toBe('admin')
    expect(typeof j.secret).toBe('string')
    expect(j.secret.length).toBeGreaterThan(20)
    await app.close()
  })

  it('rejects missing X-QB-Bootstrap header with 401', async () => {
    const db = fakeDb()
    const app = await buildApp(db, 'tok-secret-1234567890')
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register-admin',
      payload: { username: 'admin', password: 'hunter2-strong' }
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe('invalid-bootstrap-token')
    await app.close()
  })

  it('rejects wrong bootstrap token with 401', async () => {
    const db = fakeDb()
    const app = await buildApp(db, 'tok-secret-1234567890')
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register-admin',
      headers: { 'x-qb-bootstrap': 'wrong-token-here' },
      payload: { username: 'admin', password: 'hunter2-strong' }
    })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('rejects after any user already exists with 403 already-bootstrapped', async () => {
    // Pre-seed one row directly via the fake
    const db = fakeDb()
    db._seed = () => {
      // Use the same insert path so count goes up
      db.selectFrom = (table) => {
        if (table === 'users') {
          return {
            select: () => ({ executeTakeFirst: async () => ({ c: 1 }) }),
            selectAll: () => ({
              where: () => ({ executeTakeFirst: async () => null, execute: async () => [] }),
              execute: async () => []
            })
          }
        }
        return { selectAll: () => ({ executeTakeFirst: async () => null, execute: async () => [] }) }
      }
    }
    db._seed()
    const app = await buildApp(db, 'tok-secret-1234567890')
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register-admin',
      headers: { 'x-qb-bootstrap': 'tok-secret-1234567890' },
      payload: { username: 'admin2', password: 'hunter2-strong' }
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('already-bootstrapped')
    await app.close()
  })

  it('rejects invalid username with 400', async () => {
    const db = fakeDb()
    const app = await buildApp(db, 'tok-secret-1234567890')
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register-admin',
      headers: { 'x-qb-bootstrap': 'tok-secret-1234567890' },
      payload: { username: 'a!', password: 'hunter2-strong' }
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('invalid-username')
    await app.close()
  })

  it('rejects short password with 400', async () => {
    const db = fakeDb()
    const app = await buildApp(db, 'tok-secret-1234567890')
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register-admin',
      headers: { 'x-qb-bootstrap': 'tok-secret-1234567890' },
      payload: { username: 'admin', password: 'no' }
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('invalid-password')
    await app.close()
  })
})
