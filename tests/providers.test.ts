import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AI_TIMEOUT_MS,
  AiTimeoutError,
  BREAKER_OPEN_MS,
  CircuitBreaker,
  DEFAULT_MODELS,
  aiBreaker,
  aiModels,
  failureReason,
  formatAiMeta,
  withTimeout,
} from '../server/providers';
import { deepHealthAllowed, generateAiText } from '../server/aiProviders';

// Package A2: one provider interface, measured.
describe('model names', () => {
  afterEach(() => {
    delete process.env.GROQ_TEXT_MODELS;
  });
  it('come from one config, and an environment variable overrides them', () => {
    expect(aiModels().groqText).toEqual(DEFAULT_MODELS.groqText);
    process.env.GROQ_TEXT_MODELS = ' new-model-a , new-model-b ';
    expect(aiModels().groqText).toEqual(['new-model-a', 'new-model-b']);
  });
});

describe('time limits', () => {
  it('a new sentence stops before the game gives up on it at 12 s', () => {
    expect(AI_TIMEOUT_MS.generate).toBeLessThan(12_000);
    expect(AI_TIMEOUT_MS.verify).toBe(8_000);
    expect(AI_TIMEOUT_MS.speech).toBe(10_000);
  });
  it('a slow provider is cut off', async () => {
    vi.useFakeTimers();
    const pending = withTimeout(new Promise(() => {}), 1000, 'groq');
    const check = expect(pending).rejects.toBeInstanceOf(AiTimeoutError);
    await vi.advanceTimersByTimeAsync(1001);
    await check;
    vi.useRealTimers();
  });
  it('a fast one is not', async () => {
    await expect(withTimeout(Promise.resolve(5), 1000, 'gemini')).resolves.toBe(5);
  });
});

describe('circuit breaker', () => {
  it('three failures within a minute skip the provider for five minutes', () => {
    const b = new CircuitBreaker();
    b.recordFailure('groq', 0);
    b.recordFailure('groq', 10_000);
    expect(b.isOpen('groq', 10_001)).toBe(false);
    b.recordFailure('groq', 20_000);
    expect(b.isOpen('groq', 20_001)).toBe(true);
    expect(b.isOpen('gemini', 20_001)).toBe(false);
    expect(b.isOpen('groq', 20_000 + BREAKER_OPEN_MS + 1)).toBe(false);
  });
  it('failures spread over more than a minute do not trip it', () => {
    const b = new CircuitBreaker();
    b.recordFailure('groq', 0);
    b.recordFailure('groq', 40_000);
    b.recordFailure('groq', 70_000);
    expect(b.isOpen('groq', 70_001)).toBe(false);
  });
  it('a success clears the count', () => {
    const b = new CircuitBreaker();
    b.recordFailure('groq', 0);
    b.recordFailure('groq', 1);
    b.recordSuccess('groq');
    b.recordFailure('groq', 2);
    expect(b.isOpen('groq', 3)).toBe(false);
  });
});

describe('metadata', () => {
  it('is short and carries no sentence text', () => {
    const header = formatAiMeta({ provider: 'groq', model: 'openai/gpt-oss-120b', latencyMs: 812.4, tokens: 300, fallbackReason: 'gemini "quota" <x>' });
    expect(JSON.parse(header)).toEqual({ provider: 'groq', latencyMs: 812, model: 'openai/gpt-oss-120b', tokens: 300, fallbackReason: 'gemini quota x' });
  });
  it('names the failure briefly', () => {
    expect(failureReason(new AiTimeoutError('groq', 7000))).toBe('timeout');
    expect(failureReason(Object.assign(new Error('x'), { status: 429 }))).toBe('429');
  });
});

describe('generateAiText with Groq', () => {
  beforeEach(() => {
    aiBreaker.reset();
    process.env.GROQ_API_KEY = 'gsk_test_only';
    delete process.env.GEMINI_API_KEY;
    delete process.env.API_KEY;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GROQ_API_KEY;
    aiBreaker.reset();
  });

  it('reports provider, model, tokens and time', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'Hello' } }], usage: { total_tokens: 42 } }), { status: 200 })));
    const out = await generateAiText({ prompt: 'hi', kind: 'other' });
    expect(out.text).toBe('Hello');
    expect(out.meta.provider).toBe('groq');
    expect(out.meta.model).toBe(DEFAULT_MODELS.groqText[0]);
    expect(out.meta.tokens).toBe(42);
    expect(out.meta.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('after three failures, stops calling Groq for a while', async () => {
    const fetch = vi.fn(async () => new Response('down', { status: 500 }));
    vi.stubGlobal('fetch', fetch);
    for (let i = 0; i < 3; i++) await expect(generateAiText({ prompt: 'hi' })).rejects.toThrow();
    const callsBefore = fetch.mock.calls.length;
    await expect(generateAiText({ prompt: 'hi' })).rejects.toThrow(/resting/);
    expect(fetch.mock.calls.length).toBe(callsBefore);
  });
});

describe('deep health', () => {
  afterEach(() => {
    delete process.env.HEALTH_CHECK_TOKEN;
  });
  it('is closed unless the server has a token and the caller sends it', () => {
    expect(deepHealthAllowed('Bearer anything')).toBe(false);
    process.env.HEALTH_CHECK_TOKEN = 'secret-1';
    expect(deepHealthAllowed(undefined)).toBe(false);
    expect(deepHealthAllowed('Bearer wrong')).toBe(false);
    expect(deepHealthAllowed('Bearer secret-1')).toBe(true);
  });
});
