const esbuild = require('esbuild');
const path = require('path');

const entry = path.resolve(__dirname, '..', 'src', 'renderer', 'editor', 'editor.js');
const outfile = path.resolve(__dirname, '..', 'src', 'renderer', 'editor', 'editor.bundle.js');

esbuild.build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'warning'
}).then(() => console.log('editor bundle built'))
  .catch(e => { console.error(e.message); process.exit(1); });
