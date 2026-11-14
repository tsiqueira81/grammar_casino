import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The AI chain (2026-11-14, CoArena dropped): on NVIDIA, glm writes on one account and minimax
// checks blind on another; then Nemotron, Groq and Gemini take over in that order; all failing
// sends the game to its offline bank. Every step's item is checked by a different model.
const KEYS = {
  NVIDIA_API_KEY: 'nv_test_key_123',
  NVIDIA_CHECKER_API_KEY: 'nvc_test_checker_key',
  GROQ_API_KEY: 'gsk_test_only',
  GEMINI_API_KEY: 'AIza_test_gemini',
};
const TIMING_KEYS = ['AI_WRITER_ORDER', 'GROQ_TEXT_MODELS', 'GROQ_CHECKER_MODELS', 'AI_HEAD_START_MS', 'AI_SENTENCE_BUDGET_MS', 'AI_AHEAD_HEAD_START_MS', 'AI_AHEAD_BUDGET_MS', 'AI_HEDGE_AFTER_MS'];
const OTHER_KEYS = ['GROQ_API_KEY_2', 'GROQ_API_KEYS', 'API_KEY', 'NVIDIA_BASE_URL', 'NVIDIA_WRITER_MODELS', 'NVIDIA_CHECKER_MODELS', 'NVIDIA_TEXT_MODELS', ...TIMING_KEYS];
const GLM = 'z-ai/glm-5.3-flash';
const MINIMAX = 'minimaxai/minimax-m3.1-flash';
const NEMOTRON = 'nvidia/nemotron-3-ultra-550b-a55b';
const NV_HOST = 'integrate.api.nvidia.com';

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

/**
 * Most tests below were written for the NVIDIA-first chain (glm writing, PR #28). Since
 * 2026-11-14 Groq qwen writes first by default; these settings put the earlier chain back, so
 * those tests keep checking the NVIDIA path, which is still used as the backup (and by anyone who
 * sets AI_WRITER_ORDER). The tests of the new default clear them (see "Groq writes first").
 */
const NVIDIA_FIRST = {
  AI_WRITER_ORDER: 'nvidia-writer,nemotron,groq,gemini',
  GROQ_TEXT_MODELS: 'openai/gpt-oss-120b,openai/gpt-oss-20b',
  GROQ_CHECKER_MODELS: 'openai/gpt-oss-20b,qwen/qwen3.8-27b,openai/gpt-oss-120b',
};

