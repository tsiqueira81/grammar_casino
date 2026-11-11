import { describe, expect, it } from 'vitest';
import { AWAY_AFTER_MS, awaySeatIds, presenceSummary } from '../game/presence';

describe('presence (package R2)', () => {
  const now = 1_000_000;

  it('marks a seat away after 45 s without a word, or when its phone disconnected', () => {
    const seats = {
      1: { connected: true, lastSeen: now - 1_000 },
      2: { connected: true, lastSeen: now - AWAY_AFTER_MS - 1 },
      3: { connected: false, lastSeen: now },
      4: { connected: true },
    };
    expect(awaySeatIds(seats, {}, now)).toEqual([2, 3]);
  });

  it('counts the newest sign of life from either source', () => {
    const seats = { 2: { connected: true, lastSeen: now - 60_000 } };
    expect(awaySeatIds(seats, { 2: now - 5_000 }, now)).toEqual([]);
  });

  it('summarises the room', () => {
    expect(presenceSummary(34, 2)).toBe('32 in, 2 away');
    expect(presenceSummary(3, 0)).toBe('3 in');
  });
});
