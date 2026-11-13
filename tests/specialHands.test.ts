import { describe, expect, it } from 'vitest';
import { classCorrections, fixItRoundFor, listeningRoundFor, payoutMultiplierFor, scaleWin, specialHandFor, specialHandLabelFor, spotlightRoundFor } from '../game/specialHands';
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

describe('Fix it (package G6)', () => {
  it('falls two hands before the end of a game of 8 or more, on a flawed Valid-or-flawed sentence', () => {
    expect(fixItRoundFor(10)).toBe(8);
    expect(fixItRoundFor(7)).toBeNull();
    expect(specialHandFor({ ...base, round: 8, sentenceIsCorrect: false })).toBe('fixIt');
    expect(specialHandFor({ ...base, round: 8, sentenceIsCorrect: true })).toBeNull();
    expect(specialHandFor({ ...base, round: 8, sentenceIsCorrect: false, questionType: 'openCloze' })).toBeNull();
    for (let n = 8; n <= 40; n++) {
      const f = fixItRoundFor(n);
      expect([spotlightRoundFor(n), listeningRoundFor(n), n]).not.toContain(f);
    }
  });
  it('lists the corrections without names, accepted ones first, each once', () => {
    const list = classCorrections([
      { userCorrection: 'He has finished.', correctionFeedback: 'Rejected for bonus. ...' },
      { userCorrection: 'He has finished his homework already.', correctionFeedback: 'Accepted! Bonus' },
      { userCorrection: 'he has finished his homework already', correctionFeedback: 'Accepted!' },
      { userCorrection: '  ' },
      {},
    ]);
    expect(list).toEqual([
      { text: 'He has finished his homework already.', accepted: true, count: 2 },
      { text: 'He has finished.', accepted: false, count: 1 },
    ]);
  });
});

it('puts Fix it before a second look on the same hand', () => {
  expect(specialHandFor({ ...base, round: 8, secondLookRound: 8, sentenceIsCorrect: false })).toBe('fixIt');
});

describe('the setup screen\'s list of special hands', () => {
  it('names the hand each one falls on, the same hands the game really deals', async () => {
    const { specialHandsPlan } = await import('../game/specialHands');
    for (const n of [4, 5, 6, 8, 10, 15, 20]) {
      const plan = Object.fromEntries(specialHandsPlan(n).map((p) => [p.hand, p]));
      expect(Object.keys(plan).sort()).toEqual(['finalTable', 'fixIt', 'listening', 'secondLook', 'spotlight']);
      expect(plan.finalTable.when).toBe(`Hand ${n}, the last`);
      expect(specialHandFor({ ...base, totalRounds: n, round: n })).toBe('finalTable');
      for (const [hand, roundFor] of [['listening', listeningRoundFor], ['spotlight', spotlightRoundFor], ['fixIt', fixItRoundFor]] as const) {
        const round = roundFor(n);
        expect(plan[hand].inThisGame).toBe(round !== null);
        if (round !== null) expect(plan[hand].when).toBe(`Hand ${round}`);
      }
      expect(plan.secondLook.inThisGame).toBe(true);
    }
  });

  it('says what a short game is missing instead of promising it', async () => {
    const { specialHandsPlan } = await import('../game/specialHands');
    const short = Object.fromEntries(specialHandsPlan(3).map((p) => [p.hand, p]));
    expect(short.listening).toMatchObject({ inThisGame: false, when: 'Needs 4 hands or more' });
    expect(short.spotlight).toMatchObject({ inThisGame: false, when: 'Needs 6 hands or more' });
    expect(short.fixIt).toMatchObject({ inThisGame: false, when: 'Needs 8 hands or more' });
    expect(short.finalTable.inThisGame).toBe(true);
    // An empty or broken number of hands never throws.
    expect(specialHandsPlan(Number.NaN)).toHaveLength(5);
    expect(specialHandsPlan(Number.NaN)[0].when).toBe('The last hand');
  });

  it('keeps every description short', async () => {
    const { specialHandsPlan } = await import('../game/specialHands');
    for (const p of specialHandsPlan(10)) expect(p.what.split(/\s+/).length).toBeLessThanOrEqual(14);
  });
});
