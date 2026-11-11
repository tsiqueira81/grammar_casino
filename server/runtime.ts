import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const isCloudflareWorker =
  typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';
export const isServerlessRuntime = Boolean(
  isCloudflareWorker ||
    process.env.NETLIFY ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.CF_PAGES
);
export const APP_ROOT_DIR = (() => {
  if (isCloudflareWorker) return '/';
  try {
    if (typeof import.meta !== 'undefined' && import.meta.url) {
      // This file is in server/, so the project root is one folder up.
      return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    }
  } catch {}
  try {
    return process.cwd();
  } catch {
    return '/';
  }
})();

// Automatically load .env from project root if present (without overriding existing environment variables)
if (!isServerlessRuntime) {
  try {
    const envFilePath = path.resolve(APP_ROOT_DIR, '.env');
    if (fs.existsSync(envFilePath)) {
      const rawEnv = fs.readFileSync(envFilePath, 'utf-8');
      for (const line of rawEnv.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx <= 0) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (key && process.env[key] === undefined) {
          process.env[key] = val;
        }
      }
    }
  } catch (err) {
    console.warn('Could not parse .env file:', err);
  }
}
