// The phone at the end of the game: rank, money and the student's hands (moved out of StudentControllerView, F7).

import { PracticeQuiz } from '../PracticeQuiz';
import React from 'react';
import { PlayerAvatar } from '../PlayerAvatar';
import { Player, SoundEffect } from '../../types';
import { PlayerViewPayload } from '../../utils/multiplayerProtocol';
import { Download } from 'lucide-react';
import { studentReview } from '../../game/report';

export interface PhoneGameOverProps {
  view: PlayerViewPayload;
  isGeneratingPdf: boolean;
  playSound: (sound: SoundEffect, ...args: any[]) => void;
  setIsGeneratingPdf: React.Dispatch<React.SetStateAction<boolean>>;
  setPdfStatusToast: React.Dispatch<React.SetStateAction<string>>;
  money: (n: number) => string;
  setShowPractice: React.Dispatch<React.SetStateAction<boolean>>;
  showPractice: boolean;
  pdfStatusToast: string;
}

export function PhoneGameOver({
  view,
  isGeneratingPdf,
  playSound,
  setIsGeneratingPdf,
  setPdfStatusToast,
  money,
  setShowPractice,
  showPractice,
  pdfStatusToast,
}: PhoneGameOverProps) {

  return (
    <>
      {view.step === 'GAME_OVER' && (() => {
        const sortedPeers = [...view.peers].sort((a, b) => b.money - a.money);
        const myRank = Math.max(1, sortedPeers.findIndex(p => p.id === view.me.id) + 1);
        const history = view.roundHistory || [];
        let myTotalHands = 0;
        let myWins = 0;
        history.forEach(round => {
          const res = round.playerResults.find(
            pr => pr.playerId === view.me.id || pr.playerName === view.me.name
          );
          if (res) {
            myTotalHands++;
            if (res.isWin) myWins++;
          }
        });
        const myAccuracy = myTotalHands > 0 ? Math.round((myWins / myTotalHands) * 100) : 0;
        const isMeChampion = view.winner?.id === view.me.id;
        // Package L7: the student's own slip, up to three missed hands to review.
        const toReview = studentReview(history, view.me.id);

        const handleDownloadPdf = () => {
          if (isGeneratingPdf || history.length === 0) return;
          playSound('click');
          setIsGeneratingPdf(true);
          setPdfStatusToast(null);

          setTimeout(async () => {
            try {
              // The PDF library is large, so a phone downloads it only when asked for a report card.
              const { generateGrammarReportPDF } = await import('../../utils/pdfGenerator');
              const reportPlayers: Player[] = view.peers.map(p => ({
                id: p.id,
                name: p.name,
                avatar: p.avatar,
                money: p.money,
                winStreak: p.winStreak,
                effects: p.effects,
                history: [],
              }));

              const doc = generateGrammarReportPDF({
                history,
                players: reportPlayers,
                winner: view.winner || null,
                settings: {
                  topic: view.settings.topic,
                  level: view.settings.level as any,
                  theme: view.settings.theme,
                },
                gameMode: view.gameMode,
                totalRounds: view.totalRounds,
                targetAmount: view.targetAmount,
                filterName: 'All Rounds',
              });

              const dateStamp = new Date().toISOString().slice(0, 10);
              doc.save(`Grammar_Casino_Report_Card_${dateStamp}.pdf`);
              playSound('success');
              setPdfStatusToast('Your report card is downloaded.');
              setTimeout(() => setPdfStatusToast(null), 4000);
            } catch (err) {
              console.error('Failed to generate PDF on student device:', err);
              setPdfStatusToast('The report card could not be made. Please try again.');
              setTimeout(() => setPdfStatusToast(null), 4000);
            } finally {
              setIsGeneratingPdf(false);
            }
          }, 100);
        };

        const statTile = 'rounded-gc bg-gc-line/[0.06] border border-gc-line/[0.1] px-2 py-3';
        return (
          <div className="space-y-4 animate-gc-slide-up pb-6">
            <div className="text-center pt-3">
              <div className="text-gc-small font-bold text-gc-quiet">Final results</div>
              <h1 className="m-0 mt-1 font-logo font-bold text-[32px] tracking-[0.06em] text-gc-gold">Table closed</h1>
            </div>

            {view.winner ? (
              <div className="gc-surface rounded-[20px] p-6 text-center space-y-3">
                <div className="text-4xl" aria-hidden="true">👑</div>
                <div className="w-20 h-20 mx-auto rounded-full border-[3px] border-gc-gold p-1 bg-gc-line/[0.08] grid place-items-center">
                  <PlayerAvatar value={view.winner.avatar} size="xl" className="w-full h-full" animated mood="happy" />
                </div>
                <div>
                  <div className="text-gc-small font-bold text-gc-money">{isMeChampion ? 'You won the game!' : 'The winner'}</div>
                  <h2 className="m-0 mt-0.5 text-[28px] font-extrabold">{view.winner.name}</h2>
                </div>
                <div className="text-gc-title font-extrabold text-gc-money tabular-nums">{money(view.winner.money)}</div>
              </div>
            ) : (
              <div className="gc-surface rounded-[20px] p-6 text-center space-y-1.5">
                <div className="text-4xl" aria-hidden="true">🏛️</div>
                <h2 className="m-0 text-gc-title font-extrabold">The house wins</h2>
                <p className="m-0 text-gc-small text-gc-quiet">Nobody reached the goal this time.</p>
              </div>
            )}

            <div className="gc-surface rounded-[20px] px-[18px] py-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="m-0 text-gc-small font-bold text-gc-quiet">Your game</h2>
                <span className="text-gc-small font-bold tabular-nums">Rank {myRank} of {sortedPeers.length}</span>
              </div>
              <div className="grid grid-cols-3 gap-2.5 text-center">
                <div className={statTile}>
                  <div className="text-gc-cap font-semibold text-gc-quiet">Balance</div>
                  <div className="text-gc-lead font-extrabold text-gc-money tabular-nums">{money(view.me.money)}</div>
                </div>
                <div className={statTile}>
                  <div className="text-gc-cap font-semibold text-gc-quiet">Hands won</div>
                  <div className="text-gc-lead font-extrabold tabular-nums">{myWins} of {myTotalHands}</div>
                </div>
                <div className={statTile}>
                  <div className="text-gc-cap font-semibold text-gc-quiet">Accuracy</div>
                  <div className="text-gc-lead font-extrabold tabular-nums">{myAccuracy}%</div>
                </div>
              </div>
            </div>

            {toReview.length > 0 && (
              <div className="gc-surface rounded-[20px] px-[18px] py-4 space-y-3" data-testid="my-review">
                <h2 className="m-0 text-gc-small font-bold text-gc-quiet">
                  {toReview.length === 1 ? 'One to review' : `${toReview.length === 2 ? 'Two' : 'Three'} to review`}
                </h2>
                <ol className="m-0 p-0 list-none space-y-3">
                  {toReview.map(item => (
                    <li key={item.round} className="rounded-gc bg-gc-line/[0.05] border border-gc-line/[0.1] px-3 py-2.5">
                      <p className="m-0 font-sentence italic text-gc-body text-gc-ink">{item.text}</p>
                      {item.answer && <p className="m-0 mt-1 text-gc-small font-bold text-gc-win">{item.answer}</p>}
                      {item.explanation && <p className="m-0 mt-1 text-gc-small text-gc-quiet">{item.explanation}</p>}
                    </li>
                  ))}
                </ol>
                {/* Package L6: a short solo quiz on these, no money and no room. */}
                <button
                  type="button"
                  onClick={() => setShowPractice(true)}
                  data-testid="practice-these"
                  className="w-full min-h-[48px] rounded-full border border-gc-gold/60 text-gc-body font-bold text-gc-ink cursor-pointer"
                >
                  Practice these
                </button>
              </div>
            )}
            {showPractice && toReview.length > 0 && (
              <PracticeQuiz items={toReview} onClose={() => setShowPractice(false)} />
            )}

            {history.length > 0 && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={isGeneratingPdf}
                  className="gc-btn-primary w-full h-[58px] rounded-full text-[17px] font-extrabold flex items-center justify-center gap-2.5 cursor-pointer disabled:cursor-wait"
                >
                  <Download className="w-5 h-5" aria-hidden="true" />
                  {isGeneratingPdf ? 'Making your report card…' : 'Download my report card (PDF)'}
                </button>
                {pdfStatusToast && (
                  <div role="status" className="text-center text-gc-small font-semibold text-gc-quiet animate-gc-fade">
                    {pdfStatusToast}
                  </div>
                )}
              </div>
            )}

            <div className="gc-surface rounded-[20px] px-[18px] py-4">
              <h2 className="m-0 mb-1 text-gc-small font-bold text-gc-quiet">Final standings</h2>
              <ol className="m-0 p-0 list-none divide-y divide-gc-line/[0.1]">
                {sortedPeers.map((p, idx) => (
                  <li key={p.id} className={`py-2.5 flex items-center justify-between gap-3 ${p.id === view.me.id ? 'font-extrabold' : 'font-semibold'}`}>
                    <span className="flex items-center gap-2.5 min-w-0">
                      <span className="w-6 text-center text-gc-cap tabular-nums">
                        {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                      </span>
                      <PlayerAvatar value={p.avatar} size="xs" />
                      <span className="truncate">{p.name}{p.id === view.me.id ? ' (you)' : ''}</span>
                    </span>
                    <span className="tabular-nums text-gc-money">{money(p.money)}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        );
      })()}
    </>
  );
}
