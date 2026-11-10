import React, { useRef } from 'react';
import { AlertTriangle, Check, Lock, Pencil, Snowflake, X } from 'lucide-react';
import { Player, Bet, Hint, SoundEffect, ActivePowerUp, PowerUpKey, UsedPowerUp, PlayerTurnTimer, QuestionType } from '../types';
import ActionButton from './ActionButton';
import TextInput from './TextInput';
import PowerUpTooltip from './PowerUpTooltip';
import { QuickChipTray, WagerChipsDisplay } from './ChipStacks';
import { TimerAvatarRing, TurnTimerControls, useTurnCountdown } from './TurnTimer';
import { HINT_COST, POWERUP_COST, BET_CAP_AMOUNT, POWER_UPS } from '../constants';
import { isValidKeyWordTransformationPhrase, AudiencePollSummary } from '../utils/multiplayerProtocol';
import { PlayerAvatar } from './PlayerAvatar';

interface PlayerBettingCardProps {
  player: Player;
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
  const cardBaseClasses = "gc-panel rounded-gc-lg p-5 sm:p-7 transition-[opacity,border-color,box-shadow] duration-300 relative group overflow-hidden";
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
  const hasShield = activePowerUps.some(p => p.type === 'SHIELD');
  const hasSplitBet = activePowerUps.some(p => p.type === 'SPLIT_BET');
  const hasBlessing = player.effects.some(e => e.type === 'BLESSING');
  const hasCrucio = player.effects.some(e => e.type === 'CRUCIO');
  const isSilenced = player.effects.some(e => e.type === 'SILENCED');
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
      if (questionType === 'multipleChoice') {
        hasValidAnswer = hasSplitBet
          ? (bet?.splitOptions?.length || 0) >= 1
          : Boolean(bet?.selectedOption?.trim());
      } else if (questionType === 'keyWordTransformation') {
        hasValidAnswer = hasSplitBet
          ? (isValidKeyWordTransformationPhrase(bet?.splitClozeAnswers?.[0], baseWord) &&
              (!bet?.splitClozeAnswers?.[1]?.trim() || isValidKeyWordTransformationPhrase(bet?.splitClozeAnswers?.[1], baseWord))) ||
            (!bet?.splitClozeAnswers?.[0]?.trim() && isValidKeyWordTransformationPhrase(bet?.splitClozeAnswers?.[1], baseWord))
          : isValidKeyWordTransformationPhrase(bet?.clozeAnswer, baseWord);
      } else if (questionType === 'openCloze' || questionType === 'wordFormation') {
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
          if (questionType === 'multipleChoice') {
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
          if (questionType === 'multipleChoice') {
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
            if (questionType === 'multipleChoice') {
              firstOptionBtnRef.current?.focus();
              firstOptionBtnRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else if (questionType === 'openCloze' || questionType === 'wordFormation' || questionType === 'keyWordTransformation') {
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
    <div data-testid="betting-card" data-player-name={player.name} className={`${cardBaseClasses} ${glowClasses} ${bankruptClasses} ${frozenClasses} ${timerClasses}`}>
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
      
      {/* VIP Player Station Header */}
      <div className="flex flex-wrap justify-between items-center gap-4 mb-5 pb-5 border-b border-gc-line/[0.12] relative">
        <div className="flex items-center gap-3.5">
          <div className="relative">
            {showTimer && !isFrozen && (
              <TimerAvatarRing fraction={fraction} isWarning={isWarning} status={timerStatus} held={turnTimer?.held} />
            )}
            <button
              type="button"
              onClick={() => onChangeAvatar?.(player.id)}
              disabled={!onChangeAvatar}
              className={`w-14 h-14 rounded-full border-2 border-gc-turn/70 p-0.5 relative bg-gc-line/[0.08] flex items-center justify-center group/avatar transition-transform duration-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-gc-turn/50 ${
                onChangeAvatar ? 'cursor-pointer hover:scale-105 active:scale-95' : ''
              }`}
              title={onChangeAvatar ? `Click to customize ${player.name}'s character` : undefined}
              aria-label={`Change avatar for ${player.name}`}
            >
              <PlayerAvatar
                value={player.avatar}
                size="lg"
                className="w-full h-full transition-transform group-hover/avatar:scale-105"
              />
              {onChangeAvatar && (
                <span className="absolute -bottom-1 -right-1 z-20 w-5 h-5 bg-gc-gold text-gc-on-gold text-[10px] rounded-full flex items-center justify-center shadow-md opacity-90 group-hover/avatar:opacity-100 group-hover/avatar:scale-110 transition-all font-sans font-bold select-none">
                  🎭
                </span>
              )}
            </button>
            {hasSecondChance && (
              <PowerUpTooltip
                powerUpKey="SECOND_CHANCE"
                className="absolute -top-1 -right-1 z-10"
                placement="top"
              >
                <div className="text-base bg-gc-card border border-gc-gold/60 rounded-full w-6 h-6 flex items-center justify-center shadow-gc-1 cursor-help">
                  👼
                </div>
              </PowerUpTooltip>
            )}
          </div>
          <div>
            {isEditingName ? (
              <div className="flex items-center gap-1.5 py-0.5">
                <input
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  onBlur={handleNameSave}
                  onKeyDown={handleNameKeyDown}
                  autoFocus
                  maxLength={24}
                  className="text-gc-lead font-bold text-gc-ink bg-gc-line/[0.05] border-b-2 border-gc-gold px-2 py-0.5 w-36 sm:w-44 focus:outline-none rounded-t-md"
                  placeholder="Player name"
                />
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleNameSave();
                  }}
                  className="w-8 h-8 rounded-full bg-gc-win/15 hover:bg-gc-win/25 text-gc-win flex items-center justify-center cursor-pointer"
                  title="Save name"
                  aria-label="Save name"
                >
                  <Check className="w-4 h-4" strokeWidth={3} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setIsEditingName(false);
                    setTempName(player.name);
                  }}
                  className="w-8 h-8 rounded-full bg-gc-line/[0.08] hover:bg-gc-line/[0.14] text-gc-quiet flex items-center justify-center cursor-pointer"
                  title="Cancel"
                  aria-label="Cancel"
                >
                  <X className="w-4 h-4" strokeWidth={3} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <div
                onClick={handleNameClick}
                className={`group/name flex items-center gap-2 ${onUpdateName ? 'cursor-pointer' : ''}`}
                title={onUpdateName ? "Click to edit name" : undefined}
              >
                <h3 className={`text-gc-title font-sans font-extrabold transition-colors ${
                  powerUpUsedThisRound ? 'text-purple-700 dark:text-purple-300' : 'text-gc-ink'
                } ${onUpdateName ? 'group-hover/name:text-gc-money' : ''}`}>
                  {player.name}
                </h3>
                {onUpdateName && (
                  <Pencil className="w-4 h-4 text-gc-quiet opacity-0 group-hover/name:opacity-100 transition-opacity" aria-hidden="true" />
                )}
              </div>
            )}
             <div className="flex items-center gap-2 text-gc-small text-gc-quiet mt-1 flex-wrap empty:hidden">
                {player.winStreak > 1 && (
                  <span className="px-2 py-0.5 rounded-full bg-gc-gold/15 text-gc-money font-bold text-gc-cap whitespace-nowrap">
                    🔥 {player.winStreak} in a row
                  </span>
                )}
                {usedPowerUps.length > 0 && (
                  <div className="flex gap-1 items-center">
                    {usedPowerUps.map((usage, i) => {
                      const target = usage.targetId ? players.find(p => p.id === usage.targetId) : undefined;
                      return (
                        <PowerUpTooltip
                          key={i}
                          powerUpKey={usage.key}
                          targetName={target?.name}
                          placement="top"
                        />
                      );
                    })}
                  </div>
                )}
             </div>
          </div>
        </div>

        {/* Bankroll Vault Plaque */}
        <div className="flex flex-col items-end ml-auto">
           <div className="px-4 py-2 rounded-gc-sm bg-gc-line/[0.06] border border-gc-line/[0.12] flex flex-col items-end">
             <span className="text-gc-cap font-semibold text-gc-quiet">
               Balance
             </span>
             {isEditingMoney ? (
               <div className="flex items-center justify-end mt-0.5">
                 <span className="text-gc-title tabular-nums font-extrabold text-gc-money mr-1">$</span>
                 <input 
                   type="number"
                   value={tempMoney}
                   onChange={(e) => setTempMoney(e.target.value)}
                   onBlur={handleMoneySave}
                   onKeyDown={handleMoneyKeyDown}
                   onWheel={(e) => e.currentTarget.blur()}
                   autoFocus
                   className="text-gc-title tabular-nums font-extrabold text-gc-money bg-transparent border-b-2 border-gc-gold w-24 text-right focus:outline-none p-0 appearance-none rounded-none"
                 />
               </div>
             ) : (
               <div 
                 className={`text-gc-title font-sans tabular-nums font-extrabold text-gc-money ${onUpdateMoney ? 'cursor-pointer hover:brightness-125 transition-all' : ''}`}
                 onClick={handleMoneyClick}
                 title={onUpdateMoney ? "Click to change this player's balance" : ""}
               >
                 ${player.money.toLocaleString()}
               </div>
             )}
           </div>

           {targetAmount && targetAmount > 0 && (
             <div 
               className={`text-gc-cap tabular-nums mt-1.5 flex items-center gap-1.5 justify-end ${player.money >= targetAmount ? 'text-gc-win font-bold' : 'font-semibold text-gc-quiet'}`}
               title={`Target goal: $${targetAmount.toLocaleString()}`}
             >
               <span>Target ${targetAmount.toLocaleString()}</span>
               <span className={`px-2 py-0.5 rounded-full font-bold ${player.money >= targetAmount ? 'bg-gc-win/15 text-gc-win' : 'bg-gc-line/[0.07] text-gc-ink'}`}>
                 {Math.min(999, Math.round((player.money / targetAmount) * 100))}%
               </span>
             </div>
           )}
           
           <div className="flex flex-wrap gap-1.5 mt-2 justify-end">
              {hasSafetyNet && (
                <PowerUpTooltip powerUpKey="SAFETY_NET" placement="bottom">
                  <span className="px-2 py-0.5 bg-sky-500/15 border border-sky-400/60 text-sky-900 dark:text-sky-200 text-gc-cap font-semibold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>🦺</span>
                    <span>Safety Net</span>
                  </span>
                </PowerUpTooltip>
              )}
              {hasImmunity && (
                <PowerUpTooltip powerUpKey="IMMUNITY_IDOL" placement="bottom">
                  <span className="px-2 py-0.5 bg-amber-500/20 border border-amber-400/60 text-amber-900 dark:text-amber-200 text-gc-cap font-semibold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>🗿</span>
                    <span>Immune</span>
                  </span>
                </PowerUpTooltip>
              )}
              {hasJackpot && (
                <PowerUpTooltip powerUpKey="JACKPOT" placement="bottom">
                  <span className="px-2 py-0.5 bg-purple-500/20 border border-purple-400/60 text-purple-900 dark:text-purple-200 text-gc-cap font-semibold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>🎰</span>
                    <span>Jackpot</span>
                  </span>
                </PowerUpTooltip>
              )}
              {hasShield && (
                <PowerUpTooltip powerUpKey="SHIELD" placement="bottom">
                  <span className="px-2 py-0.5 bg-blue-500/20 border border-blue-400/60 text-blue-900 dark:text-blue-200 text-gc-cap font-semibold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>🛡️</span>
                    <span>Shield</span>
                  </span>
                </PowerUpTooltip>
              )}
              {hasSplitBet && (
                <PowerUpTooltip powerUpKey="SPLIT_BET" placement="bottom">
                  <span className="px-2 py-0.5 bg-indigo-500/20 border border-indigo-400/60 text-indigo-900 dark:text-indigo-200 text-gc-cap font-semibold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>⚖️</span>
                    <span>Split</span>
                  </span>
                </PowerUpTooltip>
              )}
              {hasBlessing && (
                <PowerUpTooltip powerUpKey="BLESSING" placement="bottom">
                  <span className="px-2 py-0.5 bg-pink-500/20 border border-pink-400/60 text-pink-900 dark:text-pink-200 text-gc-cap font-semibold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>💖</span>
                    <span>Blessed ({player.effects.find(e => e.type === 'BLESSING')?.roundsLeft || 0}r)</span>
                  </span>
                </PowerUpTooltip>
              )}
              {hasCrucio && (
                <PowerUpTooltip powerUpKey="CRUCIO" placement="bottom">
                  <span className="px-2 py-0.5 bg-slate-500/20 border border-slate-400/60 text-slate-800 dark:text-slate-300 text-gc-cap font-semibold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>⛓️</span>
                    <span>Cursed</span>
                  </span>
                </PowerUpTooltip>
              )}
              {isSilenced && (
                <PowerUpTooltip powerUpKey="SILENCER" placement="bottom">
                  <span className="px-2 py-0.5 bg-slate-500/20 border border-slate-400/60 text-slate-800 dark:text-slate-300 text-gc-cap font-semibold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>🤐</span>
                    <span>Silenced</span>
                  </span>
                </PowerUpTooltip>
              )}
              {hasTeachersPet && (
                <PowerUpTooltip powerUpKey="TEACHERS_PET" placement="bottom">
                  <span className="px-2 py-0.5 bg-red-500/20 border border-red-400/60 text-red-900 dark:text-red-200 text-gc-cap font-semibold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>🍎</span>
                    <span>Pet ({Math.min(player.winStreak, 3)}/3)</span>
                  </span>
                </PowerUpTooltip>
              )}
              {hasSavings && (
                <PowerUpTooltip powerUpKey="SAVINGS_ACCOUNT" placement="bottom">
                  <span className="px-2 py-0.5 bg-emerald-500/20 border border-emerald-400/60 text-emerald-900 dark:text-emerald-200 text-gc-cap font-semibold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>🏦</span>
                    <span>Savings</span>
                  </span>
                </PowerUpTooltip>
              )}
              {hasCorrectionBounty && (
                <PowerUpTooltip powerUpKey="CORRECTION_BOUNTY" placement="bottom">
                  <span className="px-2 py-0.5 bg-amber-500/20 border border-amber-400/60 text-amber-900 dark:text-amber-200 text-gc-cap font-semibold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>📝</span>
                    <span>Bounty</span>
                  </span>
                </PowerUpTooltip>
              )}
              {hasLoneWolf && (
                <PowerUpTooltip powerUpKey="LONE_WOLF" placement="bottom">
                  <span className="px-2 py-0.5 bg-slate-500/20 border border-slate-400/60 text-slate-800 dark:text-slate-200 text-gc-cap font-semibold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>🐺</span>
                    <span>Lone Wolf</span>
                  </span>
                </PowerUpTooltip>
              )}
              {isBetCapped && (
                <PowerUpTooltip icon="🧢" name="Bet Cap" description={`Bet capped at a maximum of $${effectiveBetCap} this round.`} placement="bottom">
                  <span className="px-2 py-0.5 bg-amber-500/20 border border-amber-500 text-amber-900 dark:text-amber-200 text-gc-cap font-semibold rounded-full flex items-center gap-1 cursor-help hover:brightness-110 shadow-sm animate-pulse">
                    <span>🧢</span>
                    <span>Capped (${effectiveBetCap})</span>
                  </span>
                </PowerUpTooltip>
              )}
              {isHighRoller && (
                <PowerUpTooltip icon="🔥" name="High Roller" description={`Forced minimum bet of $${effectiveMinBet.toLocaleString()} (50% of bankroll) this round.`} placement="bottom">
                  <span className="px-2 py-0.5 bg-orange-500/25 border border-orange-500 text-orange-950 dark:text-orange-200 text-gc-cap font-semibold rounded-full flex items-center gap-1 cursor-help hover:brightness-110 shadow-sm animate-pulse">
                    <span>🔥</span>
                    <span>High Roller (Min ${effectiveMinBet})</span>
                  </span>
                </PowerUpTooltip>
              )}
              {hasScalpel && (
                <PowerUpTooltip powerUpKey="SCALPEL" placement="bottom">
                  <span className="px-2 py-0.5 bg-cyan-500/20 border border-cyan-400/60 text-cyan-900 dark:text-cyan-200 text-gc-cap font-semibold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>✂️</span>
                    <span>50/50 Scalpel</span>
                  </span>
                </PowerUpTooltip>
              )}
              {hasCopycat && (
                <PowerUpTooltip powerUpKey="COPYCAT" placement="bottom">
                  <span className="px-2 py-0.5 bg-violet-500/20 border border-violet-400/60 text-violet-900 dark:text-violet-200 text-gc-cap font-semibold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>🪞</span>
                    <span>Copycat</span>
                  </span>
                </PowerUpTooltip>
              )}
              {hasBloodPact && (
                <PowerUpTooltip powerUpKey="BLOOD_PACT" placement="bottom">
                  <span className="px-2 py-0.5 bg-rose-500/20 border border-rose-400/60 text-rose-900 dark:text-rose-200 text-gc-cap font-semibold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>🤝</span>
                    <span>Blood Pact</span>
                  </span>
                </PowerUpTooltip>
              )}
              {hasCrowdSurfer && (
                <PowerUpTooltip powerUpKey="CROWD_SURFER" placement="bottom">
                  <span className="px-2 py-0.5 bg-teal-500/20 border border-teal-400/60 text-teal-900 dark:text-teal-200 text-gc-cap font-semibold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>📢</span>
                    <span>Crowd Surfer</span>
                  </span>
                </PowerUpTooltip>
              )}
              {hasDoubleOrNothing && (
                <PowerUpTooltip powerUpKey="DOUBLE_OR_NOTHING" placement="bottom">
                  <span className="px-2 py-0.5 bg-amber-500/25 border border-amber-400 text-amber-950 dark:text-[#fef08a] text-gc-cap font-semibold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>🎲</span>
                    <span>3× or -1.5×</span>
                  </span>
                </PowerUpTooltip>
              )}
              {hasBoomerang && (
                <PowerUpTooltip powerUpKey="BOOMERANG" placement="bottom">
                  <span className="px-2 py-0.5 bg-lime-500/20 border border-lime-400/60 text-lime-900 dark:text-lime-200 text-gc-cap font-semibold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>🪃</span>
                    <span>Boomerang</span>
                  </span>
                </PowerUpTooltip>
              )}
              {hasAudiencePoll && (
                <PowerUpTooltip powerUpKey="AUDIENCE_POLL" placement="bottom">
                  <span className="px-2 py-0.5 bg-sky-500/20 border border-sky-400/60 text-sky-900 dark:text-sky-200 text-gc-cap font-semibold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>📊</span>
                    <span>Ask the Table</span>
                  </span>
                </PowerUpTooltip>
              )}
              {hasUnderdog && (
                <PowerUpTooltip powerUpKey="UNDERDOG" placement="bottom">
                  <span className="px-2 py-0.5 bg-orange-500/20 border border-orange-400/60 text-orange-900 dark:text-orange-200 text-gc-cap font-semibold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>🚀</span>
                    <span>Underdog (2.5×)</span>
                  </span>
                </PowerUpTooltip>
              )}
              {hasScavenger && (
                <PowerUpTooltip powerUpKey="SCAVENGER" placement="bottom">
                  <span className="px-2 py-0.5 bg-amber-600/20 border border-amber-500/60 text-amber-950 dark:text-amber-200 text-gc-cap font-semibold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>🦅</span>
                    <span>Scavenger (25%)</span>
                  </span>
                </PowerUpTooltip>
              )}
           </div>
        </div>
      </div>

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
                      className="h-full bg-gc-info rounded-full transition-all duration-300"
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
          {questionType === 'multipleChoice' ? (
            <>
              {/* Multiple-Choice Cloze (4 Options: A, B, C, D) */}
              {hasSplitBet && (() => {
                const splitOpts = Array.isArray(bet?.splitOptions) ? bet!.splitOptions! : [];
                const isDoubleStacked = splitOpts.length === 2 && splitOpts[0] === splitOpts[1];
                return (
                  <div className="p-3.5 rounded-gc bg-indigo-500/10 border border-indigo-500/30 dark:border-indigo-300/30 flex flex-wrap items-center justify-between gap-2 text-gc-small text-gc-ink">
                    <div className="flex items-center gap-2 font-bold">
                      <span aria-hidden="true">⚖️</span>
                      <span>
                        {isDoubleStacked
                          ? 'Split bet: all of it on one option (pays 2×)'
                          : 'Split bet: pick two options, or tap one twice to put it all there'}
                      </span>
                    </div>
                    <span className={`tabular-nums text-gc-cap font-bold px-2.5 py-1 rounded-full ${
                      isDoubleStacked
                        ? 'bg-gc-gold/15 text-gc-money'
                        : 'bg-indigo-500/15 text-indigo-800 dark:text-indigo-200'
                    }`}>
                      {isDoubleStacked
                        ? `All on one · $${actualBetAmount.toLocaleString()}`
                        : `${splitOpts.length} of 2 picked · $${Math.floor(actualBetAmount / 2).toLocaleString()} each`}
                    </span>
                  </div>
                );
              })()}

              <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl transition-all ${highlightAnswerMissing ? 'ring-2 ring-rose-500 p-1.5 bg-rose-500/5' : ''}`}>
                {(() => {
                  const optionItems = options.length > 0 ? options : ['Option A', 'Option B', 'Option C', 'Option D'];
                  const firstUnpickedIdx = Math.max(
                    0,
                    optionItems.findIndex(o =>
                      hasSplitBet
                        ? !(Array.isArray(bet?.splitOptions) && bet!.splitOptions!.includes(o))
                        : bet?.selectedOption !== o
                    )
                  );
                  const eliminatedSet = new Set(
                    (scalpelHint?.eliminatedOptions || []).map(o => o.trim().toLowerCase())
                  );
                  return optionItems.map((opt, idx) => {
                    const letter = ['A', 'B', 'C', 'D'][idx] || String(idx + 1);
                    const isEliminatedOpt = eliminatedSet.has(opt.trim().toLowerCase());
                    const optPickCount = hasSplitBet && Array.isArray(bet?.splitOptions)
                      ? bet!.splitOptions!.filter(o => o === opt).length
                      : 0;
                    const isStacked2x = hasSplitBet && optPickCount === 2;
                    const splitPicked = hasSplitBet && optPickCount > 0;
                    const singlePicked = !hasSplitBet && bet?.selectedOption === opt;
                    const isPicked = hasSplitBet ? splitPicked : singlePicked;

                    return (
                      <button
                        key={`${letter}-${opt}`}
                        ref={idx === firstUnpickedIdx ? firstOptionBtnRef : undefined}
                        type="button"
                        disabled={isBlocked || isEliminatedOpt}
                        onClick={() => {
                          if (isBlocked || isEliminatedOpt) return;
                          if (hasSplitBet) {
                            const currentList = Array.isArray(bet?.splitOptions) ? [...bet!.splitOptions!] : [];
                            const countForOpt = currentList.filter(o => o === opt).length;
                            if (countForOpt === 2) {
                              // 3rd click on a 2x stacked option clears it
                              onBetChange(player.id, 'splitOptions', []);
                            } else if (countForOpt === 1 && currentList.length === 1) {
                              // 2nd click on the same single option stacks 100% (2x)
                              onBetChange(player.id, 'splitOptions', [opt, opt]);
                            } else if (countForOpt === 1 && currentList.length === 2) {
                              // Clicking one of two distinct options deselects it
                              onBetChange(player.id, 'splitOptions', currentList.filter(o => o !== opt));
                            } else if (currentList.length < 2) {
                              // 1st click on an unpicked option
                              onBetChange(player.id, 'splitOptions', [...currentList, opt]);
                            } else {
                              // Replacing second slot when 2 picks already exist
                              onBetChange(player.id, 'splitOptions', [currentList[0], opt]);
                            }
                          } else {
                            onBetChange(player.id, 'selectedOption', opt);
                          }
                        }}
                        className={`relative overflow-hidden min-h-[64px] py-3 px-4 rounded-gc font-sans transition-colors duration-150 border-2 flex items-center justify-between gap-3 select-none group/opt text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-gc-turn/40 ${
                          isEliminatedOpt
                            ? 'opacity-50 cursor-not-allowed bg-gc-line/[0.04] border-gc-loss/30 text-gc-quiet line-through'
                            : isPicked
                              ? hasSplitBet
                                ? isStacked2x
                                  ? 'cursor-pointer bg-gc-gold/15 border-gc-gold text-gc-ink animate-gc-pulse'
                                  : 'cursor-pointer bg-indigo-500/10 border-indigo-500 dark:border-indigo-300 text-gc-ink animate-gc-pulse'
                                : 'cursor-pointer bg-gc-gold/15 border-gc-gold text-gc-ink animate-gc-pulse'
                              : 'cursor-pointer bg-gc-line/[0.06] border-gc-line/[0.14] text-gc-ink hover:border-gc-gold/60'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={`w-9 h-9 rounded-full flex items-center justify-center font-sans tabular-nums font-extrabold text-gc-body border shrink-0 ${
                            isPicked
                              ? hasSplitBet
                                ? isStacked2x
                                  ? 'bg-gc-gold text-gc-on-gold border-transparent'
                                  : 'bg-indigo-600 dark:bg-indigo-300 text-white dark:text-indigo-950 border-transparent'
                                : 'bg-gc-gold text-gc-on-gold border-transparent'
                              : 'bg-gc-line/[0.08] border-gc-line/[0.14] text-gc-quiet'
                          }`}>
                            {letter}
                          </span>
                          <span className={`text-gc-lead font-sentence italic font-semibold truncate ${isEliminatedOpt ? 'line-through' : ''}`}>
                            {opt}
                          </span>
                        </div>
                        {isEliminatedOpt ? (
                          <span className="text-gc-cap font-bold px-2.5 py-1 rounded-full bg-gc-loss/15 text-gc-loss shrink-0 no-underline">
                            ✂️ Cut
                          </span>
                        ) : isPicked ? (
                          <span className={`text-gc-cap tabular-nums font-bold px-2.5 py-1 rounded-full shrink-0 ${
                            hasSplitBet
                              ? isStacked2x
                                ? 'bg-gc-gold text-gc-on-gold'
                                : 'bg-indigo-600 dark:bg-indigo-300 text-white dark:text-indigo-950'
                              : 'bg-gc-gold text-gc-on-gold'
                          }`}>
                            {hasSplitBet ? (isStacked2x ? '100% (2×)' : '50%') : 'Your pick'}
                          </span>
                        ) : null}
                      </button>
                    );
                  });
                })()}
              </div>

              {/* Wager Input & All-In Control */}
              <div className="space-y-2">
                <div className="flex gap-2.5">
                  <div className="relative flex-1">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gc-money font-sans tabular-nums font-extrabold text-gc-title select-none">$</span>
                    <TextInput
                      ref={wagerInputRef}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={String(betAmount)}
                      onChange={handleBetAmountChange}
                      placeholder={isBetCapped ? `Up to $${effectiveBetCap}` : "Your bet"}
                      disabled={isBlocked || player.money === 0}
                      className={`w-full pl-9 pr-4 text-gc-title font-sans tabular-nums font-extrabold text-gc-money h-14 placeholder:text-gc-body placeholder:font-semibold ${highlightWagerMissing ? '!border-rose-500 ring-2 ring-rose-500/50' : ''}`}
                    />
                  </div>
                  <ActionButton
                    onClick={handleAllIn}
                    disabled={isBlocked || player.money === 0}
                    variant="ghost"
                    className="h-14 px-5 text-gc-body font-bold whitespace-nowrap"
                  >
                    {isBetCapped && effectiveBetCap < player.money ? `Max ($${effectiveBetCap})` : 'All in'}
                  </ActionButton>
                </div>

                {isBetCapped && (
                  <div className="text-gc-small font-semibold text-gc-money flex items-center gap-1.5 px-3 py-2 bg-gc-gold/15 rounded-gc-sm">
                    <span>🧢</span>
                    <span>Bet cap: you can bet up to ${effectiveBetCap} this hand.</span>
                  </div>
                )}
                {isHighRoller && (
                  <div className="text-gc-small font-semibold text-gc-loss flex items-center gap-1.5 px-3 py-2 bg-gc-loss/15 rounded-gc-sm">
                    <span>🔥</span>
                    <span>High roller: you must bet at least ${effectiveMinBet.toLocaleString()} (half your balance).</span>
                  </div>
                )}
              </div>

              <QuickChipTray
                currentBet={actualBetAmount}
                playerMoney={player.money}
                maxBet={isBetCapped ? effectiveBetCap : undefined}
                onAddAmount={handleAddQuickChip}
                onClear={handleClearBet}
                onAllIn={handleAllIn}
                disabled={isBlocked}
                playSound={playSound}
              />

              {actualBetAmount > 0 && (
                <WagerChipsDisplay
                  amount={actualBetAmount}
                  label={
                    hasSplitBet
                      ? Array.isArray(bet?.splitOptions) && bet!.splitOptions!.length === 2 && bet!.splitOptions![0] === bet!.splitOptions![1]
                        ? "Your split bet (all on one)"
                        : "Your split bet (half each)"
                      : "Your bet"
                  }
                />
              )}
            </>
          ) : (questionType === 'openCloze' || questionType === 'wordFormation' || questionType === 'keyWordTransformation') ? (
            <>
              {/* Open Cloze, Word Formation & Key Word Transformation */}
              {questionType === 'wordFormation' && baseWord && (
                <div className="p-3.5 rounded-gc bg-gc-gold/10 border border-gc-gold/40 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span aria-hidden="true">🧬</span>
                    <span className="text-gc-small font-bold text-gc-ink">
                      Change the form of this word
                    </span>
                  </div>
                  <span className="px-3.5 py-1 rounded-full bg-gc-gold text-gc-on-gold font-extrabold text-gc-body tracking-wider">
                    ({baseWord.toUpperCase()})
                  </span>
                </div>
              )}
              {questionType === 'keyWordTransformation' && baseWord && (
                <div className="p-3.5 rounded-gc bg-gc-gold/10 border border-gc-gold/40 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span aria-hidden="true">🔑</span>
                    <div>
                      <div className="text-gc-small font-bold text-gc-ink">
                        Key word (don't change it)
                      </div>
                      <div className="text-gc-cap text-gc-quiet">
                        Use 2 to 6 words. One mark pays 1×, two marks pay 2×.
                      </div>
                    </div>
                  </div>
                  <span className="px-3.5 py-1 rounded-full bg-gc-gold text-gc-on-gold font-extrabold text-gc-body tracking-wider">
                    {baseWord.toUpperCase()}
                  </span>
                </div>
              )}
              {scalpelHint?.clozeMask && (
                <div className="p-3.5 rounded-gc bg-gc-info/10 border border-gc-info/35 flex items-center justify-between gap-2 text-gc-small text-gc-ink">
                  <span className="font-bold flex items-center gap-1.5">
                    <span aria-hidden="true">✂️</span>
                    <span>Scalpel clue</span>
                  </span>
                  <span className="tabular-nums font-extrabold text-gc-body px-3 py-0.5 rounded-full bg-gc-info/15 text-gc-info tracking-wider">
                    {scalpelHint.clozeMask}
                  </span>
                </div>
              )}
              {hasSplitBet ? (() => {
                const w1 = (bet?.splitClozeAnswers?.[0] || '').trim();
                const w2 = (bet?.splitClozeAnswers?.[1] || '').trim();
                const isSingleOrSameWord =
                  (Boolean(w1) && !w2) ||
                  (!w1 && Boolean(w2)) ||
                  (Boolean(w1) && Boolean(w2) && w1.toLowerCase() === w2.toLowerCase());
                return (
                  <div className={`p-4 sm:p-5 rounded-gc bg-indigo-500/[0.07] border border-indigo-500/30 dark:border-indigo-300/30 space-y-3 ${highlightAnswerMissing || isUnchangedBaseWord || isInvalidKwtPhrase ? 'ring-2 ring-rose-500' : ''}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-gc-small font-bold text-gc-ink flex items-center gap-1.5">
                        <span aria-hidden="true">⚖️</span>
                        <span>
                          {questionType === 'keyWordTransformation'
                            ? 'Split bet: one answer (all of it) or two answers (half each)'
                            : 'Split bet: one word (all of it) or two words (half each)'}
                        </span>
                      </span>
                      <span className={`text-gc-cap tabular-nums font-bold px-2.5 py-1 rounded-full ${
                        isSingleOrSameWord
                          ? 'bg-gc-gold/15 text-gc-money'
                          : 'bg-indigo-500/15 text-indigo-800 dark:text-indigo-200'
                      }`}>
                        {isSingleOrSameWord
                          ? `All on one · $${actualBetAmount.toLocaleString()}`
                          : `$${Math.floor(actualBetAmount / 2).toLocaleString()} on each`}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-gc-cap font-semibold text-gc-quiet mb-1">
                          {isSingleOrSameWord && Boolean(w1) && !w2
                            ? 'First answer (all of the bet)'
                            : 'First answer (half)'}
                        </label>
                        <input
                          ref={splitWord1InputRef}
                          type="text"
                          value={bet?.splitClozeAnswers?.[0] || ''}
                          onChange={(e) => {
                            if (isBlocked) return;
                            const val =
                              questionType === 'keyWordTransformation'
                                ? e.target.value.replace(/\s{2,}/g, ' ')
                                : e.target.value.replace(/\s+/g, '');
                            const second = bet?.splitClozeAnswers?.[1] || '';
                            onBetChange(player.id, 'splitClozeAnswers', [val, second]);
                          }}
                          disabled={isBlocked}
                          placeholder={
                            questionType === 'keyWordTransformation' && baseWord
                              ? `2 to 6 words with ${baseWord.toUpperCase()}`
                              : questionType === 'wordFormation' && baseWord
                                ? `A new form of ${baseWord.toUpperCase()}`
                                : 'One word'
                          }
                          maxLength={questionType === 'keyWordTransformation' ? 80 : 32}
                          className="w-full h-12 px-4 rounded-gc-sm bg-gc-line/[0.05] border border-gc-line/[0.2] text-gc-ink placeholder:text-gc-quiet/70 focus:outline-none focus:border-gc-gold focus:ring-2 focus:ring-gc-gold/30 transition-colors font-sentence italic font-semibold text-gc-lead"
                        />
                      </div>
                      <div>
                        <label className="block text-gc-cap font-semibold text-gc-quiet mb-1">
                          {isSingleOrSameWord && Boolean(w2) && !w1
                            ? 'Second answer (all of the bet)'
                            : isSingleOrSameWord && Boolean(w1) && Boolean(w2)
                            ? 'Second answer (same word, all of the bet)'
                            : 'Second answer (optional, half)'}
                        </label>
                        <input
                          ref={splitWord2InputRef}
                          type="text"
                          value={bet?.splitClozeAnswers?.[1] || ''}
                          onChange={(e) => {
                            if (isBlocked) return;
                            const first = bet?.splitClozeAnswers?.[0] || '';
                            const val =
                              questionType === 'keyWordTransformation'
                                ? e.target.value.replace(/\s{2,}/g, ' ')
                                : e.target.value.replace(/\s+/g, '');
                            onBetChange(player.id, 'splitClozeAnswers', [first, val]);
                          }}
                          disabled={isBlocked}
                          placeholder={
                            questionType === 'keyWordTransformation'
                              ? 'Leave empty to bet it all on the first'
                              : 'Leave empty to bet it all on the first'
                          }
                          maxLength={questionType === 'keyWordTransformation' ? 80 : 32}
                          className="w-full h-12 px-4 rounded-gc-sm bg-gc-line/[0.05] border border-gc-line/[0.2] text-gc-ink placeholder:text-gc-quiet/70 focus:outline-none focus:border-gc-gold focus:ring-2 focus:ring-gc-gold/30 transition-colors font-sentence italic font-semibold text-gc-lead"
                        />
                      </div>
                    </div>
                  </div>
                );
              })() : (
                <div className={`p-4 rounded-gc bg-gc-line/[0.04] border border-gc-line/[0.12] space-y-2.5 ${highlightAnswerMissing || isUnchangedBaseWord || isInvalidKwtPhrase ? 'ring-2 ring-rose-500 !border-rose-500' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-gc-small font-bold text-gc-ink flex items-center gap-1.5">
                      <span>
                        {questionType === 'keyWordTransformation'
                          ? '🔑'
                          : questionType === 'wordFormation'
                            ? '🧬'
                            : '✍️'}
                      </span>
                      <span>
                        {questionType === 'keyWordTransformation'
                          ? `Fill the gap using ${(baseWord || 'KEY').toUpperCase()}`
                          : questionType === 'wordFormation'
                            ? `Change ${(baseWord || 'ROOT').toUpperCase()} to fit the gap`
                            : 'Type the missing word'}
                      </span>
                    </label>
                    <span className="text-gc-cap font-semibold text-gc-quiet shrink-0">
                      {questionType === 'keyWordTransformation' ? '2 to 6 words' : 'One word'}
                    </span>
                  </div>
                  <input
                    ref={clozeWordInputRef}
                    type="text"
                    value={bet?.clozeAnswer || ''}
                    onChange={(e) => {
                      if (isBlocked) return;
                      const val =
                        questionType === 'keyWordTransformation'
                          ? e.target.value.replace(/\s{2,}/g, ' ')
                          : e.target.value.replace(/\s+/g, '');
                      onBetChange(player.id, 'clozeAnswer', val);
                    }}
                    disabled={isBlocked}
                    placeholder={
                      questionType === 'keyWordTransformation' && baseWord
                        ? `2 to 6 words, including ${baseWord.toUpperCase()}`
                        : questionType === 'wordFormation' && baseWord
                          ? `A new form of ${baseWord.toUpperCase()}`
                          : 'The missing word'
                    }
                    maxLength={questionType === 'keyWordTransformation' ? 80 : 32}
                    className="w-full h-14 px-4 rounded-gc-sm bg-gc-card/60 border border-gc-line/[0.2] text-gc-ink placeholder:text-gc-quiet/70 placeholder:not-italic placeholder:font-sans placeholder:text-gc-body focus:outline-none focus:border-gc-gold focus:ring-2 focus:ring-gc-gold/30 transition-colors font-sentence italic font-semibold text-gc-title"
                  />
                  {questionType === 'keyWordTransformation' && (() => {
                    const check = inspectKwtPhrase(bet?.clozeAnswer);
                    if (!check.trimmed) return null;
                    return (
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-gc-cap">
                        <span
                          className={`px-2.5 py-1 rounded-full font-bold ${
                            check.hasKeyWord
                              ? 'bg-gc-win/15 text-gc-win'
                              : 'bg-gc-loss/15 text-gc-loss'
                          }`}
                        >
                          {check.hasKeyWord
                            ? `✓ Key word ${(baseWord || 'KEY').toUpperCase()} is in`
                            : `Use ${(baseWord || 'KEY').toUpperCase()} without changing it`}
                        </span>
                        <span
                          className={`px-2.5 py-1 rounded-full tabular-nums font-bold ${
                            check.isValidCount
                              ? 'bg-gc-win/15 text-gc-win'
                              : 'bg-gc-gold/15 text-gc-money'
                          }`}
                        >
                          {check.wordCount} of 2 to 6 words
                        </span>
                      </div>
                    );
                  })()}
                </div>
              )}
              {isUnchangedBaseWord && (
                <div className="px-4 py-3 rounded-gc bg-gc-loss/10 border border-gc-loss/50 text-gc-ink text-gc-small font-semibold flex items-center gap-2.5 animate-gc-slide-up">
                  <AlertTriangle className="w-5 h-5 shrink-0 text-gc-loss" aria-hidden="true" />
                  <span>
                    That's the base word as it is (<strong>{(baseWord || '').toUpperCase()}</strong>). Change its form, for example with a prefix or suffix, before you lock in.
                  </span>
                </div>
              )}

              {/* Wager Input & All-In Control */}
              <div className="space-y-2">
                <div className="flex gap-2.5">
                  <div className="relative flex-1">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gc-money font-sans tabular-nums font-extrabold text-gc-title select-none">$</span>
                    <TextInput
                      ref={wagerInputRef}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={String(betAmount)}
                      onChange={handleBetAmountChange}
                      placeholder={isBetCapped ? `Up to $${effectiveBetCap}` : "Your bet"}
                      disabled={isBlocked || player.money === 0}
                      className={`w-full pl-9 pr-4 text-gc-title font-sans tabular-nums font-extrabold text-gc-money h-14 placeholder:text-gc-body placeholder:font-semibold ${highlightWagerMissing ? '!border-rose-500 ring-2 ring-rose-500/50' : ''}`}
                    />
                  </div>
                  <ActionButton
                    onClick={handleAllIn}
                    disabled={isBlocked || player.money === 0}
                    variant="ghost"
                    className="h-14 px-5 text-gc-body font-bold whitespace-nowrap"
                  >
                    {isBetCapped && effectiveBetCap < player.money ? `Max ($${effectiveBetCap})` : 'All in'}
                  </ActionButton>
                </div>

                {isBetCapped && (
                  <div className="text-gc-small font-semibold text-gc-money flex items-center gap-1.5 px-3 py-2 bg-gc-gold/15 rounded-gc-sm">
                    <span>🧢</span>
                    <span>Bet cap: you can bet up to ${effectiveBetCap} this hand.</span>
                  </div>
                )}
                {isHighRoller && (
                  <div className="text-gc-small font-semibold text-gc-loss flex items-center gap-1.5 px-3 py-2 bg-gc-loss/15 rounded-gc-sm">
                    <span>🔥</span>
                    <span>High roller: you must bet at least ${effectiveMinBet.toLocaleString()} (half your balance).</span>
                  </div>
                )}
              </div>

              <QuickChipTray
                currentBet={actualBetAmount}
                playerMoney={player.money}
                maxBet={isBetCapped ? effectiveBetCap : undefined}
                onAddAmount={handleAddQuickChip}
                onClear={handleClearBet}
                onAllIn={handleAllIn}
                disabled={isBlocked}
                playSound={playSound}
              />

              {actualBetAmount > 0 && (() => {
                const w1 = (bet?.splitClozeAnswers?.[0] || '').trim();
                const w2 = (bet?.splitClozeAnswers?.[1] || '').trim();
                const isSingleOrSame =
                  (Boolean(w1) && !w2) ||
                  (!w1 && Boolean(w2)) ||
                  (Boolean(w1) && Boolean(w2) && w1.toLowerCase() === w2.toLowerCase());
                return (
                  <WagerChipsDisplay
                    amount={actualBetAmount}
                    label={
                      hasSplitBet
                        ? isSingleOrSame
                          ? "Your split bet (all on one)"
                          : "Your split bet (half each)"
                        : "Your bet"
                    }
                  />
                );
              })()}
            </>
          ) : hasSplitBet ? (
            <div className="p-5 rounded-gc bg-indigo-500/[0.07] border border-indigo-500/30 dark:border-indigo-300/30 relative overflow-hidden">
              <div className="flex justify-between items-center mb-4 relative z-10">
                 <h4 className="text-gc-lead font-bold text-gc-ink flex items-center gap-2"><span aria-hidden="true">⚖️</span> Split bet</h4>
                 <span className="text-gc-cap text-gc-quiet">Put some on Valid and some on Flawed</span>
              </div>
              
              <div className="mb-5 relative z-10">
                 <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gc-money tabular-nums font-extrabold text-gc-title select-none">$</span>
                    <TextInput 
                        ref={wagerInputRef}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={String(betAmount)}
                        onChange={handleBetAmountChange}
                        placeholder={isBetCapped ? `Up to $${effectiveBetCap}` : "Your whole bet"}
                        disabled={isBlocked || player.money === 0}
                        className={`pl-9 pr-28 text-gc-title tabular-nums font-extrabold text-gc-money h-14 placeholder:text-gc-body placeholder:font-semibold ${highlightWagerMissing ? '!border-rose-500 ring-2 ring-rose-500/50' : ''}`}
                    />
                    <button
                      type="button"
                      onClick={handleAllIn}
                      disabled={isBlocked || player.money === 0}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 h-9 px-3.5 rounded-full text-gc-small font-bold bg-gc-line/[0.07] border border-gc-line/[0.16] text-gc-ink hover:border-gc-line/30 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isBetCapped && effectiveBetCap < player.money ? `Up to $${effectiveBetCap}` : 'All in'}
                    </button>
                 </div>

                 <div className="mt-3 space-y-2.5 relative z-10">
                   <QuickChipTray
                     currentBet={actualBetAmount}
                     playerMoney={player.money}
                     maxBet={isBetCapped ? effectiveBetCap : undefined}
                     onAddAmount={handleAddQuickChip}
                     onClear={handleClearBet}
                     onAllIn={handleAllIn}
                     disabled={isBlocked}
                     playSound={playSound}
                   />
                   {actualBetAmount > 0 && (
                     <WagerChipsDisplay amount={actualBetAmount} label="Your split bet" />
                   )}
                 </div>
              </div>

              <div className="mb-2 flex justify-between text-gc-small font-bold relative z-10">
                <span className="text-gc-loss">Flawed {100 - splitPercent}%</span>
                <span className="text-gc-win">Valid {splitPercent}%</span>
              </div>
              
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={splitPercent} 
                onChange={(e) => onBetChange(player.id, 'splitCorrectPercent', parseInt(e.target.value))}
                aria-label="How much goes on Valid"
                className="w-full h-2 rounded-lg appearance-none cursor-pointer mb-4 relative z-10"
                disabled={isBlocked}
              />
              
              <div className="flex justify-between gap-3 relative z-10">
                 <div className="flex-1 bg-gc-loss/10 border border-gc-loss/30 rounded-gc-sm p-3 text-center">
                    <div className="text-gc-cap font-semibold text-gc-loss">On Flawed</div>
                    <div className="text-gc-title tabular-nums text-gc-loss font-extrabold">${splitIncorrectAmount.toLocaleString()}</div>
                 </div>
                 <div className="flex-1 bg-gc-win/10 border border-gc-win/30 rounded-gc-sm p-3 text-center">
                    <div className="text-gc-cap font-semibold text-gc-win">On Valid</div>
                    <div className="text-gc-title tabular-nums text-gc-win font-extrabold">${splitCorrectAmount.toLocaleString()}</div>
                 </div>
              </div>

               {/* Correction Input for Split Bet */}
               {splitPercent < 100 && (
                 <div className="mt-4 animate-fade-in text-left relative z-10">
                    <label className="block text-gc-small font-bold text-gc-ink mb-1.5">
                      {hasDoubleOrNothing ? (
                        <span className="text-amber-600 dark:text-amber-400 font-extrabold">
                          🎲 Double or Nothing: correction required for 3× win
                        </span>
                      ) : (
                        'Bonus: write the corrected sentence'
                      )}
                    </label>
                    <textarea 
                      value={bet?.userCorrection || ''}
                      onChange={handleCorrectionChange}
                      onDoubleClick={() => {
                        if (!isBlocked && currentSentenceText) {
                          playSound('click');
                          onBetChange(player.id, 'userCorrection', currentSentenceText);
                        }
                      }}
                      onTouchEnd={() => {
                        const now = Date.now();
                        if (now - lastCorrectionTapRef.current <= 350) {
                          lastCorrectionTapRef.current = 0;
                          if (!isBlocked && currentSentenceText) {
                            playSound('click');
                            onBetChange(player.id, 'userCorrection', currentSentenceText);
                          }
                        } else {
                          lastCorrectionTapRef.current = now;
                        }
                      }}
                      disabled={isBlocked}
                      placeholder={
                        hasDoubleOrNothing
                          ? 'Write the corrected sentence (leaving this blank or wrong on a Flawed sentence loses 1.5× your bet)...'
                          : 'Write the corrected sentence (double-click or double-tap to copy the original)'
                      }
                      className={`w-full bg-gc-line/[0.05] border rounded-gc-sm px-4 py-3 text-gc-ink placeholder:text-gc-quiet/70 focus:outline-none focus:border-gc-gold focus:ring-2 focus:ring-gc-gold/30 transition-colors resize-none font-sentence italic h-20 text-gc-body ${
                        hasDoubleOrNothing && !bet?.userCorrection?.trim()
                          ? 'border-amber-500/60 bg-amber-500/[0.04]'
                          : 'border-gc-line/[0.2]'
                      }`}
                    />
                    {hasDoubleOrNothing && !bet?.userCorrection?.trim() && (
                      <p className="mt-1.5 text-gc-cap font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-gc-sm px-2.5 py-1.5">
                        ⚠️ Heads up: With Double or Nothing active, flagging a Flawed sentence without a valid correction results in a −1.5× loss.
                      </p>
                    )}
                 </div>
              )}
            </div>
          ) : (
            <>
              {/* Valid / Flawed: two big buttons that fill with green or red when picked */}
              <div className={`grid grid-cols-2 gap-3.5 rounded-gc transition-all ${highlightAnswerMissing ? 'ring-2 ring-rose-500 p-1.5 bg-rose-500/5' : ''}`}>
                <button
                  ref={firstOpinionBtnRef}
                  type="button"
                  onClick={() => handleOpinionClick('correct')}
                  disabled={isBlocked}
                  aria-pressed={bet?.opinion === 'correct'}
                  className={`min-h-[96px] px-4 py-3 rounded-gc border-2 flex items-center justify-center gap-3.5 cursor-pointer select-none transition-colors duration-150 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-400/40 disabled:cursor-not-allowed ${
                    bet?.opinion === 'correct'
                      ? 'bg-gc-win/15 border-emerald-700 dark:border-emerald-400 text-gc-win animate-gc-pulse'
                      : 'bg-gc-line/[0.06] border-gc-line/[0.14] text-gc-ink hover:border-emerald-600/60 dark:hover:border-emerald-400/60'
                  }`}
                >
                  <Check className="w-7 h-7 shrink-0" strokeWidth={2.6} aria-hidden="true" />
                  <span className="text-left">
                    <span className="block text-gc-lead sm:text-[22px] font-extrabold leading-tight">Valid</span>
                    <span className="block text-gc-small font-semibold text-gc-quiet">Grammatically correct</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpinionClick('incorrect')}
                  disabled={isBlocked}
                  aria-pressed={bet?.opinion === 'incorrect'}
                  className={`min-h-[96px] px-4 py-3 rounded-gc border-2 flex items-center justify-center gap-3.5 cursor-pointer select-none transition-colors duration-150 focus:outline-none focus-visible:ring-4 focus-visible:ring-rose-400/40 disabled:cursor-not-allowed ${
                    bet?.opinion === 'incorrect'
                      ? 'bg-gc-loss/15 border-rose-700 dark:border-rose-400 text-gc-loss animate-gc-pulse'
                      : 'bg-gc-line/[0.06] border-gc-line/[0.14] text-gc-ink hover:border-rose-600/60 dark:hover:border-rose-400/60'
                  }`}
                >
                  <X className="w-7 h-7 shrink-0" strokeWidth={2.6} aria-hidden="true" />
                  <span className="text-left">
                    <span className="block text-gc-lead sm:text-[22px] font-extrabold leading-tight">Flawed</span>
                    <span className="block text-gc-small font-semibold text-gc-quiet">Contains an error</span>
                  </span>
                </button>
              </div>
              
              {/* Wager Input & All-In Control */}
              <div className="space-y-2">
                <div className="flex gap-2.5">
                   <div className="relative flex-1">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gc-money font-sans tabular-nums font-extrabold text-gc-title select-none">$</span>
                      <TextInput 
                          ref={wagerInputRef}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={String(betAmount)}
                          onChange={handleBetAmountChange}
                          placeholder={isBetCapped ? `Up to $${effectiveBetCap}` : "Your bet"}
                          disabled={isBlocked || player.money === 0}
                          className={`w-full pl-9 pr-4 text-gc-title font-sans tabular-nums font-extrabold text-gc-money h-14 placeholder:text-gc-body placeholder:font-semibold ${highlightWagerMissing ? '!border-rose-500 ring-2 ring-rose-500/50' : ''}`}
                      />
                   </div>
                   <ActionButton
                      onClick={handleAllIn}
                      disabled={isBlocked || player.money === 0}
                      variant="ghost"
                      className="h-14 px-5 text-gc-body font-bold whitespace-nowrap"
                   >
                      {isBetCapped && effectiveBetCap < player.money ? `Max ($${effectiveBetCap})` : 'All in'}
                   </ActionButton>
                </div>

                {isBetCapped && (
                  <div className="text-gc-small font-semibold text-gc-money flex items-center gap-1.5 px-3 py-2 bg-gc-gold/15 rounded-gc-sm">
                    <span>🧢</span>
                    <span>Bet cap: you can bet up to ${effectiveBetCap} this hand.</span>
                  </div>
                )}
                {isHighRoller && (
                  <div className="text-gc-small font-semibold text-gc-loss flex items-center gap-1.5 px-3 py-2 bg-gc-loss/15 rounded-gc-sm">
                    <span>🔥</span>
                    <span>High roller: you must bet at least ${effectiveMinBet.toLocaleString()} (half your balance).</span>
                  </div>
                )}
              </div>

              {/* Quick Chip Tray for rapid betting */}
              <QuickChipTray
                currentBet={actualBetAmount}
                playerMoney={player.money}
                maxBet={isBetCapped ? effectiveBetCap : undefined}
                onAddAmount={handleAddQuickChip}
                onClear={handleClearBet}
                onAllIn={handleAllIn}
                disabled={isBlocked}
                playSound={playSound}
              />

              {/* Physical Wager Chips Display */}
              {actualBetAmount > 0 && (
                <WagerChipsDisplay amount={actualBetAmount} label="Your bet" />
              )}

              {/* Correction Input */}
              {bet?.opinion === 'incorrect' && (
                 <div className="animate-fade-in pt-1">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-gc-small font-bold text-gc-ink">
                        {hasDoubleOrNothing ? (
                          <span className="text-amber-600 dark:text-amber-400 font-extrabold">
                            🎲 Double or Nothing: correction required for 3× win
                          </span>
                        ) : (
                          'Bonus: write the corrected sentence'
                        )}
                      </label>
                      {currentSentenceText && !isBlocked && (
                        <button
                          type="button"
                          onClick={() => {
                            playSound('click');
                            onBetChange(player.id, 'userCorrection', currentSentenceText);
                          }}
                          className="text-gc-cap font-semibold text-gc-quiet hover:text-gc-ink underline underline-offset-4 cursor-pointer"
                        >
                          Copy the sentence here
                        </button>
                      )}
                    </div>
                    <textarea 
                      value={bet?.userCorrection || ''}
                      onChange={handleCorrectionChange}
                      onDoubleClick={() => {
                        if (!isBlocked && currentSentenceText) {
                          playSound('click');
                          onBetChange(player.id, 'userCorrection', currentSentenceText);
                        }
                      }}
                      onTouchEnd={() => {
                        const now = Date.now();
                        if (now - lastCorrectionTapRef.current <= 350) {
                          lastCorrectionTapRef.current = 0;
                          if (!isBlocked && currentSentenceText) {
                            playSound('click');
                            onBetChange(player.id, 'userCorrection', currentSentenceText);
                          }
                        } else {
                          lastCorrectionTapRef.current = now;
                        }
                      }}
                      disabled={isBlocked}
                      placeholder={
                        hasDoubleOrNothing
                          ? 'Write the corrected sentence (leaving this blank or wrong on a Flawed sentence loses 1.5× your bet)...'
                          : 'Rewrite the sentence without the mistake for a bonus (double-click or double-tap to copy it here)'
                      }
                      className={`w-full bg-gc-line/[0.05] border rounded-gc-sm px-4 py-3 text-gc-ink placeholder:text-gc-quiet/70 focus:outline-none focus:border-gc-gold focus:ring-2 focus:ring-gc-gold/30 transition-colors resize-none font-sentence italic h-24 text-gc-lead ${
                        hasDoubleOrNothing && !bet?.userCorrection?.trim()
                          ? 'border-amber-500/60 bg-amber-500/[0.04]'
                          : 'border-gc-line/[0.2]'
                      }`}
                    />
                    {hasDoubleOrNothing && !bet?.userCorrection?.trim() && (
                      <p className="mt-1.5 text-gc-cap font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-gc-sm px-2.5 py-1.5">
                        ⚠️ Heads up: With Double or Nothing active, choosing Flawed without a valid correction results in a −1.5× loss.
                      </p>
                    )}
                 </div>
              )}
            </>
          )}
        </div>

        {/* Right column: help and power-ups */}
        <div className="lg:col-span-5 flex flex-col justify-between gap-3.5 border-t lg:border-t-0 lg:border-l border-gc-line/[0.12] pt-4 lg:pt-0 lg:pl-6">
          <div className="space-y-3">
            <h4 className="text-gc-small font-bold text-gc-quiet">
              Help and power-ups
            </h4>

            <button
              type="button"
              onClick={() => onGetHint(player.id)}
              disabled={player.money < HINT_COST || !!hint || isBlocked}
              className="w-full flex items-center gap-3 p-3.5 rounded-gc bg-gc-line/[0.06] border border-gc-line/[0.12] text-gc-ink text-left transition-colors hover:border-gc-line/30 cursor-pointer disabled:cursor-not-allowed disabled:opacity-55 focus:outline-none focus-visible:ring-4 focus-visible:ring-gc-turn/40"
            >
              <span className="w-10 h-10 rounded-gc-sm bg-gc-info/15 grid place-items-center text-xl shrink-0" aria-hidden="true">💡</span>
              <span className="min-w-0">
                <span className="block text-gc-body font-bold">Croupier's whisper</span>
                <span className="block text-gc-small text-gc-quiet">A small grammar clue</span>
              </span>
              <span className="ml-auto pl-2 text-gc-body font-extrabold tabular-nums text-gc-money shrink-0">-${HINT_COST}</span>
            </button>

            {hint && (
              <div className="rounded-gc bg-gc-info/15 text-gc-info p-3.5 text-gc-body font-semibold animate-gc-slide-up">
                <div className="text-gc-cap font-bold mb-1 opacity-80">Hint</div>
                {hint.isLoading ? (
                  <span className="animate-pulse">Finding a hint…</span>
                ) : (
                  hint.text
                )}
              </div>
            )}
            
            <PowerUpTooltip
              icon={isSilenced ? "🤐" : "🃏"}
              name={isSilenced ? "Silenced" : "Draw a power-up"}
              description={isSilenced ? "You are silenced this round and cannot draw or use power-ups." : "Draw a random power-up card to gain an edge or disrupt rivals."}
              placement="top"
              className="w-full"
            >
              <button
                type="button"
                onClick={() => onGetPowerUp(player.id)}
                disabled={player.money < POWERUP_COST || isBlocked || powerUpUsedThisRound || isSilenced}
                className="w-full flex items-center gap-3 p-3.5 rounded-gc bg-gc-line/[0.06] border border-gc-line/[0.12] text-gc-ink text-left transition-colors hover:border-gc-line/30 cursor-pointer disabled:cursor-not-allowed disabled:opacity-55 focus:outline-none focus-visible:ring-4 focus-visible:ring-gc-turn/40"
                title={isSilenced ? "You are silenced this round" : undefined}
              >
                <span className="w-10 h-10 rounded-gc-sm bg-purple-500/15 grid place-items-center text-xl shrink-0" aria-hidden="true">{isSilenced ? '🤐' : '🃏'}</span>
                <span className="min-w-0">
                  <span className="block text-gc-body font-bold">
                    {isSilenced ? 'Silenced' : powerUpUsedThisRound ? 'Power-up drawn' : 'Draw a power-up'}
                  </span>
                  <span className="block text-gc-small text-gc-quiet">
                    {isSilenced ? 'No power-ups this hand' : powerUpUsedThisRound ? 'One per hand' : 'A card from the house shoe'}
                  </span>
                </span>
                {!isSilenced && (
                  <span className="ml-auto pl-2 text-gc-body font-extrabold tabular-nums text-gc-money shrink-0">-${POWERUP_COST}</span>
                )}
              </button>
            </PowerUpTooltip>
          </div>

          {/* Bottom Status Indicator */}
          <div className="pt-3 border-t border-gc-line/[0.12] flex items-center justify-between gap-3 text-gc-small text-gc-quiet">
            <span>Status</span>
            {isEliminated ? (
              <span className="text-gc-loss font-bold">Out of money</span>
            ) : isFrozen ? (
              <span className="text-gc-info font-bold">Frozen this hand</span>
            ) : isSatOut ? (
              <span className="text-gc-loss font-bold">Sat out (no bet)</span>
            ) : isTurnLocked ? (
              <span className="text-gc-win font-bold">Locked in</span>
            ) : timerEnabled && timerStatus === 'idle' ? (
              <span>Waiting for their turn</span>
            ) : isUnchangedBaseWord ? (
              <span className="text-gc-loss font-bold">
                Change the word ({(baseWord || '').toUpperCase()})
              </span>
            ) : isInvalidKwtPhrase ? (
              <span className="text-gc-loss font-bold">
                Use 2–6 words with {(baseWord || 'KEY').toUpperCase()}
              </span>
            ) : (
              questionType === 'multipleChoice'
                ? (typeof bet?.bet === 'number' && (hasSplitBet ? (bet?.splitOptions?.length || 0) >= 1 : Boolean(bet?.selectedOption)))
                : questionType === 'keyWordTransformation'
                  ? (typeof bet?.bet === 'number' && (hasSplitBet
                      ? (isValidKeyWordTransformationPhrase(bet?.splitClozeAnswers?.[0], baseWord) && (!bet?.splitClozeAnswers?.[1]?.trim() || isValidKeyWordTransformationPhrase(bet?.splitClozeAnswers?.[1], baseWord))) ||
                        (!bet?.splitClozeAnswers?.[0]?.trim() && isValidKeyWordTransformationPhrase(bet?.splitClozeAnswers?.[1], baseWord))
                      : isValidKeyWordTransformationPhrase(bet?.clozeAnswer, baseWord)))
                  : (questionType === 'openCloze' || questionType === 'wordFormation')
                    ? (typeof bet?.bet === 'number' && (hasSplitBet ? Boolean(bet?.splitClozeAnswers?.[0]?.trim() || bet?.splitClozeAnswers?.[1]?.trim()) : Boolean(bet?.clozeAnswer?.trim())))
                    : (hasSplitBet ? typeof bet?.bet === 'number' : (bet?.opinion && typeof bet?.bet === 'number'))
            ) ? (
              <span className="text-gc-win font-bold">
                Bet placed
              </span>
            ) : (
              <span>Waiting for a bet</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlayerBettingCard;