import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitAtMost } from '../utils/waitAtMost';
import { AHEAD_WAIT_LIMIT_MS, dealFromBank } from '../services/geminiService';
import type { Settings } from '../types';

// 2026-11-14: a sentence made ahead may take up to 19 s, but the class waits for it at most 6 s.
describe('the class waits a few seconds at most for a sentence made ahead', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('a sentence that is ready in time is used', async () => {
    const work = new Promise<string>((r) => setTimeout(() => r('ai'), 2_000));
    const out = waitAtMost(work, AHEAD_WAIT_LIMIT_MS, () => 'bank');
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(out).resolves.toBe('ai');
  });

  it('after the limit the stand-in is used, and the late answer changes nothing', async () => {
    const work = new Promise<string>((r) => setTimeout(() => r('ai'), 15_000));
    const instead = vi.fn(async () => 'bank');
    const out = waitAtMost(work, AHEAD_WAIT_LIMIT_MS, instead);
    await vi.advanceTimersByTimeAsync(AHEAD_WAIT_LIMIT_MS);
    await expect(out).resolves.toBe('bank');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(instead).toHaveBeenCalledTimes(1);
  });

  it('a failure before the limit passes through, so the game makes the hand another way', async () => {
    const work = Promise.reject(new Error('down'));
    const instead = vi.fn(() => 'bank');
    await expect(waitAtMost(work, AHEAD_WAIT_LIMIT_MS, instead)).rejects.toThrow('down');
    await vi.advanceTimersByTimeAsync(AHEAD_WAIT_LIMIT_MS);
    expect(instead).not.toHaveBeenCalled();
  });

  it('the limit is shorter than the old 8 s wait', () => {
    expect(AHEAD_WAIT_LIMIT_MS).toBeLessThan(8_000);
  });
});

describe('the bank stands in for any question type', () => {
  const settings = { topic: 'Present Perfect', level: 'B1', theme: 'classic' } as unknown as Settings;
  it.each(['binary', 'spotError', 'wordOrder'] as const)('%s', async (type) => {
    const item = await dealFromBank(settings, [], true, null, [], type);
    expect(item.text.length).toBeGreaterThan(5);
    expect(item.source).toBe('bank');
    if (type !== 'binary') expect(item.questionType).toBe(type);
  });
});