beforeEach(() => {
  setKeys(KEYS);
  for (const k of TIMING_KEYS) delete process.env[k];
  Object.assign(process.env, NVIDIA_FIRST);
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
const isGlm = (c: Call) => c.model === GLM;
const isChecker = (c: Call) => /examiner\. Answer only from the text/.test(c.body.messages?.[1]?.content || '') || /Answer each numbered task/.test(c.body.messages?.[1]?.content || '');

let ipN = 0;
const ask = (body: object) =>
  server.dispatchServerlessApi(
    new Request('https://example.test/api/gemini', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    `10.77.${Math.floor(++ipN / 200)}.${ipN % 200}`
  );
const sentence = (extra: object = {}) => ask({ action: 'generateSentence', settings: { topic: 'Present Perfect', level: 'B1', theme: 'Travel' }, questionType: 'binary', forceCorrect: true, ...extra });
const metaOf = (res: Response) => JSON.parse(res.headers.get('x-ai-meta') || '{}');

describe('the writer chain, in the order the teacher chose', () => {
  it('lists NVIDIA glm, NVIDIA Nemotron, Groq, Gemini, and no CoArena', () => {
    expect(chain.writerChain().map((m) => m.breaker)).toEqual(['nvidia-writer', 'nemotron', 'groq', 'gemini']);
    expect(chain.writerChain()[0].model).toBe(GLM);
    expect(chain.writerChain()[1].model).toBe(NEMOTRON);
    expect(chain.writerChain()[2].model).toBe('openai/gpt-oss-120b');
    expect(chain.writerChain()[3].model).toBe('gemini-3.5-flash-lite');
  });

  it('leaves out a provider with no key', () => {
    setKeys({ GROQ_API_KEY: KEYS.GROQ_API_KEY, GEMINI_API_KEY: KEYS.GEMINI_API_KEY });
    expect(chain.writerChain().map((m) => m.breaker)).toEqual(['groq', 'gemini']);
  });

  it('glm writes on the first NVIDIA key; minimax checks on the second key when Groq is resting', async () => {
    for (let i = 0; i < 3; i++) providers.aiBreaker.recordFailure('groq');
    const n = net((c) => (isChecker(c) ? agree : item));
    const res = await sentence();
    expect(res.status).toBe(200);
    expect((await res.json()).checkedBy).toBe('two models');
    expect(n.calls).toHaveLength(2);
    expect(n.calls[0]).toMatchObject({ host: NV_HOST, model: GLM, auth: `Bearer ${KEYS.NVIDIA_API_KEY}` });
    expect(n.calls[1]).toMatchObject({ host: NV_HOST, model: MINIMAX, auth: `Bearer ${KEYS.NVIDIA_CHECKER_API_KEY}` });
    expect(metaOf(res)).toMatchObject({ provider: 'nvidia', model: GLM, verified: 'yes', verifiedBy: MINIMAX });
  });

  it('glm and minimax are asked for JSON with thinking off; minimax gets room to think briefly', async () => {
    for (let i = 0; i < 3; i++) providers.aiBreaker.recordFailure('groq');
    const n = net((c) => (isChecker(c) ? agree : item));
    await sentence();
    const [writer, checker] = n.calls;
    expect(writer.body.response_format).toEqual({ type: 'json_object' });
    expect(writer.body.chat_template_kwargs).toEqual({ enable_thinking: false, thinking: false });
    expect(writer.body.reasoning_effort).toBeUndefined();
    expect(checker.body.reasoning_effort).toBe('low');
    expect(checker.body.max_tokens).toBe(300 + 2_048);
  });

  it('without a second NVIDIA key, minimax checks on the first key', async () => {
    setKeys({ NVIDIA_API_KEY: KEYS.NVIDIA_API_KEY });
    const n = net((c) => (isChecker(c) ? agree : item));
    const res = await sentence();
    expect(res.status).toBe(200);
    expect(n.calls[1]).toMatchObject({ model: MINIMAX, auth: `Bearer ${KEYS.NVIDIA_API_KEY}` });
  });

  it('the NVIDIA models can be changed with NVIDIA_WRITER_MODELS and NVIDIA_CHECKER_MODELS', () => {
    process.env.NVIDIA_WRITER_MODELS = 'some/writer, other/writer';
    process.env.NVIDIA_CHECKER_MODELS = 'some/checker';
    try {
      expect(chain.writerChain()[0].model).toBe('some/writer');
      expect(chain.checkerOrder('nvidia', 'some/writer')[0].model).toBe('some/checker');
    } finally {
      delete process.env.NVIDIA_WRITER_MODELS;
      delete process.env.NVIDIA_CHECKER_MODELS;
    }
  });

  it('a sentence the class waits for is checked by the fastest checker first (Groq gpt-oss-20b), a batch by minimax', () => {
    expect(chain.checkerOrder('nvidia', GLM, 'fast').map((c) => c.model)).toEqual(['openai/gpt-oss-20b', MINIMAX, 'gemini-3.8-flash']);
    expect(chain.checkerOrder('nvidia', GLM).map((c) => c.model)[0]).toBe(MINIMAX);
  });

  it('the checker never sees the answer key', async () => {
    const n = net((c) => (isChecker(c) ? agree : item));
    await sentence();
    const checkerPrompt = JSON.stringify(n.calls[1].body.messages);
    expect(checkerPrompt).not.toMatch(/isCorrect|explanation|Present perfect with since/);
  });

  it('Nemotron writes when glm fails, and Groq checks it', async () => {
    const n = net((c) => (isGlm(c) ? fail(429) : isChecker(c) ? agree : item));
    const res = await sentence();
    expect(res.status).toBe(200);
    const writers = n.calls.filter((c) => !isChecker(c)).map((c) => c.model);
    expect(writers).toEqual([GLM, NEMOTRON]);
    // Nemotron has no JSON mode: thinking off, JSON asked for in words.
    const nv = n.calls.find((c) => c.model === NEMOTRON)!;
    expect(nv.body.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(nv.body.response_format).toBeUndefined();
    expect(n.calls.find(isChecker)).toMatchObject({ model: 'openai/gpt-oss-20b' });
    const meta = metaOf(res);
    expect(meta.provider).toBe('nvidia');
    expect(meta.fallbackReason).toMatch(/nvidia-writer 429/);
  });

  it('Groq writes when both NVIDIA writers fail, and its other model checks', async () => {
    setKeys({ NVIDIA_API_KEY: KEYS.NVIDIA_API_KEY, GROQ_API_KEY: KEYS.GROQ_API_KEY });
    const n = net((c) => (c.host !== 'api.groq.com' ? fail(500) : isChecker(c) ? agree : item));
    const res = await sentence();
    expect(res.status).toBe(200);
    const groqCalls = n.calls.filter((c) => c.host === 'api.groq.com');
    expect(groqCalls.map((c) => c.model)).toEqual(['openai/gpt-oss-120b', 'openai/gpt-oss-20b']);
    expect(metaOf(res)).toMatchObject({ provider: 'groq', verifiedBy: 'openai/gpt-oss-20b' });
  });

  it('Gemini writes last, and a different Gemini model checks', async () => {
    setKeys({ NVIDIA_API_KEY: KEYS.NVIDIA_API_KEY, GEMINI_API_KEY: KEYS.GEMINI_API_KEY });
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

  it('when minimax is resting, another provider checks what glm wrote', async () => {
    for (let i = 0; i < 3; i++) providers.aiBreaker.recordFailure('nvidia-checker');
    const n = net((c) => (isChecker(c) ? agree : item));
    const res = await sentence();
    expect(res.status).toBe(200);
    expect(n.calls[1].host).toBe('api.groq.com');
  });

  it('a glm writer that failed three times rests, so the chain goes straight on', async () => {
    for (let i = 0; i < 3; i++) providers.aiBreaker.recordFailure('nvidia-writer');
    const n = net((c) => (isChecker(c) ? agree : item));
    const res = await sentence();
    expect(res.status).toBe(200);
    expect(n.calls.filter((c) => !isChecker(c))[0].model).toBe(NEMOTRON);
    expect(metaOf(res).fallbackReason).toMatch(/nvidia-writer resting/);
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
    const out = await chain.callOpenAiCompatible({ baseUrl: 'https://integrate.api.nvidia.com/v1', apiKey: 'k_123456', model: 'm', prompt: 'p', responseSchema: { type: 'OBJECT', properties: {} }, jsonMode: 'object' });
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
      chain.callOpenAiCompatible({ baseUrl: 'https://integrate.api.nvidia.com/v1', apiKey: 'k_123456', model: 'm', prompt: 'p', responseSchema: { type: 'OBJECT', properties: {} }, jsonMode: 'prompt' })
    ).rejects.toThrow();
  });

  it('a model name that is not found (404) moves on to the next name', async () => {
    const n = net((c) => (isGlm(c) ? fail(503) : c.model === NEMOTRON ? fail(404) : isChecker(c) ? agree : item));
    setKeys({ NVIDIA_API_KEY: KEYS.NVIDIA_API_KEY, GROQ_API_KEY: KEYS.GROQ_API_KEY });
    const res = await sentence();
    expect(res.status).toBe(200);
    expect(n.calls.filter((c) => !isChecker(c)).map((c) => c.model).slice(0, 3)).toEqual([GLM, NEMOTRON, 'nvidia/nemotron-3-ultra']);
  });
});

describe('every step is checked by a different model', () => {
  it.each([
    ['nvidia', GLM],
    ['nvidia', NEMOTRON],
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

  it('glm writes both in one call, minimax checks both in one call', async () => {
    const n = net((c) =>
      isChecker(c)
        ? { answers: [{ task: 1, ...agree }, { task: 2, grammatical: true, correction: second.text, acceptable: [] }] }
        : { items: [item, second] }
    );
    const res = await batch();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.items.map((i: any) => i.text)).toEqual([item.text, second.text]);
    expect(n.calls.map((c) => c.model)).toEqual([GLM, MINIMAX]);
  });

  it('falls back down the chain for a batch too', async () => {
    const n = net((c) =>
      isGlm(c)
        ? fail(402)
        : isChecker(c)
          ? { answers: [{ task: 1, ...agree }, { task: 2, grammatical: true, correction: second.text, acceptable: [] }] }
          : { items: [item, second] }
    );
    const res = await batch();
    expect((await res.json()).items).toHaveLength(2);
    expect(n.calls.filter((c) => !isChecker(c)).map((c) => c.model)).toEqual([GLM, NEMOTRON]);
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
      c.host === NV_HOST && !isChecker(c) ? { sentence: item.text, correct: true } : isChecker(c) ? agree : item
    );
    setKeys({ NVIDIA_API_KEY: KEYS.NVIDIA_API_KEY, GROQ_API_KEY: KEYS.GROQ_API_KEY });
    const res = await sentence();
    expect(res.status).toBe(200);
    const meta = metaOf(res);
    expect(meta.provider).toBe('groq');
    expect(meta.fallbackReason).toMatch(/nvidia-writer answer missing text/);
    expect(meta.fallbackReason).toMatch(/nemotron answer missing text/);
    expect(n.calls.filter((c) => c.host === 'api.groq.com').length).toBeGreaterThan(0);
  });

  it('a thinking model that says nothing is reported as such', async () => {
    net(() => new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: '', reasoning_content: 'hmm' } }] }), { status: 200 }));
    await expect(
      chain.callOpenAiCompatible({ baseUrl: 'https://x.test/v1', apiKey: 'k_123456', model: 'm', prompt: 'p', responseSchema: { type: 'OBJECT', properties: { a: { type: 'STRING' } } }, jsonMode: 'prompt' })
    ).rejects.toThrow(/ran out of tokens/);
  });

  it('a rejected item still shows why glm was skipped', async () => {
    net((c) =>
      isGlm(c) ? fail(401) : isChecker(c) ? { grammatical: false, correction: 'x', acceptable: [] } : item
    );
    const res = await sentence();
    const meta = metaOf(res);
    expect(meta.fallbackReason).toMatch(/nvidia-writer 401/);
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
    expect(body.error).toMatch(/nvidia-writer 500; nemotron 500/);
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
    expect(body.aiChain).toEqual(['nvidia-writer', 'nemotron', 'groq']);
    expect(body.aiKeys.NVIDIA_API_KEY).toEqual({ fromCloudflare: true, set: true });
    expect(body.aiKeys.NVIDIA_CHECKER_API_KEY).toEqual({ fromCloudflare: false, set: false });
    expect(Object.keys(body.aiKeys).some((k) => /COARENA/.test(k))).toBe(false);
    for (const key of Object.values(KEYS)) expect(text).not.toContain(key);
  });
});

