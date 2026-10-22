import {
  Player,
  Settings,
  GeneratedSentence,
  Bet,
  Hint,
  RoundResultInfo,
  PowerUpKey,
  ActivePowerUp,
  UsedPowerUp,
  Step,
  GameMode,
  QuestionType,
  PlayerEffect,
  PlayerTurnTimer,
  RoundHistoryRecord,
} from '../types';
import { BET_CAP_AMOUNT, CLOZE_DISABLED_POWER_UPS } from '../constants';

export interface MultiplayerSeat {
  seatId: string;
  playerId: number;
  name: string;
  avatar: string;
  reconnectToken: string;
  connected: boolean;
  lockedIn: boolean;
  lastSeen: number;
}

export interface FilteredSentence {
  text: string;
  questionType?: QuestionType;
  options?: string[];
  grammarPhrase?: string;
  // Populated ONLY when step === 'RESULTS' or 'GAME_OVER'
  isCorrect?: boolean;
  correction?: string;
  explanation?: string;
  errorPhrase?: string;
  mistakeType?: string;
  acceptedAnswers?: string[];
  correctAnswer?: string;
}

export interface PeerSummary {
  id: number;
  name: string;
  avatar: string;
  money: number;
  winStreak: number;
  effects: PlayerEffect[];
  connected: boolean;
  lockedIn: boolean;
  hasDraftBet: boolean;
  isFrozen: boolean;
  isShielded: boolean;
  targetedThisRound: boolean;
  usedPowerUpsCount: number;
}

export interface StudentPendingTarget {
  powerUp: PowerUpKey;
  eligibleTargets: {
    id: number;
    name: string;
    avatar: string;
    money: number;
    isShielded: boolean;
    targetedThisRound: boolean;
  }[];
}

export interface PlayerViewPayload {
  roomCode: string;
  roomLocked: boolean;
  step: Step;
  round: number;
  gameMode: GameMode;
  totalRounds: number;
  targetAmount: number;
  settings: {
    topic: string;
    level: string;
    theme: string;
  };
  isLoadingSentence: boolean;
  isProcessingResults: boolean;
  me: Player;
  myBet: Bet;
  myHint?: Hint;
  myActivePowerUps: ActivePowerUp[];
  myUsedPowerUps: UsedPowerUp[];
  canBuyPowerUp: boolean;
  availablePowerUpsCount: number;
  isBetCapped: boolean;
  betCapAmount: number;
  isFrozen: boolean;
  lockedIn: boolean;
  pendingTarget?: StudentPendingTarget | null;
  pendingWheelSpin?: boolean;
  lastNotification?: {
    id: string;
    title: string;
    message: string;
    icon?: string;
  } | null;
  sentence: FilteredSentence | null;
  peers: PeerSummary[];
  myRoundResult?: RoundResultInfo | null;
  allRoundResults: RoundResultInfo[];
  winner?: Player | null;
  roundHistory?: RoundHistoryRecord[];
  roundTimer?: PlayerTurnTimer;
  turnDurationMs?: number;
}

export type StudentIntent =
  | { type: 'SET_BET'; field: keyof Bet; value: any }
  | { type: 'SET_FULL_BET'; bet: Partial<Bet> }
  | { type: 'LOCK_IN'; locked: boolean; bet?: Partial<Bet> }
  | { type: 'BUY_HINT' }
  | { type: 'BUY_RANDOM_POWER_UP' }
  | { type: 'SELECT_POWER_UP_TARGET'; powerUp: PowerUpKey; targetId: number }
  | { type: 'CANCEL_POWER_UP_TARGET'; powerUp: PowerUpKey }
  | { type: 'APPLY_WHEEL_RESULT'; itemId: string }
  | { type: 'UPDATE_PROFILE'; name?: string; avatar?: string };

export interface BuildPlayerViewsParams {
  roomCode: string;
  roomLocked: boolean;
  step: Step;
  currentRound: number;
  gameMode: GameMode;
  totalRounds: number;
  targetAmount: number;
  settings: Settings;
  customTopic: string;
  customTheme: string;
  isLoading: boolean;
  isProcessing: boolean;
  players: Player[];
  seats: Record<number, MultiplayerSeat>;
  bets: Record<number, Bet>;
  hints: Record<number, Hint>;
  activePowerUps: Record<number, ActivePowerUp[]>;
  powerUpsUsedThisRound: Record<number, UsedPowerUp[]>;
  availablePowerUps: PowerUpKey[];
  currentSentence: GeneratedSentence | null;
  roundResults: RoundResultInfo[];
  roundHistory?: RoundHistoryRecord[];
  winner: Player | null;
  studentPendingTarget: Record<number, PowerUpKey | null>;
  studentPendingWheel: Record<number, boolean>;
  studentNotifications: Record<number, { id: string; title: string; message: string; icon?: string } | null>;
  roundTimer?: PlayerTurnTimer;
  turnDurationMs?: number;
}

