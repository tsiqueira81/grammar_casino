#!/usr/bin/env node
/**
 * Bundle size check (package F8).
 *
 * Phones download the bundle over school Wi-Fi, so it must not quietly grow. After `npm run build`,
 * this compares the gzipped size of every JavaScript and CSS file in dist/assets with
 * scripts/bundle-baseline.json and fails when one grows by more than 10%.
 *
 *   node scripts/check-bundle-size.mjs           check against the baseline
 *   node scripts/check-bundle-size.mjs --update  write the current sizes as the new baseline
 *
 * When a pull request makes a file bigger on purpose, run with --update and say why in the
 * pull request. Files are matched by name without the content hash (index-Ab12.js -> index.js).
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'dist', 'assets');
const BASELINE = path.join(ROOT, 'scripts', 'bundle-baseline.json');
const ALLOWED_GROWTH = 0.1;

if (!fs.existsSync(ASSETS)) {
  console.error('dist/assets is missing. Run npm run build first.');
  process.exit(1);
}

/** index-BMFnFTlW.js -> index.js. Vite hashes are 8 characters of [A-Za-z0-9_-]. */
const stableName = (file) => file.replace(/-[A-Za-z0-9_-]{8}(\.(?:js|css))$/, '$1');

const current = {};
for (const file of fs.readdirSync(ASSETS).sort()) {
  if (!/\.(js|css)$/.test(file)) continue;
  const gz = zlib.gzipSync(fs.readFileSync(path.join(ASSETS, file)), { level: 9 }).length;
  const name = stableName(file);
  current[name] = (current[name] || 0) + gz;
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

if (process.argv.includes('--update')) {
  fs.writeFileSync(BASELINE, JSON.stringify(current, null, 2) + '\n');
  console.log(`Wrote ${Object.keys(current).length} sizes to scripts/bundle-baseline.json`);
  process.exit(0);
}

const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf-8')) : {};
const rows = [];
const tooBig = [];
for (const [name, size] of Object.entries(current)) {
  const before = baseline[name];
  if (before === undefined) {
    rows.push(`${name.padEnd(36)} ${kb(size).padStart(10)}   new file`);
    continue;
  }
  const change = (size - before) / before;
  const pct = `${change >= 0 ? '+' : ''}${(change * 100).toFixed(1)}%`;
  rows.push(`${name.padEnd(36)} ${kb(size).padStart(10)}   ${pct}`);
  if (change > ALLOWED_GROWTH) tooBig.push(`${name}: ${kb(before)} -> ${kb(size)} (${pct})`);
}
for (const name of Object.keys(baseline)) {
  if (!(name in current)) rows.push(`${name.padEnd(36)} ${'gone'.padStart(10)}`);
}

console.log('Gzipped size of each file, compared with scripts/bundle-baseline.json:');
console.log(rows.join('\n'));

if (tooBig.length) {
  console.error(`\nThese files grew by more than ${ALLOWED_GROWTH * 100}%:\n  ${tooBig.join('\n  ')}`);
  console.error('If the growth is intended, run node scripts/check-bundle-size.mjs --update and explain it in the pull request.');
  process.exit(1);
}
