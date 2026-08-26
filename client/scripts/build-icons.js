const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { encode } = require('sharp-ico');

const assetsDir = path.resolve(__dirname, '..', 'src', 'assets');
const svgPath = path.join(assetsDir, 'icon.svg');
const svg = fs.readFileSync(svgPath, 'utf8');

// Sizes that ship to git: 256 (icon.png / favicon), 1024 (macOS).
// The full multi-size set + .ico are written for the local build but ignored.
const shipSizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

(async () => {
  // 1) Render every size for the .ico and local dev.
  for (const s of shipSizes) {
    const out = path.join(assetsDir, `icon-${s}.png`);
    await sharp(Buffer.from(svg), { density: 384 })
      .resize(s, s, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(out);
  }
  // 2) Build the Windows .ico from the 6 sizes that Windows actually uses.
  const icoSizes = [16, 32, 48, 64, 128, 256];
  const icoBuffers = icoSizes.map(s => fs.readFileSync(path.join(assetsDir, `icon-${s}.png`)));
  fs.writeFileSync(path.join(assetsDir, 'icon.ico'), encode(icoBuffers));
  // 3) Replace the favicon / macOS sources.
  fs.copyFileSync(path.join(assetsDir, 'icon-256.png'),  path.join(assetsDir, 'icon.png'));
  fs.copyFileSync(path.join(assetsDir, 'icon-128.png'),  path.join(assetsDir, 'icon@2x.png'));
  fs.copyFileSync(path.join(assetsDir, 'icon-48.png'),   path.join(assetsDir, 'icon@3x.png'));
  fs.copyFileSync(path.join(assetsDir, 'icon-64.png'),   path.join(assetsDir, 'icon@4x.png'));
  fs.copyFileSync(path.join(assetsDir, 'icon-128.png'),  path.join(assetsDir, 'icon@5x.png'));
  fs.copyFileSync(path.join(assetsDir, 'icon-1024.png'), path.join(assetsDir, 'icon@6x.png'));
  console.log('icons built ->', assetsDir);
})().catch(e => { console.error(e); process.exit(1); });
