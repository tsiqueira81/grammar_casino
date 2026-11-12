// Package V4: a targeted power-up flies across the felt as a card, from the player who used it to
// the player it was used on, and bursts in the colour of its kind. Look only: nothing waits for it.
import type { PowerUpKey } from '../types';
import { getPowerUpEntry, type PowerUpCategory } from '../game/powerUpCatalog';

export interface PowerUpFlightEvent {
  id: string;
  fromPlayerId: number;
  toPlayerId: number;
  fromSeatIndex: number;
  toSeatIndex: number;
  totalSeats: number;
  /** Spark colours for the burst where the card lands. */
  palette: number[];
}

const PALETTES: Record<PowerUpCategory, number[]> = {
  mischief: [0xff6b6b, 0xffb347, 0xffffff],
  insight: [0x7dd3fc, 0xe0f2fe, 0xffffff],
  boost: [0xfde68a, 0xfacc15, 0xffffff],
  shield: [0x86efac, 0xd1fae5, 0xffffff],
};

export function flightPalette(key: PowerUpKey): number[] {
  if (key === 'SUB_ZERO') return [0xbae6fd, 0x7dd3fc, 0xffffff];
  return PALETTES[getPowerUpEntry(key)?.category ?? 'mischief'];
}
