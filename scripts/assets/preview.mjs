// Still previews of the 3D table as the game's own renderer draws it (package V2):
//   node scripts/assets/preview.mjs        writes docs/previews/table_*.png
// Serves the repository on a local port and screenshots scripts/assets/preview/index.html.
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
const out = path.join(root, 'docs', 'previews');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error(e.message));
for (const view of ['projector', 'low', 'wide']) {
  await page.goto(`http://127.0.0.1:${port}/scripts/assets/preview/index.html?view=${view}`);
  await page.waitForFunction(() => document.title === 'done', null, { timeout: 60_000 });
  await page.screenshot({ path: path.join(out, `table_${view}.png`) });
  console.log('wrote', `docs/previews/table_${view}.png`);
}
await browser.close();
server.close();
