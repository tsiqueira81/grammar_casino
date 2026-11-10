import type { PowerUpKey, UsedPowerUp } from '../types';

/**
 * Saved games (package F5). One place that brings an older saved game up to today's shape.
 * It was copied in loadInitialState (the browser's saved game) and handleConfirmLoadGame
 * (a game file the teacher opens).
 */

/** Fills fields older saves lack. Pass the avatar picker in, so this stays free of randomness. */
export function migrateSavedGame<T extends { players?: unknown; powerUpsUsedThisRound?: unknown }>(
  parsed: T,
  pickAvatar: () => string
): T {
  const out: any = parsed;
  if (out.players) {
    out.players = out.players.map((p: any) => ({
      ...p,
      avatar: p.avatar || pickAvatar(),
      winStreak: p.winStreak || 0,
      effects: p.effects || [],
    }));
  }
  if (out.powerUpsUsedThisRound) {
    // Before UsedPowerUp records, a hand's power-ups were stored as plain keys (or a count).
    const fixed: Record<number, UsedPowerUp[]> = {};
    Object.keys(out.powerUpsUsedThisRound).forEach((k) => {
      const key = Number(k);
      const val = out.powerUpsUsedThisRound[key];
      if (Array.isArray(val)) {
        fixed[key] =
          val.length > 0 && typeof val[0] === 'string' ? val.map((p: string) => ({ key: p as PowerUpKey })) : val;
      } else {
        fixed[key] = [];
      }
    });
    out.powerUpsUsedThisRound = fixed;
  }
  return out;
}