/**
 * Checks whether a target player has already been hit by an offensive targeted power-up this round.
 * Enforces the 1-incoming-attack-per-round classroom protection rule.
 */
export function isPlayerTargetedThisRound(
  targetId: number,
  powerUpsUsedThisRound: Record<number, UsedPowerUp[]>,
  activePowerUps: Record<number, ActivePowerUp[]>
): boolean {
  for (const usedList of Object.values(powerUpsUsedThisRound)) {
    if ((usedList || []).some(u => u.targetId === targetId)) {
      return true;
    }
  }
  for (const activeList of Object.values(activePowerUps)) {
    if ((activeList || []).some(a => a.target === targetId)) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if a player's current bet is complete and ready to lock in.
 */
export function isBetCompleteForQuestionType(
  bet: Bet | undefined,
  questionType: QuestionType,
  hasSplitBet: boolean
): boolean {
  if (!bet) return false;
  const hasValidBetAmount = typeof bet.bet === 'number' && !isNaN(bet.bet) && bet.bet >= 0;
  if (!hasValidBetAmount) return false;

  if (questionType === 'multipleChoice') {
    return hasSplitBet
      ? (bet.splitOptions?.length ?? 0) >= 1
      : Boolean(bet.selectedOption?.trim());
  }
  if (questionType === 'openCloze') {
    return hasSplitBet
      ? Boolean(bet.splitClozeAnswers?.[0]?.trim() || bet.splitClozeAnswers?.[1]?.trim())
      : Boolean(bet.clozeAnswer?.trim());
  }
  if (hasSplitBet) return true;
  return Boolean(bet.opinion);
}

/**
 * Builds per-player filtered views (`Record<playerId, PlayerViewPayload>`),
 * ensuring zero answer leakage during `IN_GAME`.
 */
export function buildAllPlayerViews(params: BuildPlayerViewsParams): Record<number, PlayerViewPayload> {
  const {
    roomCode,
    roomLocked,
    step,
    currentRound,
    gameMode,
    totalRounds,
    targetAmount,
    settings,
    customTopic,
    customTheme,
    isLoading,
    isProcessing,
    players,
    seats,
    bets,
    hints,
    activePowerUps,
    powerUpsUsedThisRound,
    availablePowerUps,
    currentSentence,
    roundResults,
    roundHistory,
    winner,
    studentPendingTarget,
    studentPendingWheel,
    studentNotifications,
    roundTimer,
    turnDurationMs,
  } = params;

  const allActive = Object.values(activePowerUps).flat() as ActivePowerUp[];
  const qType: QuestionType = currentSentence?.questionType || 'binary';
  const isClozeRound = qType === 'multipleChoice' || qType === 'openCloze';
  const drawablePool = isClozeRound
    ? availablePowerUps.filter(k => !CLOZE_DISABLED_POWER_UPS.includes(k))
    : availablePowerUps;

  const resolvedTopic = settings.topic === 'My own choice' ? (customTopic.trim() || 'Custom') : settings.topic;
  const resolvedTheme = settings.theme === 'Custom ✍️' ? (customTheme.trim() || 'Custom') : settings.theme;

  // Build peer summaries (never leaks peer bet amounts or opinions during IN_GAME)
  const peers: PeerSummary[] = players.map(p => {
    const pActive = (activePowerUps[p.id] || []) as ActivePowerUp[];
    const isFrozen =
      allActive.some(pu => pu.type === 'SUB_ZERO' && pu.target === p.id) ||
      p.effects.some(e => e.type === ('SUB_ZERO' as any));
    const isShielded = pActive.some(pu => pu.type === 'SHIELD' || pu.type === 'GUARDIAN_ANGEL');
    const targetedThisRound = isPlayerTargetedThisRound(p.id, powerUpsUsedThisRound, activePowerUps);
    const hasSplitBet = pActive.some(pu => pu.type === 'SPLIT_BET');
    const seat = seats[p.id];
    const hasDraftBet = isBetCompleteForQuestionType(bets[p.id], qType, hasSplitBet);

    return {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      money: p.money,
      winStreak: p.winStreak,
      effects: p.effects,
      connected: seat ? seat.connected : true,
      lockedIn: Boolean(seat?.lockedIn),
      hasDraftBet,
      isFrozen,
      isShielded,
      targetedThisRound,
      usedPowerUpsCount: (powerUpsUsedThisRound[p.id] || []).length,
    };
  });

  const views: Record<number, PlayerViewPayload> = {};

  for (const player of players) {
    const myActive = (activePowerUps[player.id] || []) as ActivePowerUp[];
    const myUsed = powerUpsUsedThisRound[player.id] || [];
    const hasPowerSurge = myActive.some(pu => pu.type === 'POWER_SURGE');
    const powerUpLimit = hasPowerSurge ? 3 : 1;
    const isSilenced = player.effects.some(e => e.type === 'SILENCED');
    const isFrozen =
      allActive.some(pu => pu.type === 'SUB_ZERO' && pu.target === player.id) ||
      player.effects.some(e => e.type === ('SUB_ZERO' as any));

    const playerCaps = allActive.filter(
      pu => pu.type === 'BET_CAP' && (pu.target !== undefined ? pu.target === player.id : myActive.includes(pu))
    );
    const isBetCapped = playerCaps.length > 0 || player.effects.some(e => e.type === ('BET_CAP' as any));
    const betCapAmount =
      playerCaps.length > 0
        ? playerCaps.reduce((min, pu) => Math.min(min, pu.amount ?? BET_CAP_AMOUNT), BET_CAP_AMOUNT)
        : isBetCapped
          ? 50
          : BET_CAP_AMOUNT;

    const hasGoggles = myActive.some(pu => pu.type === 'GRAMMAR_GOGGLES');

    // Filter sentence strictly based on step & player's own Grammar Goggles
    let filteredSentence: FilteredSentence | null = null;
    if (currentSentence) {
      if (step === 'RESULTS' || step === 'GAME_OVER') {
        filteredSentence = { ...currentSentence };
      } else {
        filteredSentence = {
          text: currentSentence.text,
          questionType: currentSentence.questionType || 'binary',
          options: currentSentence.options,
          ...(hasGoggles && currentSentence.grammarPhrase
            ? { grammarPhrase: currentSentence.grammarPhrase }
            : {}),
        };
      }
    }

    const pendingTargetKey = studentPendingTarget[player.id];
    let pendingTarget: StudentPendingTarget | null = null;
    if (pendingTargetKey) {
      pendingTarget = {
        powerUp: pendingTargetKey,
        eligibleTargets: peers
          .filter(peer => peer.id !== player.id && peer.money > 0)
          .map(peer => ({
            id: peer.id,
            name: peer.name,
            avatar: peer.avatar,
            money: peer.money,
            isShielded: peer.isShielded,
            targetedThisRound: peer.targetedThisRound,
          })),
      };
    }

    const myResult =
      step === 'RESULTS' || step === 'GAME_OVER'
        ? roundResults.find(r => r.name === player.name) || null
        : null;

    views[player.id] = {
      roomCode,
      roomLocked,
      step,
      round: currentRound,
      gameMode,
      totalRounds: typeof totalRounds === 'string' ? parseInt(totalRounds, 10) || 10 : totalRounds,
      targetAmount: typeof targetAmount === 'string' ? parseInt(targetAmount, 10) || 2000 : targetAmount,
      settings: {
        topic: resolvedTopic,
        level: settings.level,
        theme: resolvedTheme,
      },
      isLoadingSentence: isLoading,
      isProcessingResults: isProcessing,
      me: player,
      myBet: bets[player.id] || {},
      myHint: hints[player.id],
      myActivePowerUps: myActive,
      myUsedPowerUps: myUsed,
      canBuyPowerUp:
        !isFrozen &&
        !isSilenced &&
        !seats[player.id]?.lockedIn &&
        player.money >= 50 &&
        myUsed.length < powerUpLimit &&
        drawablePool.length > 0,
      availablePowerUpsCount: drawablePool.length,
      isBetCapped,
      betCapAmount,
      isFrozen,
      lockedIn: Boolean(seats[player.id]?.lockedIn),
      pendingTarget,
      pendingWheelSpin: Boolean(studentPendingWheel[player.id]),
      lastNotification: studentNotifications[player.id] || null,
      sentence: filteredSentence,
      peers,
      myRoundResult: myResult,
      allRoundResults: step === 'RESULTS' || step === 'GAME_OVER' ? roundResults : [],
      winner: step === 'GAME_OVER' ? winner : null,
      roundHistory: step === 'GAME_OVER' ? (roundHistory || []) : undefined,
      roundTimer,
      turnDurationMs,
    };
  }

  return views;
}
