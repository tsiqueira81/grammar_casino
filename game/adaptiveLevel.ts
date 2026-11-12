// Package L6: the level follows the class, opt-in. After every three hands, if the class got more
// than 85% right, the next hands step up one level; under 45%, they step down. Never silent: the
// teacher sees a notice, and the change applies from the next hand.
import type { RoundHistoryRecord } from '../types';

export const ADAPTIVE_LEVEL_KEY = 'grammar_casino_adaptive_level';
export const ADAPT_WINDOW = 3;
export const ADAPT_UP_ABOVE = 85;
export const ADAPT_DOWN_BELOW = 45;

export interface LevelChange {
  level: string;
  accuracy: number;
  direction: 'up' | 'down';
}

/**
 * The level for the next hands, or null to keep it. Only hands played since the last change count,
 * so the class gets three hands at a new level before it can move again.
 */
export function nextAdaptiveLevel(opts: {
  levels: readonly string[];
  current: string;
  history: Pick<RoundHistoryRecord, 'round' | 'playerResults'>[];
  lastChangeRound: number;
}): LevelChange | null {
  const recent = opts.history.filter((h) => h.round > opts.lastChangeRound).slice(-ADAPT_WINDOW);
  if (recent.length < ADAPT_WINDOW) return null;
  const results = recent.flatMap((h) => h.playerResults);
  if (results.length < ADAPT_WINDOW) return null;
  const accuracy = Math.round((results.filter((r) => r.isWin).length / results.length) * 100);
  const at = opts.levels.indexOf(opts.current);
  if (at < 0) return null;
  if (accuracy > ADAPT_UP_ABOVE && at < opts.levels.length - 1) return { level: opts.levels[at + 1], accuracy, direction: 'up' };
  if (accuracy < ADAPT_DOWN_BELOW && at > 0) return { level: opts.levels[at - 1], accuracy, direction: 'down' };
  return null;
}

/** The teacher's notice: "The class got 90% right in the last 3 hands, so the next hands are B2." */
export function levelChangeNotice(change: LevelChange): string {
  return `The class got ${change.accuracy}% right in the last ${ADAPT_WINDOW} hands, so the next hands are ${change.level}${change.direction === 'up' ? ' (one level up)' : ' (one level down)'}.`;
}
