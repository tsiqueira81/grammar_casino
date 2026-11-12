// Package G6 (first step): special hands. Off unless the teacher turns them on, and only in games
// with a set number of hands. The schedule only labels a hand; it adds no new phase to it.
//   Final Table: the last hand pays double.
//   Second look: a missed sentence coming back (package L6) pays one and a half times.
//   Spotlight:      the grammar point the class has missed most; a right answer earns a free
//                   power-up draw (used on a later hand).
//   Fix it:         two hands before the end, a flawed Valid-or-flawed sentence; students type
//                   the correction, and the class sees the corrections, without names.
//   Listening hand: halfway through, a Valid-or-flawed sentence is read aloud, not shown, until
//                   the reveal. It pays as usual.

export type SpecialHand = 'finalTable' | 'secondLook' | 'spotlight' | 'fixIt' | 'listening';

export const SPECIAL_HANDS_KEY = 'grammar_casino_special_hands';
/** Package L9: the "Say it" prompt after each reveal. */
export const SAY_IT_KEY = 'grammar_casino_say_it';

export const SPECIAL_HAND_INFO: Record<SpecialHand, { title: string; rule: string; multiplier: number; icon: string }> = {
  finalTable: { title: 'Final Table', rule: 'Last hand. Every win pays double. Balances stay hidden on the big screen until the reveal.', multiplier: 2, icon: '🏆' },
  secondLook: { title: 'Second look', rule: 'A sentence from earlier is back. Wins pay 1.5 times.', multiplier: 1.5, icon: '🔁' },
  spotlight: { title: 'Spotlight', rule: 'The grammar point the class missed most. Get it right for a free power-up draw.', multiplier: 1, icon: '🔦' },
  fixIt: { title: 'Fix it', rule: 'This sentence has a mistake. Type your correction: the class sees them after the reveal, without names.', multiplier: 1, icon: '🛠️' },
  listening: { title: 'Listening hand', rule: 'Listen! The sentence is read aloud, not shown. You see it after the reveal.', multiplier: 1, icon: '🎧' },
};

/** The Spotlight hand: about 40% of the way through a game of 6 or more hands (hand 4 of 10), or null. */
export function spotlightRoundFor(totalRounds: number): number | null {
  if (!Number.isFinite(totalRounds) || totalRounds < 6) return null;
  return Math.max(2, Math.round(totalRounds * 0.4));
}

/** The Fix it hand: two hands before the end of a game of 8 or more hands, or null. */
export function fixItRoundFor(totalRounds: number): number | null {
  if (!Number.isFinite(totalRounds) || totalRounds < 8) return null;
  return totalRounds - 2;
}

/** The hand halfway through a game of 4 or more hands, or null. */
export function listeningRoundFor(totalRounds: number): number | null {
  if (!Number.isFinite(totalRounds) || totalRounds < 4) return null;
  return Math.ceil(totalRounds / 2);
}

/** The badge text: the title, and the multiplier when the hand pays more. */
export function specialHandLabelFor(hand: SpecialHand | null): string | null {
  if (!hand) return null;
  const info = SPECIAL_HAND_INFO[hand];
  return info.multiplier === 1 ? info.title : `${info.title} ${info.multiplier}×`;
}

export function specialHandFor(opts: {
  enabled: boolean;
  gameMode: string;
  round: number;
  totalRounds: number;
  secondLookRound: number | null;
  /** The hand's question type, once dealt: only Valid or flawed can be a listening hand. */
  questionType?: string | null;
  /** Whether the dealt sentence is correct: Fix it needs a flawed one. */
  sentenceIsCorrect?: boolean | null;
}): SpecialHand | null {
  if (!opts.enabled || opts.gameMode !== 'rounds') return null;
  if (opts.round <= 0 || !Number.isFinite(opts.totalRounds) || opts.totalRounds <= 0) return null;
  if (opts.round === opts.totalRounds) return 'finalTable';
  // Fix it comes before a second look on the same hand (it may still repeat that grammar point).
  if (fixItRoundFor(opts.totalRounds) === opts.round && (opts.questionType || 'binary') === 'binary' && opts.sentenceIsCorrect === false) return 'fixIt';
  if (opts.secondLookRound === opts.round) return 'secondLook';
  if (spotlightRoundFor(opts.totalRounds) === opts.round) return 'spotlight';
  if (listeningRoundFor(opts.totalRounds) === opts.round && (opts.questionType || 'binary') === 'binary') return 'listening';
  return null;
}

/** What a hand's wins are multiplied by: 1 on an ordinary hand. Losses never change. */
export function payoutMultiplierFor(hand: SpecialHand | null): number {
  return hand ? SPECIAL_HAND_INFO[hand].multiplier : 1;
}

export interface ClassCorrection {
  text: string;
  accepted: boolean;
  count: number;
}

/**
 * Fix it: the class's corrections, without names. Accepted ones first, the same correction counted
 * once, at most `max`.
 */
export function classCorrections(results: { userCorrection?: string; correctionFeedback?: string }[], max = 6): ClassCorrection[] {
  const byKey = new Map<string, ClassCorrection>();
  for (const r of results) {
    const text = (r.userCorrection || '').trim().replace(/\s+/g, ' ');
    if (!text) continue;
    const key = text.toLowerCase().replace(/[.!?]+$/, '');
    const accepted = /^accepted\b/i.test((r.correctionFeedback || '').trim());
    const prev = byKey.get(key);
    if (prev) {
      prev.count += 1;
      prev.accepted = prev.accepted || accepted;
    } else {
      byKey.set(key, { text, accepted, count: 1 });
    }
  }
  return [...byKey.values()]
    .sort((a, b) => Number(b.accepted) - Number(a.accepted) || b.count - a.count)
    .slice(0, max);
}

/** A win, scaled for the hand. Zero and losses stay as they are. */
export function scaleWin(amount: number, multiplier: number): number {
  return amount > 0 && multiplier !== 1 ? Math.round(amount * multiplier) : amount;
}
