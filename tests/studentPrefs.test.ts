import { describe, expect, it } from 'vitest';
import { DEFAULT_STUDENT_PREFS, applyStudentPrefs, parseStudentPrefs } from '../utils/studentPrefs';

function fakeRoot() {
  const classes = new Set<string>();
  const style = new Map<string, string>();
  return {
    classes,
    style,
    el: {
      classList: { toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)) },
      style: { setProperty: (k: string, v: string) => style.set(k, v) },
    } as unknown as HTMLElement,
  };
}

describe('phone comfort settings (package S6)', () => {
  it('reads saved prefs and ignores anything odd', () => {
    expect(parseStudentPrefs(null)).toEqual(DEFAULT_STUDENT_PREFS);
    expect(parseStudentPrefs('not json')).toEqual(DEFAULT_STUDENT_PREFS);
    expect(parseStudentPrefs(JSON.stringify({ textSize: 'huge', plainFont: 'yes', lessMotion: true }))).toEqual({ textSize: 'normal', plainFont: false, lessMotion: true });
    expect(parseStudentPrefs(JSON.stringify({ textSize: 'larger', plainFont: true }))).toEqual({ textSize: 'larger', plainFont: true, lessMotion: false });
  });

  it('puts the prefs on the page', () => {
    const r = fakeRoot();
    applyStudentPrefs({ textSize: 'large', plainFont: true, lessMotion: true }, r.el);
    expect([...r.classes].sort()).toEqual(['gc-less-motion', 'gc-plain-font', 'gc-text-zoom']);
    expect(r.style.get('--gc-phone-zoom')).toBe('1.15');
    applyStudentPrefs(DEFAULT_STUDENT_PREFS, r.el);
    expect([...r.classes]).toEqual([]);
    expect(r.style.get('--gc-phone-zoom')).toBe('1');
  });
});
