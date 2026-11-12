import { beforeAll, describe, expect, it } from 'vitest';

// Load the API the way the Cloudflare Pages Function does, so no dev server starts.
let server: typeof import('../server');
beforeAll(async () => {
  process.env.CF_PAGES = '1';
  server = await import('../server');
});

describe('serverless API after the teacher PIN was removed (R7)', () => {
  it('no longer offers the PIN or Google-check endpoints', async () => {
    for (const path of ['/api/teacher-auth/status', '/api/teacher-auth/verify', '/api/teacher-auth/change-pin', '/api/teacher-auth/google-verify']) {
      const res = await server.dispatchServerlessApi(
        new Request(`https://example.test${path}`, { method: path.endsWith('status') ? 'GET' : 'POST', body: path.endsWith('status') ? undefined : '{}' })
      );
      expect(res.status, path).toBe(404);
    }
  });

  it('still answers the health check', async () => {
    const res = await server.dispatchServerlessApi(new Request('https://example.test/api/health'));
    expect(await res.json()).toEqual({ status: 'ok', app: 'grammar-casino', aiConfigured: false });
  });
});

describe('daily AI limit per address', () => {
  it('allows 2500 calls a day from one address, then refuses until the day has passed', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 2500; i++) expect(server.checkDailyIpLimit('10.0.0.1', t0 + i)).toEqual({ allowed: true });
    const refused = server.checkDailyIpLimit('10.0.0.1', t0 + 5000);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfter).toBeGreaterThan(0);
    expect(server.checkDailyIpLimit('10.0.0.2', t0 + 5000).allowed).toBe(true);
    expect(server.checkDailyIpLimit('10.0.0.1', t0 + 24 * 60 * 60 * 1000).allowed).toBe(true);
  });
});