describe('a sentence the class is waiting for (hedged chain)', () => {
  it('a slow glm does not use up the time: Nemotron starts after the head start, its answer is dealt, and the log says glm was still busy', async () => {
    // The head start is a server setting; 1.5 s here keeps the test short.
    process.env.AI_HEAD_START_MS = '1500';
    const n = net((c) => (isChecker(c) ? agree : item));
    const slowFetch = n.fetch.getMockImplementation()!;
    n.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}'));
      if (body.model === GLM) {
        await new Promise((r) => setTimeout(r, 6_000));
      }
      return slowFetch(url, init);
    });
    const started = Date.now();
    const res = await sentence();
    expect(res.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(4_000);
    expect(metaOf(res)).toMatchObject({ provider: 'nvidia', model: NEMOTRON });
    expect(metaOf(res).fallbackReason).toMatch(/nvidia-writer still busy after \d\.\d s/);
    expect(metaOf(res).writers).toMatch(/^nvidia-writer still writing after 1\.\d s; nemotron wrote in 0\.\d s \(started at 1\.[5-9] s\)$/);
  }, 15_000);

  it('the first failure starts the next writer at once', async () => {
    const n = net((c) => (isGlm(c) ? fail(503) : isChecker(c) ? agree : item));
    const started = Date.now();
    const res = await sentence();
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(metaOf(res)).toMatchObject({ provider: 'nvidia', model: NEMOTRON, fallbackReason: 'nvidia-writer 503' });
    expect(n.calls.filter((c) => !isChecker(c)).map((c) => c.model)).toEqual([GLM, NEMOTRON]);
  });
});

