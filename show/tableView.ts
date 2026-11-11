// Package V2 step 2: "Table view" puts the Blender table (public/models/table.glb and room.glb)
// behind the game screens. "Classic view" (the flat felt) stays automatic on 3D Off, in Calm
// mode and on screens under 1100 pixels wide.
import type { QualityTier } from './quality';

export const TABLE_VIEW_MIN_WIDTH = 1100;
export const TABLE_SCREENS = ['IN_GAME', 'RESULTS', 'GAME_OVER'] as const;

export function tableViewOn(opts: { step: string; quality: QualityTier; calmMode: boolean; width: number }): boolean {
  if (!(TABLE_SCREENS as readonly string[]).includes(opts.step)) return false;
  if (opts.quality === 'off' || opts.calmMode) return false;
  return opts.width >= TABLE_VIEW_MIN_WIDTH;
}

/** The camera the chips overlay uses too, so a tossed chip lands on the real felt. */
export const TABLE_CAMERA = {
  fov: 36,
  position: [0, 6.2, 6.6] as const,
  lookAt: [0, 0, 0.25] as const,
};

/**
 * Which Seat_Anchor_NN a player sits at: up to 12 players share the 12 rail seats evenly;
 * beyond that the first 12 take the rail and the rest fill the gallery (anchors 12 to 39).
 */
export function seatAnchorIndex(seatIndex: number, totalSeats: number): number {
  const total = Math.max(1, Math.min(40, totalSeats));
  const seat = Math.max(0, Math.min(total - 1, seatIndex));
  if (total <= 12) return Math.floor((seat * 12) / total);
  return seat;
}
