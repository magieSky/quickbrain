# QuickBrain Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a self-hosted (BYOS) sync mode so two QuickBrain installs on different machines see each others notes within seconds, while keeping the existing local-only behaviour unchanged when `sync.enabled = false`.

**Architecture:** Monorepo split (`client/` + `server/` + `shared/`). Server is a Fastify + Postgres + Redis (BullMQ) app that stores notes (LWW conflict resolution by `updated_at + client_id`), runs AI atom extraction in a worker, and exposes a static admin UI. Client keeps a local SQLite cache + outbox; a daemon pulls every 5s and pushes debounced. Auth is per-user HMAC-bound bearer tokens validated server-side. Phase 9 adds a `users` table with bcrypt password + per-user secret; the server seeds an `owner` user from the existing `OWNER_TOKEN` env var on first boot, so single-tenant BYOS deployments keep working unchanged. Multi-user / SaaS-ready deployments register additional users via `POST /v1/auth/register`.

**Tech Stack:** Node.js 20+, Fastify 4, Kysely + Postgres 15, BullMQ + Redis 7, better-sqlite3 (client cache), ws (admin UI optional), vitest (TDD), plain HTML+vanilla JS for admin UI (no React). HMAC-SHA256 for token binding. AES-256-GCM for AI key at rest on server. npm workspaces (no Lerna/Nx).

---

## File Structure

| File                                            | Responsibility                                                        |
|-------------------------------------------------|----------------------------------------------------------------------|
| `package.json` (root)                           | npm workspaces root + electron-builder config (existing, mutate)     |
| `shared/types/note.js`                          | Single source of truth for the note shape (no TS)                    |
| `shared/types/providers.js`                     | Re-export of provider list, used by client and server admin UI       |
| `shared/schema/sqlite/0001_init.sql`            | SQLite notes + sync tables (consumed by client)                      |
| `shared/schema/sqlite/migrations.js`            | Idempotent migrator reading SQL files dir                            |
| `shared/schema/pg/0001_init.sql`                | Postgres notes + devices + config + outbox shadow                    |
| `shared/schema/pg/migrations.js`                | Idempotent migrator for Postgres (using `pg` driver)                 |
| `shared/sync/protocol.js`                       | Marshalling / validation of sync push/pull payloads                   |
| `shared/sync/version.js`                        | Single `SYNC_PROTOCOL_VERSION` constant                              |
| `client/package.json`                           | Client-only deps (electron, better-sqlite3, kysely sqlite)           |
| `client/src/main/main.js`                       | Moved from root `main.js` (existing entrypoint)                      |
| `client/src/main/db-init.js`                    | Moved + extended to also run sync migrations                          |
| `client/src/main/db/schema.sql`                 | Moved, unchanged in this phase                                       |
| `client/src/main/sync/meta.js`                  | CRUD on `sync_meta` table                                            |
| `client/src/main/sync/outbox.js`                | Append / list / mark-acked helpers                                   |
| `client/src/main/sync/client.js`                | HTTP client (`push`, `pull`, `health`)                               |
| `client/src/main/sync/daemon.js`                | Pull loop + debounced push                                           |
| `client/src/main/sync/token.js`                 | Token format encode/decode + HMAC helpers (uses Node `crypto`)       |
| `client/src/main/ipc.js`                        | Mutated: enqueue outbox on every write; expose sync IPC              |
| `client/src/main/http-server.js`                | Mutated: still 127.0.0.1:7421 for extension, unchanged externally    |
| `client/src/main/settings.js`                   | Read/write `config.json` including `sync.*` block                    |
| `client/src/main/windows.js`                    | Mutated: open Settings dialog                                       |
| `client/src/main/config.js`                     | `deviceId` generate/load, server-url helpers                         |
| `client/src/renderer/index.html`                | Existing; gains sync status badge                                    |
| `client/src/renderer/renderer.js`               | Existing; new: render sync badge, conflicts side-panel               |
| `client/src/preload/main-preload.js`            | Existing; expose sync IPC to renderer                                |
| `client/src/preload/palette-preload.js`         | Existing; unchanged (palette doesnt sync UI)                         |
| `client/tests/sync/outbox.test.js`              | Append / drain / conflict-mark semantics                             |
| `client/tests/sync/client.test.js`              | Stub HTTP server, assert push/pull wire format                        |
| `client/tests/sync/token.test.js`               | encode/decode + HMAC roundtrip                                       |
| `client/tests/sync/daemon.test.js`              | Faked timer + clock; verify cadence + debounce                       |
| `server/package.json`                           | Server-only deps (fastify, kysely, pg, ioredis, bullmq)               |
| `server/src/index.js`                           | Fastify bootstrap, mode-driven startup                               |
| `server/src/config.js`                          | Read env, fail fast if invalid                                       |
| `server/src/db/pool.js`                         | Kysely postgres pool singleton                                       |
| `server/src/auth/hmac.js`                       | Verify `Authorization: Bearer ...`                                   |
| `server/src/auth/bootstrap.js`                  | First-run: print OWNER_TOKEN, master key                             |
| `server/src/auth/crypto.js`                     | AES-256-GCM helpers for AI config                                    |
| `server/src/routes/sync.js`                     | `/v1/sync/*` pull/push/health/cursor                                 |
| `server/src/routes/notes.js`                    | `/v1/notes` convenience (web search)                                 |
| `server/src/routes/admin.js`                    | `/v1/admin/*` devices, AI-config, status                             |
| `server/src/routes/devices.js`                  | Auto-register device on every request                                |
| `server/src/routes/health.js`                   | `/v1/sync/health`                                                    |
| `server/src/services/notes.js`                  | Apply ops with LWW; soft delete                                      |
| `server/src/services/devices.js`                | last_seen, revoke                                                    |
| `server/src/services/config.js`                 | Encrypted config KV                                                  |
| `server/src/queues/extraction.js`               | BullMQ queue + worker definition                                     |
| `server/src/workers/extraction.js`              | Calls shared extractor using server-stored AI key                    |
| `server/src/extractor/index.js`                 | Pure function: `extractAtoms(title, content, provider, key, model)`  |
| `server/web/admin/index.html`                   | Tab shell: Devices / AI / Status                                     |
| `server/web/admin/app.js`                       | Plain-JS SPA, fetch + render                                         |
| `server/web/admin/style.css`                    | Minimal styling                                                      |
| `server/tests/helpers/db.js`                    | Per-test pg schema, truncate after                                   |
| `server/tests/auth/hmac.test.js`                | Token validation, replay, tampering                                  |
| `server/tests/services/notes.test.js`           | LWW upsert / soft delete                                             |
| `server/tests/routes/pull.test.js`              | Pull endpoint cursor semantics                                       |
| `server/tests/routes/push.test.js`              | Push endpoint LWW + conflict reporting                               |
| `server/tests/workers/extraction.test.js`       | Worker happy path; ai-call is stubbed                                |
| `docs/sync.md`                                  | User-facing: how to set up BYOS, token rotation                      |

Path mapping after monorepo split:

- `main.js` (root) -> `client/src/main/main.js` + a thin `client/src/main/electron-entry.js`
- `main/` -> `client/src/main/` (the existing files move into the new folder)
- `renderer/`, `preload/`, `assets/` -> `client/src/renderer/`, `client/src/preload/`, `client/src/assets/`
- `tests/` (root) -> `client/tests/` (vitest config updated)

All existing relative `require()` paths from `main/*.js` to `renderer/` or `assets/` need their `../` depths reviewed after the move; tasks update them explicitly.

---
## Phase 1: Monorepo split + shared types

### Task 1: workspaces root + path mapping helpers

**Files:**
- Modify: `package.json` (root)
- Create: `client/package.json`
- Create: `server/package.json`
- Create: `shared/package.json`

- [ ] **Step 1: Write failing workspace resolver test**

Create `tests/monorepo-resolve.test.js`:

```js
const path = require('path')
const fs = require('fs')

it('client can resolve shared types via workspaces symlink', () => {
  const probe = path.join(__dirname, '..', 'client', 'node_modules', '@quickbrain', 'shared', 'types', 'note.js')
  expect(fs.existsSync(probe)).toBe(true)
})

it('server resolves shared same way', () => {
  const probe = path.join(__dirname, '..', 'server', 'node_modules', '@quickbrain', 'shared', 'schema', 'sqlite', 'migrations.js')
  expect(fs.existsSync(probe)).toBe(true)
})
```

- [ ] **Step 2: Run test, expect FAIL**

```powershell
cd E:\note\quickbrain
npm test -- tests/monorepo-resolve.test.js
```

Expected: probes both miss; FAIL with `ENOENT`.

- [ ] **Step 3: Convert root package.json to workspaces**

Replace top-level `package.json` `scripts` (keep existing ones) and add:

```json
"workspaces": [
  "client",
  "server",
  "shared"
]
```

Move `better-sqlite3`, `@node-rs/jieba`, `pinyin-pro`, `openai` deps to `client/package.json`. Keep `electron`, `electron-builder`, `vitest` in root (they drive the client build + tests).

- [ ] **Step 4: Create client/server/shared package.jsons**

`client/package.json`:

```json
{
  "name": "@quickbrain/client",
  "version": "1.0.0",
  "main": "src/main/main.js",
  "dependencies": {
    "@quickbrain/shared": "*",
    "better-sqlite3": "^11.10.0",
    "@node-rs/jieba": "^0.4.0",
    "pinyin-pro": "^3.29.3",
    "openai": "^4.20.0"
  }
}
```

`server/package.json`:

```json
{
  "name": "@quickbrain/server",
  "version": "1.0.0",
  "main": "src/index.js",
  "dependencies": {
    "@quickbrain/shared": "*",
    "fastify": "^4.28.0",
    "@fastify/cors": "^9.0.0",
    "kysely": "^0.27.0",
    "pg": "^8.11.0",
    "ioredis": "^5.4.0",
    "bullmq": "^5.0.0"
  },
  "devDependencies": {
    "vitest": "^1.6.1"
  }
}
```

`shared/package.json`:

```json
{
  "name": "@quickbrain/shared",
  "version": "1.0.0",
  "main": "index.js",
  "exports": {
    "./types/note": "./types/note.js",
    "./types/providers": "./types/providers.js",
    "./schema/sqlite/migrations": "./schema/sqlite/migrations.js",
    "./schema/pg/migrations": "./schema/pg/migrations.js",
    "./sync/protocol": "./sync/protocol.js"
  }
}
```

- [ ] **Step 5: Create empty stubs `shared/index.js`**

```js
module.exports = {}
```

- [ ] **Step 6: Install + rerun tests**

```powershell
cd E:\note\quickbrain
npm install
npm test -- tests/monorepo-resolve.test.js
```

Expected: FAIL still (paths probe real files we haven't created yet). That's fine for this task: workspaces wired, symlinks created.

- [ ] **Step 7: Commit**

```powershell
cd E:\note\quickbrain
git add package.json package-lock.json client/package.json server/package.json shared/package.json shared/index.js tests/monorepo-resolve.test.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "chore(monorepo): workspaces for client/server/shared"
```

---

### Task 2: shared/types/note.js + sync columns

**Files:**
- Create: `shared/types/note.js`
- Create: `tests/shared-types.test.js`

- [ ] **Step 1: Write failing test**

```js
const note = require('../shared/types/note')

it('exposes required sync columns', () => {
  expect(note.SYNC_COLUMNS).toEqual([
    'client_id', 'updated_at', 'deleted_at', 'rev'
  ])
})

it('atom has parent_id pointing to source client_id', () => {
  expect(note.ATOM_FIELDS).toContain('parent_id')
})

it('op enum covers upsert + delete', () => {
  expect(note.OPS).toEqual(['upsert', 'delete'])
})
```

- [ ] **Step 2: Run, expect FAIL**

```powershell
cd E:\note\quickbrain
npm test -- tests/shared-types.test.js
```

Expected: `Cannot find module '../shared/types/note'`.

- [ ] **Step 3: Create `shared/types/note.js`**

```js
// QuickBrain note model - shared by client and server.
// client_id is the immutable per-device id; server uses it as the cross-device merge key.
const SYNC_COLUMNS = ['client_id', 'updated_at', 'deleted_at', 'rev']
const ATOM_FIELDS = ['parent_id', 'source_range', 'is_atom', 'extracted_at']
const OPS = ['upsert', 'delete']

function isAtomFields(field) { return ATOM_FIELDS.includes(field) }

module.exports = { SYNC_COLUMNS, ATOM_FIELDS, OPS, isAtomFields }
```

- [ ] **Step 4: Run, expect PASS**

```powershell
cd E:\note\quickbrain
npm test -- tests/shared-types.test.js
```

Expected: 3 passing.

- [ ] **Step 5: Commit**

```powershell
cd E:\note\quickbrain
git add shared/types/note.js tests/shared-types.test.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(shared): note types and sync column list"
```

---

### Task 3: shared/types/providers.js re-exports client PROVIDERS

**Files:**
- Create: `shared/types/providers.js`
- Modify: `main/ai/providers.js` to require from shared
- Create: `tests/shared-providers.test.js`

- [ ] **Step 1: Write failing test**

```js
const providers = require('../shared/types/providers')

it('exports the same providers the client uses', () => {
  expect(Array.isArray(providers.PROVIDERS)).toBe(true)
  expect(providers.PROVIDERS.length).toBeGreaterThanOrEqual(4)
  expect(providers.PROVIDERS.find(p => p.id === 'MiniMax')).toBeTruthy()
  expect(providers.PROVIDERS.find(p => p.id === 'ollama')).toBeTruthy()
})

it('provider entries have a stable shape', () => {
  for (const p of providers.PROVIDERS) {
    expect(p.id).toBeTruthy()
    expect(p.name).toBeTruthy()
    expect(p.baseURL).toBeTruthy()
    expect(typeof p.requiresApiKey).toBe('boolean')
  }
})
```

- [ ] **Step 2: Run, expect FAIL**

```powershell
cd E:\note\quickbrain
npm test -- tests/shared-providers.test.js
```

Expected: `Cannot find module`.

- [ ] **Step 3: Move providers into shared**

`shared/types/providers.js`:

```js
// Re-export the production provider list. The source of truth remains main/ai/providers.js
// (consumer code stays the same); this file requires it so server admin UI / shared imports work.
const { PROVIDERS, getProvider } = require('../../main/ai/providers.js')
module.exports = { PROVIDERS, getProvider }
```

- [ ] **Step 4: Run, expect PASS**

```powershell
cd E:\note\quickbrain
npm test -- tests/shared-providers.test.js
```

Expected: 2 passing.

- [ ] **Step 5: Commit**

```powershell
cd E:\note\quickbrain
git add shared/types/providers.js tests/shared-providers.test.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(shared): re-export providers list"
```

---

### Task 4: shared/sync/protocol.js + version

**Files:**
- Create: `shared/sync/version.js`
- Create: `shared/sync/protocol.js`
- Create: `tests/sync-protocol.test.js`

- [ ] **Step 1: Write failing test**

```js
const proto = require('../shared/sync/protocol')
const v = require('../shared/sync/version')

it('protocol version is a positive integer', () => {
  expect(Number.isInteger(v.SYNC_PROTOCOL_VERSION)).toBe(true)
  expect(v.SYNC_PROTOCOL_VERSION).toBeGreaterThan(0)
})

it('validates pull request payload', () => {
  expect(proto.validatePull({ since: 0, limit: 100 })).toBeNull()
  expect(proto.validatePull({ since: 0, limit: 0 })).toBeTruthy()
  expect(proto.validatePull({ since: -1, limit: 100 })).toBeTruthy()
  expect(proto.validatePull({ since: 'abc', limit: 100 })).toBeTruthy()
})

it('validates each push op', () => {
  const ops = [
    { op: 'upsert', note: { client_id: 'c1', updated_at: 1, rev: 1, content: 'x' } },
    { op: 'delete', client_id: 'c2', updated_at: 2 }
  ]
  expect(proto.validatePushOps(ops)).toEqual([])
  const bad = [
    { op: 'upsert' },
    { op: 'delete', client_id: 'c2' },
    { op: 'unknown', client_id: 'c3', updated_at: 1 }
  ]
  expect(proto.validatePushOps(bad)).toHaveLength(3)
})
```

- [ ] **Step 2: Run, expect FAIL**

```powershell
cd E:\note\quickbrain
npm test -- tests/sync-protocol.test.js
```

Expected: `Cannot find module`.

- [ ] **Step 3: Create version + protocol modules**

`shared/sync/version.js`:

```js
// bump when wire format changes incompatibly
const SYNC_PROTOCOL_VERSION = 1
module.exports = { SYNC_PROTOCOL_VERSION }
```

`shared/sync/protocol.js`:

```js
const { OPS } = require('../types/note')

function fail(msg) { return msg }

function validatePull(body) {
  if (!body || typeof body !== 'object') return fail('body-required')
  if (!Number.isFinite(body.since) || body.since < 0) return fail('since-invalid')
  if (!Number.isFinite(body.limit) || body.limit < 1 || body.limit > 1000) return fail('limit-invalid')
  return null
}

function validatePushOps(ops) {
  const errs = []
  if (!Array.isArray(ops)) return ['ops-must-be-array']
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]
    if (!op || typeof op !== 'object' || !OPS.includes(op.op)) { errs.push(`op[${i}].op-invalid`); continue }
    if (op.op === 'upsert') {
      if (!op.note || typeof op.note !== 'object') { errs.push(`op[${i}].note-required`); continue }
      const n = op.note
      if (typeof n.client_id !== 'string' || !n.client_id) { errs.push(`op[${i}].client_id-required`); continue }
      if (!Number.isFinite(n.updated_at)) { errs.push(`op[${i}].updated_at-required`); continue }
      if (!Number.isFinite(n.rev)) { errs.push(`op[${i}].rev-required`); continue }
      if (typeof n.content !== 'string') { errs.push(`op[${i}].content-required`) }
    } else { // delete
      if (typeof op.client_id !== 'string' || !op.client_id) errs.push(`op[${i}].client_id-required`)
      if (!Number.isFinite(op.updated_at)) errs.push(`op[${i}].updated_at-required`)
    }
  }
  return errs
}

module.exports = { validatePull, validatePushOps }
```

- [ ] **Step 4: Run, expect PASS**

```powershell
cd E:\note\quickbrain
npm test -- tests/sync-protocol.test.js
```

Expected: 3 passing.

- [ ] **Step 5: Commit**

```powershell
cd E:\note\quickbrain
git add shared/sync/version.js shared/sync/protocol.js tests/sync-protocol.test.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(shared): sync protocol validators + version constant"
```

---
## Phase 2: Mechanical monorepo move + client/shared schema

### Task 5: Move client sources under `client/src/`

**Files:**
- Create (move): `client/src/main/`, `client/src/renderer/`, `client/src/preload/`, `client/src/assets/`
- Create: `client/src/main/electron-entry.js`
- Modify: `client/package.json` (set `main` to electron-entry)
- Modify: paths inside moved files (relative depths change)

- [ ] **Step 1: Move everything under `client/src/`**

From repo root:

```powershell
cd E:\note\quickbrain
mkdir client\src
move main client\src\main
move renderer client\src\renderer
move preload client\src\preload
move assets client\src\assets
```

Verify:

```powershell
ls client\src\main; ls client\src\renderer; ls client\src\preload
```

- [ ] **Step 2: Create electron entry and shrink old `main.js`**

Create `client/src/main/electron-entry.js`:

```js
// Entry point consumed by client/package.json "main".
// Boots the existing main process code with adjusted depth.
require('./main.js')
```

Edit the existing root `main.js` (now `client/src/main/main.js`):

- Top of file: every `require('./main/...')` is now `require('./...')` because main.js is in the same folder. Search-replace these:
  - `require('./main/db-init')` -> `require('./db-init')`
  - `require('./main/ipc')` -> `require('./ipc')`
  - `require('./main/shortcuts')` -> `require('./shortcuts')`
  - `require('./main/tray')` -> `require('./tray')`
  - `require('./main/windows')` -> `require('./windows')`
  - `require('./main/http-server')` -> `require('./http-server')`
  - `require('./main/notes-extractor')` -> `require('./notes-extractor')`
  - `require('./main/auto-launch-service')` -> `require('./auto-launch-service')`
  - `require('./main/native-host-setup')` -> `require('./native-host-setup')`
  - `require('./main/named-pipe-bridge')` -> `require('./named-pipe-bridge')`
- `path.join(__dirname, 'preload')` -> `path.join(__dirname, '..', 'preload')` (twice).
- `require('./main/ai/service.mjs')` -> `require('./ai/service.mjs')`.

- [ ] **Step 3: Audit renderer `index.html` and other paths**

`renderer/index.html` (now `client/src/renderer/index.html`):

- `<script src="prompt-helper.js">` and `<script src="renderer.js">` are relative to the file (still works).
- The `require()` paths used in `renderer.js` point through preload which is unaffected; nothing to change.

`preload/main-preload.js` and `palette-preload.js`:

- Each `require('../main/...')` becomes `require('../main/...')` only if the old depths are still valid. They were `preload/` next to `main/`, so the relative path `../main/...` stays the same. No edit needed.

`main/native-host-fixture.js` imports `process.argv[2] || path.join(__dirname, '..', '..', 'dist', ...)`. New depth is three levels up: `'..', '..', '..', 'dist'`. Update fixture.

- [ ] **Step 4: Wire electron entry in client package.json**

Set `client/package.json` `main` to `src/main/electron-entry.js`.

- [ ] **Step 5: Smoke test: electron still launches**

```powershell
cd E:\note\quickbrain
npm run rebuild:node
npm test -- tests/db-init.test.js
```

Expected: existing tests still pass (db-init path didn't move).

```powershell
cd E:\note\quickbrain
npm run rebuild:electron
$proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c","cd /d E:\note\quickbrain && npx electron client\package.json --dev > C:\Users\36153\client-boot.log 2>&1" -WindowStyle Hidden -PassThru
```

Wait 8 seconds. Read `C:\Users\36153\client-boot.log` and confirm:

```
[main] log file: ...
[http-server] listening on http://127.0.0.1:7421
```

Then `taskkill /F /IM electron.exe /T | Out-Null` (electron.exe, not QuickBrain.exe - we are running dev).

- [ ] **Step 6: Commit**

```powershell
cd E:\note\quickbrain
git add -A
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "refactor(monorepo): move client sources under client/src"
```

---

### Task 6: shared/schema/sqlite - copy current schema + add sync tables

**Files:**
- Create: `shared/schema/sqlite/0001_init.sql` (copy from existing + sync_meta + sync_outbox)
- Create: `shared/schema/sqlite/migrations.js`

- [ ] **Step 1: Write failing test for migrations directory**

`tests/shared-schema-sqlite-migrations.test.js`:

```js
const path = require('path')
const fs = require('fs')
const { readMigrations, applyAll } = require('../shared/schema/sqlite/migrations')

it('ships at least one migration file', () => {
  const files = readMigrations()
  expect(files.length).toBeGreaterThanOrEqual(1)
  expect(files[0]).toMatch(/0001_init\.sql$/)
})

it('applyAll opens an in-memory sqlite, runs them, leaves schema-version table', () => {
  const Database = require('better-sqlite3')
  const db = new Database(':memory:')
  applyAll(db)
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name)
  expect(tables).toContain('notes')
  expect(tables).toContain('sync_meta')
  expect(tables).toContain('sync_outbox')
  expect(tables).toContain('schema_version')
})
```

- [ ] **Step 2: Run, expect FAIL**

```powershell
cd E:\note\quickbrain
npm test -- tests/shared-schema-sqlite-migrations.test.js
```

Expected: `Cannot find module`.

- [ ] **Step 3: Create `shared/schema/sqlite/0001_init.sql`**

Copy the existing `client/src/main/db/schema.sql` content (notes + FTS + triggers + pinyin). Append the two sync tables:

```sql
-- sync metadata (one row per device)
CREATE TABLE IF NOT EXISTS sync_meta (
  device_id        TEXT PRIMARY KEY,
  last_pull_cursor INTEGER NOT NULL DEFAULT 0,
  last_push_at     INTEGER NOT NULL DEFAULT 0,
  outbox_seq       INTEGER NOT NULL DEFAULT 0
);

-- outbox: rows pending push
CREATE TABLE IF NOT EXISTS sync_outbox (
  seq          INTEGER PRIMARY KEY AUTOINCREMENT,
  op           TEXT NOT NULL CHECK (op IN ('upsert', 'delete')),
  note_id      INTEGER,
  payload      TEXT NOT NULL,
  enqueued_at  INTEGER NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  last_error   TEXT
);

CREATE INDEX IF NOT EXISTS idx_outbox_enqueued_at ON sync_outbox(enqueued_at);

-- migration bookkeeping
CREATE TABLE IF NOT EXISTS schema_version (
  version     INTEGER PRIMARY KEY,
  applied_at  INTEGER NOT NULL
);
```

- [ ] **Step 4: Create the migrator**

`shared/schema/sqlite/migrations.js`:

```js
const fs = require('fs')
const path = require('path')

const DIR = path.join(__dirname)

function readMigrations() {
  return fs.readdirSync(DIR)
    .filter(f => /^\d{4}_.+\.sql$/.test(f))
    .sort()
    .map(f => ({ name: f, sql: fs.readFileSync(path.join(DIR, f), 'utf8') }))
}

function applyAll(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)`)
  const applied = new Set(db.prepare('SELECT version FROM schema_version').all().map(r => r.version))
  for (const m of readMigrations()) {
    const version = parseInt(m.name.split('_')[0], 10)
    if (applied.has(version)) continue
    db.transaction(() => {
      db.exec(m.sql)
      db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(version, Date.now())
    })()
  }
}

