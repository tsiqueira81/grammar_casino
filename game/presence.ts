// Who is really in the room (package R2). A phone says "still here" every 20 seconds while it
// is on screen, and any bet or tap counts too. A seat silent for 45 seconds, or whose phone
// disconnected, is "away": greyed out on the projector, and it does not hold up the reveal.

import type { Bet } from '../types';

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

// --- A bet made while the phone was offline (package R2) ---


/** A bet the teacher's screen may not have yet: what the phone had when it was offline. */
export interface PendingBet {
  round: number;
  /** The sentence it was for: a swapped sentence makes the old answer meaningless. */
  sentence: string;
  bet: Bet;
  /** Sent again once already after the phone came back. */
  resent: boolean;
}

function clean(s: string | undefined): string {
  return (s || '').trim().toLowerCase();
}

/** Nothing worth sending: no answer and no stake. */
export function isEmptyBet(b: Bet | undefined): boolean {
  if (!b) return true;
  const stake = Number(b.bet) > 0;
  const answer =
    Boolean(b.opinion) ||
    Boolean(clean(b.selectedOption)) ||
    Boolean(clean(b.clozeAnswer)) ||
    (b.splitOptions || []).length > 0 ||
    (b.splitClozeAnswers || []).some((w) => clean(w)) ||
    Boolean(clean(b.userCorrection));
  return !stake && !answer;
}

/** The teacher's screen holds the same answer and stake as the phone. */
export function sameBet(a: Bet | undefined, b: Bet | undefined): boolean {
  const x = a || {};
  const y = b || {};
  const num = (v: number | '' | undefined) => (v === '' || v === undefined ? 0 : Number(v));
  const list = (v: readonly string[] | undefined) => (v || []).map(clean).filter(Boolean).sort().join('|');
  return (
    num(x.bet) === num(y.bet) &&
    (x.opinion || '') === (y.opinion || '') &&
    clean(x.selectedOption) === clean(y.selectedOption) &&
    clean(x.clozeAnswer) === clean(y.clozeAnswer) &&
    clean(x.userCorrection) === clean(y.userCorrection) &&
    list(x.splitOptions) === list(y.splitOptions) &&
    list(x.splitClozeAnswers) === list(y.splitClozeAnswers) &&
    (x.splitCorrectPercent ?? null) === (y.splitCorrectPercent ?? null)
  );
}

/**
 * What to do with an offline bet when a view arrives: send it again while the hand is still
 * open, forget it once the teacher's screen holds it, or say plainly that it did not arrive.
 */
export function settlePendingBet(
  pending: PendingBet | null,
  view: { round: number; step: string; myBet?: Bet; sentence?: { text?: string } | null },
  offline: boolean
): { pending: PendingBet | null; action: 'none' | 'resend' | 'lost' } {
  if (!pending || offline) return { pending, action: 'none' };
  if (isEmptyBet(pending.bet)) return { pending: null, action: 'none' };
  // The teacher swapped the sentence meanwhile: that hand's bet was refunded, nothing to say.
  if (view.round === pending.round && view.step === 'IN_GAME' && (view.sentence?.text || '') !== pending.sentence) {
    return { pending: null, action: 'none' };
  }
  if (view.round === pending.round && sameBet(pending.bet, view.myBet)) return { pending: null, action: 'none' };
  if (view.round === pending.round && view.step === 'IN_GAME') {
    return pending.resent ? { pending, action: 'none' } : { pending: { ...pending, resent: true }, action: 'resend' };
  }
  return { pending: null, action: 'lost' };
}
