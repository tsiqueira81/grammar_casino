// A betting card's answer for a typed hand (open cloze, word formation, key word transformation) and its wager (moved out of PlayerBettingCard, F7).

import React from 'react';
import { ANSWER_INPUT_PROPS } from '../../utils/answerInputProps';
import { AlertTriangle } from 'lucide-react';
import { Player, Bet, SoundEffect, QuestionType } from '../../types';
import ActionButton from '../ActionButton';
import TextInput from '../TextInput';
import { QuickChipTray, WagerChipsDisplay } from '../ChipStacks';
import { WordTilePicker } from '../NewFormatSentence';

export interface BetTypedAnswerProps {
  questionType: QuestionType;
  baseWord: string;
  scalpelHint: { eliminatedOptions?: string[]; clozeMask?: string; };
  hasSplitBet: boolean;
  bet: Bet;
  highlightAnswerMissing: boolean;
  isUnchangedBaseWord: boolean;
  isInvalidKwtPhrase: boolean;
  actualBetAmount: number;
  splitWord1InputRef: React.RefObject<HTMLInputElement>;
  isBlocked: boolean;
  onBetChange: (playerId: number, field: keyof Bet, value: any) => void;
  player: Player;
  splitWord2InputRef: React.RefObject<HTMLInputElement>;
  clozeWordInputRef: React.RefObject<HTMLInputElement>;
  options: string[];
  inspectKwtPhrase: (raw?: string) => { trimmed: string; wordCount: number; hasKeyWord: boolean; isValidCount: boolean; isValid: boolean; };
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

export function BetTypedAnswer({
  questionType,
  baseWord,
  scalpelHint,
  hasSplitBet,
  bet,
  highlightAnswerMissing,
  isUnchangedBaseWord,
  isInvalidKwtPhrase,
  actualBetAmount,
  splitWord1InputRef,
  isBlocked,
  onBetChange,
  player,
  splitWord2InputRef,
  clozeWordInputRef,
  options,
  inspectKwtPhrase,
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
}: BetTypedAnswerProps) {

  return (
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
                  {...ANSWER_INPUT_PROPS}
                  value={bet?.splitClozeAnswers?.[0] || ''}
                  onChange={(e) => {
                    if (isBlocked) return;
                    const val =
                      (questionType === 'keyWordTransformation' || questionType === 'wordOrder')
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
                  maxLength={questionType === 'keyWordTransformation' ? 80 : questionType === 'wordOrder' ? 120 : 32}
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
                  {...ANSWER_INPUT_PROPS}
                  value={bet?.splitClozeAnswers?.[1] || ''}
                  onChange={(e) => {
                    if (isBlocked) return;
                    const first = bet?.splitClozeAnswers?.[0] || '';
                    const val =
                      (questionType === 'keyWordTransformation' || questionType === 'wordOrder')
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
                  maxLength={questionType === 'keyWordTransformation' ? 80 : questionType === 'wordOrder' ? 120 : 32}
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
                  : questionType === 'wordOrder'
                    ? 'Put the words in order'
                    : questionType === 'wordFormation'
                    ? `Change ${(baseWord || 'ROOT').toUpperCase()} to fit the gap`
                    : 'Type the missing word'}
              </span>
            </label>
            <span className="text-gc-cap font-semibold text-gc-quiet shrink-0">
              {questionType === 'keyWordTransformation' ? '2 to 6 words' : questionType === 'wordOrder' ? 'The whole sentence' : 'One word'}
            </span>
          </div>
          <input
            ref={clozeWordInputRef}
            type="text"
            {...ANSWER_INPUT_PROPS}
            value={bet?.clozeAnswer || ''}
            onChange={(e) => {
              if (isBlocked) return;
              const val =
                (questionType === 'keyWordTransformation' || questionType === 'wordOrder')
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
                  : questionType === 'wordOrder'
                    ? 'Tap the words, or type the sentence'
                    : 'The missing word'
            }
            maxLength={questionType === 'keyWordTransformation' ? 80 : questionType === 'wordOrder' ? 120 : 32}
            className="w-full h-14 px-4 rounded-gc-sm bg-gc-card/60 border border-gc-line/[0.2] text-gc-ink placeholder:text-gc-quiet/70 placeholder:not-italic placeholder:font-sans placeholder:text-gc-body focus:outline-none focus:border-gc-gold focus:ring-2 focus:ring-gc-gold/30 transition-colors font-sentence italic font-semibold text-gc-title"
          />
          {questionType === 'wordOrder' && options.length > 0 && (
            <WordTilePicker
              tiles={options}
              value={bet?.clozeAnswer || ''}
              disabled={isBlocked}
              onChange={(next) => onBetChange(player.id, 'clozeAnswer', next)}
            />
          )}
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
  );
}
