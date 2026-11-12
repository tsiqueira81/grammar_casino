import { describe, expect, it } from 'vitest';
import { CROWN_STREAK, totemScreenPoint, totemsFor } from '../show/totems';

describe('totems over the seats (package V4)', () => {
  it('shows a crown from the on-fire streak, a shield and ice', () => {
    expect(totemsFor({ hasShield: false, isFrozen: false, winStreak: 0 })).toEqual([]);
    expect(totemsFor({ hasShield: false, isFrozen: false, winStreak: CROWN_STREAK - 1 })).toEqual([]);
    expect(totemsFor({ hasShield: false, isFrozen: false, winStreak: CROWN_STREAK })).toEqual(['crown']);
    expect(totemsFor({ hasShield: true, isFrozen: true, winStreak: 5 })).toEqual(['crown', 'shield', 'ice']);
  });

  it('centres totems above the tile, side by side', () => {
    const rect = { left: 100, top: 300, width: 200 };
    expect(totemScreenPoint(rect, 0, 1)).toEqual({ x: 200, y: 296 });
    const pair = [totemScreenPoint(rect, 0, 2, 40), totemScreenPoint(rect, 1, 2, 40)];
    expect(pair.map((p) => p.x)).toEqual([180, 220]);
    expect(pair[0].y).toBeLessThan(rect.top);
  });
});
