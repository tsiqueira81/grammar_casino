// The hand results screen (package F7: moved out of App.tsx without changes).

import { answerSplit, reactionCounts, type HandReactions } from '../game/answerSplit';
import { checkGameEnd } from '../game/flow';
import { undoRevealSecondsLeft, type RevealSnapshot } from '../game/ruling';
import React from 'react';
import { Player, Settings, GeneratedSentence, Bet, RoundResultInfo, GameMode, SoundEffect, RoundHistoryRecord, QuestionType } from '../types';
import { CHALLENGE_FORMATS } from '../constants';
import { ArrowDown, ArrowRight, ArrowUp, Cloud as CloudIcon, Save, Volume2, RotateCcw } from 'lucide-react';
import ActionButton from '../components/ActionButton';
import { PlayerAvatar } from '../components/PlayerAvatar';
import CountUp from '../components/CountUp';
import { SettingsModalTab } from '../components/RoundSettingsModal';
import { CloudManagerTab } from '../components/CloudManagerModal';
import { classCorrections, type SpecialHand } from '../game/specialHands';
import { buildAcceptedAnswerSet, getAlternativeAcceptedAnswers, normalizeGapAnswer } from '../utils/roundSettlement';
import { markErrorPhrase, diffWords } from '../utils/errorHighlight';
import { isGapType, isOptionType, isTypedAnswerType } from '../game/questionTypes';
import { renderTextSegments } from '../components/TextSegments';

export interface ResultsScreenProps {
  targetAmount: string | number;
  players: Player[];
  gameMode: GameMode;
  currentRound: number;
  totalRounds: string | number;
  mpRoomCode: string;
  currentSentence: GeneratedSentence;
  nextRoundSettings: Settings;
  settings: Settings;
  roundResults: RoundResultInfo[];
  isProjectorMode: boolean;
  levelNotice: { round: number; text: string; };
  sayItOn: boolean;
  currentSpecialHand: SpecialHand;
  roundHistory: RoundHistoryRecord[];
  simplifiedExplanation: { text: string | null; loading: boolean; };
  speakText: (text: string | null) => Promise<void>;
  isSpeaking: boolean;
  handleSimplifyExplanation: () => Promise<void>;
  isRevealSnapshotCurrent: boolean;
  revealSnapshot: RevealSnapshot;
  bets: Record<number, Bet>;
  handReactions: HandReactions;
  handleSaveGameClick: () => Promise<void>;
  playSound: (sound: SoundEffect, ...args: any[]) => void;
  handleOpenAvatarModal: (playerId: number) => void;
  handleOpenSettingsModal: (tab?: SettingsModalTab) => void;
  isUndoRevealOpen: boolean;
  handleUndoReveal: () => void;
  undoClock: number;
  setShowRulingModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowReportCardModal: React.Dispatch<React.SetStateAction<boolean>>;
  handleOpenCloudModal: (tab?: CloudManagerTab) => void;
  handleNextRound: () => void;
  setConfirmAction: React.Dispatch<React.SetStateAction<{ title: string; message: string; confirmLabel: string; onConfirm: () => void; }>>;
  handleEndGameEarly: () => void;
}

