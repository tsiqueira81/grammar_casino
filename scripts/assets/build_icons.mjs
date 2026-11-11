// Package S7: the app icons and the share image, rendered from the game's own $500 chip.
//   node scripts/assets/build_icons.mjs     writes public/icons/*.png
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const types = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary' };
const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const out = path.join(root, 'public', 'icons');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const shots = [
  { file: 'icon-192.png', w: 192, h: 192, fill: 0.86 },
  { file: 'icon-512.png', w: 512, h: 512, fill: 0.86 },
  // Maskable: the chip stays inside the 80% safe circle whatever shape the phone cuts.
  { file: 'icon-maskable-512.png', w: 512, h: 512, fill: 0.62 },
  { file: 'apple-touch-icon.png', w: 180, h: 180, fill: 0.8 },
  { file: 'favicon-32.png', w: 32, h: 32, fill: 0.96 },
  { file: 'og-image.png', w: 1200, h: 630, fill: 0.8, og: true },
];
for (const s of shots) {
  const page = await browser.newPage({ viewport: { width: s.w, height: s.h } });
  page.on('pageerror', (e) => console.error(e.message));
  await page.goto(`http://127.0.0.1:${port}/scripts/assets/icons/index.html?w=${s.w}&h=${s.h}&fill=${s.fill}${s.og ? '&og=1' : ''}`);
  await page.waitForFunction(() => document.title === 'done', null, { timeout: 60_000 });
  await page.screenshot({ path: path.join(out, s.file), omitBackground: false });
  await page.close();
  console.log('wrote', `public/icons/${s.file}`);
}
await browser.close();
server.close();
