// Package V3: money you can see. The pot total shows on a brass plaque. Bet chips fly to the middle
// of the felt, lie there for a moment and then shrink away: they used to stay in piles until the
// payout, but they covered what is on the screen (teacher's request, 2026-11-13).

/** Where the pot sits on the felt (table units, y is up). */
export const POT_CENTER = { x: 0, z: -0.35 } as const;

/** How long a thrown chip lies on the felt after landing, and how long it then takes to shrink away. */
export const CHIP_HOLD_SEC = 1.2;
export const CHIP_FADE_SEC = 0.4;

/**
 * The size of a thrown chip (1 = full size) this many seconds after it landed, or null once it is
 * gone. No chip stays on the felt: every one is gone CHIP_HOLD_SEC + CHIP_FADE_SEC after landing.
 */
export function chipFadeScale(secondsSinceLanding: number): number | null {
  const t = (secondsSinceLanding - CHIP_HOLD_SEC) / CHIP_FADE_SEC;
  if (!(t > 0)) return 1;
  if (t >= 1) return null;
  return 1 - t * t;
}

/** The pot total: every bet still on the table this hand. */
export function potTotal(bets: Record<number, { bet?: unknown } | undefined>): number {
  let total = 0;
  for (const b of Object.values(bets)) {
    const n = typeof b?.bet === 'number' && Number.isFinite(b.bet) && b.bet > 0 ? b.bet : 0;
    total += n;
  }
  return Math.round(total);
}
