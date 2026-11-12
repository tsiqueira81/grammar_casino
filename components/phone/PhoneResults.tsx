// The phone after the reveal: the student's result for the hand and the explanation (moved out of StudentControllerView, F7).

import React from 'react';
import { PlayerAvatar } from '../PlayerAvatar';
import { QuestionType } from '../../types';
import { PlayerViewPayload } from '../../utils/multiplayerProtocol';
import { diffWords } from '../../utils/errorHighlight';
import CountUp from '../CountUp';
import { t } from '../../strings/en';

export interface PhoneResultsProps {
  view: PlayerViewPayload;
  isClozeRound: boolean;
  myReaction: { round: number; value: "gotIt" | "confused"; };
  money: (n: number) => string;
  revealBuilding: boolean;
  qType: QuestionType;
  sendReaction: (round: number, value: "gotIt" | "confused") => void;
}

export function PhoneResults({
  view,
  isClozeRound,
  myReaction,
  money,
  revealBuilding,
  qType,
  sendReaction,
}: PhoneResultsProps) {

  return (
    <>
      {view.step === 'RESULTS' && (() => {
        const change = view.myRoundResult?.amountChanged ?? 0;
        const won = change > 0;
        const lost = change < 0;
        const s = view.sentence;
        const correctionSegments =
          s && !isClozeRound && !s.isCorrect && s.correction ? diffWords(s.text, s.correction).corrected : null;
        // Package L5: the student's own answer beside the right one, and other accepted answers.
        const myAnswer = view.myRoundResult?.playerAnswerDisplay?.trim();
        const gapKey = (a: string) => a.replace(/[’‘`]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
        const alsoAccepted = isClozeRound && s
          ? [...new Map((s.acceptedAnswers || []).filter(a => a && gapKey(a) !== gapKey(s.correctAnswer || '')).map(a => [gapKey(a), a.trim()])).values()]
          : [];
        const reacted = myReaction && myReaction.round === view.round ? myReaction.value : null;
        // Package S4: place before and after this hand, and the gap to the next place.
        const standings = [...view.peers].sort((a, b) => b.money - a.money);
        const changeByName = new Map(view.allRoundResults.map(r => [r.name, r.amountChanged]));
        // Places count ties as shared ("joint 2nd" is just 2nd): one more than the players ahead.
        const myMoneyBefore = view.me.money - change;
        const placeNow = 1 + view.peers.filter(p => p.money > view.me.money).length;
        const placeBefore = 1 + view.peers.filter(p => p.id !== view.me.id && p.money - (changeByName.get(p.name) ?? 0) > myMoneyBefore).length;
        const ahead = [...standings].reverse().find(p => p.money > view.me.money) ?? null;
        const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
        const moved = view.round > 1 ? placeBefore - placeNow : 0;
        const placeText = standings.length > 1
          ? `${moved > 0 ? `Up ${moved} place${moved === 1 ? '' : 's'}, now` : moved < 0 ? `Down ${-moved} place${moved === -1 ? '' : 's'}, now` : 'You are'} ${ordinal(placeNow)} of ${standings.length}.`
            + (ahead ? ` ${t('results.toPass', { amount: money(ahead.money - view.me.money + 1), name: ahead.name })}` : ` ${t('results.lead')}`)
          : null;
        if (revealBuilding) {
          return (
            <div className="pt-16 flex flex-col items-center text-center animate-gc-fade" role="status" aria-live="polite" data-testid="reveal-build">
              <div className="w-[120px] h-[120px] rounded-full grid place-items-center bg-gc-gold/15 text-gc-money animate-gc-ring text-[44px]" aria-hidden="true">🂠</div>
              <h1 className="mt-6 mb-1.5 text-[30px] leading-tight font-extrabold">{t('results.build')}</h1>
            </div>
          );
        }
        return (
          <div className="space-y-4 animate-gc-fade">
            {/* Gold coins rain down on a win (reduced motion and calm mode skip it via index.css). */}
            {won && (
              <div className="gc-confetti pointer-events-none fixed inset-0 z-40 overflow-hidden [perspective:600px]" aria-hidden="true">
                {Array.from({ length: 18 }, (_, i) => (
                  <span
                    key={i}
                    className="absolute -top-8 block rounded-full animate-gc-coin-fall"
                    style={{
                      left: `${(i * 41 + 7) % 96}%`,
                      width: i % 3 === 0 ? 30 : 24,
                      height: i % 3 === 0 ? 30 : 24,
                      background: 'radial-gradient(circle at 35% 30%, #fff6d5 0%, #f5c542 38%, #c8901e 72%, #8a5a10 100%)',
                      boxShadow: 'inset 0 0 0 3px rgb(255 236 170 / 0.55), 0 2px 6px rgb(0 0 0 / 0.25)',
                      animationDelay: `${(i % 6) * 0.12 + (i % 4) * 0.05}s`,
                      animationDuration: `${1.8 + ((i * 7) % 8) / 10}s`,
                      ['--gc-drift' as string]: `${((i * 37) % 80) - 40}px`,
                    } as React.CSSProperties}
                  />
                ))}
              </div>
            )}
            {view.myRoundResult && (
              <div
                className={`-mx-4 -mt-4 px-4 pt-8 pb-2 text-center ${
                  won
                    ? 'bg-gradient-to-b from-emerald-400/25 to-transparent'
                    : lost
                      ? 'bg-gradient-to-b from-rose-400/25 to-transparent'
                      : ''
                }`}
              >
                <p className={`m-0 text-lg font-bold ${won ? 'text-gc-money animate-gc-glow' : 'text-gc-quiet'}`}>
                  {won ? 'You called it!' : lost ? 'Not this time' : 'No change this hand'}
                </p>
                <p
                  role="status"
                  className={`m-0 mt-1 text-[64px] leading-none font-extrabold tabular-nums ${
                    won ? 'text-gc-win animate-gc-pop' : lost ? 'text-gc-loss animate-gc-shake' : 'text-gc-ink animate-gc-pop'
                  }`}
                >
                  {won ? '+' : ''}
                  {money(change)}
                </p>
                <p className="m-0 mt-3 text-[17px] text-gc-quiet">
                  Balance <b className="text-gc-money tabular-nums"><CountUp from={view.me.money - change} to={view.me.money} delayMs={300} format={money} /></b>
                </p>
                {placeText && <p className="m-0 mt-1 text-[15px] font-semibold text-gc-ink" data-testid="my-place">{placeText}</p>}
                <div className="mt-2 flex flex-wrap justify-center gap-1.5 text-gc-cap font-semibold">
                  {view.myRoundResult.outcomeText && !/^(win|lose)$/i.test(view.myRoundResult.outcomeText.trim()) && (
                    <span className="px-2.5 py-1 rounded-full bg-gc-line/[0.07] text-gc-quiet">{view.myRoundResult.outcomeText}</span>
                  )}
                  {qType === 'keyWordTransformation' && view.myRoundResult.marksAwarded !== undefined && (
                    <span className="px-2.5 py-1 rounded-full bg-gc-gold/15 text-gc-money">
                      {view.myRoundResult.marksAwarded} of 2 marks
                    </span>
                  )}
                </div>
                {view.myRoundResult.correctionFeedback && (
                  <p className="m-0 mt-2 text-gc-small text-gc-quiet">{view.myRoundResult.correctionFeedback}</p>
                )}
              </div>
            )}

            {/* The ruling */}
            {s && (
              <div className="gc-surface rounded-[20px] px-[18px] py-4 animate-gc-slide-up [animation-delay:0.4s] space-y-2">
                <h2 className="m-0 text-gc-small font-bold text-gc-quiet">
                  {isClozeRound ? 'The answer' : s.isCorrect ? 'It was valid, exactly as written:' : 'It was flawed. The correction:'}
                </h2>
                {isClozeRound ? (
                  <p className="m-0 font-sentence italic text-xl leading-snug">
                    <mark className="bg-gc-win/20 text-gc-win rounded-md px-1.5">{s.correctAnswer}</mark>
                  </p>
                ) : (
                  <p className="m-0 font-sentence italic text-xl leading-[1.35]">
                    &ldquo;
                    {correctionSegments
                      ? correctionSegments.map((seg, i) =>
                          seg.mark ? (
                            <mark key={i} className="bg-gc-win/20 text-gc-win rounded-md px-1">{seg.text}</mark>
                          ) : (
                            <React.Fragment key={i}>{seg.text}</React.Fragment>
                          )
                        )
                      : s.isCorrect
                        ? s.text
                        : s.correction || s.text}
                    &rdquo;
                  </p>
                )}
                {alsoAccepted.length > 0 && (
                  <p className="m-0 text-gc-small text-gc-quiet">{t('results.alsoRight', { answers: alsoAccepted.join(', ') })}</p>
                )}
                {!isClozeRound && !s.isCorrect && s.errorPhrase && (
                  <p className="m-0 text-gc-small text-gc-quiet">
                    {t('results.mistake')}<b className="text-gc-ink">{s.errorPhrase}</b>
                    {s.mistakeType ? ` (${s.mistakeType})` : ''}
                  </p>
                )}
                {myAnswer && (
                  <p className="m-0 text-[15px] text-gc-ink" data-testid="my-answer">
                    <span className="font-bold">{t('results.yourAnswer')}</span>
                    {myAnswer}
                  </p>
                )}
                {s.explanation && (
                  <p className="m-0 pt-2 border-t border-gc-line/[0.1] text-[15px] leading-relaxed text-gc-ink">
                    <span className="font-bold">{t('results.why')}</span>
                    {s.explanation}
                  </p>
                )}
                <div className="pt-2 flex gap-2" role="group" aria-label={t('results.didThisMakeSense')}>
                  {([['gotIt', t('results.gotIt')], ['confused', t('results.stillConfused')]] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={reacted === value}
                      onClick={() => sendReaction(view.round, value)}
                      className={`flex-1 min-h-[48px] rounded-full text-[16px] font-bold border transition-colors ${
                        reacted === value
                          ? value === 'gotIt' ? 'bg-gc-win/20 border-gc-win text-gc-win' : 'bg-gc-danger/15 border-gc-danger text-gc-danger'
                          : 'border-gc-line/[0.2] text-gc-ink'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Standings */}
            <div className="gc-surface rounded-[20px] px-[18px] py-4 animate-gc-slide-up [animation-delay:0.6s]">
              <h2 className="m-0 mb-1 text-gc-small font-bold text-gc-quiet">Standings</h2>
              <ol className="m-0 p-0 list-none divide-y divide-gc-line/[0.1]">
                {standings
                  .map((p, idx) => (
                    <li
                      key={p.id}
                      ref={p.id === view.me.id && standings.length > 8 ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
                      aria-current={p.id === view.me.id ? 'true' : undefined}
                      className={`py-2.5 flex items-center justify-between gap-3 ${p.id === view.me.id ? 'font-extrabold bg-gc-gold/10 -mx-2 px-2 rounded-lg' : 'font-semibold'}`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <span className="w-6 text-gc-cap text-gc-quiet tabular-nums">{idx + 1}</span>
                        <PlayerAvatar value={p.avatar} size="xs" />
                        <span className="truncate">{p.name}{p.id === view.me.id ? ' (you)' : ''}</span>
                      </span>
                      <span className="tabular-nums text-gc-money">{money(p.money)}</span>
                    </li>
                  ))}
              </ol>
            </div>

            <p className="text-center text-gc-small text-gc-quiet pt-1 text-balance">{t('results.nextHand')}</p>
          </div>
        );
      })()}
    </>
  );
}
