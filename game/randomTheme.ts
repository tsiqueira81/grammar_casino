// Random theme: the teacher picks "Random 🎲" instead of one theme, and every hand gets a different
// one. The order comes from a seed kept in the settings (`themeSeed`), so the hand that is fetched
// ahead of time and the hand that is dealt always agree on the theme.
//   - Only the named themes are used, never "My own theme".
//   - Every theme comes up once before any comes back.
//   - No theme is dealt twice in a row.
import { THEMES } from '../constants';
import type { Settings } from '../types';

/** The choice on the setup screen and in the between-hands settings. */
export const RANDOM_THEME = 'Random 🎲';

/** The themes Random draws from: every named theme, not the teacher's own. */
export const RANDOM_THEME_POOL: readonly string[] = THEMES.filter((t) => !t.startsWith('Custom'));

/** A new seed for a game's theme order. */
export function newThemeSeed(random: () => number = Math.random): number {
  return Math.floor(random() * 0x7fffffff) + 1;
}

/** Is Random chosen (on the setup screen), or running (in a game)? */
export function isRandomTheme(settings: Pick<Settings, 'theme' | 'themeSeed'> | null | undefined): boolean {
  return Boolean(settings) && (settings!.theme === RANDOM_THEME || typeof settings!.themeSeed === 'number');
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The pool in a shuffled order for one pass through it. */
function passOrder(seed: number, pass: number, pool: readonly string[]): string[] {
  const rand = mulberry32((seed >>> 0) + Math.imul(pass + 1, 0x9e3779b1));
  const order = [...pool];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** The theme of hand `round` (1 = the first hand) in a game with this seed. */
export function randomThemeFor(seed: number, round: number, pool: readonly string[] = RANDOM_THEME_POOL): string {
  if (pool.length === 0) return RANDOM_THEME;
  if (pool.length === 1) return pool[0];
  const index = Math.max(0, Math.floor(round) - 1);
  if (pool.length === 2) return pool[(index + (seed >>> 0)) % 2];
  const pass = Math.floor(index / pool.length);
  const order = passOrder(seed, pass, pool);
  if (pass > 0) {
    // A new pass must not open with the theme the last one closed on. (Swapping the first two
    // never changes a pass's last theme, since a pass has three or more.)
    const previous = passOrder(seed, pass - 1, pool);
    if (order[0] === previous[previous.length - 1]) [order[0], order[1]] = [order[1], order[0]];
  }
  return order[index % pool.length];
}

/**
 * The settings a hand is really dealt with: when Random is on, `theme` becomes that hand's theme
 * and the seed stays. Any other settings come back unchanged.
 */
export function settingsForRound(settings: Settings, round: number): Settings {
  if (!isRandomTheme(settings)) return settings;
  const themeSeed = typeof settings.themeSeed === 'number' ? settings.themeSeed : newThemeSeed();
  return { ...settings, themeSeed, theme: randomThemeFor(themeSeed, round) };
}

/** Settings with one fixed theme: Random is switched off. */
export function withFixedTheme(settings: Settings, theme: string): Settings {
  const { themeSeed: _seed, ...rest } = settings;
  return { ...rest, theme };
}

/** Settings with Random switched on (keeps a running order, or starts a new one). */
export function withRandomTheme(settings: Settings, seed?: number): Settings {
  return { ...settings, theme: RANDOM_THEME, themeSeed: seed ?? settings.themeSeed ?? newThemeSeed() };
}

/** The theme as shown during a hand: "🎲 Sci-Fi 🚀" while Random is running. */
export function themeLabel(settings: Pick<Settings, 'theme' | 'themeSeed'>): string {
  if (!isRandomTheme(settings) || settings.theme === RANDOM_THEME) return settings.theme;
  return `🎲 ${settings.theme}`;
}

/**
 * The "Next: …" note beside the theme when the teacher changed it for the next hand, or null.
 * Random moving on to its next theme is not a change, so it gets no note.
 */
export function nextThemeNote(settings: Settings, next: Settings | null | undefined): string | null {
  if (!next) return null;
  if (isRandomTheme(next)) return isRandomTheme(settings) ? null : RANDOM_THEME;
  return next.theme !== settings.theme || isRandomTheme(settings) ? next.theme : null;
}

/** The theme the next hand will be dealt with, as shown on the results screen. */
export function nextHandThemeLabel(settings: Settings, next: Settings | null | undefined, nextRound: number): string {
  const base = next || settings;
  return isRandomTheme(base) && typeof base.themeSeed === 'number' ? themeLabel(settingsForRound(base, nextRound)) : base.theme;
}
