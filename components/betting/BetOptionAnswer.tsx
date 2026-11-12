// A betting card's answer for an option hand (multiple choice and similar) and its wager (moved out of PlayerBettingCard, F7).

import React from 'react';
import { Player, Bet, SoundEffect } from '../../types';
import ActionButton from '../ActionButton';
import TextInput from '../TextInput';
import { QuickChipTray, WagerChipsDisplay } from '../ChipStacks';

export interface BetOptionAnswerProps {
  hasSplitBet: boolean;
  bet: Bet;
  actualBetAmount: number;
  highlightAnswerMissing: boolean;
  options: string[];
  scalpelHint: { eliminatedOptions?: string[]; clozeMask?: string; };
  firstOptionBtnRef: React.RefObject<HTMLButtonElement>;
  isBlocked: boolean;
  onBetChange: (playerId: number, field: keyof Bet, value: any) => void;
  player: Player;
  wagerInputRef: React.RefObject<HTMLInputElement>;
  betAmount: number | "";
  handleBetAmountChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isBetCapped: boolean;
  effectiveBetCap: number;
  highlightWagerMissing: boolean;
  handleAllIn: () => void;
  isHighRoller: boolean;
  effectiveMinBet: number;
  handleAddQuickChip: (val: number) => void;
  handleClearBet: () => void;
  playSound: (sound: SoundEffect) => void;
}

export function BetOptionAnswer({
  hasSplitBet,
  bet,
  actualBetAmount,
  highlightAnswerMissing,
  options,
  scalpelHint,
  firstOptionBtnRef,
  isBlocked,
  onBetChange,
  player,
  wagerInputRef,
  betAmount,
  handleBetAmountChange,
  isBetCapped,
  effectiveBetCap,
  highlightWagerMissing,
  handleAllIn,
  isHighRoller,
  effectiveMinBet,
  handleAddQuickChip,
  handleClearBet,
  playSound,
}: BetOptionAnswerProps) {

  return (
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
                className={`relative overflow-hidden min-h-[64px] py-3 px-4 rounded-gc font-sans transition-colors duration-gc-fast border-2 flex items-center justify-between gap-3 select-none group/opt text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-gc-turn/40 ${
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
  );
}
