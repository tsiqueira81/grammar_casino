import type { ActivePowerUp, Player } from '../types';

/**
 * Who is protected, frozen or silenced (package F5). Pure functions that replace copies of
 * the same checks across App.tsx, the phone view builder, settlement and the seat card.
 */

type PlayerLike = Pick<Player, 'id' | 'effects'>;

/** Shield or Guardian Angel in the player's own list: blocks attacks aimed at them. */
export function hasShieldProtection(ownPowerUps: readonly ActivePowerUp[] | undefined): boolean {
  return (ownPowerUps || []).some((pu) => pu.type === 'SHIELD' || pu.type === 'GUARDIAN_ANGEL');
}

/**
 * A plain Shield only. Kept separate because two places check only Shield today: the wheel's
 * Bounty prize (Guardian Angel does not protect against it) and the seat card's shield badge.
 */
export function hasPlainShield(ownPowerUps: readonly ActivePowerUp[] | undefined): boolean {
  return (ownPowerUps || []).some((pu) => pu.type === 'SHIELD');
}

/** Frozen by Sub-Zero: a Sub-Zero aimed at the player, or the Sub-Zero effect on them. */
export function isFrozenBySubZero(player: PlayerLike, allActivePowerUps: readonly ActivePowerUp[]): boolean {
  return (
    allActivePowerUps.some((pu) => pu.type === 'SUB_ZERO' && pu.target === player.id) ||
    player.effects.some((e) => (e.type as string) === 'SUB_ZERO')
  );
}

/** Silenced: the player cannot buy power-ups this hand. */
export function isSilencedThisHand(player: Pick<Player, 'effects'>): boolean {
  return player.effects.some((e) => (e.type as string) === 'SILENCED');
}
