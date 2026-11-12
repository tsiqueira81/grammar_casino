// Package V3: money you can see. Bet chips stay in the pot until the hand is paid out, stacked in
// a few neat piles in the middle of the felt, and the pot total shows on a brass plaque.
import type { QualityTier } from './quality';

/** Where the pot sits on the felt (table units, y is up). */
export const POT_CENTER = { x: 0, z: -0.35 } as const;

/** The most chips the pot keeps on each tier; older ones make room for new ones. */
export const POT_CHIP_CAP: Record<Exclude<QualityTier, 'off'>, number> = { low: 16, medium: 48, high: 72 };

/** Pile spots around the pot centre, offsets in table units. */
const PILES: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [-0.34, 0.06],
  [0.34, 0.04],
  [-0.17, -0.22],
  [0.18, -0.21],
  [-0.15, 0.25],
  [0.2, 0.25],
];

/**
 * Where the n-th chip in the pot rests: piles fill in turn so they grow evenly. Returns the pile's
 * x and z and the chip's level in the pile (0 = on the felt).
 */
export function potSlot(index: number): { x: number; z: number; level: number } {
  const i = Math.max(0, Math.floor(index));
  const [dx, dz] = PILES[i % PILES.length];
  return { x: POT_CENTER.x + dx, z: POT_CENTER.z + dz, level: Math.floor(i / PILES.length) };
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
