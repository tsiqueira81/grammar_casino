// A betting card's header: avatar, name, bankroll and the power-up badges (moved out of PlayerBettingCard, F7).

import type { TurnTimerStatus } from '../../types';
import React from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { Player, UsedPowerUp, PlayerTurnTimer } from '../../types';
import PowerUpTooltip from '../PowerUpTooltip';
import { TimerAvatarRing } from '../TurnTimer';
import { PlayerAvatar } from '../PlayerAvatar';

export interface BetCardHeaderProps {
  showTimer: boolean;
  isFrozen: boolean;
  fraction: number;
  isWarning: boolean;
  timerStatus: TurnTimerStatus;
  turnTimer: PlayerTurnTimer;
  onChangeAvatar: (playerId: number) => void;
  player: Player;
  hasSecondChance: boolean;
  isEditingName: boolean;
  tempName: string;
  setTempName: React.Dispatch<React.SetStateAction<string>>;
  handleNameSave: () => void;
  handleNameKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  setIsEditingName: React.Dispatch<React.SetStateAction<boolean>>;
  handleNameClick: () => void;
  onUpdateName: (playerId: number, newName: string) => void;
  powerUpUsedThisRound: boolean;
  usedPowerUps: UsedPowerUp[];
  players: Player[];
  isEditingMoney: boolean;
  tempMoney: string;
  setTempMoney: React.Dispatch<React.SetStateAction<string>>;
  handleMoneySave: () => void;
  handleMoneyKeyDown: (e: React.KeyboardEvent) => void;
  onUpdateMoney: (playerId: number, newAmount: number) => void;
  handleMoneyClick: () => void;
  targetAmount: number;
  hasSafetyNet: boolean;
  hasImmunity: boolean;
  hasJackpot: boolean;
  hasShield: boolean;
  hasSplitBet: boolean;
  hasBlessing: boolean;
  hasCrucio: boolean;
  isSilenced: boolean;
  hasTeachersPet: boolean;
  hasSavings: boolean;
  hasCorrectionBounty: boolean;
  hasLoneWolf: boolean;
  isBetCapped: boolean;
  effectiveBetCap: number;
  isHighRoller: boolean;
  effectiveMinBet: number;
  hasScalpel: boolean;
  hasCopycat: boolean;
  hasBloodPact: boolean;
  hasCrowdSurfer: boolean;
  hasDoubleOrNothing: boolean;
  hasBoomerang: boolean;
  hasAudiencePoll: boolean;
  hasUnderdog: boolean;
  hasScavenger: boolean;
}

export function BetCardHeader({
  showTimer,
  isFrozen,
  fraction,
  isWarning,
  timerStatus,
  turnTimer,
  onChangeAvatar,
  player,
  hasSecondChance,
  isEditingName,
  tempName,
  setTempName,
  handleNameSave,
  handleNameKeyDown,
  setIsEditingName,
  handleNameClick,
  onUpdateName,
  powerUpUsedThisRound,
  usedPowerUps,
  players,
  isEditingMoney,
  tempMoney,
  setTempMoney,
  handleMoneySave,
  handleMoneyKeyDown,
  onUpdateMoney,
  handleMoneyClick,
  targetAmount,
  hasSafetyNet,
  hasImmunity,
  hasJackpot,
  hasShield,
  hasSplitBet,
  hasBlessing,
  hasCrucio,
  isSilenced,
  hasTeachersPet,
  hasSavings,
  hasCorrectionBounty,
  hasLoneWolf,
  isBetCapped,
  effectiveBetCap,
  isHighRoller,
  effectiveMinBet,
  hasScalpel,
  hasCopycat,
  hasBloodPact,
  hasCrowdSurfer,
  hasDoubleOrNothing,
  hasBoomerang,
  hasAudiencePoll,
  hasUnderdog,
  hasScavenger,
}: BetCardHeaderProps) {

  return (
    <>
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
              className={`w-14 h-14 rounded-full border-2 border-gc-turn/70 p-0.5 relative bg-gc-line/[0.08] flex items-center justify-center group/avatar transition-transform duration-gc-fast focus:outline-none focus-visible:ring-4 focus-visible:ring-gc-turn/50 ${
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
    </>
  );
}
