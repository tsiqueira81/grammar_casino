// Package S6: comfort settings on each student's phone. They are kept on that phone only
// (grammar_casino_student_prefs_v1) and change nothing in the game.
import { safeLocalStorage } from './safeStorage';

export type TextSize = 'normal' | 'large' | 'larger';

export interface StudentPrefs {
  textSize: TextSize;
  /** The sentence in the plain font instead of the decorative serif. */
  plainFont: boolean;
  /** No animations on this phone, whatever the teacher chose. */
  lessMotion: boolean;
}

export const STUDENT_PREFS_KEY = 'grammar_casino_student_prefs_v1';
export const DEFAULT_STUDENT_PREFS: StudentPrefs = { textSize: 'normal', plainFont: false, lessMotion: false };
export const TEXT_SIZES: { id: TextSize; label: string; zoom: number }[] = [
  { id: 'normal', label: 'Normal', zoom: 1 },
  { id: 'large', label: 'Large', zoom: 1.15 },
  { id: 'larger', label: 'Larger', zoom: 1.3 },
];

export function parseStudentPrefs(raw: string | null): StudentPrefs {
  if (!raw) return { ...DEFAULT_STUDENT_PREFS };
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return { ...DEFAULT_STUDENT_PREFS };
    return {
      textSize: TEXT_SIZES.some((t) => t.id === data.textSize) ? data.textSize : 'normal',
      plainFont: data.plainFont === true,
      lessMotion: data.lessMotion === true,
    };
  } catch {
    return { ...DEFAULT_STUDENT_PREFS };
  }
}

export function readStudentPrefs(): StudentPrefs {
  return parseStudentPrefs(safeLocalStorage.getItem(STUDENT_PREFS_KEY));
}

export function saveStudentPrefs(prefs: StudentPrefs): void {
  safeLocalStorage.setItem(STUDENT_PREFS_KEY, JSON.stringify(prefs));
}

/** Puts the prefs on the page: html classes for the font and motion, a zoom for the text size. */
export function applyStudentPrefs(prefs: StudentPrefs, root: HTMLElement = document.documentElement): void {
  root.classList.toggle('gc-plain-font', prefs.plainFont);
  root.classList.toggle('gc-less-motion', prefs.lessMotion);
  const zoom = TEXT_SIZES.find((t) => t.id === prefs.textSize)?.zoom ?? 1;
  root.style.setProperty('--gc-phone-zoom', String(zoom));
  root.classList.toggle('gc-text-zoom', zoom !== 1);
}
