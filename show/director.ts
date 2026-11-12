// Package V5: a director for the reveal. One cue sheet says what happens when, across the sound
// and the table, so the beats of a reveal follow each other instead of all firing at once:
// the verdict sounds first, then the pot is swept to the winners, then the extras.

export type CueTrack = 'sound' | 'table';
export type CueName = 'potSweep' | 'bankrupt' | 'jackpot';

export interface Cue {
  /** Milliseconds after the reveal. */
  at: number;
  track: CueTrack;
  name: CueName;
}

export interface RevealOutcome {
  /** Someone at least doubled their stack this hand. */
  bigWin: boolean;
  /** Someone fell to $0 this hand. */
  bust: boolean;
  /** Calm mode or reduced motion: no waiting, the same beats at once. */
  calm: boolean;
}

/** When each beat lands, after the verdict (the stamp and the right/wrong sounds at 0 ms). */
export const REVEAL_BEATS = {
  potSweep: 450,
  jackpot: 1000,
  bankrupt: 1100,
} as const;

export function revealCueSheet(outcome: RevealOutcome): Cue[] {
  const at = (ms: number) => (outcome.calm ? 0 : ms);
  const cues: Cue[] = [
    { at: at(REVEAL_BEATS.potSweep), track: 'sound', name: 'potSweep' },
    { at: at(REVEAL_BEATS.potSweep), track: 'table', name: 'potSweep' },
  ];
  if (outcome.bigWin) cues.push({ at: at(REVEAL_BEATS.jackpot), track: 'table', name: 'jackpot' });
  if (outcome.bust) cues.push({ at: at(REVEAL_BEATS.bankrupt), track: 'sound', name: 'bankrupt' });
  return cues.sort((a, b) => a.at - b.at);
}

/**
 * Plays a cue sheet: each cue goes to its track's handler at its time. `schedule` is the caller's
 * timer (the App's `later`, which is cleared when the screen goes away); a cue at 0 ms runs now.
 */
export function playCues(
  cues: Cue[],
  handlers: Partial<Record<CueTrack, (name: CueName) => void>>,
  schedule: (fn: () => void, ms: number) => void,
): void {
  for (const cue of cues) {
    const run = () => handlers[cue.track]?.(cue.name);
    if (cue.at <= 0) run();
    else schedule(run, cue.at);
  }
}
