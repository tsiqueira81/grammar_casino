import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The AI chain (2026-11-14): CoArena writes with deepseek on one account and glm checks blind on
// another; then NVIDIA, Groq and Gemini take over in that order; all failing sends the game to
// its offline bank. Every step's item is checked by a different model.
const KEYS = {
  COARENA_WRITER_API_KEY: 'cw_test_writer_key',
  COARENA_CHECKER_API_KEY: 'cc_test_checker_key',
  NVIDIA_API_KEY: 'nv_test_key_123',
  GROQ_API_KEY: 'gsk_test_only',
  GEMINI_API_KEY: 'AIza_test_gemini',
};
const OTHER_KEYS = ['GROQ_API_KEY_2', 'GROQ_API_KEYS', 'API_KEY', 'COARENA_BASE_URL', 'NVIDIA_BASE_URL', 'COARENA_WRITER_MODELS', 'COARENA_CHECKER_MODELS'];

let server: typeof import('../server');
let chain: typeof import('../server/textChain');
let providers: typeof import('../server/providers');
let groqUtils: typeof import('../utils/groqUtils');
const saved: Record<string, string | undefined> = {};

beforeAll(async () => {
  process.env.CF_PAGES = '1';
  for (const k of [...Object.keys(KEYS), ...OTHER_KEYS]) saved[k] = process.env[k];
  for (const k of OTHER_KEYS) delete process.env[k];
  server = await import('../server');
  chain = await import('../server/textChain');
  providers = await import('../server/providers');
  groqUtils = await import('../utils/groqUtils');
});
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.unstubAllGlobals();
});

let geminiCalls: string[][] = [];
let geminiAnswer: (prompt: string) => string = () => {
  throw Object.assign(new Error('gemini down'), { status: 503 });
};

function setKeys(which: Partial<typeof KEYS>) {
  for (const k of Object.keys(KEYS)) delete process.env[k];
  Object.assign(process.env, which);
}

beforeEach(() => {
  setKeys(KEYS);
  providers.aiBreaker.reset();
  groqUtils.clearGroqKeyCooldowns();
  vi.unstubAllGlobals();
  geminiCalls = [];
  geminiAnswer = () => {
    throw Object.assign(new Error('gemini down'), { status: 503 });
  };
  // Gemini goes through Google's SDK; the chain lets a test stand in for it.
  chain.setGeminiRunner(async (req, models) => {
    geminiCalls.push(models);
    return { text: geminiAnswer(req.prompt), model: models[0] };
  });
});

const item = {
  text: 'She has lived in Lisbon since 2019.',
  isCorrect: true,
  correction: 'She has lived in Lisbon since 2019.',
  explanation: 'Present perfect with since and a point in time.',
  grammarPhrase: 'has lived',
  errorPhrase: '',
  mistakeType: '',
};
const agree = { grammatical: true, correction: item.text, acceptable: [] };

interface Call {
  host: string;
  model: string;
  auth: string;
  body: any;
}

/** A pretend internet: `answer` says what each call gets back. */
function net(answer: (c: Call, n: number) => Response | object) {
  const calls: Call[] = [];
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}'));
    const headers = (init?.headers || {}) as Record<string, string>;
    const c: Call = { host: new URL(url).host, model: body.model, auth: headers.Authorization || '', body };
    calls.push(c);
    const out = answer(c, calls.length);
    if (out instanceof Response) return out;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(out) } }], usage: { total_tokens: 10 } }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetch);
  return { calls, fetch };
}
const fail = (status: number) => new Response(JSON.stringify({ error: 'no' }), { status });
const isChecker = (c: Call) => /examiner\. Answer only from the text/.test(c.body.messages?.[1]?.content || '') || /Answer each numbered task/.test(c.body.messages?.[1]?.content || '');

