// Bots play hundreds of whole games through the real rules on every change (Akita testing pass).
// If any hand ever leaves a balance negative, fractional or not a number, or the rules crash,
// this fails and prints the seed, so the exact game can be replayed with simulateGame({ seed }).
import { describe, it, expect } from 'vitest';
import { simulateGame, simulateMany } from '../scripts/simulation/simulateGame';

const GAMES = 75;

describe('bot simulation', () => {
  it.each([
    ['Most money after 10 hands, one screen', { gameMode: 'rounds' as const, isRoom: false }],
    ['Most money after 10 hands, live room', { gameMode: 'rounds' as const, isRoom: true }],
    ['First to 3,000 dollars, live room', { gameMode: 'targetAmount' as const, isRoom: true }],
    ['Last player standing, one screen', { gameMode: 'lastPlayer' as const, isRoom: false, maxHands: 150 }],
  ])('%s: no broken balances or crashes', (_label, opts) => {
    const summary = simulateMany(GAMES, opts);
    expect(summary.problems, JSON.stringify(summary.problems.slice(0, 5), null, 2)).toEqual([]);
  });

  it('ends a "most money after N hands" game after exactly N hands', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const r = simulateGame({ seed, gameMode: 'rounds', totalRounds: 7 });
      expect(r.ended).toBe(true);
      expect(r.hands).toBe(7);
    }
  });

  it('keeps every bankroll at $0 or more, in whole dollars', () => {
    for (let seed = 1; seed <= 50; seed++) {
      for (const m of simulateGame({ seed, players: 12, powerUpChance: 0.9 }).finalMoney) {
        expect(Number.isInteger(m) && m >= 0).toBe(true);
      }
    }
  });

  it('gives the same game for the same seed, so a failure can be replayed', () => {
    expect(simulateGame({ seed: 42 })).toEqual(simulateGame({ seed: 42 }));
  });

  it('buys every power-up at least once across the run', () => {
    const summary = simulateMany(GAMES, { isRoom: true });
    const never = summary.powerUps.filter((p) => p.bought === 0).map((p) => p.key);
    expect(never).toEqual([]);
  });
});
