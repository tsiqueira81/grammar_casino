import { describe, expect, it } from 'vitest';
import { phaseAnnouncement } from '../game/announce';
import { nextFocus } from '../utils/useFocusTrap';

describe('phase announcements (package S8)', () => {
  it('says the hand number and total when a hand is dealt', () => {
    expect(phaseAnnouncement({ step: 'IN_GAME', round: 2, totalRounds: 10 })).toBe('Hand 2 of 10 is dealt. Place your bets.');
    expect(phaseAnnouncement({ step: 'IN_GAME', round: 3 })).toBe('Hand 3 is dealt. Place your bets.');
  });
  it('announces the reveal, the winner and a pause', () => {
    expect(phaseAnnouncement({ step: 'RESULTS', round: 4 })).toBe('Hand 4: the answer is in.');
    expect(phaseAnnouncement({ step: 'GAME_OVER', round: 9, winnerName: 'Ana' })).toBe('Game over. Ana wins.');
    expect(phaseAnnouncement({ step: 'GAME_OVER', round: 9 })).toBe('Game over.');
    expect(phaseAnnouncement({ step: 'IN_GAME', round: 1, paused: true })).toBe('The game is paused.');
  });
  it('stays quiet on other screens', () => {
    expect(phaseAnnouncement({ step: 'SETUP', round: 0 })).toBe('');
  });
});

describe('focus trap order (package S8)', () => {
  const a = { id: 'a' } as unknown as HTMLElement;
  const b = { id: 'b' } as unknown as HTMLElement;
  const c = { id: 'c' } as unknown as HTMLElement;
  const items = [a, b, c];
  it('wraps from the last control to the first, and back with Shift', () => {
    expect(nextFocus(items, c, false)).toBe(a);
    expect(nextFocus(items, a, true)).toBe(c);
  });
  it('leaves Tab alone in the middle', () => {
    expect(nextFocus(items, b, false)).toBeNull();
    expect(nextFocus(items, b, true)).toBeNull();
  });
  it('brings focus in from outside, and does nothing with no controls', () => {
    expect(nextFocus(items, null, false)).toBe(a);
    expect(nextFocus(items, null, true)).toBe(c);
    expect(nextFocus([], null, false)).toBeNull();
  });
});