let ipN = 0;
const ask = (body: object) =>
  server.dispatchServerlessApi(
    new Request('https://example.test/api/gemini', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    `10.77.${Math.floor(++ipN / 200)}.${ipN % 200}`
  );
const sentence = () => ask({ action: 'generateSentence', settings: { topic: 'Present Perfect', level: 'B1', theme: 'Travel' }, questionType: 'binary', forceCorrect: true });
const metaOf = (res: Response) => JSON.parse(res.headers.get('x-ai-meta') || '{}');

describe('the writer chain, in the order the teacher chose', () => {
  it('lists CoArena, NVIDIA, Groq, Gemini', () => {
    expect(chain.writerChain().map((m) => m.breaker)).toEqual(['coarena-writer', 'nvidia', 'groq', 'gemini']);
    expect(chain.writerChain()[0].model).toBe('deepseek-v4-1-flash-1017');
    expect(chain.writerChain()[1].model).toBe('nvidia/nemotron-3-ultra-550b-a55b');
    expect(chain.writerChain()[2].model).toBe('openai/gpt-oss-120b');
    expect(chain.writerChain()[3].model).toBe('gemini-3.5-flash-lite');
  });

  it('leaves out a provider with no key', () => {
    setKeys({ GROQ_API_KEY: KEYS.GROQ_API_KEY, GEMINI_API_KEY: KEYS.GEMINI_API_KEY });
    expect(chain.writerChain().map((m) => m.breaker)).toEqual(['groq', 'gemini']);
  });

  it('CoArena writes with deepseek on the writer key, glm checks on the checker key', async () => {
    const n = net((c) => (isChecker(c) ? agree : item));
    const res = await sentence();
    expect(res.status).toBe(200);
    expect((await res.json()).checkedBy).toBe('two models');
    expect(n.calls).toHaveLength(2);
    expect(n.calls[0]).toMatchObject({ host: 'coarena.ai', model: 'deepseek-v4-1-flash-1017', auth: `Bearer ${KEYS.COARENA_WRITER_API_KEY}` });
    expect(n.calls[1]).toMatchObject({ host: 'coarena.ai', model: 'glm-5-3-flash', auth: `Bearer ${KEYS.COARENA_CHECKER_API_KEY}` });
    expect(metaOf(res)).toMatchObject({ provider: 'coarena', verified: 'yes', verifiedBy: 'glm-5-3-flash' });
  });

  it('the checker never sees the answer key', async () => {
    const n = net((c) => (isChecker(c) ? agree : item));
    await sentence();
    const checkerPrompt = JSON.stringify(n.calls[1].body.messages);
    expect(checkerPrompt).not.toMatch(/isCorrect|explanation|Present perfect with since/);
  });

  it('NVIDIA writes when CoArena fails, and glm still checks', async () => {
    const n = net((c) => (c.host === 'coarena.ai' && !isChecker(c) ? fail(429) : isChecker(c) ? agree : item));
    const res = await sentence();
    expect(res.status).toBe(200);
    const writers = n.calls.filter((c) => !isChecker(c)).map((c) => c.host);
    expect(writers).toEqual(['coarena.ai', 'integrate.api.nvidia.com']);
    // Nemotron has no JSON mode: thinking off, JSON asked for in words.
    const nv = n.calls.find((c) => c.host === 'integrate.api.nvidia.com')!;
    expect(nv.body.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(nv.body.response_format).toBeUndefined();
    expect(n.calls.find(isChecker)).toMatchObject({ model: 'glm-5-3-flash' });
    const meta = metaOf(res);
    expect(meta.provider).toBe('nvidia');
    expect(meta.fallbackReason).toMatch(/coarena-writer 429/);
  });

  it('Groq writes when CoArena and NVIDIA fail, and its other model checks', async () => {
    setKeys({ COARENA_WRITER_API_KEY: KEYS.COARENA_WRITER_API_KEY, NVIDIA_API_KEY: KEYS.NVIDIA_API_KEY, GROQ_API_KEY: KEYS.GROQ_API_KEY });
    const n = net((c) => (c.host !== 'api.groq.com' ? fail(500) : isChecker(c) ? agree : item));
    const res = await sentence();
    expect(res.status).toBe(200);
    const groqCalls = n.calls.filter((c) => c.host === 'api.groq.com');
    expect(groqCalls.map((c) => c.model)).toEqual(['openai/gpt-oss-120b', 'openai/gpt-oss-20b']);
    expect(metaOf(res)).toMatchObject({ provider: 'groq', verifiedBy: 'openai/gpt-oss-20b' });
  });

  it('Gemini writes last, and a different Gemini model checks', async () => {
    setKeys({ COARENA_WRITER_API_KEY: KEYS.COARENA_WRITER_API_KEY, GEMINI_API_KEY: KEYS.GEMINI_API_KEY });
    net(() => fail(503));
    geminiAnswer = (prompt) => JSON.stringify(/examiner\. Answer only/.test(prompt) ? agree : item);
    const res = await sentence();
    expect(res.status).toBe(200);
    expect(geminiCalls[0][0]).toBe('gemini-3.5-flash-lite');
    expect(geminiCalls[1][0]).not.toBe('gemini-3.5-flash-lite');
    expect(metaOf(res)).toMatchObject({ provider: 'gemini', verified: 'yes' });
  });

  it('everything failing sends the game to its offline bank', async () => {
    net(() => fail(500));
    const res = await sentence();
    expect((await res.json()).fallback).toBe(true);
  });

  it('an item the checker disagrees with is replaced from the bank', async () => {
    net((c) => (isChecker(c) ? { grammatical: false, correction: 'She lived in Lisbon in 2019.', acceptable: [] } : item));
    const res = await sentence();
    expect(res.status).toBe(422);
    expect((await res.json()).fallback).toBe(true);
  });

  it('when glm is resting, another provider checks what deepseek wrote', async () => {
    for (let i = 0; i < 3; i++) providers.aiBreaker.recordFailure('coarena-checker');
    const n = net((c) => (isChecker(c) ? agree : item));
    const res = await sentence();
    expect(res.status).toBe(200);
    expect(n.calls[1].host).toBe('api.groq.com');
  });

  it('a CoArena account that failed three times rests, so the chain goes straight on', async () => {
    for (let i = 0; i < 3; i++) providers.aiBreaker.recordFailure('coarena-writer');
    const n = net((c) => (isChecker(c) ? agree : item));
    const res = await sentence();
    expect(res.status).toBe(200);
    expect(n.calls.filter((c) => !isChecker(c))[0].host).toBe('integrate.api.nvidia.com');
    expect(metaOf(res).fallbackReason).toMatch(/coarena-writer resting/);
  });

  it('no key ever appears in what the game receives', async () => {
    net((c) => (isChecker(c) ? agree : item));
    const res = await sentence();
    const all = (await res.text()) + (res.headers.get('x-ai-meta') || '');
    for (const key of Object.values(KEYS)) expect(all).not.toContain(key);
  });
});

describe('talking to an OpenAI-compatible provider', () => {
  it('asks again without the JSON setting when the provider refuses it', async () => {
    const n = net((c, i) => (i === 1 ? fail(400) : item));
    const out = await chain.callOpenAiCompatible({ baseUrl: 'https://coarena.ai/api/v1', apiKey: 'k_123456', model: 'm', prompt: 'p', responseSchema: { type: 'OBJECT', properties: {} }, jsonMode: 'object' });
    expect(JSON.parse(out.text).text).toBe(item.text);
    expect(n.calls[0].body.response_format).toEqual({ type: 'json_object' });
    expect(n.calls[1].body.response_format).toBeUndefined();
  });

  it('removes the model thinking and finds the JSON', () => {
    expect(chain.cleanModelText('<think>hmm, B1...</think>\n```json\n{"a":1}\n```', true)).toBe('{"a":1}');
    expect(chain.cleanModelText('<think>x</think> Hello', false)).toBe('Hello');
  });

  it('a broken answer counts as a failure, so the next provider is tried', async () => {
    net(() => new Response(JSON.stringify({ choices: [{ message: { content: 'not json at all' } }] }), { status: 200 }));
    await expect(
      chain.callOpenAiCompatible({ baseUrl: 'https://coarena.ai/api/v1', apiKey: 'k_123456', model: 'm', prompt: 'p', responseSchema: { type: 'OBJECT', properties: {} }, jsonMode: 'prompt' })
    ).rejects.toThrow();
  });

  it('a model name that is not found (404) moves on to the next name', async () => {
    const n = net((c) => (c.model === 'nvidia/nemotron-3-ultra-550b-a55b' ? fail(404) : isChecker(c) ? agree : item));
    setKeys({ NVIDIA_API_KEY: KEYS.NVIDIA_API_KEY, GROQ_API_KEY: KEYS.GROQ_API_KEY });
    const res = await sentence();
    expect(res.status).toBe(200);
    expect(n.calls.map((c) => c.model).slice(0, 2)).toEqual(['nvidia/nemotron-3-ultra-550b-a55b', 'nvidia/nemotron-3-ultra']);
  });
});

describe('every step is checked by a different model', () => {
  it.each([
    ['coarena', 'deepseek-v4-1-flash-1017'],
    ['nvidia', 'nvidia/nemotron-3-ultra-550b-a55b'],
    ['groq', 'openai/gpt-oss-120b'],
    ['gemini', 'gemini-3.5-flash-lite'],
  ] as const)('%s', (provider, model) => {
    const checker = chain.pickChecker(provider, model);
    expect(checker).not.toBeNull();
    expect(checker!.model).not.toBe(model);
  });

  it('with only one Groq key, Groq still checks with its other model', () => {
    setKeys({ GROQ_API_KEY: KEYS.GROQ_API_KEY });
    expect(chain.pickChecker('groq', 'openai/gpt-oss-120b')!.model).toBe('openai/gpt-oss-20b');
  });
});

describe('a batch through the server', () => {
  const second = { ...item, text: 'They have just finished their science project.', correction: 'They have just finished their science project.', grammarPhrase: 'have just finished' };
  const batch = () =>
    ask({
      action: 'generateSentenceBatch',
      settings: { topic: 'Present Perfect', level: 'B1', theme: 'Travel' },
      questionType: 'binary',
      slots: [{ forceCorrect: true, theme: 'Travel' }, { forceCorrect: true, theme: 'Travel' }],
    });

  it('deepseek writes both in one call, glm checks both in one call', async () => {
    const n = net((c) =>
      isChecker(c)
        ? { answers: [{ task: 1, ...agree }, { task: 2, grammatical: true, correction: second.text, acceptable: [] }] }
        : { items: [item, second] }
    );
    const res = await batch();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.items.map((i: any) => i.text)).toEqual([item.text, second.text]);
    expect(n.calls.map((c) => c.model)).toEqual(['deepseek-v4-1-flash-1017', 'glm-5-3-flash']);
  });

  it('falls back down the chain for a batch too', async () => {
    const n = net((c) =>
      c.host === 'coarena.ai' && !isChecker(c)
        ? fail(402)
        : isChecker(c)
          ? { answers: [{ task: 1, ...agree }, { task: 2, grammatical: true, correction: second.text, acceptable: [] }] }
          : { items: [item, second] }
    );
    const res = await batch();
    expect((await res.json()).items).toHaveLength(2);
    expect(n.calls.filter((c) => !isChecker(c)).map((c) => c.host)).toEqual(['coarena.ai', 'integrate.api.nvidia.com']);
  });

  it('everything failing gives the game nothing, and it makes those hands as before', async () => {
    net(() => fail(500));
    const res = await batch();
    expect((await res.json()).fallback).toBe(true);
  });
});

describe('fixes after the first live test (2026-11-14)', () => {
  it('a provider without a strict JSON mode is told the field names', async () => {
    const n = net((c) => (isChecker(c) ? agree : item));
    setKeys({ NVIDIA_API_KEY: KEYS.NVIDIA_API_KEY, GROQ_API_KEY: KEYS.GROQ_API_KEY });
    await sentence();
    const nvPrompt = n.calls[0].body.messages[1].content;
    expect(nvPrompt).toMatch(/REPLY FORMAT/);
    expect(nvPrompt).toMatch(/"text"/);
    expect(nvPrompt).toMatch(/"isCorrect"/);
  });

  it('an answer with its own field names counts as a failure, and the next provider writes', async () => {
    const n = net((c) =>
      c.host === 'integrate.api.nvidia.com' ? { sentence: item.text, correct: true } : isChecker(c) ? agree : item
    );
    setKeys({ NVIDIA_API_KEY: KEYS.NVIDIA_API_KEY, GROQ_API_KEY: KEYS.GROQ_API_KEY });
    const res = await sentence();
    expect(res.status).toBe(200);
    const meta = metaOf(res);
    expect(meta.provider).toBe('groq');
    expect(meta.fallbackReason).toMatch(/nvidia answer missing text/);
    expect(n.calls.filter((c) => c.host === 'api.groq.com').length).toBeGreaterThan(0);
  });

  it('a thinking model that says nothing is reported as such', async () => {
    net(() => new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: '', reasoning_content: 'hmm' } }] }), { status: 200 }));
    await expect(
      chain.callOpenAiCompatible({ baseUrl: 'https://x.test/v1', apiKey: 'k_123456', model: 'm', prompt: 'p', responseSchema: { type: 'OBJECT', properties: { a: { type: 'STRING' } } }, jsonMode: 'prompt' })
    ).rejects.toThrow(/ran out of tokens/);
  });

  it('a rejected item still shows why CoArena was skipped', async () => {
    net((c) =>
      c.host === 'coarena.ai' && !isChecker(c) ? fail(401) : isChecker(c) ? { grammatical: false, correction: 'x', acceptable: [] } : item
    );
    const res = await sentence();
    const meta = metaOf(res);
    expect(meta.fallbackReason).toMatch(/coarena-writer 401/);
    expect(meta.fallbackReason).toMatch(/rejected/);
  });

  it('the log lists which writers have a key, so a missing secret shows', async () => {
    net((c) => (isChecker(c) ? agree : item));
    setKeys({ GROQ_API_KEY: KEYS.GROQ_API_KEY });
    const res = await sentence();
    expect(metaOf(res).chain).toBe('groq');
  });

  it('when every AI fails, the game is told each step and why', async () => {
    net(() => fail(500));
    const res = await sentence();
    const body = await res.json();
    expect(body.fallback).toBe(true);
    expect(body.error).toMatch(/coarena-writer 500; nvidia 500/);
    expect(body.error).not.toMatch(/Gemini rate limit/);
  });
});