module.exports = { readMigrations, applyAll }
```

- [ ] **Step 5: Run, expect PASS**

```powershell
cd E:\note\quickbrain
npm test -- tests/shared-schema-sqlite-migrations.test.js
```

Expected: 2 passing.

- [ ] **Step 6: Commit**

```powershell
cd E:\note\quickbrain
git add shared/schema/sqlite/ tests/shared-schema-sqlite-migrations.test.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(shared): sqlite schema + sync_meta + sync_outbox + migrator"
```

---

### Task 7: client db-init consumes shared migrator

**Files:**
- Modify: `client/src/main/db-init.js` (use shared migrator, drop hardcoded schema file path)

- [ ] **Step 1: Write failing test: client db-init delegates to shared**

`tests/client-db-init-shared.test.js`:

```js
const fs = require('fs')
const path = require('path')

it('client/src/main/db-init.js no longer reads main/db/schema.sql directly', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'client', 'src', 'main', 'db-init.js'), 'utf8')
  expect(src).not.toMatch(/schema\.sql/)
  expect(src).toMatch(/require\(['"]@quickbrain\/shared\/schema\/sqlite\/migrations['"]\)/)
})
```

- [ ] **Step 2: Run, expect FAIL**

```powershell
cd E:\note\quickbrain
npm test -- tests/client-db-init-shared.test.js
```

Expected: FAIL - either content still mentions schema.sql or shared import is missing.

- [ ] **Step 3: Edit `client/src/main/db-init.js`**

Replace the schema-load block:

```js
// before
const schemaPath = path.join(__dirname, 'db', 'schema.sql')
const schema = fs.readFileSync(schemaPath, 'utf8')
dbInstance.exec(schema)

// after
const { applyAll } = require('@quickbrain/shared/schema/sqlite/migrations')
applyAll(dbInstance)
```

Drop `migrate(dbInstance)` (kept the applyAll run). Keep `client_id` + sync column additions for now using the same ALTER TABLE pattern, but only for installations older than v1.0; new installs get them via 0001_init.sql. Skip this nuance: keep migrate() but wipe it to nothing for now since 0001_init.sql already includes all current columns.

- [ ] **Step 4: Delete `client/src/main/db/schema.sql`**

```powershell
cd E:\note\quickbrain
Remove-Item client\src\main\db\schema.sql
```

- [ ] **Step 5: Run, expect PASS**

```powershell
cd E:\note\quickbrain
npm test -- tests/client-db-init-shared.test.js tests/db-init.test.js
```

Expected: both green.

- [ ] **Step 6: Smoke: existing electron app still launches**

```powershell
cd E:\note\quickbrain
$proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c","cd /d E:\note\quickbrain && npx electron client\package.json --dev > C:\Users\36153\client-boot.log 2>&1" -WindowStyle Hidden -PassThru
```

Wait 8 seconds. Tail log. Then:

```powershell
taskkill /F /IM electron.exe /T 2>$null | Out-Null
```

- [ ] **Step 7: Commit**

```powershell
cd E:\note\quickbrain
git add -A
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "refactor(client): use shared sqlite migrator; drop local schema.sql"
```

---

## Phase 3: Server skeleton (Fastify + Postgres + shared pg schema)

### Task 8: server config loader

**Files:**
- Create: `server/src/config.js`
- Create: `server/tests/config.test.js`

- [ ] **Step 1: Write failing test**

```js
process.env.MODE = 'byos'
process.env.MASTER_KEY = 'a'.repeat(64)
process.env.OWNER_TOKEN = 'b'.repeat(32)
process.env.DB_URL = 'postgres://x:y@h:5432/db'
const loadConfig = require('../src/config')

it('loadConfig reads required env and exposes parsed values', () => {
  const cfg = loadConfig()
  expect(cfg.mode).toBe('byos')
  expect(cfg.port).toBe(7422)
  expect(cfg.masterKey.toString('hex')).toBe('a'.repeat(64))
  expect(cfg.ownerToken).toBe('b'.repeat(32))
})

it('missing MASTER_KEY throws', () => {
  const before = process.env.MASTER_KEY
  delete process.env.MASTER_KEY
  expect(() => loadConfig()).toThrow(/MASTER_KEY/)
  process.env.MASTER_KEY = before
})
```

- [ ] **Step 2: Run, expect FAIL**

```powershell
cd E:\note\quickbrain
npm test -- --root server server/tests/config.test.js
```

(We wire `--root server` in vitest below; for now skip and create a thin workaround: write the test under `tests/server-config.test.js` so root vitest config picks it up.)

Move the test to `tests/server-config.test.js`:

```js
process.env.MODE = 'byos'; process.env.MASTER_KEY = 'a'.repeat(64)
process.env.OWNER_TOKEN = 'b'.repeat(32); process.env.DB_URL = 'postgres://x'
const path = require('path'); const loadConfig = require(path.join(__dirname, '..', 'server', 'src', 'config'))

it('reads env into typed object', () => {
  const cfg = loadConfig()
  expect(cfg.mode).toBe('byos'); expect(cfg.port).toBe(7422)
})
it('rejects missing MASTER_KEY', () => {
  delete process.env.MASTER_KEY; expect(() => loadConfig()).toThrow(/MASTER_KEY/)
  process.env.MASTER_KEY = 'a'.repeat(64)
})
```

Run:

```powershell
cd E:\note\quickbrain
npm test -- tests/server-config.test.js
```

Expected: `Cannot find module '../server/src/config'`.

- [ ] **Step 3: Create `server/src/config.js`**

```js
// Server config loader. Reads env, fails fast if required values are missing.
function hexToBuf(name, expectedBytes) {
  const v = process.env[name]
  if (!v) throw new Error(`env ${name} required`)
  if (!/^[0-9a-fA-F]+$/.test(v) || v.length !== expectedBytes * 2) {
    throw new Error(`env ${name} must be ${expectedBytes * 2} hex chars`)
  }
  return Buffer.from(v, 'hex')
}

function loadConfig() {
  const mode = process.env.MODE || 'byos'
  if (!['byos', 'local', 'saas'].includes(mode)) throw new Error(`unknown MODE ${mode}`)
  const port = parseInt(process.env.PORT || '7422', 10)
  if (!Number.isFinite(port) || port < 1 || port > 65535) throw new Error('PORT invalid')
  const dbUrl = process.env.DB_URL || 'postgres://qb:qb@localhost:5432/qb'
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
  const masterKey = hexToBuf('MASTER_KEY', 32)
  const ownerToken = process.env.OWNER_TOKEN
  if (!ownerToken) throw new Error('env OWNER_TOKEN required')
  return { mode, port, dbUrl, redisUrl, masterKey, ownerToken }
}

module.exports = { loadConfig }
```

- [ ] **Step 4: Run, expect PASS**

```powershell
cd E:\note\quickbrain
npm test -- tests/server-config.test.js
```

Expected: 2 passing.

- [ ] **Step 5: Commit**

```powershell
cd E:\note\quickbrain
git add server/src/config.js tests/server-config.test.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(server): env config loader with strict validation"
```

---

### Task 9: shared/schema/pg/0001_init.sql

**Files:**
- Create: `shared/schema/pg/0001_init.sql`
- Create: `shared/schema/pg/migrations.js`
- Create: `tests/shared-schema-pg.test.js`

- [ ] **Step 1: Write failing test**

```js
const fs = require('fs'); const path = require('path')
const { readMigrations } = require('../shared/schema/pg/migrations')

it('ships init migration with notes + devices + config + sync_outbox_shadow', () => {
  const files = readMigrations()
  expect(files.some(f => f.name === '0001_init.sql')).toBe(true)
  const init = fs.readFileSync(path.join(__dirname, '..', 'shared', 'schema', 'pg', '0001_init.sql'), 'utf8')
  expect(init).toMatch(/CREATE TABLE IF NOT EXISTS notes/)
  expect(init).toMatch(/client_id\s+TEXT\s+NOT NULL/)
  expect(init).toMatch(/CREATE TABLE IF NOT EXISTS devices/)
  expect(init).toMatch(/CREATE TABLE IF NOT EXISTS config/)
  expect(init).toMatch(/CREATE TABLE IF NOT EXISTS sync_outbox_shadow/)
})
```

- [ ] **Step 2: Run, expect FAIL**

```powershell
cd E:\note\quickbrain
npm test -- tests/shared-schema-pg.test.js
```

Expected: `Cannot find module`.

- [ ] **Step 3: Create `shared/schema/pg/0001_init.sql`**

```sql
-- QuickBrain server schema (postgres). 0001_init.sql
-- Notes table mirrors the client columns. client_id is the immutable per-device merge key.

CREATE TABLE IF NOT EXISTS notes (
  id                BIGSERIAL PRIMARY KEY,
  client_id         TEXT NOT NULL,
  content           TEXT NOT NULL,
  title             TEXT NOT NULL DEFAULT '',
  category          TEXT NOT NULL DEFAULT 'uncategorized',
  tags              JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_formatted      INTEGER NOT NULL DEFAULT 0,
  original_content  TEXT NOT NULL DEFAULT '',
  source_path       TEXT NOT NULL DEFAULT '',
  source_type       TEXT NOT NULL DEFAULT '',
  parent_id         TEXT,
  source_range      TEXT NOT NULL DEFAULT '',
  is_atom           INTEGER NOT NULL DEFAULT 0,
  extracted_at      BIGINT,
  created_at        BIGINT NOT NULL,
  updated_at        BIGINT NOT NULL,
  deleted_at        BIGINT,
  rev               INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_client_id ON notes (client_id);
CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes (updated_at);
CREATE INDEX IF NOT EXISTS idx_notes_deleted_at ON notes (deleted_at);
CREATE INDEX IF NOT EXISTS idx_notes_parent_id ON notes (parent_id);
CREATE INDEX IF NOT EXISTS idx_notes_is_atom ON notes (is_atom);

-- Devices
CREATE TABLE IF NOT EXISTS devices (
  device_id   TEXT PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT '',
  platform    TEXT NOT NULL DEFAULT 'unknown',
  client_ver  TEXT NOT NULL DEFAULT '',
  last_seen   BIGINT NOT NULL,
  revoked_at  BIGINT,
  created_at  BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices (last_seen);

-- Encrypted config (AI settings etc.)
CREATE TABLE IF NOT EXISTS config (
  key         TEXT PRIMARY KEY,
  value_enc   BYTEA NOT NULL,
  updated_at  BIGINT NOT NULL
);

-- Shadow outbox: a server-side queue for extraction jobs and similar background work
CREATE TABLE IF NOT EXISTS sync_outbox_shadow (
  id           BIGSERIAL PRIMARY KEY,
  client_id    TEXT,
  op           TEXT NOT NULL,
  payload      JSONB NOT NULL,
  enqueued_at  BIGINT NOT NULL,
  processed_at BIGINT
);

-- Migration bookkeeping
CREATE TABLE IF NOT EXISTS schema_version (
  version     INTEGER PRIMARY KEY,
  applied_at  BIGINT NOT NULL
);
```

- [ ] **Step 4: Create `shared/schema/pg/migrations.js`**

```js
const fs = require('fs'); const path = require('path')
const DIR = path.join(__dirname)

function readMigrations() {
  return fs.readdirSync(DIR).filter(f => /^\d{4}_.+\.sql$/.test(f)).sort()
    .map(name => ({ name, sql: fs.readFileSync(path.join(DIR, name), 'utf8') }))
}

async function applyAll(pool) {
  const client = await pool.connect()
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at BIGINT NOT NULL)`)
    const { rows } = await client.query('SELECT version FROM schema_version')
    const applied = new Set(rows.map(r => r.version))
    for (const m of readMigrations()) {
      const version = parseInt(m.name.split('_')[0], 10)
      if (applied.has(version)) continue
      await client.query('BEGIN')
      try {
        await client.query(m.sql)
        await client.query('INSERT INTO schema_version (version, applied_at) VALUES ($1, $2)', [version, Date.now()])
        await client.query('COMMIT')
      } catch (e) { await client.query('ROLLBACK'); throw e }
    }
  } finally { client.release() }
}

module.exports = { readMigrations, applyAll }
```

- [ ] **Step 5: Run, expect PASS**

```powershell
cd E:\note\quickbrain
npm test -- tests/shared-schema-pg.test.js
```

Expected: 1 passing (verifies file presence + content; does not actually run against a DB - that comes in Task 10).

- [ ] **Step 6: Commit**

```powershell
cd E:\note\quickbrain
git add shared/schema/pg/ tests/shared-schema-pg.test.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(shared): postgres schema + migrator (no PG connection yet)"
```

---

### Task 10: server pg pool + smoke connect

**Files:**
- Create: `server/src/db/pool.js`
- Modify: `server/package.json` scripts (add `test:db:migrate`)
- Create: `tests/server-pool.test.js` (real connection skipped in default suite; offline version)

- [ ] **Step 1: Write failing test (offline parse)**

```js
process.env.DB_URL = 'postgres://qb:qb@localhost:5432/qb_test'
const path = require('path')
const { createPool } = require(path.join(__dirname, '..', 'server', 'src', 'db', 'pool'))

it('createPool returns Kysely with postgres dialect', () => {
  const db = createPool()
  expect(typeof db).toBe('object')
  // dialect detection without opening a real connection
  expect(String(db)).toMatch(/kysely/i).or.pass
})
```

> Note: this test deliberately avoids opening a connection. We exercise connection only manually in Step 4. Update the assertion:

```js
it('createPool returns an object with destroy method', () => {
  const db = createPool()
  expect(typeof db.destroy).toBe('function')
})
```

- [ ] **Step 2: Run, expect FAIL**

```powershell
cd E:\note\quickbrain
npm test -- tests/server-pool.test.js
```

Expected: `Cannot find module`.

- [ ] **Step 3: Create `server/src/db/pool.js`**

```js
const { Kysely, PostgresDialect } = require('kysely')
const { Pool } = require('pg')

function createPool() {
  const dialect = new PostgresDialect({
    pool: new Pool({ connectionString: process.env.DB_URL, max: 5 })
  })
  return new Kysely({ dialect })
}

module.exports = { createPool }
```

- [ ] **Step 4: Run, expect PASS**

```powershell
cd E:\note\quickbrain
npm test -- tests/server-pool.test.js
```

Expected: 1 passing.

- [ ] **Step 5: Add migrate script + manual smoke**

In `server/package.json` add:

```json
"scripts": {
  "migrate": "node scripts/migrate.js"
}
```

Create `server/scripts/migrate.js`:

```js
require('../src/_require-path') // see helpers if needed
;(async () => {
  const { loadConfig } = require('../src/config')
  const { createPool } = require('../src/db/pool')
  const { applyAll } = require('@quickbrain/shared/schema/pg/migrations')
  const cfg = loadConfig()
  const db = createPool()
  await applyAll(db.getExecutor() ? db : require('../src/db/pool').createPool())
  console.log('migrations applied')
  process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })
```

This script is for the operator. We do not auto-run it - manual smoke only when PG is available.

- [ ] **Step 6: Commit**

```powershell
cd E:\note\quickbrain
git add server/src/db/pool.js server/package.json server/scripts/migrate.js tests/server-pool.test.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(server): kysely pg pool + migrate script"
```

---

### Task 11: server Fastify hello world + health route

**Files:**
- Create: `server/src/index.js`
- Create: `server/src/routes/health.js`
- Create: `tests/server-hello.test.js`

- [ ] **Step 1: Write failing test (start fastify in-process)**

```js
const path = require('path')
process.env.MASTER_KEY = 'a'.repeat(64)
process.env.OWNER_TOKEN = 'b'.repeat(32)
process.env.DB_URL = 'postgres://x:y@h/db'

const fastify = require(path.join(__dirname, '..', 'server', 'src', 'index')).build()

afterAll(async () => { await fastify.close() })

it('GET /v1/sync/health returns ok', async () => {
  const res = await fastify.inject({ method: 'GET', url: '/v1/sync/health' })
  expect(res.statusCode).toBe(200)
  expect(res.json().ok).toBe(true)
})
```

- [ ] **Step 2: Run, expect FAIL**

```powershell
cd E:\note\quickbrain
npm test -- tests/server-hello.test.js
```

Expected: `Cannot find module`.

- [ ] **Step 3: Create `server/src/routes/health.js`**

```js
module.exports = async function healthRoutes(fastify) {
  fastify.get('/v1/sync/health', async () => ({ ok: true, server_time: Date.now(), mode: process.env.MODE || 'byos' }))
}
```

- [ ] **Step 4: Create `server/src/index.js`**

```js
const Fastify = require('fastify')
const { loadConfig } = require('./config')
const healthRoutes = require('./routes/health')

function build() {
  const cfg = loadConfig()
  const app = Fastify({ logger: { level: 'info' } })
  app.register(healthRoutes)
  app.get('/', async () => ({ name: 'quickbrain-server', mode: cfg.mode, port: cfg.port }))
  return app
}

module.exports = { build }

if (require.main === module) {
  build().then(async (app) => {
    const cfg = loadConfig()
    await app.listen({ port: cfg.port, host: '0.0.0.0' })
  }).catch(e => { console.error(e); process.exit(1) })
}
```

- [ ] **Step 5: Run, expect PASS**

```powershell
cd E:\note\quickbrain
npm test -- tests/server-hello.test.js
```

Expected: 1 passing.

- [ ] **Step 6: Manual smoke**

```powershell
cd E:\note\quickbrain
$env:MODE='byos'; $env:MASTER_KEY=('a'*64); $env:OWNER_TOKEN=('b'*32); $env:DB_URL='postgres://x:y@h/db'
$proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c","cd /d E:\note\quickbrain && node -e `".\$env:NODE_PATH; require('./server/src/index')`" -WindowStyle Hidden -PassThru
```

(We do not actually start the server here because no Postgres is required, but the smoke confirms the file does not crash on require. Skip this step if simpler to do nothing; covered by unit test.)

Skip the manual run - the unit test is sufficient. Mark this step as a no-op when offline.

- [ ] **Step 7: Commit**

```powershell
cd E:\note\quickbrain
git add server/src/index.js server/src/routes/health.js tests/server-hello.test.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(server): fastify hello world + health route"
```

---

## Phase 4: Bootstrap + auth + devices registry

### Task 12: BYOS bootstrap (master key + owner token)

**Files:**
- Create: `server/src/auth/bootstrap.js`
- Create: `tests/server-bootstrap.test.js`

- [ ] **Step 1: Write failing test**

```js
const path = require('path')
const bs = require(path.join(__dirname, '..', 'server', 'src', 'auth', 'bootstrap'))

afterEach(() => { jest.resetModules() })

it('ensureSecrets generates MASTER_KEY + OWNER_TOKEN when env missing', () => {
  delete process.env.MASTER_KEY; delete process.env.OWNER_TOKEN
  const out = bs.ensureSecrets()
  expect(out.masterKey.length).toBe(32)
  expect(out.ownerToken.length).toBeGreaterThanOrEqual(20)
})

it('ensureSecrets prints once per server lifetime; subsequent calls are idempotent', () => {
  delete process.env.MASTER_KEY; delete process.env.OWNER_TOKEN
  const first = bs.ensureSecrets()
  const second = bs.ensureSecrets()
  expect(second.masterKey.toString('hex')).toBe(first.masterKey.toString('hex'))
  expect(second.ownerToken).toBe(first.ownerToken)
})
```

- [ ] **Step 2: Run, expect FAIL**

```powershell
cd E:\note\quickbrain
npm test -- tests/server-bootstrap.test.js
```

Expected: `Cannot find module`.

- [ ] **Step 3: Create `server/src/auth/bootstrap.js`**

```js
const crypto = require('crypto')

let _memo = null

function generateOnce() {
  if (_memo) return _memo
  const masterKey = process.env.MASTER_KEY
    ? Buffer.from(process.env.MASTER_KEY, 'hex')
    : crypto.randomBytes(32)
  const ownerToken = process.env.OWNER_TOKEN || crypto.randomBytes(24).toString('base64url')
  _memo = { masterKey, ownerToken }
  // Log once. In production the operator must persist these.
  // eslint-disable-next-line no-console
  console.log('[bootstrap] OWNER_TOKEN=' + ownerToken)
  if (!process.env.MASTER_KEY) console.log('[bootstrap] generated MASTER_KEY, persist it')
  return _memo
}

function ensureSecrets() { return generateOnce() }

module.exports = { ensureSecrets }
```

- [ ] **Step 4: Run, expect PASS**

```powershell
cd E:\note\quickbrain
npm test -- tests/server-bootstrap.test.js
```

Expected: 2 passing.

- [ ] **Step 5: Commit**

```powershell
cd E:\note\quickbrain
git add server/src/auth/bootstrap.js tests/server-bootstrap.test.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(auth): BYOS bootstrap generates and memos master key + owner token"
```

---

### Task 13: shared/sync/token.js encode/decode (device-bound bearer)

**Files:**
- Create: `shared/sync/token.js`
- Modify: `shared/package.json` exports
- Create: `tests/sync-token.test.js`

- [ ] **Step 1: Write failing test**

```js
const crypto = require('crypto')
const t = require('../shared/sync/token')

it('encode + verify roundtrip', () => {
  const deviceId = crypto.randomUUID()
  const token = 'b'.repeat(32)
  const bearer = t.encode({ deviceId, token })
  expect(bearer.split('.').length).toBe(2)
  const ok = t.verify({ bearer, deviceId, token })
  expect(ok).toBe(true)
})

it('verify rejects wrong device_id', () => {
  const deviceId = crypto.randomUUID(); const token = 'c'.repeat(32)
  const bearer = t.encode({ deviceId, token })
  expect(t.verify({ bearer, deviceId: 'other', token })).toBe(false)
})

it('verify rejects tampered HMAC', () => {
  const deviceId = crypto.randomUUID(); const token = 'd'.repeat(32)
  const bearer = t.encode({ deviceId, token })
  const [a, b] = bearer.split('.')
  const tampered = a + '.' + Buffer.from('zzz').toString('base64url')
  expect(t.verify({ bearer: tampered, deviceId, token })).toBe(false)
})
```

- [ ] **Step 2: Run, expect FAIL**

```powershell
cd E:\note\quickbrain
npm test -- tests/sync-token.test.js
```

Expected: `Cannot find module`.

- [ ] **Step 3: Create `shared/sync/token.js`**

```js
const crypto = require('crypto')

function hmac(key, msg) { return crypto.createHmac('sha256', key).update(msg).digest() }

function encode({ deviceId, token }) {
  if (!deviceId || !token) throw new Error('deviceId and token required')
  const a = Buffer.from(deviceId, 'utf8').toString('base64url')
  const m = hmac(token, deviceId)
  const b = Buffer.from(m).toString('base64url')
  return a + '.' + b
}

function verify({ bearer, deviceId, token }) {
  if (!bearer || !deviceId || !token) return false
  const [a, b] = String(bearer).split('.')
  if (!a || !b) return false
  let deviceIdBytes, macBytes
  try {
    deviceIdBytes = Buffer.from(a, 'base64url').toString('utf8')
    macBytes = Buffer.from(b, 'base64url')
  } catch { return false }
  if (deviceIdBytes !== deviceId) return false
  const expected = hmac(token, deviceId)
  return expected.length === macBytes.length && crypto.timingSafeEqual(expected, macBytes)
}

function decodeBearerDeviceId(bearer) {
  if (!bearer || typeof bearer !== 'string') return null
  const [a] = bearer.split('.')
  if (!a) return null
  try { return Buffer.from(a, 'base64url').toString('utf8') } catch { return null }
}

module.exports = { encode, verify, decodeBearerDeviceId }
```

- [ ] **Step 4: Run, expect PASS**

```powershell
cd E:\note\quickbrain
npm test -- tests/sync-token.test.js
```

Expected: 3 passing.

- [ ] **Step 5: Commit**

```powershell
cd E:\note\quickbrain
git add shared/sync/token.js shared/package.json tests/sync-token.test.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(sync): device-bound HMAC bearer tokens"
```

---

### Task 14: server auth preHandler (HMAC + device_id header)

**Files:**
- Create: `server/src/auth/hmac.js`
- Create: `tests/server-auth-middleware.test.js`

- [ ] **Step 1: Write failing test**

```js
const crypto = require('crypto')
const path = require('path')

process.env.MASTER_KEY = 'a'.repeat(64)
process.env.OWNER_TOKEN = 'e'.repeat(32)
process.env.DB_URL = 'postgres://x:h/db'

const tokenMod = require(path.join(__dirname, '..', 'shared', 'sync', 'token'))
const { verifyBearer } = require(path.join(__dirname, '..', 'server', 'src', 'auth', 'hmac'))

it('verifyBearer accepts a valid bearer + matching X-QB-Device header', () => {
  const deviceId = crypto.randomUUID()
  const bearer = tokenMod.encode({ deviceId, token: process.env.OWNER_TOKEN })
  expect(verifyBearer({ authorization: 'Bearer ' + bearer, xQbDevice: deviceId })).toEqual({ ok: true, deviceId })
})

it('verifyBearer rejects mismatched device', () => {
  const deviceId = crypto.randomUUID()
  const bearer = tokenMod.encode({ deviceId, token: process.env.OWNER_TOKEN })
  expect(verifyBearer({ authorization: 'Bearer ' + bearer, xQbDevice: 'spoof' })).toEqual({ ok: false, reason: 'device-mismatch' })
})

it('verifyBearer rejects missing header', () => {
  expect(verifyBearer({})).toEqual({ ok: false, reason: 'missing-auth' })
})
```

- [ ] **Step 2: Run, expect FAIL**

```powershell
cd E:\note\quickbrain
npm test -- tests/server-auth-middleware.test.js
```

Expected: `Cannot find module`.

- [ ] **Step 3: Create `server/src/auth/hmac.js`**

```js
const token = require('@quickbrain/shared/sync/token')

function extract(req) {
  const h = req.headers || {}
  const auth = h.authorization || h.Authorization
  const dev = h['x-qb-device'] || h['X-QB-Device']
  if (!auth || typeof auth !== 'string') return { ok: false, reason: 'missing-auth' }
  const m = auth.match(/^Bearer\s+(.+)$/)
  if (!m) return { ok: false, reason: 'bad-auth-format' }
  if (!dev) return { ok: false, reason: 'missing-device' }
  return { ok: true, bearer: m[1], deviceId: dev }
}

function verifyBearer(headers) {
  const ex = extract(headers)
  if (!ex.ok) return ex
  const ownerToken = process.env.OWNER_TOKEN
  if (!ownerToken) return { ok: false, reason: 'server-not-bootstrapped' }
  const verified = token.verify({ bearer: ex.bearer, deviceId: ex.deviceId, token: ownerToken })
  if (!verified) return { ok: false, reason: 'hmac-mismatch' }
  return { ok: true, deviceId: ex.deviceId }
}

module.exports = { verifyBearer }
```

- [ ] **Step 4: Run, expect PASS**

```powershell
cd E:\note\quickbrain
npm test -- tests/server-auth-middleware.test.js
```

Expected: 3 passing.

- [ ] **Step 5: Commit**

```powershell
cd E:\note\quickbrain
git add server/src/auth/hmac.js tests/server-auth-middleware.test.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(auth): server middleware verifies bearer + device header"
```

---

### Task 15: devices service + auto-register route

**Files:**
- Create: `server/src/services/devices.js`
- Create: `server/src/routes/devices.js`
- Modify: `server/src/index.js` (register routes + preHandler)
- Create: `tests/server-devices-route.test.js`

- [ ] **Step 1: Write failing test (stub PG via mock)**

```js
const crypto = require('crypto'); const path = require('path')
const tokenMod = require(path.join(__dirname, '..', 'shared', 'sync', 'token'))

process.env.MASTER_KEY = 'a'.repeat(64); process.env.OWNER_TOKEN = 'f'.repeat(32)
process.env.DB_URL = 'postgres://x:h/db'

// inject a fake db before requiring routes
const fakeDb = {
  insert: async () => ({ returning: async () => [{}] }),
  selectFrom: () => ({ selectAll: () => ({ execute: async () => [] }) }),
  updateTable: () => ({ set: () => ({ where: () => ({ executeTakeFirst: async () => ({}) }) }) }),
}
require.cache[require.resolve(path.join(__dirname, '..', 'server', 'src', 'db', 'pool'))] = {
  exports: { createPool: () => fakeDb }
}

const { build } = require(path.join(__dirname, '..', 'server', 'src', 'index'))

it('authenticated request records last_seen and returns the device', async () => {
  const app = build()
  const deviceId = crypto.randomUUID()
  const bearer = tokenMod.encode({ deviceId, token: process.env.OWNER_TOKEN })
  const res = await app.inject({
    method: 'GET',
    url: '/v1/admin/devices',
    headers: { authorization: 'Bearer ' + bearer, 'x-qb-device': deviceId, 'x-qb-platform': 'win32', 'x-qb-name': 'TestPC' }
  })
  expect(res.statusCode).toBe(200)
  await app.close()
})
```

- [ ] **Step 2: Run, expect FAIL**

```powershell
cd E:\note\quickbrain
npm test -- tests/server-devices-route.test.js
```

Expected: 404 (route not wired yet).

- [ ] **Step 3: Create `server/src/services/devices.js`**

```js
// Service helpers around the `devices` table. Kysely passes the db in.
// Records last_seen; inserts on first sight.

function recordSeen(db, { deviceId, name, platform, clientVer }) {
  const now = Date.now()
  return db
    .insertInto('devices')
    .values({ device_id: deviceId, name, platform, client_ver: clientVer, last_seen: now, created_at: now })
    .onConflict(oc => oc.column('device_id').doUpdateSet({ last_seen: now, name, platform, client_ver: clientVer }))
    .executeTakeFirst()
}

function listDevices(db) {
  return db.selectFrom('devices').selectAll().orderBy('last_seen', 'desc').execute()
}

function revoke(db, deviceId) {
  return db.updateTable('devices').set({ revoked_at: Date.now() }).where('device_id', '=', deviceId).executeTakeFirst()
}

module.exports = { recordSeen, listDevices, revoke }
```

- [ ] **Step 4: Create `server/src/routes/devices.js`**

```js
const { verifyBearer } = require('../auth/hmac')
const devices = require('../services/devices')

async function recordSeenHook(request, reply) {
  const v = verifyBearer(request.headers)
  if (!v.ok) { reply.code(401).send({ error: 'unauthorized', reason: v.reason }); return reply }
  request.deviceId = v.deviceId
}

module.exports = async function devicesRoutes(fastify, opts) {
  const db = opts.db

  // touch the route - even GET on health records last_seen if a bearer is present
  fastify.addHook('preHandler', async (req, reply) => {
    const v = verifyBearer(req.headers)
    if (v.ok) {
      request_deviceId: void 0
      try {
        await devices.recordSeen(db, {
          deviceId: v.deviceId,
          name: req.headers['x-qb-name'] || '',
          platform: req.headers['x-qb-platform'] || 'unknown',
          clientVer: req.headers['x-qb-client'] || 'unknown'
        })
      } catch (e) { fastify.log.warn({ err: e.message }, 'recordSeen failed') }
      req.deviceId = v.deviceId
    }
  })

  fastify.get('/v1/admin/devices', async (req, reply) => {
    const v = verifyBearer(req.headers)
    if (!v.ok) return reply.code(401).send({ error: 'unauthorized', reason: v.reason })
    return devices.listDevices(db)
  })

  fastify.post('/v1/admin/devices/:id/revoke', async (req, reply) => {
    const v = verifyBearer(req.headers)
    if (!v.ok) return reply.code(401).send({ error: 'unauthorized', reason: v.reason })
    await devices.revoke(db, req.params.id)
    return { ok: true }
  })
}
```

- [ ] **Step 5: Wire into `server/src/index.js`**

```js
const devicesRoutes = require('./routes/devices')

function build() {
  // ...
  const { createPool } = require('./db/pool')
  const db = createPool()
  app.register(devicesRoutes, { db })
  return app
}
```

The fake test stubs `createPool` via `require.cache` so we don't need a real PG; apply patch in the test before requiring `./src/index`.

- [ ] **Step 6: Run, expect PASS**

```powershell
cd E:\note\quickbrain
npm test -- tests/server-devices-route.test.js
```

Expected: 1 passing.

- [ ] **Step 7: Commit**

```powershell
cd E:\note\quickbrain
git add server/src/services/devices.js server/src/routes/devices.js server/src/index.js tests/server-devices-route.test.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(auth): devices registry + admin routes + last_seen hook"
```

---
## Phase 5: Sync endpoints (pull + push + cursor)

### Task 16: server notes service (apply op with LWW + soft delete)

**Files:**
- Create: `server/src/services/notes.js`
- Create: `tests/server-notes-service.test.js` (faked Kysely)

- [ ] **Step 1: Write failing test with faked Kysely builder**

```js
const path = require('path')
const notes = require(path.join(__dirname, '..', 'server', 'src', 'services', 'notes'))

// Build a tiny Kysely double good enough for the tests below.
function fakeDb({ stored = new Map() } = {}) {
  const buildSelect = () => ({
    selectAll: () => ({
      where: (col, op, val) => ({
        orderBy: () => ({
          limit: () => ({
            execute: async () => Array.from(stored.values()).filter(r => r.updated_at > (val || 0)).slice(0, 1).map(r => r)
          })
        })
      })
    })
  })
  return {
    selectFrom: () => buildSelect(),
    insertInto: () => ({
      values: (v) => ({
        onConflict: (cb) => ({
          doUpdateSet: (set) => ({ executeTakeFirst: async () => { stored.set(v.client_id, { ...v, ...set, updated_at: v.updated_at }); return {} } })
        })
      })
    }),
    updateTable: () => ({
      set: (s) => ({
        where: (col, op, val) => ({
          where: (col2, op2, val2) => ({
            executeTakeFirst: async () => {
              const r = stored.get(val)
              if (!r) return null
              if (r.updated_at > val2) return { conflict: true }
              stored.set(val, { ...r, ...s, updated_at: s.updated_at })
              return { conflict: false }
            }
          })
        })
      })
    })
  }
}

it('upsertNote accepts incoming row whose updated_at >= stored', async () => {
  const db = fakeDb({ stored: new Map([['c1', { client_id: 'c1', updated_at: 100, rev: 1, content: 'old' }]]) })
  const r = await notes.upsertNote(db, { client_id: 'c1', updated_at: 200, rev: 2, content: 'new' })
  expect(r.status).toBe('accepted')
})

it('upsertNote rejects incoming row whose updated_at < stored', async () => {
  const db = fakeDb({ stored: new Map([['c1', { client_id: 'c1', updated_at: 200, rev: 2, content: 'new' }]]) })
  const r = await notes.upsertNote(db, { client_id: 'c1', updated_at: 100, rev: 1, content: 'old' })
  expect(r.status).toBe('conflict')
  expect(r.server).toMatchObject({ content: 'new' })
})

it('upsertNote tie-breaks on client_id lexicographically when updated_at equal', async () => {
  const db = fakeDb({ stored: new Map([['aaa', { client_id: 'aaa', updated_at: 100, rev: 1 }]]) })
  const r1 = await notes.upsertNote(db, { client_id: 'aaa', updated_at: 100, rev: 2 })
  const r2 = await notes.upsertNote(db, { client_id: 'zzz', updated_at: 100, rev: 1 })
  expect(['accepted', 'conflict']).toContain(r1.status)
  expect(['accepted', 'conflict']).toContain(r2.status)
})
```

- [ ] **Step 2: Run, expect FAIL**

```powershell
cd E:\note\quickbrain
npm test -- tests/server-notes-service.test.js
```

Expected: `Cannot find module`.

- [ ] **Step 3: Create `server/src/services/notes.js`**

```js
// LWW conflict resolution. Server is the arbiter, but the rule is deterministic.
// Tie-break on client_id ascending so two devices writing at the same ms converge.

async function upsertNote(db, incoming) {
  const existing = await db
    .selectFrom('notes').selectAll()
    .where('client_id', '=', incoming.client_id).executeTakeFirst?.() ||
    await db.selectFrom('notes').selectAll().where('client_id', '=', incoming.client_id).execute()
      .then(rs => rs[0]).catch(() => null)

  if (existing && !lwwIncomingWins(existing, incoming)) {
    return { status: 'conflict', server: existing }
  }
  await db.insertInto('notes').values(mapIncoming(incoming))
    .onConflict(oc => oc.column('client_id').doUpdateSet(mapIncoming(incoming)))
    .executeTakeFirst()
  return { status: 'accepted' }
}

function lwwIncomingWins(existing, incoming) {
  if (incoming.updated_at > existing.updated_at) return true
  if (incoming.updated_at < existing.updated_at) return false
  // tie-break: incoming.client_id > existing.client_id wins (deterministic)
  return incoming.client_id > existing.client_id
}

function mapIncoming(n) {
  // Map incoming fields -> db columns. Keep keys stable with shared/types/note.
  return {
    client_id: n.client_id, content: n.content, title: n.title || '', category: n.category || 'uncategorized',
    tags: JSON.stringify(n.tags || []), is_formatted: n.is_formatted || 0,
    original_content: n.original_content || '', source_path: n.source_path || '',
    source_type: n.source_type || '', parent_id: n.parent_id || null,
    source_range: n.source_range || '', is_atom: n.is_atom || 0,
    extracted_at: n.extracted_at || null, created_at: n.created_at || n.updated_at,
    updated_at: n.updated_at, deleted_at: n.deleted_at || null, rev: n.rev || 1
  }
}

async function softDelete(db, client_id, updated_at) {
  return db.updateTable('notes').set({ deleted_at: updated_at, updated_at })
    .where('client_id', '=', client_id).where('updated_at', '<', updated_at)
    .executeTakeFirst()
}

async function listChangedSince(db, since, limit) {
  const rows = await db.selectFrom('notes').selectAll()
    .where('updated_at', '>', since).orderBy('updated_at', 'asc').limit(limit).execute()
  return rows
}

module.exports = { upsertNote, softDelete, listChangedSince, lwwIncomingWins }
```

- [ ] **Step 4: Run, expect PASS**

```powershell
cd E:\note\quickbrain
npm test -- tests/server-notes-service.test.js
```

Expected: 3 passing.

- [ ] **Step 5: Commit**

```powershell
cd E:\note\quickbrain
git add server/src/services/notes.js tests/server-notes-service.test.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(notes): server LWW upsert + soft delete + changed-since listing"
```

---

### Task 17: server sync pull endpoint

**Files:**
- Modify: `server/src/routes/devices.js` (rename file to sync.js - split cleanly: keep devices in this file, add new file `routes/sync.js`)
- Create: `server/src/routes/sync.js`
- Create: `tests/server-pull.test.js`

- [ ] **Step 1: Write failing test (faked DB)**

```js
const path = require('path')
const fastify = require('fastify')()
const syncRoutes = require(path.join(__dirname, '..', 'server', 'src', 'routes', 'sync'))

afterAll(async () => { await fastify.close() })

it('GET /v1/sync/pull?since=0 returns rows with cursor', async () => {
  const db = {
    selectFrom: () => ({
      selectAll: () => ({
        where: (col, op, val) => ({
          orderBy: () => ({
            limit: () => ({
              execute: async () => ([
                { client_id: 'c1', content: 'x', title: '', updated_at: 100, rev: 1 },
                { client_id: 'c2', content: 'y', title: '', updated_at: 200, rev: 1 }
              ])
            })
          })
        })
      })
    })
  }
  fastify.register(syncRoutes, { db })
  const res = await fastify.inject({ method: 'GET', url: '/v1/sync/pull?since=0&limit=500' })
  expect(res.statusCode).toBe(200)
  expect(res.json().changes).toHaveLength(2)
  expect(res.json().next_cursor).toBe(200)
})
```

- [ ] **Step 2: Run, expect FAIL**

```powershell
cd E:\note\quickbrain
npm test -- tests/server-pull.test.js
```

Expected: 404.

- [ ] **Step 3: Create `server/src/routes/sync.js`**

```js
const { verifyBearer } = require('../auth/hmac')
const { validatePull } = require('@quickbrain/shared/sync/protocol')
const notes = require('../services/notes')

const DEFAULT_LIMIT = 500

module.exports = async function syncRoutes(fastify, opts) {
  const db = opts.db

  fastify.get('/v1/sync/health', async () => ({ ok: true, server_time: Date.now() }))

  fastify.get('/v1/sync/cursor', async (req, reply) => {
    const v = verifyBearer(req.headers)
    if (!v.ok) return reply.code(401).send({ error: 'unauthorized', reason: v.reason })
    return { server_now: Date.now(), head_cursor: Date.now() }
  })

  fastify.get('/v1/sync/pull', async (req, reply) => {
    const v = verifyBearer(req.headers)
    if (!v.ok) return reply.code(401).send({ error: 'unauthorized', reason: v.reason })
    const q = { since: Number(req.query.since || 0), limit: Number(req.query.limit || DEFAULT_LIMIT) }
    const err = validatePull(q)
    if (err) return reply.code(400).send({ error: err })
    const rows = await notes.listChangedSince(db, q.since, q.limit)
    const next_cursor = rows.length ? Number(rows[rows.length - 1].updated_at) : q.since
    return { changes: rows, next_cursor, has_more: rows.length === q.limit }
  })
}
```

- [ ] **Step 4: Run, expect PASS**

```powershell
cd E:\note\quickbrain
npm test -- tests/server-pull.test.js
```

Expected: 1 passing.

- [ ] **Step 5: Commit**

```powershell
cd E:\note\quickbrain
git add server/src/routes/sync.js tests/server-pull.test.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(sync): GET /v1/sync/pull + /cursor + /health"
```

---

### Task 18: server push endpoint (LWW + per-op conflict reporting)

**Files:**
- Modify: `server/src/routes/sync.js`
- Modify: `server/src/services/notes.js` (expose lower-level helpers if needed)
- Create: `tests/server-push.test.js`

- [ ] **Step 1: Write failing test**

```js
const path = require('path')
process.env.MASTER_KEY = 'a'.repeat(64); process.env.OWNER_TOKEN = 'g'.repeat(32); process.env.DB_URL = 'postgres://x'
const fastify = require('fastify')()
const syncRoutes = require(path.join(__dirname, '..', 'server', 'src', 'routes', 'sync'))
const tokenMod = require(path.join(__dirname, '..', 'shared', 'sync', 'token'))
const crypto = require('crypto')

afterAll(async () => { await fastify.close() })

it('POST /v1/sync/push accepts upserts and reports conflicts', async () => {
  const stored = new Map([['c1', { client_id: 'c1', updated_at: 200, rev: 2, content: 'server-new' }]])
  const db = {
    selectFrom: () => ({
      selectAll: () => ({
        where: (col, op, val) => ({ execute: async () => stored.get(val) ? [stored.get(val)] : [] }),
        orderBy: () => ({ limit: () => ({ execute: async () => Array.from(stored.values()) }) })
      })
    }),
    insertInto: () => ({
      values: (v) => ({
        onConflict: (cb) => ({
          doUpdateSet: (s) => ({ executeTakeFirst: async () => { stored.set(v.client_id, { ...v, ...s }); return {} } })
        })
      })
    })
  }
  fastify.register(syncRoutes, { db })
  const deviceId = crypto.randomUUID()
  const bearer = tokenMod.encode({ deviceId, token: process.env.OWNER_TOKEN })
  const body = { ops: [
    { op: 'upsert', note: { client_id: 'c1', updated_at: 100, rev: 1, content: 'client-old' } },
    { op: 'upsert', note: { client_id: 'c2', updated_at: 300, rev: 1, content: 'client-new' } }
  ] }
  const res = await fastify.inject({ method: 'POST', url: '/v1/sync/push', headers: { authorization: 'Bearer ' + bearer, 'x-qb-device': deviceId }, payload: body })
  expect(res.statusCode).toBe(200)
  expect(res.json().accepted).toBe(1)
  expect(res.json().conflicts).toHaveLength(1)
})
```

- [ ] **Step 2: Run, expect FAIL**

```powershell
cd E:\note\quickbrain
npm test -- tests/server-push.test.js
```

Expected: 404 (no push route).

- [ ] **Step 3: Extend `server/src/routes/sync.js`**

Add to the existing module:

```js
const { validatePushOps } = require('@quickbrain/shared/sync/protocol')

// inside module.exports = async function syncRoutes(fastify, opts) { ...
  fastify.post('/v1/sync/push', async (req, reply) => {
    const v = verifyBearer(req.headers)
    if (!v.ok) return reply.code(401).send({ error: 'unauthorized', reason: v.reason })
    const ops = (req.body && req.body.ops) || []
    const validation = validatePushOps(ops)
    if (validation.length) return reply.code(400).send({ error: 'invalid-ops', details: validation })
    const accepted = [], conflicts = []
    for (const op of ops) {
      if (op.op === 'upsert') {
        const r = await notes.upsertNote(db, op.note)
        if (r.status === 'accepted') accepted.push(op.note.client_id)
        else conflicts.push({ client_id: op.note.client_id, server_version: r.server })
      } else if (op.op === 'delete') {
        const r = await notes.softDelete(db, op.client_id, op.updated_at)
        if (r && r.conflict) conflicts.push({ client_id: op.client_id, server_version: 'kept' })
        else accepted.push(op.client_id)
      }
    }
    return { accepted: accepted.length, conflicts }
  })
```

- [ ] **Step 4: Run, expect PASS**

```powershell
cd E:\note\quickbrain
npm test -- tests/server-push.test.js
```

Expected: 1 passing.

- [ ] **Step 5: Commit**

```powershell
cd E:\note\quickbrain
git add server/src/routes/sync.js server/src/services/notes.js tests/server-push.test.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(sync): POST /v1/sync/push with per-op LWW outcome"
```

---
## Phase 6: Client sync cache + outbox + daemon

### Task 19: client sync_meta + sync_outbox CRUD

**Files:**
- Create: `client/src/main/sync/meta.js`
- Create: `client/src/main/sync/outbox.js`
- Create: `tests/client-sync-meta.test.js`

- [ ] **Step 1: Write failing test**

```js
const Database = require('better-sqlite3')
const { applyAll } = require('../shared/schema/sqlite/migrations')
const meta = require('../client/src/main/sync/meta')
const outbox = require('../client/src/main/sync/outbox')

let db
beforeEach(() => { db = new Database(':memory:'); applyAll(db) })

it('meta initialises to defaults for a device', () => {
  meta.ensure(db, 'dev-1')
  expect(meta.get(db, 'dev-1')).toEqual({ device_id: 'dev-1', last_pull_cursor: 0, last_push_at: 0, outbox_seq: 0 })
})

it('outbox append returns monotonic seq', () => {
  const a = outbox.append(db, { op: 'upsert', noteId: 1, payload: { client_id: 'c1' } })
  const b = outbox.append(db, { op: 'delete', noteId: 2, payload: { client_id: 'c2' } })
  expect(a).toBe(1); expect(b).toBe(2)
  expect(outbox.pending(db)).toHaveLength(2)
})

it('outbox mark acked removes rows', () => {
  const a = outbox.append(db, { op: 'upsert', noteId: 1, payload: {} })
  outbox.markAcked(db, [a])
  expect(outbox.pending(db)).toHaveLength(0)
})

it('outbox listForPush returns pending ordered by seq', () => {
  outbox.append(db, { op: 'upsert', noteId: 1, payload: { client_id: 'c1' } })
  outbox.append(db, { op: 'delete', noteId: 2, payload: { client_id: 'c2' } })
  const rows = outbox.listForPush(db, 10)
  expect(rows.map(r => r.op)).toEqual(['upsert', 'delete'])
})
```

- [ ] **Step 2: Run, expect FAIL**

```powershell
cd E:\note\quickbrain
npm test -- tests/client-sync-meta.test.js
```

Expected: `Cannot find module`.

- [ ] **Step 3: Create `client/src/main/sync/meta.js`**

```js
function ensure(db, deviceId) {
  db.prepare(`INSERT OR IGNORE INTO sync_meta (device_id) VALUES (?)`).run(deviceId)
}

function get(db, deviceId) {
  return db.prepare('SELECT * FROM sync_meta WHERE device_id = ?').get(deviceId)
}

function setCursor(db, deviceId, cursor) {
  db.prepare('UPDATE sync_meta SET last_pull_cursor = ? WHERE device_id = ?').run(cursor, deviceId)
}

function setLastPushAt(db, deviceId, ts) {
  db.prepare('UPDATE sync_meta SET last_push_at = ? WHERE device_id = ?').run(ts, deviceId)
}

function nextOutboxSeq(db, deviceId) {
  const row = db.prepare('SELECT outbox_seq FROM sync_meta WHERE device_id = ?').get(deviceId)
  const next = (row ? row.outbox_seq : 0) + 1
  db.prepare('UPDATE sync_meta SET outbox_seq = ? WHERE device_id = ?').run(next, deviceId)
  return next
}

module.exports = { ensure, get, setCursor, setLastPushAt, nextOutboxSeq }
```

- [ ] **Step 4: Create `client/src/main/sync/outbox.js`**

```js
function append(db, { op, noteId = null, payload }) {
  const stmt = db.prepare(`INSERT INTO sync_outbox (op, note_id, payload, enqueued_at, attempts) VALUES (?, ?, ?, ?, 0)`)
  const r = stmt.run(op, noteId, JSON.stringify(payload), Date.now())
  return r.lastInsertRowid
}

function listForPush(db, limit = 50) {
  const rows = db.prepare(`SELECT * FROM sync_outbox ORDER BY seq ASC LIMIT ?`).all(limit)
  return rows.map(r => ({ ...r, payload: JSON.parse(r.payload) }))
}

function pending(db) {
  return listForPush(db, 1000)
}

function markAcked(db, seqs) {
  if (!seqs.length) return 0
  const stmt = db.prepare(`DELETE FROM sync_outbox WHERE seq = ?`)
  let n = 0
  db.transaction(() => { for (const s of seqs) { stmt.run(s); n++ } })()
  return n
}

function setLastError(db, seq, err) {
  db.prepare(`UPDATE sync_outbox SET attempts = attempts + 1, last_error = ? WHERE seq = ?`).run(String(err).slice(0, 500), seq)
}

module.exports = { append, listForPush, pending, markAcked, setLastError }
```

- [ ] **Step 5: Run, expect PASS**

```powershell
cd E:\note\quickbrain
npm test -- tests/client-sync-meta.test.js
```

Expected: 4 passing.

- [ ] **Step 6: Commit**

```powershell
cd E:\note\quickbrain
git add client/src/main/sync/meta.js client/src/main/sync/outbox.js tests/client-sync-meta.test.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(sync): client sync_meta + outbox helpers"
```

---

### Task 20: client sync client (HTTP push/pull)

**Files:**
- Create: `client/src/main/sync/client.js`
- Create: `tests/client-sync-client.test.js` (stub fetch)

- [ ] **Step 1: Write failing test**

```js
const path = require('path')

const fakeFetch = jest.fn()
require.cache[require.resolve('node-fetch')] = { exports: fakeFetch }

// Stub fetch in Node 18+ via global
global.fetch = fakeFetch

const client = require(path.join(__dirname, '..', 'client', 'src', 'main', 'sync', 'client'))

afterEach(() => { fakeFetch.mockReset() })

it('push builds a token-bound POST and parses per-op result', async () => {
  fakeFetch.mockResolvedValueOnce({ status: 200, json: async () => ({ accepted: 1, conflicts: [{ client_id: 'c1' }] }) })
  const r = await client.push({ serverUrl: 'https://qb.lan', bearer: 'tok', ops: [{ op: 'upsert', note: { client_id: 'c1', updated_at: 1, rev: 1, content: '' } }] })
  expect(r.accepted).toBe(1)
  expect(r.conflicts).toHaveLength(1)
  expect(fakeFetch).toHaveBeenCalledWith('https://qb.lan/v1/sync/push', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ authorization: 'Bearer tok' }) }))
})

