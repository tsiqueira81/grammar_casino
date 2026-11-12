// Package S8: what screen readers hear when the game changes phase.

export interface PhaseInfo {
  step: string;
  round: number;
  totalRounds?: number | null;
  paused?: boolean;
  winnerName?: string | null;
}

export function phaseAnnouncement(p: PhaseInfo): string {
  if (p.paused) return 'The game is paused.';
  const of = p.totalRounds && p.totalRounds > 0 ? ` of ${p.totalRounds}` : '';
  switch (p.step) {
    case 'IN_GAME':
      return `Hand ${p.round}${of} is dealt. Place your bets.`;
    case 'RESULTS':
      return `Hand ${p.round}: the answer is in.`;
    case 'GAME_OVER':
      return p.winnerName ? `Game over. ${p.winnerName} wins.` : 'Game over.';
    default:
      return '';
  }
}
