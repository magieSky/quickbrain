// scripts/dev-website.cjs
// Local dev preview for the marketing website. Renders extension version into
// index.html (replaces __QB_EXT_VERSION__ with extension/manifest.json version)
// and serves the result over HTTP. No build step, no dependencies.

const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'website');
const OUT = path.join(ROOT, '.dev', 'website');
const MANIFEST = path.join(ROOT, 'extension', 'manifest.json');
const PORT = parseInt(process.env.QB_DEV_PORT || '3000', 10);

function rimraf(p) {
  if (!fs.existsSync(p)) return;
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    const full = path.join(p, e.name);
    if (e.isDirectory()) rimraf(full);
    else fs.unlinkSync(full);
  }
  fs.rmdirSync(p);
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function renderIndex() {
  const ver = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')).version;
  const dstIdx = path.join(OUT, 'index.html');
  let html = fs.readFileSync(dstIdx, 'utf8');
  const placeholders = (html.match(/__QB_EXT_VERSION__/g) || []).length;
  html = html.replace(/__QB_EXT_VERSION__/g, ver);
  fs.writeFileSync(dstIdx, html, 'utf8');
  return { ver, placeholders };
}

function mime(p) {
  const ext = path.extname(p).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg':  'image/svg+xml',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.ico':  'image/x-icon',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2':'font/woff2',
    '.txt':  'text/plain; charset=utf-8',
    '.md':   'text/markdown; charset=utf-8',
  })[ext] || 'application/octet-stream';
}

function startServer(info) {
  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    const fp = path.join(OUT, urlPath);
    if (!fp.startsWith(OUT)) {
      res.writeHead(403); res.end('forbidden'); return;
    }
    fs.stat(fp, (err, st) => {
      if (err || !st.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 not found: ' + urlPath);
        return;
      }
      res.writeHead(200, { 'Content-Type': mime(fp), 'Cache-Control': 'no-store' });
      fs.createReadStream(fp).pipe(res);
    });
  });
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[dev:website] extension version: ${info.ver}`);
    console.log(`[dev:website] rendered ${info.placeholders} placeholder(s) in index.html`);
    console.log(`[dev:website] serving ${OUT}`);
    console.log(`[dev:website] http://127.0.0.1:${PORT}/`);
    console.log(`[dev:website] Ctrl+C to stop`);
  });
}

// main
rimraf(OUT);
copyDir(SRC, OUT);
const info = renderIndex();
startServer(info);