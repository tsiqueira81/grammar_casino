import { describe, expect, it } from 'vitest';
import { levelChangeNotice, nextAdaptiveLevel } from '../game/adaptiveLevel';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const hand = (round: number, wins: number, losses: number) => ({
  round,
  playerResults: [
    ...Array.from({ length: wins }, () => ({ isWin: true })),
    ...Array.from({ length: losses }, () => ({ isWin: false })),
  ] as never[],
});

describe('the level follows the class (L6)', () => {
  it('steps up after three strong hands, and down after three weak ones', () => {
    const strong = [hand(1, 9, 1), hand(2, 10, 0), hand(3, 9, 1)];
    expect(nextAdaptiveLevel({ levels: LEVELS, current: 'B1', history: strong, lastChangeRound: 0 })).toEqual({ level: 'B2', accuracy: 93, direction: 'up' });
    const weak = [hand(1, 2, 8), hand(2, 3, 7), hand(3, 4, 6)];
    expect(nextAdaptiveLevel({ levels: LEVELS, current: 'B1', history: weak, lastChangeRound: 0 })?.level).toBe('A2');
  });

  it('keeps the level in between, and at the ends of the scale', () => {
    const mid = [hand(1, 6, 4), hand(2, 6, 4), hand(3, 6, 4)];
    expect(nextAdaptiveLevel({ levels: LEVELS, current: 'B1', history: mid, lastChangeRound: 0 })).toBeNull();
    const strong = [hand(1, 10, 0), hand(2, 10, 0), hand(3, 10, 0)];
    expect(nextAdaptiveLevel({ levels: LEVELS, current: 'C2', history: strong, lastChangeRound: 0 })).toBeNull();
  });

  it('waits three new hands after a change', () => {
    const strong = [hand(1, 10, 0), hand(2, 10, 0), hand(3, 10, 0), hand(4, 10, 0), hand(5, 10, 0)];
    expect(nextAdaptiveLevel({ levels: LEVELS, current: 'B2', history: strong, lastChangeRound: 3 })).toBeNull();
    expect(nextAdaptiveLevel({ levels: LEVELS, current: 'B2', history: [...strong, hand(6, 10, 0)], lastChangeRound: 3 })?.level).toBe('C1');
  });

  it('needs enough bets to judge', () => {
    expect(nextAdaptiveLevel({ levels: LEVELS, current: 'B1', history: [hand(1, 1, 0), hand(2, 0, 0), hand(3, 1, 0)], lastChangeRound: 0 })).toBeNull();
  });

  it('tells the teacher plainly', () => {
    expect(levelChangeNotice({ level: 'B2', accuracy: 90, direction: 'up' })).toBe('The class got 90% right in the last 3 hands, so the next hands are B2 (one level up).');
  });
});