export function ResultsScreen({
  targetAmount,
  players,
  gameMode,
  currentRound,
  totalRounds,
  mpRoomCode,
  currentSentence,
  nextRoundSettings,
  settings,
  roundResults,
  isProjectorMode,
  levelNotice,
  sayItOn,
  currentSpecialHand,
  roundHistory,
  simplifiedExplanation,
  speakText,
  isSpeaking,
  handleSimplifyExplanation,
  isRevealSnapshotCurrent,
  revealSnapshot,
  bets,
  handReactions,
  handleSaveGameClick,
  playSound,
  handleOpenAvatarModal,
  handleOpenSettingsModal,
  isUndoRevealOpen,
  handleUndoReveal,
  undoClock,
  setShowRulingModal,
  setShowReportCardModal,
  handleOpenCloudModal,
  handleNextRound,
  setConfirmAction,
  handleEndGameEarly,
}: ResultsScreenProps) {
    const numTargetAmount = typeof targetAmount === 'string' ? parseInt(targetAmount, 10) : targetAmount;
    const {
      isGameOver,
      isRoundLimitReached,
      hasTargetWinner,
      isEliminationVictory,
      isAllBankrupt,
      bailoutEnabled: isBailoutEnabled,
    } = checkGameEnd({ players, gameMode, currentRound, totalRounds, targetAmount, isRoom: Boolean(mpRoomCode) });
    const resultQuestionType: QuestionType = currentSentence?.questionType || 'binary';
    const isResultCloze = isGapType(resultQuestionType);
    // Flawed Valid/Flawed sentences: underline the mistake and highlight the fix.
    const revealHighlight = (() => {
      if (!currentSentence || isResultCloze || currentSentence.isCorrect || !currentSentence.correction) return null;
      const diff = diffWords(currentSentence.text, currentSentence.correction);
      const fromPhrase = markErrorPhrase(currentSentence.text, currentSentence.errorPhrase);
      const sentence = fromPhrase || diff.original;
      return { sentence, correction: diff.corrected };
    })();
    const nextFormatObj = CHALLENGE_FORMATS.find(f => f.id === (nextRoundSettings?.challengeFormat || settings.challengeFormat || 'binary')) || CHALLENGE_FORMATS[0];

    // Payouts: rank by balance (ties share a rank), and how far each player moved this hand.
    const rankOf = (value: number, all: number[]) => 1 + all.filter(v => v > value).length;
    const newTotals = roundResults.map(r => r.newTotal);
    const prevTotals = roundResults.map(r => r.newTotal - r.amountChanged);
    const payoutRows = [...roundResults]
      .sort((a, b) => b.newTotal - a.newTotal)
      .map(result => {
        const rank = rankOf(result.newTotal, newTotals);
        const prevRank = rankOf(result.newTotal - result.amountChanged, prevTotals);
        return { result, rank, move: prevRank - rank };
      });
    const showMoves = currentRound > 1;
    const rankBadge = (rank: number) =>
      rank === 1
        ? 'bg-[#f1cf72] text-[#231803]'
        : rank === 2
          ? 'bg-[#d6dbe0] text-[#1f2937]'
          : rank === 3
            ? 'bg-[#d39a6a] text-[#2b1608]'
            : 'bg-gc-line/[0.08] text-gc-quiet';
    const chipButton = 'inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-gc-line/[0.07] border border-gc-line/[0.12] text-gc-small font-semibold text-gc-ink hover:border-gc-line/30 transition-colors cursor-pointer';
    const rulingWord = isResultCloze ? null : currentSentence?.isCorrect ? 'Valid' : 'Flawed';

    return ( 
    <div className={`w-full ${isProjectorMode ? 'max-w-7xl' : 'max-w-6xl'} animate-fade-in p-2 md:p-4`}>
        {hasTargetWinner && (
          <div className="mb-5 px-5 py-4 rounded-gc bg-gc-win/15 text-gc-win text-center text-gc-lead font-extrabold animate-gc-pop" role="status">
            Target of ${numTargetAmount.toLocaleString()} reached. We have a winner!
          </div>
        )}

        {/* The ruling: the sentence again, a stamp, then the correction and why */}
        <section className="gc-surface shadow-gc-2 rounded-gc-lg relative px-5 sm:px-14 pt-6 pb-7 text-center animate-gc-deal" aria-label="The ruling">
            <div className="flex justify-center">
              <span className="inline-flex items-center h-8 px-3.5 rounded-full bg-gc-gold text-gc-on-gold text-gc-small font-bold whitespace-nowrap">
                Hand {currentRound}{gameMode === 'rounds' ? ` of ${totalRounds}` : ''} · The ruling
              </span>
            </div>
            {rulingWord && (
              <span
                role="status"
                className={`lg:absolute lg:top-6 lg:right-8 mt-4 lg:mt-0 inline-block px-4 py-1 border-4 border-current rounded-gc-sm text-gc-title sm:text-[28px] font-extrabold uppercase tracking-[0.06em] animate-gc-stamp ${
                  currentSentence?.isCorrect ? 'text-emerald-700 dark:text-emerald-400' : 'text-gc-danger'
                }`}
              >
                {rulingWord}
              </span>
            )}

            {resultQuestionType === 'keyWordTransformation' && currentSentence?.leadInSentence && (
              <div className={`mt-5 mx-auto ${isProjectorMode ? 'max-w-4xl px-5 py-3.5' : 'max-w-3xl px-4 py-3'} rounded-gc bg-gc-line/[0.05] border border-gc-line/[0.12]`}>
                <div className="text-gc-small font-bold text-gc-quiet mb-0.5">
                  First sentence{currentSentence.baseWord ? ` · Key word: ${currentSentence.baseWord.toUpperCase()}` : ''}
                </div>
                <div className={`${isProjectorMode ? 'text-xl sm:text-[26px] leading-snug font-medium' : 'text-gc-lead'} font-sentence italic text-gc-ink`}>
                  &ldquo;{currentSentence.leadInSentence}&rdquo;
                </div>
              </div>
            )}

            <p className={`font-sentence italic ${isProjectorMode ? 'font-semibold text-4xl sm:text-5xl lg:text-[3.35rem] leading-[1.24]' : 'font-medium text-3xl sm:text-4xl lg:text-[2.875rem] leading-[1.3]'} text-gc-ink text-balance mt-5 max-w-5xl mx-auto ${rulingWord ? 'lg:px-28' : ''}`}>
              &ldquo;{revealHighlight
                ? renderTextSegments(revealHighlight.sentence, 'bg-transparent text-gc-danger underline decoration-wavy decoration-2 underline-offset-[9px] animate-gc-fade [animation-delay:0.55s]')
                : currentSentence?.text}&rdquo;
              {resultQuestionType === 'wordFormation' && currentSentence?.baseWord && (
                <span className="inline-block ml-2 px-2.5 py-0.5 rounded-md bg-gc-gold/15 border border-gc-gold/40 text-gc-money font-sans tabular-nums font-black not-italic tracking-wider text-gc-lead align-middle">
                  ({currentSentence.baseWord.toUpperCase()})
                </span>
              )}
            </p>
        </section>

        {levelNotice && levelNotice.round === currentRound && (
          <div role="status" data-testid="level-notice" className="mt-4 px-5 py-3 rounded-gc-lg bg-gc-info/[0.08] border border-gc-info/30 text-center text-gc-body font-semibold text-gc-ink">
            {levelNotice.text}
          </div>
        )}

        {sayItOn && currentSentence && (() => {
          // A gap sentence is said with the answer in the gap; other types say the corrected sentence.
          const said = /_{2,}/.test(currentSentence.text) && currentSentence.correctAnswer
            ? currentSentence.text.replace(/_{2,}/g, currentSentence.correctAnswer)
            : isResultCloze || !currentSentence.isCorrect ? currentSentence.correction : currentSentence.text;
          if (!said) return null;
          return (
            <div data-testid="say-it" className="mt-4 px-5 py-4 rounded-gc-lg bg-gc-gold/[0.12] border border-gc-gold/40 text-center animate-gc-slide-up">
              <div className="text-gc-body font-extrabold text-gc-ink">
                <span aria-hidden="true">🗣️ </span>Say it: turn to a partner and say the right sentence aloud.
              </div>
              <div className={`mt-1.5 font-sentence italic text-gc-ink ${isProjectorMode ? 'text-2xl sm:text-3xl font-semibold' : 'text-gc-lead sm:text-2xl'}`}>&ldquo;{said}&rdquo;</div>
            </div>
          );
        })()}

        {currentSpecialHand === 'fixIt' && (() => {
          const record = roundHistory.find(r => r.round === currentRound);
          const list = classCorrections(record?.playerResults || []);
          return (
            <div data-testid="fixit-corrections" className="mt-4 px-5 sm:px-8 py-4 rounded-gc-lg gc-surface text-left animate-gc-slide-up">
              <h3 className="text-gc-body font-extrabold text-gc-ink">
                <span aria-hidden="true">🛠️ </span>The class&rsquo;s corrections
              </h3>
              {list.length === 0 ? (
                <p className="mt-1 text-gc-small text-gc-quiet">Nobody typed a correction this time.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {list.map((c, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className={`mt-0.5 shrink-0 inline-flex items-center h-6 px-2 rounded-full text-gc-cap font-bold ${c.accepted ? 'bg-gc-win/15 text-gc-win' : 'bg-gc-line/[0.08] text-gc-quiet'}`}>
                        {c.accepted ? 'Accepted' : 'Not quite'}
                      </span>
                      <span className={`font-sentence italic text-gc-ink ${isProjectorMode ? 'text-2xl' : 'text-gc-lead'}`}>&ldquo;{c.text}&rdquo;</span>
                      {c.count > 1 && <span className="mt-1 text-gc-cap text-gc-quiet tabular-nums shrink-0">×{c.count}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })()}

        {isResultCloze && currentSentence?.correction && (
            <div className="gc-surface rounded-gc-lg mt-4 px-5 sm:px-8 py-5 animate-gc-slide-up [animation-delay:0.75s]">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                    <h3 className="text-gc-small font-bold text-gc-quiet">
                      The answer: <span className="text-gc-win">&ldquo;{currentSentence?.correctAnswer}&rdquo;</span>
                    </h3>
                    {(isTypedAnswerType(resultQuestionType)) && (() => {
                      const altAccepted = getAlternativeAcceptedAnswers(currentSentence.correctAnswer, currentSentence.acceptedAnswers);
                      return altAccepted.length > 0 ? (
                        <span className="text-gc-small font-semibold text-gc-win bg-gc-win/15 px-2.5 py-0.5 rounded-full">
                          Also accepted: {altAccepted.map(a => `"${a}"`).join(', ')}
                        </span>
                      ) : null;
                    })()}
                </div>
                <p className={`font-sentence italic text-gc-ink ${isProjectorMode ? 'text-3xl sm:text-4xl font-semibold' : 'text-2xl sm:text-[30px]'} leading-snug`}>
                  &ldquo;{currentSentence.correction}&rdquo;
                </p>

                {resultQuestionType === 'keyWordTransformation' &&
                  currentSentence.mark1Parts && currentSentence.mark1Parts.length > 0 &&
                  currentSentence.mark2Parts && currentSentence.mark2Parts.length > 0 && (
                    <div className="mt-4 pt-3.5 border-t border-gc-line/[0.12]">
                      <div className="text-gc-cap font-bold uppercase tracking-wider text-gc-quiet mb-2">
                        Cambridge Part 4 · 2-Mark Split Breakdown
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div className="rounded-gc bg-gc-win/[0.08] border border-gc-win/30 px-3.5 py-2.5 flex items-center justify-between gap-3">
                          <div>
                            <div className="text-gc-cap font-extrabold uppercase tracking-wider text-gc-win">
                              1st Half · 1 Mark
                            </div>
                            <div className={`font-sentence italic font-semibold text-gc-ink ${isProjectorMode ? 'text-2xl' : 'text-lg'}`}>
                              &ldquo;{currentSentence.mark1Parts[0]}&rdquo;
                            </div>
                          </div>
                          <span className="shrink-0 px-2.5 py-1 rounded-full bg-gc-win/20 text-gc-win text-gc-cap font-black tabular-nums">
                            +1 pt
                          </span>
                        </div>

                        <div className="rounded-gc bg-gc-gold/[0.10] border border-gc-gold/35 px-3.5 py-2.5 flex items-center justify-between gap-3">
                          <div>
                            <div className="text-gc-cap font-extrabold uppercase tracking-wider text-gc-money">
                              2nd Half · 1 Mark
                            </div>
                            <div className={`font-sentence italic font-semibold text-gc-ink ${isProjectorMode ? 'text-2xl' : 'text-lg'}`}>
                              &ldquo;{currentSentence.mark2Parts[0]}&rdquo;
                            </div>
                          </div>
                          <span className="shrink-0 px-2.5 py-1 rounded-full bg-gc-gold/25 text-gc-money text-gc-cap font-black tabular-nums">
                            +1 pt
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
            </div>
        )}

        {!isResultCloze && !currentSentence?.isCorrect && (
            <div className="gc-surface rounded-gc-lg mt-4 px-5 sm:px-8 py-5 animate-gc-slide-up [animation-delay:0.75s]">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                    <h3 className="text-gc-small font-bold text-gc-quiet">Correction</h3>
                    {currentSentence?.errorPhrase && (
                        <span className="text-gc-small font-semibold text-gc-loss bg-gc-loss/15 px-2.5 py-0.5 rounded-full">
                            The mistake: &ldquo;{currentSentence.errorPhrase}&rdquo;{currentSentence.mistakeType ? ` · ${currentSentence.mistakeType}` : ''}
                        </span>
                    )}
                </div>
                <p className={`font-sentence italic text-gc-ink ${isProjectorMode ? 'text-3xl sm:text-4xl font-semibold' : 'text-2xl sm:text-[30px]'} leading-snug`}>
                  &ldquo;{revealHighlight
                    ? renderTextSegments(revealHighlight.correction, 'bg-gc-win/20 text-gc-win rounded-md px-1.5')
                    : currentSentence?.correction}&rdquo;
                </p>
            </div>
        )}

        <div className="gc-surface rounded-gc-lg mt-3.5 px-5 sm:px-8 py-5 animate-gc-slide-up [animation-delay:1s]">
            <h3 className="text-gc-small font-bold text-gc-quiet mb-1.5">Why</h3>
            <p className="text-gc-ink text-gc-body sm:text-gc-lead leading-relaxed">
              {currentSentence?.explanation}
            </p>
            {simplifiedExplanation.text && (
                <div className="mt-3 px-4 py-3 rounded-gc-sm bg-gc-info/15 text-gc-info text-gc-body">
                    <strong>In more detail:</strong> {simplifiedExplanation.text}
                </div>
            )}
            <div className="flex flex-wrap gap-2 mt-4">
              <button 
                  onClick={() => {
                  if (!currentSentence) return;
                  if (isResultCloze) {
                    // Read the full completed sentence on the Results screen!
                    const fullCompleted = currentSentence.correction || currentSentence.text.replace(/_{2,}/g, currentSentence.correctAnswer || '');
                    const parts = [
                        resultQuestionType === 'keyWordTransformation' && currentSentence.leadInSentence
                          ? `Lead-in sentence: ${currentSentence.leadInSentence}`
                          : null,
                        fullCompleted,
                        `Explanation: ${currentSentence.explanation}`
                    ].filter(Boolean);
                    speakText(parts.join('. '));
                  } else {
                    const parts = [
                        currentSentence.text,
                        !currentSentence.isCorrect ? `Correction: ${currentSentence.correction}` : null,
                        `Explanation: ${currentSentence.explanation}`
                    ].filter(Boolean);
                    speakText(parts.join('. '));
                  }
                  }} 
                  disabled={isSpeaking}
                  className={`${chipButton} ${isSpeaking ? 'opacity-50 !cursor-not-allowed' : ''}`}
                  title="Read the sentence, the correction and the explanation aloud"
              >
                  <Volume2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                  {isSpeaking ? 'Speaking…' : 'Listen'}
              </button>
              {currentSentence?.explanation && (
                <button 
                    onClick={handleSimplifyExplanation} 
                    disabled={simplifiedExplanation.loading || !!simplifiedExplanation.text} 
                    className={`${chipButton} disabled:opacity-50 disabled:cursor-default`}
                >
                    {simplifiedExplanation.loading ? 'Loading…' : simplifiedExplanation.text ? 'More detail shown' : 'Explain in more detail'}
                </button>
              )}
            </div>
        </div>

        {/* Package L5: what the class answered, and how many are still confused. */}
        {(() => {
          const snap = isRevealSnapshotCurrent ? revealSnapshot : null;
          const qt = (currentSentence.questionType || 'binary') as QuestionType;
          const accepted = snap?.input.acceptedSet ?? buildAcceptedAnswerSet(currentSentence, qt).acceptedSet;
          const verdicts = snap?.input.clozeWordVerifications ?? {};
          const rows = answerSplit({
            qType: qt,
            bets,
            playerIds: (snap?.input.validPlayers ?? players).map(p => p.id),
            sentenceIsCorrect: currentSentence.isCorrect,
            options: currentSentence.options,
            isRightAnswer: (a) => {
              const k = normalizeGapAnswer(a);
              if (isOptionType(qt)) return k === normalizeGapAnswer(currentSentence.correctAnswer);
              if (qt === 'keyWordTransformation') return verdicts[k]?.marks === 2;
              return accepted.has(k) || Boolean(verdicts[k]?.isCorrect);
            },
          });
          const counts = reactionCounts(handReactions, currentRound);
          if (rows.length === 0 && counts.gotIt + counts.confused === 0) return null;
          const shown = rows.slice(0, 6);
          const top = Math.max(1, ...shown.map(r => r.count));
          return (
            <div className="gc-surface rounded-gc-lg p-6 mt-6 animate-gc-slide-up [animation-delay:1.1s]" data-testid="answer-split">
              <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
                <h3 className="text-gc-title font-bold text-gc-ink">What the class answered</h3>
                {counts.gotIt + counts.confused > 0 && (
                  <p className="text-gc-body font-semibold" data-testid="reaction-counts">
                    <span className="text-gc-win">{counts.gotIt} got it</span>
                    <span className="text-gc-quiet"> · </span>
                    <span className={counts.confused > 0 ? 'text-gc-danger' : 'text-gc-quiet'}>{counts.confused} still confused</span>
                  </p>
                )}
              </div>
              <ul className="space-y-2">
                {shown.map(r => (
                  <li key={r.label} className="flex items-center gap-3">
                    <span className={`w-48 shrink-0 truncate text-gc-lead font-semibold ${r.isRight ? 'text-gc-win' : 'text-gc-ink'}`}>{r.isRight ? '✓ ' : ''}{r.label}</span>
                    <span className="flex-1 h-4 rounded-full bg-gc-line/[0.08] overflow-hidden" aria-hidden="true">
                      <span className={`block h-full rounded-full ${r.isRight ? 'bg-gc-win/70' : 'bg-gc-quiet/50'}`} style={{ width: `${(r.count / top) * 100}%` }} />
                    </span>
                    <span className="w-16 text-right tabular-nums text-gc-lead font-bold">{r.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })()}

        {/* Payouts */}
        <div className="flex flex-wrap items-end justify-between gap-4 mt-10 mb-4 animate-gc-slide-up [animation-delay:1.25s]">
          <div>
            <h2 className="text-gc-display font-extrabold text-gc-ink">Hand {currentRound} payouts</h2>
            <p className="text-gc-body text-gc-quiet mt-1">
              {gameMode === 'rounds'
                ? `Hand ${currentRound} of ${totalRounds}.`
                : gameMode === 'targetAmount'
                  ? `The first player to reach $${numTargetAmount.toLocaleString()} wins.`
                  : 'The last player with money wins.'}
            </p>
          </div>
          <ActionButton onClick={handleSaveGameClick} playSound={playSound} variant="ghost" className="h-10 px-4 text-gc-small font-semibold" title="Save the table so you can carry on later">
            <span className="inline-flex items-center gap-2"><Save className="w-4 h-4 shrink-0" aria-hidden="true" />Save</span>
          </ActionButton>
        </div>

        <div className="gc-panel rounded-gc-lg overflow-hidden animate-gc-slide-up [animation-delay:1.3s]">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
                <thead className="text-gc-small font-bold text-gc-quiet">
                <tr>
                    <th className="py-3 pl-5 sm:pl-6 pr-2 w-16 font-bold">Rank</th>
                    <th className="py-3 px-3 font-bold">Player</th>
                    <th className="py-3 px-3 font-bold">Pick</th>
                    <th className="py-3 px-3 text-right font-bold">Change</th>
                    <th className="py-3 px-3 text-right font-bold">Balance</th>
                    {showMoves && <th className="py-3 pl-3 pr-5 sm:pr-6 text-right w-20 font-bold">Move</th>}
                </tr>
                </thead>
                <tbody className="text-gc-ink">
                {payoutRows.map(({ result, rank, move }, index) => {
                    const player = players.find(p => p.name === result.name);
                    const pickText = result.playerAnswerDisplay && result.playerAnswerDisplay !== result.outcomeText
                      ? result.playerAnswerDisplay
                      : '';
                    return (
                    <tr key={result.name} className="border-t border-gc-line/[0.1] animate-gc-slide-up" style={{ animationDelay: `${1400 + Math.min(index, 12) * 80}ms` }}>
                      <td className="py-3.5 pl-5 sm:pl-6 pr-2">
                        <span className={`w-9 h-9 rounded-full grid place-items-center font-extrabold text-gc-small tabular-nums ${rankBadge(rank)}`}>
                          {rank}
                        </span>
                      </td>
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-3">
                          {player ? (
                            <button
                              type="button"
                              onClick={() => handleOpenAvatarModal(player.id)}
                              className="w-11 h-11 rounded-full border-2 border-gc-turn/70 p-0.5 bg-gc-line/[0.08] grid place-items-center leading-none hover:scale-110 transition-transform cursor-pointer shrink-0"
                              title={`Change ${player.name}'s avatar`}
                            >
                              <PlayerAvatar value={player.avatar} size="md" className="w-full h-full" />
                            </button>
                          ) : (
                            <span className="text-2xl">{'👤'}</span>
                          )}
                          <span className="text-gc-lead font-bold">
                            {result.name}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-3">
                          <div className="flex flex-wrap items-center gap-2 text-gc-body font-semibold">
                            <span>{pickText || result.outcomeText}</span>
                            {pickText && result.bet > 0 && (
                              <span className="text-gc-quiet font-normal tabular-nums">· ${result.bet.toLocaleString()} bet</span>
                            )}
                            {result.marksAwarded !== undefined && (
                              <span className="px-2 py-0.5 rounded-full text-gc-cap font-bold tabular-nums bg-gc-line/[0.08] text-gc-quiet">
                                {result.marksAwarded}/2 marks
                              </span>
                            )}
                          </div>
                          {pickText && (
                            <div className="text-gc-small text-gc-quiet mt-0.5">
                              {result.outcomeText}
                            </div>
                          )}
                          {result.correctionFeedback && (
                            <div className="text-gc-small text-gc-quiet mt-1 italic max-w-sm">
                              {result.correctionFeedback}
                            </div>
                          )}
                      </td>
                      <td className={`py-3.5 px-3 text-right tabular-nums font-extrabold text-gc-lead whitespace-nowrap ${result.amountChanged > 0 ? 'text-gc-win animate-gc-glow' : result.amountChanged < 0 ? 'text-gc-loss' : 'text-gc-quiet'}`}>
                          {result.amountChanged > 0 ? `+$${result.amountChanged.toLocaleString()}` : result.amountChanged < 0 ? `-$${Math.abs(result.amountChanged).toLocaleString()}` : '$0'}
                      </td>
                      <td className="py-3.5 px-3 text-right tabular-nums font-extrabold text-gc-lead text-gc-money whitespace-nowrap">
                          $<CountUp from={result.newTotal - result.amountChanged} to={result.newTotal} delayMs={1500 + Math.min(index, 12) * 80} />
                      </td>
                      {showMoves && (
                        <td className={`py-3.5 pl-3 pr-5 sm:pr-6 text-right text-gc-small font-bold whitespace-nowrap ${move > 0 ? 'text-gc-win' : move < 0 ? 'text-gc-loss' : 'text-gc-quiet'}`}>
                          {move > 0 ? (
                            <span className="inline-flex items-center gap-0.5"><ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />{move}<span className="sr-only"> places up</span></span>
                          ) : move < 0 ? (
                            <span className="inline-flex items-center gap-0.5"><ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />{-move}<span className="sr-only"> places down</span></span>
                          ) : (
                            <span aria-label="No change">–</span>
                          )}
                        </td>
                      )}
                    </tr>
                )})}
                </tbody>
            </table>
          </div>
        </div>

        {!isGameOver && (
          <div className="mt-6 px-4 py-3.5 rounded-gc bg-gc-line/[0.05] border border-gc-line/[0.12] flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-gc-small font-bold text-gc-ink">Next hand</span>
              <span className="text-gc-small text-gc-quiet"> · click a setting to change it before you deal</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleOpenSettingsModal('topic')}
                className={chipButton}
                title="Change the topic for the next hand"
              >
                {nextRoundSettings?.topic || settings.topic}
              </button>

              <button
                type="button"
                onClick={() => handleOpenSettingsModal('level')}
                className={chipButton}
                title="Change the level for the next hand"
              >
                {nextRoundSettings?.level || settings.level}
              </button>

              <button
                type="button"
                onClick={() => handleOpenSettingsModal('theme')}
                className={chipButton}
                title="Change the theme for the next hand"
              >
                {nextRoundSettings?.theme || settings.theme}
              </button>

              <button
                type="button"
                onClick={() => handleOpenSettingsModal('format')}
                className={chipButton}
                title="Change the kind of question for the next hand"
              >
                {nextFormatObj.shortLabel}
              </button>
            </div>
          </div>
        )}

        <div className="mt-8 flex flex-wrap justify-between items-center gap-4 pb-10 relative w-full">
          <div className="flex-1 flex justify-start gap-2 flex-wrap">
            {isUndoRevealOpen && (
              <ActionButton
                data-hotkey="undo-reveal"
                onClick={handleUndoReveal}
                variant="secondary"
                className="h-10 px-4 text-gc-small font-semibold"
                title="Teacher only: go back to the hand as it was before the reveal"
              >
                <span className="inline-flex items-center gap-2"><RotateCcw className="w-4 h-4 shrink-0" aria-hidden="true" />Undo reveal ({undoRevealSecondsLeft(revealSnapshot, undoClock)} s)</span>
              </ActionButton>
            )}
            {isRevealSnapshotCurrent && (
              <ActionButton
                onClick={() => { playSound('click'); setShowRulingModal(true); }}
                variant="ghost"
                className="h-10 px-4 text-gc-small font-semibold"
                title="Teacher only: void this hand or accept another answer"
              >
                Correct the ruling
              </ActionButton>
            )}
            {roundHistory.length > 0 && (
              <ActionButton
                onClick={() => { playSound('click'); setShowReportCardModal(true); }}
                variant="ghost"
                className="h-10 px-4 text-gc-small font-semibold"
                title="See the grammar report card for every hand so far"
              >
                Report card ({roundHistory.length})
              </ActionButton>
            )}
            <ActionButton
              onClick={() => handleOpenCloudModal('reports')}
              variant="ghost"
              className="h-10 px-4 text-gc-small font-semibold"
              title="Save or load the session report and table in the cloud"
            >
              <span className="inline-flex items-center gap-2"><CloudIcon className="w-4 h-4 shrink-0" aria-hidden="true" />Save to cloud</span>
            </ActionButton>
          </div>
          <ActionButton data-hotkey="primary" onClick={handleNextRound} playSound={playSound} variant="primary" className="min-h-[60px] text-gc-lead py-3 px-10">
              <span className="inline-flex items-center gap-2.5">
                {isGameOver ? 'See the final results' : 'Deal the next hand'}
                <ArrowRight className="w-5 h-5 shrink-0" aria-hidden="true" />
              </span>
          </ActionButton>
          <div className="flex-1 flex justify-end">
            {!isGameOver && (
              <ActionButton 
                onClick={() => setConfirmAction({
                  title: 'End the game now?',
                  message: 'The game stops here and the final results are shown. You cannot go back to this hand.',
                  confirmLabel: 'End the game',
                  onConfirm: handleEndGameEarly,
                })}
                variant="ghost"
                className="h-10 px-4 text-gc-small font-semibold text-gc-loss"
                title="End the game now and go to the final results"
              >
                End the game early
              </ActionButton>
            )}
          </div>
        </div>
    </div>
    ); 
}
