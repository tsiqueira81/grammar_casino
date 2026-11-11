import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Package L3 end to end on the server: Groq writes with one model, checks with the other, and a
// rejected item becomes { fallback: true } so the game deals from its bank instead.
let server: typeof import('../server');
beforeAll(async () => {
  process.env.CF_PAGES = '1';
  for (const key of ['GROQ_API_KEY_2', 'GEMINI_API_KEY', 'API_KEY']) delete process.env[key];
  process.env.GROQ_API_KEY = 'gsk_test_only';
  server = await import('../server');
});
afterEach(() => vi.unstubAllGlobals());

const item = {
  text: 'She has lived in Lisbon since 2019.',
  isCorrect: true,
  correction: 'She has lived in Lisbon since 2019.',
  explanation: 'Present perfect with since and a point in time.',
  grammarPhrase: 'has lived',
  errorPhrase: '',
  mistakeType: '',
};

function groq(verdict: object) {
  const models: string[] = [];
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    models.push(body.model);
    const content = models.length === 1 ? JSON.stringify(item) : JSON.stringify(verdict);
    return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { total_tokens: 10 } }), { status: 200 });
  });
  return { fetch, models };
}

const ask = (ip: string) =>
  server.dispatchServerlessApi(
    new Request('https://example.test/api/gemini', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'generateSentence', settings: { topic: 'Present Perfect', level: 'B1', theme: 'Travel' }, questionType: 'binary', forceCorrect: true }),
    }),
    ip
  );

describe('a second model checks every AI sentence', () => {
  it('deals the item when the checker agrees, checked by the other model', async () => {
    const g = groq({ grammatical: true, correction: item.text, acceptable: [] });
    vi.stubGlobal('fetch', g.fetch);
    const res = await ask('10.9.0.1');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.text).toBe(item.text);
    expect(data.checkedBy).toBe('two models');
    expect(g.models.length).toBe(2);
    expect(g.models[0]).not.toBe(g.models[1]);
    const meta = JSON.parse(res.headers.get('x-ai-meta') || '{}');
    expect(meta).toMatchObject({ provider: 'groq', verified: 'yes', verifiedBy: g.models[1] });
  });

  it('sends the game to its bank when the checker disagrees', async () => {
    const g = groq({ grammatical: false, correction: 'She lived in Lisbon in 2019.', acceptable: [] });
    vi.stubGlobal('fetch', g.fetch);
    const res = await ask('10.9.0.2');
    expect(res.status).toBe(422);
    expect((await res.json()).fallback).toBe(true);
    expect(JSON.parse(res.headers.get('x-ai-meta') || '{}').verified).toBe('no');
  });
});
