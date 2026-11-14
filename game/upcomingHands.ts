// The hands still to come, so a batch of sentences made ahead fits them (2026-11-14): each hand's
// theme (it changes every hand with Random theme) and question type (they take turns in a mixed game).
import type { QuestionType, Settings } from '../types';
import { getEffectiveMixedFormats } from '../constants';
import { settingsForRound } from './randomTheme';

export interface UpcomingHand {
  theme: string;
  questionType: QuestionType;
}

/** In games without a set number of hands, plan this many ahead. */
export const OPEN_GAME_LOOKAHEAD = 15;

/**
 * Hands `fromRound`, `fromRound + 1`, ... up to `lastRound` (or 15 hands when the game has no set
 * length). `nextFormatIndex` is where a mixed game's rotation stands for `fromRound`.
 */
export function upcomingHands(settings: Settings, fromRound: number, nextFormatIndex: number, lastRound: number | null): UpcomingHand[] {
  const count = Math.max(0, Math.min(30, lastRound === null ? OPEN_GAME_LOOKAHEAD : lastRound - fromRound + 1));
  const format = settings.challengeFormat || 'binary';
  const rotation = getEffectiveMixedFormats(settings.mixedFormats);
  const out: UpcomingHand[] = [];
  for (let j = 0; j < count; j++) {
    const round = fromRound + j;
    const questionType: QuestionType = format === 'mixed' ? rotation[(nextFormatIndex + j) % rotation.length] : (format as QuestionType);
    out.push({ theme: settingsForRound(settings, round).theme, questionType });
  }
  return out;
}
