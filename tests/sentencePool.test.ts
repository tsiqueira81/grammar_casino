import { describe, expect, it } from 'vitest';
import { MIN_BATCH, SentencePool, planBatch, poolKey } from '../services/sentencePool';
import { upcomingHands } from '../game/upcomingHands';
import { tryUseAiCall, getAiCallKind } from '../utils/aiDailyLimit';
import type { GeneratedSentence, Settings } from '../types';

const settings = { topic: 'Present Perfect', level: 'B1', theme: 'Travel' };
const it_ = (text: string, isCorrect: boolean, extra: Partial<GeneratedSentence & { theme: string }> = {}) =>
  ({ text, isCorrect, correction: text, explanation: '', grammarPhrase: '', questionType: 'binary', theme: 'Travel', writtenFor: null, ...extra }) as any;

describe('sentences made ahead (the pool)', () => {
  it('a hand takes an item with its theme, type and correctness', () => {
    const pool = new SentencePool();
    const key = poolKey(settings, 'binary');
    pool.add(key, [it_('A one.', true), it_('B two.', false), it_('C three.', false, { theme: 'History' })]);
    expect(pool.take(settings, 'binary', false, null, false)?.text).toBe('B two.');
    expect(pool.take(settings, 'binary', false, null, false)).toBeNull(); // C is for another theme
    expect(pool.take({ ...settings, theme: 'History' }, 'binary', false, null, false)?.text).toBe('C three.');
  });

  it('Spot the error and Word order use the Valid-or-flawed items', () => {
    const pool = new SentencePool();
    pool.add(poolKey(settings, 'binary'), [it_('A one.', true), it_('B two.', false)]);
    expect(poolKey(settings, 'wordOrder')).toBe(poolKey(settings, 'binary'));
    expect(pool.take(settings, 'wordOrder', true, null, false)?.text).toBe('A one.');
    expect(pool.take(settings, 'spotError', false, null, false)?.text).toBe('B two.');
  });

  it('a second look takes only an item written for its grammar point', () => {
    const pool = new SentencePool();
    pool.add(poolKey(settings, 'binary'), [it_('A one.', true, { writtenFor: 'for and since' })]);
    expect(pool.take(settings, 'binary', true, 'already and yet', true)).toBeNull();
    expect(pool.take(settings, 'binary', true, 'for and since', true)?.text).toBe('A one.');
  });

  it('prefers an item written for the wanted grammar point', () => {
    const pool = new SentencePool();
    pool.add(poolKey(settings, 'binary'), [it_('A one.', true, { writtenFor: 'x' }), it_('B two.', true, { writtenFor: 'y' })]);
    expect(pool.take(settings, 'binary', true, 'y', false)?.text).toBe('B two.');
  });

  it('never deals a sentence that was already played, and never keeps two copies', () => {
    const pool = new SentencePool();
    const key = poolKey(settings, 'binary');
    pool.add(key, [it_('A one.', true), it_('a one.', true)]);
    expect(pool.size(key)).toBe(1);
    expect(pool.take(settings, 'binary', true, null, false, ['A one.'])).toBeNull();
  });

  it('only one batch per kind of hand is asked for at a time', () => {
    const pool = new SentencePool();
    expect(pool.begin('k')).toBe(true);
    expect(pool.begin('k')).toBe(false);
    pool.end('k');
    expect(pool.begin('k')).toBe(true);
  });
});

