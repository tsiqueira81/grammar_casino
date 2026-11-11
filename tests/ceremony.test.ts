import { describe, expect, it } from 'vitest';
import { CEREMONY_DONE, STAGE_MS, ceremonyTimes, cueForStage, placeShown } from '../game/ceremony';

describe("the winner's ceremony (package V9)", () => {
  it('reveals third, then second, then the winner, then the class result', () => {
    expect([3, 2, 1].map((place) => [0, 1, 2, 3, 4].filter((s) => placeShown(place, s as 0)).length)).toEqual([4, 3, 2]);
    expect(CEREMONY_DONE).toBe(4);
  });

  it('times a full podium, and skips the empty places of a short one', () => {
    expect(ceremonyTimes(3)).toEqual([1200, 2200, 3400, 4600]);
    expect(ceremonyTimes(2)).toEqual([1200, 1200, 2400, 3600]);
    expect(ceremonyTimes(1)).toEqual([1200, 1200, 1200, 2400]);
    expect(STAGE_MS.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(5000); // short enough for a class
  });

  it('plays the drumroll, a step for each place there is, and the fanfare for the winner', () => {
    expect([0, 1, 2, 3, 4].map((s) => cueForStage(s as 0, 3))).toEqual(['drumroll', 'step', 'step', 'winner', null]);
    expect([1, 2].map((s) => cueForStage(s as 1, 2))).toEqual([null, 'step']);
  });
});
