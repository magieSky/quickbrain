/**
 * End-to-end multi-tenant regression test against a real QuickBrain server + Postgres.
 *
 * What it covers (Phase 9 contract):
 *   1. POST /v1/auth/register        → 201 + per-user secret (alice, bob)
 *   2. duplicate username           → 409
 *   3. bad username format          → 400
 *   4. login wrong password         → 401
 *   5. login returns same secret as register
 *   6. owner user (seeded from OWNER_TOKEN env) can still sync via old bearer
 *      (backward compatibility for existing BYOS deployments)
 *   7. GET /v1/auth/me with bearer   → echoes user_id + username + device_id
 *   8. alice push / bob push        → 200
 *   9. alice pull / bob pull        → each sees ONLY their own notes (cross-user isolation)
 *  10. owner pull                   → sees only his own (he has user_id=1, distinct from alice/bob)
 *  11. LWW within alice's user scope: pushing older version of alice-note-1 conflicts
 *  12. POST /v1/auth/change-password rotates alice's secret
 *  13. old alice bearer             → 401 (hmac-mismatch)
 *  14. new alice bearer             → 200
 *
 * Prereqs:
 *   - Postgres 15 listening on 127.0.0.1:5432 with user `postgres` password `postgres`
 *   - DB `qb_e2e` created (CREATE DATABASE qb_e2e;)
 *   - Server running with:
 *       DB_URL=postgres://postgres:postgres@127.0.0.1:5432/qb_e2e
 *       MASTER_KEY=<64 hex chars>
 *       OWNER_TOKEN=<32+ chars>
 *       MODE=byos PORT=7422
 *
 * Usage:
 *   node tests/e2e/multitenant.test.js
 *
 * Exit code 0 = all assertions pass; 1 = at least one failed.
 */
'use strict';

const http = require('http');
const crypto = require('crypto');
const path = require('path');

const PORT = parseInt(process.env.PORT || '7422', 10);
const HOST = process.env.HOST || '127.0.0.1';
const TOKEN_MODULE = path.join(__dirname, '..', '..', 'shared', 'sync', 'token.js');
const tokenMod = require(TOKEN_MODULE);

function req(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body !== undefined ? Buffer.from(JSON.stringify(body)) : null;
    const opts = {
      host: HOST, port: PORT, path: urlPath, method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
        ...(data ? { 'Content-Length': data.length } : {})
      }
    };
    const r = http.request(opts, res => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        let json;
        try { json = JSON.parse(text); } catch (_) { json = text; }
        resolve({ status: res.statusCode, body: json });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function bearerFor(secret, deviceId) {
  return tokenMod.encode({ deviceId, token: secret });
}

function randomDeviceId() { return crypto.randomUUID(); }

let failed = 0;
function check(label, actual, predicate) {
  const ok = predicate(actual);
  const summary = JSON.stringify(actual).slice(0, 160);
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + label + ' :: ' + summary);
  if (!ok) { failed++; process.exitCode = 1; }
}

