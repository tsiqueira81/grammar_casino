import React from 'react';
import { Player, Bet, Hint, SoundEffect, ActivePowerUp, PowerUpKey, UsedPowerUp, PlayerTurnTimer, QuestionType } from '../types';
import ActionButton from './ActionButton';
import TextInput from './TextInput';
import PowerUpTooltip from './PowerUpTooltip';
import { QuickChipTray, WagerChipsDisplay } from './ChipStacks';
import { TimerAvatarRing, TurnTimerControls, useTurnCountdown } from './TurnTimer';
import { HINT_COST, POWERUP_COST, BET_CAP_AMOUNT, POWER_UPS } from '../constants';
import { isValidKeyWordTransformationPhrase, AudiencePollSummary } from '../utils/multiplayerProtocol';

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
  const cardBaseClasses = "luxury-card rounded-2xl p-5 sm:p-6 transition-all duration-300 relative group overflow-hidden";
  const glowClasses = powerUpUsedThisRound ? "ring-2 ring-purple-500 shadow-[0_0_30px_rgba(168,85,247,0.35)]" : "";
  const bankruptClasses = isEliminated ? "opacity-55 grayscale" : "";
  const frozenClasses = isFrozen ? "!border-cyan-400/70 bg-cyan-50/50 dark:bg-cyan-950/30" : "";
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
    <div className={`${cardBaseClasses} ${glowClasses} ${bankruptClasses} ${frozenClasses} ${timerClasses}`}>
      {/* Subtle decorative corner flourishes */}
      <div className="pointer-events-none absolute top-2 left-2 w-3 h-3 border-t border-l border-[#d4af37]/40" />
      <div className="pointer-events-none absolute top-2 right-2 w-3 h-3 border-t border-r border-[#d4af37]/40" />
      <div className="pointer-events-none absolute bottom-2 left-2 w-3 h-3 border-b border-l border-[#d4af37]/40" />
      <div className="pointer-events-none absolute bottom-2 right-2 w-3 h-3 border-b border-r border-[#d4af37]/40" />

      {isEliminated && <div className="bankrupt-stamp">BANKRUPT</div>}
      {isFrozen && (
        <div className="absolute inset-0 bg-cyan-950/35 backdrop-blur-[1px] z-20 flex items-center justify-center pointer-events-none rounded-2xl">
          <span className="text-4xl sm:text-5xl font-extrabold text-cyan-200 drop-shadow-[0_5px_15px_rgba(0,0,0,0.8)] transform -rotate-12 border-4 border-double border-cyan-300 px-6 py-3 rounded-xl bg-slate-950/90 font-serif tracking-widest">
            FROZEN ❄️
          </span>
        </div>
      )}
      {!isFrozen && !isEliminated && isSatOut && (
        <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px] z-20 flex items-center justify-center pointer-events-none rounded-2xl">
          <span className="text-3xl sm:text-4xl font-extrabold text-rose-200 drop-shadow-[0_5px_15px_rgba(0,0,0,0.8)] transform -rotate-6 border-4 border-double border-rose-400 px-6 py-3 rounded-xl bg-slate-950/90 font-serif tracking-widest text-center leading-tight">
            SAT OUT ⏱️
            <span className="block text-[11px] sm:text-xs tracking-[0.25em] text-rose-300/80 mt-1 font-sans">No bet placed in time</span>
          </span>
        </div>
      )}
      {isTurnLocked && !isFrozen && !isEliminated && !isSatOut && (
        <div className="pointer-events-none absolute top-0 right-6 z-20 bg-gradient-to-b from-slate-700 to-slate-900 text-slate-100 border border-t-0 border-slate-400/60 rounded-b-lg px-3 py-1 text-[10px] font-serif font-extrabold uppercase tracking-[0.2em] shadow-lg">
          🔒 Bet Locked
        </div>
      )}
      
      {/* VIP Player Station Header */}
      <div className="flex flex-wrap justify-between items-center gap-4 mb-5 pb-4 border-b border-[#d4af37]/30 relative">
        <div className="flex items-center gap-3.5">
          <div className="relative">
            {showTimer && !isFrozen && (
              <TimerAvatarRing fraction={fraction} isWarning={isWarning} status={timerStatus} held={turnTimer?.held} />
            )}
            <button
              type="button"
              onClick={() => onChangeAvatar?.(player.id)}
              disabled={!onChangeAvatar}
              className={`w-14 h-14 rounded-full border-2 border-[#d4af37] ring-2 ring-[#d4af37]/20 p-0.5 relative bg-gradient-to-b from-amber-50 to-amber-100 dark:from-[#0d3520] dark:to-[#04150c] flex items-center justify-center text-3xl group/avatar transition-all duration-200 focus:outline-none ${
                onChangeAvatar ? 'cursor-pointer hover:scale-105 active:scale-95 shadow-[0_4px_15px_rgba(0,0,0,0.35)] hover:border-[#fef08a]' : ''
              }`}
              title={onChangeAvatar ? `Click to change ${player.name}'s avatar` : undefined}
              aria-label={`Change avatar for ${player.name}`}
            >
              <span className="filter drop-shadow-md transition-transform group-hover/avatar:scale-110 select-none">
                {player.avatar || '👤'}
              </span>
              {onChangeAvatar && (
                <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-gradient-to-b from-[#fef08a] to-[#ca8a04] text-black text-[10px] rounded-full flex items-center justify-center shadow-md border border-white/60 opacity-85 group-hover/avatar:opacity-100 group-hover/avatar:scale-110 transition-all font-sans font-bold select-none">
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
                <div className="text-base bg-amber-50 dark:bg-slate-900 border border-[#d4af37] rounded-full w-6 h-6 flex items-center justify-center shadow-md cursor-help">
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
                  className="text-lg font-serif uppercase tracking-wider font-bold text-slate-900 dark:text-amber-100 bg-amber-50 dark:bg-[#04180d] border-b-2 border-[#d4af37] px-2 py-0.5 w-36 sm:w-44 focus:outline-none rounded-t"
                  placeholder="Player name..."
                />
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleNameSave();
                  }}
                  className="w-6 h-6 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs flex items-center justify-center cursor-pointer shadow-sm font-bold"
                  title="Save name"
                >
                  ✓
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setIsEditingName(false);
                    setTempName(player.name);
                  }}
                  className="w-6 h-6 rounded bg-slate-300 hover:bg-slate-400 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs flex items-center justify-center cursor-pointer shadow-sm"
                  title="Cancel"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div
                onClick={handleNameClick}
                className={`group/name flex items-center gap-2 ${onUpdateName ? 'cursor-pointer' : ''}`}
                title={onUpdateName ? "Click to edit name" : undefined}
              >
                <h3 className={`text-xl sm:text-2xl font-serif tracking-wider uppercase font-extrabold transition-all ${
                  powerUpUsedThisRound ? 'text-purple-700 dark:text-purple-300' : 'text-slate-900 dark:text-amber-50'
                } ${onUpdateName ? 'group-hover/name:text-amber-700 dark:group-hover/name:text-[#fef08a]' : ''}`}>
                  {player.name}
                </h3>
                {onUpdateName && (
                  <span className="text-xs text-amber-700 dark:text-amber-400 opacity-0 group-hover/name:opacity-100 transition-opacity" title="Click to edit name">
                    ✏️
                  </span>
                )}
              </div>
            )}
             <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-amber-200/60 mt-1 flex-wrap">
                <span className="uppercase tracking-widest text-[10px] font-semibold text-amber-800/70 dark:text-[#d4af37]/80">VIP Seat</span>
                {player.winStreak > 1 && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-700 dark:text-amber-300 font-bold text-[11px] whitespace-nowrap">
                    🔥 {player.winStreak} Streak
                  </span>
                )}
                {usedPowerUps.length > 0 && (
                  <div className="flex gap-1 items-center pl-1 border-l border-[#d4af37]/30">
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
           <div className="px-4 py-2 rounded-xl bg-gradient-to-b from-amber-100/80 to-amber-50/90 dark:from-[#03140b] dark:to-[#072214] border border-[#d4af37]/60 shadow-[inset_0_2px_6px_rgba(0,0,0,0.08)] dark:shadow-[inset_0_2px_8px_rgba(0,0,0,0.8),0_1px_0_rgba(254,240,138,0.15)] flex flex-col items-end">
             <span className="text-[9px] font-serif uppercase tracking-[0.2em] text-amber-900/70 dark:text-amber-200/60 font-bold">
               Vault Balance
             </span>
             {isEditingMoney ? (
               <div className="flex items-center justify-end mt-0.5">
                 <span className="text-xl font-mono-casino font-extrabold text-[#ca8a04] mr-1">$</span>
                 <input 
                   type="number"
                   value={tempMoney}
                   onChange={(e) => setTempMoney(e.target.value)}
                   onBlur={handleMoneySave}
                   onKeyDown={handleMoneyKeyDown}
                   onWheel={(e) => e.currentTarget.blur()}
                   autoFocus
                   className="text-xl font-mono-casino font-extrabold text-amber-700 dark:text-[#fef08a] bg-transparent border-b border-[#ca8a04] w-24 text-right focus:outline-none p-0 appearance-none rounded-none"
                 />
               </div>
             ) : (
               <div 
                 className={`text-xl sm:text-2xl font-mono-casino font-extrabold text-gold-flat tracking-tight flex items-center gap-1.5 ${onUpdateMoney ? 'cursor-pointer hover:brightness-125 transition-all' : ''}`}
                 onClick={handleMoneyClick}
                 title={onUpdateMoney ? "Click to adjust player bankroll" : ""}
               >
                 <span className="text-sm opacity-80">$</span>
                 <span>{player.money.toLocaleString()}</span>
               </div>
             )}
           </div>

           {targetAmount && targetAmount > 0 && (
             <div 
               className={`text-[11px] font-mono-casino font-medium mt-1.5 flex items-center gap-1.5 justify-end ${player.money >= targetAmount ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-500 dark:text-amber-200/60'}`}
               title={`Target goal: $${targetAmount.toLocaleString()}`}
             >
               <span>🎯 Target: ${targetAmount.toLocaleString()}</span>
               <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${player.money >= targetAmount ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40' : 'bg-black/10 dark:bg-white/10 text-slate-700 dark:text-amber-200'}`}>
                 {Math.min(999, Math.round((player.money / targetAmount) * 100))}%
               </span>
             </div>
           )}
           
           <div className="flex flex-wrap gap-1.5 mt-2 justify-end">
              {hasSafetyNet && (
                <PowerUpTooltip powerUpKey="SAFETY_NET" placement="bottom">
                  <span className="px-2 py-0.5 bg-sky-500/15 border border-sky-400/60 text-sky-900 dark:text-sky-200 text-[10px] uppercase font-bold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>🦺</span>
                    <span>Safety Net</span>
                  </span>
                </PowerUpTooltip>
              )}
              {hasImmunity && (
                <PowerUpTooltip powerUpKey="IMMUNITY_IDOL" placement="bottom">
                  <span className="px-2 py-0.5 bg-amber-500/20 border border-amber-400/60 text-amber-900 dark:text-amber-200 text-[10px] uppercase font-bold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>🗿</span>
                    <span>Immune</span>
                  </span>
                </PowerUpTooltip>
              )}
              {hasJackpot && (
                <PowerUpTooltip powerUpKey="JACKPOT" placement="bottom">
                  <span className="px-2 py-0.5 bg-purple-500/20 border border-purple-400/60 text-purple-900 dark:text-purple-200 text-[10px] uppercase font-bold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>🎰</span>
                    <span>Jackpot</span>
                  </span>
                </PowerUpTooltip>
              )}
              {hasShield && (
                <PowerUpTooltip powerUpKey="SHIELD" placement="bottom">
                  <span className="px-2 py-0.5 bg-blue-500/20 border border-blue-400/60 text-blue-900 dark:text-blue-200 text-[10px] uppercase font-bold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>🛡️</span>
                    <span>Shield</span>
                  </span>
                </PowerUpTooltip>
              )}
              {hasSplitBet && (
                <PowerUpTooltip powerUpKey="SPLIT_BET" placement="bottom">
                  <span className="px-2 py-0.5 bg-indigo-500/20 border border-indigo-400/60 text-indigo-900 dark:text-indigo-200 text-[10px] uppercase font-bold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>⚖️</span>
                    <span>Split</span>
                  </span>
                </PowerUpTooltip>
              )}
              {hasBlessing && (
                <PowerUpTooltip powerUpKey="BLESSING" placement="bottom">
                  <span className="px-2 py-0.5 bg-pink-500/20 border border-pink-400/60 text-pink-900 dark:text-pink-200 text-[10px] uppercase font-bold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>💖</span>
                    <span>Blessed ({player.effects.find(e => e.type === 'BLESSING')?.roundsLeft || 0}r)</span>
                  </span>
                </PowerUpTooltip>
              )}
              {hasCrucio && (
                <PowerUpTooltip powerUpKey="CRUCIO" placement="bottom">
                  <span className="px-2 py-0.5 bg-slate-500/20 border border-slate-400/60 text-slate-800 dark:text-slate-300 text-[10px] uppercase font-bold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>⛓️</span>
                    <span>Cursed</span>
                  </span>
                </PowerUpTooltip>
              )}
              {isSilenced && (
                <PowerUpTooltip powerUpKey="SILENCER" placement="bottom">
                  <span className="px-2 py-0.5 bg-slate-500/20 border border-slate-400/60 text-slate-800 dark:text-slate-300 text-[10px] uppercase font-bold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>🤐</span>
                    <span>Silenced</span>
                  </span>
                </PowerUpTooltip>
              )}
              {hasTeachersPet && (
                <PowerUpTooltip powerUpKey="TEACHERS_PET" placement="bottom">
                  <span className="px-2 py-0.5 bg-red-500/20 border border-red-400/60 text-red-900 dark:text-red-200 text-[10px] uppercase font-bold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>🍎</span>
                    <span>Pet ({Math.min(player.winStreak, 3)}/3)</span>
                  </span>
                </PowerUpTooltip>
              )}
              {hasSavings && (
                <PowerUpTooltip powerUpKey="SAVINGS_ACCOUNT" placement="bottom">
                  <span className="px-2 py-0.5 bg-emerald-500/20 border border-emerald-400/60 text-emerald-900 dark:text-emerald-200 text-[10px] uppercase font-bold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>🏦</span>
                    <span>Savings</span>
                  </span>
                </PowerUpTooltip>
              )}
              {hasCorrectionBounty && (
                <PowerUpTooltip powerUpKey="CORRECTION_BOUNTY" placement="bottom">
                  <span className="px-2 py-0.5 bg-amber-500/20 border border-amber-400/60 text-amber-900 dark:text-amber-200 text-[10px] uppercase font-bold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>📝</span>
                    <span>Bounty</span>
                  </span>
                </PowerUpTooltip>
              )}
              {hasLoneWolf && (
                <PowerUpTooltip powerUpKey="LONE_WOLF" placement="bottom">
                  <span className="px-2 py-0.5 bg-slate-500/20 border border-slate-400/60 text-slate-800 dark:text-slate-200 text-[10px] uppercase font-bold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>🐺</span>
                    <span>Lone Wolf</span>
                  </span>
                </PowerUpTooltip>
              )}
              {isBetCapped && (
                <PowerUpTooltip icon="🧢" name="Bet Cap" description={`Bet capped at a maximum of $${effectiveBetCap} this round.`} placement="bottom">
                  <span className="px-2 py-0.5 bg-amber-500/20 border border-amber-500 text-amber-900 dark:text-amber-200 text-[10px] uppercase font-bold rounded-full flex items-center gap-1 cursor-help hover:brightness-110 shadow-sm animate-pulse">
                    <span>🧢</span>
                    <span>Capped (${effectiveBetCap})</span>
                  </span>
                </PowerUpTooltip>
              )}
              {isHighRoller && (
                <PowerUpTooltip icon="🔥" name="High Roller" description={`Forced minimum bet of $${effectiveMinBet.toLocaleString()} (50% of bankroll) this round.`} placement="bottom">
                  <span className="px-2 py-0.5 bg-orange-500/25 border border-orange-500 text-orange-950 dark:text-orange-200 text-[10px] uppercase font-bold rounded-full flex items-center gap-1 cursor-help hover:brightness-110 shadow-sm animate-pulse">
                    <span>🔥</span>
                    <span>High Roller (Min ${effectiveMinBet})</span>
                  </span>
                </PowerUpTooltip>
              )}
              {hasScalpel && (
                <PowerUpTooltip powerUpKey="SCALPEL" placement="bottom">
                  <span className="px-2 py-0.5 bg-cyan-500/20 border border-cyan-400/60 text-cyan-900 dark:text-cyan-200 text-[10px] uppercase font-bold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>✂️</span>
                    <span>50/50 Scalpel</span>
                  </span>
                </PowerUpTooltip>
              )}
              {hasCopycat && (
                <PowerUpTooltip powerUpKey="COPYCAT" placement="bottom">
                  <span className="px-2 py-0.5 bg-violet-500/20 border border-violet-400/60 text-violet-900 dark:text-violet-200 text-[10px] uppercase font-bold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>🪞</span>
                    <span>Copycat</span>
                  </span>
                </PowerUpTooltip>
              )}
              {hasBloodPact && (
                <PowerUpTooltip powerUpKey="BLOOD_PACT" placement="bottom">
                  <span className="px-2 py-0.5 bg-rose-500/20 border border-rose-400/60 text-rose-900 dark:text-rose-200 text-[10px] uppercase font-bold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>🤝</span>
                    <span>Blood Pact</span>
                  </span>
                </PowerUpTooltip>
              )}
              {hasCrowdSurfer && (
                <PowerUpTooltip powerUpKey="CROWD_SURFER" placement="bottom">
                  <span className="px-2 py-0.5 bg-teal-500/20 border border-teal-400/60 text-teal-900 dark:text-teal-200 text-[10px] uppercase font-bold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>📢</span>
                    <span>Crowd Surfer</span>
                  </span>
                </PowerUpTooltip>
              )}
              {hasDoubleOrNothing && (
                <PowerUpTooltip powerUpKey="DOUBLE_OR_NOTHING" placement="bottom">
                  <span className="px-2 py-0.5 bg-amber-500/25 border border-amber-400 text-amber-950 dark:text-[#fef08a] text-[10px] uppercase font-bold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>🎲</span>
                    <span>3× or -1.5×</span>
                  </span>
                </PowerUpTooltip>
              )}
              {hasBoomerang && (
                <PowerUpTooltip powerUpKey="BOOMERANG" placement="bottom">
                  <span className="px-2 py-0.5 bg-lime-500/20 border border-lime-400/60 text-lime-900 dark:text-lime-200 text-[10px] uppercase font-bold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>🪃</span>
                    <span>Boomerang</span>
                  </span>
                </PowerUpTooltip>
              )}
              {hasAudiencePoll && (
                <PowerUpTooltip powerUpKey="AUDIENCE_POLL" placement="bottom">
                  <span className="px-2 py-0.5 bg-sky-500/20 border border-sky-400/60 text-sky-900 dark:text-sky-200 text-[10px] uppercase font-bold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>📊</span>
                    <span>Ask the Table</span>
                  </span>
                </PowerUpTooltip>
              )}
              {hasUnderdog && (
                <PowerUpTooltip powerUpKey="UNDERDOG" placement="bottom">
                  <span className="px-2 py-0.5 bg-orange-500/20 border border-orange-400/60 text-orange-900 dark:text-orange-200 text-[10px] uppercase font-bold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
                    <span>🚀</span>
                    <span>Underdog (2.5×)</span>
                  </span>
                </PowerUpTooltip>
              )}
              {hasScavenger && (
                <PowerUpTooltip powerUpKey="SCAVENGER" placement="bottom">
                  <span className="px-2 py-0.5 bg-amber-600/20 border border-amber-500/60 text-amber-950 dark:text-amber-200 text-[10px] uppercase font-bold rounded-full flex items-center gap-1 cursor-help hover:brightness-110">
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
              className="mb-4 -mt-2 px-3.5 py-2.5 rounded-xl bg-rose-500/15 dark:bg-rose-950/60 border-2 border-rose-500/80 text-rose-900 dark:text-rose-200 text-xs sm:text-sm font-serif font-bold flex items-center justify-between gap-2 shadow-[0_0_20px_rgba(244,63,94,0.3)] animate-fade-in"
            >
              <div className="flex items-center gap-2">
                <span className="text-base select-none">⚠️</span>
                <span>{lockWarning.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setLockWarning(null)}
                className="text-xs px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-900 dark:text-rose-100 font-sans font-bold cursor-pointer shrink-0"
              >
                OK
              </button>
            </div>
          )}
        </div>
      )}

      {audiencePollFeed && (
        <div className="mb-5 p-3.5 rounded-xl bg-sky-500/15 border border-sky-400/50 space-y-2 text-xs text-sky-950 dark:text-sky-100 animate-fade-in">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-serif font-extrabold uppercase tracking-wider text-sky-900 dark:text-sky-200 flex items-center gap-1.5">
              <span>📊</span>
              <span>Ask the Table · Live Anonymized Poll</span>
            </span>
            <span className="text-[11px] font-mono-casino font-bold px-2 py-0.5 rounded bg-sky-500/20 border border-sky-400/40">
              {audiencePollFeed.summaryText}
            </span>
          </div>
          {audiencePollFeed.breakdown.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              {audiencePollFeed.breakdown.map((item, idx) => (
                <div
                  key={idx}
                  className="p-2 rounded-lg bg-white/70 dark:bg-black/35 border border-sky-400/35 flex flex-col justify-between gap-1"
                >
                  <div className="flex items-center justify-between gap-1 text-[11px] font-bold">
                    <span className="truncate">{item.label}</span>
                    <span className="font-mono-casino text-sky-700 dark:text-sky-300 shrink-0">
                      {item.percent}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-sky-950/20 dark:bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-sky-400 to-emerald-400 rounded-full transition-all duration-300"
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
                  <div className="p-3 rounded-xl bg-indigo-500/15 border border-indigo-400/50 flex flex-wrap items-center justify-between gap-2 text-xs font-serif text-indigo-950 dark:text-indigo-200">
                    <div className="flex items-center gap-2 font-bold uppercase tracking-wider">
                      <span>⚖️</span>
                      <span>
                        {isDoubleStacked
                          ? 'Split Bet · 100% Stacked on 1 Option (2×)'
                          : 'Split Bet · Pick 2 (50/50) or Click 1 Twice (100%)'}
                      </span>
                    </div>
                    <span className={`font-mono-casino text-[11px] font-bold px-2 py-0.5 rounded border ${
                      isDoubleStacked
                        ? 'bg-amber-500/25 text-amber-950 dark:text-[#fef08a] border-[#d4af37]/60'
                        : 'bg-indigo-500/20 border-indigo-400/40'
                    }`}>
                      {isDoubleStacked
                        ? `2/2 Stacked · 100% ($${actualBetAmount.toLocaleString()})`
                        : `${splitOpts.length}/2 Selected ($${Math.floor(actualBetAmount / 2).toLocaleString()} each)`}
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
                        className={`relative overflow-hidden py-3.5 px-4 rounded-xl font-serif transition-all duration-200 border-2 flex items-center justify-between gap-3 select-none group/opt text-left focus:outline-none focus:ring-2 focus:ring-amber-400 ${
                          isEliminatedOpt
                            ? 'opacity-40 grayscale cursor-not-allowed bg-slate-900/20 border-rose-500/40 text-slate-500 dark:text-slate-400 line-through'
                            : isPicked
                              ? hasSplitBet
                                ? isStacked2x
                                  ? 'cursor-pointer bg-gradient-to-b from-amber-500/25 via-indigo-800/35 to-indigo-950/70 border-[#d4af37] text-amber-950 dark:text-[#fef08a] shadow-[0_0_22px_rgba(212,175,55,0.4)] scale-[1.01]'
                                  : 'cursor-pointer bg-gradient-to-b from-indigo-600/25 via-indigo-800/30 to-indigo-950/60 border-indigo-400 text-indigo-950 dark:text-indigo-100 shadow-[0_0_20px_rgba(99,102,241,0.35)] scale-[1.01]'
                                : 'cursor-pointer bg-gradient-to-b from-amber-500/25 via-amber-700/30 to-amber-950/60 border-[#d4af37] text-amber-950 dark:text-[#fef08a] shadow-[0_0_22px_rgba(212,175,55,0.35)] scale-[1.01]'
                              : 'cursor-pointer felt-well border-[#d4af37]/30 text-slate-800 dark:text-amber-50/85 hover:border-[#d4af37] hover:bg-amber-500/10'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono-casino font-extrabold text-sm border shrink-0 transition-transform group-hover/opt:scale-105 ${
                            isPicked
                              ? hasSplitBet
                                ? isStacked2x
                                  ? 'bg-gradient-to-b from-[#fef08a] to-[#ca8a04] text-black border-white/80 shadow'
                                  : 'bg-indigo-500 text-white border-indigo-200 shadow'
                                : 'bg-gradient-to-b from-[#fef08a] to-[#ca8a04] text-black border-white/80 shadow'
                              : 'bg-black/10 dark:bg-black/40 border-[#d4af37]/40 text-amber-800 dark:text-[#d4af37]'
                          }`}>
                            {letter}
                          </span>
                          <span className={`text-base sm:text-lg font-editorial font-bold truncate ${isEliminatedOpt ? 'line-through' : ''}`}>
                            {opt}
                          </span>
                        </div>
                        {isEliminatedOpt ? (
                          <span className="text-[10px] font-mono-casino font-extrabold uppercase px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/40 shrink-0 no-underline">
                            ✂️ Cut
                          </span>
                        ) : isPicked ? (
                          <span className={`text-[10px] font-mono-casino font-extrabold uppercase px-2 py-0.5 rounded-full shrink-0 ${
                            hasSplitBet
                              ? isStacked2x
                                ? 'bg-[#d4af37]/30 text-amber-950 dark:text-[#fef08a] border border-[#d4af37]/60'
                                : 'bg-indigo-500/30 text-indigo-900 dark:text-indigo-200 border border-indigo-400/50'
                              : 'bg-[#d4af37]/25 text-amber-950 dark:text-[#fef08a] border border-[#d4af37]/50'
                          }`}>
                            {hasSplitBet ? (isStacked2x ? '100% (2×)' : '50%') : '✓ Pick'}
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
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#ca8a04] font-mono-casino font-bold text-lg select-none">$</span>
                    <TextInput
                      ref={wagerInputRef}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={String(betAmount)}
                      onChange={handleBetAmountChange}
                      placeholder={isBetCapped ? `Max $${effectiveBetCap}` : "Enter wager..."}
                      disabled={isBlocked || player.money === 0}
                      className={`w-full pl-8 pr-4 text-lg font-mono-casino font-bold h-12 ${highlightWagerMissing ? '!border-rose-500 ring-2 ring-rose-500/50' : ''}`}
                    />
                  </div>
                  <ActionButton
                    onClick={handleAllIn}
                    disabled={isBlocked || player.money === 0}
                    variant="outline-gold"
                    className="h-12 px-5 text-xs sm:text-sm whitespace-nowrap"
                  >
                    {isBetCapped && effectiveBetCap < player.money ? `Max ($${effectiveBetCap})` : 'All In'}
                  </ActionButton>
                </div>

                {isBetCapped && (
                  <div className="text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/15 border border-amber-500/30 rounded-lg">
                    <span>🧢</span>
                    <span>House Limit active: Wager capped at ${effectiveBetCap}.</span>
                  </div>
                )}
                {isHighRoller && (
                  <div className="text-xs font-semibold text-orange-900 dark:text-orange-200 flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/15 border border-orange-500/40 rounded-lg">
                    <span>🔥</span>
                    <span>High Roller Fever: Minimum wager locked at ${effectiveMinBet.toLocaleString()} (50% of bankroll).</span>
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
                        ? "100% (2×) Split Wager on Felt"
                        : "50/50 Split Wager on Felt"
                      : "Wager on Felt"
                  }
                />
              )}
            </>
          ) : (questionType === 'openCloze' || questionType === 'wordFormation' || questionType === 'keyWordTransformation') ? (
            <>
              {/* Open Cloze, Word Formation & Key Word Transformation */}
              {questionType === 'wordFormation' && baseWord && (
                <div className="p-3 rounded-xl bg-amber-500/15 border-2 border-[#d4af37] flex flex-wrap items-center justify-between gap-2 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🧬</span>
                    <span className="text-xs font-serif font-extrabold uppercase tracking-wider text-amber-950 dark:text-amber-100">
                      Base Word to Transform:
                    </span>
                  </div>
                  <span className="px-3 py-1 rounded-lg bg-amber-400/30 dark:bg-amber-500/25 border border-[#d4af37] font-mono-casino font-black text-sm sm:text-base tracking-widest text-amber-950 dark:text-[#fef08a]">
                    ({baseWord.toUpperCase()})
                  </span>
                </div>
              )}
              {questionType === 'keyWordTransformation' && baseWord && (
                <div className="p-3 rounded-xl bg-amber-500/15 border-2 border-[#d4af37] flex flex-wrap items-center justify-between gap-2 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🔑</span>
                    <div>
                      <div className="text-xs font-serif font-extrabold uppercase tracking-wider text-amber-950 dark:text-amber-100">
                        Key Word (Do Not Change):
                      </div>
                      <div className="text-[10px] font-sans text-slate-600 dark:text-amber-200/75">
                        Use 2–6 words · 1 Mark = 1× Payout · 2 Marks = 2× Payout
                      </div>
                    </div>
                  </div>
                  <span className="px-3.5 py-1 rounded-lg bg-amber-400/35 dark:bg-amber-500/30 border-2 border-[#d4af37] font-mono-casino font-black text-sm sm:text-base tracking-widest text-amber-950 dark:text-[#fef08a]">
                    {baseWord.toUpperCase()}
                  </span>
                </div>
              )}
              {scalpelHint?.clozeMask && (
                <div className="p-3 rounded-xl bg-cyan-500/15 border border-cyan-400/50 flex items-center justify-between gap-2 text-xs font-serif text-cyan-950 dark:text-cyan-200">
                  <span className="font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <span>✂️</span>
                    <span>50/50 Scalpel Clue:</span>
                  </span>
                  <span className="font-mono-casino font-extrabold text-sm px-2.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 tracking-wider">
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
                  <div className={`p-4 sm:p-5 bg-gradient-to-br from-indigo-50/90 to-slate-100/90 dark:from-[#0f0c29]/90 dark:to-[#061810]/90 border border-indigo-400/50 rounded-xl shadow-inner space-y-3 ${highlightAnswerMissing || isUnchangedBaseWord || isInvalidKwtPhrase ? 'ring-2 ring-rose-500' : ''}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs sm:text-sm font-serif font-extrabold uppercase tracking-wider text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                        <span>⚖️</span>
                        <span>
                          {questionType === 'keyWordTransformation'
                            ? 'Split Hedge · 1 Phrase (100% Wager) or 2 Phrases (50% Each)'
                            : 'Split Hedge · 1 Word (100% Payout) or 2 Words (50% Each)'}
                        </span>
                      </span>
                      <span className={`text-[11px] font-mono-casino font-bold px-2 py-0.5 rounded border ${
                        isSingleOrSameWord
                          ? 'bg-amber-500/20 text-amber-900 dark:text-[#fef08a] border-[#d4af37]/50'
                          : 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border-indigo-400/40'
                      }`}>
                        {isSingleOrSameWord
                          ? `100% Wager ($${actualBetAmount.toLocaleString()})`
                          : `$${Math.floor(actualBetAmount / 2).toLocaleString()} / slot (50% each)`}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-serif uppercase tracking-widest text-indigo-800 dark:text-indigo-300 font-bold mb-1">
                          {isSingleOrSameWord && Boolean(w1) && !w2
                            ? 'Candidate #1 (100% Wager)'
                            : 'Candidate #1 (50%)'}
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
                              ? `2–6 words using ${baseWord.toUpperCase()}...`
                              : questionType === 'wordFormation' && baseWord
                                ? `Derived form #1 of ${baseWord.toUpperCase()}...`
                                : 'First single word...'
                          }
                          maxLength={questionType === 'keyWordTransformation' ? 80 : 32}
                          className="w-full h-11 px-3.5 rounded-xl bg-white/90 dark:bg-[#03140b]/90 border border-indigo-400/60 text-slate-900 dark:text-amber-50 font-editorial font-bold text-base focus:outline-none focus:border-[#fef08a]"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-serif uppercase tracking-widest text-indigo-800 dark:text-indigo-300 font-bold mb-1">
                          {isSingleOrSameWord && Boolean(w2) && !w1
                            ? 'Candidate #2 (100% Wager)'
                            : isSingleOrSameWord && Boolean(w1) && Boolean(w2)
                            ? 'Candidate #2 (Same · 100%)'
                            : 'Candidate #2 (Optional · 50% Split)'}
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
                              ? 'Optional 2nd phrase (blank = 100%)...'
                              : 'Optional 2nd word (blank = 100%)...'
                          }
                          maxLength={questionType === 'keyWordTransformation' ? 80 : 32}
                          className="w-full h-11 px-3.5 rounded-xl bg-white/90 dark:bg-[#03140b]/90 border border-indigo-400/60 text-slate-900 dark:text-amber-50 font-editorial font-bold text-base focus:outline-none focus:border-[#fef08a]"
                        />
                      </div>
                    </div>
                  </div>
                );
              })() : (
                <div className={`p-4 felt-well rounded-xl border-2 border-[#d4af37]/50 space-y-2 ${highlightAnswerMissing || isUnchangedBaseWord || isInvalidKwtPhrase ? 'ring-2 ring-rose-500 !border-rose-500' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-serif font-extrabold uppercase tracking-widest text-amber-900 dark:text-[#fef08a] flex items-center gap-1.5">
                      <span>
                        {questionType === 'keyWordTransformation'
                          ? '🔑'
                          : questionType === 'wordFormation'
                            ? '🧬'
                            : '✍️'}
                      </span>
                      <span>
                        {questionType === 'keyWordTransformation'
                          ? `Complete the Gap Using "${(baseWord || 'KEY').toUpperCase()}"`
                          : questionType === 'wordFormation'
                            ? `Transform (${(baseWord || 'ROOT').toUpperCase()}) to Fit the Gap`
                            : 'Type the Missing Word (Single-Word Gap)'}
                      </span>
                    </label>
                    <span className="text-[10px] font-mono-casino uppercase tracking-wider text-slate-500 dark:text-amber-200/60 shrink-0">
                      {questionType === 'keyWordTransformation' ? '2–6 Words' : '1 Word Only'}
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
                        ? `Type 2 to 6 words including ${baseWord.toUpperCase()}...`
                        : questionType === 'wordFormation' && baseWord
                          ? `Type a derived form of (${baseWord.toUpperCase()})...`
                          : 'Type the single missing word for _____...'
                    }
                    maxLength={questionType === 'keyWordTransformation' ? 80 : 32}
                    className="w-full h-12 px-4 rounded-xl bg-amber-50/80 dark:bg-[#03150b]/90 border border-[#d4af37]/60 text-slate-900 dark:text-amber-50 placeholder-slate-400 dark:placeholder-amber-200/35 focus:outline-none focus:border-[#ca8a04] dark:focus:border-[#fef08a] focus:ring-2 focus:ring-[#ca8a04]/25 transition-all text-lg font-editorial font-bold shadow-inner"
                  />
                  {questionType === 'keyWordTransformation' && (() => {
                    const check = inspectKwtPhrase(bet?.clozeAnswer);
                    if (!check.trimmed) return null;
                    return (
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] font-serif">
                        <span
                          className={`px-2 py-0.5 rounded font-bold border ${
                            check.hasKeyWord
                              ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/40'
                              : 'bg-rose-500/15 text-rose-800 dark:text-rose-200 border-rose-500/50'
                          }`}
                        >
                          {check.hasKeyWord
                            ? `✓ Key word "${(baseWord || 'KEY').toUpperCase()}" included`
                            : `⚠️ Must include unchanged "${(baseWord || 'KEY').toUpperCase()}"`}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded font-mono-casino font-bold border ${
                            check.isValidCount
                              ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/40'
                              : 'bg-amber-500/20 text-amber-900 dark:text-amber-200 border-amber-500/50'
                          }`}
                        >
                          {check.wordCount} / 2–6 words
                        </span>
                      </div>
                    );
                  })()}
                </div>
              )}
              {isUnchangedBaseWord && (
                <div className="px-3.5 py-2 rounded-xl bg-rose-500/15 border border-rose-500/60 text-rose-800 dark:text-rose-200 text-xs font-serif font-bold flex items-center gap-2 animate-fade-in">
                  <span>⚠️</span>
                  <span>
                    You typed the unchanged base word <strong>({(baseWord || '').toUpperCase()})</strong>. Change its form (e.g. add a prefix or suffix) to lock in!
                  </span>
                </div>
              )}

              {/* Wager Input & All-In Control */}
              <div className="space-y-2">
                <div className="flex gap-2.5">
                  <div className="relative flex-1">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#ca8a04] font-mono-casino font-bold text-lg select-none">$</span>
                    <TextInput
                      ref={wagerInputRef}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={String(betAmount)}
                      onChange={handleBetAmountChange}
                      placeholder={isBetCapped ? `Max $${effectiveBetCap}` : "Enter wager..."}
                      disabled={isBlocked || player.money === 0}
                      className={`w-full pl-8 pr-4 text-lg font-mono-casino font-bold h-12 ${highlightWagerMissing ? '!border-rose-500 ring-2 ring-rose-500/50' : ''}`}
                    />
                  </div>
                  <ActionButton
                    onClick={handleAllIn}
                    disabled={isBlocked || player.money === 0}
                    variant="outline-gold"
                    className="h-12 px-5 text-xs sm:text-sm whitespace-nowrap"
                  >
                    {isBetCapped && effectiveBetCap < player.money ? `Max ($${effectiveBetCap})` : 'All In'}
                  </ActionButton>
                </div>

                {isBetCapped && (
                  <div className="text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/15 border border-amber-500/30 rounded-lg">
                    <span>🧢</span>
                    <span>House Limit active: Wager capped at ${effectiveBetCap}.</span>
                  </div>
                )}
                {isHighRoller && (
                  <div className="text-xs font-semibold text-orange-900 dark:text-orange-200 flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/15 border border-orange-500/40 rounded-lg">
                    <span>🔥</span>
                    <span>High Roller Fever: Minimum wager locked at ${effectiveMinBet.toLocaleString()} (50% of bankroll).</span>
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
                          ? "100% Split Wager on Felt"
                          : "50/50 Split Wager on Felt"
                        : "Wager on Felt"
                    }
                  />
                );
              })()}
            </>
          ) : hasSplitBet ? (
            <div className="p-5 bg-gradient-to-br from-indigo-50/90 to-slate-100/90 dark:from-[#0f0c29]/90 dark:to-[#061810]/90 border border-indigo-400/50 rounded-xl shadow-inner relative overflow-hidden">
              <div className="absolute top-0 right-0 p-2 opacity-10 text-6xl select-none">⚖️</div>
              <div className="flex justify-between items-center mb-4 relative z-10">
                 <h4 className="text-lg font-serif font-bold text-indigo-950 dark:text-indigo-200 uppercase tracking-wider">Split Hedge Wager</h4>
              </div>
              
              <div className="mb-5 relative z-10">
                 <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-600 dark:text-indigo-300 font-mono-casino font-bold text-lg">$</span>
                    <TextInput 
                        ref={wagerInputRef}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={String(betAmount)}
                        onChange={handleBetAmountChange}
                        placeholder={isBetCapped ? `Wager (Max $${effectiveBetCap})` : "Total Wager"}
                        disabled={isBlocked || player.money === 0}
                        className={`pl-9 text-center font-mono-casino font-bold bg-white/90 dark:bg-indigo-950/50 border-indigo-300 dark:border-indigo-500/50 text-xl text-slate-900 dark:text-white h-12 ${highlightWagerMissing ? '!border-rose-500 ring-2 ring-rose-500/50' : ''}`}
                    />
                    <button
                      type="button"
                      onClick={handleAllIn}
                      disabled={isBlocked || player.money === 0}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 px-2.5 py-1 text-[10px] font-serif uppercase tracking-wider font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded shadow transition-all cursor-pointer"
                    >
                      {isBetCapped && effectiveBetCap < player.money ? `MAX ($${effectiveBetCap})` : 'MAX'}
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
                     <WagerChipsDisplay amount={actualBetAmount} label="Split Wager on Felt" />
                   )}
                 </div>
              </div>

              <div className="mb-2 flex justify-between text-xs font-serif uppercase tracking-wider font-bold relative z-10">
                <span className="text-rose-600 dark:text-rose-400">Flawed ({100 - splitPercent}%)</span>
                <span className="text-emerald-700 dark:text-emerald-400">Valid ({splitPercent}%)</span>
              </div>
              
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={splitPercent} 
                onChange={(e) => onBetChange(player.id, 'splitCorrectPercent', parseInt(e.target.value))}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer mb-4 relative z-10"
                disabled={isBlocked}
              />
              
              <div className="flex justify-between gap-3 relative z-10">
                 <div className="flex-1 bg-rose-500/10 border border-rose-500/30 rounded-lg p-2.5 text-center">
                    <div className="text-[10px] text-rose-700 dark:text-rose-300 uppercase tracking-widest font-bold">Flawed Pot</div>
                    <div className="text-lg font-mono-casino text-rose-700 dark:text-rose-400 font-extrabold">${splitIncorrectAmount.toLocaleString()}</div>
                 </div>
                 <div className="flex-1 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-2.5 text-center">
                    <div className="text-[10px] text-emerald-800 dark:text-emerald-300 uppercase tracking-widest font-bold">Valid Pot</div>
                    <div className="text-lg font-mono-casino text-emerald-700 dark:text-emerald-400 font-extrabold">${splitCorrectAmount.toLocaleString()}</div>
                 </div>
              </div>

               {/* Correction Input for Split Bet */}
               {splitPercent < 100 && (
                 <div className="mt-4 animate-fade-in text-left relative z-10">
                    <label className="block text-xs font-serif font-bold text-indigo-950 dark:text-indigo-200 uppercase tracking-widest mb-1.5">
                      Croupier's Bonus · Proposed Revision
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
                      disabled={isBlocked}
                      placeholder="Write the corrected sentence for bonus payout... (Double-click to copy original)"
                      className="w-full bg-white/90 dark:bg-[#03140b]/90 border border-indigo-400/50 rounded-xl px-4 py-2.5 text-slate-900 dark:text-amber-50 placeholder-slate-400 dark:placeholder-amber-200/35 focus:outline-none focus:border-[#fef08a] transition-all h-20 resize-none text-sm font-editorial italic"
                    />
                 </div>
              )}
            </div>
          ) : (
            <>
              {/* Authentic Casino Table Baize Betting Zones */}
              <div className={`grid grid-cols-2 gap-3.5 rounded-xl transition-all ${highlightAnswerMissing ? 'ring-2 ring-rose-500 p-1.5 bg-rose-500/5' : ''}`}>
                <button
                  ref={firstOpinionBtnRef}
                  type="button"
                  onClick={() => handleOpinionClick('correct')}
                  disabled={isBlocked}
                  className={`relative overflow-hidden py-4 px-3 rounded-xl font-serif uppercase tracking-widest transition-all duration-200 border-2 flex flex-col items-center justify-center gap-1.5 cursor-pointer select-none group/zone focus:outline-none focus:ring-2 focus:ring-emerald-400 ${
                    bet?.opinion === 'correct'
                      ? 'bg-gradient-to-b from-emerald-600/25 via-emerald-700/30 to-emerald-950/60 border-emerald-400 text-emerald-900 dark:text-emerald-200 shadow-[0_0_25px_rgba(16,185,129,0.35),inset_0_0_15px_rgba(16,185,129,0.25)] scale-[1.01]'
                      : 'felt-well border-emerald-600/35 dark:border-emerald-500/30 text-emerald-900/75 dark:text-emerald-300/65 hover:border-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-900 dark:hover:text-emerald-200'
                  }`}
                >
                  {/* Subtle inner casino table line */}
                  <div className="pointer-events-none absolute inset-1.5 rounded-lg border border-emerald-500/20" />
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center border transition-transform duration-200 group-hover/zone:scale-110 ${
                    bet?.opinion === 'correct'
                      ? 'bg-emerald-500 text-white border-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.8)]'
                      : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                  }`}>
                    <span className="text-base font-bold">✓</span>
                  </div>
                  <div className="text-sm font-extrabold tracking-[0.18em]">Valid</div>
                  <div className="text-[9px] font-sans tracking-wider opacity-70 uppercase">Grammatically Sound</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpinionClick('incorrect')}
                  disabled={isBlocked}
                  className={`relative overflow-hidden py-4 px-3 rounded-xl font-serif uppercase tracking-widest transition-all duration-200 border-2 flex flex-col items-center justify-center gap-1.5 cursor-pointer select-none group/zone focus:outline-none focus:ring-2 focus:ring-rose-400 ${
                    bet?.opinion === 'incorrect'
                      ? 'bg-gradient-to-b from-rose-600/25 via-red-800/30 to-red-950/60 border-rose-400 text-rose-900 dark:text-rose-200 shadow-[0_0_25px_rgba(244,63,94,0.35),inset_0_0_15px_rgba(244,63,94,0.25)] scale-[1.01]'
                      : 'felt-well border-rose-600/35 dark:border-rose-500/30 text-rose-900/75 dark:text-rose-300/65 hover:border-rose-500 hover:bg-rose-500/10 hover:text-rose-900 dark:hover:text-rose-200'
                  }`}
                >
                  {/* Subtle inner casino table line */}
                  <div className="pointer-events-none absolute inset-1.5 rounded-lg border border-rose-500/20" />
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center border transition-transform duration-200 group-hover/zone:scale-110 ${
                    bet?.opinion === 'incorrect'
                      ? 'bg-rose-600 text-white border-rose-200 shadow-[0_0_12px_rgba(244,63,94,0.8)]'
                      : 'bg-rose-500/15 border-rose-500/40 text-rose-700 dark:text-rose-300'
                  }`}>
                    <span className="text-sm font-bold">✕</span>
                  </div>
                  <div className="text-sm font-extrabold tracking-[0.18em]">Flawed</div>
                  <div className="text-[9px] font-sans tracking-wider opacity-70 uppercase">Contains Error</div>
                </button>
              </div>
              
              {/* Wager Input & All-In Control */}
              <div className="space-y-2">
                <div className="flex gap-2.5">
                   <div className="relative flex-1">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#ca8a04] font-mono-casino font-bold text-lg select-none">$</span>
                      <TextInput 
                          ref={wagerInputRef}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={String(betAmount)}
                          onChange={handleBetAmountChange}
                          placeholder={isBetCapped ? `Max $${effectiveBetCap}` : "Enter wager..."}
                          disabled={isBlocked || player.money === 0}
                          className={`w-full pl-8 pr-4 text-lg font-mono-casino font-bold h-12 ${highlightWagerMissing ? '!border-rose-500 ring-2 ring-rose-500/50' : ''}`}
                      />
                   </div>
                   <ActionButton
                      onClick={handleAllIn}
                      disabled={isBlocked || player.money === 0}
                      variant="outline-gold"
                      className="h-12 px-5 text-xs sm:text-sm whitespace-nowrap"
                   >
                      {isBetCapped && effectiveBetCap < player.money ? `Max ($${effectiveBetCap})` : 'All In'}
                   </ActionButton>
                </div>

                {isBetCapped && (
                  <div className="text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/15 border border-amber-500/30 rounded-lg">
                    <span>🧢</span>
                    <span>House Limit active: Wager capped at ${effectiveBetCap}.</span>
                  </div>
                )}
                {isHighRoller && (
                  <div className="text-xs font-semibold text-orange-900 dark:text-orange-200 flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/15 border border-orange-500/40 rounded-lg">
                    <span>🔥</span>
                    <span>High Roller Fever: Minimum wager locked at ${effectiveMinBet.toLocaleString()} (50% of bankroll).</span>
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
                <WagerChipsDisplay amount={actualBetAmount} label="Wager on Felt" />
              )}

              {/* Correction Input */}
              {bet?.opinion === 'incorrect' && (
                 <div className="animate-fade-in pt-1">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-serif font-bold text-amber-900 dark:text-[#fef08a] uppercase tracking-widest">
                        ✦ Bonus Payout · Propose Correction
                      </label>
                      {currentSentenceText && !isBlocked && (
                        <button
                          type="button"
                          onClick={() => {
                            playSound('click');
                            onBetChange(player.id, 'userCorrection', currentSentenceText);
                          }}
                          className="text-[10px] font-serif uppercase tracking-wider text-amber-700 dark:text-amber-300 hover:underline cursor-pointer"
                        >
                          Copy Original Text
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
                      disabled={isBlocked}
                      placeholder="Rewrite the sentence with proper grammar for a bonus payout... (Double-click to copy original)"
                      className="w-full bg-amber-50/70 dark:bg-[#03150b]/90 border border-[#d4af37]/50 rounded-xl px-4 py-3 text-slate-900 dark:text-amber-50 placeholder-slate-400 dark:placeholder-amber-200/35 focus:outline-none focus:border-[#ca8a04] dark:focus:border-[#fef08a] focus:ring-2 focus:ring-[#ca8a04]/25 transition-all h-24 resize-none text-base font-editorial italic shadow-inner"
                    />
                 </div>
              )}
            </>
          )}
        </div>

        {/* Right Column: Croupier Services & Arcane Deck (5 cols) */}
        <div className="lg:col-span-5 flex flex-col justify-between gap-3.5 border-t lg:border-t-0 lg:border-l border-[#d4af37]/25 pt-4 lg:pt-0 lg:pl-6">
          <div className="space-y-3">
            <div className="text-[10px] font-serif uppercase tracking-[0.2em] text-amber-900/70 dark:text-amber-200/60 font-bold">
              House Privileges & Deck
            </div>

            {/* Croupier's Hint Button */}
            <ActionButton 
              onClick={() => onGetHint(player.id)}
              disabled={player.money < HINT_COST || !!hint || isBlocked}
              variant="outline-gold"
              className="w-full !px-4 !py-3 text-left"
            >
              <div className="flex justify-between items-center w-full">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-amber-500/15 border border-[#d4af37]/40 flex items-center justify-center text-base">
                    💡
                  </span>
                  <div className="text-left">
                    <div className="text-xs sm:text-sm font-bold tracking-wider">Croupier's Whisper</div>
                    <div className="text-[10px] font-sans normal-case opacity-75 font-normal">Request a subtle grammatical clue</div>
                  </div>
                </div>
                <span className="font-mono-casino text-xs font-extrabold px-2 py-1 rounded bg-black/10 dark:bg-black/40 border border-[#d4af37]/30 text-amber-900 dark:text-[#fef08a]">
                  -${HINT_COST}
                </span>
              </div>
            </ActionButton>

            {hint && (
              <div className="bg-gradient-to-br from-amber-50 to-amber-100/70 dark:from-[#082415] dark:to-[#04140b] border border-[#d4af37]/60 p-3.5 rounded-xl text-amber-950 dark:text-[#fef08a] text-sm font-editorial italic animate-fade-in shadow-inner relative">
                <div className="text-[9px] font-serif uppercase tracking-widest text-[#ca8a04] font-bold not-italic mb-1 flex items-center gap-1">
                  <span>✦</span> Croupier's Note
                </div>
                {hint.isLoading ? (
                  <span className="animate-pulse">The Croupier is inspecting the syntax...</span>
                ) : (
                  `"${hint.text}"`
                )}
              </div>
            )}
            
            {/* Arcane Power-Up Card Button */}
            <ActionButton 
              onClick={() => onGetPowerUp(player.id)}
              disabled={player.money < POWERUP_COST || isBlocked || powerUpUsedThisRound || isSilenced}
              variant="outline-gold"
              className={`w-full !px-4 !py-3 text-left ${isSilenced ? 'grayscale opacity-60 cursor-not-allowed' : ''}`}
              title={isSilenced ? "You are Silenced for this round!" : ""}
            >
              <div className="flex justify-between items-center w-full">
                <PowerUpTooltip
                  icon={isSilenced ? "🤐" : "🃏"}
                  name={isSilenced ? "Silenced" : "Draw Arcane Power-Up"}
                  description={isSilenced ? "You are silenced this round and cannot draw or use power-ups." : "Draw a random power-up card from the house shoe to gain an edge or disrupt rivals."}
                  placement="top"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-lg bg-purple-500/15 border border-purple-400/40 flex items-center justify-center text-base">
                      {isSilenced ? '🤐' : '🃏'}
                    </span>
                    <div className="text-left">
                      <div className="text-xs sm:text-sm font-bold tracking-wider">
                        {isSilenced ? 'Silenced' : powerUpUsedThisRound ? 'Card Drawn' : 'Draw Power-Up'}
                      </div>
                      <div className="text-[10px] font-sans normal-case opacity-75 font-normal">
                        {isSilenced ? 'Blocked this hand' : powerUpUsedThisRound ? 'Limit reached this hand' : 'Deal from the House Shoe'}
                      </div>
                    </div>
                  </div>
                </PowerUpTooltip>
                {!isSilenced && (
                  <span className="font-mono-casino text-xs font-extrabold px-2 py-1 rounded bg-black/10 dark:bg-black/40 border border-[#d4af37]/30 text-amber-900 dark:text-[#fef08a]">
                    -${POWERUP_COST}
                  </span>
                )}
              </div>
            </ActionButton>
          </div>

          {/* Bottom Status Indicator */}
          <div className="pt-2 border-t border-[#d4af37]/20 flex items-center justify-between text-[11px] font-serif text-slate-500 dark:text-amber-200/50">
            <span>Status:</span>
            {isEliminated ? (
              <span className="text-rose-500 font-bold uppercase tracking-wider">Eliminated</span>
            ) : isFrozen ? (
              <span className="text-cyan-400 font-bold uppercase tracking-wider">Frozen (Pass)</span>
            ) : isSatOut ? (
              <span className="text-rose-500 font-bold uppercase tracking-wider">Sat Out (No Bet)</span>
            ) : isTurnLocked ? (
              <span className="text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider flex items-center gap-1">
                <span>🔒</span> Bet Locked
              </span>
            ) : timerEnabled && timerStatus === 'idle' ? (
              <span className="text-amber-700 dark:text-amber-400/80 italic">Awaiting Turn...</span>
            ) : isUnchangedBaseWord ? (
              <span className="text-rose-500 font-bold uppercase tracking-wider">
                Transform ({(baseWord || '').toUpperCase()})...
              </span>
            ) : isInvalidKwtPhrase ? (
              <span className="text-rose-500 font-bold uppercase tracking-wider">
                Use 2–6 words + {(baseWord || 'KEY').toUpperCase()}...
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
              <span className="text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1">
                <span>●</span> {timerEnabled ? 'Wager Placed' : 'Wager Locked'}
              </span>
            ) : (
              <span className="text-amber-700 dark:text-amber-400/80 italic">Awaiting Wager...</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlayerBettingCard;