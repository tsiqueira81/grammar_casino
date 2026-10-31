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
import {
  BET_CAP_AMOUNT,
  CLOZE_DISABLED_POWER_UPS,
  BINARY_DISABLED_POWER_UPS,
  NON_OFFENSIVE_TARGETED_POWER_UPS,
} from '../constants';

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
  baseWord?: string;
  leadInSentence?: string;
  // Populated ONLY when step === 'RESULTS' or 'GAME_OVER'
  isCorrect?: boolean;
  correction?: string;
  explanation?: string;
  errorPhrase?: string;
  mistakeType?: string;
  acceptedAnswers?: string[];
  correctAnswer?: string;
  mark1Parts?: string[];
  mark2Parts?: string[];
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
  isHighRoller: boolean;
  minBetAmount: number;
  scalpelHint?: {
    eliminatedOptions?: string[];
    clozeMask?: string;
  } | null;
  peekabooSpyFeed?: {
    targetId: number;
    targetName: string;
    targetAvatar: string;
    lockedIn: boolean;
    betAmount: number | '';
    answerSummary: string;
  }[];
  audiencePollFeed?: AudiencePollSummary | null;
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

export interface AudiencePollBreakdownItem {
  label: string;
  count: number;
  percent: number;
}

export interface AudiencePollSummary {
  totalRivals: number;
  submittedCount: number;
  averageBet: number;
  breakdown: AudiencePollBreakdownItem[];
  summaryText: string;
}

/**
 * Determines whether a player qualifies for the Underdog Surge (2.5× comeback payout).
 * A player qualifies if they are in the bottom half of active players by bankroll
 * or strictly trailing the table leader's bankroll (or playing solo).
 */
export function isPlayerUnderdog(playerId: number, players: Player[]): boolean {
  const active = players.filter(p => p.money > 0);
  if (active.length <= 1) return true;
  const me = active.find(p => p.id === playerId);
  if (!me) return false;
  const maxMoney = Math.max(...active.map(p => p.money));
  if (me.money < maxMoney) return true;
  const sortedAsc = [...active].sort((a, b) => a.money - b.money);
  const bottomHalfCutoffIdx = Math.ceil(sortedAsc.length / 2) - 1;
  const medianCutoffMoney = sortedAsc[Math.max(0, bottomHalfCutoffIdx)]?.money ?? 0;
  return me.money <= medianCutoffMoney && me.money < maxMoney;
}

/**
 * Builds an anonymized live poll of all other active players' current choices and average wager.
 */