describe('the health page names the AI keys the server receives', () => {
  it('lists which keys arrived and the writers in use, never a key value', async () => {
    const env = { NVIDIA_API_KEY: KEYS.NVIDIA_API_KEY, GROQ_API_KEY: KEYS.GROQ_API_KEY };
    setKeys(env);
    const res = await server.dispatchServerlessApi(new Request('https://example.test/api/health'), '10.88.0.1', env);
    const text = await res.text();
    const body = JSON.parse(text);
    expect(body.aiChain).toEqual(['nvidia', 'groq']);
    expect(body.aiKeys.NVIDIA_API_KEY).toEqual({ fromCloudflare: true, set: true });
    expect(body.aiKeys.COARENA_WRITER_API_KEY).toEqual({ fromCloudflare: false, set: false });
    for (const key of Object.values(KEYS)) expect(text).not.toContain(key);
  });
});

describe('a sentence the class is waiting for (hedged chain)', () => {
  it('a slow CoArena does not use up the time: NVIDIA starts after 2.5 s and its answer is dealt', async () => {
    const n = net((c) => (isChecker(c) ? agree : item));
    const slowFetch = n.fetch.getMockImplementation()!;
    n.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}'));
      if (String(url).includes('coarena.ai') && String(body.model).startsWith('deepseek')) {
        await new Promise((r) => setTimeout(r, 6_000));
      }
      return slowFetch(url, init);
    });
    const started = Date.now();
    const res = await sentence();
    expect(res.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(metaOf(res).provider).toBe('nvidia');
  }, 15_000);

  it('the first failure starts the next writer at once', async () => {
    const n = net((c) => (c.host === 'coarena.ai' && !isChecker(c) ? fail(503) : isChecker(c) ? agree : item));
    const started = Date.now();
    const res = await sentence();
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(metaOf(res)).toMatchObject({ provider: 'nvidia', fallbackReason: 'coarena-writer 503' });
    expect(n.calls.filter((c) => !isChecker(c)).map((c) => c.host)).toEqual(['coarena.ai', 'integrate.api.nvidia.com']);
  });
});