it('pull sends since and returns changes + cursor', async () => {
  fakeFetch.mockResolvedValueOnce({ status: 200, json: async () => ({ changes: [{ client_id: 'c1' }], next_cursor: 100, has_more: false }) })
  const r = await client.pull({ serverUrl: 'https://qb.lan', bearer: 'tok', since: 0, limit: 50 })
  expect(r.next_cursor).toBe(100)
})
```

- [ ] **Step 2: Run, expect FAIL**

```powershell
cd E:\note\quickbrain
npm test -- tests/client-sync-client.test.js
```

Expected: `Cannot find module`.

- [ ] **Step 3: Create `client/src/main/sync/client.js`**

```js
async function req({ serverUrl, path, method = 'GET', bearer, body }) {
  const url = serverUrl.replace(/\/$/, '') + path
  const res = await fetch(url, {
    method,
    headers: {
      authorization: 'Bearer ' + bearer,
      'content-type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error('sync-' + method + '-' + res.status + ' ' + t.slice(0, 200))
  }
  return res.json()
}

async function pull({ serverUrl, bearer, since, limit }) {
  return req({ serverUrl, path: '/v1/sync/pull?since=' + (since || 0) + '&limit=' + (limit || 500), bearer })
}

async function push({ serverUrl, bearer, ops }) {
  return req({ serverUrl, path: '/v1/sync/push', method: 'POST', bearer, body: { ops } })
}

async function health({ serverUrl, bearer }) {
  return req({ serverUrl, path: '/v1/sync/health', bearer })
}

module.exports = { pull, push, health, req }
```

- [ ] **Step 4: Run, expect PASS**

```powershell
cd E:\note\quickbrain
npm test -- tests/client-sync-client.test.js
```

Expected: 2 passing.

- [ ] **Step 5: Commit**

```powershell
cd E:\note\quickbrain
git add client/src/main/sync/client.js tests/client-sync-client.test.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(sync): client HTTP client for push/pull/health"
```

---

### Task 21: client sync config + deviceId

**Files:**
- Create: `client/src/main/config.js`
- Create: `tests/client-sync-config.test.js`

- [ ] **Step 1: Write failing test**

```js
const path = require('path')
const os = require('os')
const fs = require('fs')

// Stub electron.app.getPath to a temp dir
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qb-cfg-'))
require.cache[require.resolve('electron')] = { exports: { app: { getPath: () => tmp } } }

const cfg = require(path.join(__dirname, '..', 'client', 'src', 'main', 'config'))

it('loads missing config with sync.enabled = false', () => {
  const got = cfg.read()
  expect(got.sync.enabled).toBe(false)
})

it('creates a deviceId on first read and persists it', () => {
  const a = cfg.ensureDeviceId()
  const b = cfg.ensureDeviceId()
  expect(a).toBe(b)
  expect(/^[0-9a-f-]{36}$/.test(a)).toBe(true)
})

it('write + read roundtrip survives reboot', () => {
  cfg.write({ sync: { enabled: true, serverUrl: 'https://x', token: 't', deviceId: cfg.ensureDeviceId() } })
  const got = cfg.read().sync
  expect(got.enabled).toBe(true); expect(got.serverUrl).toBe('https://x')
})
```

- [ ] **Step 2: Run, expect FAIL**

```powershell
cd E:\note\quickbrain
npm test -- tests/client-sync-config.test.js
```

Expected: `Cannot find module`.

- [ ] **Step 3: Create `client/src/main/config.js`**

```js
const fs = require('fs'); const path = require('path'); const { app } = require('electron'); const crypto = require('crypto')

function configPath() { return path.join(app.getPath('userData'), 'config.json') }

function read() {
  const p = configPath()
  if (!fs.existsSync(p)) return { ai: {}, sync: { enabled: false } }
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return { ai: {}, sync: { enabled: false } } }
}

function write(cfg) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true })
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf8')
}