describe('fixes after the second live test (2026-11-14): slow checker, Groq 404, gpt-oss tokens, 429', () => {
  const groqOnly = () => setKeys({ GROQ_API_KEY: KEYS.GROQ_API_KEY });
  const groqAnswer = (content: string, finish = 'stop') =>
    new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: finish }], usage: { total_tokens: 10 } }), { status: 200 });

  it('the single-sentence check gets 2.5 to 6 s, from what is left until 10.6 s (the class waits 12 s since 2026-11-14)', () => {
    expect(providers.singleCheckMs(0)).toBe(6_000);
    expect(providers.singleCheckMs(6_000)).toBe(4_600);
    expect(providers.singleCheckMs(9_000)).toBe(2_500);
    // A sentence made ahead has a later deadline.
    expect(providers.singleCheckMs(14_000, providers.sentenceTiming('ahead').checkDeadlineMs)).toBe(4_600);
  });

  it('a slow first checker no longer sends the sentence to the bank: minimax joins after 1.2 s, its answer counts, and the log says who was slow', async () => {
    const n = net((c) => (isChecker(c) ? agree : item));
    const base = n.fetch.getMockImplementation()!;
    n.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}'));
      if (String(url).includes('groq')) await new Promise((r) => setTimeout(r, 5_000));
      return base(url, init);
    });
    const started = Date.now();
    const res = await sentence();
    expect(res.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(3_000);
    const meta = metaOf(res);
    expect(meta).toMatchObject({ provider: 'nvidia', verified: 'yes', verifiedBy: MINIMAX });
    expect(meta.fallbackReason).toMatch(/check: groq still busy after 1\.\d s/);
  }, 15_000);

  it('a checker that fails hands over to the next checker at once', async () => {
    const n = net((c) => (c.host === 'api.groq.com' && isChecker(c) ? fail(500) : isChecker(c) ? agree : item));
    const started = Date.now();
    const res = await sentence();
    expect(res.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(1_000);
    const checkers = n.calls.filter(isChecker).map((c) => c.model);
    expect(checkers[0]).toBe('openai/gpt-oss-20b');
    expect(checkers[checkers.length - 1]).toBe(MINIMAX);
    expect(metaOf(res)).toMatchObject({ verifiedBy: MINIMAX });
    expect(metaOf(res).fallbackReason).toContain('check: groq 500');
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

  it('a thinking model on NVIDIA gets the same room', async () => {
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

  it('a busy glm writer (429) rests as long as it asked, and is not asked again meanwhile', async () => {
    const busy = () => new Response('{"error":"busy"}', { status: 429, headers: { 'retry-after': '120' } });
    const n = net((c) => (isGlm(c) ? busy() : isChecker(c) ? agree : item));
    const first = await sentence();
    expect(first.status).toBe(200);
    expect(metaOf(first).fallbackReason).toContain('nvidia-writer 429 busy, resting 120 s');
    const until = providers.aiBreaker.restingUntil('nvidia-writer');
    expect(until - Date.now()).toBeGreaterThan(110_000);
    const writerCalls = () => n.calls.filter(isGlm).length;
    expect(writerCalls()).toBe(1);
    const second = await sentence();
    expect(second.status).toBe(200);
    expect(writerCalls()).toBe(1);
    expect(metaOf(second).fallbackReason).toMatch(/nvidia-writer resting, 1[12]\d s left/);
  });

  it('without a Retry-After, a provider that stays busy rests 30 s, then 60 s, then 120 s, at most 10 minutes', () => {
    const b = new providers.CircuitBreaker();
    expect(b.recordBusy('nvidia-writer', undefined, 0)).toBe(30_000);
    expect(b.recordBusy('nvidia-writer', undefined, 0)).toBe(60_000);
    expect(b.recordBusy('nvidia-writer', undefined, 0)).toBe(120_000);
    for (let i = 0; i < 10; i++) b.recordBusy('nvidia-writer', undefined, 0);
    expect(b.recordBusy('nvidia-writer', undefined, 0)).toBe(10 * 60_000);
    b.recordSuccess('nvidia-writer');
    expect(b.recordBusy('nvidia-writer', 2_000, 0)).toBe(5_000);
  });

  it('reads Retry-After in seconds or as a date', () => {
    expect(providers.parseRetryAfter('7')).toBe(7_000);
    expect(providers.parseRetryAfter(new Date(61_000).toUTCString(), 1_000)).toBe(60_000);
    expect(providers.parseRetryAfter(null)).toBeUndefined();
  });

  it('a batch whose minimax check fails is checked by the next checker instead of losing every item', async () => {
    const second = { ...item, text: 'They have just finished their science project.', correction: 'They have just finished their science project.', grammarPhrase: 'have just finished' };
    const n = net((c) =>
      c.model === MINIMAX
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
    expect(n.calls.filter(isChecker).map((c) => c.model)).toEqual([MINIMAX, 'openai/gpt-oss-20b']);
    expect(metaOf(res).verifiedBy).toBe('openai/gpt-oss-20b');
  });
});

describe('glm gets more time (2026-11-14: Groq kept winning the race after 1.5 s)', () => {
  const slowGlm = (n: ReturnType<typeof net>, ms: number) => {
    const base = n.fetch.getMockImplementation()!;
    n.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}'));
      if (body.model === GLM) await new Promise((r) => setTimeout(r, ms));
      return base(url, init);
    });
  };

  it('defaults (Groq first since 2026-11-14): the first writer works alone for 3 s when the class waits and 4 s when made ahead; 11 s and 19 s in all, below what the game waits', () => {
    expect(providers.sentenceTiming('now')).toEqual({ headStartMs: 3_000, totalMs: 11_000, writerBudgetMs: 8_100, checkDeadlineMs: 10_600, hedgeAfterMs: 1_500 });
    expect(providers.sentenceTiming('ahead')).toEqual({ headStartMs: 4_000, totalMs: 19_000, writerBudgetMs: 16_100, checkDeadlineMs: 18_600, hedgeAfterMs: 1_500 });
    expect(providers.sentenceTiming('now').totalMs).toBeLessThan(providers.GAME_WAITS_MS.now);
    expect(providers.sentenceTiming('ahead').totalMs).toBeLessThan(providers.GAME_WAITS_MS.ahead);
  });

  it('the server settings change them, but never past what the game waits', () => {
    process.env.AI_HEAD_START_MS = '6000';
    process.env.AI_SENTENCE_BUDGET_MS = '10000';
    process.env.AI_AHEAD_HEAD_START_MS = '12000';
    process.env.AI_AHEAD_BUDGET_MS = '60000';
    expect(providers.sentenceTiming('now')).toMatchObject({ headStartMs: 6_000, totalMs: 10_000, writerBudgetMs: 7_100 });
    expect(providers.sentenceTiming('ahead')).toMatchObject({ headStartMs: 12_000, totalMs: 19_500 });
    // A head start longer than the writers' time is cut to it; nonsense is ignored.
    process.env.AI_HEAD_START_MS = '99000';
    process.env.AI_SENTENCE_BUDGET_MS = 'soon';
    expect(providers.sentenceTiming('now')).toMatchObject({ headStartMs: 8_100, totalMs: 11_000 });
  });

  it('glm answering within its head start writes the sentence and no backup writer is asked', async () => {
    process.env.AI_HEAD_START_MS = '1200';
    const n = net((c) => (isChecker(c) ? agree : item));
    slowGlm(n, 800);
    const res = await sentence();
    expect(res.status).toBe(200);
    expect(metaOf(res)).toMatchObject({ provider: 'nvidia', model: GLM, verified: 'yes' });
    expect(metaOf(res).writers).toMatch(/^nvidia-writer wrote in 0\.[89] s$/);
    expect(n.calls.filter((c) => !isChecker(c)).map((c) => c.model)).toEqual([GLM]);
  });

  it('a sentence made ahead gives glm its longer head start: the same slow glm loses when the class waits and wins when made ahead', async () => {
    process.env.AI_HEAD_START_MS = '300';
    process.env.AI_AHEAD_HEAD_START_MS = '1500';
    const now = net((c) => (isChecker(c) ? agree : item));
    slowGlm(now, 800);
    const waiting = await sentence();
    expect(metaOf(waiting)).toMatchObject({ model: NEMOTRON });
    expect(metaOf(waiting).urgency).toBe('now');

    providers.aiBreaker.reset();
    const later = net((c) => (isChecker(c) ? agree : item));
    slowGlm(later, 800);
    const ahead = await sentence({ ahead: true });
    expect(metaOf(ahead)).toMatchObject({ model: GLM, urgency: 'ahead' });
    expect(later.calls.filter((c) => !isChecker(c)).map((c) => c.model)).toEqual([GLM]);
  });

  it('after the head start the backups follow 1.5 s apart: glm, then Nemotron, then Groq', async () => {
    process.env.AI_HEAD_START_MS = '200';
    process.env.AI_HEDGE_AFTER_MS = '200';
    const n = net((c) => (isChecker(c) ? agree : item));
    const base = n.fetch.getMockImplementation()!;
    n.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}'));
      if (body.model === GLM || body.model === NEMOTRON) await new Promise((r) => setTimeout(r, 3_000));
      return base(url, init);
    });
    const res = await sentence();
    expect(metaOf(res)).toMatchObject({ provider: 'groq' });
    expect(metaOf(res).writers).toMatch(/^nvidia-writer still writing after 0\.\d s; nemotron still writing after 0\.\d s \(started at 0\.[2-3] s\); groq wrote in 0\.\d s \(started at 0\.[4-6] s\)$/);
  });

  it('when every writer fails, the reason sent to the game includes how long each one took', async () => {
    net((c) => (isChecker(c) ? agree : fail(500)));
    const body = await (await sentence()).json();
    expect(body.fallback).toBe(true);
    expect(body.error).toMatch(/timing: nvidia-writer failed after 0\.\d s \(500\); nemotron failed after/);
  });

  it('the timing line names each writer, how long it took, and when it started', () => {
    expect(
      chain.writerTimingNote(
        [
          { key: 'nvidia-writer', startedMs: 0, tookMs: 6_420, outcome: 'wrote' },
          { key: 'nemotron', startedMs: 5_000 },
          { key: 'groq', startedMs: 6_500, tookMs: 120, outcome: 'failed', reason: '429' },
        ],
        6_420
      )
    ).toBe('nvidia-writer wrote in 6.4 s; nemotron still writing after 1.4 s (started at 5.0 s); groq failed after 0.1 s (429) (started at 6.5 s)');
  });
});