describe('fixes after the second live test (2026-11-14): slow checker, Groq 404, gpt-oss tokens, 429', () => {
  const groqOnly = () => setKeys({ GROQ_API_KEY: KEYS.GROQ_API_KEY });
  const groqAnswer = (content: string, finish = 'stop') =>
    new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: finish }], usage: { total_tokens: 10 } }), { status: 200 });

  it('the single-sentence check gets 2.5 to 6 s, from what is left of the 8 s', () => {
    expect(providers.singleCheckMs(0)).toBe(6_000);
    expect(providers.singleCheckMs(3_000)).toBe(4_600);
    expect(providers.singleCheckMs(7_000)).toBe(2_500);
  });

  it('a slow glm checker no longer sends the sentence to the bank: Groq joins after 2 s and its answer counts', async () => {
    const n = net((c) => (isChecker(c) ? agree : item));
    const base = n.fetch.getMockImplementation()!;
    n.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}'));
      if (String(body.model).startsWith('glm')) await new Promise((r) => setTimeout(r, 5_000));
      return base(url, init);
    });
    const started = Date.now();
    const res = await sentence();
    expect(res.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(4_000);
    expect(metaOf(res)).toMatchObject({ provider: 'coarena', verified: 'yes', verifiedBy: 'openai/gpt-oss-20b' });
  }, 15_000);

  it('a checker that fails hands over to the next checker at once', async () => {
    const n = net((c) => (String(c.model).startsWith('glm') ? fail(500) : isChecker(c) ? agree : item));
    const started = Date.now();
    const res = await sentence();
    expect(res.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(n.calls.filter(isChecker).map((c) => c.model)).toEqual(['glm-5-3-flash', 'openai/gpt-oss-20b']);
  });

  it('Groq checks with a model it still has, never llama-3.3-70b, and a 404 moves on to the next model at once', async () => {
    groqOnly();
    const n = net((c) => (isChecker(c) && c.model === 'openai/gpt-oss-20b' ? fail(404) : isChecker(c) ? agree : item));
    const res = await sentence();
    expect(res.status).toBe(200);
    expect(n.calls.map((c) => c.model)).toEqual(['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b']);
    expect(n.calls.some((c) => /llama/.test(c.model))).toBe(false);
    expect(metaOf(res).verifiedBy).toBe('qwen/qwen3.8-27b');
  });

  it('the Groq checker can be changed with GROQ_CHECKER_MODELS', () => {
    groqOnly();
    process.env.GROQ_CHECKER_MODELS = 'some/new-model';
    try {
      expect(chain.pickChecker('groq', 'openai/gpt-oss-120b')!.model).toBe('some/new-model');
    } finally {
      delete process.env.GROQ_CHECKER_MODELS;
    }
  });

  it('gpt-oss gets room for its thinking and is asked to think briefly', async () => {
    groqOnly();
    const n = net((c) => (isChecker(c) ? agree : item));
    await sentence();
    const writer = n.calls[0];
    expect(writer.model).toBe('openai/gpt-oss-120b');
    expect(writer.body.reasoning_effort).toBe('low');
    expect(writer.body.max_completion_tokens).toBe(900 + 2_048);
  });

  it('gpt-oss that runs out of tokens while thinking is asked once more with twice the room', async () => {
    groqOnly();
    const n = net((c, i) => (i === 1 ? groqAnswer('', 'length') : isChecker(c) ? agree : item));
    const res = await sentence();
    expect(res.status).toBe(200);
    expect(n.calls[0].body.max_completion_tokens).toBe(2_948);
    expect(n.calls[1].body.max_completion_tokens).toBe(5_896);
    expect(metaOf(res).provider).toBe('groq');
  });

  it('a thinking model on CoArena or NVIDIA gets the same room', async () => {
    let body: any = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        body = JSON.parse(String(init?.body || '{}'));
        return new Response(JSON.stringify({ choices: [{ message: { content: '{"text":"x"}' } }] }), { status: 200 });
      })
    );
    await chain.callOpenAiCompatible({ baseUrl: 'https://x.test/v1', apiKey: 'k', model: 'openai/gpt-oss-120b', prompt: 'p', maxCompletionTokens: 500, jsonMode: 'prompt' });
    expect(body).toMatchObject({ max_tokens: 2_548, reasoning_effort: 'low' });
  });

  it('a busy CoArena writer (429) rests as long as it asked, and is not asked again meanwhile', async () => {
    const busy = () => new Response('{"error":"busy"}', { status: 429, headers: { 'retry-after': '120' } });
    const n = net((c) => (c.host === 'coarena.ai' && !isChecker(c) ? busy() : isChecker(c) ? agree : item));
    const first = await sentence();
    expect(first.status).toBe(200);
    expect(metaOf(first).fallbackReason).toContain('coarena-writer 429 busy, resting 120 s');
    const until = providers.aiBreaker.restingUntil('coarena-writer');
    expect(until - Date.now()).toBeGreaterThan(110_000);
    const writerCalls = () => n.calls.filter((c) => c.host === 'coarena.ai' && !isChecker(c)).length;
    expect(writerCalls()).toBe(1);
    const second = await sentence();
    expect(second.status).toBe(200);
    expect(writerCalls()).toBe(1);
    expect(metaOf(second).fallbackReason).toContain('coarena-writer resting');
  });

  it('without a Retry-After, a provider that stays busy rests 30 s, then 60 s, then 120 s, at most 10 minutes', () => {
    const b = new providers.CircuitBreaker();
    expect(b.recordBusy('coarena-writer', undefined, 0)).toBe(30_000);
    expect(b.recordBusy('coarena-writer', undefined, 0)).toBe(60_000);
    expect(b.recordBusy('coarena-writer', undefined, 0)).toBe(120_000);
    for (let i = 0; i < 10; i++) b.recordBusy('coarena-writer', undefined, 0);
    expect(b.recordBusy('coarena-writer', undefined, 0)).toBe(10 * 60_000);
    b.recordSuccess('coarena-writer');
    expect(b.recordBusy('coarena-writer', 2_000, 0)).toBe(5_000);
  });

  it('reads Retry-After in seconds or as a date', () => {
    expect(providers.parseRetryAfter('7')).toBe(7_000);
    expect(providers.parseRetryAfter(new Date(61_000).toUTCString(), 1_000)).toBe(60_000);
    expect(providers.parseRetryAfter(null)).toBeUndefined();
  });

  it('a batch whose glm check fails is checked by the next checker instead of losing every item', async () => {
    const second = { ...item, text: 'They have just finished their science project.', correction: 'They have just finished their science project.', grammarPhrase: 'have just finished' };
    const n = net((c) =>
      String(c.model).startsWith('glm')
        ? fail(500)
        : isChecker(c)
          ? { answers: [{ task: 1, ...agree }, { task: 2, grammatical: true, correction: second.text, acceptable: [] }] }
          : { items: [item, second] }
    );
    const res = await ask({
      action: 'generateSentenceBatch',
      settings: { topic: 'Present Perfect', level: 'B1', theme: 'Travel' },
      questionType: 'binary',
      slots: [{ forceCorrect: true, theme: 'Travel' }, { forceCorrect: true, theme: 'Travel' }],
    });
    expect((await res.json()).items).toHaveLength(2);
    expect(n.calls.filter(isChecker).map((c) => c.model)).toEqual(['glm-5-3-flash', 'openai/gpt-oss-20b']);
    expect(metaOf(res).verifiedBy).toBe('openai/gpt-oss-20b');
  });
});
