import { describe, expect, it } from 'vitest';
import { MIN_ROOM_WRITE_GAP_MS, mapWithLimit, nextFlushAt } from '../utils/flushPlan';

describe('room writes (package R5)', () => {
  it('writes soon after the first change, and at most twice a second', () => {
    expect(nextFlushAt(10_000, 250, 0, null)).toBe(10_250);
    expect(nextFlushAt(10_000, 250, 9_900, null)).toBe(9_900 + MIN_ROOM_WRITE_GAP_MS);
  });

  it('is never pushed back by a stream of changes', () => {
    let pending: number | null = null;
    for (let t = 0; t < 1_000; t += 50) pending = nextFlushAt(t, 250, 0, pending);
    expect(pending).toBe(250);
  });

  it('lets an urgent change (a join answer) move the write earlier', () => {
    expect(nextFlushAt(10_000, 30, 0, 10_250)).toBe(10_030);
  });
});

describe('mapWithLimit', () => {
  it('runs at most the limit at once and keeps the order', async () => {
    let running = 0;
    let peak = 0;
    const out = await mapWithLimit([1, 2, 3, 4, 5, 6, 7, 8, 9], 4, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return n * 2;
    });
    expect(peak).toBe(4);
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18]);
    expect(await mapWithLimit([], 4, async (n: number) => n)).toEqual([]);
  });
});
