import { describe, expect, it } from 'vitest';
import { listeningRoundFor, payoutMultiplierFor, scaleWin, specialHandFor, specialHandLabelFor, spotlightRoundFor } from '../game/specialHands';
import { addMisses, grantFreeDraws, mostMissedPoint, revokeFreeDraws, spendFreeDraw } from '../game/spacing';

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

describe('Spotlight (package G6)', () => {
  it('falls on hand 4 of 10, and needs at least 6 hands', () => {
    expect(spotlightRoundFor(10)).toBe(4);
    expect(spotlightRoundFor(6)).toBe(2);
    expect(spotlightRoundFor(5)).toBeNull();
    expect(specialHandFor({ ...base, round: 4 })).toBe('spotlight');
    expect(specialHandFor({ ...base, round: 4, secondLookRound: 4 })).toBe('secondLook');
    expect(specialHandLabelFor('spotlight')).toBe('Spotlight');
    // Never on the same hand as the listening hand.
    for (let n = 6; n <= 40; n++) expect(spotlightRoundFor(n)).not.toBe(listeningRoundFor(n));
  });
  it('picks the grammar point missed most that the topic can still deal', () => {
    let tally = addMisses({}, 'Past Simple', 2);
    tally = addMisses(tally, 'Present Perfect', 3);
    tally = addMisses(tally, null, 5);
    expect(mostMissedPoint(tally, ['Past Simple', 'Present Perfect'])).toBe('Present Perfect');
    expect(mostMissedPoint(tally, ['Past Simple'])).toBe('Past Simple');
    expect(mostMissedPoint(tally, ['Modals'])).toBeNull();
  });
  it('gives, uses and takes back free draws', () => {
    let draws = grantFreeDraws({}, [1, 2], 4);
    expect(draws[1]).toEqual([4]);
    draws = spendFreeDraw(draws, 1);
    expect(draws[1]).toEqual([]);
    expect(spendFreeDraw(draws, 3)).toBe(draws);
    expect(revokeFreeDraws(grantFreeDraws({}, [1], 4), 4)[1]).toEqual([]);
  });
});
