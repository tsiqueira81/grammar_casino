import { describe, expect, it } from 'vitest';
import { FREE_DAILY_READS, FREE_DAILY_WRITES, addUsage, emptyUsage, nearQuota } from '../utils/firestoreUsage';

// Package A3: Firestore reads and writes, so the free daily quota is not a surprise.
describe('Firestore usage estimate', () => {
  const day1 = Date.UTC(2026, 10, 11, 12);
  const day2 = Date.UTC(2026, 10, 12, 12);

  it('adds up within a day and starts again the next day', () => {
    let u = emptyUsage(day1);
    u = addUsage(u, 10, 3, day1);
    u = addUsage(u, 5, 2, day1);
    expect(u).toMatchObject({ reads: 15, writes: 5 });
    u = addUsage(u, 1, 1, day2);
    expect(u).toMatchObject({ reads: 1, writes: 1 });
  });

  it('warns at 60% of either quota', () => {
    expect(nearQuota({ day: 'x', reads: FREE_DAILY_READS * 0.6 - 1, writes: 0 })).toBe(false);
    expect(nearQuota({ day: 'x', reads: FREE_DAILY_READS * 0.6, writes: 0 })).toBe(true);
    expect(nearQuota({ day: 'x', reads: 0, writes: FREE_DAILY_WRITES * 0.6 })).toBe(true);
  });

  it('ignores negative counts', () => {
    expect(addUsage(emptyUsage(day1), -5, -1, day1)).toMatchObject({ reads: 0, writes: 0 });
  });
});
