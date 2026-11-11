// Package G6 (first step): special hands. Off unless the teacher turns them on, and only in games
// with a set number of hands. The schedule only labels a hand; it adds no new phase to it.
//   Final Table: the last hand pays double.
//   Second look: a missed sentence coming back (package L6) pays one and a half times.

export type SpecialHand = 'finalTable' | 'secondLook';

export const SPECIAL_HANDS_KEY = 'grammar_casino_special_hands';

export const SPECIAL_HAND_INFO: Record<SpecialHand, { title: string; rule: string; multiplier: number; icon: string }> = {
  finalTable: { title: 'Final Table', rule: 'Last hand. Every win pays double.', multiplier: 2, icon: '🏆' },
  secondLook: { title: 'Second look', rule: 'A sentence from earlier is back. Wins pay 1.5 times.', multiplier: 1.5, icon: '🔁' },
};

export function specialHandFor(opts: {
  enabled: boolean;
  gameMode: string;
  round: number;
  totalRounds: number;
  secondLookRound: number | null;
}): SpecialHand | null {
  if (!opts.enabled || opts.gameMode !== 'rounds') return null;
  if (opts.round <= 0 || !Number.isFinite(opts.totalRounds) || opts.totalRounds <= 0) return null;
  if (opts.round === opts.totalRounds) return 'finalTable';
  if (opts.secondLookRound === opts.round) return 'secondLook';
  return null;
}

/** What a hand's wins are multiplied by: 1 on an ordinary hand. Losses never change. */
export function payoutMultiplierFor(hand: SpecialHand | null): number {
  return hand ? SPECIAL_HAND_INFO[hand].multiplier : 1;
}

/** A win, scaled for the hand. Zero and losses stay as they are. */
export function scaleWin(amount: number, multiplier: number): number {
  return amount > 0 && multiplier !== 1 ? Math.round(amount * multiplier) : amount;
}
