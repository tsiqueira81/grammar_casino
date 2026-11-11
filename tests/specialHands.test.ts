import { describe, expect, it } from 'vitest';
import { listeningRoundFor, payoutMultiplierFor, scaleWin, specialHandFor, specialHandLabelFor } from '../game/specialHands';

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

describe('listening hand (package G6)', () => {
  it('falls halfway through a game of four or more hands, on a Valid-or-flawed sentence', () => {
    expect(listeningRoundFor(10)).toBe(5);
    expect(listeningRoundFor(5)).toBe(3);
    expect(listeningRoundFor(3)).toBeNull();
    expect(specialHandFor({ ...base, round: 5 })).toBe('listening');
    expect(specialHandFor({ ...base, round: 5, questionType: 'binary' })).toBe('listening');
    expect(specialHandFor({ ...base, round: 5, questionType: 'multipleChoice' })).toBeNull();
    expect(specialHandFor({ ...base, round: 5, secondLookRound: 5 })).toBe('secondLook');
  });
  it('pays as usual and says so on the badge', () => {
    expect(payoutMultiplierFor('listening')).toBe(1);
    expect(specialHandLabelFor('listening')).toBe('Listening hand');
    expect(specialHandLabelFor('finalTable')).toBe('Final Table 2×');
    expect(specialHandLabelFor(null)).toBeNull();
  });
});
