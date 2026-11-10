import type { GameMode, Player } from '../types';

/**
 * When the game ends and who wins (package F5). Replaces the copies in handleNextRound,
 * handleEndGameEarly and the results screen.
 */

export interface GameEndInput {
  players: readonly Player[];
  gameMode: GameMode;
  currentRound: number;
  totalRounds: number | string;
  targetAmount: number | string;
  /** A live room (enables the House Bailout outside last-player-standing). */
  isRoom: boolean;
}

const toNumber = (v: number | string) => (typeof v === 'string' ? parseInt(v, 10) : v);

/** In a live room, bankrupt players get the House Bailout, except in last player standing. */
export function isBailoutEnabled(isRoom: boolean, gameMode: GameMode): boolean {
  return isRoom && gameMode !== 'lastPlayer';
}

export interface GameEndCheck {
  isGameOver: boolean;
  isRoundLimitReached: boolean;
  hasTargetWinner: boolean;
  /** Only one player still has money (the others are out for good). */
  isEliminationVictory: boolean;
  isAllBankrupt: boolean;
  bailoutEnabled: boolean;
}

/** Whether the game is over after the hand just played. */
export function checkGameEnd(input: GameEndInput): GameEndCheck {
  const solvent = input.players.filter((p) => p.money > 0);
  const bailoutEnabled = isBailoutEnabled(input.isRoom, input.gameMode);
  const isRoundLimitReached = input.gameMode === 'rounds' && input.currentRound >= toNumber(input.totalRounds);
  const target = toNumber(input.targetAmount);
  const hasTargetWinner = input.gameMode === 'targetAmount' && solvent.some((p) => p.money >= target);
  const isEliminationVictory = !bailoutEnabled && input.players.length > 1 && solvent.length <= 1;
  const isAllBankrupt = !bailoutEnabled && solvent.length === 0;
  return {
    isGameOver: isRoundLimitReached || hasTargetWinner || isEliminationVictory || isAllBankrupt,
    isRoundLimitReached,
    hasTargetWinner,
    isEliminationVictory,
    isAllBankrupt,
    bailoutEnabled,
  };
}

/** The richest player, or null on a tie for first place or an empty list. */
function richestOrTie(pool: readonly Player[]): Player | null {
  if (pool.length === 0) return null;
  const sorted = [...pool].sort((a, b) => b.money - a.money);
  if (sorted.length > 1 && sorted[1].money === sorted[0].money) return null;
  return sorted[0];
}

/** The richest player who reached the target, or null on a tie. */
function targetWinner(solvent: readonly Player[], target: number): Player | null {
  return richestOrTie(solvent.filter((p) => p.money >= target));
}

/** The winner when the game ends at the end of a hand. null means a tie or nobody. */
export function pickWinnerAtGameEnd(input: GameEndInput): Player | null {
  const solvent = input.players.filter((p) => p.money > 0);
  const target = toNumber(input.targetAmount);
  const { bailoutEnabled, isRoundLimitReached } = checkGameEnd(input);
  if (input.gameMode === 'targetAmount' && solvent.some((p) => p.money >= target)) {
    return targetWinner(solvent, target);
  }
  if (solvent.length === 1 && !bailoutEnabled) return solvent[0];
  const pool = solvent.length > 0 ? solvent : input.players;
  if (pool.length >= 1 && isRoundLimitReached) return richestOrTie(pool);
  return null;
}

/** The winner when the teacher ends the game early. null means a tie or nobody. */
export function pickWinnerWhenEndedEarly(input: Pick<GameEndInput, 'players' | 'gameMode' | 'targetAmount'>): Player | null {
  const solvent = input.players.filter((p) => p.money > 0);
  const target = toNumber(input.targetAmount);
  if (input.gameMode === 'targetAmount' && solvent.some((p) => p.money >= target)) {
    return targetWinner(solvent, target);
  }
  if (solvent.length === 1) return solvent[0];
  if (solvent.length > 1) return richestOrTie(solvent);
  return null;
}
