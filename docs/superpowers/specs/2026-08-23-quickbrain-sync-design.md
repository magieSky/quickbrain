# QuickBrain Sync — Design Spec

**Date**: 2026-08-23
**Status**: Draft (pending review)
**Owner**: QuickBrain Dev
**Builds on**: 2026-08-21 spotlight, 2026-08-23 dual-layer notes

---

## 1. Goal

QuickBrain today is local-only: SQLite on disk, HTTP bound to 127.0.0.1, browser extension talks to the local app. This is great for privacy and zero-setup, but locks the user to one machine. Future phone and second-PC clients have no way to share data.

This spec adds a **self-hosted server mode** (BYOS) as a first-class deployment, alongside the existing local-only mode. A future SaaS mode may be added without breaking changes, but is out of scope for this spec.

Success criteria:

1. A user can install QuickBrain on two PCs, point both at one server, and see each others notes within seconds of going online.
2. A user can run the server on a home NAS / Docker host, access it from phone browser (read-only) later.
3. The server holds notes, atoms, AI config, and runs atom extraction in a background worker queue.
4. The client keeps a local SQLite cache so reads work offline; writes go to an outbox and are flushed when the server is reachable.
5. Existing single-user local-only behaviour is unchanged when sync.enabled = false (the default).
6. The migration path for an existing local install is: install server, set server.url + server.token in client Settings, click Push local data to server -> all notes/atoms/tags copied up.

## 2. Non-goals

- Multi-tenant SaaS billing / registration / quota enforcement (interfaces exist; UI/ops deferred).
- Phone native app (only browser read-only preview in this spec).
- Real-time collaborative editing (cursor presence, locks). LWW + per-device last_seen is enough.
- CRDT-grade conflict resolution. We start with LWW; the data model keeps room for a future migration to CRDT.
- Server-side search ranking (server returns candidates; client does final ranking with AI).
- File/snapshot upload of source binaries. Notes reference URLs/paths; the server does not store the original document.

## 3. Deployment modes

The same codebase ships in three modes. The mode is decided at server startup (MODE env var), and the client picks sync.enabled independently in Settings.

| Mode | Server | Client config | Auth | Network |
|---|---|---|---|---|
| Local | none | sync.enabled = false | n/a | none |
| BYOS | user runs quickbrain-server on a NAS/PC, MODE=byos | sync.enabled = true, server.url, server.token | first-run token from server .env | LAN or reverse-proxied HTTPS |
| SaaS (later) | QuickBrain hosted, MODE=saas | same as BYOS | email + password -> JWT | public HTTPS |

All three modes share the same client code. The client does not know whether the server is local or remote; it just speaks the sync protocol over HTTPS.

## 4. Repository layout (monorepo)

```
quickbrain/
  client/                 <- Electron app (refactored from current root)
    src/main/
    src/renderer/
    src/preload/
    package.json
  server/                 <- Fastify app (new)
    src/
      routes/
      db/
      workers/
      auth/
      ai/
    web/admin/            <- static HTML for admin UI
    package.json
  shared/                 <- code shared between client and server
    types/                <- TS types / zod schemas
    schema/               <- SQL migrations applied to both sqlite and pg
    package.json
  package.json            <- npm workspaces root
  package.json (root)     <- electron-builder config (builds client)
```

Shared code is the single source of truth for the note model. Both client and server import shared/types/note.ts. Client uses Kysely with dialect sqlite against local cache; server uses Kysely with dialect pg against Postgres.

## 5. Data model

The existing notes table gains sync columns. SQLite migration is additive; existing rows get default values.

```
notes
  id              INTEGER PK
  client_id       TEXT    <- UUID assigned by the originating device (immutable)
  content         TEXT
  title           TEXT
  category        TEXT
  tags            TEXT (JSON)
  is_formatted    INTEGER
  original_content TEXT
  source_path     TEXT
  source_type     TEXT
  parent_id       INTEGER FK -> notes(id) ON DELETE CASCADE
  source_range    TEXT
  is_atom         INTEGER
  extracted_at    INTEGER (ms epoch; -1 = failed, null = pending)
  created_at      INTEGER (ms epoch)
  updated_at      INTEGER (ms epoch)        NEW: every write bumps
  deleted_at      INTEGER (ms epoch, NULL = live) NEW: soft delete
  rev             INTEGER                  NEW: monotonic per row, bumped on update

notes_fts          <- virtual FTS5, local-only (server has its own search index)
notes_pinyin       <- local-only
sync_meta          NEW local table
  device_id        TEXT PK
  last_pull_cursor INTEGER
  last_push_at     INTEGER
  outbox_seq       INTEGER (monotonic)
sync_outbox        NEW local table
  seq              INTEGER PK
  op               TEXT    <- upsert | delete
  note_id          INTEGER
  payload          TEXT    <- JSON snapshot of the row at write time
  enqueued_at      INTEGER
  attempts         INTEGER
  last_error       TEXT
```

