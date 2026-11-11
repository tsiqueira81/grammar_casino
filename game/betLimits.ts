import { BET_CAP_AMOUNT } from '../constants';
import type { ActivePowerUp, Player } from '../types';

/**
 * Bet limits from Bet Cap and High Roller (package F5). Pure: no React, no clock, no randomness.
 * These replace five hand-copied versions in App.tsx and utils/multiplayerProtocol.ts.
 */

type PlayerLike = Pick<Player, 'id' | 'money' | 'effects'>;
type ActiveByPlayer = Record<number, ActivePowerUp[] | undefined>;

/** Fallback cap when only a Bet Cap *effect* is on the player (the wheel's prize). Kept at 50 as today. */
const EFFECT_ONLY_CAP = 50;

export interface BetCap {
  isCapped: boolean;
  /** The cap that would apply; BET_CAP_AMOUNT when the player is not capped. */
  capAmount: number;
}

/**
 * Whether a Bet Cap applies to this player, and its amount. A cap counts when it targets the
 * player, or (with no target) sits in the player's own list. The lowest amount wins.
 */
export function getBetCap(player: PlayerLike, activePowerUps: ActiveByPlayer): BetCap {
  const all = Object.values(activePowerUps).flat().filter(Boolean) as ActivePowerUp[];
  const own = activePowerUps[player.id] || [];
  const caps = all.filter(
    (pu) => pu.type === 'BET_CAP' && (pu.target !== undefined ? pu.target === player.id : own.includes(pu))
  );
  const isCapped = caps.length > 0 || player.effects.some((e) => (e.type as string) === 'BET_CAP');
  const capAmount =
    caps.length > 0
      ? caps.reduce((min, pu) => Math.min(min, pu.amount ?? BET_CAP_AMOUNT), BET_CAP_AMOUNT)
      : isCapped
        ? EFFECT_ONLY_CAP
        : BET_CAP_AMOUNT;
  return { isCapped, capAmount };
}

export interface HighRoller {
  isHighRoller: boolean;
  /** The smallest bet High Roller demands, before it is limited by the player's money: at least 1. */
  floor: number;
}

/** High Roller on this player: the bet must be at least half the bankroll (or the cast amount, if higher). */
export function getHighRoller(player: PlayerLike, activePowerUps: ActiveByPlayer): HighRoller {
  const all = Object.values(activePowerUps).flat().filter(Boolean) as ActivePowerUp[];
  const rollers = all.filter((pu) => pu.type === 'HIGH_ROLLER' && pu.target === player.id);
  const half = Math.ceil(player.money * 0.5);
  const floor = Math.max(
    1,
    rollers.reduce((max, pu) => Math.max(max, pu.amount ?? half), half)
  );
  return { isHighRoller: rollers.length > 0, floor };
}

export interface BetLimits extends BetCap {
  isHighRoller: boolean;
  /** Largest allowed bet: the player's money, or the cap if lower. Never below 0. */
  max: number;
  /** Smallest allowed bet: High Roller's floor limited by `max`, or 0. */
  min: number;
}

/** The range a player's bet is kept in while the hand is open. */
export function getBetLimits(player: PlayerLike, activePowerUps: ActiveByPlayer): BetLimits {
  const cap = getBetCap(player, activePowerUps);
  const money = Math.max(0, player.money);
  const max = cap.isCapped ? Math.min(money, cap.capAmount) : money;
  const roller = getHighRoller(player, activePowerUps);
  const min = roller.isHighRoller && player.money > 0 ? Math.min(max, roller.floor) : 0;
  return { ...cap, isHighRoller: roller.isHighRoller, max, min };
}

/**
 * The minimum bet shown to a player (seat card and phone). Unlike `getBetLimits().min` it is
 * limited by the player's money, not by a Bet Cap, matching what the screens showed before F5.
 */
export function getDisplayedMinBet(player: PlayerLike, activePowerUps: ActiveByPlayer): number {
  const roller = getHighRoller(player, activePowerUps);
  return roller.isHighRoller ? Math.min(player.money, roller.floor) : 0;
}

/** A typed bet clamped into [0, max]; empty or non-numeric input becomes ''. */
export function clampBetInput(value: unknown, max: number): number | '' {
  if (value === '') return '';
  const num = parseInt(String(value), 10);
  if (isNaN(num)) return '';
  return Math.max(0, Math.min(num, max));
}
