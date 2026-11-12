// The final results screen (package F7: moved out of App.tsx without changes): the ceremony,
// the podium, the optional awards, the class line, the buttons and the session report.
import { useGame } from '../state/gameStore';
import { Cloud as CloudIcon, RotateCcw } from 'lucide-react';
import ActionButton from '../components/ActionButton';
import { PlayerAvatar } from '../components/PlayerAvatar';
import GrammarReportCard from '../components/GrammarReportCard';
import { CEREMONY_DONE, drawMoment, placeShown, type CeremonyStage } from '../game/ceremony';
import { buildReport, classResultLine } from '../game/report';
import { computeAwards } from '../game/awards';
import { logEvent } from '../utils/debugLog';
import type { SoundEffect } from '../types';

export interface GameOverScreenProps {
  startingCash: number;
  awardsOn: boolean;
  ceremonyStage: CeremonyStage;
  onSkipCeremony: () => void;
  onPlayAgain: () => void;
  onNewClass: () => void;
  onSaveToCloud: () => void;
  playSound: (sound: SoundEffect, ...args: any[]) => void;
}

export function GameOverScreen({
  startingCash,
  awardsOn,
  ceremonyStage,
  onSkipCeremony,
  onPlayAgain,
  onNewClass,
  onSaveToCloud,
  playSound,
}: GameOverScreenProps) {
  // Package F6: the game in play comes from the store, not through props.
  const players = useGame(s => s.players);
  const winner = useGame(s => s.winner);
  const roundHistory = useGame(s => s.roundHistory);
  const settings = useGame(s => s.settings);
  const gameMode = useGame(s => s.gameMode);
  const totalRounds = useGame(s => s.totalRounds);
  const targetAmount = useGame(s => s.targetAmount);
  const ranked = [...players].sort((a, b) => b.money - a.money);
  if (winner) {
    const wi = ranked.findIndex(p => p.id === winner.id);
    if (wi > 0) ranked.unshift(...ranked.splice(wi, 1));
  }
  const podium = ranked.slice(0, 3);
  const everyoneBust = !winner && players.every(p => p.money <= 0);
  // Podium order on screen: 2nd, 1st, 3rd
  const podiumOrder = [podium[1], podium[0], podium[2]];
  const podiumStyle = [
    { place: 2, block: 'h-24 sm:h-28', avatar: 'w-16 h-16 sm:w-20 sm:h-20 text-[34px] sm:text-[42px]', delay: '0.25s' },
    { place: 1, block: 'h-36 sm:h-44', avatar: 'w-20 h-20 sm:w-28 sm:h-28 text-[44px] sm:text-[60px]', delay: '0s' },
    { place: 3, block: 'h-16 sm:h-20', avatar: 'w-14 h-14 sm:w-16 sm:h-16 text-[30px] sm:text-[34px]', delay: '0.45s' },
  ];
  // Package V9: the ceremony reveals each part in turn; everything stays in the page
  // (only faded), so screen readers and the buttons below never wait for it.
  const stage = ceremonyStage;
  const ceremonyOn = stage < CEREMONY_DONE;
  const winnerShown = stage >= 3;
  const reveal = (shown: boolean) => `transition-[opacity,transform] duration-gc-slow ease-gc-out ${shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`;
  const classLine = classResultLine(buildReport(roundHistory, players));
  const saveMoment = () => {
    playSound('click');
    const places = podiumOrder
      .map((p, idx) => (p ? { place: podiumStyle[idx].place, name: p.name, money: p.money } : null))
      .filter((x): x is { place: number; name: string; money: number } => x !== null);
    const url = drawMoment(places, winner ? `${winner.name} wins!` : 'Table closed', classLine);
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `grammar-casino-${new Date().toISOString().slice(0, 10)}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    logEvent('info', 'Saved the podium picture');
  };
  return (
  <div className="relative w-full max-w-5xl px-4 pt-6 sm:pt-2 pb-12 text-center animate-gc-fade">
    {/* Package V10: no HTML confetti here any more; the 3D coin shower and sparks celebrate
        the winner (nothing on table Off, Calm mode or reduced motion). */}
    <p className="text-gc-small font-semibold text-gc-quiet">Final results</p>
    <h1 className="font-logo text-gc-gold text-[38px] sm:text-[52px] leading-tight font-semibold tracking-[0.04em]">
      {ceremonyOn && !winnerShown ? 'The vault opens…' : 'Table closed'}
    </h1>
    {ceremonyOn && (
      <button
        type="button"
        onClick={() => { playSound('click'); onSkipCeremony(); }}
        data-testid="ceremony-skip"
        className="absolute right-4 top-4 h-11 px-4 rounded-full border border-gc-line/20 bg-gc-card/80 text-gc-small font-semibold text-gc-quiet hover:text-gc-ink cursor-pointer"
      >
        Skip
      </button>
    )}
    <p className={`mt-2 text-gc-lead text-gc-quiet text-balance ${reveal(winnerShown)}`}>
      {winner ? (
        <>
          <b className="text-gc-ink">{winner.name}</b> wins with <b className="text-gc-money tabular-nums">${winner.money.toLocaleString()}</b>
          {gameMode === 'targetAmount' && <> and passed the ${Number(targetAmount).toLocaleString()} target</>}
          .
        </>
      ) : everyoneBust ? (
        'Every player ran out of money. The house wins.'
      ) : (
        "It's a tie at the top, so there is no single winner."
      )}
    </p>

    {podium.length > 0 && !everyoneBust && (
      <ol className="mt-10 flex items-end justify-center gap-2.5 sm:gap-5" aria-label="Top three players">
        {podiumOrder.map((p, idx) => {
          if (!p) return <li key={`empty-${idx}`} className="w-24 sm:w-40" aria-hidden="true" />;
          const st = podiumStyle[idx];
          const isFirst = st.place === 1;
          return (
            <li
              key={p.id}
              className={`w-24 sm:w-40 flex flex-col items-center ${reveal(placeShown(st.place, stage))}`}
              data-shown={placeShown(st.place, stage) ? 'true' : 'false'}
            >
              <span className="sr-only">Place {st.place}: </span>
              {isFirst && winner && <span className="text-[30px] sm:text-[38px] leading-none mb-1" aria-hidden="true">👑</span>}
              <span className={`${st.avatar} rounded-full bg-gc-card p-1 grid place-items-center leading-none ring-4 ${isFirst ? 'ring-gc-gold' : 'ring-gc-line/20'} shadow-gc-1`} aria-hidden="true">
                <PlayerAvatar value={p.avatar} size={isFirst ? '2xl' : 'xl'} className="w-full h-full" animated={isFirst} />
              </span>
              <span className={`mt-2 max-w-full truncate font-bold text-gc-ink ${isFirst ? 'text-gc-title' : 'text-gc-body sm:text-gc-lead'}`}>{p.name}</span>
              <span className="text-gc-small sm:text-gc-body font-bold text-gc-money tabular-nums">${p.money.toLocaleString()}</span>
              <span
                className={`mt-2 w-full ${st.block} rounded-t-gc grid place-items-start justify-center pt-3 border border-b-0 ${
                  isFirst ? 'bg-gc-gold/25 border-gc-gold/50' : 'bg-gc-line/[0.07] border-gc-line/[0.14]'
                }`}
              >
                <span className={`font-extrabold tabular-nums ${isFirst ? 'text-gc-money text-[36px] sm:text-[44px]' : 'text-gc-quiet text-[28px] sm:text-[32px]'} leading-none`}>
                  {st.place}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    )}
    {podium.length > 0 && !everyoneBust && <div className="h-px bg-gc-line/[0.14] max-w-xl mx-auto" aria-hidden="true" />}

    {awardsOn && (() => {
      const awards = computeAwards(roundHistory, startingCash);
      if (awards.length === 0) return null;
      return (
        <ul className={`mt-6 mx-auto max-w-3xl p-0 list-none grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 ${reveal(stage >= CEREMONY_DONE)}`} data-testid="awards" aria-label="Awards">
          {awards.map(a => (
            <li key={a.id} className="gc-surface rounded-gc-lg px-3 py-4 text-center">
              <div className="text-[34px] leading-none" aria-hidden="true">{a.icon}</div>
              <div className="mt-2 text-gc-small font-bold text-gc-quiet">{a.title}</div>
              <div className="text-gc-lead font-extrabold text-gc-ink break-words">{a.name}</div>
              <div className="text-gc-cap text-gc-quiet">{a.detail}</div>
            </li>
          ))}
        </ul>
      );
    })()}

    {classLine && (
      <p className={`mt-6 mx-auto max-w-2xl text-gc-lead font-semibold text-gc-ink text-balance ${reveal(stage >= CEREMONY_DONE)}`} data-testid="class-result">
        {classLine}
      </p>
    )}

    {everyoneBust && (
      <div className="mt-8 mx-auto max-w-md gc-surface rounded-gc-lg p-8">
        <div className="text-[56px] leading-none mb-3" aria-hidden="true">🏛️</div>
        <h2 className="text-gc-title font-bold text-gc-ink">The house wins</h2>
        <p className="mt-1 text-gc-body text-gc-quiet">Nobody has any money left.</p>
      </div>
    )}

    <div className="mt-8 flex flex-wrap justify-center items-center gap-3">
      <ActionButton onClick={onPlayAgain} variant="primary" className="min-h-[60px] px-10 text-gc-lead" title="Same players and settings; the room stays open">
        <span className="inline-flex items-center gap-2.5"><RotateCcw className="w-5 h-5 shrink-0" aria-hidden="true" />Play again</span>
      </ActionButton>
      <ActionButton onClick={onNewClass} playSound={playSound} variant="ghost" className="h-12 px-5 text-gc-body font-semibold">
        New class
      </ActionButton>
      <ActionButton onClick={onSaveToCloud} playSound={playSound} variant="ghost" className="h-12 px-5 text-gc-body font-semibold">
        <span className="inline-flex items-center gap-2"><CloudIcon className="w-4 h-4 shrink-0" aria-hidden="true" />Save to the cloud</span>
      </ActionButton>
      {podium.length > 0 && !everyoneBust && (
        <ActionButton onClick={saveMoment} variant="ghost" className="h-12 px-5 text-gc-body font-semibold" title="Download a picture of the podium (nicknames only) for the class group">
          Save this moment
        </ActionButton>
      )}
    </div>

    {/* The session report */}
    <div className="w-full mt-10 text-left">
      <GrammarReportCard
        history={roundHistory}
        players={players}
        winner={winner}
        playSound={playSound}
        onRestartGame={onNewClass}
        settings={settings}
        gameMode={gameMode}
        totalRounds={totalRounds}
        targetAmount={targetAmount}
      />
    </div>
  </div>
  );
}
