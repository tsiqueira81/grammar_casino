import { describe, expect, it } from 'vitest';
import { FrameGuard, GUARD_WINDOW_MS, median, parseStoredQuality, resolveTier, startingTier, stepDown } from '../show/quality';

// Package V1: quality levels and the frame-rate guard, with fake frame times.
const run = (guard: FrameGuard, ms: number, totalMs: number) => {
  const changes: string[] = [];
  for (let t = 0; t < totalMs; t += ms) {
    const next = guard.push(ms);
    if (next) changes.push(next);
  }
  return changes;
};

describe('frame-rate guard', () => {
  it('a smooth table stays where it is', () => {
    expect(run(new FrameGuard('medium'), 16, 10_000)).toEqual([]);
  });
  it('a slow table steps down one level after 2 seconds of animation', () => {
    const guard = new FrameGuard('high');
    expect(run(guard, 40, GUARD_WINDOW_MS + 40)).toEqual(['medium']);
  });
  it('keeps stepping down to off if it stays slow, and never steps up', () => {
    const guard = new FrameGuard('medium');
    expect(run(guard, 50, 7_000)).toEqual(['low', 'off']);
    expect(run(guard, 5, 10_000)).toEqual([]);
    expect(guard.tier).toBe('off');
  });
  it('pauses between animations do not count as slow frames', () => {
    const guard = new FrameGuard('medium');
    for (let i = 0; i < 200; i++) {
      expect(guard.push(16)).toBeNull();
      expect(guard.push(5_000)).toBeNull();
    }
  });
  it('a few slow frames among many fast ones are fine (median, not average)', () => {
    const guard = new FrameGuard('medium');
    const changes: string[] = [];
    for (let i = 0; i < 400; i++) {
      const next = guard.push(i % 5 === 0 ? 200 : 14);
      if (next) changes.push(next);
    }
    expect(changes).toEqual([]);
  });
});

describe('choosing the level', () => {
  it('steps down one at a time', () => {
    expect(stepDown('high')).toBe('medium');
    expect(stepDown('off')).toBe('off');
  });
  it('guesses from the device', () => {
    expect(startingTier({ hardwareConcurrency: 8, deviceMemory: 8 })).toBe('medium');
    expect(startingTier({ hardwareConcurrency: 2 })).toBe('low');
    expect(startingTier({ softwareRenderer: true })).toBe('off');
  });
  it("the teacher's choice wins, then what Automatic learned", () => {
    expect(resolveTier({ choice: 'high', learned: 'low' }, {})).toBe('high');
    expect(resolveTier({ choice: 'auto', learned: 'low' }, { hardwareConcurrency: 8 })).toBe('low');
    expect(resolveTier({ choice: 'auto' }, { hardwareConcurrency: 8 })).toBe('medium');
    expect(resolveTier({ choice: 'high' }, { softwareRenderer: true })).toBe('off');
  });
  it('reads a stored choice safely', () => {
    expect(parseStoredQuality('{"choice":"low","learned":"off"}')).toEqual({ choice: 'low', learned: 'off' });
    expect(parseStoredQuality('{"choice":"ultra"}')).toEqual({ choice: 'auto', learned: undefined });
    expect(parseStoredQuality('nope')).toEqual({ choice: 'auto' });
  });
  it('median', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});
