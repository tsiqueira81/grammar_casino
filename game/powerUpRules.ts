// Power-up rules shared by every place that applies them (package G5 bug fixes).
import type { ActivePowerUp, Player, PlayerEffect, PowerUpKey } from '../types';
import { hasShieldProtection, isSilencedThisHand } from './status';

/** Targeted attacks a concealed Boomerang sends back to the attacker. */
export const BOOMERANG_REFLECTED_ATTACKS: readonly PowerUpKey[] = [
  'THE_PUNISHER', 'PICKPOCKET', 'SUB_ZERO', 'BET_CAP', 'HIGH_ROLLER', 'HALF_BAKED', 'SWAP', 'CRUCIO', 'SILENCER',
];

/**
 * Attacks already placed on a player that a Boomerang bought afterwards still sends back.
 * Only attacks that wait in the hand's power-up list and act at settlement can be sent back
 * this way; instant ones (The Punisher, Pickpocket, Swap) have already happened, and Crucio
 * and Silencer live on the player as effects. Always a subset of BOOMERANG_REFLECTED_ATTACKS.
 */
export const BOOMERANG_REFLECTED_PLACED: readonly PowerUpKey[] = ['HALF_BAKED', 'SUB_ZERO', 'BET_CAP', 'HIGH_ROLLER'];

export function isBoomerangReflected(key: PowerUpKey): boolean {
  return BOOMERANG_REFLECTED_ATTACKS.includes(key);
}

/** Effects Guardian Angel removes from its holder (including a freeze or bet cap from the wheel). */
const CLEARED_BY_GUARDIAN = new Set<string>(['CRUCIO', 'SILENCED', 'SUB_ZERO', 'BET_CAP']);

export function clearNegativeEffects(effects: readonly PlayerEffect[]): PlayerEffect[] {
  return effects.filter((e) => !CLEARED_BY_GUARDIAN.has(e.type as string));
}

/** The wheel's Bounty prize takes money only from players with no Shield or Guardian Angel. */
export function isProtectedFromWheelBounty(ownPowerUps: readonly ActivePowerUp[] | undefined): boolean {
  return hasShieldProtection(ownPowerUps);
}

/** A silenced player cannot buy power-ups, whatever screen or phone asks. */
export function mayBuyPowerUps(player: Pick<Player, 'effects'>): boolean {
  return !isSilencedThisHand(player);
}