(async () => {
  // ---- 1. register alice + bob ----
  const aliceReg = await req('POST', '/v1/auth/register', {
    username: 'alice', password: 'alice-pw-123'
  });
  check('register alice 201', aliceReg, r =>
    r.status === 201 && r.body.secret && r.body.secret.length >= 40);
  const aliceSecret = aliceReg.body.secret;
  const aliceId = aliceReg.body.user_id;

  const bobReg = await req('POST', '/v1/auth/register', {
    username: 'bob', password: 'bob-pw-456'
  });
  check('register bob 201', bobReg, r =>
    r.status === 201 && r.body.secret && r.body.secret.length >= 40);
  const bobSecret = bobReg.body.secret;
  const bobId = bobReg.body.user_id;
  console.log('     alice id=' + aliceId + ' bob id=' + bobId);

  // ---- 2-4: failure paths ----
  check('duplicate username 409',
    await req('POST', '/v1/auth/register', { username: 'alice', password: 'another-pw-1' }),
    r => r.status === 409);

  check('bad username 400',
    await req('POST', '/v1/auth/register', { username: 'a!', password: 'longenough1' }),
    r => r.status === 400);

  check('login wrong pw 401',
    await req('POST', '/v1/auth/login', { username: 'alice', password: 'WRONG' }),
    r => r.status === 401);

  // ---- 5: login returns same secret as register ----
  check('login alice returns same secret',
    await req('POST', '/v1/auth/login', { username: 'alice', password: 'alice-pw-123' }),
    r => r.status === 200 && r.body.secret === aliceSecret);

  // ---- 6-7: owner (backward compat with OWNER_TOKEN env) ----
  const ownerToken = process.env.OWNER_TOKEN;
  if (!ownerToken) {
    console.log('SKIP owner checks (OWNER_TOKEN env not set on test runner)');
  } else {
    const ownerDevice = randomDeviceId();
    const ownerBearer = bearerFor(ownerToken, ownerDevice);
    check('owner sync via OWNER_TOKEN',
      await req('GET', '/v1/sync/cursor', undefined, {
        authorization: 'Bearer ' + ownerBearer, 'x-qb-device': ownerDevice
      }),
      r => r.status === 200);

    check('owner /v1/auth/me echoes username=owner',
      await req('GET', '/v1/auth/me', undefined, {
        authorization: 'Bearer ' + ownerBearer, 'x-qb-device': ownerDevice
      }),
      r => r.status === 200 && r.body.username === 'owner');
  }

  // ---- 8: alice push + bob push ----
  const aliceDevice = randomDeviceId();
  const aliceBearer = bearerFor(aliceSecret, aliceDevice);
  const aliceNote = {
    client_id: 'alice-note-1',
    content: 'alice secret thought',
    title: 'Alice thought',
    category: 'personal',
    tags: ['alice', 'private'],
    is_formatted: 0,
    original_content: 'alice secret thought',
    source_path: '', source_type: '',
    parent_id: null, source_range: '',
    is_atom: 0, extracted_at: null,
    created_at: Date.now(), updated_at: Date.now(),
    deleted_at: null, rev: 1
  };
  check('alice push 200',
    await req('POST', '/v1/sync/push', { ops: [{ op: 'upsert', note: aliceNote }] }, {
      authorization: 'Bearer ' + aliceBearer, 'x-qb-device': aliceDevice
    }),
    r => r.status === 200 && r.body.accepted === 1 && (!r.body.conflicts || r.body.conflicts.length === 0));

  const bobDevice = randomDeviceId();
  const bobBearer = bearerFor(bobSecret, bobDevice);
  const bobNote = {
    client_id: 'bob-note-1',
    content: 'bob public thought',
    title: 'Bob thought',
    category: 'work',
    tags: ['bob'],
    is_formatted: 0,
    original_content: '',
    source_path: '', source_type: '',
    parent_id: null, source_range: '',
    is_atom: 0, extracted_at: null,
    created_at: Date.now(), updated_at: Date.now(),
    deleted_at: null, rev: 1
  };
  check('bob push 200',
    await req('POST', '/v1/sync/push', { ops: [{ op: 'upsert', note: bobNote }] }, {
      authorization: 'Bearer ' + bobBearer, 'x-qb-device': bobDevice
    }),
    r => r.status === 200 && r.body.accepted === 1);

  // ---- 9-10: cross-user isolation ----
  check('alice pull returns only her own note',
    await req('GET', '/v1/sync/pull?since=0&limit=100', undefined, {
      authorization: 'Bearer ' + aliceBearer, 'x-qb-device': aliceDevice
    }),
    r => r.status === 200 &&
         Array.isArray(r.body.changes) &&
         r.body.changes.length === 1 &&
         r.body.changes[0].client_id === 'alice-note-1');

  check('bob pull returns only his own note',
    await req('GET', '/v1/sync/pull?since=0&limit=100', undefined, {
      authorization: 'Bearer ' + bobBearer, 'x-qb-device': bobDevice
    }),
    r => r.status === 200 &&
         Array.isArray(r.body.changes) &&
         r.body.changes.length === 1 &&
         r.body.changes[0].client_id === 'bob-note-1');

  if (ownerToken) {
    const ownerDevice2 = randomDeviceId();
    check('owner pull returns only his own notes (zero)',
      await req('GET', '/v1/sync/pull?since=0&limit=100', undefined, {
        authorization: 'Bearer ' + bearerFor(ownerToken, ownerDevice2),
        'x-qb-device': ownerDevice2
      }),
      r => r.status === 200 && Array.isArray(r.body.changes) && r.body.changes.length === 0);
  }

  // ---- 11: LWW within alice's user scope ----
  check('alice pushing older version of her own note conflicts',
    await req('POST', '/v1/sync/push', {
      ops: [{ op: 'upsert', note: { ...aliceNote, updated_at: aliceNote.updated_at - 100 } }]
    }, {
      authorization: 'Bearer ' + aliceBearer, 'x-qb-device': aliceDevice
    }),
    r => r.status === 200 && r.body.accepted === 0 &&
         Array.isArray(r.body.conflicts) && r.body.conflicts.length === 1 &&
         r.body.conflicts[0].client_id === 'alice-note-1');

  // ---- 12-14: change-password rotates secret ----
  const aliceChpw = await req('POST', '/v1/auth/change-password', {
    old_password: 'alice-pw-123', new_password: 'alice-new-pw-789'
  }, { authorization: 'Bearer ' + aliceBearer, 'x-qb-device': aliceDevice });
  check('alice change-password 200 + new secret',
    aliceChpw,
    r => r.status === 200 && r.body.secret && r.body.secret !== aliceSecret && r.body.rotated === true);
  const aliceNewSecret = aliceChpw.body.secret;

  check('old alice bearer rejected after secret rotation',
    await req('GET', '/v1/sync/pull?since=0&limit=10', undefined, {
      authorization: 'Bearer ' + aliceBearer, 'x-qb-device': aliceDevice
    }),
    r => r.status === 401);

  const aliceNewDevice = randomDeviceId();
  check('new alice bearer works',
    await req('GET', '/v1/sync/pull?since=0&limit=10', undefined, {
      authorization: 'Bearer ' + bearerFor(aliceNewSecret, aliceNewDevice),
      'x-qb-device': aliceNewDevice
    }),
    r => r.status === 200);

  console.log('');
  console.log(failed === 0
    ? 'OK: all multi-tenant e2e checks passed'
    : 'FAIL: ' + failed + ' check(s) failed');
})().catch(e => { console.error('FATAL', e); process.exit(2); });