Server side, same notes table in Postgres. No FTS or pinyin locally on the server - server uses pg_trgm + simple ILIKE for the admin search box. No sync_outbox; the server is online-only.

### 5.1 LWW rule

Server compares incoming updated_at against stored updated_at for the same client_id:

- If incoming updated_at > stored.updated_at -> accept, bump server rev.
- If equal -> use client_id lexicographic compare as deterministic tie-breaker.
- If less -> reject with conflict: { server_version }. Client keeps local and pushes again later (no auto-rebase in MVP).

### 5.2 Soft delete

deleted_at IS NULL means live. Deletes set updated_at = now, deleted_at = now. Sync pulls skip rows where deleted_at IS NOT NULL; UI hides them.

## 6. Sync protocol

All endpoints JSON over HTTPS. Bearer token in Authorization: Bearer <token> header.

### 6.1 Endpoints (server side)

```
POST   /v1/sync/pull          body: { since: <ms_epoch> | 0, limit: 500 }
GET    /v1/sync/cursor        returns: { server_now, head_cursor }
POST   /v1/sync/push          body: { ops: [...] }   <- batch upsert/delete
GET    /v1/sync/health        returns: { ok, server_time, mode }
POST   /v1/notes              convenience: same shape as legacy /notes
GET    /v1/notes?q=...        convenience: server-side FTS
GET    /v1/admin/devices      admin UI: list devices, revoke
POST   /v1/admin/ai-config    admin UI: set provider + key
```

### 6.2 Pull

```
GET /v1/sync/pull?since=<ms>&limit=500
-> 200 { changes: Note[], next_cursor: <ms>, has_more: bool }
```

Server returns rows where updated_at > since, ordered by updated_at ASC, up to limit. Client applies them locally (insert/update/delete by client_id), then stores next_cursor in sync_meta. Loops until has_more = false.

### 6.3 Push

```
POST /v1/sync/push
body { ops: [
  { op: "upsert", note: { client_id, content, ..., updated_at, rev } },
  { op: "delete", client_id, updated_at }
]}
-> 200 { accepted: number, conflicts: [{ client_id, server_version }] }
```

Server applies each op under a transaction. Returns per-op accept/conflict so client can update its outbox. Client moves accepted ops out of sync_outbox; conflicts are left in outbox with last_error set (user can manually resolve later).

### 6.4 Client pull cadence

- App start: immediate pull since last_pull_cursor.
- Every 5 seconds while window visible: pull.
- After successful push: pull (to get server-side changes pushed by other devices).
- After offline->online transition: immediate pull.
- After window shows / hides: pull on show.

### 6.5 Local writes

When the renderer creates/updates/deletes a note via IPC, the main process:
1. Writes to local SQLite with bumped updated_at and rev.
2. Appends a row to sync_outbox.
3. If sync.enabled and server reachable, triggers push of pending outbox ops (debounced 1 second).

### 6.6 Conflicts surfaced in UI

Main panel gains a small status badge when there are unsynced ops or unresolved conflicts. Clicking it opens a side panel listing the conflicts with Keep local / Keep server buttons.

## 7. Server-side atom extraction

When notes are upserted and have is_atom = 0 AND extracted_at IS NULL, server enqueues a BullMQ job extract:source:<note_client_id>. Worker:

1. Loads note from DB.
2. Calls configured AI provider via the server-stored API key.
3. For each atom: upsert into notes with parent_id = source_client_id.
4. Sets extracted_at = <ms> on source.

Failures mark extracted_at = -1. Clients pulling see the failed status and show the 重抽 button (already exists in current UI).

The client no longer runs local extraction. Atom extraction is server-only. This keeps the local cache light and makes the spec consistent: the server is the source of truth for atoms.

Local extraction remains in the code behind if (!sync.enabled) for offline-only deployments.

## 8. AI config storage

