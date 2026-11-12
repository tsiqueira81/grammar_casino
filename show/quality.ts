// Quality levels for the 3D table and a frame-rate guard (package V1). The table is decoration,
// so on a weak school laptop it gets simpler, and if that is not enough it switches itself off.
// The game never waits for it.

export type QualityTier = 'off' | 'low' | 'medium' | 'high';
export type QualityChoice = QualityTier | 'auto';

export const TIERS: QualityTier[] = ['off', 'low', 'medium', 'high'];
export const QUALITY_KEY = 'grammar_casino_quality_v1';

export interface TierSettings {
  /** Highest device pixel ratio the canvas uses. */
  pixelRatio: number;
  antialias: boolean;
  maxSparks: number;
  maxCoins: number;
  /** Chips drawn for one bet (the rest are left out; the amount is unchanged). */
  maxChipsPerToss: number;
  /**
   * Package V7: the finishing light on the still table (High only): a soft bloom on the brightest
   * gold, a vignette, and one 1024 shadow map from the lamp. 0 means none.
   */
  shadowMapSize: number;
  bloom: boolean;
}

export const TIER_SETTINGS: Record<Exclude<QualityTier, 'off'>, TierSettings> = {
  low: { pixelRatio: 1, antialias: false, maxSparks: 120, maxCoins: 24, maxChipsPerToss: 4, shadowMapSize: 0, bloom: false },
  medium: { pixelRatio: 1.5, antialias: true, maxSparks: 420, maxCoins: 72, maxChipsPerToss: 12, shadowMapSize: 0, bloom: false },
  high: { pixelRatio: 2, antialias: true, maxSparks: 420, maxCoins: 72, maxChipsPerToss: 12, shadowMapSize: 1024, bloom: true },
};

/** Budgets for the development overlay (Shift+D). */
export const BUDGET = { drawCalls: 100, triangles: 150_000, textureMB: 64 };

/** One step down, never below off. */
export function stepDown(tier: QualityTier): QualityTier {
  return TIERS[Math.max(0, TIERS.indexOf(tier) - 1)];
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export const GUARD_WINDOW_MS = 2_000;
export const GUARD_LIMIT_MS = 24;
/** A gap longer than this is the table resting between animations, not a slow frame. */
export const GUARD_GAP_MS = 250;

/**
 * Watches frame times while the table animates. When the median over 2 seconds of animation is
 * above 24 ms, it asks for one step down. It never steps up during a game, so it cannot flip-flop.
 */
export class FrameGuard {
  private frames: number[] = [];
  private spent = 0;

  constructor(public tier: QualityTier) {}

  /** Adds one frame. Returns the new tier when it should step down, otherwise null. */
  push(frameMs: number): QualityTier | null {
    if (this.tier === 'off' || !(frameMs > 0) || frameMs > GUARD_GAP_MS) return null;
    this.frames.push(frameMs);
    this.spent += frameMs;
    if (this.spent < GUARD_WINDOW_MS) return null;
    const slow = median(this.frames) > GUARD_LIMIT_MS;
    this.frames = [];
    this.spent = 0;
    if (!slow) return null;
    this.tier = stepDown(this.tier);
    return this.tier;
  }
}

export interface DeviceHints {
  hardwareConcurrency?: number;
  deviceMemory?: number;
  softwareRenderer?: boolean;
}

/** Where to start when the teacher chose Automatic and nothing was learned yet. */
export function startingTier(hints: DeviceHints): QualityTier {
  if (hints.softwareRenderer) return 'off';
  if ((hints.hardwareConcurrency && hints.hardwareConcurrency <= 2) || (hints.deviceMemory && hints.deviceMemory <= 2)) return 'low';
  return 'medium';
}

export interface StoredQuality {
  choice: QualityChoice;
  /** What Automatic learned on this computer (the guard's last step down). */
  learned?: QualityTier;
}

export function parseStoredQuality(raw: string | null): StoredQuality {
  try {
    const data = raw ? JSON.parse(raw) : null;
    const choice: QualityChoice = data && (data.choice === 'auto' || TIERS.includes(data.choice)) ? data.choice : 'auto';
    const learned: QualityTier | undefined = data && TIERS.includes(data.learned) ? data.learned : undefined;
    return { choice, learned };
  } catch {
    return { choice: 'auto' };
  }
}

/** The tier to use: the teacher's choice, or what Automatic learned, or a guess from the device. */
export function resolveTier(stored: StoredQuality, hints: DeviceHints): QualityTier {
  if (hints.softwareRenderer) return 'off';
  if (stored.choice !== 'auto') return stored.choice;
  return stored.learned ?? startingTier(hints);
}