export function buildAudiencePollSummary(
  players: Player[],
  bets: Record<number, Bet>,
  activePowerUps: Record<number, ActivePowerUp[]>,
  currentSentence: GeneratedSentence | null,
  excludePlayerId: number
): AudiencePollSummary {
  const qType: QuestionType = currentSentence?.questionType || 'binary';
  const rivals = players.filter(p => p.id !== excludePlayerId && p.money > 0);
  const totalRivals = rivals.length;
  let submittedCount = 0;
  let betSum = 0;
  let betCount = 0;

  const counts = new Map<string, { label: string; weight: number }>();
  const addVote = (key: string, label: string, weight = 1) => {
    const existing = counts.get(key);
    if (existing) {
      existing.weight += weight;
    } else {
      counts.set(key, { label, weight });
    }
  };

  if (qType === 'binary') {
    counts.set('correct', { label: '✓ Valid', weight: 0 });
    counts.set('incorrect', { label: '✕ Flawed', weight: 0 });
  } else if (qType === 'multipleChoice') {
    const opts = currentSentence?.options && currentSentence.options.length > 0
      ? currentSentence.options
      : ['Option A', 'Option B', 'Option C', 'Option D'];
    opts.forEach((opt, idx) => {
      const letter = ['A', 'B', 'C', 'D'][idx] || String(idx + 1);
      counts.set(opt.trim().toLowerCase(), { label: `${letter}: ${opt}`, weight: 0 });
    });
  }

  for (const rival of rivals) {
    const rBet = bets[rival.id];
    if (!rBet) continue;
    if (typeof rBet.bet === 'number' && !isNaN(rBet.bet) && rBet.bet > 0) {
      betSum += rBet.bet;
      betCount += 1;
    }
    const rActive = (activePowerUps[rival.id] || []) as ActivePowerUp[];
    const hasSplit = rActive.some(pu => pu.type === 'SPLIT_BET');

    if (qType === 'binary') {
      if (hasSplit) {
        if (typeof rBet.bet === 'number' && rBet.bet > 0) {
          const pctValid = (rBet.splitCorrectPercent ?? 50) / 100;
          addVote('correct', '✓ Valid', pctValid);
          addVote('incorrect', '✕ Flawed', 1 - pctValid);
          submittedCount += 1;
        }
      } else if (rBet.opinion === 'correct') {
        addVote('correct', '✓ Valid', 1);
        submittedCount += 1;
      } else if (rBet.opinion === 'incorrect') {
        addVote('incorrect', '✕ Flawed', 1);
        submittedCount += 1;
      }
    } else if (qType === 'multipleChoice') {
      if (hasSplit) {
        const picked = (rBet.splitOptions || []).filter(Boolean);
        if (picked.length > 0) {
          const weightPerPick = 1 / picked.length;
          picked.forEach(opt => {
            const key = opt.trim().toLowerCase();
            const idx = (currentSentence?.options || []).findIndex(o => o.trim().toLowerCase() === key);
            const letter = idx >= 0 ? ['A', 'B', 'C', 'D'][idx] || '' : '';
            addVote(key, letter ? `${letter}: ${opt}` : opt, weightPerPick);
          });
          submittedCount += 1;
        }
      } else if (rBet.selectedOption?.trim()) {
        const opt = rBet.selectedOption.trim();
        const key = opt.toLowerCase();
        const idx = (currentSentence?.options || []).findIndex(o => o.trim().toLowerCase() === key);
        const letter = idx >= 0 ? ['A', 'B', 'C', 'D'][idx] || '' : '';
        addVote(key, letter ? `${letter}: ${opt}` : opt, 1);
        submittedCount += 1;
      }
    } else {
      // openCloze, wordFormation, keyWordTransformation
      if (hasSplit) {
        const answers = (rBet.splitClozeAnswers || []).map(a => (a || '').trim()).filter(Boolean);
        if (answers.length > 0) {
          const weightPerAns = 1 / answers.length;
          answers.forEach(ans => {
            const norm = ans.toLowerCase().replace(/\s+/g, ' ');
            addVote(norm, `"${ans}"`, weightPerAns);
          });
          submittedCount += 1;
        }
      } else if (rBet.clozeAnswer?.trim()) {
        const ans = rBet.clozeAnswer.trim();
        const norm = ans.toLowerCase().replace(/\s+/g, ' ');
        addVote(norm, `"${ans}"`, 1);
        submittedCount += 1;
      }
    }
  }

  const averageBet = betCount > 0 ? Math.round(betSum / betCount) : 0;
  const totalWeight = Array.from(counts.values()).reduce((sum, item) => sum + item.weight, 0);

  let breakdown: AudiencePollBreakdownItem[] = Array.from(counts.values()).map(item => ({
    label: item.label,
    count: Math.round(item.weight * 10) / 10,
    percent: totalWeight > 0 ? Math.round((item.weight / totalWeight) * 100) : 0,
  }));

  if (qType === 'openCloze' || qType === 'wordFormation' || qType === 'keyWordTransformation') {
    breakdown = breakdown
      .filter(b => b.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  }

  const summaryText =
    totalRivals === 0
      ? 'No other active players at the table.'
      : submittedCount === 0
        ? `Waiting for rivals to place answers (0/${totalRivals} answered · Avg Bet $${averageBet.toLocaleString()})...`
        : `${submittedCount}/${totalRivals} rival${totalRivals === 1 ? '' : 's'} answered · Avg Bet $${averageBet.toLocaleString()}`;

  return {
    totalRivals,
    submittedCount,
    averageBet,
    breakdown,
    summaryText,
  };
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
    if (
      (usedList || []).some(
        u => u.targetId === targetId && !NON_OFFENSIVE_TARGETED_POWER_UPS.includes(u.key)
      )
    ) {
      return true;
    }
  }
  for (const activeList of Object.values(activePowerUps)) {
    if (
      (activeList || []).some(
        a => a.target === targetId && !NON_OFFENSIVE_TARGETED_POWER_UPS.includes(a.type)
      )
    ) {
      return true;
    }
  }
  return false;
}

