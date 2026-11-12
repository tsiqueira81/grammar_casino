// The phone during a hand: the answer, the wager and the hint (moved out of StudentControllerView, F7).

import React from 'react';
import { ANSWER_INPUT_PROPS } from '../../utils/answerInputProps';
import { HINT_COST, POWERUP_COST } from '../../constants';
import { Bet, QuestionType, SoundEffect } from '../../types';
import { PlayerViewPayload, StudentIntent } from '../../utils/multiplayerProtocol';
import { AlertTriangle, Check, Lightbulb, Sparkles, X } from 'lucide-react';
import { isOptionType, isTypedAnswerType } from '../../game/questionTypes';
import { WordTilePicker } from '../NewFormatSentence';

export interface PhoneAnswerProps {
  view: PlayerViewPayload;
  lockWarning: { message: string; missingField: "answer" | "wager" | "both"; };
  setLockWarning: React.Dispatch<React.SetStateAction<{ message: string; missingField: "answer" | "wager" | "both"; }>>;
  answerSectionRef: React.RefObject<HTMLDivElement>;
  sectionTitle: "text-gc-small font-bold text-gc-quiet";
  hasSplitBet: boolean;
  requiredChip: "text-gc-cap font-bold px-2.5 py-0.5 rounded-full bg-gc-loss/15 text-gc-loss";
  qType: QuestionType;
  localBet: Bet;
  updateBetField: (field: keyof Bet, value: any) => void;
  firstOpinionBtnRef: React.RefObject<HTMLButtonElement>;
  playSound: (sound: SoundEffect, ...args: any[]) => void;
  onTypingFocus: (el: HTMLElement, where?: "answer" | "wager") => void;
  onTypingBlur: () => void;
  onAnswerEnter: (e: React.KeyboardEvent<HTMLInputElement>, next: HTMLInputElement | null) => void;
  lastCorrectionTapRef: React.RefObject<number>;
  textField: "w-full rounded-gc-sm border-2 bg-gc-line/[0.05] text-gc-ink placeholder:text-gc-quiet/70 placeholder:font-sans placeholder:not-italic placeholder:text-gc-body focus:outline-none transition-colors";
  fieldOk: "border-gc-line/[0.16] focus:border-gc-gold";
  firstOptionBtnRef: React.RefObject<HTMLButtonElement>;
  splitWord1InputRef: React.RefObject<HTMLInputElement>;
  splitWord2InputRef: React.RefObject<HTMLInputElement>;
  fieldBad: "border-gc-loss ring-2 ring-gc-loss/25";
  clozeWordInputRef: React.RefObject<HTMLInputElement>;
  isTyping: "answer" | "wager";
  inlineLockButton: React.JSX.Element;
  wagerSectionRef: React.RefObject<HTMLDivElement>;
  money: (n: number) => string;
  maxAllowedBet: number;
  wagerInputRef: React.RefObject<HTMLInputElement>;
  handleToggleLockIn: () => void;
  betAmountNum: number;
  sendIntent: (intent: StudentIntent) => void;
}

