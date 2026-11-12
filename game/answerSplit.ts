// What the class answered this hand (package L5), for the projector after the reveal, so the
// teacher sees the popular wrong answer. A split bet counts each of its two picks.
import type { Bet, QuestionType } from '../types';
import { normalizeGapAnswer } from '../utils/roundSettlement';
import { isOptionType } from './questionTypes';

export interface AnswerSplitRow {
  label: string;
  count: number;
  isRight: boolean;
}

export interface AnswerSplitInput {
  qType: QuestionType;
  bets: Record<number, Bet | undefined>;
  playerIds: number[];
  /** Was the sentence valid (valid-or-flawed hands only)? */
  sentenceIsCorrect?: boolean;
  options?: string[];
  /** Is this typed or chosen answer right? */
  isRightAnswer: (answer: string) => boolean;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function picksOf(qType: QuestionType, bet: Bet): string[] {
  if (qType === 'binary') return bet.opinion ? [bet.opinion] : [];
  if (isOptionType(qType)) {
    const split = (bet.splitOptions || []).filter(Boolean);
    return split.length ? split : bet.selectedOption ? [bet.selectedOption] : [];
  }
  const split = (bet.splitClozeAnswers || []).filter(Boolean) as string[];
  return split.length ? split : bet.clozeAnswer ? [bet.clozeAnswer] : [];
}

/** Answers with how many players gave them, most popular first. */
export function answerSplit(input: AnswerSplitInput): AnswerSplitRow[] {
  const rows = new Map<string, AnswerSplitRow>();
  input.playerIds.forEach((id) => {
    const bet = input.bets[id];
    if (!bet) return;
    const seen = new Set<string>();
    picksOf(input.qType, bet).forEach((raw) => {
      const key = input.qType === 'binary' ? raw : normalizeGapAnswer(raw);
      if (!key || seen.has(key)) return;
      seen.add(key);
      let label: string;
      let isRight: boolean;
      if (input.qType === 'binary') {
        label = raw === 'correct' ? 'Valid' : 'Flawed';
        isRight = (raw === 'correct') === Boolean(input.sentenceIsCorrect);
      } else if (isOptionType(input.qType)) {
        const idx = (input.options || []).findIndex((o) => normalizeGapAnswer(o) === key);
        label = idx >= 0 && LETTERS[idx] ? `${LETTERS[idx]}: ${raw.trim()}` : raw.trim();
        isRight = input.isRightAnswer(raw);
      } else {
        label = raw.trim().replace(/\s+/g, ' ');
        isRight = input.isRightAnswer(raw);
      }
      const cur = rows.get(key);
      rows.set(key, { label: cur?.label ?? label, count: (cur?.count ?? 0) + 1, isRight: cur?.isRight ?? isRight });
    });
  });
  return [...rows.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/**
 * Package S4: the room's split for the phones once bets close, before the reveal: "62% Valid ·
 * 38% Flawed". Only for picked answers (Valid or flawed, and the A to D types), never typed words,
 * and nothing about which answer is right.
 */
export function roomSplitLine(qType: QuestionType, rows: AnswerSplitRow[], max = 3): string | null {
  if (qType !== 'binary' && !isOptionType(qType)) return null;
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  if (total < 2) return null;
  return rows
    .slice(0, max)
    .map((r) => `${Math.round((r.count / total) * 100)}% ${r.label}`)
    .join(' · ');
}

// --- "Got it" / "Still confused" from the phones ---

export type HandReaction = 'gotIt' | 'confused';
export type HandReactions = Record<number, Record<number, HandReaction>>;

export function recordReaction(state: HandReactions, round: number, playerId: number, value: HandReaction): HandReactions {
  if (state[round]?.[playerId] === value) return state;
  return { ...state, [round]: { ...(state[round] || {}), [playerId]: value } };
}

export function reactionCounts(state: HandReactions, round: number): { gotIt: number; confused: number } {
  const values = Object.values(state[round] || {});
  return { gotIt: values.filter((v) => v === 'gotIt').length, confused: values.filter((v) => v === 'confused').length };
}
