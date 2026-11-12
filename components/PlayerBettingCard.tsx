import { hasPlainShield, isSilencedThisHand } from '../game/status';
import { BetCardHeader } from './betting/BetCardHeader';
import { BetOptionAnswer } from './betting/BetOptionAnswer';
import { BetTypedAnswer } from './betting/BetTypedAnswer';
import { BetSplitAnswer } from './betting/BetSplitAnswer';
import { BetBinaryAnswer } from './betting/BetBinaryAnswer';
import { BetCardSide } from './betting/BetCardSide';
import React, { useRef } from 'react';
import { AlertTriangle, Lock, Snowflake } from 'lucide-react';
import { Player, Bet, Hint, SoundEffect, ActivePowerUp, UsedPowerUp, PlayerTurnTimer, QuestionType } from '../types';
import { TurnTimerControls, useTurnCountdown } from './TurnTimer';
import { BET_CAP_AMOUNT } from '../constants';
import { isValidKeyWordTransformationPhrase, AudiencePollSummary } from '../utils/multiplayerProtocol';
import { isOptionType, isTypedAnswerType, isWordAnswerType } from '../game/questionTypes';

interface PlayerBettingCardProps {
  player: Player;
  /** Package G6 Spotlight: this player's next power-up draw is free. */
  hasFreeDraw?: boolean;
  players: Player[]; 
  bet?: Bet;
  onBetChange: (playerId: number, field: keyof Bet, value: any) => void;
  onGetHint: (playerId: number) => void;
  hint?: Hint;
  playSound: (sound: SoundEffect) => void;
  onGetPowerUp: (playerId: number) => void;
  powerUpUsedThisRound: boolean;
  activePowerUp?: ActivePowerUp;
  activePowerUps?: ActivePowerUp[]; 
  usedPowerUps?: UsedPowerUp[]; 
  isBetCapped: boolean;
  betCapAmount?: number;
  isHighRoller?: boolean;
  minBetAmount?: number;
  scalpelHint?: {
    eliminatedOptions?: string[];
    clozeMask?: string;
  } | null;
  audiencePollFeed?: AudiencePollSummary | null;
  isFrozen?: boolean;
  onUpdateMoney?: (playerId: number, newAmount: number) => void;
  currentSentenceText?: string;
  onChangeAvatar?: (playerId: number) => void;
  onUpdateName?: (playerId: number, newName: string) => void;
  targetAmount?: number;
  questionType?: QuestionType;
  options?: string[];
  baseWord?: string;
  // --- Betting turn timer ---
  timerEnabled?: boolean;
  turnTimer?: PlayerTurnTimer;
  turnDurationMs?: number;
  canAct?: boolean;            // False when the timer feature is on and this player's turn is not live
  isSatOut?: boolean;          // Locked without a complete bet -> sits out the round
  timerBlockedByName?: string; // Another player's turn is in progress
  onTimerStart?: (playerId: number) => void;
  onTimerPause?: (playerId: number) => void;
  onTimerAddTime?: (playerId: number) => void;
  onTimerLockNow?: (playerId: number) => void;
  onTimerUnlock?: (playerId: number) => void;
}

