// One clock for the whole room (package R3). The teacher's screen stamps each update it sends
// with its own time (serverNow). A phone compares that with its own clock to learn how far
// apart the two clocks are, and reads every countdown deadline through that difference.
import type { PlayerTurnTimer } from '../types';

/** How many recent samples a phone keeps. */
export const CLOCK_SAMPLES = 5;

/**
 * A sample is serverNow - localNow at the moment an update arrived. Delivery always takes some
 * time, so each sample is at most the true difference; the largest recent one is the closest.
 */
export function addClockSample(samples: number[], serverNow: number, localNow: number): number[] {
  if (!Number.isFinite(serverNow) || !Number.isFinite(localNow)) return samples;
  return [...samples, serverNow - localNow].slice(-CLOCK_SAMPLES);
}

/** How far the teacher's clock is ahead of this phone's (negative when behind). */
export function clockOffset(samples: number[]): number {
  return samples.length ? Math.max(...samples) : 0;
}

/** The same timer with its deadline moved onto this phone's clock. */
export function toLocalTimer(timer: PlayerTurnTimer | undefined, offsetMs: number): PlayerTurnTimer | undefined {
  if (!timer || timer.endsAt === undefined || !offsetMs) return timer;
  return { ...timer, endsAt: timer.endsAt - offsetMs };
}

/** Bets that reach the teacher's screen this long after the deadline still count (slow Wi-Fi). */
export const LATE_BET_GRACE_MS = 1500;
