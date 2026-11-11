// Package T7: the first-run coach. Four steps, shown once per computer, replayable from the lobby.

export const COACH_SEEN_KEY = 'grammar_casino_coach_seen_v1';

export const COACH_STEPS: { title: string; body: string }[] = [
  {
    title: 'Open a room',
    body: 'Press "Open a live room". The projector shows a QR code and a four-letter code. You can also play on one screen and pass the device around.',
  },
  {
    title: 'Students join',
    body: 'Each student scans the code, types a name and bets on their own phone. Everyone starts with the same money.',
  },
  {
    title: 'Deal and reveal',
    body: 'Deal a hand: everyone sees one sentence and bets on it. When the bets are in, reveal the answer. The explanation shows on every screen.',
  },
  {
    title: 'Read the report',
    body: 'At the end, the report shows what the class got right, which grammar points to review, and who said "Still confused".',
  },
];

/** Whether the coach opens by itself: the first visit on the setup screen, never on a phone or in tests. */
export function shouldShowCoach(opts: { seen: string | null; step: string; studentPhone: boolean; testMode: boolean; forced: boolean }): boolean {
  if (opts.forced) return true;
  if (opts.testMode || opts.studentPhone) return false;
  return opts.step === 'PLAYER_SETUP' && opts.seen !== 'seen';
}
