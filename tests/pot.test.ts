import { describe, expect, it } from 'vitest';
import { CHIP_FADE_SEC, CHIP_HOLD_SEC, POT_CENTER, chipFadeScale, potTotal } from '../show/pot';

describe('money you can see (package V3)', () => {
  // Teacher's request (2026-11-13): thrown chips used to stay in piles until the payout and
  // covered what is on the screen. The tests for the piles (potSlot, POT_CHIP_CAP) went with them.
  it('a thrown chip lies on the felt for a moment, then shrinks away and is gone', () => {
    expect(chipFadeScale(0)).toBe(1);
    expect(chipFadeScale(CHIP_HOLD_SEC)).toBe(1);
    const half = chipFadeScale(CHIP_HOLD_SEC + CHIP_FADE_SEC / 2)!;
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(1);
    expect(chipFadeScale(CHIP_HOLD_SEC + CHIP_FADE_SEC * 0.9)!).toBeLessThan(half);
    expect(chipFadeScale(CHIP_HOLD_SEC + CHIP_FADE_SEC)).toBeNull();
    expect(chipFadeScale(60)).toBeNull();
  });

  it('no chip stays on the felt for more than two seconds after landing', () => {
    expect(CHIP_HOLD_SEC + CHIP_FADE_SEC).toBeLessThanOrEqual(2);
    expect(CHIP_HOLD_SEC).toBeGreaterThanOrEqual(0.5);
  });

  it('the pot sits in the middle of the felt', () => {
    expect(Math.abs(POT_CENTER.x)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(POT_CENTER.z)).toBeLessThanOrEqual(0.5);
  });

  it('adds up only real bets', () => {
    expect(potTotal({})).toBe(0);
    expect(potTotal({ 1: { bet: 50 }, 2: { bet: 125 }, 3: {}, 4: { bet: Number.NaN }, 5: { bet: -10 }, 6: undefined })).toBe(175);
    expect(potTotal({ 1: { bet: '40' } })).toBe(0);
  });
});