Server stores AI config in a config table:

```
config
  key        TEXT PK
  value_enc  BYTEA    <- AES-256-GCM ciphertext
  updated_at INTEGER
```

Encryption key from env MASTER_KEY (32 random bytes, hex-encoded). On server start, if MASTER_KEY is missing, server prints a generated key and refuses to start (operator must persist it).

Admin UI sets provider, apiKey, model, baseURL. Server never returns decrypted key to clients - clients see hasApiKey: true/false and apiKeyPreview: "abcd****" only.

## 9. Auth

### 9.1 First-run BYOS bootstrap

Server MODE=byos start:
1. Generates a master key if not in env.
2. Creates the single user owner with a random 32-byte token printed to stdout.
3. Server refuses to start if OWNER_TOKEN env var already set; uses that instead.

Operator copies the token, pastes into clients Settings -> Server -> Connect, done.

### 9.2 Device registry

Server devices table:
```
device_id   TEXT PK    <- UUID generated by client at first install
name        TEXT
platform    TEXT       <- win32 | darwin | linux
client_ver  TEXT
last_seen   INTEGER
revoked_at  INTEGER
```

Client sends device_id (UUID stored in local config, persists across restarts) on every request via header X-QB-Device. Server records last_seen. Admin UI shows device list, lets owner revoke.

### 9.3 Token format

<base64url(device_id)>.<base64url(hmac_sha256(token, device_id))> - HMAC binds the token to a device so a leaked token cant be used from a different device. Server validates HMAC on every request.

## 10. Admin UI

server/web/admin/ - a single-page static HTML+vanilla JS, served by Fastify. Three views:

1. Devices: list with last-seen, platform, version, revoke button.
2. AI: provider dropdown (from shared/types/providers.ts), API key field, base URL, model, Test button.
3. Status: server version, DB size, queue depth, last 50 errors.

No React, no build step. Loads shared/types/providers.ts at build time via esbuild -> server/web/admin/providers.json.

## 11. Configuration

### 11.1 Server env

```
MODE=byos                       # local | byos | saas
PORT=7422
DB_URL=postgres://qb:qb@localhost:5432/qb
REDIS_URL=redis://localhost:6379
MASTER_KEY=<64-hex-chars>       # generated if missing (server logs it once)
OWNER_TOKEN=<base64url>         # generated if missing (server logs it once)
LOG_LEVEL=info
```

### 11.2 Client config (local JSON)

Stored at %APPDATA%\quickbrain\config.json (extending the existing file):

```json
{
  "ai": { "provider": "MiniMax", "apiKey": "sk-...", "model": "..." },
  "sync": {
    "enabled": false,
    "serverUrl": "https://qb.lan.example.com",
    "token": "...",
    "deviceId": "<uuid>",
    "deviceName": "Office PC"
  }
}
```

When sync.enabled = false, all sync code paths are no-ops; behaviour is identical to today.

## 12. Out of scope (deferred)

- Schema-aware partial sync (only sync changed fields).
- Compression of note payloads.
- End-to-end encryption (server admin can read plaintext in DB).
- Selective sync (exclude certain tags/devices).
- Sync pause / bandwidth throttling.

## 13. Risks

| Risk | Mitigation |
|---|---|
| Server downtime loses data | Local outbox queues writes; pulls resume on reconnect |
| LWW loses users edits silently | UI surfaces conflicts with explicit resolution choice |
| Token leak gives full access | HMAC binds token to device_id; revocation via admin UI |
| API key on server is plaintext to operator | AES-256-GCM with operator-managed master key |
| Monorepo tooling complexity | Use npm workspaces (no Lerna/Nx); tsconfig paths for shared imports |
| Schema drift between sqlite and pg | Single shared/schema/ source; both run same migration files translated per dialect |

## 14. Implementation phases (rough)

1. Monorepo split + shared types
2. Server skeleton (Fastify + Postgres + migrations)
3. BYOS bootstrap (master key + owner token)
4. Auth middleware (HMAC device binding)
5. Devices registry
6. Sync pull endpoint
7. Sync push endpoint
8. Client SQLite cache + sync_meta + sync_outbox
9. Client sync daemon (pull loop + push debounce)
10. Server-side atom extraction queue + worker
11. Admin UI (devices / AI / status)
12. Settings UI in client (Connect to server flow)
13. Migration tool: local-only -> BYOS
14. End-to-end test (two clients + one server)