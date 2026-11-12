// Package V4: props that act. A small 3D totem floats just above a player's tile or card while
// they have a shield, are frozen by Sub-Zero, or are on a winning streak of 3 or more.

export type TotemKind = 'shield' | 'ice' | 'crown';

/** The node in public/models/powerup_totems.glb for each totem, and the size it is drawn at. */
export const TOTEM_NODES: Record<TotemKind, { node: string; scale: number }> = {
  shield: { node: 'Totem_ShieldDome', scale: 0.15 },
  ice: { node: 'Totem_SubZeroIce', scale: 0.19 },
  crown: { node: 'Totem_StreakCrown', scale: 0.2 },
};

/** The same streak that sets a tile "on fire". */
export const CROWN_STREAK = 3;

/** Which totems a seat shows, left to right. */
export function totemsFor(seat: { hasShield: boolean; isFrozen: boolean; winStreak: number }): TotemKind[] {
  const out: TotemKind[] = [];
  if (seat.winStreak >= CROWN_STREAK) out.push('crown');
  if (seat.hasShield) out.push('shield');
  if (seat.isFrozen) out.push('ice');
  return out;
}

/**
 * Where a totem sits on screen: centred above the tile's top edge, side by side when a player has
 * more than one. Returns the screen point in pixels.
 */
export function totemScreenPoint(
  rect: { left: number; top: number; width: number },
  index: number,
  count: number,
  gap = 46,
): { x: number; y: number } {
  const offset = (index - (count - 1) / 2) * gap;
  return { x: rect.left + rect.width / 2 + offset, y: rect.top - 4 };
}