describe('planning a batch', () => {
  const upcoming = (n: number, questionType: any = 'binary', theme = 'Travel') => Array.from({ length: n }, () => ({ theme, questionType }));

  it('one slot per hand still to come, at most 15', () => {
    expect(planBatch(settings, 'binary', { upcoming: upcoming(9) }, 0, ['a', 'b'])).toHaveLength(9);
    expect(planBatch(settings, 'binary', { upcoming: upcoming(29) }, 0, [])).toHaveLength(15);
  });

  it('counts the items already waiting', () => {
    expect(planBatch(settings, 'binary', { upcoming: upcoming(9) }, 5, [])).toHaveLength(4);
  });

  it('no batch for a single hand, or without a plan', () => {
    expect(MIN_BATCH).toBe(2);
    expect(planBatch(settings, 'binary', { upcoming: upcoming(1) }, 0, [])).toEqual([]);
    expect(planBatch(settings, 'binary', undefined, 0, [])).toEqual([]);
  });

  it('about 40% of Valid-or-flawed sentences are correct', () => {
    const slots = planBatch(settings, 'binary', { upcoming: upcoming(10) }, 0, []);
    expect(slots.filter((s) => s.forceCorrect === true)).toHaveLength(4);
    expect(slots.filter((s) => s.forceCorrect === false)).toHaveLength(6);
  });

  it('in a mixed game, only the hands of this type, with their own themes', () => {
    const hands = [
      { theme: 'Travel', questionType: 'openCloze' },
      { theme: 'History', questionType: 'binary' },
      { theme: 'Sci-fi', questionType: 'openCloze' },
      { theme: 'Fantasy', questionType: 'wordOrder' },
    ] as any;
    const slots = planBatch(settings, 'openCloze', { upcoming: hands }, 0, []);
    expect(slots.map((s) => s.theme)).toEqual(['Travel', 'Sci-fi']);
    expect(slots.every((s) => s.forceCorrect === null)).toBe(true);
    const binary = planBatch(settings, 'binary', { upcoming: hands }, 0, []);
    expect(binary.map((s) => [s.theme, s.forceCorrect])).toEqual([['History', false], ['Fantasy', true]]);
  });

  it('grammar points take turns', () => {
    const slots = planBatch(settings, 'binary', { upcoming: upcoming(4) }, 0, ['a', 'b'], () => 0);
    expect(new Set(slots.map((s) => s.subtype))).toEqual(new Set(['a', 'b']));
  });
});

describe('the hands still to come', () => {
  const base: Settings = { topic: 'Present Perfect', level: 'B1', theme: 'Travel', challengeFormat: 'binary' } as Settings;

  it('in a game of 10 hands, from hand 4 there are 7 left', () => {
    expect(upcomingHands(base, 4, 0, 10)).toHaveLength(7);
    expect(upcomingHands(base, 11, 0, 10)).toEqual([]);
  });

  it('a game without a set length plans 15 ahead', () => {
    expect(upcomingHands(base, 3, 0, null)).toHaveLength(15);
  });

  it('a mixed game follows its rotation', () => {
    const mixed = { ...base, challengeFormat: 'mixed', mixedFormats: ['binary', 'openCloze'] } as Settings;
    expect(upcomingHands(mixed, 2, 1, 5).map((h) => h.questionType)).toEqual(['openCloze', 'binary', 'openCloze', 'binary']);
  });
});

describe('the daily AI allowance on this device', () => {
  const store = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  it('a batch of 15 counts as 15 sentences', () => {
    const s = store();
    const limits = { sentence: 20, other: 5 };
    expect(getAiCallKind('generateSentenceBatch')).toBe('sentence');
    expect(tryUseAiCall(s, 'sentence', new Date(), limits, 15)).toBe(true);
    expect(tryUseAiCall(s, 'sentence', new Date(), limits, 15)).toBe(false);
    expect(tryUseAiCall(s, 'sentence', new Date(), limits, 5)).toBe(true);
  });
});

describe('a batch that delivers less gives the rest back', () => {
  it('only delivered sentences count', async () => {
    const { giveBackAiCalls, readAiDailyUsage } = await import('../utils/aiDailyLimit');
    const m = new Map<string, string>();
    const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    const now = new Date();
    tryUseAiCall(s, 'sentence', now, undefined, 15);
    giveBackAiCalls(s, 'sentence', 11, now);
    expect(readAiDailyUsage(s, now).sentence).toBe(4);
    giveBackAiCalls(s, 'sentence', 50, now);
    expect(readAiDailyUsage(s, now).sentence).toBe(0);
  });
});
