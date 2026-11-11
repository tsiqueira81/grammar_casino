import { describe, expect, it } from 'vitest';
import { LENGTH_PRESETS, estimateMinutes, handsLeftNote } from '../game/gameLength';

describe('game lengths (package G7)', () => {
  it('names the presets the setup screen offers', () => {
    expect(LENGTH_PRESETS.map((p) => p.hands)).toEqual([5, 10, 15, 20]);
    expect(LENGTH_PRESETS.slice(0, 3).map((p) => p.name)).toEqual(['Warm-up', 'Review', 'Full table']);
  });

  it('estimates longer games for more hands, more players on one screen and longer timers', () => {
    const base = { hands: 10, players: 6, timerSeconds: 0, room: false };
    expect(estimateMinutes(base)).toBeGreaterThan(estimateMinutes({ ...base, hands: 5 }));
    expect(estimateMinutes(base)).toBeGreaterThan(estimateMinutes({ ...base, players: 2 }));
    expect(estimateMinutes({ ...base, timerSeconds: 60 })).toBeGreaterThan(estimateMinutes({ ...base, timerSeconds: 30 }));
    // In a room everyone bets at once, so the class size does not add time.
    expect(estimateMinutes({ ...base, room: true, players: 30 })).toBe(estimateMinutes({ ...base, room: true, players: 3 }));
    expect(estimateMinutes({ ...base, hands: 0 })).toBe(0);
    expect(estimateMinutes({ hands: 10, players: 6, timerSeconds: 0, room: false })).toBe(26);
  });

  it('warns near the end', () => {
    expect(handsLeftNote(1, 10)).toBeNull();
    expect(handsLeftNote(9, 10)).toBe('2 hands left');
    expect(handsLeftNote(10, 10)).toBe('Last hand');
    expect(handsLeftNote(3, Number.NaN)).toBeNull();
  });
});