const PlayerBettingCard: React.FC<PlayerBettingCardProps> = ({
  player,
  players,
  bet,
  onBetChange,
  onGetHint,
  hint,
  playSound,
  onGetPowerUp,
  powerUpUsedThisRound,
  activePowerUp,
  activePowerUps = [],
  usedPowerUps = [],
  isBetCapped,
  betCapAmount = BET_CAP_AMOUNT,
  isHighRoller = false,
  minBetAmount = 0,
  scalpelHint = null,
  audiencePollFeed = null,
  isFrozen = false,
  onUpdateMoney,
  currentSentenceText,
  onChangeAvatar,
  onUpdateName,
  targetAmount,
  hasFreeDraw = false,
  questionType = 'binary',
  options = [],
  baseWord,
  timerEnabled = false,
  turnTimer,
  turnDurationMs = 0,
  canAct = true,
  isSatOut = false,
  timerBlockedByName,
  onTimerStart,
  onTimerPause,
  onTimerAddTime,
  onTimerLockNow,
  onTimerUnlock,
}) => {
  const isEliminated = player.money <= 0;
  const isBlocked = isEliminated || isFrozen || !canAct;
  const effectiveBetCap = isBetCapped ? betCapAmount : Infinity;
  const effectiveMinBet = isHighRoller ? Math.min(player.money, Math.max(1, minBetAmount)) : 0;
  const lastCorrectionTapRef = useRef<number>(0);

  const { remainingMs, fraction, isWarning } = useTurnCountdown(
    timerEnabled ? turnTimer : undefined,
    turnDurationMs,
    timerEnabled ? playSound : undefined
  );
  const timerStatus = turnTimer?.status ?? 'idle';
  const isTurnLocked = timerEnabled && timerStatus === 'locked';
  const showTimer = timerEnabled && !isEliminated;

  const [isEditingMoney, setIsEditingMoney] = React.useState(false);
  const [tempMoney, setTempMoney] = React.useState('');
  
  // Name editing state
  const [isEditingName, setIsEditingName] = React.useState(false);
  const [tempName, setTempName] = React.useState(player.name);

  // Refs & warning state for Lock Now validation when player still has time
  const firstOptionBtnRef = React.useRef<HTMLButtonElement>(null);
  const firstOpinionBtnRef = React.useRef<HTMLButtonElement>(null);
  const clozeWordInputRef = React.useRef<HTMLInputElement>(null);
  const splitWord1InputRef = React.useRef<HTMLInputElement>(null);
  const splitWord2InputRef = React.useRef<HTMLInputElement>(null);
  const wagerInputRef = React.useRef<HTMLInputElement>(null);

  const [lockWarning, setLockWarning] = React.useState<{
    message: string;
    missingField: 'answer' | 'wager' | 'both';
  } | null>(null);

  React.useEffect(() => {
    if (!isEditingName) {
      setTempName(player.name);
    }
  }, [player.name, isEditingName]);

  // Clear lockWarning when the player updates their answer/wager or when the timer status changes
  React.useEffect(() => {
    if (lockWarning) {
      setLockWarning(null);
    }
  }, [
    bet?.opinion,
    bet?.selectedOption,
    bet?.splitOptions,
    bet?.clozeAnswer,
    bet?.splitClozeAnswers,
    bet?.bet,
    timerStatus,
    currentSentenceText,
  ]);

  const handleNameClick = () => {
    if (onUpdateName) {
      setTempName(player.name);
      setIsEditingName(true);
    }
  };

  const handleNameSave = () => {
    setIsEditingName(false);
    const trimmed = tempName.trim();
    if (trimmed && onUpdateName && trimmed !== player.name) {
      onUpdateName(player.id, trimmed);
    } else {
      setTempName(player.name);
    }
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleNameSave();
    } else if (e.key === 'Escape') {
      setIsEditingName(false);
      setTempName(player.name);
    }
  };

  // Whenever player's current funds change, ensure bet amount stays within [effectiveMinBet, maxLimit]
  React.useEffect(() => {
    if (player.money <= 0) {
      if (bet?.bet !== undefined && bet?.bet !== '' && Number(bet.bet) !== 0) {
        onBetChange(player.id, 'bet', 0);
      }
      return;
    }
    const maxLimit = isBetCapped ? Math.min(Math.max(0, player.money), effectiveBetCap) : Math.max(0, player.money);
    if (isHighRoller && effectiveMinBet > 0) {
      const currentBetNum = bet?.bet !== undefined && bet?.bet !== '' ? Number(bet.bet) : 0;
      if (isNaN(currentBetNum) || currentBetNum < effectiveMinBet) {
        onBetChange(player.id, 'bet', Math.min(maxLimit, effectiveMinBet));
        return;
      }
    }
    if (bet?.bet !== undefined && bet?.bet !== '') {
      const currentBetNum = Number(bet.bet);
      if (!isNaN(currentBetNum) && currentBetNum > maxLimit) {
        onBetChange(player.id, 'bet', maxLimit);
      }
    }
  }, [player.money, isBetCapped, effectiveBetCap, isHighRoller, effectiveMinBet, player.id, bet?.bet, onBetChange]);

  const handleOpinionClick = (opinion: 'correct' | 'incorrect') => {
    if (isBlocked) return;
    onBetChange(player.id, 'opinion', opinion);
  };
  
  const handleBetAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isBlocked) return;
    const val = e.target.value.replace(/[^\d]/g, '');
    if (val === '') {
      onBetChange(player.id, 'bet', isHighRoller && effectiveMinBet > 0 ? effectiveMinBet : '');
      return;
    }
    const num = parseInt(val, 10);
    if (!isNaN(num)) {
      const maxLimit = isBetCapped ? Math.min(Math.max(0, player.money), effectiveBetCap) : Math.max(0, player.money);
      if (num > maxLimit) {
        onBetChange(player.id, 'bet', maxLimit);
        return;
      }
    }
    onBetChange(player.id, 'bet', val);
  };

  const handleAddQuickChip = (val: number) => {
    if (isBlocked || player.money === 0) return;
    const current = typeof bet?.bet === 'number' ? bet.bet : 0;
    let next = current + val;
    if (isBetCapped && next > effectiveBetCap) {
      next = effectiveBetCap;
    }
    if (isHighRoller && next < effectiveMinBet) {
      next = effectiveMinBet;
    }
    next = Math.min(next, player.money);
    onBetChange(player.id, 'bet', next);
  };

  const handleClearBet = () => {
    if (isBlocked) return;
    onBetChange(player.id, 'bet', isHighRoller && effectiveMinBet > 0 ? effectiveMinBet : '');
  };

  const handleAllIn = () => {
    if (isBlocked || player.money === 0) return;
    const maxVal = isBetCapped ? Math.min(player.money, effectiveBetCap) : player.money;
    onBetChange(player.id, 'bet', maxVal);
  };

  const handleCorrectionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (isBlocked) return;
    onBetChange(player.id, 'userCorrection', e.target.value);
  };

  const handleMoneyClick = () => {
    if (onUpdateMoney) {
        setTempMoney(String(player.money));
        setIsEditingMoney(true);
    }
  };

  const handleMoneySave = () => {
      setIsEditingMoney(false);
      if (onUpdateMoney) {
          const val = parseInt(tempMoney, 10);
          if (!isNaN(val) && val >= 0) {
              onUpdateMoney(player.id, val);
          }
      }
  };

  const handleMoneyKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
          handleMoneySave();
      }
      if (e.key === 'Escape') {
          setIsEditingMoney(false);
      }
  };
  
  const betAmount = typeof bet?.bet === 'number' ? bet.bet : '';

  // Class logic
  const cardBaseClasses = "gc-panel rounded-gc-lg p-5 sm:p-7 transition-[opacity,border-color,box-shadow] duration-gc-base relative group overflow-hidden";
  const glowClasses = powerUpUsedThisRound ? "ring-2 ring-inset ring-purple-400/70" : "";
  const bankruptClasses = isEliminated ? "opacity-55 grayscale" : "";
  const frozenClasses = isFrozen
    ? "!border-cyan-300/90 ring-2 ring-inset ring-cyan-300/50 shadow-[inset_0_0_44px_rgba(34,211,238,0.34),0_0_28px_rgba(6,182,212,0.22)] bg-cyan-50/60 dark:bg-cyan-950/40"
    : "";
  const timerClasses = !showTimer ? ""
    : isWarning ? "!border-rose-500 shadow-[0_0_35px_rgba(244,63,94,0.45)]"
    : timerStatus === 'running' && !turnTimer?.held ? "!border-emerald-400/80 shadow-[0_0_30px_rgba(16,185,129,0.25)]"
    : isTurnLocked && !isFrozen ? "opacity-90" : "";

  // Aggregate tags
  const hasSafetyNet = activePowerUps.some(p => p.type === 'SAFETY_NET');
  const hasImmunity = activePowerUps.some(p => p.type === 'IMMUNITY_IDOL');
  const hasJackpot = activePowerUps.some(p => p.type === 'JACKPOT');
  const hasShield = hasPlainShield(activePowerUps);
  const hasSplitBet = activePowerUps.some(p => p.type === 'SPLIT_BET');
  const hasBlessing = player.effects.some(e => e.type === 'BLESSING');
  const hasCrucio = player.effects.some(e => e.type === 'CRUCIO');
  const isSilenced = isSilencedThisHand(player);
  const hasSecondChance = player.effects.some(e => e.type === 'SECOND_CHANCE');
  const hasTeachersPet = activePowerUps.some(p => p.type === 'TEACHERS_PET') || player.effects.some(e => e.type === 'TEACHERS_PET');
  const hasSavings = activePowerUps.some(p => p.type === 'SAVINGS_ACCOUNT');
  const hasCorrectionBounty = activePowerUps.some(p => p.type === 'CORRECTION_BOUNTY');
  const hasLoneWolf = activePowerUps.some(p => p.type === 'LONE_WOLF');
  const hasScalpel = activePowerUps.some(p => p.type === 'SCALPEL');
  const hasCopycat = activePowerUps.some(p => p.type === 'COPYCAT');
  const hasBloodPact = activePowerUps.some(p => p.type === 'BLOOD_PACT');
  const hasCrowdSurfer = activePowerUps.some(p => p.type === 'CROWD_SURFER');
  const hasDoubleOrNothing = activePowerUps.some(p => p.type === 'DOUBLE_OR_NOTHING');
  const hasBoomerang = activePowerUps.some(p => p.type === 'BOOMERANG');
  const hasAudiencePoll = activePowerUps.some(p => p.type === 'AUDIENCE_POLL');
  const hasUnderdog = activePowerUps.some(p => p.type === 'UNDERDOG');
  const hasScavenger = activePowerUps.some(p => p.type === 'SCAVENGER');

  // Split Bet Logic helpers
  const splitPercent = bet?.splitCorrectPercent ?? 50;
  const actualBetAmount = typeof bet?.bet === 'number' ? bet.bet : 0;
  const splitCorrectAmount = Math.floor(actualBetAmount * (splitPercent / 100));
  const splitIncorrectAmount = actualBetAmount - splitCorrectAmount;

  const cleanBaseLower = (baseWord || '').trim().toLowerCase();
  const isUnchangedBaseWord =
    questionType === 'wordFormation' &&
    Boolean(cleanBaseLower) &&
    (hasSplitBet
      ? [bet?.splitClozeAnswers?.[0], bet?.splitClozeAnswers?.[1]].some(
          w => Boolean(w?.trim()) && w!.trim().toLowerCase() === cleanBaseLower
        )
      : Boolean(bet?.clozeAnswer?.trim()) && bet!.clozeAnswer!.trim().toLowerCase() === cleanBaseLower);

  const inspectKwtPhrase = (raw?: string) => {
    const trimmed = (raw || '').trim();
    const words = trimmed ? trimmed.split(/\s+/).filter(Boolean) : [];
    const wordCount = words.length;
    const escapedBase = cleanBaseLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const hasKeyWord = cleanBaseLower
      ? new RegExp(`\\b${escapedBase}\\b`, 'i').test(trimmed)
      : true;
    const isValidCount = wordCount >= 2 && wordCount <= 6;
    return {
      trimmed,
      wordCount,
      hasKeyWord,
      isValidCount,
      isValid: Boolean(trimmed) && hasKeyWord && isValidCount,
    };
  };

  const isInvalidKwtPhrase =
    questionType === 'keyWordTransformation' &&
    (hasSplitBet
      ? [bet?.splitClozeAnswers?.[0], bet?.splitClozeAnswers?.[1]].some(
          w => Boolean(w?.trim()) && !isValidKeyWordTransformationPhrase(w, baseWord)
        )
      : Boolean(bet?.clozeAnswer?.trim()) && !isValidKeyWordTransformationPhrase(bet?.clozeAnswer, baseWord));

  const handleAttemptLockNow = () => {
    // Only warn & block when the player still has time left on their clock and can place a bet
    if (!isFrozen && !isEliminated && remainingMs > 0) {
      const minRequired = isHighRoller && effectiveMinBet > 0 ? effectiveMinBet : 1;
      const hasValidWager = typeof bet?.bet === 'number' && !isNaN(bet.bet) && bet.bet >= minRequired;
      let hasValidAnswer = false;
      if (isOptionType(questionType)) {
        hasValidAnswer = hasSplitBet
          ? (bet?.splitOptions?.length || 0) >= 1
          : Boolean(bet?.selectedOption?.trim());
      } else if (questionType === 'keyWordTransformation') {
        hasValidAnswer = hasSplitBet
          ? (isValidKeyWordTransformationPhrase(bet?.splitClozeAnswers?.[0], baseWord) &&
              (!bet?.splitClozeAnswers?.[1]?.trim() || isValidKeyWordTransformationPhrase(bet?.splitClozeAnswers?.[1], baseWord))) ||
            (!bet?.splitClozeAnswers?.[0]?.trim() && isValidKeyWordTransformationPhrase(bet?.splitClozeAnswers?.[1], baseWord))
          : isValidKeyWordTransformationPhrase(bet?.clozeAnswer, baseWord);
      } else if (isWordAnswerType(questionType)) {
        const isWordOk = (w?: string) => {
          const trimmed = (w || '').trim().toLowerCase();
          if (!trimmed) return false;
          if (questionType === 'wordFormation' && cleanBaseLower && trimmed === cleanBaseLower) return false;
          return true;
        };
        hasValidAnswer = hasSplitBet
          ? isWordOk(bet?.splitClozeAnswers?.[0]) || isWordOk(bet?.splitClozeAnswers?.[1])
          : isWordOk(bet?.clozeAnswer);
      } else {
        hasValidAnswer = hasSplitBet
          ? true
          : (bet?.opinion === 'correct' || bet?.opinion === 'incorrect');
      }

      if (!hasValidAnswer || !hasValidWager || isUnchangedBaseWord || isInvalidKwtPhrase) {
        playSound('error');

        let message = '';
        let missingField: 'answer' | 'wager' | 'both' = 'both';
        if (isUnchangedBaseWord) {
          missingField = 'answer';
          message = `Hold on! "${(baseWord || '').toUpperCase()}" is the unchanged base word. Transform its form (e.g. add a prefix or suffix) before locking!`;
        } else if (isInvalidKwtPhrase) {
          missingField = 'answer';
          message = `Hold on! Your Key Word Transformation must use 2 to 6 words and include the exact unchanged key word "${(baseWord || 'KEY').toUpperCase()}" before locking!`;
        } else if (!hasValidAnswer && !hasValidWager) {
          missingField = 'both';
          if (isOptionType(questionType)) {
            message = hasSplitBet
              ? 'Hold on! Pick 2 options (50/50) or click 1 option twice for 100% (2×), and enter a wager amount before locking.'
              : 'Hold on! Choose an option (A–D) and enter a wager amount before locking your bet.';
          } else if (questionType === 'keyWordTransformation') {
            message = `Hold on! Complete the gap in 2–6 words using "${(baseWord || 'KEY').toUpperCase()}" unchanged, and enter a wager amount before locking.`;
          } else if (questionType === 'wordFormation') {
            message = hasSplitBet
              ? `Hold on! Transform (${(baseWord || 'ROOT').toUpperCase()}) into 1 or 2 derived forms and enter a wager amount before locking.`
              : `Hold on! Transform (${(baseWord || 'ROOT').toUpperCase()}) to fit the gap and enter a wager amount before locking.`;
          } else if (questionType === 'openCloze') {
            message = hasSplitBet
              ? 'Hold on! Type 1 word (100% wager) or 2 candidate words (50% each) and enter a wager amount before locking.'
              : 'Hold on! Type the missing word and enter a wager amount before locking your bet.';
          } else {
            message = 'Hold on! Choose Valid or Flawed and enter a wager amount before locking your bet.';
          }
        } else if (!hasValidAnswer) {
          missingField = 'answer';
          if (isOptionType(questionType)) {
            message = hasSplitBet
              ? 'Please pick 2 options (50/50) or click the same option twice for 100% (2×) before locking!'
              : 'Please choose an option (A, B, C, or D) before locking your bet!';
          } else if (questionType === 'keyWordTransformation') {
            message = `Please type 2 to 6 words including the unchanged key word "${(baseWord || 'KEY').toUpperCase()}" before locking!`;
          } else if (questionType === 'wordFormation') {
            message = `Please transform the base word (${(baseWord || 'ROOT').toUpperCase()}) to fit the gap before locking!`;
          } else if (questionType === 'openCloze') {
            message = hasSplitBet
              ? 'Please type at least 1 candidate word before locking your bet!'
              : 'Please type the missing word before locking your bet!';
          } else {
            message = 'Please choose Valid or Flawed before locking your bet!';
          }
        } else {
          missingField = 'wager';
          message = 'Please enter a wager amount ($1 or more) before locking your bet!';
        }

        setLockWarning({ message, missingField });

        // Move focus to the missing item
        window.requestAnimationFrame(() => {
          if (!hasValidAnswer || isUnchangedBaseWord || isInvalidKwtPhrase) {
            if (isOptionType(questionType)) {
              firstOptionBtnRef.current?.focus();
              firstOptionBtnRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else if (isTypedAnswerType(questionType)) {
              if (hasSplitBet) {
                const targetInput = !bet?.splitClozeAnswers?.[0]?.trim()
                  ? splitWord1InputRef.current
                  : splitWord2InputRef.current;
                targetInput?.focus();
                targetInput?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              } else {
                clozeWordInputRef.current?.focus();
                clozeWordInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              }
            } else {
              firstOpinionBtnRef.current?.focus();
              firstOpinionBtnRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          } else {
            wagerInputRef.current?.focus();
            wagerInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        });
        return;
      }
    }

    setLockWarning(null);
    onTimerLockNow?.(player.id);
  };

  const highlightAnswerMissing = lockWarning?.missingField === 'answer' || lockWarning?.missingField === 'both';
  const highlightWagerMissing = lockWarning?.missingField === 'wager' || lockWarning?.missingField === 'both';

  return (
    <div data-testid="betting-card" data-player-name={player.name} data-seat-player={player.id} className={`${cardBaseClasses} ${glowClasses} ${bankruptClasses} ${frozenClasses} ${timerClasses}`}>
      {isEliminated && <div className="bankrupt-stamp">BANKRUPT</div>}
      {isFrozen && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none rounded-gc-lg overflow-hidden animate-gc-fade backdrop-blur-[2.5px]"
          style={{
            background:
              'radial-gradient(circle at 12% 14%, rgba(165, 243, 252, 0.34) 0%, transparent 42%), radial-gradient(circle at 88% 86%, rgba(56, 189, 248, 0.30) 0%, transparent 46%), linear-gradient(135deg, rgba(8, 51, 68, 0.62) 0%, rgba(14, 116, 144, 0.36) 48%, rgba(6, 182, 212, 0.54) 100%)',
          }}
        >
          {/* Diagonal glacial specular refraction streaks */}
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-45"
            style={{
              backgroundImage:
                'repeating-linear-gradient(125deg, rgba(255,255,255,0.22) 0px, rgba(255,255,255,0.22) 2px, transparent 2px, transparent 28px, rgba(165,243,252,0.14) 28px, rgba(165,243,252,0.14) 36px, transparent 36px, transparent 74px)',
            }}
          />

          {/* Inner rime frost border vignette */}
          <div
            aria-hidden="true"
            className="absolute inset-0 rounded-gc-lg border-[3px] border-cyan-200/60 shadow-[inset_0_0_52px_rgba(165,243,252,0.55)]"
          />

          {/* Top hanging crystalline icicles */}
          <svg
            aria-hidden="true"
            viewBox="0 0 800 54"
            preserveAspectRatio="none"
            className="absolute top-0 inset-x-0 w-full h-8 sm:h-11 text-cyan-200/85 drop-shadow-[0_4px_8px_rgba(8,145,178,0.55)]"
          >
            <defs>
              <linearGradient id={`gc-icicles-${player.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ecfeff" stopOpacity="0.95" />
                <stop offset="55%" stopColor="#67e8f9" stopOpacity="0.80" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.25" />
              </linearGradient>
            </defs>
            <path
              fill={`url(#gc-icicles-${player.id})`}
              d="M0,0 L800,0 L800,10 L782,34 L768,12 L748,46 L730,14 L714,28 L698,10 L676,50 L654,12 L636,32 L620,10 L598,42 L578,12 L556,26 L538,10 L514,52 L492,14 L472,34 L456,10 L432,44 L410,12 L392,30 L374,10 L350,50 L328,14 L308,36 L290,10 L266,46 L246,12 L226,28 L208,10 L184,52 L162,14 L142,34 L124,10 L98,44 L78,12 L58,32 L40,10 L18,38 L0,12 Z"
            />
          </svg>

          {/* Corner crystalline frost fractures */}
          <svg
            aria-hidden="true"
            viewBox="0 0 120 120"
            className="absolute top-0 left-0 w-24 h-24 sm:w-32 sm:h-32 text-cyan-100/65"
          >
            <g stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round">
              <path d="M0,0 L68,42 M36,22 L58,12 M36,22 L42,46" />
              <path d="M0,0 L40,74 M22,40 L12,62 M22,40 L44,52" />
              <path d="M0,26 L52,58 M28,43 L44,34" />
            </g>
          </svg>
          <svg
            aria-hidden="true"
            viewBox="0 0 120 120"
            className="absolute bottom-0 right-0 w-24 h-24 sm:w-32 sm:h-32 text-cyan-100/65 rotate-180"
          >
            <g stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round">
              <path d="M0,0 L68,42 M36,22 L58,12 M36,22 L42,46" />
              <path d="M0,0 L40,74 M22,40 L12,62 M22,40 L44,52" />
              <path d="M0,26 L52,58 M28,43 L44,34" />
            </g>
          </svg>

          {/* Ambient drifting snowflakes */}
          <Snowflake aria-hidden="true" className="absolute top-7 left-10 w-5 h-5 text-cyan-100/75 animate-pulse" />
          <Snowflake aria-hidden="true" className="absolute bottom-6 left-16 w-4 h-4 text-cyan-200/65 animate-pulse [animation-delay:0.4s]" />
          <Snowflake aria-hidden="true" className="absolute top-9 right-14 w-6 h-6 text-cyan-100/70 animate-pulse [animation-delay:0.8s]" />
          <Snowflake aria-hidden="true" className="absolute bottom-8 right-12 w-4 h-4 text-cyan-200/75 animate-pulse [animation-delay:1.1s]" />

          {/* Center Crystalline Ice Block Stamp */}
          <div className="relative -rotate-6 px-6 sm:px-8 py-3.5 sm:py-4 rounded-2xl border-[3px] border-cyan-200/95 bg-gradient-to-b from-cyan-900/95 via-sky-950/95 to-slate-950/95 shadow-[0_14px_38px_rgba(6,182,212,0.48),inset_0_2px_0_rgba(255,255,255,0.65),inset_0_-3px_12px_rgba(34,211,238,0.45)] flex items-center gap-3.5">
            <span className="w-11 h-11 rounded-xl bg-cyan-400/20 border border-cyan-300/60 grid place-items-center text-cyan-200 shadow-inner shrink-0">
              <Snowflake className="w-7 h-7 animate-pulse" aria-hidden="true" />
            </span>
            <div className="text-left">
              <div className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-300/90 leading-none mb-1">
                Sub-Zero Deep Freeze
              </div>
              <div className="text-gc-display font-extrabold text-transparent bg-clip-text bg-gradient-to-b from-white via-cyan-100 to-cyan-300 leading-none drop-shadow-[0_2px_8px_rgba(34,211,238,0.55)]">
                Frozen this hand
              </div>
            </div>
            <Snowflake className="w-6 h-6 text-cyan-300/80 shrink-0 hidden sm:block" aria-hidden="true" />
          </div>
        </div>
      )}
      {!isFrozen && !isEliminated && isSatOut && (
        <div className="absolute inset-0 bg-gc-bg/45 backdrop-blur-[1px] z-20 flex items-center justify-center pointer-events-none rounded-gc-lg animate-gc-fade">
          <span className="text-gc-display font-extrabold text-gc-loss -rotate-6 border-[3px] border-current px-6 py-2.5 rounded-gc bg-gc-card/95 shadow-gc-2 text-center">
            Sat out
            <span className="block text-gc-small font-semibold text-gc-quiet mt-0.5">No bet placed in time</span>
          </span>
        </div>
      )}
      {isTurnLocked && !isFrozen && !isEliminated && !isSatOut && (
        <div className="pointer-events-none absolute top-0 right-6 z-20 inline-flex items-center gap-1.5 bg-gc-card text-gc-win border border-t-0 border-gc-win/50 rounded-b-gc-sm px-3 py-1 text-gc-cap font-bold shadow-gc-1">
          <Lock className="w-3.5 h-3.5" aria-hidden="true" />
          Locked in
        </div>
      )}
      
      <BetCardHeader
        showTimer={showTimer}
        isFrozen={isFrozen}
        fraction={fraction}
        isWarning={isWarning}
        timerStatus={timerStatus}
        turnTimer={turnTimer}
        onChangeAvatar={onChangeAvatar}
        player={player}
        hasSecondChance={hasSecondChance}
        isEditingName={isEditingName}
        tempName={tempName}
        setTempName={setTempName}
        handleNameSave={handleNameSave}
        handleNameKeyDown={handleNameKeyDown}
        setIsEditingName={setIsEditingName}
        handleNameClick={handleNameClick}
        onUpdateName={onUpdateName}
        powerUpUsedThisRound={powerUpUsedThisRound}
        usedPowerUps={usedPowerUps}
        players={players}
        isEditingMoney={isEditingMoney}
        tempMoney={tempMoney}
        setTempMoney={setTempMoney}
        handleMoneySave={handleMoneySave}
        handleMoneyKeyDown={handleMoneyKeyDown}
        onUpdateMoney={onUpdateMoney}
        handleMoneyClick={handleMoneyClick}
        targetAmount={targetAmount}
        hasSafetyNet={hasSafetyNet}
        hasImmunity={hasImmunity}
        hasJackpot={hasJackpot}
        hasShield={hasShield}
        hasSplitBet={hasSplitBet}
        hasBlessing={hasBlessing}
        hasCrucio={hasCrucio}
        isSilenced={isSilenced}
        hasTeachersPet={hasTeachersPet}
        hasSavings={hasSavings}
        hasCorrectionBounty={hasCorrectionBounty}
        hasLoneWolf={hasLoneWolf}
        isBetCapped={isBetCapped}
        effectiveBetCap={effectiveBetCap}
        isHighRoller={isHighRoller}
        effectiveMinBet={effectiveMinBet}
        hasScalpel={hasScalpel}
        hasCopycat={hasCopycat}
        hasBloodPact={hasBloodPact}
        hasCrowdSurfer={hasCrowdSurfer}
        hasDoubleOrNothing={hasDoubleOrNothing}
        hasBoomerang={hasBoomerang}
        hasAudiencePoll={hasAudiencePoll}
        hasUnderdog={hasUnderdog}
        hasScavenger={hasScavenger}
      />

      {/* Betting Turn Clock (teacher controls) */}
      {showTimer && !isFrozen && (
        <div className="relative z-30">
          <TurnTimerControls
            timer={turnTimer}
            remainingMs={remainingMs}
            isWarning={isWarning}
            isFrozen={isFrozen}
            isSatOut={isSatOut}
            blockedByName={timerBlockedByName}
            onStart={() => onTimerStart?.(player.id)}
            onPause={() => onTimerPause?.(player.id)}
            onAddTime={() => onTimerAddTime?.(player.id)}
            onLockNow={handleAttemptLockNow}
            onUnlock={() => onTimerUnlock?.(player.id)}
          />
          {lockWarning && (
            <div
              role="alert"
              className="mb-4 -mt-2 px-4 py-3 rounded-gc bg-gc-loss/10 border border-gc-loss/50 text-gc-ink text-gc-small font-semibold flex items-center justify-between gap-3 animate-gc-slide-up"
            >
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 shrink-0 text-gc-loss" aria-hidden="true" />
                <span>{lockWarning.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setLockWarning(null)}
                className="h-8 px-3.5 rounded-full bg-gc-line/[0.07] border border-gc-line/[0.16] hover:border-gc-line/30 text-gc-ink text-gc-small font-bold cursor-pointer shrink-0"
              >
                OK
              </button>
            </div>
          )}
        </div>
      )}

      {audiencePollFeed && (
        <div className="mb-5 p-4 rounded-gc bg-gc-info/10 border border-gc-info/35 space-y-2.5 text-gc-small text-gc-ink animate-gc-slide-up">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold text-gc-info flex items-center gap-1.5">
              <span aria-hidden="true">📊</span>
              <span>Ask the table: what the others picked (no names)</span>
            </span>
            <span className="text-gc-cap tabular-nums font-semibold px-2.5 py-1 rounded-full bg-gc-info/15 text-gc-info">
              {audiencePollFeed.summaryText}
            </span>
          </div>
          {audiencePollFeed.breakdown.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              {audiencePollFeed.breakdown.map((item, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-gc-sm bg-gc-card/70 border border-gc-line/[0.12] flex flex-col justify-between gap-1.5"
                >
                  <div className="flex items-center justify-between gap-1 text-gc-small font-semibold">
                    <span className="truncate">{item.label}</span>
                    <span className="tabular-nums text-gc-info shrink-0">
                      {item.percent}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-gc-line/[0.1] overflow-hidden">
                    <div
                      className="h-full bg-gc-info rounded-full transition-all duration-gc-base"
                      style={{ width: `${Math.min(100, Math.max(0, item.percent))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left/Main Column: Betting Felt & Wager Controls (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {isOptionType(questionType) ? (
            <>
              <BetOptionAnswer
                hasSplitBet={hasSplitBet}
                bet={bet}
                actualBetAmount={actualBetAmount}
                highlightAnswerMissing={highlightAnswerMissing}
                options={options}
                scalpelHint={scalpelHint}
                firstOptionBtnRef={firstOptionBtnRef}
                isBlocked={isBlocked}
                onBetChange={onBetChange}
                player={player}
                wagerInputRef={wagerInputRef}
                betAmount={betAmount}
                handleBetAmountChange={handleBetAmountChange}
                isBetCapped={isBetCapped}
                effectiveBetCap={effectiveBetCap}
                highlightWagerMissing={highlightWagerMissing}
                handleAllIn={handleAllIn}
                isHighRoller={isHighRoller}
                effectiveMinBet={effectiveMinBet}
                handleAddQuickChip={handleAddQuickChip}
                handleClearBet={handleClearBet}
                playSound={playSound}
              />
            </>
          ) : (isTypedAnswerType(questionType)) ? (
            <>
              <BetTypedAnswer
                questionType={questionType}
                baseWord={baseWord}
                scalpelHint={scalpelHint}
                hasSplitBet={hasSplitBet}
                bet={bet}
                highlightAnswerMissing={highlightAnswerMissing}
                isUnchangedBaseWord={isUnchangedBaseWord}
                isInvalidKwtPhrase={isInvalidKwtPhrase}
                actualBetAmount={actualBetAmount}
                splitWord1InputRef={splitWord1InputRef}
                isBlocked={isBlocked}
                onBetChange={onBetChange}
                player={player}
                splitWord2InputRef={splitWord2InputRef}
                clozeWordInputRef={clozeWordInputRef}
                options={options}
                inspectKwtPhrase={inspectKwtPhrase}
                wagerInputRef={wagerInputRef}
                betAmount={betAmount}
                handleBetAmountChange={handleBetAmountChange}
                isBetCapped={isBetCapped}
                effectiveBetCap={effectiveBetCap}
                highlightWagerMissing={highlightWagerMissing}
                handleAllIn={handleAllIn}
                isHighRoller={isHighRoller}
                effectiveMinBet={effectiveMinBet}
                handleAddQuickChip={handleAddQuickChip}
                handleClearBet={handleClearBet}
                playSound={playSound}
              />
            </>
          ) : hasSplitBet ? (
            <BetSplitAnswer
              wagerInputRef={wagerInputRef}
              betAmount={betAmount}
              handleBetAmountChange={handleBetAmountChange}
              isBetCapped={isBetCapped}
              effectiveBetCap={effectiveBetCap}
              isBlocked={isBlocked}
              player={player}
              highlightWagerMissing={highlightWagerMissing}
              handleAllIn={handleAllIn}
              actualBetAmount={actualBetAmount}
              handleAddQuickChip={handleAddQuickChip}
              handleClearBet={handleClearBet}
              playSound={playSound}
              splitPercent={splitPercent}
              onBetChange={onBetChange}
              splitIncorrectAmount={splitIncorrectAmount}
              splitCorrectAmount={splitCorrectAmount}
              hasDoubleOrNothing={hasDoubleOrNothing}
              bet={bet}
              handleCorrectionChange={handleCorrectionChange}
              currentSentenceText={currentSentenceText}
              lastCorrectionTapRef={lastCorrectionTapRef}
            />
          ) : (
            <>
              <BetBinaryAnswer
                highlightAnswerMissing={highlightAnswerMissing}
                firstOpinionBtnRef={firstOpinionBtnRef}
                handleOpinionClick={handleOpinionClick}
                isBlocked={isBlocked}
                bet={bet}
                wagerInputRef={wagerInputRef}
                betAmount={betAmount}
                handleBetAmountChange={handleBetAmountChange}
                isBetCapped={isBetCapped}
                effectiveBetCap={effectiveBetCap}
                player={player}
                highlightWagerMissing={highlightWagerMissing}
                handleAllIn={handleAllIn}
                isHighRoller={isHighRoller}
                effectiveMinBet={effectiveMinBet}
                actualBetAmount={actualBetAmount}
                handleAddQuickChip={handleAddQuickChip}
                handleClearBet={handleClearBet}
                playSound={playSound}
                hasDoubleOrNothing={hasDoubleOrNothing}
                currentSentenceText={currentSentenceText}
                onBetChange={onBetChange}
                handleCorrectionChange={handleCorrectionChange}
                lastCorrectionTapRef={lastCorrectionTapRef}
              />
            </>
          )}
        </div>

        <BetCardSide
          onGetHint={onGetHint}
          player={player}
          hint={hint}
          isBlocked={isBlocked}
          isSilenced={isSilenced}
          onGetPowerUp={onGetPowerUp}
          hasFreeDraw={hasFreeDraw}
          powerUpUsedThisRound={powerUpUsedThisRound}
          isEliminated={isEliminated}
          isFrozen={isFrozen}
          isSatOut={isSatOut}
          isTurnLocked={isTurnLocked}
          timerEnabled={timerEnabled}
          timerStatus={timerStatus}
          isUnchangedBaseWord={isUnchangedBaseWord}
          baseWord={baseWord}
          isInvalidKwtPhrase={isInvalidKwtPhrase}
          questionType={questionType}
          bet={bet}
          hasSplitBet={hasSplitBet}
        />
      </div>
    </div>
  );
};

export default PlayerBettingCard;