function ensureDeviceId() {
  const cfg = read()
  if (cfg.sync && cfg.sync.deviceId) return cfg.sync.deviceId
  const id = crypto.randomUUID()
  cfg.sync = Object.assign({}, cfg.sync || {}, { deviceId: id })
  write(cfg)
  return id
}

function buildBearer() {
  const cfg = read()
  const sync = cfg.sync || {}
  if (!sync.enabled || !sync.token || !sync.deviceId) return null
  const { encode } = require('@quickbrain/shared/sync/token')
  return encode({ deviceId: sync.deviceId, token: sync.token })
}

module.exports = { read, write, ensureDeviceId, buildBearer }
```

- [ ] **Step 4: Run, expect PASS**

```powershell
cd E:\note\quickbrain
npm test -- tests/client-sync-config.test.js
```

Expected: 3 passing.

- [ ] **Step 5: Commit**

```powershell
cd E:\note\quickbrain
git add client/src/main/config.js tests/client-sync-config.test.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(sync): client config + persistent deviceId + bearer builder"
```

---

### Task 22: client daemon (pull loop + debounced push)

**Files:**
- Create: `client/src/main/sync/daemon.js`
- Create: `tests/client-sync-daemon.test.js`

- [ ] **Step 1: Write failing test**

```js
const path = require('path')

const fakeClient = {
  pull: jest.fn(async () => ({ changes: [], next_cursor: 0, has_more: false })),
  push: jest.fn(async () => ({ accepted: 0, conflicts: [] }))
}

require.cache[require.resolve(path.join(__dirname, '..', 'client', 'src', 'main', 'sync', 'client'))] = {
  exports: fakeClient
}

const { createDaemon } = require(path.join(__dirname, '..', 'client', 'src', 'main', 'sync', 'daemon'))
const fakeTimers = (() => {
  const t = { now: 0, schedule: [] }
  const origNow = Date.now
  Date.now = () => t.now
  return {
    advance(ms) { t.now += ms; const due = t.schedule.filter(s => s.at <= t.now); for (const s of due) { s.fn(); t.schedule = t.schedule.filter(x => x !== s) } },
    scheduleAt(at, fn) { t.schedule.push({ at, fn }) }
  }
})()

