import { describe, expect, it } from 'vitest';
import { TABLE_VIEW_MIN_WIDTH, seatAnchorIndex, tableViewOn } from '../show/tableView';

describe('Table view (package V2 step 2)', () => {
  const base = { step: 'IN_GAME', quality: 'medium' as const, calmMode: false, width: 1920 };

  it('shows the 3D table on the game screens of a wide screen', () => {
    for (const step of ['IN_GAME', 'RESULTS', 'GAME_OVER']) expect(tableViewOn({ ...base, step })).toBe(true);
  });

  it('keeps Classic view on setup screens, 3D Off, Calm mode and narrow screens', () => {
    expect(tableViewOn({ ...base, step: 'PLAYER_SETUP' })).toBe(false);
    expect(tableViewOn({ ...base, quality: 'off' })).toBe(false);
    expect(tableViewOn({ ...base, calmMode: true })).toBe(false);
    expect(tableViewOn({ ...base, width: TABLE_VIEW_MIN_WIDTH - 1 })).toBe(false);
    expect(tableViewOn({ ...base, quality: 'low', width: TABLE_VIEW_MIN_WIDTH })).toBe(true);
  });

  it('spreads up to 12 players around the rail, then fills the gallery', () => {
    expect([0, 1, 2].map((s) => seatAnchorIndex(s, 3))).toEqual([0, 4, 8]);
    expect(Array.from({ length: 12 }, (_, s) => seatAnchorIndex(s, 12))).toEqual(Array.from({ length: 12 }, (_, s) => s));
    expect(seatAnchorIndex(20, 30)).toBe(20);
    expect(seatAnchorIndex(39, 40)).toBe(39);
    expect(new Set(Array.from({ length: 40 }, (_, s) => seatAnchorIndex(s, 40))).size).toBe(40);
  });
});
