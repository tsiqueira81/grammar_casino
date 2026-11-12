// A betting card's answer with the Split bet power-up: the stake shared between Valid and Flawed (moved out of PlayerBettingCard, F7).

import React from 'react';
import { ANSWER_INPUT_PROPS } from '../../utils/answerInputProps';
import { Player, Bet, SoundEffect } from '../../types';
import TextInput from '../TextInput';
import { QuickChipTray, WagerChipsDisplay } from '../ChipStacks';

export interface BetSplitAnswerProps {
  wagerInputRef: React.RefObject<HTMLInputElement>;
  betAmount: number | "";
  handleBetAmountChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isBetCapped: boolean;
  effectiveBetCap: number;
  isBlocked: boolean;
  player: Player;
  highlightWagerMissing: boolean;
  handleAllIn: () => void;
  actualBetAmount: number;
  handleAddQuickChip: (val: number) => void;
  handleClearBet: () => void;
  playSound: (sound: SoundEffect) => void;
  splitPercent: number;
  onBetChange: (playerId: number, field: keyof Bet, value: any) => void;
  splitIncorrectAmount: number;
  splitCorrectAmount: number;
  hasDoubleOrNothing: boolean;
  bet: Bet;
  handleCorrectionChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  currentSentenceText: string;
  lastCorrectionTapRef: React.RefObject<number>;
}

export function BetSplitAnswer({
  wagerInputRef,
  betAmount,
  handleBetAmountChange,
  isBetCapped,
  effectiveBetCap,
  isBlocked,
  player,
  highlightWagerMissing,
  handleAllIn,
  actualBetAmount,
  handleAddQuickChip,
  handleClearBet,
  playSound,
  splitPercent,
  onBetChange,
  splitIncorrectAmount,
  splitCorrectAmount,
  hasDoubleOrNothing,
  bet,
  handleCorrectionChange,
  currentSentenceText,
  lastCorrectionTapRef,
}: BetSplitAnswerProps) {

  return (
    <>
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
    </>
  );
}
