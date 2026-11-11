// Phone vibrations (package S4), in one place. Android browsers vibrate; iOS Safari has no
// navigator.vibrate, so there the sound and animation carry the moment. A student can turn
// vibration off on their phone, and the teacher's Calm mode turns it off too.
import { safeLocalStorage } from './safeStorage';

export type HapticKind = 'lock' | 'tick' | 'win' | 'lose' | 'error';

export const HAPTICS_KEY = 'grammar_casino_haptics_v1';

const PATTERNS: Record<HapticKind, number | number[]> = {
  lock: 40,
  tick: 25,
  win: [80, 50, 120],
  lose: 180,
  error: [100, 50, 100],
};

export function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export function hapticsEnabled(): boolean {
  return safeLocalStorage.getItem(HAPTICS_KEY) !== 'off';
}

export function setHapticsEnabled(on: boolean): void {
  safeLocalStorage.setItem(HAPTICS_KEY, on ? 'on' : 'off');
}

export function hapticPattern(kind: HapticKind): number | number[] {
  return PATTERNS[kind];
}

export function haptic(kind: HapticKind): void {
  if (!canVibrate() || !hapticsEnabled()) return;
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('gc-calm-room')) return;
  try {
    navigator.vibrate(PATTERNS[kind]);
  } catch {
    // Some browsers refuse without a recent tap; nothing to do.
  }
}
