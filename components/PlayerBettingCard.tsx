import React from 'react';
import { Player, Bet, Hint, SoundEffect, ActivePowerUp, PowerUpKey, UsedPowerUp, PlayerTurnTimer } from '../types';
import ActionButton from './ActionButton';
import TextInput from './TextInput';
import PowerUpTooltip from './PowerUpTooltip';
import { QuickChipTray, WagerChipsDisplay } from './ChipStacks';
import { TimerAvatarRing, TurnTimerControls, useTurnCountdown } from './TurnTimer';
import { HINT_COST, POWERUP_COST, BET_CAP_AMOUNT, POWER_UPS } from '../constants';

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
  isFrozen?: boolean;
  onUpdateMoney?: (playerId: number, newAmount: number) => void;
  currentSentenceText?: string;
  onChangeAvatar?: (playerId: number) => void;
  onUpdateName?: (playerId: number, newName: string) => void;
  targetAmount?: number;
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
  isFrozen = false,
  onUpdateMoney,
  currentSentenceText,
  onChangeAvatar,
  onUpdateName,
  targetAmount,
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

  React.useEffect(() => {
    if (!isEditingName) {
      setTempName(player.name);
    }
  }, [player.name, isEditingName]);

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

  // Whenever player's current funds change, ensure bet amount does not exceed funds limit
  React.useEffect(() => {
    if (bet?.bet !== undefined && bet?.bet !== '') {
      const currentBetNum = Number(bet.bet);
      if (!isNaN(currentBetNum)) {
        const maxLimit = isBetCapped ? Math.min(Math.max(0, player.money), effectiveBetCap) : Math.max(0, player.money);
        if (player.money <= 0 && currentBetNum !== 0) {
          onBetChange(player.id, 'bet', 0);
        } else if (currentBetNum > maxLimit) {
          onBetChange(player.id, 'bet', maxLimit);
        }
      }
    }
  }, [player.money, isBetCapped, effectiveBetCap, player.id, bet?.bet, onBetChange]);

  const handleOpinionClick = (opinion: 'correct' | 'incorrect') => {
    if (isBlocked) return;
    onBetChange(player.id, 'opinion', opinion);
  };
  
  const handleBetAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isBlocked) return;
    const val = e.target.value;
    if (val === '') {
      onBetChange(player.id, 'bet', '');
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
    next = Math.min(next, player.money);
    onBetChange(player.id, 'bet', next);
  };

  const handleClearBet = () => {
    if (isBlocked) return;
    onBetChange(player.id, 'bet', '');
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

  // Split Bet Logic helpers
  const splitPercent = bet?.splitCorrectPercent ?? 50;
  const actualBetAmount = typeof bet?.bet === 'number' ? bet.bet : 0;
  const splitCorrectAmount = Math.floor(actualBetAmount * (splitPercent / 100));
  const splitIncorrectAmount = actualBetAmount - splitCorrectAmount;

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
            onLockNow={() => onTimerLockNow?.(player.id)}
            onUnlock={() => onTimerUnlock?.(player.id)}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left/Main Column: Betting Felt & Wager Controls (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {hasSplitBet ? (
            <div className="p-5 bg-gradient-to-br from-indigo-50/90 to-slate-100/90 dark:from-[#0f0c29]/90 dark:to-[#061810]/90 border border-indigo-400/50 rounded-xl shadow-inner relative overflow-hidden">
              <div className="absolute top-0 right-0 p-2 opacity-10 text-6xl select-none">⚖️</div>
              <div className="flex justify-between items-center mb-4 relative z-10">
                 <h4 className="text-lg font-serif font-bold text-indigo-950 dark:text-indigo-200 uppercase tracking-wider">Split Hedge Wager</h4>
              </div>
              
              <div className="mb-5 relative z-10">
                 <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-600 dark:text-indigo-300 font-mono-casino font-bold text-lg">$</span>
                    <TextInput 
                        type="number"
                        value={String(betAmount)}
                        onChange={handleBetAmountChange}
                        placeholder={isBetCapped ? `Wager (Max $${effectiveBetCap})` : "Total Wager"}
                        disabled={isBlocked || player.money === 0}
                        min="0"
                        max={isBetCapped ? Math.min(player.money, effectiveBetCap) : player.money}
                        className="pl-9 text-center font-mono-casino font-bold bg-white/90 dark:bg-indigo-950/50 border-indigo-300 dark:border-indigo-500/50 text-xl text-slate-900 dark:text-white h-12"
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
              <div className="grid grid-cols-2 gap-3.5">
                <button
                  type="button"
                  onClick={() => handleOpinionClick('correct')}
                  disabled={isBlocked}
                  className={`relative overflow-hidden py-4 px-3 rounded-xl font-serif uppercase tracking-widest transition-all duration-200 border-2 flex flex-col items-center justify-center gap-1.5 cursor-pointer select-none group/zone ${
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
                  className={`relative overflow-hidden py-4 px-3 rounded-xl font-serif uppercase tracking-widest transition-all duration-200 border-2 flex flex-col items-center justify-center gap-1.5 cursor-pointer select-none group/zone ${
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
                          type="number"
                          value={String(betAmount)}
                          onChange={handleBetAmountChange}
                          placeholder={isBetCapped ? `Max $${effectiveBetCap}` : "Enter wager..."}
                          disabled={isBlocked || player.money === 0}
                          min="0"
                          max={isBetCapped ? Math.min(player.money, effectiveBetCap) : player.money}
                          className="w-full pl-8 pr-4 text-lg font-mono-casino font-bold h-12"
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
            ) : (hasSplitBet ? typeof bet?.bet === 'number' : (bet?.opinion && typeof bet?.bet === 'number')) ? (
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