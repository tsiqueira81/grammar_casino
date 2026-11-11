import { describe, expect, it } from 'vitest';
import { CLOCK_SAMPLES, addClockSample, clockOffset, toLocalTimer } from '../utils/clockSync';

describe('clock sync (package R3)', () => {
  it('keeps the last five samples and trusts the one with the shortest delivery', () => {
    let samples: number[] = [];
    // The phone is 30 s fast: the host's clock reads 30 s less. Deliveries take 50 to 400 ms.
    for (const delay of [400, 120, 50, 300, 200, 250]) {
      const hostSend = 1_000_000;
      samples = addClockSample(samples, hostSend, hostSend + 30_000 + delay);
    }
    expect(samples).toHaveLength(CLOCK_SAMPLES);
    expect(clockOffset(samples)).toBe(-30_050);
  });

  it('ignores broken samples and starts with no difference', () => {
    expect(addClockSample([], Number.NaN, 5)).toEqual([]);
    expect(clockOffset([])).toBe(0);
  });

  it('moves a running deadline onto the phone clock, so both show the same time left', () => {
    const hostNow = 1_000_000;
    const phoneNow = hostNow + 30_000;
    const timer = { status: 'running' as const, endsAt: hostNow + 20_000 };
    const local = toLocalTimer(timer, hostNow - phoneNow)!;
    expect(local.endsAt! - phoneNow).toBe(20_000);
    expect(toLocalTimer({ status: 'locked' as const, remainingMs: 0 }, -30_000)).toEqual({ status: 'locked', remainingMs: 0 });
    expect(toLocalTimer(undefined, 5)).toBeUndefined();
  });
});
