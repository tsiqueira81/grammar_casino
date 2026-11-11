// Missed points come back (package L6). When many players miss a hand, a new sentence on the
// same grammar point ("a second look") is dealt two hands later. Never the same sentence: only
// the grammar point is repeated. Nothing about how a hand plays changes.

export const SECOND_LOOK_MISS_RATE = 0.4;
export const SECOND_LOOK_GAP = 2;
/** At least this many bets on the hand, so one player's slip is not "the class missed it". */
export const SECOND_LOOK_MIN_BETS = 2;

export interface SecondLook {
  dueRound: number;
  subtype: string;
  fromRound: number;
}

export interface HandOutcome {
  round: number;
  /** The grammar point of the hand (its subtype); none means nothing to repeat. */
  subtype: string | null;
  bets: number;
  misses: number;
  /** Hands still to come after this one (Infinity in open-ended modes). */
  handsLeft: number;
}

/** Adds a second look for this hand when enough of the class missed it. */
export function scheduleSecondLook(queue: SecondLook[], hand: HandOutcome): SecondLook[] {
  if (!hand.subtype || hand.bets < SECOND_LOOK_MIN_BETS) return queue;
  if (hand.misses / hand.bets < SECOND_LOOK_MISS_RATE) return queue;
  if (hand.handsLeft < SECOND_LOOK_GAP) return queue;
  // A second look is not itself repeated, and one grammar point is queued once.
  if (queue.some((e) => e.subtype === hand.subtype && e.dueRound >= hand.round)) return queue;
  return [...queue, { dueRound: hand.round + SECOND_LOOK_GAP, subtype: hand.subtype, fromRound: hand.round }];
}

/** The second look due on this hand, if any. */
export function secondLookFor(queue: SecondLook[], round: number): SecondLook | undefined {
  return queue.find((e) => e.dueRound === round);
}

/** Forget the second look a hand asked for (its reveal was undone or the hand was voided). */
export function cancelSecondLook(queue: SecondLook[], fromRound: number): SecondLook[] {
  return queue.filter((e) => e.fromRound !== fromRound);
}
