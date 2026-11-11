import { describe, expect, it } from 'vitest';
import { payoutMultiplierFor, scaleWin, specialHandFor } from '../game/specialHands';

const base = { enabled: true, gameMode: 'rounds', round: 1, totalRounds: 10, secondLookRound: null as number | null };

describe('special hand schedule (package G6)', () => {
  it('is off unless the teacher turns it on, and only with a set number of hands', () => {
    expect(specialHandFor({ ...base, enabled: false, round: 10 })).toBeNull();
    expect(specialHandFor({ ...base, gameMode: 'targetAmount', round: 10 })).toBeNull();
  });
  it('makes the last hand the Final Table, even when the teacher finishes early', () => {
    expect(specialHandFor({ ...base, round: 10 })).toBe('finalTable');
    expect(specialHandFor({ ...base, round: 4, totalRounds: 4 })).toBe('finalTable');
    expect(specialHandFor({ ...base, round: 9 })).toBeNull();
  });
  it('labels a second-look hand, but the Final Table wins when both fall together', () => {
    expect(specialHandFor({ ...base, round: 5, secondLookRound: 5 })).toBe('secondLook');
    expect(specialHandFor({ ...base, round: 10, secondLookRound: 10 })).toBe('finalTable');
  });
  it('scales wins only', () => {
    expect(payoutMultiplierFor(null)).toBe(1);
    expect(payoutMultiplierFor('finalTable')).toBe(2);
    expect(scaleWin(150, payoutMultiplierFor('secondLook'))).toBe(225);
    expect(scaleWin(-100, 2)).toBe(-100);
    expect(scaleWin(0, 2)).toBe(0);
  });
});
