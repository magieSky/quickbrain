import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import Fastify from 'fastify'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'

const routeUrl = 'file:///' + path.resolve('server/src/routes/auth.js').replace(/\\/g, '/')

function fakeDb() {
  let nextId = 1
  const users = new Map()  // username -> row
  const byId = new Map()   // id -> row
  return {
    selectFrom: (table) => {
      if (table === 'users') {
        return {
          selectAll: () => ({
            where: (col, op, val) => {
              const m = users.get(val)
              if (op === '=' && col === 'username') {
                return {
                  executeTakeFirst: async () => m ? { ...m } : null
                }
              }
              return { executeTakeFirst: async () => null }
            },
            execute: async () => Array.from(users.values()).map(u => ({ ...u }))
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
            byId.set(id, row)
            return { ...row }
          }
        })
      })
    }),
    updateTable: () => ({
      set: (patch) => ({
        where: (col, op, val) => ({
          execute: async () => {
            if (op === '=' && col === 'id') {
              const u = byId.get(val)
              if (!u) return []
              Object.assign(u, patch)
              users.set(u.username, u)
              return [u]
            }
            return []
          }
        })
      })
    })
  }
}

async function buildApp(db) {
  const mod = await import(routeUrl + '?t=' + Date.now() + Math.random())
  const app = Fastify({ logger: false })
  await app.register(mod.default || mod, { db })
  await app.ready()
  return app
}

describe('auth /v1/auth routes', () => {
  it('registers a new user and returns secret', async () => {
    const app = await buildApp(fakeDb())
    const r = await app.inject({
      method: 'POST', url: '/v1/auth/register',
      payload: { username: 'alice', password: 'hunter2' }
    })
    expect(r.statusCode).toBe(201)
    const body = r.json()
    expect(body.username).toBe('alice')
    expect(body.user_id).toBeTruthy()
    expect(typeof body.secret).toBe('string')
    expect(body.secret.length).toBeGreaterThanOrEqual(40)
  })

  it('rejects registration with bad username', async () => {
    const app = await buildApp(fakeDb())
    const r = await app.inject({
      method: 'POST', url: '/v1/auth/register',
      payload: { username: 'a!', password: 'hunter2' }
    })
    expect(r.statusCode).toBe(400)
  })

  it('rejects registration with short password', async () => {
    const app = await buildApp(fakeDb())
    const r = await app.inject({
      method: 'POST', url: '/v1/auth/register',
      payload: { username: 'alice', password: '123' }
    })
    expect(r.statusCode).toBe(400)
  })

  it('rejects duplicate username', async () => {
    const db = fakeDb()
    const app = await buildApp(db)
    await app.inject({ method: 'POST', url: '/v1/auth/register', payload: { username: 'alice', password: 'hunter2' } })
    const r = await app.inject({ method: 'POST', url: '/v1/auth/register', payload: { username: 'alice', password: 'hunter2' } })
    expect(r.statusCode).toBe(409)
  })

  it('logs in with correct password and returns secret', async () => {
    const db = fakeDb()
    const app = await buildApp(db)
    const reg = await app.inject({
      method: 'POST', url: '/v1/auth/register',
      payload: { username: 'alice', password: 'hunter2' }
    })
    const regBody = reg.json()
    const r = await app.inject({
      method: 'POST', url: '/v1/auth/login',
      payload: { username: 'alice', password: 'hunter2' }
    })
    expect(r.statusCode).toBe(200)
    const body = r.json()
    expect(body.username).toBe('alice')
    expect(body.secret).toBe(regBody.secret)
  })

  it('rejects login with wrong password', async () => {
    const db = fakeDb()
    const app = await buildApp(db)
    await app.inject({ method: 'POST', url: '/v1/auth/register', payload: { username: 'alice', password: 'hunter2' } })
    const r = await app.inject({ method: 'POST', url: '/v1/auth/login', payload: { username: 'alice', password: 'WRONG' } })
    expect(r.statusCode).toBe(401)
  })

  it('rejects login for unknown user', async () => {
    const app = await buildApp(fakeDb())
    const r = await app.inject({ method: 'POST', url: '/v1/auth/login', payload: { username: 'nobody', password: 'x' } })
    expect(r.statusCode).toBe(401)
  })
})