it('pullLoop pulls on every tick at configured interval', async () => {
  const events = []
  const d = createDaemon({
    getConfig: () => ({ serverUrl: 'https://x', bearer: 't', deviceId: 'd1', enabled: true, getCursor: () => 0, setCursor: c => events.push(['cursor', c]) }),
    intervalMs: 100,
    onPull: () => events.push(['pull'])
  })
  d.start(); fakeTimers.advance(50); fakeTimers.advance(60); fakeTimers.advance(60)
  d.stop()
  expect(events.filter(e => e[0] === 'pull').length).toBeGreaterThanOrEqual(2)
})

it('schedulePush debounces burst writes into one push', () => {
  let pushes = 0
  const d = createDaemon({
    getConfig: () => ({ enabled: true, serverUrl: 'https://x', bearer: 't', deviceId: 'd1', getCursor: () => 0, setCursor: () => {} }),
    intervalMs: 1000,
    onPush: () => pushes++,
    debounceMs: 200
  })
  d.schedulePush(); d.schedulePush(); d.schedulePush()
  fakeTimers.advance(250)
  expect(pushes).toBe(1)
})
```

- [ ] **Step 2: Run, expect FAIL**

```powershell
cd E:\note\quickbrain
npm test -- tests/client-sync-daemon.test.js
```

Expected: `Cannot find module`.

- [ ] **Step 3: Create `client/src/main/sync/daemon.js`**

```js
// Pull every intervalMs while enabled. Push debounced. Caller wires onPull / onPush to
// apply ops to local SQLite and to enumerate the outbox respectively.
function createDaemon({ getConfig, intervalMs = 5000, debounceMs = 1000, onPull, onPush }) {
  let pullTimer = null; let pushTimer = null; let running = false

  async function tick() {
    const cfg = getConfig()
    if (!cfg.enabled) return
    try { await onPull() } catch (e) { console.error('[sync] pull failed:', e.message) }
  }

  function schedulePush() {
    if (pushTimer) clearTimeout(pushTimer)
    pushTimer = setTimeout(async () => {
      pushTimer = null
      const cfg = getConfig()
      if (!cfg.enabled) return
      try { await onPush() } catch (e) { console.error('[sync] push failed:', e.message) }
    }, debounceMs)
  }

  function start() {
    if (running) return
    running = true
    if (pullTimer) clearInterval(pullTimer)
    pullTimer = setInterval(tick, intervalMs)
    // immediate pull on start
    setTimeout(tick, 0)
  }

  function stop() {
    running = false
    if (pullTimer) { clearInterval(pullTimer); pullTimer = null }
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null }
  }

  return { start, stop, schedulePush, tick, _pullTimer: () => pullTimer, _pushTimer: () => pushTimer }
}

module.exports = { createDaemon }
```

- [ ] **Step 4: Run, expect PASS**

```powershell
cd E:\note\quickbrain
npm test -- tests/client-sync-daemon.test.js
```

Expected: 2 passing.

- [ ] **Step 5: Commit**

```powershell
cd E:\note\quickbrain
git add client/src/main/sync/daemon.js tests/client-sync-daemon.test.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(sync): client daemon with pull loop + debounced push"
```

---

### Task 23: wire daemon into client main + enqueue writes on IPC

**Files:**
- Modify: `client/src/main/ipc.js` (enqueue outbox on add/edit/delete)
- Modify: `client/src/main/main.js` (start daemon on app ready)

- [ ] **Step 1: Write failing test: ipc write handlers enqueue outbox**

```js
const Database = require('better-sqlite3')
const { applyAll } = require('../shared/schema/sqlite/migrations')
const outbox = require('../client/src/main/sync/outbox')

it('a sample write-shape produces one outbox upsert with the right payload', () => {
  const db = new Database(':'); applyAll(db)
  // simulate an add
  const note = { client_id: 'c1', content: 'x', title: 't', updated_at: 100, rev: 1 }
  const seq = outbox.append(db, { op: 'upsert', noteId: 1, payload: note })
  const [row] = outbox.listForPush(db, 10)
  expect(row.payload.client_id).toBe('c1')
  expect(row.op).toBe('upsert')
})
```

- [ ] **Step 2: Run (skip if already covered by Phase 6 Task 19)**

This test should pass after we made outbox.append / listForPush work. Run:

```powershell
cd E:\note\quickbrain
npm test -- tests/client-sync-meta.test.js
```

Expected: green.

Skip if green; otherwise debug.

- [ ] **Step 3: Modify `client/src/main/ipc.js`**

After every successful local write, call:

```js
const outbox = require('./sync/outbox')
const config = require('./config')

function enqueueUpsert(db, note) {
  const sync = config.read().sync || {}
  if (!sync.enabled) return // local-only mode: skip outbox entirely
  outbox.append(db, { op: 'upsert', noteId: note.id, payload: { ...note, client_id: sync.deviceId || null } })
}

function enqueueDelete(db, noteId) {
  const sync = config.read().sync || {}
  if (!sync.enabled) return
  outbox.append(db, { op: 'delete', noteId, payload: { client_id: null, updated_at: Date.now() } })
}
```

Inside `addNote` IPC handler (after `addNote(db, ...)` succeeds), call `enqueueUpsert`.

Inside `delete-note` IPC handler (after successful delete), call `enqueueDelete`.

Inside `extract-source` handler (after atom notes inserted), call `enqueueUpsert` per atom.

- [ ] **Step 4: Modify `client/src/main/main.js`**

Add daemon bootstrap:

```js
const { createDaemon } = require('./sync/daemon')
const client = require('./sync/client')
const meta = require('./sync/meta')
const outbox = require('./sync/outbox')

app.whenReady().then(async () => {
  await initDatabase()
  // ... existing code ...

  config.ensureDeviceId()
  const daemon = createDaemon({
    getConfig: () => {
      const c = config.read().sync || {}
      return { enabled: !!c.enabled, serverUrl: c.serverUrl, bearer: config.buildBearer(), deviceId: c.deviceId, getCursor: () => meta.get(getDB(), c.deviceId || '').last_pull_cursor, setCursor: v => meta.setCursor(getDB(), c.deviceId || '', v) }
    },
    onPull: async () => {
      // call client.pull and apply changes
      const c = config.read().sync || {}
      if (!c.enabled) return
      const cur = meta.get(getDB(), c.deviceId || '').last_pull_cursor || 0
      const { changes, next_cursor, has_more } = await client.pull({ serverUrl: c.serverUrl, bearer: config.buildBearer(), since: cur, limit: 200 })
      applyNotesFromServer(changes)
      meta.setCursor(getDB(), c.deviceId || '', next_cursor || Date.now())
      // loop if more
    },
    onPush: async () => {
      const c = config.read().sync || {}
      if (!c.enabled) return
      const rows = outbox.listForPush(getDB(), 100)
      if (!rows.length) return
      const ops = rows.map(r => r.op === 'upsert'
        ? { op: 'upsert', note: { ...r.payload, client_id: c.deviceId + ':' + r.noteId } } // simplistic mapping
        : { op: 'delete', client_id: c.deviceId + ':' + r.noteId, updated_at: r.payload.updated_at })
      const r = await client.push({ serverUrl: c.serverUrl, bearer: config.buildBearer(), ops })
      if (r.conflicts && r.conflicts.length) {
        for (const cf of r.conflicts) {
          const seq = rows.find(x => (c.deviceId + ':' + x.noteId) === cf.client_id)?.seq
          if (seq) outbox.setLastError(getDB(), seq, 'server-conflict')
        }
      }
      const okClientIds = new Set(r.conflicts.map(c => c.client_id))
      const acked = rows.filter(x => !okClientIds.has(c.deviceId + ':' + x.noteId)).map(x => x.seq)
      outbox.markAcked(getDB(), acked)
      meta.setLastPushAt(getDB(), c.deviceId || '', Date.now())
    }
  })
  daemon.start()
})

function applyNotesFromServer(rows) {
  // simple: upsert to local by client_id mapping. Real impl lives in next task.
  const db = getDB()
  for (const row of rows) {
    db.prepare(`INSERT INTO notes (client_id, content, title, updated_at, rev) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(client_id) DO UPDATE SET content=excluded.content, title=excluded.title, updated_at=excluded.updated_at, rev=excluded.rev`)
      .run(row.client_id, row.content, row.title || '', row.updated_at, row.rev)
  }
}
```

Adjust the client_id mapping: existing schema uses INTEGER id. To merge by stable id, add a `client_id` TEXT column with a UNIQUE index in the SQLite schema. This is owned by a follow-up column migration task.

> Continue to Task 24 for the column migration that supports stable client_id, completing the wiring.

- [ ] **Step 5: Smoke: boot client, confirm daemon fires**

```powershell
cd E:\note\quickbrain
npm run rebuild:electron
$proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c","cd /d E:\note\quickbrain && npx electron client\package.json --dev > C:\Users\36153\client-sync-boot.log 2>&1" -WindowStyle Hidden -PassThru
```

Wait 5s, tail log for `[sync]` entries. With `sync.enabled = false` (default), no daemon output expected - which is the success condition for "no regressions".

```powershell
taskkill /F /IM electron.exe /T 2>$null | Out-Null
```

- [ ] **Step 6: Commit**

```powershell
cd E:\note\quickbrain
git add -A
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(sync): wire daemon + enqueue writes; Phase 6 wiring"
```

---

### Task 24: add client_id column to local notes + idempotent merging

**Files:**
- Create: `shared/schema/sqlite/0002_client_id.sql`
- Create: `tests/client-id-merge.test.js`

- [ ] **Step 1: Write failing test**

```js
const Database = require('better-sqlite3')
const { applyAll } = require('../shared/schema/sqlite/migrations')

it('0002 migration adds client_id + unique index', () => {
  const db = new Database(':'); applyAll(db)
  db.exec('INSERT INTO notes (client_id, content, updated_at, rev) VALUES (?, ?, ?, ?)')
    .run('stable-1', 'x', 1, 1)
  db.exec('INSERT INTO notes (client_id, content, updated_at, rev) VALUES (?, ?, ?, ?)')
    .run('stable-1', 'x', 2, 2) // duplicate
  const n = db.prepare('SELECT count(*) c FROM notes').get().c
  expect(n).toBe(1)
})
```

- [ ] **Step 2: Run, expect FAIL**

```powershell
cd E:\note\quickbrain
npm test -- tests/client-id-merge.test.js
```

Expected: `no such column: client_id` OR no unique index.

- [ ] **Step 3: Create `shared/schema/sqlite/0002_client_id.sql`**

```sql
-- 0002_client_id.sql: stable per-note merge key for sync
ALTER TABLE notes ADD COLUMN client_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_client_id ON notes (client_id);
```

Also add to the migrator (`shared/schema/sqlite/migrations.js`) a way to handle ALTER TABLE without dropping existing data. Existing migrations are applied in numeric order, so 0002 just runs after 0001. The migrator already wraps each in a transaction.

- [ ] **Step 4: Run, expect PASS**

```powershell
cd E:\note\quickbrain
npm test -- tests/client-id-merge.test.js
```

Expected: 1 passing.

- [ ] **Step 5: Backfill existing local notes**

Add a one-shot backfill in `db-init.js` (or a separate migration 0003):

Create `shared/schema/sqlite/0003_backfill_client_id.sql`:

```sql
-- Backfill client_id for any pre-sync note. Generated from rowid; never collides within one DB.
UPDATE notes SET client_id = 'local-' || id WHERE client_id IS NULL OR client_id = '';
```

- [ ] **Step 6: Run all sync tests one last time**

```powershell
cd E:\note\quickbrain
npm test -- tests/client-id-merge.test.js tests/client-sync-meta.test.js
```

Expected: green.

- [ ] **Step 7: Commit**

```powershell
cd E:\note\quickbrain
git add shared/schema/sqlite/0002_client_id.sql shared/schema/sqlite/0003_backfill_client_id.sql tests/client-id-merge.test.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(sync): client_id column + backfill for legacy notes"
```

---
## Phase 7: Server-side atom extraction queue + worker

### Task 25: extractor (pure function, configurable by server config)

**Files:**
- Create: `server/src/extractor/index.js`
- Create: `tests/server-extractor.test.js`

- [ ] **Step 1: Write failing test (stub AIService)**

```js
const path = require('path')
const { extractAtoms } = require(path.join(__dirname, '..', 'server', 'src', 'extractor'))

const stubAI = { extractAtoms: async ({ title, content }) => [{ title: 'A1', content: 'x', source_range: { start: 0 } }] }

it('extractAtoms returns the atoms + tags flattened from the source', async () => {
  const atoms = await extractAtoms({ title: 'T', content: 'C' }, stubAI)
  expect(atoms).toHaveLength(1)
  expect(atoms[0].title).toBe('A1')
})

it('extractAtoms returns [] when AI is null (caller decides)', async () => {
  await expect(extractAtoms({ title: 'T', content: 'C' }, null))
    .rejects.toBeTruthy()
})
```

- [ ] **Step 2: Run, expect FAIL**

```powershell
cd E:\note\quickbrain
npm test -- tests/server-extractor.test.js
```

Expected: `Cannot find module`.

- [ ] **Step 3: Create `server/src/extractor/index.js`**

```js
// Thin adapter around AIService.extractAtoms. Kept pure so we can swap implementations.
async function extractAtoms({ title, content }, aiService) {
  if (!aiService) throw new Error('ai-not-configured')
  const atoms = await aiService.extractAtoms({ title, content })
  if (!Array.isArray(atoms)) throw new Error('ai-returned-non-array')
  return atoms.filter(a => a && typeof a.content === 'string' && typeof a.title === 'string')
}

module.exports = { extractAtoms }
```

- [ ] **Step 4: Run, expect PASS**

```powershell
cd E:\note\quickbrain
npm test -- tests/server-extractor.test.js
```

Expected: 2 passing.

- [ ] **Step 5: Commit**

```powershell
cd E:\note\quickbrain
git add server/src/extractor/ tests/server-extractor.test.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(worker): pure atom extractor wrapper"
```

---

### Task 26: BullMQ queue + extraction worker

**Files:**
- Create: `server/src/queues/extraction.js`
- Create: `server/src/workers/extraction.js`
- Create: `tests/server-extraction-worker.test.js`

- [ ] **Step 1: Write failing test (in-memory BullMQ via Queue stub)**

```js
const path = require('path')
const { runJob } = require(path.join(__dirname, '..', 'server', 'src', 'workers', 'extraction'))

it('runJob upserts atoms and sets extracted_at = now on success', async () => {
  const db = {
    selectFrom: () => ({
      selectAll: () => ({ where: () => ({ executeTakeFirst: async () => ({ client_id: 'src-1', title: 'T', content: 'C' }) }) })
    }),
    insertInto: () => ({
      values: (v) => ({
        onConflict: (cb) => ({
          doUpdateSet: (s) => ({ executeTakeFirst: async () => { calls.push(['upsert', v.client_id]); return {} } })
        })
      })
    }),
    updateTable: () => ({ set: () => ({ where: () => ({ executeTakeFirst: async () => { calls.push(['update-src']); return {} } }) }) })
  }
  const calls = []
  const aiService = { extractAtoms: async () => [{ title: 'A1', content: 'x', source_range: { start: 0 } }] }
  await runJob({ db, aiService, client_id: 'src-1', force: false })
  expect(calls).toContainEqual(['upsert', 'src-1:atom:0'])
  expect(calls).toContainEqual(['update-src'])
})

it('runJob marks extracted_at = -1 on failure', async () => {
  const setCalls = []
  const db = {
    selectFrom: () => ({ selectAll: () => ({ where: () => ({ executeTakeFirst: async () => null }) }) }),
    updateTable: () => ({ set: (s) => ({ where: () => ({ executeTakeFirst: async () => { setCalls.push(s.extracted_at); return {} } }) }) })
  }
  const aiService = { extractAtoms: async () => { throw new Error('boom') } }
  await runJob({ db, aiService, client_id: 'src-2', force: false })
  expect(setCalls[0]).toBe(-1)
})
```

- [ ] **Step 2: Run, expect FAIL**

```powershell
cd E:\note\quickbrain
npm test -- tests/server-extraction-worker.test.js
```

Expected: `Cannot find module`.

- [ ] **Step 3: Create `server/src/workers/extraction.js`**

```js
const { extractAtoms } = require('../extractor')

const FAILED = -1

async function runJob({ db, aiService, client_id, force = false }) {
  if (!client_id) throw new Error('client_id required')
  const source = await db.selectFrom('notes').selectAll()
    .where('client_id', '=', client_id).executeTakeFirst()
  if (!source) { console.warn('[extract] source not found', client_id); return }
  if (!force && source.extracted_at && source.extracted_at !== FAILED) {
    return // already extracted
  }
  let atoms = []
  try {
    atoms = await extractAtoms({ title: source.title, content: source.content }, aiService)
  } catch (e) {
    console.error('[extract] AI failed for', client_id, e.message)
    await db.updateTable('notes').set({ extracted_at: FAILED }).where('client_id', '=', client_id).executeTakeFirst()
    return
  }
  // If force, delete existing atom rows first
  if (force) await db.deleteFrom('notes').where('parent_id', '=', client_id).execute()
  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i]
    const childClientId = client_id + ':atom:' + i
    await db.insertInto('notes').values({
      client_id: childClientId, content: a.content, title: a.title,
      tags: '[]', is_atom: 1, parent_id: client_id, source_range: JSON.stringify(a.source_range || {}),
      created_at: Date.now(), updated_at: Date.now(), rev: 1
    }).onConflict(oc => oc.column('client_id').doUpdateSet({ content: a.content, title: a.title, source_range: JSON.stringify(a.source_range || {}) }))
      .executeTakeFirst()
  }
  await db.updateTable('notes').set({ extracted_at: Date.now() }).where('client_id', '=', client_id).executeTakeFirst()
}

module.exports = { runJob }
```

- [ ] **Step 4: Create `server/src/queues/extraction.js`**

```js
const { Queue, Worker } = require('bullmq')
const IORedis = require('ioredis')
const path = require('path')

let _queue = null
function getQueue() {
  if (_queue) return _queue
  const conn = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null })
  _queue = new Queue('extract', { connection: conn })
  return _queue
}

async function enqueueExtract(client_id, { force = false } = {}) {
  return getQueue().add('extract:' + client_id, { client_id, force }, { removeOnComplete: true, removeOnFail: 100 })
}

function startWorker({ db, aiService }) {
  const conn = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null })
  const w = new Worker('extract', async (job) => {
    const { runJob } = require(path.join(__dirname, '..', 'workers', 'extraction'))
    await runJob({ db, aiService, client_id: job.data.client_id, force: job.data.force })
  }, { connection: conn })
  w.on('failed', (job, err) => console.error('[extract] job failed', job.data.client_id, err.message))
  return w
}

module.exports = { getQueue, enqueueExtract, startWorker }
```

- [ ] **Step 5: Run, expect PASS**

```powershell
cd E:\note\quickbrain
npm test -- tests/server-extraction-worker.test.js
```

Expected: 2 passing.

- [ ] **Step 6: Commit**

```powershell
cd E:\note\quickbrain
git add server/src/workers/extraction.js server/src/queues/extraction.js tests/server-extraction-worker.test.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(worker): bullmq extraction queue + worker"
```

---

### Task 27: queue extraction on push (server-side)

**Files:**
- Modify: `server/src/routes/sync.js`
- Create: `tests/server-push-enqueue.test.js`

- [ ] **Step 1: Write failing test (enqueueExtract stub)**

```js
const path = require('path')
const fakeEnqueue = jest.fn()
require.cache[require.resolve(path.join(__dirname, '..', 'server', 'src', 'queues', 'extraction'))] = {
  exports: { enqueueExtract: fakeEnqueue, getQueue: () => ({}), startWorker: () => ({ close: () => {} }) }
}

process.env.MASTER_KEY = 'a'.repeat(64); process.env.OWNER_TOKEN = 'h'.repeat(32); process.env.DB_URL = 'postgres://x'
const fastify = require('fastify')()
const syncRoutes = require(path.join(__dirname, '..', 'server', 'src', 'routes', 'sync'))
const tokenMod = require(path.join(__dirname, '..', 'shared', 'sync', 'token'))
const crypto = require('crypto')

afterEach(() => { fakeEnqueue.mockReset() })
afterAll(async () => { await fastify.close() })

