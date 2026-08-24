// Minimal Kysely-like fake supporting selectFrom/insertInto/updateTable
// with chained where/orderBy/limit/execute patterns our routes use.

export function fakeDb(opts = {}) {
  const users = opts.users || [{ id: 1, username: 'tester', secret: opts.token || 'h'.repeat(32) }]
  const stored = new Map()
  const meta = new Map()

  function buildNotesQuery(filters = []) {
    const exec = async () => {
      let rows = Array.from(stored.values())
      for (const f of filters) {
        rows = rows.filter(r => {
          if (f.op === '=') return r[f.col] === f.val
          if (f.op === '>') return r[f.col] > f.val
          if (f.op === '<') return r[f.col] < f.val
          if (f.op === 'is' && f.val === null) return r[f.col] == null
          return true
        })
      }
      return rows
    }
    return {
      where: (col, op, val) => buildNotesQuery([...filters, { col, op, val }]),
      orderBy: () => buildNotesQuery(filters),
      limit: (n) => ({
        execute: async () => (await exec()).slice(0, n),
        where: (col, op, val) => ({
          execute: async () => (await exec()).slice(0, n),
          orderBy: () => ({
            limit: (m) => ({ execute: async () => (await exec()).slice(0, m) })
          })
        }),
        orderBy: () => ({
          limit: (m) => ({ execute: async () => (await exec()).slice(0, m) })
        })
      }),
      execute: exec,
      executeTakeFirst: async () => (await exec())[0] || null
    }
  }

  return {
    stored, users,
    selectFrom: (table) => {
      if (table === 'users') {
        return {
          selectAll: () => ({
            where: (col, op, val) => ({
              executeTakeFirst: async () => users.find(u => op === '=' && col === 'username' && u.username === val) || null
            }),
            execute: async () => users
          })
        }
      }
      return { selectAll: () => buildNotesQuery() }
    },
    insertInto: () => ({
      values: (v) => ({
        onConflict: () => ({
          doUpdateSet: (patch) => ({
            executeTakeFirst: async () => {
              const merged = { ...v, ...patch }
              stored.set(v.client_id, merged)
              return { client_id: v.client_id }
            }
          }),
          executeTakeFirst: async () => { stored.set(v.client_id, v); return { client_id: v.client_id } }
        })
      })
    }),
    updateTable: () => ({
      set: (patch) => ({
        where: (col, op, val) => {
          if (col === 'client_id' && op === '=') {
            if (stored.has(val)) stored.set(val, { ...stored.get(val), ...patch })
          } else if (col === 'user_id' && op === '=') {
            for (const [k, v] of stored) if (v.user_id === val) stored.set(k, { ...v, ...patch })
          } else if (col === 'device_id' && op === '=') {
            meta.set(val, { ...meta.get(val), ...patch })
          }
          return { execute: async () => [], executeTakeFirst: async () => ({}) }
        }
      })
    })
  }
}

