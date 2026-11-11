import { describe, expect, it } from 'vitest';
import { parseSetupPrefs, serializeSetupPrefs, type SetupPrefs } from '../game/setupPrefs';
import { ALL_QUESTION_TYPES, CEFR_LEVELS, MIN_TARGET_AMOUNT, POWER_UPS, TURN_TIMER_OPTIONS } from '../constants';

const rules = {
  levels: CEFR_LEVELS,
  questionTypes: ALL_QUESTION_TYPES,
  powerUps: Object.keys(POWER_UPS),
  timerOptions: TURN_TIMER_OPTIONS,
  minTargetAmount: MIN_TARGET_AMOUNT,
};

const good: SetupPrefs = {
  settings: { topic: 'Present perfect', level: CEFR_LEVELS[3], theme: 'Space', challengeFormat: 'mixed', mixedFormats: ['binary', 'multipleChoice'] },
  customTopic: '',
  customTheme: '',
  gameMode: 'targetAmount',
  totalRounds: 12,
  targetAmount: 5000,
  startingCash: 1500,
  turnTimerSeconds: 60,
  deck: ['JACKPOT', 'SHIELD'],
};

describe('setup prefs (package T1)', () => {
  it('round-trips a full setup', () => {
    expect(parseSetupPrefs(serializeSetupPrefs(good), rules)).toEqual(good);
  });

  it('returns null for nothing, junk or an empty object', () => {
    expect(parseSetupPrefs(null, rules)).toBeNull();
    expect(parseSetupPrefs('{oops', rules)).toBeNull();
    expect(parseSetupPrefs('[]', rules)).toBeNull();
    expect(parseSetupPrefs('{}', rules)).toBeNull();
  });

  it('drops values that are unknown or out of range, keeping the rest', () => {
    const raw = JSON.stringify({
      ...good,
      settings: { ...good.settings, level: 'Z9' },
      gameMode: 'battleRoyale',
      totalRounds: -3,
      targetAmount: 10,
      startingCash: 1.5,
      turnTimerSeconds: 17,
      deck: ['JACKPOT', 'NOT_A_CARD', 'JACKPOT'],
    });
    expect(parseSetupPrefs(raw, rules)).toEqual({ customTopic: '', customTheme: '', deck: ['JACKPOT'] });
  });

  it('falls back to binary and all formats when the format list is broken', () => {
    const raw = JSON.stringify({ settings: { topic: 'T', level: CEFR_LEVELS[0], theme: 'X', challengeFormat: 'riddle', mixedFormats: ['riddle'] } });
    expect(parseSetupPrefs(raw, rules)?.settings).toEqual({ topic: 'T', level: CEFR_LEVELS[0], theme: 'X', challengeFormat: 'binary', mixedFormats: [...ALL_QUESTION_TYPES] });
  });
});
