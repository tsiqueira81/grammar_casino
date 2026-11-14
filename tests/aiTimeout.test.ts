import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Package R8: a slow AI never stalls the lesson. The Firebase side is replaced by fakes.
vi.mock('../services/firebaseService', () => ({
  archiveSentenceToCloudBank: vi.fn(),
  auth: { currentUser: null },
  isVerifiedTeacherUser: () => false,
}));

import { AI_AHEAD_SENTENCE_TIMEOUT_MS, AI_SENTENCE_TIMEOUT_MS, generateSentence, getAiTimeoutMs, verifyCorrection } from '../services/geminiService';
import { GAME_WAITS_MS } from '../server/providers';
import type { Settings } from '../types';

const settings = { topic: 'Present Perfect', level: 'B1', theme: 'classic' } as unknown as Settings;

/** A fetch that never answers until it is aborted, like a server that hangs. */
function hangingFetch() {
  return vi.fn((_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })
  );
}

describe('AI calls that take too long', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('sentences wait 12 seconds (20 when made ahead, which nobody waits for); other calls wait longer', () => {
    expect(getAiTimeoutMs('generateSentence')).toBe(12_000);
    expect(getAiTimeoutMs('generateSentence', true)).toBe(20_000);
    expect(getAiTimeoutMs('verifyCorrection')).toBeGreaterThan(12_000);
  });

  it('the game waits just as long as the server is told it may take', () => {
    expect(GAME_WAITS_MS.now).toBe(AI_SENTENCE_TIMEOUT_MS);
    expect(GAME_WAITS_MS.ahead).toBe(AI_AHEAD_SENTENCE_TIMEOUT_MS);
  });

  it('a sentence made ahead tells the server so, and gets the longer wait', async () => {
    const fetch = hangingFetch();
    vi.stubGlobal('fetch', fetch);
    const pending = generateSentence(settings, [], null, null, [], 'binary', { ahead: true });
    await vi.advanceTimersByTimeAsync(AI_SENTENCE_TIMEOUT_MS + 10);
    let settled = false;
    void pending.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body)).ahead).toBe(true);
    await vi.advanceTimersByTimeAsync(AI_AHEAD_SENTENCE_TIMEOUT_MS - AI_SENTENCE_TIMEOUT_MS);
    const sentence = await pending;
    expect(sentence.source).toBe('bank');
  });

  it('a sentence the class waits for does not say it was made ahead', async () => {
    const fetch = hangingFetch();
    vi.stubGlobal('fetch', fetch);
    const pending = generateSentence(settings, [], null, null, [], 'binary');
    await vi.advanceTimersByTimeAsync(AI_SENTENCE_TIMEOUT_MS + 10);
    await pending;
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body)).ahead).toBeUndefined();
  });

  it('deals a sentence from the offline bank when the AI hangs', async () => {
    const fetch = hangingFetch();
    vi.stubGlobal('fetch', fetch);
    const pending = generateSentence(settings, [], null, null, [], 'binary');
    await vi.advanceTimersByTimeAsync(AI_SENTENCE_TIMEOUT_MS + 10);
    const sentence = await pending;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(typeof sentence.text).toBe('string');
    expect(sentence.text.length).toBeGreaterThan(5);
  });

  it('does not give up on a sentence before 8 seconds', async () => {
    let answered = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) =>
            setTimeout(() => {
              answered = true;
              resolve(
                new Response(JSON.stringify({ text: 'She has lived here since 2019.', isCorrect: true, correction: 'She has lived here since 2019.', explanation: 'Since with a point in time takes the present perfect.', questionType: 'binary' }), {
                  status: 200,
                  headers: { 'content-type': 'application/json' },
                })
              );
            }, AI_SENTENCE_TIMEOUT_MS - 1000)
          )
      )
    );
    const pending = generateSentence(settings, [], null, null, [], 'binary');
    await vi.advanceTimersByTimeAsync(AI_SENTENCE_TIMEOUT_MS - 900);
    const sentence = await pending;
    expect(answered).toBe(true);
    expect(sentence.text).toBe('She has lived here since 2019.');
  });

  it('a hanging answer check falls back to the offline check', async () => {
    const fetch = hangingFetch();
    vi.stubGlobal('fetch', fetch);
    // An answer the quick local check cannot settle, so the AI is asked.
    const pending = verifyCorrection('He have finished his homework.', 'He is finishing his homework now.', 'He has finished his homework.', 'have', []);
    await vi.advanceTimersByTimeAsync(getAiTimeoutMs('verifyCorrection') + 10);
    const res = await pending;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(typeof res.isCorrect).toBe('boolean');
  });
});

describe('AI sentences get the content check (package L1)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('replaces a broken AI item with a bank item, silently', async () => {
    const broken = { text: 'She has lived here since 2019.', correctAnswer: 'has lived', options: ['has lived', 'lives'], explanation: 'x', questionType: 'multipleChoice' };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(broken), { status: 200, headers: { 'content-type': 'application/json' } })));
    const sentence = await generateSentence(settings, [], null, null, [], 'multipleChoice');
    expect(sentence.text).not.toBe(broken.text);
    expect(sentence.text).toContain('_____');
    expect(sentence.options).toHaveLength(4);
  });
});
