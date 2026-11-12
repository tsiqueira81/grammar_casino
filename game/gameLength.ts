// Package G7: game lengths. Named presets for the number of hands, a time estimate for the
// setup screen, and a notice near the end ("2 hands left", "Last hand").

export interface LengthPreset {
  hands: number;
  name: string;
  /** The timer the preset sets too (seconds), shown on its button. None: the timer is left as it is. */
  timerSeconds?: number;
}

export const LENGTH_PRESETS: LengthPreset[] = [
  { hands: 5, name: 'Warm-up', timerSeconds: 45 },
  { hands: 10, name: 'Review', timerSeconds: 60 },
  { hands: 15, name: 'Full table', timerSeconds: 60 },
  { hands: 20, name: 'Long' },
];

/** Seconds the reveal, the explanation and the payouts take, per hand. */
const REVEAL_SECONDS = 50;

/**
 * About how many minutes a game of `hands` hands takes. On one screen players bet in turn; in a
 * live room everyone bets at once on their phones.
 */
export function estimateMinutes(opts: { hands: number; players: number; timerSeconds: number; room: boolean }): number {
  const hands = Math.max(0, Math.floor(opts.hands) || 0);
  if (hands === 0) return 0;
  const players = Math.max(1, Math.floor(opts.players) || 1);
  const timer = Math.max(0, opts.timerSeconds || 0);
  const betting = opts.room
    ? timer > 0 ? timer * 0.8 : 40
    : players * (timer > 0 ? Math.min(timer * 0.6, 30) : 18);
  return Math.max(1, Math.round((hands * (betting + REVEAL_SECONDS)) / 60));
}

/** The notice for the last hands of a game with a set number of hands, or null. */
export function handsLeftNote(currentRound: number, totalRounds: number): string | null {
  if (!Number.isFinite(totalRounds) || totalRounds <= 0 || currentRound <= 0) return null;
  const left = totalRounds - currentRound;
  if (left === 0) return 'Last hand';
  if (left === 1) return '2 hands left';
  return null;
}

/**
 * The teacher's game clock: "Playing for 12 min", plus "about 8 min left" once a hand has been
 * played in a game with a set number of hands (the average hand so far times the hands left).
 */
export function gameClockText(opts: { elapsedMs: number; handsDone: number; handsLeft: number | null }): string {
  const minutes = Math.max(0, Math.floor(opts.elapsedMs / 60000));
  const playing = minutes < 1 ? 'Playing for under a minute' : `Playing for ${minutes} min`;
  if (opts.handsLeft === null || opts.handsLeft <= 0 || opts.handsDone <= 0) return playing;
  const left = Math.max(1, Math.round((opts.elapsedMs / opts.handsDone) * opts.handsLeft / 60000));
  return `${playing} · about ${left} min left`;
}
