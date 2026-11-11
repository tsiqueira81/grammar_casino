// Who is really in the room (package R2). A phone says "still here" every 20 seconds while it
// is on screen, and any bet or tap counts too. A seat silent for 45 seconds, or whose phone
// disconnected, is "away": greyed out on the projector, and it does not hold up the reveal.

export const AWAY_AFTER_MS = 45_000;

export interface PresenceSeat {
  connected: boolean;
  lastSeen?: number;
}

/** Ids of the seats that are away now, in ascending order. */
export function awaySeatIds(
  seats: Record<number, PresenceSeat | undefined>,
  lastSeen: Record<number, number | undefined>,
  now: number
): number[] {
  return Object.entries(seats)
    .filter(([id, seat]) => {
      if (!seat) return false;
      if (!seat.connected) return true;
      const heard = Math.max(lastSeen[Number(id)] ?? 0, seat.lastSeen ?? 0);
      return heard > 0 && now - heard > AWAY_AFTER_MS;
    })
    .map(([id]) => Number(id))
    .sort((a, b) => a - b);
}

/** "32 in, 2 away" for the room bar. */
export function presenceSummary(seatCount: number, awayCount: number): string {
  const inCount = Math.max(0, seatCount - awayCount);
  return awayCount > 0 ? `${inCount} in, ${awayCount} away` : `${inCount} in`;
}
