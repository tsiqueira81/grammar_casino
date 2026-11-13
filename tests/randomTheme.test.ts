import { describe, expect, it } from 'vitest';
import { THEMES } from '../constants';
import type { Settings } from '../types';
import {
  RANDOM_THEME,
  RANDOM_THEME_POOL,
  isRandomTheme,
  newThemeSeed,
  nextHandThemeLabel,
  nextThemeNote,
  randomThemeFor,
  settingsForRound,
  themeLabel,
  withFixedTheme,
  withRandomTheme,
} from '../game/randomTheme';
import { parseSetupPrefs } from '../game/setupPrefs';
import { lookForTheme, CLASSIC_LOOK } from '../show/looks';

const base: Settings = { topic: 'Tenses', level: 'B1', theme: 'Fantasy 🐉', challengeFormat: 'binary' };
const seeds = [1, 2, 7, 42, 1234567, 0x7ffffffe];

describe('Random theme: a different theme every hand', () => {
  it('draws from every named theme and never from "My own theme"', () => {
    expect(RANDOM_THEME_POOL).toHaveLength(THEMES.length - 1);
    expect(RANDOM_THEME_POOL).not.toContain('Custom ✍️');
    expect(RANDOM_THEME_POOL).not.toContain(RANDOM_THEME);
    for (const seed of seeds) {
      for (let round = 1; round <= 40; round++) expect(RANDOM_THEME_POOL).toContain(randomThemeFor(seed, round));
    }
  });

  it('the theme switches after each hand: no theme is dealt twice in a row', () => {
    for (let seed = 1; seed <= 300; seed++) {
      for (let round = 1; round < 60; round++) {
        expect(randomThemeFor(seed, round + 1), `seed ${seed}, hand ${round + 1}`).not.toBe(randomThemeFor(seed, round));
      }
    }
  });

  it('every theme comes up once before any theme comes back', () => {
    const n = RANDOM_THEME_POOL.length;
    for (const seed of seeds) {
      for (let pass = 0; pass < 4; pass++) {
        const dealt = Array.from({ length: n }, (_, i) => randomThemeFor(seed, pass * n + i + 1));
        expect(new Set(dealt).size).toBe(n);
      }
    }
  });

  it('a game keeps its order (the hand fetched ahead and the hand dealt agree), and games differ', () => {
    for (const seed of seeds) {
      for (let round = 1; round <= 20; round++) expect(randomThemeFor(seed, round)).toBe(randomThemeFor(seed, round));
    }
    const orders = new Set(Array.from({ length: 50 }, (_, i) => Array.from({ length: 7 }, (_, r) => randomThemeFor(i + 1, r + 1)).join('|')));
    expect(orders.size).toBeGreaterThan(25);
    const firsts = new Set(Array.from({ length: 200 }, (_, i) => randomThemeFor(i + 1, 1)));
    expect(firsts.size).toBe(RANDOM_THEME_POOL.length);
  });

  it('new seeds are whole positive numbers', () => {
    expect(newThemeSeed(() => 0)).toBe(1);
    expect(Number.isInteger(newThemeSeed())).toBe(true);
    expect(newThemeSeed(() => 0.999999)).toBeGreaterThan(1);
  });

  it('with Random on, each hand is dealt with its own real theme, never the word "Random"', () => {
    const chosen = withRandomTheme(base, 42);
    expect(chosen.theme).toBe(RANDOM_THEME);
    expect(isRandomTheme(chosen)).toBe(true);
    const hand1 = settingsForRound(chosen, 1);
    const hand2 = settingsForRound(hand1, 2);
    expect(hand1.theme).toBe(randomThemeFor(42, 1));
    expect(hand2.theme).toBe(randomThemeFor(42, 2));
    expect(hand2.theme).not.toBe(hand1.theme);
    expect(hand1.themeSeed).toBe(42);
    expect(isRandomTheme(hand2)).toBe(true);
    // Random chosen from saved setup, before a seed exists: still a real theme.
    expect(RANDOM_THEME_POOL).toContain(settingsForRound({ ...base, theme: RANDOM_THEME }, 1).theme);
    // The rest of the settings is untouched.
    expect(hand2).toMatchObject({ topic: 'Tenses', level: 'B1', challengeFormat: 'binary' });
  });

  it('with one fixed theme, nothing changes from hand to hand', () => {
    expect(settingsForRound(base, 5)).toBe(base);
    expect(isRandomTheme(base)).toBe(false);
    expect(isRandomTheme(null)).toBe(false);
  });

  it('choosing a theme switches Random off; choosing Random again keeps the game\'s order', () => {
    const running = settingsForRound(withRandomTheme(base, 9), 3);
    const fixed = withFixedTheme(running, 'Business 💼');
    expect(fixed.theme).toBe('Business 💼');
    expect('themeSeed' in fixed).toBe(false);
    expect(settingsForRound(fixed, 4).theme).toBe('Business 💼');
    expect(withRandomTheme(running).themeSeed).toBe(9);
    expect(withRandomTheme(running, 77).themeSeed).toBe(77);
    expect(typeof withRandomTheme(base).themeSeed).toBe('number');
  });

  it('labels: a dice beside the hand\'s theme, and a "Next" note only when the teacher changed it', () => {
    const running = settingsForRound(withRandomTheme(base, 5), 2);
    expect(themeLabel(running)).toBe(`🎲 ${randomThemeFor(5, 2)}`);
    expect(themeLabel(base)).toBe('Fantasy 🐉');
    expect(themeLabel(withRandomTheme(base, 5))).toBe(RANDOM_THEME);
    expect(nextThemeNote(base, null)).toBeNull();
    expect(nextThemeNote(base, { ...base })).toBeNull();
    expect(nextThemeNote(base, { ...base, theme: 'History 🏛️' })).toBe('History 🏛️');
    expect(nextThemeNote(base, withRandomTheme(base, 5))).toBe(RANDOM_THEME);
    expect(nextThemeNote(running, { ...running, level: 'B2' })).toBeNull();
    expect(nextThemeNote(running, withFixedTheme(running, running.theme))).toBe(running.theme);
    expect(nextHandThemeLabel(running, null, 3)).toBe(`🎲 ${randomThemeFor(5, 3)}`);
    expect(nextHandThemeLabel(base, null, 3)).toBe('Fantasy 🐉');
    expect(nextHandThemeLabel(base, { ...base, theme: 'History 🏛️' }, 3)).toBe('History 🏛️');
  });

  it('is remembered as the setup choice for the next class', () => {
    const rules = { levels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'], questionTypes: ['binary' as const], powerUps: [], timerOptions: [0, 60], minTargetAmount: 1500 };
    const prefs = parseSetupPrefs(JSON.stringify({ settings: { topic: 'Tenses', level: 'B1', theme: RANDOM_THEME, themeSeed: 5 } }), rules);
    expect(prefs?.settings?.theme).toBe(RANDOM_THEME);
    // The old game's order is not kept: a new class gets a new one.
    expect(prefs?.settings && 'themeSeed' in prefs.settings).toBe(false);
    expect(isRandomTheme(prefs?.settings)).toBe(true);
  });

  it('the setup choice itself has the classic look; each hand takes its own theme\'s look', () => {
    expect(lookForTheme(RANDOM_THEME)).toBe(CLASSIC_LOOK);
    expect(lookForTheme(randomThemeFor(3, 1))).not.toBe(CLASSIC_LOOK);
  });
});