describe('Groq writes first (2026-11-14, chosen by the teacher): qwen3.8-27b writes, gpt-oss-120b checks', () => {
  const QWEN = 'qwen/qwen3.8-27b';
  const GROQ_HOST = 'api.groq.com';
  beforeEach(() => {
    for (const k of Object.keys(NVIDIA_FIRST)) delete process.env[k];
  });

  it('the default order is Groq, NVIDIA glm, Nemotron, Gemini; Groq writes with qwen first and checks with gpt-oss-120b first', () => {
    expect(chain.writerChain().map((m) => m.breaker)).toEqual(['groq', 'nvidia-writer', 'nemotron', 'gemini']);
    expect(chain.writerChain()[0].model).toBe(QWEN);
    expect(providers.aiModels().groqText).toEqual([QWEN, 'openai/gpt-oss-120b']);
    expect(chain.checkerOrder('groq', QWEN, 'fast')[0].model).toBe('openai/gpt-oss-120b');
    expect(chain.checkerOrder('groq', QWEN, 'best')[0].model).toBe('openai/gpt-oss-120b');
  });

  it('a sentence: qwen writes it, gpt-oss-120b checks it, and NVIDIA is not asked', async () => {
    const n = net((c) => (isChecker(c) ? agree : item));
    const res = await sentence();
    expect(res.status).toBe(200);
    expect(n.calls.map((c) => [c.host, c.model])).toEqual([
      [GROQ_HOST, QWEN],
      [GROQ_HOST, 'openai/gpt-oss-120b'],
    ]);
    expect(metaOf(res)).toMatchObject({ provider: 'groq', model: QWEN, verified: 'yes', verifiedBy: 'openai/gpt-oss-120b' });
    expect(metaOf(res).writers).toMatch(/^groq wrote in 0\.\d s$/);
  });

  it('qwen is asked not to think, gets the JSON shape in its prompt (no strict schema), and its <think> part is removed', async () => {
    const n = net((c) =>
      c.model === QWEN
        ? new Response(JSON.stringify({ choices: [{ message: { content: `<think>hmm</think>${JSON.stringify(item)}` } }], usage: { total_tokens: 10 } }), { status: 200 })
        : agree
    );
    const res = await sentence();
    expect(res.status).toBe(200);
    const qwen = n.calls.find((c) => c.model === QWEN)!;
    expect(qwen.body.reasoning_effort).toBe('none');
    expect(qwen.body.response_format).toEqual({ type: 'json_object' });
    expect(qwen.body.messages[1].content).toContain('=== REPLY FORMAT ===');
    expect((await res.json()).text).toBe(item.text);
    // gpt-oss still gets its strict schema and thinks briefly.
    const checker = n.calls.find((c) => c.model === 'openai/gpt-oss-120b')!;
    expect(checker.body.reasoning_effort).toBe('low');
  });

  it('when Groq refuses "reasoning_effort: none" (400), qwen is asked again without it', async () => {
    const n = net((c) => (c.model === QWEN && c.body.reasoning_effort === 'none' ? fail(400) : isChecker(c) ? agree : item));
    const res = await sentence();
    expect(metaOf(res)).toMatchObject({ provider: 'groq', model: QWEN });
    const qwenCalls = n.calls.filter((c) => c.model === QWEN);
    expect(qwenCalls.map((c) => c.body.reasoning_effort)).toEqual(['none', undefined]);
  });

  it('when Groq fails, glm writes and minimax checks it', async () => {
    const n = net((c) => (c.host === GROQ_HOST ? fail(500) : isChecker(c) ? agree : item));
    const res = await sentence();
    expect(res.status).toBe(200);
    expect(metaOf(res)).toMatchObject({ provider: 'nvidia', model: GLM, verifiedBy: MINIMAX });
    expect(metaOf(res).fallbackReason).toMatch(/^groq 500/);
    expect(n.calls.filter((c) => !isChecker(c))[0].model).toBe(QWEN);
  });

  it('a batch: qwen writes, gpt-oss-120b checks', async () => {
    const n = net((c) =>
      isChecker(c) ? { answers: [{ grammatical: true, correction: item.text, acceptable: [] }] } : { items: [{ ...item, slot: 0 }] }
    );
    const res = await ask({ action: 'generateSentenceBatch', settings: { topic: 'Present Perfect', level: 'B1', theme: 'Travel' }, questionType: 'binary', slots: [{ forceCorrect: true, subtype: null, theme: 'Travel' }] });
    expect(res.status).toBe(200);
    expect(n.calls[0]).toMatchObject({ host: GROQ_HOST, model: QWEN });
    expect(metaOf(res)).toMatchObject({ provider: 'groq', model: QWEN });
  });

  it('a batch (made ahead) lets qwen think, with its thinking hidden and room for it; a single sentence does not', async () => {
    const n = net((c) =>
      isChecker(c) ? { answers: [{ grammatical: true, correction: item.text, acceptable: [] }] } : { items: [{ ...item, slot: 0 }] }
    );
    await ask({ action: 'generateSentenceBatch', settings: { topic: 'Present Perfect', level: 'B1', theme: 'Travel' }, questionType: 'binary', slots: [{ forceCorrect: true, subtype: null, theme: 'Travel' }] });
    const batchQwen = n.calls.find((c) => c.model === QWEN)!;
    expect(batchQwen.body.reasoning_effort).toBeUndefined();
    expect(batchQwen.body.reasoning_format).toBe('hidden');
    const single = net((c) => (isChecker(c) ? agree : item));
    await sentence();
    const singleQwen = single.calls.find((c) => c.model === QWEN)!;
    expect(singleQwen.body.reasoning_effort).toBe('none');
    expect(singleQwen.body.reasoning_format).toBeUndefined();
    expect(batchQwen.body.max_completion_tokens).toBeGreaterThan(singleQwen.body.max_completion_tokens);
  });

  it('when Groq refuses "reasoning_format: hidden" (400), the batch is asked again without it', async () => {
    const n = net((c) =>
      c.model === QWEN && c.body.reasoning_format === 'hidden'
        ? fail(400)
        : isChecker(c)
          ? { answers: [{ grammatical: true, correction: item.text, acceptable: [] }] }
          : { items: [{ ...item, slot: 0 }] }
    );
    const res = await ask({ action: 'generateSentenceBatch', settings: { topic: 'Present Perfect', level: 'B1', theme: 'Travel' }, questionType: 'binary', slots: [{ forceCorrect: true, subtype: null, theme: 'Travel' }] });
    expect(metaOf(res)).toMatchObject({ provider: 'groq', model: QWEN });
    expect(n.calls.filter((c) => c.model === QWEN).map((c) => c.body.reasoning_format)).toEqual(['hidden', undefined]);
  });

  it('AI_WRITER_ORDER puts glm first again without new code; unknown names are ignored', () => {
    process.env.AI_WRITER_ORDER = ' nvidia-writer , NEMOTRON, groq, nonsense ';
    expect(chain.writerChain().map((m) => m.breaker)).toEqual(['nvidia-writer', 'nemotron', 'groq']);
    process.env.AI_WRITER_ORDER = 'nonsense';
    expect(chain.writerChain().map((m) => m.breaker)).toEqual(['groq', 'nvidia-writer', 'nemotron', 'gemini']);
  });
});
