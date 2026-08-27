// scripts/smoke-website.cjs
// Cross-platform HTTPS smoke test for the deployed site. Verifies the
// homepage rendered the extension version, the extension zip is
// downloadable and does NOT contain .key.txt, and the latest*.yml files
// electron-updater reads are present. Exits non-zero on any failure.
//
// Usage:
//   npm run smoke:website
//   QB_BASE=https://note.bjhzsk.cn node scripts/smoke-website.cjs
//   QB_VER=0.4.0 node scripts/smoke-website.cjs

const fs = require('fs');
const https = require('https');
const http = require('http');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BASE = (process.env.QB_BASE || 'https://note.bjhzsk.cn').replace(/\/$/, '');
const VER = process.env.QB_VER || JSON.parse(
  fs.readFileSync(path.join(ROOT, 'extension', 'manifest.json'), 'utf8')
).version;
const TIMEOUT_MS = 10000;

function get(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.get(url, { timeout: TIMEOUT_MS }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks),
        contentType: res.headers['content-type'] || '',
      }));
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', (e) => resolve({ status: 0, body: Buffer.alloc(0), error: e.message }));
  });
}

function head(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https:') ? https : http;
    const u = new URL(url);
    const req = lib.request({
      method: 'HEAD',
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      timeout: TIMEOUT_MS,
    }, (res) => {
      resolve({ status: res.statusCode, contentType: res.headers['content-type'] || '' });
      res.resume();
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', (e) => resolve({ status: 0, error: e.message }));
    req.end();
  });
}

function fmtStatus(s) {
  if (s === 200) return '200 OK';
  if (s === 404) return '404 NF';
  if (s === 0)   return 'CONN FAIL';
  return String(s);
}

const checks = [
  {
    name: 'homepage',
    url: `${BASE}/`,
    must: 200,
    bodyMust: [`quickbrain-extension-v${VER}.zip`, '速脑'],
    bodyNot: ['__QB_EXT_VERSION__'],
  },
  {
    name: `extension zip v${VER}`,
    url: `${BASE}/downloads/quickbrain-extension-v${VER}.zip`,
    must: 200,
    bodyNot: ['.key.txt'],
    bodyMust: ['manifest.json'],  // crude sanity that it's a real zip with our files
    extra: async (res) => {
      if (res.status !== 200) return null;
      const sig = res.body.slice(0, 4).toString('hex');
      return `size=${res.body.length} zipSig=${sig} (expect 504b0304)`;
    },
  },
  {
    name: 'desktop/latest.yml',
    url: `${BASE}/downloads/desktop/latest.yml`,
    must: 200,
    optional: true,        // absent until build-windows is added
    htmlContentAsMissing: true,
  },
  {
    name: 'desktop/latest-mac.yml',
    url: `${BASE}/downloads/desktop/latest-mac.yml`,
    must: 200,
  },
  {
    name: 'desktop/latest-linux.yml',
    url: `${BASE}/downloads/desktop/latest-linux.yml`,
    must: 200,
    optional: true,        // absent until a Linux build is published
    htmlContentAsMissing: true,
  },
  {
    name: 'desktop/latest-mac.yml points to a real dmg',
    url: `${BASE}/downloads/desktop/latest-mac.yml`,
    bodyMust: ['QuickBrain-'],
  },
];

(async () => {
  console.log(`[smoke] base = ${BASE}`);
  console.log(`[smoke] ext  = v${VER}`);
  console.log('');
  const rows = [];
  let fails = 0;

  for (const c of checks) {
    const res = await get(c.url);
    const bodyStr = res.body.toString('utf8');
    let status = 'PASS';
    let note = '';
    if (res.status === 200 && c.htmlContentAsMissing && res.contentType.startsWith('text/html')) {
      status = c.optional ? 'SKIP' : 'FAIL';
      note = c.optional
        ? 'not yet published (SPA fallback to index.html)'
        : `got 200 but content-type=${res.contentType} (looks like SPA fallback to index.html, not the real file)`;
    } else if (c.must != null && res.status !== c.must) {
      // optional checks: 404 is acceptable
      if (c.optional && res.status === 404) {
        status = 'SKIP';
        note = 'not yet published';
      } else {
        status = 'FAIL';
        note = `expected ${c.must}, got ${res.status}`;
      }
    } else if (c.bodyMust) {
      const missing = c.bodyMust.filter(s => !bodyStr.includes(s));
      if (missing.length) {
        status = 'FAIL';
        note = `missing in body: ${missing.join(', ')}`;
      }
    }
    if (status === 'PASS' && c.bodyNot) {
      const leaked = c.bodyNot.filter(s => bodyStr.includes(s));
      if (leaked.length) {
        status = 'FAIL';
        note = `forbidden in body: ${leaked.join(', ')}`;
      }
    }
    if (status === 'PASS' && c.extra) {
      const x = await c.extra(res);
      if (x) note = x;
    }
    if (status === 'FAIL') fails++;
    rows.push({ name: c.name, code: fmtStatus(res.status), status, note });
  }

  // Pad rows to same width
  const w1 = Math.max(...rows.map(r => r.name.length), 30);
  const w2 = Math.max(...rows.map(r => r.code.length), 10);
  const w3 = Math.max(...rows.map(r => r.status.length), 6);
  for (const r of rows) {
    console.log(
      '  ' +
      r.name.padEnd(w1) + '  ' +
      r.code.padEnd(w2) + '  ' +
      r.status.padEnd(w3) +
      (r.note ? '  ' + r.note : '')
    );
  }
  console.log('');
  if (fails === 0) {
    console.log(`[smoke] all required checks passed (${rows.length - rows.filter(r=>r.status==='SKIP').length} pass, ${rows.filter(r=>r.status==='SKIP').length} skip)`);
    process.exit(0);
  } else {
    console.log(`[smoke] ${fails} check(s) failed`);
    process.exit(1);
  }
})();