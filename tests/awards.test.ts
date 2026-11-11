import { describe, expect, it } from 'vitest';
import { computeAwards } from '../game/awards';
import type { RoundHistoryRecord } from '../types';

const NAMES = ['', 'Ana', 'Bo', 'Cy'];
const r = (playerId: number, isWin: boolean, bet: number, newTotal: number, extra: Record<string, unknown> = {}) => ({
  playerId,
  playerName: NAMES[playerId],
  isWin,
  bet,
  newTotal,
  amountChanged: 0,
  ...extra,
});
const hand = (round: number, results: ReturnType<typeof r>[]) => ({ round, playerResults: results }) as unknown as RoundHistoryRecord;

describe('end-of-game awards', () => {
  const history = [
    hand(1, [r(1, true, 100, 1100), r(2, false, 600, 400), r(3, true, 50, 1050)]),
    hand(2, [r(1, true, 100, 1200), r(2, true, 400, 800), r(3, true, 50, 1100, { userCorrection: 'goes', correctionFeedback: 'Accepted! Nice.' })]),
    hand(3, [r(1, true, 100, 1300), r(2, true, 400, 1200), r(3, false, 50, 1050)]),
    hand(4, [r(1, true, 100, 1400), r(2, true, 300, 1500), r(3, true, 50, 1100)]),
    hand(5, [r(1, false, 100, 1300), r(2, true, 100, 1600), r(3, true, 50, 1150)]),
  ];

  it('gives each award to a different student', () => {
    const awards = computeAwards(history, 1000);
    expect(awards.map((a) => [a.id, a.name])).toEqual([
      ['sharpEye', 'Ana'],
      ['hotStreak', 'Bo'],
      ['fixer', 'Cy'],
    ]);
    expect(awards[0].detail).toBe('80% right');
    expect(awards[1].detail).toBe('4 right in a row');
  });

  it('needs enough bets for accuracy, and gives nothing with no history', () => {
    expect(computeAwards([], 1000)).toEqual([]);
    const short = computeAwards([hand(1, [r(1, true, 100, 1100)])], 1000);
    expect(short[0]).toMatchObject({ id: 'sharpEye', name: 'Ana', detail: '100% right' });
  });

  it('finds a comeback from below the start, and the boldest winning bet', () => {
    const h = [
      hand(1, [r(1, false, 800, 200), r(2, true, 900, 1900)]),
      hand(2, [r(1, true, 200, 400), r(2, true, 100, 2000)]),
      hand(3, [r(1, true, 400, 800), r(2, true, 100, 2100)]),
    ];
    const awards = computeAwards(h, 1000);
    expect(awards.find((a) => a.id === 'sharpEye')?.name).toBe('Bo');
    expect(awards.find((a) => a.id === 'comeback')).toMatchObject({ name: 'Ana', detail: 'up $600 from their lowest' });
    const bold = computeAwards([hand(1, [r(1, true, 100, 1100), r(2, true, 900, 1900)])], 1000);
    expect(bold.find((a) => a.id === 'boldBet')).toMatchObject({ name: 'Bo', detail: 'won a $900 bet' });
  });
});
