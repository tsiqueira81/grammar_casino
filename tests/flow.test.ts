import { describe, expect, it } from 'vitest';
import { checkGameEnd, isBailoutEnabled, pickWinnerAtGameEnd, pickWinnerWhenEndedEarly, refundHandSpending } from '../game/flow';
import type { GameMode, Player } from '../types';

const p = (id: number, money: number) => ({ id, name: `P${id}`, money, history: [], avatar: 'x', winStreak: 0, effects: [] }) as Player;

const input = (players: Player[], gameMode: GameMode, extra: Partial<Parameters<typeof checkGameEnd>[0]> = {}) => ({
  players,
  gameMode,
  currentRound: 1,
  totalRounds: 10,
  targetAmount: 2000,
  isRoom: false,
  ...extra,
});

describe('isBailoutEnabled', () => {
  it('only in a live room, and never in last player standing', () => {
    expect(isBailoutEnabled(true, 'rounds')).toBe(true);
    expect(isBailoutEnabled(true, 'targetAmount')).toBe(true);
    expect(isBailoutEnabled(true, 'lastPlayer')).toBe(false);
    expect(isBailoutEnabled(false, 'rounds')).toBe(false);
  });
});

describe('checkGameEnd', () => {
  it('ends a fixed-hands game at the last hand, even if typed as text', () => {
    expect(checkGameEnd(input([p(1, 500), p(2, 500)], 'rounds', { currentRound: 9 })).isGameOver).toBe(false);
    expect(checkGameEnd(input([p(1, 500), p(2, 500)], 'rounds', { currentRound: 10, totalRounds: '10' })).isRoundLimitReached).toBe(true);
  });

  it('ends a target game when a solvent player reaches the target', () => {
    expect(checkGameEnd(input([p(1, 1999), p(2, 500)], 'targetAmount')).isGameOver).toBe(false);
    expect(checkGameEnd(input([p(1, 2000), p(2, 500)], 'targetAmount')).hasTargetWinner).toBe(true);
  });

  it('ends on one solvent player or none on a single screen, where $0 is out for good', () => {
    expect(checkGameEnd(input([p(1, 800), p(2, 0)], 'lastPlayer')).isEliminationVictory).toBe(true);
    expect(checkGameEnd(input([p(1, 0), p(2, 0)], 'rounds')).isAllBankrupt).toBe(true);
    // A one-player game does not end just because only one player is left.
    expect(checkGameEnd(input([p(1, 800)], 'lastPlayer')).isGameOver).toBe(false);
  });

  it('keeps a live room going when players go bankrupt, outside last player standing', () => {
    const room = checkGameEnd(input([p(1, 800), p(2, 0)], 'rounds', { isRoom: true }));
    expect(room.isGameOver).toBe(false);
    expect(room.bailoutEnabled).toBe(true);
    expect(checkGameEnd(input([p(1, 800), p(2, 0)], 'lastPlayer', { isRoom: true })).isGameOver).toBe(true);
  });
});

describe('pickWinnerAtGameEnd', () => {
  it('picks the richest player over the target, or nobody on a tie', () => {
    expect(pickWinnerAtGameEnd(input([p(1, 2500), p(2, 2100)], 'targetAmount'))?.id).toBe(1);
    expect(pickWinnerAtGameEnd(input([p(1, 2500), p(2, 2500)], 'targetAmount'))).toBeNull();
  });

  it('picks the last solvent player', () => {
    expect(pickWinnerAtGameEnd(input([p(1, 0), p(2, 40)], 'lastPlayer'))?.id).toBe(2);
  });

  it('picks the richest at the hand limit, or nobody on a tie', () => {
    const atLimit = { currentRound: 10 };
    expect(pickWinnerAtGameEnd(input([p(1, 900), p(2, 1200), p(3, 0)], 'rounds', atLimit))?.id).toBe(2);
    expect(pickWinnerAtGameEnd(input([p(1, 900), p(2, 900)], 'rounds', atLimit))).toBeNull();
  });

  it('gives nobody when everyone is bankrupt in last player standing', () => {
    expect(pickWinnerAtGameEnd(input([p(1, 0), p(2, 0)], 'lastPlayer'))).toBeNull();
  });

  it('in a room at the hand limit with one solvent player, still compares only solvent players', () => {
    expect(pickWinnerAtGameEnd(input([p(1, 0), p(2, 300)], 'rounds', { isRoom: true, currentRound: 10 }))?.id).toBe(2);
  });
});

describe('pickWinnerWhenEndedEarly', () => {
  it('uses the target winner first, then the richest solvent player', () => {
    expect(pickWinnerWhenEndedEarly({ players: [p(1, 2500), p(2, 3000)], gameMode: 'targetAmount', targetAmount: 2000 })?.id).toBe(2);
    expect(pickWinnerWhenEndedEarly({ players: [p(1, 500), p(2, 700)], gameMode: 'rounds', targetAmount: 2000 })?.id).toBe(2);
    expect(pickWinnerWhenEndedEarly({ players: [p(1, 700), p(2, 700)], gameMode: 'rounds', targetAmount: 2000 })).toBeNull();
    expect(pickWinnerWhenEndedEarly({ players: [p(1, 0), p(2, 0)], gameMode: 'rounds', targetAmount: 2000 })).toBeNull();
  });
});

describe('refundHandSpending (Swap this sentence)', () => {
  it('gives back what each player spent this hand and leaves the rest alone', () => {
    const players = [
      { id: 1, money: 100 },
      { id: 2, money: 50 },
      { id: 3, money: 0 },
    ];
    const out = refundHandSpending(players, { 1: 20, 3: 15 });
    expect(out.map((p) => p.money)).toEqual([120, 50, 15]);
    expect(out[1]).toBe(players[1]);
    expect(players[0].money).toBe(100);
  });
});
