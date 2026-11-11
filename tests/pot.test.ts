import { describe, expect, it } from 'vitest';
import { POT_CENTER, POT_CHIP_CAP, potSlot, potTotal } from '../show/pot';

describe('money you can see (package V3)', () => {
  it('fills the pot piles in turn, so they grow evenly', () => {
    const first = Array.from({ length: 7 }, (_, i) => potSlot(i));
    expect(first.every((s) => s.level === 0)).toBe(true);
    expect(new Set(first.map((s) => `${s.x},${s.z}`)).size).toBe(7);
    expect(potSlot(7)).toEqual({ ...potSlot(0), level: 1 });
    expect(potSlot(15).level).toBe(2);
    expect(potSlot(0)).toEqual({ x: POT_CENTER.x, z: POT_CENTER.z, level: 0 });
  });

  it('keeps every pile on the felt near the pot', () => {
    for (let i = 0; i < POT_CHIP_CAP.high; i++) {
      const s = potSlot(i);
      expect(Math.abs(s.x - POT_CENTER.x)).toBeLessThanOrEqual(0.4);
      expect(Math.abs(s.z - POT_CENTER.z)).toBeLessThanOrEqual(0.3);
      expect(s.level).toBeLessThan(11);
    }
  });

  it('caps the pot lower on weaker tiers', () => {
    expect(POT_CHIP_CAP.low).toBeLessThan(POT_CHIP_CAP.medium);
    expect(POT_CHIP_CAP.medium).toBeLessThanOrEqual(POT_CHIP_CAP.high);
  });

  it('adds up only real bets', () => {
    expect(potTotal({})).toBe(0);
    expect(potTotal({ 1: { bet: 50 }, 2: { bet: 125 }, 3: {}, 4: { bet: Number.NaN }, 5: { bet: -10 }, 6: undefined })).toBe(175);
    expect(potTotal({ 1: { bet: '40' } })).toBe(0);
  });
});
