// Last game's setup, remembered per browser (package T1), so the next class starts with the same
// level, topic, formats, deck, timer, money and game length already chosen. Only plain checked
// values are kept; anything unknown or broken is dropped and the usual default is used instead.
import type { CEFRLevel, GameMode, PowerUpKey, QuestionType, Settings } from '../types';

export const SETUP_PREFS_KEY = 'grammar_casino_prefs_v1';

export interface SetupPrefs {
  settings: Settings;
  customTopic: string;
  customTheme: string;
  gameMode: GameMode;
  totalRounds: number;
  targetAmount: number;
  startingCash: number;
  turnTimerSeconds: number;
  deck: PowerUpKey[];
}

export interface SetupPrefsRules {
  levels: readonly string[];
  questionTypes: readonly QuestionType[];
  powerUps: readonly string[];
  timerOptions: readonly number[];
  minTargetAmount: number;
}

const GAME_MODES: GameMode[] = ['lastPlayer', 'rounds', 'targetAmount'];
const MAX_TEXT = 200;

const text = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() && v.length <= MAX_TEXT ? v : undefined);
const whole = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : undefined;

/** The saved prefs, checked. Returns null when nothing usable is stored. */
export function parseSetupPrefs(raw: string | null, rules: SetupPrefsRules): Partial<SetupPrefs> | null {
  if (!raw) return null;
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const out: Partial<SetupPrefs> = {};

  const s = data.settings;
  if (s && typeof s === 'object') {
    const topic = text(s.topic);
    const theme = text(s.theme);
    const level = rules.levels.includes(s.level) ? (s.level as CEFRLevel) : undefined;
    if (topic && theme && level) {
      const format = s.challengeFormat === 'mixed' || rules.questionTypes.includes(s.challengeFormat) ? s.challengeFormat : 'binary';
      const mixed = Array.isArray(s.mixedFormats) ? (s.mixedFormats as unknown[]).filter((t): t is QuestionType => rules.questionTypes.includes(t as QuestionType)) : [];
      out.settings = { topic, level, theme, challengeFormat: format, mixedFormats: mixed.length ? mixed : [...rules.questionTypes] };
    }
  }
  if (typeof data.customTopic === 'string' && data.customTopic.length <= MAX_TEXT) out.customTopic = data.customTopic;
  if (typeof data.customTheme === 'string' && data.customTheme.length <= MAX_TEXT) out.customTheme = data.customTheme;
  if (GAME_MODES.includes(data.gameMode)) out.gameMode = data.gameMode;
  const rounds = whole(data.totalRounds, 1, 200);
  if (rounds !== undefined) out.totalRounds = rounds;
  const target = whole(data.targetAmount, rules.minTargetAmount, 10_000_000);
  if (target !== undefined) out.targetAmount = target;
  const cash = whole(data.startingCash, 1, 10_000_000);
  if (cash !== undefined) out.startingCash = cash;
  if (rules.timerOptions.includes(data.turnTimerSeconds)) out.turnTimerSeconds = data.turnTimerSeconds;
  if (Array.isArray(data.deck)) {
    const deck = [...new Set((data.deck as unknown[]).filter((k): k is PowerUpKey => rules.powerUps.includes(k as string)))];
    if (deck.length) out.deck = deck;
  }
  return Object.keys(out).length ? out : null;
}

export function serializeSetupPrefs(prefs: SetupPrefs): string {
  return JSON.stringify(prefs);
}