export function isValidKeyWordTransformationPhrase(
  phrase: string | undefined,
  baseWord?: string
): boolean {
  const trimmed = (phrase || '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return false;
  const words = trimmed.split(' ').filter(Boolean);
  if (words.length < 2 || words.length > 6) return false;
  const key = (baseWord || '').trim().toLowerCase();
  if (!key) return true;
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const keyRegex = new RegExp(`(^|[^a-zA-Z])${escapedKey}([^a-zA-Z]|$)`, 'i');
  return keyRegex.test(trimmed);
}

/**
 * Checks if a player's current bet is complete and ready to lock in.
 */
export function isBetCompleteForQuestionType(
  bet: Bet | undefined,
  questionType: QuestionType,
  hasSplitBet: boolean,
  baseWord?: string
): boolean {
  if (!bet) return false;
  const hasValidBetAmount = typeof bet.bet === 'number' && !isNaN(bet.bet) && bet.bet >= 0;
  if (!hasValidBetAmount) return false;

  if (questionType === 'multipleChoice') {
    return hasSplitBet
      ? (bet.splitOptions?.length ?? 0) >= 1
      : Boolean(bet.selectedOption?.trim());
  }
  if (questionType === 'keyWordTransformation') {
    if (hasSplitBet) {
      const w1 = (bet.splitClozeAnswers?.[0] || '').trim();
      const w2 = (bet.splitClozeAnswers?.[1] || '').trim();
      if (!w1 && !w2) return false;
      if (w1 && !isValidKeyWordTransformationPhrase(w1, baseWord)) return false;
      if (w2 && !isValidKeyWordTransformationPhrase(w2, baseWord)) return false;
      return true;
    }
    return isValidKeyWordTransformationPhrase(bet.clozeAnswer, baseWord);
  }
  if (questionType === 'openCloze' || questionType === 'wordFormation') {
    const cleanBase = (baseWord || '').trim().toLowerCase();
    const isValidWord = (w?: string) => {
      const trimmed = (w || '').trim().toLowerCase();
      if (!trimmed) return false;
      if (questionType === 'wordFormation' && cleanBase && trimmed === cleanBase) return false;
      return true;
    };
    return hasSplitBet
      ? isValidWord(bet.splitClozeAnswers?.[0]) || isValidWord(bet.splitClozeAnswers?.[1])
      : isValidWord(bet.clozeAnswer);
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
  const isClozeRound = qType === 'multipleChoice' || qType === 'openCloze' || qType === 'wordFormation' || qType === 'keyWordTransformation';
  const drawablePool = availablePowerUps.filter(k => {
    if (isClozeRound && CLOZE_DISABLED_POWER_UPS.includes(k)) return false;
    if (!isClozeRound && BINARY_DISABLED_POWER_UPS.includes(k)) return false;
    return true;
  });

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
    const hasDraftBet = isBetCompleteForQuestionType(bets[p.id], qType, hasSplitBet, currentSentence?.baseWord);

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

    const playerHighRollers = allActive.filter(
      pu => pu.type === 'HIGH_ROLLER' && pu.target === player.id
    );
    const isHighRoller = playerHighRollers.length > 0;
    const minBetAmount = isHighRoller
      ? Math.min(
          player.money,
          Math.max(
            1,
            playerHighRollers.reduce(
              (max, pu) => Math.max(max, pu.amount ?? Math.ceil(player.money * 0.5)),
              Math.ceil(player.money * 0.5)
            )
          )
        )
      : 0;

    // Build 50/50 Scalpel hint without leaking full answer
    const scalpelPu = myActive.find(pu => pu.type === 'SCALPEL');
    let scalpelHint: { eliminatedOptions?: string[]; clozeMask?: string } | null = null;
    if (scalpelPu && currentSentence && step === 'IN_GAME') {
      if (qType === 'multipleChoice') {
        scalpelHint = {
          eliminatedOptions: scalpelPu.eliminatedOptions || [],
        };
      } else if (qType === 'openCloze' && currentSentence.correctAnswer) {
        const word = currentSentence.correctAnswer.trim();
        if (word.length > 0) {
          const rest = Array(Math.max(0, word.length - 1)).fill('_').join(' ');
          scalpelHint = {
            clozeMask: `${word[0]}${rest ? ' ' + rest : ''} (${word.length} letter${word.length === 1 ? '' : 's'})`,
          };
        }
      } else if (qType === 'wordFormation' && currentSentence.correctAnswer) {
        const word = currentSentence.correctAnswer.trim();
        if (word.length >= 4) {
          const middleCount = Math.max(1, word.length - 3);
          const middle = Array(middleCount).fill('_').join(' ');
          scalpelHint = {
            clozeMask: `${word[0]} ${middle} ${word[word.length - 2]} ${word[word.length - 1]} (${word.length} letters)`,
          };
        } else if (word.length > 0) {
          const rest = Array(Math.max(0, word.length - 1)).fill('_').join(' ');
          scalpelHint = {
            clozeMask: `${word[0]}${rest ? ' ' + rest : ''} (${word.length} letter${word.length === 1 ? '' : 's'})`,
          };
        }
      } else if (qType === 'keyWordTransformation' && currentSentence.correctAnswer) {
        const words = currentSentence.correctAnswer.trim().split(/\s+/).filter(Boolean);
        if (words.length >= 2) {
          const middleBlanks = Array(Math.max(0, words.length - 2)).fill('___').join(' ');
          scalpelHint = {
            clozeMask: `${words.length} words: ${words[0]}${middleBlanks ? ' ' + middleBlanks : ''} ${words[words.length - 1]}`,
          };
        }
      }
    }

    // Build Peekaboo live spy feed for this player
    const peekabooTargets = myActive.filter(pu => pu.type === 'PEEKABOO' && pu.target !== undefined);
    const peekabooSpyFeed =
      step === 'IN_GAME' && peekabooTargets.length > 0
        ? peekabooTargets
            .map(pu => {
              const tPlayer = players.find(p => p.id === pu.target);
              if (!tPlayer) return null;
              const tBet = bets[tPlayer.id];
              const tActive = (activePowerUps[tPlayer.id] || []) as ActivePowerUp[];
              const tHasSplit = tActive.some(a => a.type === 'SPLIT_BET');
              let answerSummary = 'Undecided...';
              if (tBet) {
                if (qType === 'multipleChoice') {
                  if (tHasSplit) {
                    const opts = (tBet.splitOptions || []).filter(Boolean);
                    answerSummary = opts.length > 0 ? `Split: ${opts.join(' / ')}` : 'Undecided...';
                  } else if (tBet.selectedOption) {
                    const idx = (currentSentence?.options || []).findIndex(
                      o => o.trim().toLowerCase() === tBet.selectedOption!.trim().toLowerCase()
                    );
                    const letter = idx >= 0 ? ['A', 'B', 'C', 'D'][idx] || '' : '';
                    answerSummary = letter ? `${letter}: "${tBet.selectedOption}"` : `"${tBet.selectedOption}"`;
                  }
                } else if (qType === 'openCloze' || qType === 'wordFormation' || qType === 'keyWordTransformation') {
                  if (tHasSplit) {
                    const w1 = tBet.splitClozeAnswers?.[0]?.trim() || '';
                    const w2 = tBet.splitClozeAnswers?.[1]?.trim() || '';
                    answerSummary = w1 || w2 ? `Split: "${w1 || '—'}" / "${w2 || '—'}"` : 'Typing...';
                  } else if (tBet.clozeAnswer?.trim()) {
                    answerSummary = `"${tBet.clozeAnswer.trim()}"`;
                  }
                } else {
                  if (tHasSplit) {
                    const pct = tBet.splitCorrectPercent ?? 50;
                    answerSummary = `Split (${pct}% Valid / ${100 - pct}% Flawed)`;
                  } else if (tBet.opinion === 'correct') {
                    answerSummary = '✓ Valid';
                  } else if (tBet.opinion === 'incorrect') {
                    answerSummary = tBet.userCorrection?.trim()
                      ? `✕ Flawed ("${tBet.userCorrection.trim()}")`
                      : '✕ Flawed';
                  }
                }
              }
              return {
                targetId: tPlayer.id,
                targetName: tPlayer.name,
                targetAvatar: tPlayer.avatar,
                lockedIn: Boolean(seats[tPlayer.id]?.lockedIn),
                betAmount: typeof tBet?.bet === 'number' ? tBet.bet : ('' as const),
                answerSummary,
              };
            })
            .filter((item): item is NonNullable<typeof item> => item !== null)
        : undefined;

    const hasAudiencePoll = myActive.some(pu => pu.type === 'AUDIENCE_POLL');
    const audiencePollFeed =
      step === 'IN_GAME' && hasAudiencePoll
        ? buildAudiencePollSummary(players, bets, activePowerUps, currentSentence, player.id)
        : null;

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
          baseWord: currentSentence.baseWord,
          leadInSentence: currentSentence.leadInSentence,
          ...(hasGoggles && currentSentence.grammarPhrase
            ? { grammarPhrase: currentSentence.grammarPhrase }
            : {}),
        };
      }
    }

    const pendingTargetKey = studentPendingTarget[player.id];
    let pendingTarget: StudentPendingTarget | null = null;
    if (pendingTargetKey) {
      const isNonOffensive = NON_OFFENSIVE_TARGETED_POWER_UPS.includes(pendingTargetKey);
      const ignoresShield = pendingTargetKey === 'COPYCAT';
      pendingTarget = {
        powerUp: pendingTargetKey,
        eligibleTargets: peers
          .filter(peer => peer.id !== player.id && peer.money > 0)
          .map(peer => ({
            id: peer.id,
            name: peer.name,
            avatar: peer.avatar,
            money: peer.money,
            isShielded: ignoresShield ? false : peer.isShielded,
            targetedThisRound: isNonOffensive ? false : peer.targetedThisRound,
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
      isHighRoller,
      minBetAmount,
      scalpelHint,
      peekabooSpyFeed,
      audiencePollFeed,
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
