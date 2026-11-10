import type { Bet, QuestionType } from '../types';

/**
 * Is a bet ready? (package F5). One checker for the host's reveal gate, the "has bet" seat
 * markers, the phone view builder and the phone's own lock-in check, which used to be four
 * hand-copied versions.
 */

/** Why a bet is not ready yet, or null when it is. */
export type BetProblem = 'amount' | 'answer' | 'unchangedBaseWord' | 'invalidKeyWord' | null;

export interface BetCheckOptions {
  /** A stake of $0 does not count (the host's "has placed a bet" marker). Default: $0 counts. */
  requirePositiveAmount?: boolean;
  /**
   * With Split Bet on word formation, an unchanged base word in *either* candidate makes the bet
   * not ready (the host screens). Default: the bet is ready if either candidate is a real
   * answer (the phone view builder and the phone).
   */
  strictSplitBaseWord?: boolean;
  /** Only 'correct' or 'incorrect' counts as an opinion (the host's marker). Default: any value. */
  strictOpinion?: boolean;
}

/** A key word transformation answer: 2 to 6 words that include the key word unchanged. */
export function isValidKeyWordTransformationPhrase(phrase: string | undefined, baseWord?: string): boolean {
  const trimmed = (phrase || '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return false;
  const words = trimmed.split(' ').filter(Boolean);
  if (words.length < 2 || words.length > 6) return false;
  const key = (baseWord || '').trim().toLowerCase();
  if (!key) return true;
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const keyRegex = new RegExp(`(^|[^a-zA-Z])${escapedKey}([^a-zA-Z]|$)`, 'i');
  return keyRegex.test(trimmed);
}

export function checkBet(
  bet: Bet | undefined,
  questionType: QuestionType,
  hasSplitBet: boolean,
  baseWord: string | undefined,
  options: BetCheckOptions = {}
): BetProblem {
  if (!bet) return 'amount';
  const amount = bet.bet;
  const amountOk =
    typeof amount === 'number' && !isNaN(amount) && (options.requirePositiveAmount ? amount > 0 : amount >= 0);
  if (!amountOk) return 'amount';

  if (questionType === 'multipleChoice') {
    const ok = hasSplitBet ? (bet.splitOptions?.length ?? 0) >= 1 : Boolean(bet.selectedOption?.trim());
    return ok ? null : 'answer';
  }

  if (questionType === 'keyWordTransformation') {
    if (hasSplitBet) {
      const w1 = (bet.splitClozeAnswers?.[0] || '').trim();
      const w2 = (bet.splitClozeAnswers?.[1] || '').trim();
      if (!w1 && !w2) return 'answer';
      if (w1 && !isValidKeyWordTransformationPhrase(w1, baseWord)) return 'invalidKeyWord';
      if (w2 && !isValidKeyWordTransformationPhrase(w2, baseWord)) return 'invalidKeyWord';
      return null;
    }
    if (!(bet.clozeAnswer || '').trim()) return 'answer';
    return isValidKeyWordTransformationPhrase(bet.clozeAnswer, baseWord) ? null : 'invalidKeyWord';
  }

  if (questionType === 'openCloze' || questionType === 'wordFormation') {
    const base = questionType === 'wordFormation' ? (baseWord || '').trim().toLowerCase() : '';
    const norm = (w?: string) => (w || '').trim().toLowerCase();
    const isUnchanged = (w: string) => Boolean(base) && w === base;
    if (hasSplitBet) {
      const w1 = norm(bet.splitClozeAnswers?.[0]);
      const w2 = norm(bet.splitClozeAnswers?.[1]);
      if (options.strictSplitBaseWord) {
        if ((w1 && isUnchanged(w1)) || (w2 && isUnchanged(w2))) return 'unchangedBaseWord';
        return w1 || w2 ? null : 'answer';
      }
      const real = (w: string) => Boolean(w) && !isUnchanged(w);
      if (real(w1) || real(w2)) return null;
      return isUnchanged(w1) || isUnchanged(w2) ? 'unchangedBaseWord' : 'answer';
    }
    const w = norm(bet.clozeAnswer);
    if (!w) return 'answer';
    return isUnchanged(w) ? 'unchangedBaseWord' : null;
  }

  // Valid or flawed: Split Bet sets its own split, so any amount will do.
  if (hasSplitBet) return null;
  if (options.strictOpinion) {
    return bet.opinion === 'correct' || bet.opinion === 'incorrect' ? null : 'answer';
  }
  return bet.opinion ? null : 'answer';
}

export function isBetComplete(
  bet: Bet | undefined,
  questionType: QuestionType,
  hasSplitBet: boolean,
  baseWord?: string,
  options?: BetCheckOptions
): boolean {
  return checkBet(bet, questionType, hasSplitBet, baseWord, options) === null;
}
