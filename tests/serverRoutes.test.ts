import { beforeAll, describe, expect, it } from 'vitest';

// Router checks for the serverless API (package A1), loaded the way the Cloudflare Pages Function
// loads it, so no dev server starts. None of these reach an AI provider.
let server: typeof import('../server');
beforeAll(async () => {
  process.env.CF_PAGES = '1';
  // No AI keys, so nothing here can reach a provider.
  for (const key of ['GROQ_API_KEY', 'GROQ_API_KEY_2', 'GEMINI_API_KEY', 'API_KEY']) delete process.env[key];
  server = await import('../server');
});

const call = (path: string, init?: RequestInit, ip = '10.1.0.1') =>
  server.dispatchServerlessApi(new Request(`https://example.test${path}`, init), ip);

const postJson = (path: string, body: unknown, ip?: string) =>
  call(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, ip);

describe('serverless API routes', () => {
  it('answers the health check as JSON', async () => {
    const res = await call('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ status: 'ok', app: 'grammar-casino', aiConfigured: false });
  });

  it('says whether AI sentences are on, never the key (package T6)', async () => {
    process.env.GEMINI_API_KEY = 'test-key-not-real-123';
    try {
      const body = await (await call('/api/health')).json();
      expect(body.aiConfigured).toBe(true);
      expect(JSON.stringify(body)).not.toContain('test-key');
    } finally {
      delete process.env.GEMINI_API_KEY;
    }
  });

  it('refuses an AI request without an action', async () => {
    const res = await postJson('/api/gemini', {});
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/action/);
  });

  it('without an AI key, answers 503 so the game falls back to the offline bank', async () => {
    for (const action of ['generateSentence', 'verifyCorrection', 'deleteEverything']) {
      const res = await postJson('/api/gemini', { action });
      expect(res.status, action).toBe(503);
      expect((await res.json()).code).toBe('MISSING_API_KEY');
    }
  });

  it('copes with a body that is not JSON', async () => {
    const res = await call('/api/gemini', { method: 'POST', body: 'not json' });
    expect(res.status).toBe(400);
  });

  it('says 404 for other paths, including the live-room relay, which runs only on the dev server', async () => {
    for (const path of ['/api/nothing', '/api/mp/room/create']) {
      const res = await call(path, { method: 'POST', body: '{}' });
      expect(res.status, path).toBe(404);
    }
  });

  it('slows down one address that sends too many AI requests in a minute', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 45; i++) statuses.push((await postJson('/api/gemini', {}, '10.9.9.9')).status);
    expect(statuses.slice(0, 40).every((s) => s === 400)).toBe(true);
    expect(statuses.slice(40)).toContain(429);
  });
});

describe('deep health check (package A2)', () => {
  it('refuses without the health check token', async () => {
    const res = await call('/api/health?deep=1');
    expect(res.status).toBe(403);
  });
});
