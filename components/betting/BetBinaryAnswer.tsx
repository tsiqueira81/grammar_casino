// A betting card's answer for a Valid-or-flawed hand: the two buttons, the wager and the correction (moved out of PlayerBettingCard, F7).

import React from 'react';
import { ANSWER_INPUT_PROPS } from '../../utils/answerInputProps';
import { Check, X } from 'lucide-react';
import { Player, Bet, SoundEffect } from '../../types';
import ActionButton from '../ActionButton';
import TextInput from '../TextInput';
import { QuickChipTray, WagerChipsDisplay } from '../ChipStacks';

export interface BetBinaryAnswerProps {
  highlightAnswerMissing: boolean;
  firstOpinionBtnRef: React.RefObject<HTMLButtonElement>;
  handleOpinionClick: (opinion: "correct" | "incorrect") => void;
  isBlocked: boolean;
  bet: Bet;
  wagerInputRef: React.RefObject<HTMLInputElement>;
  betAmount: number | "";
  handleBetAmountChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isBetCapped: boolean;
  effectiveBetCap: number;
  player: Player;
  highlightWagerMissing: boolean;
  handleAllIn: () => void;
  isHighRoller: boolean;
  effectiveMinBet: number;
  actualBetAmount: number;
  handleAddQuickChip: (val: number) => void;
  handleClearBet: () => void;
  playSound: (sound: SoundEffect) => void;
  hasDoubleOrNothing: boolean;
  currentSentenceText: string;
  onBetChange: (playerId: number, field: keyof Bet, value: any) => void;
  handleCorrectionChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  lastCorrectionTapRef: React.RefObject<number>;
}

export function BetBinaryAnswer({
  highlightAnswerMissing,
  firstOpinionBtnRef,
  handleOpinionClick,
  isBlocked,
  bet,
  wagerInputRef,
  betAmount,
  handleBetAmountChange,
  isBetCapped,
  effectiveBetCap,
  player,
  highlightWagerMissing,
  handleAllIn,
  isHighRoller,
  effectiveMinBet,
  actualBetAmount,
  handleAddQuickChip,
  handleClearBet,
  playSound,
  hasDoubleOrNothing,
  currentSentenceText,
  onBetChange,
  handleCorrectionChange,
  lastCorrectionTapRef,
}: BetBinaryAnswerProps) {

  return (
    <>
      {/* Valid / Flawed: two big buttons that fill with green or red when picked */}
      <div className={`grid grid-cols-2 gap-3.5 rounded-gc transition-all ${highlightAnswerMissing ? 'ring-2 ring-rose-500 p-1.5 bg-rose-500/5' : ''}`}>
        <button
          ref={firstOpinionBtnRef}
          type="button"
          onClick={() => handleOpinionClick('correct')}
          disabled={isBlocked}
          aria-pressed={bet?.opinion === 'correct'}
          className={`min-h-[96px] px-4 py-3 rounded-gc border-2 flex items-center justify-center gap-3.5 cursor-pointer select-none transition-colors duration-gc-fast focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-400/40 disabled:cursor-not-allowed ${
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
          className={`min-h-[96px] px-4 py-3 rounded-gc border-2 flex items-center justify-center gap-3.5 cursor-pointer select-none transition-colors duration-gc-fast focus:outline-none focus-visible:ring-4 focus-visible:ring-rose-400/40 disabled:cursor-not-allowed ${
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
              {...ANSWER_INPUT_PROPS}
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
  );
}