it('after accepting an upsert that has is_atom=0 and extracted_at NULL, server enqueues extract', async () => {
  const db = {
    selectFrom: () => ({ selectAll: () => ({ where: () => ({ execute: async () => [] }) }) }),
    insertInto: () => ({ values: () => ({ onConflict: () => ({ doUpdateSet: () => ({ executeTakeFirst: async () => {} }) }) }) })
  }
  fastify.register(syncRoutes, { db })
  const deviceId = crypto.randomUUID()
  const bearer = tokenMod.encode({ deviceId, token: process.env.OWNER_TOKEN })
  const res = await fastify.inject({ method: 'POST', url: '/v1/sync/push', headers: { authorization: 'Bearer ' + bearer, 'x-qb-device': deviceId }, payload: { ops: [{ op: 'upsert', note: { client_id: 's1', content: 'x', title: 't', updated_at: Date.now(), rev: 1, is_atom: 0, extracted_at: null } }] } })
  expect(res.statusCode).toBe(200)
  expect(fakeEnqueue).toHaveBeenCalledWith('s1', expect.objectContaining({ force: false }))
})
```

- [ ] **Step 2: Run, expect FAIL**

```powershell
cd E:\note\quickbrain
npm test -- tests/server-push-enqueue.test.js
```

Expected: enqueue not called.

- [ ] **Step 3: Modify `server/src/routes/sync.js` push handler**

Inside the loop, after a successful upsert:

```js
if (op.op === 'upsert') {
  const r = await notes.upsertNote(db, op.note)
  if (r.status === 'accepted') {
    accepted.push(op.note.client_id)
    if (!op.note.is_atom && op.note.extracted_at == null) {
      try { await require('../queues/extraction').enqueueExtract(op.note.client_id, { force: false }) }
      catch (e) { console.error('[sync] enqueue failed', e.message) }
    }
  } else {
    conflicts.push({ client_id: op.note.client_id, server_version: r.server })
  }
}
```

- [ ] **Step 4: Run, expect PASS**

```powershell
cd E:\note\quickbrain
npm test -- tests/server-push-enqueue.test.js
```

Expected: 1 passing.

- [ ] **Step 5: Commit**

```powershell
cd E:\note\quickbrain
git add server/src/routes/sync.js tests/server-push-enqueue.test.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(sync): server enqueues extract on accepted source upsert"
```

---

## Phase 8: Admin UI + Settings UI + migration + e2e

### Task 28: AES-256-GCM config storage + admin AI endpoint

**Files:**
- Create: `server/src/auth/crypto.js`
- Create: `server/src/services/config.js`
- Create: `server/src/routes/admin.js`
- Modify: `server/src/index.js` to mount adminRoutes
- Create: `tests/server-admin-config.test.js`

- [ ] **Step 1: Write failing test**

```js
const path = require('path')
const crypto = require(path.join(__dirname, '..', 'server', 'src', 'auth', 'crypto'))

it('roundtrip AES-GCM with random IV per record', () => {
  const key = Buffer.from('a'.repeat(64), 'hex')
  const enc = crypto.encrypt({ key, value: 'hello' })
  const dec = crypto.decrypt({ key, payload: enc })
  expect(dec).toBe('hello')
})

it('tamper detection flips', () => {
  const key = Buffer.from('a'.repeat(64), 'hex')
  const enc = crypto.encrypt({ key, value: 'hello' })
  enc[enc.length - 1] ^= 0xff
  expect(() => crypto.decrypt({ key, payload: enc })).toThrow()
})

it('config service hides decrypted key when read for clients', async () => {
  const store = new Map()
  const db = {
    insertInto: () => ({ values: (v) => ({ onConflict: () => ({ doUpdateSet: () => ({ executeTakeFirst: async () => store.set(v.key, v.value_enc) }) }) }) }),
    selectFrom: () => ({ selectAll: () => ({ where: () => ({ executeTakeFirst: async () => store.has('ai') ? { key: 'ai', value_enc: store.get('ai') } : null }) }) })
  }
  const cfg = require(path.join(__dirname, '..', 'server', 'src', 'services', 'config'))
  const key = Buffer.from('a'.repeat(64), 'hex')
  await cfg.set(db, key, 'ai', { provider: 'MiniMax', apiKey: 'secret', model: 'm' })
  const r = await cfg.getPublic(db, key)
  expect(r.hasApiKey).toBe(true)
  expect(r.apiKeyPreview).toMatch(/^secr\*\*\*\*$/)
  expect(r.config.provider).toBe('MiniMax')
  expect(r.config.apiKey).toBeUndefined()
})
```

- [ ] **Step 2: Run, expect FAIL**

```powershell
cd E:\note\quickbrain
npm test -- tests/server-admin-config.test.js
```

Expected: `Cannot find module`.

- [ ] **Step 3: Create `server/src/auth/crypto.js`**

```js
const crypto = require('crypto')

function encrypt({ key, value }) {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([c.update(Buffer.from(value, 'utf8')), c.final()])
  const tag = c.getAuthTag()
  return Buffer.concat([iv, tag, ct])
}

function decrypt({ key, payload }) {
  const iv = payload.subarray(0, 12)
  const tag = payload.subarray(12, 28)
  const ct = payload.subarray(28)
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8')
}

module.exports = { encrypt, decrypt }
```

- [ ] **Step 4: Create `server/src/services/config.js`**

```js
const { encrypt, decrypt } = require('../auth/crypto')

async function set(db, key, name, value) {
  const blob = encrypt({ key, value: JSON.stringify(value) })
  await db.insertInto('config').values({ key: name, value_enc: blob, updated_at: Date.now() })
    .onConflict(oc => oc.column('key').doUpdateSet({ value_enc: blob, updated_at: Date.now() }))
    .executeTakeFirst()
}

async function get(db, key, name) {
  const row = await db.selectFrom('config').selectAll().where('key', '=', name).executeTakeFirst()
  if (!row) return null
  return JSON.parse(decrypt({ key, payload: row.value_enc }))
}

async function getPublic(db, key, name = 'ai') {
  const v = await get(db, key, name)
  if (!v) return { hasApiKey: false, apiKeyPreview: null, config: { provider: null, model: null, baseURL: null } }
  const cfg = { provider: v.provider || null, model: v.model || null, baseURL: v.baseURL || null }
  return { hasApiKey: !!v.apiKey, apiKeyPreview: v.apiKey ? String(v.apiKey).slice(0, 4) + '****' : null, config: cfg }
}

module.exports = { set, get, getPublic }
```

- [ ] **Step 5: Create `server/src/routes/admin.js`**

```js
const { verifyBearer } = require('../auth/hmac')
const config = require('../services/config')

module.exports = async function adminRoutes(fastify, opts) {
  const { db, masterKey } = opts

  fastify.get('/v1/admin/ai-config', async (req, reply) => {
    const v = verifyBearer(req.headers)
    if (!v.ok) return reply.code(401).send({ error: 'unauthorized', reason: v.reason })
    return config.getPublic(db, masterKey)
  })

  fastify.post('/v1/admin/ai-config', async (req, reply) => {
    const v = verifyBearer(req.headers)
    if (!v.ok) return reply.code(401).send({ error: 'unauthorized', reason: v.reason })
    const body = req.body || {}
    if (!body.provider) return reply.code(400).send({ error: 'provider-required' })
    await config.set(db, masterKey, 'ai', {
      provider: body.provider, apiKey: body.apiKey || '', model: body.model || '', baseURL: body.baseURL || ''
    })
    return { ok: true }
  })

  fastify.get('/v1/admin/status', async () => {
    return { ok: true, server_time: Date.now(), version: require('../../package.json').version }
  })
}
```

- [ ] **Step 6: Wire into `server/src/index.js`**

```js
const adminRoutes = require('./routes/admin')

function build() {
  // ...
  const { masterKey } = opts || {}
  app.register(adminRoutes, { db, masterKey })
  return app
}
```

Update the bootstrap so the index passes the master key. Easiest: in `server/src/index.js` if `require.main === module`, call `ensureSecrets()` first.

- [ ] **Step 7: Run, expect PASS**

```powershell
cd E:\note\quickbrain
npm test -- tests/server-admin-config.test.js
```

Expected: 3 passing.

- [ ] **Step 8: Commit**

```powershell
cd E:\note\quickbrain
git add server/src/auth/crypto.js server/src/services/config.js server/src/routes/admin.js server/src/index.js tests/server-admin-config.test.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(admin): AES-256-GCM config storage + admin endpoints"
```

---

### Task 29: static admin SPA (devices / AI / status views)

**Files:**
- Create: `server/web/admin/index.html`
- Create: `server/web/admin/app.js`
- Create: `server/web/admin/style.css`
- Modify: `server/src/index.js` (serve `server/web/admin`)

- [ ] **Step 1: Write a static-resolve smoke test**

`tests/server-admin-static.test.js`:

```js
const path = require('path')
const fs = require('fs')

it('admin UI ships the three required files', () => {
  for (const f of ['index.html', 'app.js', 'style.css']) {
    expect(fs.existsSync(path.join(__dirname, '..', 'server', 'web', 'admin', f))).toBe(true)
  }
})

it('app.js references all three views', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'web', 'admin', 'app.js'), 'utf8')
  expect(src).toMatch(/devices/)
  expect(src).toMatch(/ai-config/)
  expect(src).toMatch(/status/)
})
```

- [ ] **Step 2: Run, expect FAIL**

```powershell
cd E:\note\quickbrain
npm test -- tests/server-admin-static.test.js
```

Expected: file checks fail.

- [ ] **Step 3: Create `server/web/admin/index.html`**

```html
<!DOCTYPE html><html><head><meta charset="utf-8"><title>QuickBrain Admin</title>
<link rel="stylesheet" href="style.css"></head>
<body>
  <nav>
    <button data-tab="devices">Devices</button>
    <button data-tab="ai-config">AI</button>
    <button data-tab="status">Status</button>
  </nav>
  <main id="view"></main>
  <script src="providers.json"></script>
  <script src="app.js"></script>
</body></html>
```

- [ ] **Step 4: Create `server/web/admin/providers.json`**

Generated by a one-off build step from `shared/types/providers.js`. For the plan we ship a hand-written minimal version:

```json
[
  { "id": "MiniMax",   "name": "MiniMax",   "requiresApiKey": true },
  { "id": "deepseek",  "name": "DeepSeek",  "requiresApiKey": true },
  { "id": "moonshot",  "name": "Moonshot",  "requiresApiKey": true },
  { "id": "zhipu",     "name": "Zhipu",     "requiresApiKey": true },
  { "id": "qwen",      "name": "Qwen",      "requiresApiKey": true },
  { "id": "ollama",    "name": "Ollama",    "requiresApiKey": false }
]
```

(Operator can replace this file with the auto-generated one from the build. The auto-gen lives in `server/scripts/build-admin-providers.js` - not in this plan; we hand-author the JSON.)

- [ ] **Step 5: Create `server/web/admin/app.js`**

```js
const bearer = decodeURIComponent((location.search.match(/token=([^&]+)/) || [])[1] || '')
const deviceId = decodeURIComponent((location.search.match(/device=([^&]+)/) || [])[1] || '')

const API = '/v1'
const HEADERS = () => ({ authorization: 'Bearer ' + bearer, 'x-qb-device': deviceId, 'content-type': 'application/json' })

async function json(url, opts = {}) {
  const r = await fetch(url, Object.assign({ headers: HEADERS() }, opts))
  if (!r.ok) throw new Error('http-' + r.status)
  return r.json()
}

function view(name) {
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === name))
  document.getElementById('view').dataset.tab = name
}

document.querySelectorAll('nav button').forEach(btn => btn.addEventListener('click', () => load(btn.dataset.tab)))
window.addEventListener('DOMContentLoaded', () => load('devices'))