export function PhoneAnswer({
  view,
  lockWarning,
  setLockWarning,
  answerSectionRef,
  sectionTitle,
  hasSplitBet,
  requiredChip,
  qType,
  localBet,
  updateBetField,
  firstOpinionBtnRef,
  playSound,
  onTypingFocus,
  onTypingBlur,
  onAnswerEnter,
  lastCorrectionTapRef,
  textField,
  fieldOk,
  firstOptionBtnRef,
  splitWord1InputRef,
  splitWord2InputRef,
  fieldBad,
  clozeWordInputRef,
  isTyping,
  inlineLockButton,
  wagerSectionRef,
  money,
  maxAllowedBet,
  wagerInputRef,
  handleToggleLockIn,
  betAmountNum,
  sendIntent,
}: PhoneAnswerProps) {

  return (
    <>
      {!view.isFrozen && view.me.money > 0 && view.sentence && (() => {
        const highlightAnswerMissing =
          lockWarning?.missingField === 'answer' || lockWarning?.missingField === 'both';
        const highlightWagerMissing =
          lockWarning?.missingField === 'wager' || lockWarning?.missingField === 'both';

        return (
          <div className="space-y-5">
            {lockWarning && (
              <div
                role="alert"
                className="px-4 py-3 rounded-gc bg-gc-loss/10 border border-gc-loss/50 text-gc-ink text-gc-small font-semibold flex items-center justify-between gap-3 animate-gc-slide-up"
              >
                <div className="flex items-center gap-2.5 text-left">
                  <AlertTriangle className="w-5 h-5 shrink-0 text-gc-loss" aria-hidden="true" />
                  <span>{lockWarning.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setLockWarning(null)}
                  className="h-11 px-4 rounded-full bg-gc-line/[0.07] border border-gc-line/[0.16] text-gc-ink text-gc-small font-bold cursor-pointer shrink-0"
                >
                  OK
                </button>
              </div>
            )}

            {/* Your answer */}
            <section
              ref={answerSectionRef}
              aria-label="Your answer"
              className={`space-y-2.5 rounded-gc transition-all ${highlightAnswerMissing ? 'p-3 -mx-3 ring-2 ring-gc-loss/60 bg-gc-loss/[0.06]' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className={`${sectionTitle} m-0`}>
                  Your answer{hasSplitBet ? ' (split bet)' : ''}
                </h2>
                {highlightAnswerMissing && <span className={requiredChip}>Needed</span>}
              </div>

              {/* Valid or flawed */}
              {qType === 'binary' && (
                <div className="space-y-3">
                  {hasSplitBet ? (
                    <div className="p-4 rounded-gc bg-indigo-500/[0.07] border border-indigo-500/30 dark:border-indigo-300/30 space-y-2">
                      <div className="flex justify-between text-gc-small font-bold tabular-nums">
                        <span className="text-gc-win">Valid {localBet.splitCorrectPercent ?? 50}%</span>
                        <span className="text-gc-loss">Flawed {100 - (localBet.splitCorrectPercent ?? 50)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={10}
                        aria-label="How much goes on Valid"
                        value={localBet.splitCorrectPercent ?? 50}
                        onChange={(e) => updateBetField('splitCorrectPercent', Number(e.target.value))}
                        className="w-full accent-amber-500 h-11 cursor-pointer"
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        ref={firstOpinionBtnRef}
                        type="button"
                        aria-pressed={localBet.opinion === 'correct'}
                        onClick={() => updateBetField('opinion', 'correct')}
                        className={`h-[104px] rounded-[18px] border-2 flex flex-col items-center justify-center gap-1.5 text-xl font-extrabold cursor-pointer transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-gc-gold/50 ${
                          localBet.opinion === 'correct'
                            ? 'bg-gc-win/15 border-emerald-700 dark:border-emerald-400 text-gc-win animate-gc-pulse'
                            : 'bg-gc-line/[0.07] border-gc-line/[0.14] text-gc-ink'
                        }`}
                      >
                        <Check className="w-7 h-7" strokeWidth={2.6} aria-hidden="true" />
                        Valid
                      </button>
                      <button
                        type="button"
                        aria-pressed={localBet.opinion === 'incorrect'}
                        onClick={() => updateBetField('opinion', 'incorrect')}
                        className={`h-[104px] rounded-[18px] border-2 flex flex-col items-center justify-center gap-1.5 text-xl font-extrabold cursor-pointer transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-gc-gold/50 ${
                          localBet.opinion === 'incorrect'
                            ? 'bg-gc-loss/15 border-rose-700 dark:border-rose-400 text-gc-loss animate-gc-pulse'
                            : 'bg-gc-line/[0.07] border-gc-line/[0.14] text-gc-ink'
                        }`}
                      >
                        <X className="w-7 h-7" strokeWidth={2.6} aria-hidden="true" />
                        Flawed
                      </button>
                    </div>
                  )}

                  {(localBet.opinion === 'incorrect' ||
                    (hasSplitBet && (localBet.splitCorrectPercent ?? 50) < 100)) && (() => {
                    const hasDoubleOrNothing = view.myActivePowerUps.some((pu) => pu.type === 'DOUBLE_OR_NOTHING');
                    return (
                      <div className="animate-gc-slide-up">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <label htmlFor="gc-phone-correction" className="block text-gc-small font-bold text-gc-ink">
                            {hasDoubleOrNothing ? (
                              <span className="text-amber-600 dark:text-amber-400 font-extrabold">
                                🎲 Double or Nothing: correction required for 3× win
                              </span>
                            ) : (
                              'Bonus: write the corrected sentence'
                            )}
                          </label>
                          {view.sentence.text && (
                            <button
                              type="button"
                              onClick={() => {
                                playSound('click');
                                updateBetField('userCorrection', view.sentence!.text);
                              }}
                              className="text-gc-cap font-semibold text-gc-quiet hover:text-gc-ink underline underline-offset-4 cursor-pointer"
                            >
                              Copy the sentence here
                            </button>
                          )}
                        </div>
                        <input
                          id="gc-phone-correction"
                          type="text"
                          {...ANSWER_INPUT_PROPS}
                          onFocus={(e) => onTypingFocus(e.currentTarget)}
                          onBlur={onTypingBlur}
                          onKeyDown={(e) => onAnswerEnter(e, null)}
                          value={localBet.userCorrection || ''}
                          onChange={(e) => updateBetField('userCorrection', e.target.value)}
                          onDoubleClick={() => {
                            if (view.sentence?.text) {
                              playSound('click');
                              updateBetField('userCorrection', view.sentence.text);
                            }
                          }}
                          onTouchEnd={() => {
                            const now = Date.now();
                            if (now - lastCorrectionTapRef.current <= 350) {
                              lastCorrectionTapRef.current = 0;
                              if (view.sentence?.text) {
                                playSound('click');
                                updateBetField('userCorrection', view.sentence.text);
                              }
                            } else {
                              lastCorrectionTapRef.current = now;
                            }
                          }}
                          placeholder={
                            hasDoubleOrNothing
                              ? 'Write the corrected sentence (blank/wrong loses 1.5× bet)...'
                              : 'Optional. Double-tap to copy the sentence here.'
                          }
                          className={`${textField} ${
                            hasDoubleOrNothing && !localBet.userCorrection?.trim()
                              ? 'border-amber-500/70 bg-amber-500/[0.04]'
                              : fieldOk
                          } min-h-[52px] px-4 font-sentence italic text-gc-lead`}
                          aria-describedby="gc-phone-correction-privacy"
                        />
                        <p id="gc-phone-correction-privacy" className="mt-1 mb-0 text-gc-cap text-gc-quiet">
                          Do not type personal information.
                        </p>
                        {hasDoubleOrNothing && !localBet.userCorrection?.trim() && (
                          <p className="mt-1.5 text-gc-cap font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-gc-sm px-2.5 py-1.5">
                            ⚠️ Heads up: With Double or Nothing active, locking in Flawed without a valid correction results in a −1.5× loss.
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Multiple choice */}
              {isOptionType(qType) && (
                <div className="grid grid-cols-1 gap-2.5">
                  {(() => {
                    const eliminatedSet = new Set(
                      (view.scalpelHint?.eliminatedOptions || []).map((o) => o.trim().toLowerCase())
                    );
                    return (view.sentence.options || []).map((opt, idx) => {
                      const letter = ['A', 'B', 'C', 'D'][idx] || '';
                      const isEliminatedOpt = eliminatedSet.has(opt.trim().toLowerCase());
                      const splitList = localBet.splitOptions || [];
                      const isSelected = hasSplitBet ? splitList.includes(opt) : localBet.selectedOption === opt;
                      const isDoubleStacked =
                        hasSplitBet && splitList.length === 2 && splitList[0] === opt && splitList[1] === opt;

                      return (
                        <button
                          key={opt}
                          ref={idx === 0 ? firstOptionBtnRef : undefined}
                          type="button"
                          disabled={isEliminatedOpt}
                          aria-pressed={isSelected}
                          onClick={() => {
                            if (isEliminatedOpt) return;
                            if (hasSplitBet) {
                              let next: string[];
                              if (splitList.length === 0) {
                                next = [opt];
                              } else if (splitList.length === 1) {
                                next = [splitList[0], opt];
                              } else if (splitList.includes(opt)) {
                                next = splitList.filter((o) => o !== opt);
                              } else {
                                next = [splitList[1], opt];
                              }
                              updateBetField('splitOptions', next);
                            } else {
                              updateBetField('selectedOption', opt);
                            }
                          }}
                          className={`min-h-[60px] px-4 py-2.5 rounded-gc border-2 text-left flex items-center justify-between gap-3 transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-gc-gold/50 ${
                            isEliminatedOpt
                              ? 'opacity-50 cursor-not-allowed bg-gc-line/[0.04] border-gc-loss/30 text-gc-quiet'
                              : isSelected
                                ? 'cursor-pointer bg-gc-gold/15 border-gc-gold text-gc-ink animate-gc-pulse'
                                : 'cursor-pointer bg-gc-line/[0.07] border-gc-line/[0.14] text-gc-ink'
                          }`}
                        >
                          <span className="flex items-center gap-3 min-w-0">
                            <span
                              className={`w-9 h-9 rounded-full grid place-items-center text-gc-body font-extrabold shrink-0 ${
                                isSelected ? 'bg-gc-gold text-gc-on-gold' : 'bg-gc-line/[0.08] text-gc-quiet'
                              }`}
                            >
                              {letter}
                            </span>
                            <span className={`text-gc-lead font-sentence italic font-semibold break-words min-w-0 text-left ${isEliminatedOpt ? 'line-through' : ''}`}>
                              {opt}
                            </span>
                          </span>
                          {isEliminatedOpt ? (
                            <span className="text-gc-cap font-bold px-2.5 py-1 rounded-full bg-gc-loss/15 text-gc-loss shrink-0">✂️ Cut</span>
                          ) : isDoubleStacked ? (
                            <span className="text-gc-cap font-bold px-2.5 py-1 rounded-full bg-gc-gold text-gc-on-gold shrink-0">2×</span>
                          ) : null}
                        </button>
                      );
                    });
                  })()}
                </div>
              )}

              {/* Open cloze, word formation, key word transformation */}
              {(isTypedAnswerType(qType)) && (() => {
                const cleanBase = (view.sentence?.baseWord || '').trim().toLowerCase();
                const isUnchangedBase =
                  qType === 'wordFormation' &&
                  Boolean(cleanBase) &&
                  (hasSplitBet
                    ? [localBet.splitClozeAnswers?.[0], localBet.splitClozeAnswers?.[1]].some(
                        (w) => Boolean(w?.trim()) && w!.trim().toLowerCase() === cleanBase
                      )
                    : Boolean(localBet.clozeAnswer?.trim()) &&
                      localBet.clozeAnswer!.trim().toLowerCase() === cleanBase);

                const kwtCheck = (() => {
                  const raw = (localBet.clozeAnswer || '').trim();
                  const words = raw ? raw.split(/\s+/).filter(Boolean) : [];
                  const escaped = cleanBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  const hasKeyWord = cleanBase ? new RegExp(`\\b${escaped}\\b`, 'i').test(raw) : true;
                  const isValidCount = words.length >= 2 && words.length <= 6;
                  return { raw, wordCount: words.length, hasKeyWord, isValidCount };
                })();
                const bad = highlightAnswerMissing || isUnchangedBase;
                const baseUpper = (view.sentence?.baseWord || '').toUpperCase();

                return (
                  <div className="space-y-2.5">
                    {qType === 'wordFormation' && view.sentence?.baseWord && (
                      <div className="px-4 py-3 rounded-gc bg-gc-gold/10 border border-gc-gold/40 flex items-center justify-between gap-2">
                        <span className="text-gc-small font-bold text-gc-ink flex items-center gap-1.5">
                          <span aria-hidden="true">🧬</span>
                          Change the form of this word
                        </span>
                        <span className="px-3 py-0.5 rounded-full bg-gc-gold text-gc-on-gold font-extrabold text-gc-small tracking-wider">
                          {baseUpper}
                        </span>
                      </div>
                    )}
                    {qType === 'keyWordTransformation' && view.sentence?.baseWord && (
                      <div className="text-gc-small text-gc-quiet">
                        Use 2 to 6 words, including <strong className="text-gc-ink">{baseUpper}</strong> unchanged. One mark pays 1×, two marks pay 2×.
                      </div>
                    )}
                    {hasSplitBet ? (
                      <div className="grid grid-cols-1 gap-2.5">
                        <input
                          ref={splitWord1InputRef}
                          type="text"
                          {...ANSWER_INPUT_PROPS}
                          onFocus={(e) => onTypingFocus(e.currentTarget)}
                          onBlur={onTypingBlur}
                          onKeyDown={(e) => onAnswerEnter(e, splitWord2InputRef.current)}
                          aria-label="First answer"
                          maxLength={qType === 'keyWordTransformation' ? 80 : qType === 'wordOrder' ? 120 : 32}
                          value={localBet.splitClozeAnswers?.[0] || ''}
                          onChange={(e) =>
                            updateBetField('splitClozeAnswers', [
                              (qType === 'keyWordTransformation' || qType === 'wordOrder')
                                ? e.target.value.replace(/\s{2,}/g, ' ')
                                : e.target.value.replace(/\s+/g, ''),
                              localBet.splitClozeAnswers?.[1] || '',
                            ])
                          }
                          placeholder={
                            qType === 'keyWordTransformation' && baseUpper
                              ? `First answer, with ${baseUpper} (half)`
                              : qType === 'wordFormation' && baseUpper
                                ? `A new form of ${baseUpper} (half)`
                                : 'First word (half)'
                          }
                          className={`${textField} ${bad ? fieldBad : fieldOk} min-h-[52px] px-4 font-sentence italic font-semibold text-gc-lead`}
                        />
                        <input
                          ref={splitWord2InputRef}
                          type="text"
                          {...ANSWER_INPUT_PROPS}
                          onFocus={(e) => onTypingFocus(e.currentTarget)}
                          onBlur={onTypingBlur}
                          onKeyDown={(e) => onAnswerEnter(e, null)}
                          aria-label="Second answer"
                          maxLength={qType === 'keyWordTransformation' ? 80 : qType === 'wordOrder' ? 120 : 32}
                          value={localBet.splitClozeAnswers?.[1] || ''}
                          onChange={(e) =>
                            updateBetField('splitClozeAnswers', [
                              localBet.splitClozeAnswers?.[0] || '',
                              (qType === 'keyWordTransformation' || qType === 'wordOrder')
                                ? e.target.value.replace(/\s{2,}/g, ' ')
                                : e.target.value.replace(/\s+/g, ''),
                            ])
                          }
                          placeholder="Second answer (optional, half)"
                          className={`${textField} ${bad ? fieldBad : fieldOk} min-h-[52px] px-4 font-sentence italic font-semibold text-gc-lead`}
                        />
                      </div>
                    ) : (
                      <input
                        ref={clozeWordInputRef}
                        type="text"
                        {...ANSWER_INPUT_PROPS}
                        onFocus={(e) => onTypingFocus(e.currentTarget)}
                        onBlur={onTypingBlur}
                        onKeyDown={(e) => onAnswerEnter(e, null)}
                        aria-label="Your answer"
                        maxLength={qType === 'keyWordTransformation' ? 80 : qType === 'wordOrder' ? 120 : 32}
                        value={localBet.clozeAnswer || ''}
                        onChange={(e) =>
                          updateBetField(
                            'clozeAnswer',
                            (qType === 'keyWordTransformation' || qType === 'wordOrder')
                              ? e.target.value.replace(/\s{2,}/g, ' ')
                              : e.target.value.replace(/\s+/g, '')
                          )
                        }
                        placeholder={
                          qType === 'keyWordTransformation' && baseUpper
                            ? `2 to 6 words, including ${baseUpper}`
                            : qType === 'wordFormation' && baseUpper
                              ? `A new form of ${baseUpper}`
                              : qType === 'wordOrder'
                                ? 'Tap the words, or type the sentence'
                                : 'The missing word'
                        }
                        className={`${textField} ${bad ? fieldBad : fieldOk} h-14 px-4 font-sentence italic font-semibold text-gc-title`}
                      />
                    )}
                    {qType === 'wordOrder' && !hasSplitBet && (view.sentence?.options || []).length > 0 && (
                      <WordTilePicker
                        tiles={view.sentence?.options || []}
                        value={localBet.clozeAnswer || ''}
                        onChange={(next) => updateBetField('clozeAnswer', next)}
                      />
                    )}
                    {qType === 'keyWordTransformation' && !hasSplitBet && kwtCheck.raw && (
                      <div className="flex flex-wrap items-center justify-between gap-2 text-gc-cap">
                        <span className={`px-2.5 py-1 rounded-full font-bold ${kwtCheck.hasKeyWord ? 'bg-gc-win/15 text-gc-win' : 'bg-gc-loss/15 text-gc-loss'}`}>
                          {kwtCheck.hasKeyWord ? `✓ Key word ${baseUpper || 'KEY'} is in` : `Use ${baseUpper || 'KEY'} without changing it`}
                        </span>
                        <span className={`px-2.5 py-1 rounded-full tabular-nums font-bold ${kwtCheck.isValidCount ? 'bg-gc-win/15 text-gc-win' : 'bg-gc-gold/15 text-gc-money'}`}>
                          {kwtCheck.wordCount} of 2 to 6 words
                        </span>
                      </div>
                    )}
                    {isUnchangedBase && (
                      <div className="px-4 py-3 rounded-gc bg-gc-loss/10 border border-gc-loss/50 text-gc-ink text-gc-small font-semibold flex items-center gap-2.5">
                        <AlertTriangle className="w-5 h-5 shrink-0 text-gc-loss" aria-hidden="true" />
                        <span>
                          That's the base word as it is (<strong>{baseUpper}</strong>). Change its form, for example with a prefix or suffix.
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}
              {isTyping === 'answer' && inlineLockButton}
            </section>

            {/* Your bet */}
            <section
              ref={wagerSectionRef}
              aria-label="Your bet"
              className={`space-y-2.5 rounded-gc transition-all ${highlightWagerMissing ? 'p-3 -mx-3 ring-2 ring-gc-loss/60 bg-gc-loss/[0.06]' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className={`${sectionTitle} m-0`}>Your bet</h2>
                {highlightWagerMissing ? (
                  <span className={requiredChip}>Needed</span>
                ) : (
                  <span className="text-gc-cap font-semibold text-gc-quiet tabular-nums">
                    {view.isHighRoller ? `At least $${view.minBetAmount.toLocaleString()} · ` : ''}Up to {money(maxAllowedBet)}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between gap-2.5">
                <div className="relative flex-1 min-w-0">
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 text-[38px] font-extrabold text-gc-money pointer-events-none" aria-hidden="true">$</span>
                  <input
                    ref={wagerInputRef}
                    type="text"
                    inputMode="numeric"
                    enterKeyHint="done"
                    autoComplete="off"
                    onFocus={(e) => onTypingFocus(e.currentTarget, 'wager')}
                    onBlur={onTypingBlur}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      handleToggleLockIn();
                    }}
                    pattern="[0-9]*"
                    aria-label="Your bet in dollars"
                    value={localBet.bet ?? ''}
                    onChange={(e) => updateBetField('bet', e.target.value)}
                    placeholder={view.isHighRoller ? String(view.minBetAmount) : '0'}
                    className={`w-full h-14 pl-7 pr-1 bg-transparent border-0 border-b-2 rounded-none text-[38px] font-extrabold text-gc-money tabular-nums placeholder:text-gc-money/40 focus:outline-none ${
                      highlightWagerMissing ? 'border-gc-loss' : 'border-gc-line/[0.16] focus:border-gc-gold'
                    }`}
                  />
                </div>
                <div className="flex gap-2 shrink-0">
                  {view.isHighRoller && (
                    <button
                      type="button"
                      onClick={() => updateBetField('bet', Math.min(maxAllowedBet, view.minBetAmount))}
                      className="h-11 px-3.5 rounded-full border border-gc-line/[0.16] text-gc-small font-bold text-gc-ink cursor-pointer"
                    >
                      Least
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => updateBetField('bet', maxAllowedBet)}
                    className="h-11 px-3.5 rounded-full border border-gc-line/[0.16] text-gc-small font-bold text-gc-ink cursor-pointer"
                  >
                    All in
                  </button>
                  <button
                    type="button"
                    onClick={() => updateBetField('bet', '')}
                    className="h-11 px-3.5 rounded-full border border-gc-line/[0.16] text-gc-small font-bold text-gc-ink cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Chips add to the bet */}
              <div className="grid grid-cols-4 gap-2.5 pt-1">
                {[
                  { v: 10, cls: 'bg-[#2563eb]' },
                  { v: 25, cls: 'bg-[#15803d]' },
                  { v: 50, cls: 'bg-[#be123c]' },
                  { v: 100, cls: 'bg-[#1f2937] dark:bg-[#111827]' },
                ].map((chip) => (
                  <button
                    key={chip.v}
                    type="button"
                    aria-label={`Add $${chip.v}`}
                    onClick={() => {
                      playSound('bet');
                      updateBetField('bet', Math.min(maxAllowedBet, betAmountNum + chip.v));
                    }}
                    className={`h-[52px] rounded-full text-white text-[15px] font-extrabold shadow-[0_6px_12px_-6px_rgba(0,0,0,0.6),inset_0_-3px_0_rgba(0,0,0,0.25)] active:scale-95 transition-transform cursor-pointer ${chip.cls}`}
                  >
                    +${chip.v}
                  </button>
                ))}
              </div>
              {isTyping === 'wager' && inlineLockButton}
            </section>

            {/* Help: a hint and a power-up */}
            <section aria-label="Help" className="space-y-2.5">
              <button
                type="button"
                disabled={Boolean(view.myHint?.text || view.myHint?.isLoading) || view.me.money < HINT_COST}
                onClick={() => {
                  playSound('hint');
                  sendIntent({ type: 'BUY_HINT' });
                }}
                className="w-full h-[52px] px-3.5 rounded-[14px] border border-gc-line/[0.12] bg-gc-line/[0.07] text-gc-ink text-[15px] font-bold flex items-center gap-2.5 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Lightbulb className="w-[18px] h-[18px] text-gc-quiet" aria-hidden="true" />
                {view.myHint?.text ? 'Hint bought' : 'Get a hint'}
                <span className="ml-auto text-gc-money tabular-nums">${HINT_COST}</span>
              </button>
              {view.myHint && (
                <div className="px-4 py-3 rounded-[14px] bg-gc-info/10 text-gc-info text-[15px] font-semibold animate-gc-slide-up" role="status">
                  {view.myHint.isLoading ? 'Finding a hint…' : view.myHint.text}
                </div>
              )}
              <button
                type="button"
                disabled={!view.canBuyPowerUp}
                onClick={() => {
                  playSound('powerUp');
                  sendIntent({ type: 'BUY_RANDOM_POWER_UP' });
                }}
                className="w-full h-[52px] px-3.5 rounded-[14px] border border-gc-line/[0.12] bg-gc-line/[0.07] text-gc-ink text-[15px] font-bold flex items-center gap-2.5 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Sparkles className="w-[18px] h-[18px] text-purple-600 dark:text-purple-300" aria-hidden="true" />
                Draw a power-up
                <span data-testid="phone-draw-price" className="ml-auto text-gc-money tabular-nums">{view.freeDraw ? 'Free' : `$${POWERUP_COST}`}</span>
              </button>
            </section>
          </div>
        );
      })()}
    </>
  );
}
