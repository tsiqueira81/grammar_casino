import { describe, expect, it } from 'vitest';
import { migrateSavedGame } from '../game/persistence';

describe('migrateSavedGame', () => {
  it('fills an avatar, win streak and effects for players saved by older versions', () => {
    const out = migrateSavedGame(
      { step: 'IN_GAME', players: [{ id: 1, name: 'Ana', money: 900 }, { id: 2, name: 'Bo', money: 5, avatar: 'cat', winStreak: 2, effects: [{ type: 'SILENCED' }] }] },
      () => 'fox'
    );
    expect(out.players).toEqual([
      { id: 1, name: 'Ana', money: 900, avatar: 'fox', winStreak: 0, effects: [] },
      { id: 2, name: 'Bo', money: 5, avatar: 'cat', winStreak: 2, effects: [{ type: 'SILENCED' }] },
    ]);
  });

  it('turns power-ups saved as plain keys or counts into records', () => {
    const out = migrateSavedGame(
      { powerUpsUsedThisRound: { 1: ['SHIELD', 'JACKPOT'], 2: 3, 3: [{ key: 'SWAP', target: 1 }], 4: [] } as any },
      () => 'fox'
    );
    expect(out.powerUpsUsedThisRound).toEqual({
      1: [{ key: 'SHIELD' }, { key: 'JACKPOT' }],
      2: [],
      3: [{ key: 'SWAP', target: 1 }],
      4: [],
    });
  });

  it('leaves a save without those fields alone', () => {
    expect(migrateSavedGame({ step: 'PLAYER_SETUP' }, () => 'fox')).toEqual({ step: 'PLAYER_SETUP' });
  });

  it('throws on a damaged player list, so the caller falls back to a new game as before', () => {
    expect(() => migrateSavedGame({ players: 'oops' as any }, () => 'fox')).toThrow();
  });
});
