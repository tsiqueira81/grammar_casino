import type { ActivePowerUp, Bet, QuestionType } from '../types';
import { isBetComplete } from './betValidity';

/**
 * May the teacher reveal the answer yet, and who is still betting? (package F5)
 * Replaces the copies in the betting screen and revealResultsCore.
 */

export type RevealMode = 'room' | 'turnTimer' | 'free';

export interface RevealGateInput {
  /** Players who can still act this hand: solvent and not frozen, in table order. */
  playerIds: readonly number[];
  bets: Record<number, Bet | undefined>;
  activePowerUps: Record<number, ActivePowerUp[] | undefined>;
  questionType: QuestionType;
  baseWord?: string;
  mode: RevealMode;
  /** Live room seats (room mode). A player without a seat counts by their bet alone. */
  seats?: Record<number, { lockedIn: boolean } | undefined>;
  /** Turn timers (turn-timer mode). */
  turnTimers?: Record<number, { status: string } | undefined>;
  teacherOverride: boolean;
}

export interface RevealGate {
  canReveal: boolean;
  /** Players counted as in for this mode: locked in (room, timers) or with a placed bet (free play). */
  readyCount: number;
  /** Everyone counted as in. */
  everyoneIn: boolean;
  /** Who is not in yet for this mode, in table order. */
  waitingOn: number[];
  /** Every player's bet is complete (host rules). */
  allBetsValid: boolean;
  /** Room count: seated phones that locked in, plus unseated players with a complete bet. */
  roomLockedCount: number;
  allRoomLocked: boolean;
  timerLockedCount: number;
  /** Every turn timer is locked (true for an empty table). */
  allTimersLocked: boolean;
  placedBetCount: number;
}

const hasSplit = (input: Pick<RevealGateInput, 'activePowerUps'>, id: number) =>
  (input.activePowerUps[id] || []).some((pu) => pu.type === 'SPLIT_BET');

export function getRevealGate(input: RevealGateInput): RevealGate {
  const { playerIds, bets, questionType, baseWord, mode } = input;
  const allBetsValid = playerIds.every((id) =>
    isBetComplete(bets[id], questionType, hasSplit(input, id), baseWord, { strictSplitBaseWord: true })
  );

  const isTimerLocked = (id: number) => input.turnTimers?.[id]?.status === 'locked';
  const isRoomLocked = (id: number) => {
    const seat = input.seats?.[id];
    if (seat) return seat.lockedIn;
    return isBetComplete(bets[id], questionType, hasSplit(input, id), baseWord);
  };
  const hasPlacedBet = (id: number) =>
    isBetComplete(bets[id], questionType, hasSplit(input, id), baseWord, {
      requirePositiveAmount: true,
      strictSplitBaseWord: true,
      strictOpinion: true,
    });

  const roomLockedCount = playerIds.filter(isRoomLocked).length;
  const allRoomLocked = playerIds.length > 0 && roomLockedCount === playerIds.length;
  const timerLockedCount = playerIds.filter(isTimerLocked).length;
  const allTimersLocked = timerLockedCount === playerIds.length;
  const placedBetCount = playerIds.filter(hasPlacedBet).length;

  const isReady = mode === 'room' ? isRoomLocked : mode === 'turnTimer' ? isTimerLocked : hasPlacedBet;
  const waitingOn = playerIds.filter((id) => !isReady(id));
  const readyCount = playerIds.length - waitingOn.length;
  const everyoneIn = playerIds.length > 0 && readyCount === playerIds.length;

  const canReveal =
    mode === 'room'
      ? allRoomLocked || allBetsValid || input.teacherOverride
      : mode === 'turnTimer'
        ? allTimersLocked || input.teacherOverride
        : allBetsValid || input.teacherOverride;

  return {
    canReveal,
    readyCount,
    everyoneIn,
    waitingOn,
    allBetsValid,
    roomLockedCount,
    allRoomLocked,
    timerLockedCount,
    allTimersLocked,
    placedBetCount,
  };
}

/**
 * The check when the teacher presses Reveal in a live room: every player is locked in or has a
 * complete bet. (Looser than the betting screen's count, which needs a seated phone to lock in.)
 */
export function isEveryRoomPlayerReady(input: Omit<RevealGateInput, 'mode' | 'teacherOverride' | 'turnTimers'>): boolean {
  return input.playerIds.every((id) => {
    if (input.seats?.[id]?.lockedIn) return true;
    return isBetComplete(input.bets[id], input.questionType, hasSplit(input, id), input.baseWord);
  });
}
