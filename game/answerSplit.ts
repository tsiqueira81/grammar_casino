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
  /**
   * After the reveal only: add the right answer with 0 when nobody picked it. Never before the
   * reveal, or the phones' room split would give the answer away.
   */
  showUnpickedRight?: boolean;
  /** The right answer for that row (not needed for valid-or-flawed). */
  correctAnswer?: string;
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

interface Pick {
  key: string;
  label: string;
  isRight: boolean;
}

/** One player's distinct picks, each with its label and whether it is right. */
function playerPicks(input: AnswerSplitInput, bet: Bet): Pick[] {
  const seen = new Set<string>();
  const out: Pick[] = [];
  picksOf(input.qType, bet).forEach((raw) => {
    const key = input.qType === 'binary' ? raw : normalizeGapAnswer(raw);
    if (!key || seen.has(key)) return;
    seen.add(key);
    if (input.qType === 'binary') {
      out.push({ key, label: raw === 'correct' ? 'Valid' : 'Flawed', isRight: (raw === 'correct') === Boolean(input.sentenceIsCorrect) });
    } else if (isOptionType(input.qType)) {
      out.push({ key, label: optionLabel(input.options, key, raw), isRight: input.isRightAnswer(raw) });
    } else {
      out.push({ key, label: raw.trim().replace(/\s+/g, ' '), isRight: input.isRightAnswer(raw) });
    }
  });
  return out;
}

function optionLabel(options: string[] | undefined, key: string, raw: string): string {
  const idx = (options || []).findIndex((o) => normalizeGapAnswer(o) === key);
  return idx >= 0 && LETTERS[idx] ? `${LETTERS[idx]}: ${raw.trim()}` : raw.trim();
}

/** The right answer's row label, for showing it with 0 when nobody picked it. */
function rightAnswerRow(input: AnswerSplitInput): AnswerSplitRow | null {
  if (input.qType === 'binary') {
    if (input.sentenceIsCorrect === undefined) return null;
    return { label: input.sentenceIsCorrect ? 'Valid' : 'Flawed', count: 0, isRight: true };
  }
  const raw = (input.correctAnswer || '').trim();
  if (!raw) return null;
  const label = isOptionType(input.qType) ? optionLabel(input.options, normalizeGapAnswer(raw), raw) : raw.replace(/\s+/g, ' ');
  return { label, count: 0, isRight: true };
}

/**
 * Answers with how many players gave them, most popular first. When nobody gave a right answer,
 * the right answer is added at the end with 0, so the class always sees it.
 */
export function answerSplit(input: AnswerSplitInput): AnswerSplitRow[] {
  const rows = new Map<string, AnswerSplitRow>();
  input.playerIds.forEach((id) => {
    const bet = input.bets[id];
    if (!bet) return;
    playerPicks(input, bet).forEach(({ key, label, isRight }) => {
      const cur = rows.get(key);
      rows.set(key, { label: cur?.label ?? label, count: (cur?.count ?? 0) + 1, isRight: cur?.isRight ?? isRight });
    });
  });
  const sorted = [...rows.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  if (input.showUnpickedRight && sorted.length > 0 && !sorted.some((r) => r.isRight)) {
    const right = rightAnswerRow(input);
    if (right) sorted.push(right);
  }
  return sorted;
}

/** How many players answered, and how many of them had a right answer (a split bet counts if either pick is right). */
export function rightWrongCounts(input: AnswerSplitInput): { right: number; answered: number } {
  let right = 0;
  let answered = 0;
  input.playerIds.forEach((id) => {
    const bet = input.bets[id];
    if (!bet) return;
    const picks = playerPicks(input, bet);
    if (picks.length === 0) return;
    answered += 1;
    if (picks.some((p) => p.isRight)) right += 1;
  });
  return { right, answered };
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