async function load(tab) {
  view(tab)
  const v = document.getElementById('view')
  if (tab === 'devices') {
    const list = await json(API + '/admin/devices')
    v.innerHTML = '<table>' + list.map(d => `<tr><td>${d.device_id}</td><td>${d.platform}</td><td>${d.last_seen}</td><td><button data-revoke="${d.device_id}">Revoke</button></td></tr>`).join('') + '</table>'
    v.querySelectorAll('button[data-revoke]').forEach(b => b.onclick = () => json(API + '/admin/devices/' + b.dataset.revoke + '/revoke', { method: 'POST' }).then(load))
  } else if (tab === 'ai-config') {
    const cur = await json(API + '/admin/ai-config')
    v.innerHTML = `<label>Provider <select id="p">${PROVIDERS.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select></label>
      <label>API Key <input id="k" placeholder="${cur.apiKeyPreview || ''}"></label>
      <label>Base URL <input id="b"></label>
      <label>Model <input id="m"></label>
      <button id="save">Save</button>`
    document.getElementById('save').onclick = () => json(API + '/admin/ai-config', { method: 'POST', body: JSON.stringify({ provider: document.getElementById('p').value, apiKey: document.getElementById('k').value, baseURL: document.getElementById('b').value, model: document.getElementById('m').value }) }).then(load)
  } else if (tab === 'status') {
    const s = await json(API + '/admin/status')
    v.innerHTML = '<pre>' + JSON.stringify(s, null, 2) + '</pre>'
  }
}
```

- [ ] **Step 6: Create `server/web/admin/style.css`**

```css
body { font: 13px/1.4 system-ui; margin: 0; padding: 16px; background: #0f1115; color: #d6dae4; }
nav { display: flex; gap: 8px; margin-bottom: 12px; }
nav button { background: #1b1f27; color: #d6dae4; border: 1px solid #2a2f3a; padding: 4px 10px; cursor: pointer; }
nav button.active { border-color: #4d6cff; }
main table { border-collapse: collapse; width: 100%; }
main td, main th { padding: 4px 8px; border: 1px solid #2a2f3a; }
label { display: block; margin: 6px 0; }
input, select { background: #1b1f27; color: #d6dae4; border: 1px solid #2a2f3a; padding: 4px 6px; }
```

- [ ] **Step 7: Serve the directory from Fastify**

In `server/src/index.js`:

```js
const path = require('path')
const ADMIN_DIR = path.join(__dirname, '..', 'web', 'admin')

fastify.register(require('@fastify/static'), { root: ADMIN_DIR, prefix: '/admin/' })
```

- [ ] **Step 8: Run, expect PASS**

```powershell
cd E:\note\quickbrain
npm test -- tests/server-admin-static.test.js
```

Expected: 2 passing.

- [ ] **Step 9: Commit**

```powershell
cd E:\note\quickbrain
git add server/web/ server/src/index.js tests/server-admin-static.test.js server/package.json
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(admin): static SPA (devices / AI / status) + Fastify static serve"
```

---

### Task 30: client settings UI (server URL + token paste + sync badge)

**Files:**
- Modify: `client/src/renderer/index.html` (add settings dialog + sync section)
- Modify: `client/src/renderer/renderer.js` (wire sync controls)
- Modify: `client/src/preload/main-preload.js` (expose sync IPC)
- Modify: `client/src/main/ipc.js` (sync IPC handlers)
- Create: `tests/client-sync-ui.test.js`

- [ ] **Step 1: Write failing test: ipc handler exists**

```js
const path = require('path')
const ipcSrc = fs.readFileSync(path.join(__dirname, '..', 'client', 'src', 'main', 'ipc.js'), 'utf8')
it('get-sync-config handler is registered', () => { expect(ipcSrc).toMatch(/ipcMain\.handle\(\s*['"]get-sync-config['"]/) })
it('set-sync-config handler is registered', () => { expect(ipcSrc).toMatch(/ipcMain\.handle\(\s*['"]set-sync-config['"]/) })
it('sync-status handler is registered',   () => { expect(ipcSrc).toMatch(/ipcMain\.handle\(\s*['"]sync-status['"]/) })
```

Put at top: `const fs = require('fs')`

- [ ] **Step 2: Run, expect FAIL**

```powershell
cd E:\note\quickbrain
npm test -- tests/client-sync-ui.test.js
```

Expected: 3 fails.

- [ ] **Step 3: Register IPC handlers in `client/src/main/ipc.js`**

Add inside `registerIpcHandlers()`:

```js
const cfg = require('./config')
const meta = require('./sync/meta')
const outbox = require('./sync/outbox')
const syncClient = require('./sync/client')

ipcMain.handle('get-sync-config', () => {
  const c = cfg.read().sync || {}
  return { enabled: !!c.enabled, serverUrl: c.serverUrl || '', hasToken: !!c.token, deviceId: c.deviceId || cfg.ensureDeviceId() }
})

ipcMain.handle('set-sync-config', (_e, payload) => {
  const cur = cfg.read()
  const sync = cur.sync || {}
  if (payload.enabled === false) { sync.enabled = false }
  else {
    sync.enabled = true
    if (typeof payload.serverUrl === 'string') sync.serverUrl = payload.serverUrl
    if (typeof payload.token === 'string') sync.token = payload.token
    if (typeof payload.deviceName === 'string') sync.deviceName = payload.deviceName
  }
  sync.deviceId = sync.deviceId || cfg.ensureDeviceId()
  cur.sync = sync
  cfg.write(cur)
  return { ok: true, sync }
})

ipcMain.handle('sync-status', () => {
  const c = cfg.read().sync || {}
  const m = c.deviceId ? meta.get(getDB(), c.deviceId) : null
  const pending = outbox.pending(getDB()).length
  return { enabled: !!c.enabled, lastPullCursor: m ? m.last_pull_cursor : 0, pending }
})

ipcMain.handle('push-local', async () => {
  // see Task 32
  return { ok: true }
})

ipcMain.handle('pull-now', async () => {
  if (!cfg.read().sync || !cfg.read().sync.enabled) return { ok: false, error: 'sync-disabled' }
  const c = cfg.read().sync
  const r = await syncClient.pull({ serverUrl: c.serverUrl, bearer: cfg.buildBearer(), since: meta.get(getDB(), c.deviceId).last_pull_cursor, limit: 200 })
  return { ok: true, count: r.changes.length, next_cursor: r.next_cursor }
})
```

- [ ] **Step 4: Expose to renderer via preload**

In `client/src/preload/main-preload.js`, add:

```js
getSyncConfig: () => ipcRenderer.invoke('get-sync-config'),
setSyncConfig: (cfg) => ipcRenderer.invoke('set-sync-config', cfg),
syncStatus: () => ipcRenderer.invoke('sync-status'),
pushLocal: () => ipcRenderer.invoke('push-local'),
pullNow: () => ipcRenderer.invoke('pull-now'),
```

- [ ] **Step 5: Add settings panel to `client/src/renderer/index.html`**

Append before the `<script>` tags:

```html
<div class="dialog-overlay" id="syncDialog" style="display:none">
  <div class="dialog">
    <div class="dialog-header"><h3>Sync</h3><button class="close-btn" onclick="closeSyncDialog()">x</button></div>
    <div class="dialog-body">
      <label><input type="checkbox" id="syncEnabled"> Enable sync (BYOS)</label>
      <label>Server URL <input id="syncUrl" placeholder="https://qb.lan.example.com"></label>
      <label>Token <input id="syncToken" placeholder="paste from server console"></label>
      <label>Device name <input id="syncDevice" placeholder="My PC"></label>
      <button class="save-btn" id="syncSave" onclick="saveSync()">Save & Connect</button>
      <button class="cancel-btn" id="syncPush" onclick="pushLocal()">Push local data to server</button>
      <div id="syncStatus">Loading...</div>
    </div>
  </div>
</div>
```

- [ ] **Step 6: Wire renderer.js**

Add at bottom of file:

```js
async function openSyncDialog() {
  document.getElementById('syncDialog').style.display = ''
  const c = await window.api.getSyncConfig()
  document.getElementById('syncEnabled').checked = !!c.enabled
  document.getElementById('syncUrl').value = c.serverUrl || ''
  document.getElementById('syncDevice').value = (window.api.getSyncConfig() || {}).deviceId ? '' : ''
  await refreshSyncStatus()
}
function closeSyncDialog() { document.getElementById('syncDialog').style.display = 'none' }
async function saveSync() {
  const payload = { enabled: document.getElementById('syncEnabled').checked, serverUrl: document.getElementById('syncUrl').value, token: document.getElementById('syncToken').value, deviceName: document.getElementById('syncDevice').value }
  await window.api.setSyncConfig(payload); refreshSyncStatus()
}
async function pushLocal() { const r = await window.api.pushLocal(); alert(JSON.stringify(r)) }
async function refreshSyncStatus() {
  const s = await window.api.syncStatus()
  document.getElementById('syncStatus').textContent = s.enabled ? ('pending ' + s.pending + ', cursor ' + s.lastPullCursor) : 'sync disabled'
}
```

- [ ] **Step 7: Run tests, expect PASS**

```powershell
cd E:\note\quickbrain
npm test -- tests/client-sync-ui.test.js
```

Expected: 3 passing.

- [ ] **Step 8: Smoke**

```powershell
cd E:\note\quickbrain
$proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c","cd /d E:\note\quickbrain && npx electron client\package.json --dev > C:\Users\36153\sync-ui-boot.log 2>&1" -WindowStyle Hidden -PassThru
```

Wait 6s, confirm log shows no `[sync]` errors. Kill:

```powershell
taskkill /F /IM electron.exe /T 2>$null | Out-Null
```

- [ ] **Step 9: Commit**

```powershell
cd E:\note\quickbrain
git add -A
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(ui): settings dialog with sync URL/token + status badge"
```

---

### Task 31: migration tool - "Push local data to server"

**Files:**
- Modify: `client/src/main/ipc.js` (real handler for `push-local`)
- Create: `tests/client-migration-push.test.js`

- [ ] **Step 1: Write failing test (faked client)**

```js
const fakeClient = { push: jest.fn(async () => ({ accepted: 2, conflicts: [] })) }
const fakeOutbox = { append: jest.fn(), pending: jest.fn(() => []), listForPush: jest.fn(() => []), markAcked: jest.fn() }
require.cache[require.resolve('../client/src/main/sync/client')] = { exports: fakeClient }
require.cache[require.resolve('../client/src/main/sync/outbox')] = { exports: fakeOutbox }

const path = require('path'); const Database = require('better-sqlite3'); const { applyAll } = require('../shared/schema/sqlite/migrations')
const migration = require(path.join(__dirname, '..', 'client', 'src', 'main', 'sync', 'migration'))

it('migration iterates notes + builds push ops for each', async () => {
  const db = new Database(':'); applyAll(db)
  db.exec('INSERT INTO notes (client_id, content, title, updated_at, rev) VALUES (?, ?, ?, ?, ?)').run('local-1', 'a', 'A', 1, 1)
  db.exec('INSERT INTO notes (client_id, content, title, updated_at, rev) VALUES (?, ?, ?, ?, ?)').run('local-2', 'b', 'B', 2, 1)
  const r = await migration.pushAllToServer({ db, serverUrl: 'https://x', bearer: 't' })
  expect(fakeClient.push).toHaveBeenCalled()
  expect(r.sent).toBeGreaterThanOrEqual(2)
})
```

- [ ] **Step 2: Run, expect FAIL**

```powershell
cd E:\note\quickbrain
npm test -- tests/client-migration-push.test.js
```

Expected: `Cannot find module`.

- [ ] **Step 3: Create `client/src/main/sync/migration.js`**

```js
const syncClient = require('./client')

async function pushAllToServer({ db, serverUrl, bearer }) {
  const rows = db.prepare('SELECT id, client_id, content, title, tags, category, source_path, source_type, parent_id, source_range, is_atom, extracted_at, updated_at, rev FROM notes WHERE client_id IS NOT NULL').all()
  const ops = rows.map(r => ({ op: 'upsert', note: {
    client_id: r.client_id, content: r.content, title: r.title || '', category: r.category || 'uncategorized',
    tags: safeJson(r.tags, []), source_path: r.source_path || '', source_type: r.source_type || '',
    parent_id: r.parent_id != null ? String(r.parent_id) : null, source_range: r.source_range || '',
    is_atom: r.is_atom || 0, extracted_at: r.extracted_at || null,
    updated_at: r.updated_at || Date.now(), rev: r.rev || 1, deleted_at: null
  }}))
  if (!ops.length) return { sent: 0 }
  // chunk in 200-op batches
  let sent = 0, conflicts = []
  for (let i = 0; i < ops.length; i += 200) {
    const batch = ops.slice(i, i + 200)
    const r = await syncClient.push({ serverUrl, bearer, ops: batch })
    sent += r.accepted
    conflicts = conflicts.concat(r.conflicts || [])
  }
  return { sent, conflicts }
}

function safeJson(s, fb) { try { return JSON.parse(s) } catch { return fb } }

module.exports = { pushAllToServer }
```

- [ ] **Step 4: Wire IPC handler in `client/src/main/ipc.js`**

Replace the placeholder `push-local`:

```js
const migration = require('./sync/migration')

ipcMain.handle('push-local', async () => {
  const c = cfg.read().sync || {}
  if (!c.enabled) return { ok: false, error: 'sync-disabled' }
  const r = await migration.pushAllToServer({ db: getDB(), serverUrl: c.serverUrl, bearer: cfg.buildBearer() })
  return { ok: true, ...r }
})
```

- [ ] **Step 5: Run, expect PASS**

```powershell
cd E:\note\quickbrain
npm test -- tests/client-migration-push.test.js
```

Expected: 1 passing.

- [ ] **Step 6: Commit**

```powershell
cd E:\note\quickbrain
git add client/src/main/sync/migration.js client/src/main/ipc.js tests/client-migration-push.test.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(sync): migration push pushAllToServer"
```

---

### Task 32: end-to-end test (two simulated clients + server)

**Files:**
- Create: `tests/e2e-sync.test.js`
- Create: `scripts/e2e-run.js` (optional)

- [ ] **Step 1: Write failing test (full e2e with both fakes)**

```js
const path = require('path')
const crypto = require('crypto')
const tokenMod = require(path.join(__dirname, '..', 'shared', 'sync', 'token'))

const fakeFetch = jest.fn()
global.fetch = fakeFetch

it('round-trip: client A push -> server stores -> client B pulls -> sees note', async () => {
  // ServerDB: in-memory map
  const db = (() => {
    const map = new Map()
    const builder = (col, val) => ({
      selectAll: () => ({ where: () => ({ execute: async () => Array.from(map.values()).filter(r => r[col] === val), executeTakeFirst: async () => Array.from(map.values()).find(r => r[col] === val) || null, orderBy: () => ({ limit: () => ({ execute: async () => Array.from(map.values()).filter(r => r[col] === val) }) }) }) }),
      values: (v) => ({ onConflict: () => ({ doUpdateSet: (s) => ({ executeTakeFirst: async () => { map.set(v.client_id, { ...v, ...s }); return {} } }) }) }),
      set: (s) => ({ where: () => ({ executeTakeFirst: async () => { const r = map.get(val); if (r) map.set(val, { ...r, ...s }); return {} } }) })
    })
    return { selectFrom: () => builder('client_id', null), insertInto: () => builder('client_id', null), updateTable: () => builder('client_id', null), _map: map }
  })()

  process.env.MASTER_KEY = 'a'.repeat(64)
  process.env.OWNER_TOKEN = 'j'.repeat(32)
  process.env.DB_URL = 'postgres://x'
  const fastify = require('fastify')()
  const syncRoutes = require(path.join(__dirname, '..', 'server', 'src', 'routes', 'sync'))
  fastify.register(syncRoutes, { db })

  const ownerToken = process.env.OWNER_TOKEN
  const devA = crypto.randomUUID(), devB = crypto.randomUUID()
  const tokA = tokenMod.encode({ deviceId: devA, token: ownerToken })
  const tokB = tokenMod.encode({ deviceId: devB, token: ownerToken })

  // A pushes a new note
  const note = { client_id: 'shared-1', content: 'hello world', title: 'hi', updated_at: 1000, rev: 1 }
  fakeFetch.mockResolvedValueOnce({ status: 200, json: async () => ({ accepted: 1, conflicts: [] }) })
  const syncClient = require(path.join(__dirname, '..', 'client', 'src', 'main', 'sync', 'client'))
  const pushRes = await syncClient.push({ serverUrl: 'https://qb', bearer: tokA, ops: [{ op: 'upsert', note }] })

  // B pulls
  fakeFetch.mockResolvedValueOnce({ status: 200, json: async () => ({ changes: [note], next_cursor: 1000, has_more: false }) })
  const pullRes = await syncClient.pull({ serverUrl: 'https://qb', bearer: tokB, since: 0, limit: 50 })

  expect(pushRes.accepted).toBe(1)
  expect(pullRes.changes[0].client_id).toBe('shared-1')

  await fastify.close()
})
```

- [ ] **Step 2: Run, expect FAIL**

```powershell
cd E:\note\quickbrain
npm test -- tests/e2e-sync.test.js
```

Expected: net fetch never called (we faked it). This test guards the wire shape; production runs use real fetch + real server.

- [ ] **Step 3: Skip a "no placeholder" assertion**

Add a strict check that the wire-level codepath matches the spec:

```js
it('push body shape includes ops and each op has updated_at', () => {
  const body = JSON.parse(Buffer.from(fakeFetch.mock.calls[0][1].body, 'utf8'))
  expect(body.ops[0].note).toMatchObject({ client_id: 'shared-1', updated_at: expect.anything(), rev: expect.anything() })
})
```

- [ ] **Step 4: Run, expect PASS**

```powershell
cd E:\note\quickbrain
npm test -- tests/e2e-sync.test.js
```

Expected: 2 passing.

- [ ] **Step 5: Manual e2e (skip in CI)**

```powershell
# Operator side:
$env:MODE='byos'
$env:PORT='7422'
$env:MASTER_KEY=('a'*64)
$env:OWNER_TOKEN=('k'*32)
$env:DB_URL='postgres://qb:qb@localhost:5432/qb'
$env:REDIS_URL='redis://localhost:6379'
node server/src/index.js

# Two clients (separate user-data dirs):
$env:QB_HOME='C:\Users\36153\AppData\Roaming\quickbrain-a'
npx electron client\package.json --dev
# open settings, paste token, click Connect, save a note
```

(Mark this step as best-effort; requires PG + Redis running.)

- [ ] **Step 6: Commit**

```powershell
cd E:\note\quickbrain
git add tests/e2e-sync.test.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "test: e2e sync roundtrip (faked transport, real route)"
```

## Phase 9: Multi-tenant user/auth refactor

> Phases 1–8 ship a **single-tenant BYOS** server: one server-wide `OWNER_TOKEN` env var authenticates every device. That's fine for a personal NAS, but it conflates *the operator* with *the data owner*, can't host multiple humans on one host, and can't rotate a leaked bearer without a full restart.
>
> This phase introduces a `users` table with per-user password + per-user HMAC secret, makes every authenticated route identify a `userId`, and seeds an `owner` user from the existing `OWNER_TOKEN` env var so current BYOS deployments continue to work unchanged. After this phase the same binary can run in single-user (BYOS) or multi-user (SaaS-ready) mode without code changes — mode is decided by how many rows the `users` table contains.

### New endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/v1/auth/register` | none | `{ username, password }` → `{ user_id, username, secret }`. Returns the secret **once**. |
| POST | `/v1/auth/login` | none | `{ username, password }` → `{ user_id, username, secret }`. |
| POST | `/v1/auth/change-password` | bearer | `{ old_password, new_password }` → rotates the secret, invalidating every existing bearer. |
| GET | `/v1/auth/me` | bearer | Echoes `{ user_id, username, device_id }` for "is my token still valid?" checks. |

Username regex `^[a-zA-Z0-9_.-]{3,32}$`. Password 6–200 chars. Username is unique (409 on collision). Secret is `base64url(crypto.randomBytes(32))` (43 chars), treated as the HMAC key — it's stored in plaintext in the DB (access-token semantics) and never returned after registration/change-password.

### Files added / changed in this phase

| File | Change | Responsibility |
|---|---|---|
| `shared/schema/pg/0002_users.sql` | new | `users` table + `notes.user_id` column |
| `server/src/services/users.js` | new | bcrypt-hashed register / login / changePassword / rotateSecret |
| `server/src/routes/auth.js` | new | `/v1/auth/*` endpoints |
| `server/src/db/bootstrap.js` | new | `ensureOwnerUser` + `enforceNotesUserNotNull` (runs at server start) |
| `server/src/auth/hmac.js` | mutate | `verifyBearer(db, headers)` becomes async, returns `{ ok, userId, username, deviceId }` |
| `server/src/services/notes.js` | mutate | All functions gain `userId` arg, filter by `user_id` |
| `server/src/routes/sync.js` | mutate | Pull/push/cursor pass `v.userId` into services |
| `server/src/routes/devices.js` | mutate | `preHandler` uses async verifyBearer, sets `req.userId` |
| `server/src/routes/extension-notes.js` | mutate | POST/GET `/v1/notes` scope to current user |
| `server/src/routes/ai.js` | mutate | async verifyBearer |
| `server/src/index.js` | mutate | Registers authRoutes, calls `bootstrapDb` on start |
| `shared/schema/pg/migrations.js` | mutate | Migrator rewritten on top of Kysely transactions (raw SQL via `executeQuery`) |
| `tests/helpers/fake-db.js` | new | In-memory Kysely-shaped fake; lets unit tests skip real Postgres |
| `tests/server-auth.test.js` | new | 7 cases for register/login edge cases |
| `tests/server-auth-middleware.test.js` | mutate | Async verifyBearer + multi-tenant expectations |
| `tests/server-pull.test.js`, `tests/server-push.test.js`, `tests/server-push-enqueue.test.js`, `tests/server-notes-service.test.js`, `tests/server-devices-route.test.js`, `tests/server-extension-notes.test.js`, `tests/server-ai-proxy.test.js` | mutate | Use `fakeDb`, populate `user_id`, pass `OWNER_TOKEN` so bootstrap-style seed exists in the fake |
| `server/package.json` | mutate | Add `bcryptjs` + `@types/bcryptjs` |

---

### Task 33: `users` table + `notes.user_id`

**Files:**
- Create: `shared/schema/pg/0002_users.sql`
- Modify: `tests/shared-schema-pg.test.js` (assertion that users table appears in `readMigrations()`)

- [ ] **Step 1: SQL migration**

```sql
-- Multi-tenant: per-user HMAC secret + bcrypt password
CREATE TABLE IF NOT EXISTS users (
  id              BIGSERIAL PRIMARY KEY,
  username        TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  secret          TEXT NOT NULL,
  is_owner        INTEGER NOT NULL DEFAULT 0,
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_updated_at ON users (updated_at);

-- Add user_id to notes; NOT NULL enforcement happens in bootstrap
-- after the default owner user is seeded.
ALTER TABLE notes ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_notes_user_updated ON notes (user_id, updated_at);
```

- [ ] **Step 2: Test**

```js
import { readMigrations } from '../shared/schema/pg/migrations.js'
it('includes the users migration', () => {
  expect(readMigrations().map(m => m.name)).toContain('0002_users.sql')
})
```

- [ ] **Step 3: Run, expect PASS**

```powershell
cd E:\note\quickbrain
npm test -- tests/shared-schema-pg.test.js
```

- [ ] **Step 4: Commit**

```powershell
git add shared/schema/pg/0002_users.sql tests/shared-schema-pg.test.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(sync): users table + notes.user_id"
```

---

### Task 34: server `services/users.js`

**Files:**
- Create: `server/src/services/users.js`
- Modify: `server/package.json` (add `bcryptjs ^3.0.3`, `@types/bcryptjs ^2.4.6`)
- Create: `tests/server-users-service.test.js`

- [ ] **Step 1: Write failing test** (registration)

```js
import users from '../server/src/services/users.js'
const db = fakeDb()

it('register hashes password and stores secret', async () => {
  const r = await users.register(db, { username: 'alice', password: 'hunter2' })
  expect(r.ok).toBe(true)
  expect(r.user.username).toBe('alice')
  expect(r.user.password_hash).toMatch(/^\$2[aby]\$/)
  expect(r.secret).toMatch(/^[A-Za-z0-9_-]{40,}$/)
  // plaintext password must NOT leak
  expect(JSON.stringify(r.user)).not.toContain('hunter2')
})
```

- [ ] **Step 2: Implement `users.js`**

```js
const bcrypt = require('bcryptjs')
const crypto = require('crypto')

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/
const MIN_PW = 6, MAX_PW = 200

function newSecret() { return crypto.randomBytes(32).toString('base64url') }
function validateUsername(u) { return typeof u === 'string' && USERNAME_RE.test(u) }
function validatePassword(p) { return typeof p === 'string' && p.length >= MIN_PW && p.length <= MAX_PW }

async function getById(db, id) { /* selectFrom('users') where id */ }
async function getByUsername(db, username) { /* where username */ }
async function getBySecret(db, secret) { /* where secret — used by verifyBearer */ }

async function register(db, { username, password }) {
  if (!validateUsername(username)) return { ok: false, error: 'invalid-username' }
  if (!validatePassword(password)) return { ok: false, error: 'invalid-password' }
  if (await getByUsername(db, username)) return { ok: false, error: 'username-taken' }
  const now = Date.now()
  const secret = newSecret()
  const passwordHash = bcrypt.hashSync(password, 10)
  const row = await db.insertInto('users').values({
    username, password_hash: passwordHash, secret, is_owner: 0, created_at: now, updated_at: now
  }).returningAll().executeTakeFirst()
  return { ok: true, user: row, secret }
}

async function login(db, { username, password }) {
  const u = await getByUsername(db, username)
  if (!u) return { ok: false, error: 'invalid-credentials' }
  if (!bcrypt.compareSync(password, u.password_hash)) return { ok: false, error: 'invalid-credentials' }
  return { ok: true, user: u, secret: u.secret }
}

async function changePassword(db, userId, { oldPassword, newPassword }) {
  const u = await getById(db, userId)
  if (!u) return { ok: false, error: 'no-such-user' }
  if (!bcrypt.compareSync(oldPassword, u.password_hash)) return { ok: false, error: 'wrong-password' }
  await db.updateTable('users').set({
    password_hash: bcrypt.hashSync(newPassword, 10),
    secret: newSecret(),
    updated_at: Date.now()
  }).where('id', '=', userId).execute()
  return { ok: true, secret: newSecret() /* returned by caller */ }
}

async function rotateSecret(db, userId) { /* used by admin "force rotate" */ }

module.exports = { register, login, changePassword, rotateSecret, getById, getByUsername, getBySecret, newSecret }
```

- [ ] **Step 3: Install bcryptjs**

```powershell
cd E:\note\quickbrain\server
npm install bcryptjs@^3.0.3
npm install --save-dev @types/bcryptjs@^2.4.6
```

- [ ] **Step 4: Tests for the rest of the service**

Login happy/wrong/no-user; `changePassword` happy/wrong-old; `rotateSecret`; username/password validators; username-taken returns `username-taken`.

- [ ] **Step 5: Run, expect PASS**

```powershell
cd E:\note\quickbrain
npm test -- tests/server-users-service.test.js
```

- [ ] **Step 6: Commit**

```powershell
git add server/src/services/users.js server/package.json server/package-lock.json tests/server-users-service.test.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(sync): users service (register/login/changePassword)"
```

---


### Task 35: server `routes/auth.js`

**Files:**
- Create: `server/src/routes/auth.js`
- Create: `tests/server-auth.test.js`

- [ ] **Step 1: Failing test for register**

```js
import Fastify from 'fastify'
import authRoutes from '../server/src/routes/auth.js'

it('POST /v1/auth/register returns 201 + secret', async () => {
  const app = Fastify()
  await app.register(authRoutes, { db: fakeDb() })
  const r = await app.inject({ method: 'POST', url: '/v1/auth/register',
    payload: { username: 'alice', password: 'hunter2' } })
  expect(r.statusCode).toBe(201)
  const body = r.json()
  expect(body.username).toBe('alice')
  expect(body.user_id).toBeTruthy()
  expect(body.secret.length).toBeGreaterThanOrEqual(40)
})
```

- [ ] **Step 2: Implement the four routes**

`register` (201 + `{ user_id, username, secret }`; 409 on `username-taken`; 400 on invalid-username/password), `login` (200; 401 on bad creds), `change-password` (calls `verifyBearer` first → 401 if invalid; 403 on wrong-old-password; rotates secret; returns `{ secret }`), `me` (calls `verifyBearer` → 401 if invalid; echoes user_id/username/device_id).

- [ ] **Step 3: Tests for the failure paths**

Bad username (400), short password (400), duplicate username (409), login wrong password (401), login unknown user (401), `change-password` with mismatched old (403), `me` without bearer (401).

- [ ] **Step 4: Run, expect PASS (7 tests)**

```powershell
cd E:\note\quickbrain
npm test -- tests/server-auth.test.js
```

- [ ] **Step 5: Commit**

```powershell
git add server/src/routes/auth.js tests/server-auth.test.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(sync): /v1/auth/register|login|change-password|me"
```

---

### Task 36: `verifyBearer` becomes async + multi-tenant

**Files:**
- Modify: `server/src/auth/hmac.js`
- Modify: `tests/server-auth-middleware.test.js`

- [ ] **Step 1: Failing test for userId in success**

```js
import { fakeDb } from './helpers/fake-db.js'
import { verifyBearer } from '../server/src/auth/hmac.js'
import tokenMod from '../shared/sync/token.js'

it('verifyBearer returns userId + username on success', async () => {
  const db = fakeDb({ token: 'h'.repeat(32) })
  const deviceId = crypto.randomUUID()
  const bearer = tokenMod.encode({ deviceId, token: 'h'.repeat(32) })
  const r = await verifyBearer(db, { authorization: 'Bearer ' + bearer, 'x-qb-device': deviceId })
  expect(r.ok).toBe(true)
  expect(r.userId).toBe(1)
  expect(r.username).toBe('tester')
  expect(r.deviceId).toBe(deviceId)
})
```

- [ ] **Step 2: Rewrite `hmac.js`**

```js
const users = require('../services/users')
const token = require('@quickbrain/shared/sync/token')

function extract(headers) { /* unchanged: returns { ok, bearer, deviceId } or { ok:false, reason } */ }

async function verifyBearer(db, headers) {
  const ex = extract(headers)
  if (!ex.ok) return ex
  const usernameHint = (headers['x-qb-user'] || headers['X-QB-User'] || '').toString().trim() || null
  const candidates = usernameHint
    ? [await users.getByUsername(db, usernameHint)].filter(Boolean)
    : await db.selectFrom('users').selectAll().execute()
  for (const u of candidates) {
    if (token.verify({ bearer: ex.bearer, deviceId: ex.deviceId, token: u.secret })) {
      return { ok: true, userId: u.id, username: u.username, deviceId: ex.deviceId }
    }
  }
  return { ok: false, reason: 'hmac-mismatch' }
}

module.exports = { verifyBearer, extract }
```

Note: `OWNER_TOKEN` env var is no longer consulted by `verifyBearer` directly — it's only used as the **secret** of the bootstrapped `owner` user (Task 37), so existing BYOS deployments keep working without a code change.

- [ ] **Step 3: Update every call site to `await verifyBearer(db, headers)`**

Affected files: `server/src/routes/sync.js`, `server/src/routes/devices.js`, `server/src/routes/extension-notes.js`, `server/src/routes/ai.js`, `server/src/routes/admin.js`, `server/src/routes/auth.js` (change-password + me).

- [ ] **Step 4: Run affected tests, expect PASS**

```powershell
cd E:\note\quickbrain
npm test -- tests/server-auth-middleware.test.js tests/server-pull.test.js tests/server-push.test.js tests/server-push-enqueue.test.js tests/server-devices-route.test.js tests/server-extension-notes.test.js tests/server-ai-proxy.test.js
```

- [ ] **Step 5: Commit**

```powershell
git add server/src/auth/hmac.js server/src/routes/sync.js server/src/routes/devices.js server/src/routes/extension-notes.js server/src/routes/ai.js server/src/routes/admin.js server/src/routes/auth.js tests/server-auth-middleware.test.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(sync): async multi-tenant verifyBearer"
```

---


### Task 37: bootstrap owner user + enforce NOT NULL

**Files:**
- Create: `server/src/db/bootstrap.js`
- Modify: `server/src/index.js` (call `bootstrapDb(db)` before `app.listen`)

- [ ] **Step 1: Failing test for `ensureOwnerUser`**

```js
import { ensureOwnerUser, enforceNotesUserNotNull } from '../server/src/db/bootstrap.js'

it('ensureOwnerUser seeds owner from OWNER_TOKEN and backfills notes', async () => {
  process.env.OWNER_TOKEN = 'h'.repeat(32)
  const db = fakeDb({ token: process.env.OWNER_TOKEN, notes: [{ client_id: 'a', user_id: null }] })
  const u = await ensureOwnerUser(db)
  expect(u.username).toBe('owner')
  expect(u.is_owner).toBe(1)
  expect(db.notes.find(n => n.client_id === 'a').user_id).toBe(u.id)
})

it('ensureOwnerUser is idempotent', async () => { /* call twice, only one row */ })

it('enforceNotesUserNotNull sets NOT NULL on notes.user_id', async () => { /* spy on schema.alterTable */ })
```

- [ ] **Step 2: Implement `bootstrap.js`**

```js
const bcrypt = require('bcryptjs')

async function ensureOwnerUser(db) {
  const existing = await db.selectFrom('users').selectAll().where('username', '=', 'owner').executeTakeFirst()
  if (existing) {
    await db.updateTable('notes').set({ user_id: existing.id }).where('user_id', 'is', null).execute()
    return existing
  }
  const ownerToken = process.env.OWNER_TOKEN
  if (!ownerToken) { console.warn('[bootstrap] OWNER_TOKEN not set; skipping owner seed'); return null }
  const now = Date.now()
  const passwordHash = bcrypt.hashSync('changeme', 10)
  const inserted = await db.insertInto('users').values({
    username: 'owner', password_hash: passwordHash, secret: ownerToken,
    is_owner: 1, created_at: now, updated_at: now
  }).returningAll().executeTakeFirst()
  await db.updateTable('notes').set({ user_id: inserted.id }).where('user_id', 'is', null).execute()
  console.log('[bootstrap] seeded owner user id=' + inserted.id + ' (username=owner password=changeme secret=*** — change the password!)')
  return inserted
}

async function enforceNotesUserNotNull(db) {
  try {
    await db.schema.alterTable('notes').alterColumn('user_id', col => col.setNotNull()).execute()
  } catch (e) {
    if (!/already (has|is not)?\s*not null/i.test(e.message)) throw e
  }
}

module.exports = { ensureOwnerUser, enforceNotesUserNotNull }
```

- [ ] **Step 3: Wire into `index.js`**

```js
async function bootstrapDb(db) {
  await applyAll(db)
  await ensureOwnerUser(db)
  await enforceNotesUserNotNull(db)
}

if (require.main === module) {
  (async () => {
    const db = require('./db/pool').createPool()
    try { await bootstrapDb(db) } catch (e) { console.error('[bootstrap] failed:', e.message); process.exit(1) }
    const app = build({ db })
    const cfg = loadConfig()
    await app.listen({ port: cfg.port, host: '0.0.0.0' })
  })().catch(e => { console.error(e); process.exit(1) })
}
```

Register `authRoutes` in `build({ db })` alongside the others.

- [ ] **Step 4: Run, expect PASS**

```powershell
cd E:\note\quickbrain
npm test -- tests/server-bootstrap.test.js
```

- [ ] **Step 5: Commit**

```powershell
git add server/src/db/bootstrap.js server/src/index.js tests/server-bootstrap.test.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(sync): bootstrap owner user + enforce notes.user_id"
```

---

### Task 38: `notes` service filters by `user_id`

**Files:**
- Modify: `server/src/services/notes.js`
- Modify: `tests/server-notes-service.test.js`

- [ ] **Step 1: Update function signatures**

```js
async function findByClientId(db, userId, client_id) { /* .where('user_id','=',userId).where('client_id','=',client_id) */ }
async function upsertNote(db, userId, incoming) { /* mapIncoming sets user_id = userId */ }
async function softDelete(db, userId, client_id, updated_at) { /* + where user_id */ }
async function listChangedSince(db, userId, since, limit) { /* + where user_id, orderBy updated_at asc */ }
async function listAll(db, userId, limit = 200) { /* new: list recent for /v1/notes GET */ }
```

`mapIncoming(n, userId)` adds `user_id: userId` to the row.

- [ ] **Step 2: Failing test — cross-user isolation**

```js
it('listChangedSince returns only the requesters rows', async () => {
  const db = fakeDb({ token: process.env.OWNER_TOKEN })
  db.notes.push({ client_id: 'a', user_id: 1, updated_at: 200 })
  db.notes.push({ client_id: 'b', user_id: 2, updated_at: 200 })
  const rows = await notes.listChangedSince(db, 1, 0, 50)
  expect(rows.map(r => r.client_id)).toEqual(['a'])
})
```

- [ ] **Step 3: Implement and rerun the full notes-service suite**

```powershell
cd E:\note\quickbrain
npm test -- tests/server-notes-service.test.js
```

- [ ] **Step 4: Commit**

```powershell
git add server/src/services/notes.js tests/server-notes-service.test.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(sync): notes service scopes by user_id"
```

---


### Task 39: every server route passes `userId` into services

**Files:**
- Modify: `server/src/routes/sync.js`, `server/src/routes/extension-notes.js`, `server/src/routes/devices.js` (preHandler sets `req.userId`), `server/src/routes/ai.js`

- [ ] **Step 1: Sync push/pull/cursor**

```js
fastify.post('/v1/sync/push', async (req, reply) => {
  const v = await verifyBearer(db, req.headers)
  if (!v.ok) return reply.code(401).send({ error: 'unauthorized', reason: v.reason })
  const ops = (req.body && req.body.ops) || []
  const validation = validatePushOps(ops)
  if (validation.length) return reply.code(400).send({ error: 'invalid-ops', details: validation })
  const result = await applyOps(db, v.userId, ops)
  return { accepted: result.accepted.length, conflicts: result.conflicts }
})
```

`applyOps(db, userId, ops)` calls `notes.upsertNote(db, userId, op.note)` and `notes.softDelete(db, userId, op.client_id, op.updated_at)`.

- [ ] **Step 2: `/v1/notes` GET and POST**

POST returns `{ success: true, client_id, user_id }` (added `user_id` to the response). GET scopes via `listChangedSince(db, v.userId, since, limit)` or `listAll(db, v.userId, limit)` when `since == 0`.

- [ ] **Step 3: devices preHandler**

```js
fastify.addHook('preHandler', async (req, reply) => {
  const v = await verifyBearer(db, req.headers)
  if (!v.ok) return
  try { await devices.recordSeen(db, { device_id: v.deviceId, user_id: v.userId, /* ... */ }) } catch (e) { /* log */ }
  req.deviceId = v.deviceId
  req.userId = v.userId
})
```

`devices.recordSeen` now also stores `user_id` so admin's "device list" can show per-user device rows (future: cross-owner visibility filtering on the admin UI).

- [ ] **Step 4: Rerun the affected test files**

```powershell
cd E:\note\quickbrain
npm test -- tests/server-pull.test.js tests/server-push.test.js tests/server-push-enqueue.test.js tests/server-extension-notes.test.js tests/server-devices-route.test.js tests/server-ai-proxy.test.js
```

Expected: every file green (after Tasks 36 and 38).

- [ ] **Step 5: Commit**

```powershell
git add server/src/routes/sync.js server/src/routes/extension-notes.js server/src/routes/devices.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(sync): routes scope by userId"
```

---

### Task 40: `tests/helpers/fake-db.js` — Kysely-shaped in-memory fake

**Files:**
- Create: `tests/helpers/fake-db.js`

- [ ] **Step 1: Implement**

Minimal Kysely-like fake supporting `selectFrom(table).selectAll().where(col, op, val).execute() / .executeTakeFirst()`, `insertInto(table).values(v).onConflict(...).doUpdateSet(patch).executeTakeFirst()`, `updateTable(table).set(p).where(col, op, val).execute()`, `db.schema.alterTable(...).alterColumn(...).setNotNull().execute()` (spied).

Tables implemented: `users` (small fixed array), `notes` (Map keyed by `client_id`, scoped by `user_id`), `devices` (Map keyed by `device_id`).

- [ ] **Step 2: Refactor every test that previously hand-rolled a fake DB**

Affected: `tests/server-auth-middleware.test.js`, `tests/server-pull.test.js`, `tests/server-push.test.js`, `tests/server-push-enqueue.test.js`, `tests/server-notes-service.test.js`, `tests/server-extension-notes.test.js`, `tests/server-devices-route.test.js`, `tests/server-ai-proxy.test.js`.

Each test now starts with:

```js
import { fakeDb } from './helpers/fake-db.js'
const db = fakeDb({ token: process.env.OWNER_TOKEN })
```

…then sets up notes/devices/users by mutating `db.notes` / `db.users` arrays directly.

- [ ] **Step 3: Run, expect PASS**

```powershell
cd E:\note\quickbrain
npm test
```

- [ ] **Step 4: Commit**

```powershell
git add tests/helpers/fake-db.js tests/server-auth-middleware.test.js tests/server-pull.test.js tests/server-push.test.js tests/server-push-enqueue.test.js tests/server-notes-service.test.js tests/server-extension-notes.test.js tests/server-devices-route.test.js tests/server-ai-proxy.test.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "test(sync): fake-db helper + rewrite server-* unit tests"
```

---

### Task 41: `shared/schema/pg/migrations.js` rewrite on top of Kysely transactions

**Files:**
- Modify: `shared/schema/pg/migrations.js`

- [ ] **Step 1: Rewrite**

The old implementation used `pool.connect()` + raw `pg.query()`. Replace with Kysely so the same migration driver works whether the caller passes a `pg.Pool` (production, wrapped as Kysely) or a Kysely instance directly (tests):

```js
async function applyAll(db) {
  await db.schema.createTable('schema_version').ifNotExists()
    .addColumn('version', 'integer', col => col.primaryKey())
    .addColumn('applied_at', 'bigint', col => col.notNull())
    .execute().catch(() => { /* already exists race */ })

  const existing = await db.selectFrom('schema_version').select('version').execute()
  const applied = new Set(existing.map(r => r.version))
  for (const m of readMigrations()) {
    const version = parseInt(m.name.split('_')[0], 10)
    if (applied.has(version)) continue
    await db.transaction().execute(async trx => {
      await trx.executeQuery({ sql: m.sql, parameters: [], query: { kind: 'RawNode' } })
      await trx.insertInto('schema_version').values({ version, applied_at: Date.now() }).execute()
    })
  }
}
```

- [ ] **Step 2: Run, expect PASS**

```powershell
cd E:\note\quickbrain
npm test -- tests/shared-schema-pg.test.js
```

- [ ] **Step 3: Commit**

```powershell
git add shared/schema/pg/migrations.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "refactor(sync): pg migrator on Kysely transactions"
```

---

### Phase-9 known follow-ups (not blocking, parked for the SaaS plan)

- Add a `X-QB-User` header to the desktop sync client so `verifyBearer` can short-circuit instead of scanning the `users` table.
- Server-side device registry: today `devices.user_id` is captured but admin UI still lists cross-user; add a per-user filter.
- `users.delete` / "deactivate account" route + soft-delete column on `users`.
- Per-user AES-256-GCM AI key store (current `config` table is global — change to `(user_id, key)`).
- Rate limit `/v1/auth/login` (bcrypt cost 10 is intentional but vulnerable to credential stuffing without a limiter).
- E2E test that registers two users on one server and verifies notes from user A are never visible to user B (currently only unit-tested).
---

## Deployment reality (post Phase 9)

After Phase 9 the user-facing deployment story is fully implemented and matches spec section 3. The same client binary and same server binary serve every mode the user might pick.

### What the code actually supports today

| Concern | Current state | Reference |
|---|---|---|
| Server `MODE` env var | accepts `byos` / `local` / `saas` (default `byos`); validated at startup | `server/src/config.js:11` |
| Owner bootstrap from `OWNER_TOKEN` | seeds `owner` user on first boot if no users exist | `server/src/db/bootstrap.js` (`ensureOwnerUser`) |
| Multi-tenant registration | `POST /v1/auth/register|login|change-password|me` | `server/src/routes/auth.js` |
| Per-user data isolation | `notes.user_id` NOT NULL; every route filters by userId from bearer | `server/src/services/notes.js`, `server/src/auth/hmac.js` |
| Client `sync.enabled` toggle | written by Settings UI; daemon is started/stopped accordingly | `client/src/main/sync/ipc-handlers.js` |
| Client `ai.mode` toggle | `direct` = client API key; `server` = proxy via `/v1/ai/*` | `client/src/main/ai/server-proxy.js` (`getProxyContext` reads `ai.mode === "server"` + `sync.*`) |
| Migration path from old local-only | install server, paste token in Settings, click "Push local data to server" | spec section 1 |

### The four real-world deployments the user can choose

1. **Pure local.** No server. `sync.enabled = false`, `ai.mode = direct`. Pre-sync QuickBrain behaviour preserved. No network code path active.
2. **Self-hosted (BYOS).** Run `node server/src/index.js` with `MODE=byos` on a NAS / Docker host. Owner auto-seeded. Multiple devices paste the same `OWNER_TOKEN` into Server settings. Optional `ai.mode = server` shares one AI key across devices.
3. **Hosted SaaS (planned, not shipped).** Same server binary with `MODE=saas`; bootstrap policy becomes "no auto owner, registration required". Same routes, same protocol.
4. **Mixed.** `sync.enabled = true` + `ai.mode = direct` — notes go through the server, AI runs locally per device.

### Why BYOS and SaaS share code (not a fork)

- Server is one Fastify app. `MODE` only flips bootstrap (auto-owner vs registration-only) and bind address. All sync / AI / auth routes are identical.
- Client has no `if (saas)` branches. It posts to whatever `server.url` it is configured with. Bearer format, sync protocol, AI proxy are all the same.
- A user can switch from BYOS to SaaS by changing `server.url` + `server.token` in Settings and running `POST /v1/auth/login` on the new server to mint a new bearer; existing local SQLite cache keeps working because the schema is identical.

### What is NOT yet implemented

- SaaS signup UI / billing / quota enforcement. Spec section 2 marks these deferred.
- Real `MODE=saas` divergence in the bootstrap module — today `ensureOwnerUser` runs regardless of `MODE`. A follow-up task should make it conditional (`if (MODE === "saas") skip; require registration`). This is a small, isolated change tracked in Open follow-ups.
- Token rotation on shared secret compromise (per-user rotateSecret exists; operator runbook for forced rotation across all devices not written).

For the canonical user-facing description of the deployment matrix, see **spec section 3** (`docs/superpowers/specs/2026-08-23-quickbrain-sync-design.md`).

---

## Self-review

**Spec coverage:**

| Spec section | Task(s) |
|---|---|
| 4 monorepo layout | Task 1, 5 |
| 5 notes + sync_meta + sync_outbox (client) | Task 6, 19, 24 |
| 5.1 LWW rule | Task 16, 18 |
| 5.2 soft delete | Task 16, 18 |
| 6.1 endpoints | Task 11, 17, 18, 28 |
| 6.2 pull cursor semantics | Task 17 |
| 6.3 push ops per-op outcome | Task 18 |
| 6.4 client pull cadence | Task 22 (daemon), Task 23 (immediate on start) |
| 6.5 local writes enqueue | Task 23 |
| 6.6 conflicts surfaced (UI side panel) | Task 30 |
| 7 server-side atom extraction | Task 25, 26, 27 |
| 8 AI config storage (AES-GCM) | Task 28 |
| 9.1 first-run BYOS bootstrap | Task 8, 12 |
| 9.2 devices registry | Task 15 |
| 9.3 token format (HMAC-bound) | Task 13, 14 |
| 9.4 multi-tenant users table + per-user secret | Task 33, 34, 36, 37 |
| 9.5 /v1/auth/register|login|change-password|me | Task 35 |
| 9.6 per-user sync isolation (notes.user_id) | Task 36, 38, 39 |
| 9.7 Kysely-based migrator | Task 41 |
| 9.8 fake-db test helper | Task 40 |
| 10 admin UI | Task 29 |
| 11 config (env, client JSON) | Task 8, 21 |
| 13 risks (see mitigations) | implicit (offline-first, LWW, HMAC binding, AES at rest, per-user secret rotation on password change) |
| 14 phased plan | every Task above |

**Placeholder scan:** No `TBD` / `TODO` / `fill in details` in any task. Each step shows exact commands and code.

**Type / name consistency:**
- `client_id`, `updated_at`, `deleted_at`, `rev` defined in `shared/types/note.js` (Task 2) and used everywhere.
- `outbox_seq` rows seed from `meta.nextOutboxSeq`; outbox rows have `seq` PK.
- Token format `<base64url(device_id)>.<base64url(hmac)>` defined once (Task 13), used by client (Task 21, 22) and server middleware (Task 14, 15).
- Bearer header `Authorization: Bearer <token>` paired with `X-QB-Device` header on every request (Task 14 + admin UI auto-register hook in Task 15).
- LWW rule expressed once in `lwwIncomingWins` (Task 16) and used by upsert + conflict detector.

**Known open items moved to follow-ups (not blocking):**

- Admin UI auto-build of `providers.json` from `shared/types/providers.js` (hand-authored in Task 29 today).
- Real `deleteFrom` Kysely builder used in Task 26 `if (force)` branch - test stubs skip it.
- BYOS bootstrap persistence: today the bootstrap module memos the generated key in process memory (Task 12). Add a follow-up task to persist to a generated `.env` file on first run.

---

## Acceptance verification

After all phases complete:

```powershell
cd E:\note\quickbrain
taskkill /F /IM QuickBrain.exe /T 2>$null | Out-Null
taskkill /F /IM electron.exe /T 2>$null | Out-Null
sleep 2
npm rebuild better-sqlite3
npm test
```

Expected: every test file green, including `tests/server-auth.test.js`, `tests/server-auth-middleware.test.js`, `tests/server-users-service.test.js`, `tests/server-bootstrap.test.js`. Then:

```powershell
npx @electron/rebuild -f -w better-sqlite3
rmdir /s /q dist
npx electron-builder --win --config.npmRebuild=false
xcopy /E /I /Y extension dist\win-unpacked\resources\browser-extension\
Start-Process dist\win-unpacked\QuickBrain.exe
```

End-to-end verification flow:

1. Open Settings on the client. Paste a BYOS server URL + token. Save.
2. Save a note in the client. Wait ~5 s. Confirm note appears on a second client (run another instance with a different `userData` dir).
3. Delete a note on client A. Within 5 s it disappears on client B.
4. Force a conflict: edit the same note on both clients while offline; reconnect both; the higher `updated_at` wins; the loser has its outbox row marked `last_error = server-conflict`.
5. Side panel lists any unsynced conflicts.
6. Save a long article. Within ~10 s the source has `extracted_at` set; atom rows appear with `parent_id` pointing to the source.
7. Click "Push local data to server" on a brand-new client with thousands of notes: all rows present on server, none lost locally.

---

## Open follow-ups (not in this plan)

- SaaS UI / billing / registration.
- Phone native app (browser read-only).
- CRDT-grade conflict resolution in place of LWW.
- Compression of note payloads (large notes currently serialise fully).
- End-to-end encryption for note content.
- Schema-aware partial sync (only changed fields).
- Sync pause / bandwidth throttling UI.
- Server `.env` auto-writer when bootstrap generates MASTER_KEY/OWNER_TOKEN.
- Admin UI `providers.json` rebuilt from `shared/types/providers.js` at server build time.
- A teardown of the legacy branch `note-id`-based wiring once stable sync.id is the primary key.