// The players at the table during a hand: betting cards, compact grid or hidden-bets tiles (moved out of HandScreen, F7).
import { useGame } from '../../state/gameStore';
import { isFrozenBySubZero } from '../../game/status';
import React from 'react';
import { Player, PowerUpKey, ActivePowerUp, SoundEffect, QuestionType } from '../../types';
import { POWER_UPS } from '../../constants';
import { Check, ChevronLeft, ChevronRight, LockOpen, WifiOff } from 'lucide-react';
import PlayerTileGrid, { PlayerTile } from '../../components/PlayerTileGrid';
import { PlayerAvatar } from '../../components/PlayerAvatar';
import CountUp from '../../components/CountUp';
import { isBetCompleteForQuestionType } from '../../utils/multiplayerProtocol';
import { type SpecialHand } from '../../game/specialHands';

export interface HandTableProps {
  currentQuestionType: QuestionType;
  handleMpUnlockPlayer: (playerId: number) => void;
  effectiveTableLayout: "grid" | "cards";
  potNow: number;
  lastPotShown: React.RefObject<number>;
  betsReadyCount: number;
  unfrozenActivePlayers: Player[];
  betsReadyWord: "locked in" | "bets placed";
  playSound: (sound: SoundEffect, ...args: any[]) => void;
  setTableLayoutPref: React.Dispatch<React.SetStateAction<"grid" | "cards">>;
  openSeatPlayer: Player;
  openSeatRef: React.RefObject<HTMLDivElement>;
  playerTiles: PlayerTile[];
  setOpenSeatPlayerId: React.Dispatch<React.SetStateAction<number>>;
  setIsSentenceHeaderStuck: React.Dispatch<React.SetStateAction<boolean>>;
  nextSeatPlayer: Player;
  renderPlayerSeat: (player: Player) => React.JSX.Element;
  isProjectorMode: boolean;
  currentSpecialHand: SpecialHand;
}

export function HandTable({
  currentQuestionType,
  handleMpUnlockPlayer,
  effectiveTableLayout,
  potNow,
  lastPotShown,
  betsReadyCount,
  unfrozenActivePlayers,
  betsReadyWord,
  playSound,
  setTableLayoutPref,
  openSeatPlayer,
  openSeatRef,
  playerTiles,
  setOpenSeatPlayerId,
  setIsSentenceHeaderStuck,
  nextSeatPlayer,
  renderPlayerSeat,
  isProjectorMode,
  currentSpecialHand,
}: HandTableProps) {
  const mpRoomCode = useGame(s => s.mpRoomCode);
  const mpHideProjectorBets = useGame(s => s.mpHideProjectorBets);
  const players = useGame(s => s.players);
  const activePowerUps = useGame(s => s.activePowerUps);
  const mpSeats = useGame(s => s.mpSeats);
  const bets = useGame(s => s.bets);
  const currentSentence = useGame(s => s.currentSentence);
  const mpAwayIds = useGame(s => s.mpAwayIds);
  const gameMode = useGame(s => s.gameMode);
  return (
    <>
      {mpRoomCode && mpHideProjectorBets ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {players.map((player, idx) => {
            const allActive = Object.values(activePowerUps).flat() as ActivePowerUp[];
            const playerActive = (activePowerUps[player.id] || []) as ActivePowerUp[];
            const isFrozen = isFrozenBySubZero(player, allActive);
            const mpSeat = mpSeats[player.id];
            const hasSplit = playerActive.some(pu => pu.type === 'SPLIT_BET');
            const isBetReady = mpSeat
              ? mpSeat.lockedIn
              : isBetCompleteForQuestionType(bets[player.id], currentQuestionType, hasSplit, currentSentence?.baseWord);
            const isBankrupt = player.money <= 0;
            const isAway = Boolean(mpSeat && mpAwayIds.includes(player.id));

            return (
              <div
                key={player.id}
                data-away={isAway ? 'true' : undefined}
                className={`gc-surface rounded-gc shadow-gc-1 p-4 transition-all flex flex-col justify-between gap-3 animate-gc-slide-up ${
                  isBankrupt || isAway ? 'opacity-60 grayscale' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-full border-2 border-gc-turn/70 p-0.5 bg-gc-line/[0.08] flex items-center justify-center relative shrink-0">
                      <PlayerAvatar value={player.avatar} size="md" className="w-full h-full" />
                      {mpSeat && (
                        <span
                          className={`w-3.5 h-3.5 rounded-full border-2 border-gc-card absolute -bottom-0.5 -right-0.5 z-20 ${
                            mpSeat.connected ? 'bg-gc-win' : 'bg-gc-gold'
                          }`}
                          title={mpSeat.connected ? 'Connected on a phone' : 'Disconnected'}
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-gc-lead font-bold text-gc-ink truncate">
                        {player.name}
                      </div>
                      <div className="text-gc-cap text-gc-quiet tabular-nums inline-flex items-center gap-1">
                        Seat {idx + 1} · {isAway ? <><WifiOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />away</> : mpSeat ? 'on a phone' : 'at the table'}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-gc-cap text-gc-quiet">
                      Balance
                    </div>
                    <div className="tabular-nums font-extrabold text-gc-lead text-gc-money">
                      ${player.money.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Active power-ups / effects row */}
                {(playerActive.length > 0 || player.effects.length > 0) && (
                  <div className="flex flex-wrap gap-1.5">
                    {playerActive.map((pu, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded-full text-gc-cap font-semibold bg-gc-line/[0.07] border border-gc-line/[0.12] text-gc-ink"
                      >
                        {POWER_UPS[pu.type]?.icon} {POWER_UPS[pu.type]?.name}
                      </span>
                    ))}
                    {player.effects.map((ef, i) => (
                      <span
                        key={`ef-${i}`}
                        className="px-2 py-0.5 rounded-full text-[10px] font-sans font-bold bg-purple-500/15 border border-purple-400/40 text-purple-900 dark:text-purple-200"
                      >
                        {POWER_UPS[ef.type as PowerUpKey]?.icon || '✨'} {ef.type}
                      </span>
                    ))}
                  </div>
                )}

                {/* Status Pill */}
                <div className="flex items-center gap-2">
                  <div
                    className={`flex-1 h-9 px-3 rounded-full text-gc-small font-bold text-center flex items-center justify-center gap-2 ${
                      isBankrupt
                        ? 'bg-gc-loss/15 text-gc-loss'
                        : isFrozen
                          ? 'bg-gc-info/15 text-gc-info'
                          : isBetReady
                            ? 'bg-gc-win/15 text-gc-win animate-gc-pop'
                            : 'bg-gc-line/[0.07] text-gc-quiet'
                    }`}
                  >
                    {isBankrupt ? (
                      <span>{gameMode === 'lastPlayer' ? 'Bankrupt' : 'Out until the next hand'}</span>
                    ) : isFrozen ? (
                      <span>Frozen this hand</span>
                    ) : isBetReady ? (
                      <>
                        <Check className="w-4 h-4 shrink-0" strokeWidth={3} aria-hidden="true" />
                        <span>Locked in (bet hidden)</span>
                      </>
                    ) : (
                      <>
                        <span className="inline-flex gap-[3px]" aria-hidden="true">
                          <i className="w-[5px] h-[5px] rounded-full bg-current animate-gc-blink" />
                          <i className="w-[5px] h-[5px] rounded-full bg-current animate-gc-blink [animation-delay:0.2s]" />
                          <i className="w-[5px] h-[5px] rounded-full bg-current animate-gc-blink [animation-delay:0.4s]" />
                        </span>
                        <span>Deciding on their phone</span>
                      </>
                    )}
                  </div>
                  {mpSeat?.lockedIn && !isBankrupt && !isFrozen && (
                    <button
                      type="button"
                      onClick={() => handleMpUnlockPlayer(player.id)}
                      title="Teacher only: unlock this player's bet so they can change it"
                      className="h-9 px-3.5 rounded-full text-gc-small font-semibold border border-gc-line/[0.16] bg-gc-line/[0.06] hover:border-gc-line/30 text-gc-ink transition-colors cursor-pointer shrink-0 flex items-center gap-1.5"
                    >
                      <LockOpen className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>Unlock</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          {!mpRoomCode && (
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-1">
              <div className="min-w-0">
                <h2 className="text-gc-lead font-bold text-gc-ink">Bets</h2>
                <p className="text-gc-small text-gc-quiet">
                  {effectiveTableLayout === 'grid'
                    ? 'Tap a player to open their betting card. Picks stay hidden until the reveal.'
                    : 'All betting cards are open, so everyone can see each pick.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <div className="flex items-center gap-3 text-gc-small text-gc-quiet">
                  {potNow > 0 && (
                    <span className="gc-pot-plaque text-gc-small" data-testid="pot-plaque">
                      <span className="gc-pot-plaque-label">Pot</span>
                      <span className="gc-pot-plaque-amount">$<CountUp from={lastPotShown.current} to={potNow} durationMs={500} /></span>
                    </span>
                  )}
                  <span className="tabular-nums whitespace-nowrap">{betsReadyCount} of {unfrozenActivePlayers.length} {betsReadyWord}</span>
                  <span
                    className="block h-2 w-40 sm:w-56 rounded-full bg-gc-line/[0.08] border border-gc-line/[0.12] overflow-hidden"
                    role="progressbar"
                    aria-label="Bets in"
                    aria-valuemin={0}
                    aria-valuemax={unfrozenActivePlayers.length}
                    aria-valuenow={betsReadyCount}
                  >
                    <span
                      className="block h-full rounded-full bg-emerald-700 dark:bg-emerald-400 transition-[width] duration-gc-slow ease-gc-out"
                      style={{ width: `${unfrozenActivePlayers.length ? Math.round((betsReadyCount / unfrozenActivePlayers.length) * 100) : 0}%` }}
                    />
                  </span>
                </div>
                <div className="inline-flex p-1 rounded-full bg-gc-line/[0.07] border border-gc-line/[0.12]" role="group" aria-label="Table layout">
                  {(['grid', 'cards'] as const).map(layout => (
                    <button
                      key={layout}
                      type="button"
                      onClick={() => { playSound('click'); setTableLayoutPref(layout); }}
                      aria-pressed={effectiveTableLayout === layout}
                      className={`h-8 px-3.5 rounded-full text-gc-small font-semibold transition-colors cursor-pointer ${
                        effectiveTableLayout === layout
                          ? 'bg-gc-card text-gc-ink shadow-gc-1'
                          : 'text-gc-quiet hover:text-gc-ink'
                      }`}
                    >
                      {layout === 'grid' ? 'Grid' : 'Full cards'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {!mpRoomCode && effectiveTableLayout === 'grid' ? (
            openSeatPlayer ? (
              <div ref={openSeatRef} key={openSeatPlayer.id} className="space-y-3 pt-1 animate-gc-slide-up">
                <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <h2 className="text-gc-lead font-bold text-gc-ink mr-1">
                      {openSeatPlayer.name}'s betting card
                    </h2>
                    <div className="hidden sm:flex items-center gap-1.5 flex-wrap" role="group" aria-label="Switch player">
                      {playerTiles.map(({ player: p, status }) => {
                        const isCurrent = p.id === openSeatPlayer.id;
                        const isOut = status === 'out';
                        return (
                          <button
                            key={p.id}
                            type="button"
                            disabled={isOut}
                            onClick={() => {
                              playSound('click');
                              setOpenSeatPlayerId(p.id);
                            }}
                            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-gc-cap font-semibold border transition-colors ${
                              isCurrent
                                ? 'bg-gc-gold/20 border-gc-turn text-gc-ink font-bold'
                                : isOut
                                  ? 'opacity-40 border-gc-line/[0.1] text-gc-quiet cursor-not-allowed'
                                  : 'bg-gc-line/[0.06] border-gc-line/[0.14] text-gc-quiet hover:text-gc-ink hover:border-gc-line/30 cursor-pointer'
                            }`}
                          >
                            <PlayerAvatar value={p.avatar} size="xs" />
                            <span className="max-w-[6rem] truncate">{p.name}</span>
                            {status === 'placed' && <Check className="w-3.5 h-3.5 text-gc-win shrink-0" strokeWidth={3} aria-hidden="true" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        playSound('click');
                        setOpenSeatPlayerId(null);
                        setIsSentenceHeaderStuck(false);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full text-gc-small font-semibold border border-gc-line/[0.16] text-gc-ink hover:bg-gc-line/[0.06] transition-colors cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4 shrink-0" aria-hidden="true" />
                      All players
                    </button>
                    {nextSeatPlayer && (
                      <button
                        type="button"
                        onClick={() => { playSound('click'); setOpenSeatPlayerId(nextSeatPlayer.id); }}
                        className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full text-gc-small font-semibold border border-gc-line/[0.16] text-gc-ink hover:bg-gc-line/[0.06] transition-colors cursor-pointer"
                      >
                        Next: {nextSeatPlayer.name}
                        <ChevronRight className="w-4 h-4 shrink-0" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
                {renderPlayerSeat(openSeatPlayer)}
              </div>
            ) : (
              <PlayerTileGrid
                tiles={playerTiles}
                openPlayerId={null}
                onOpen={(id) => {
                  playSound('click');
                  setIsSentenceHeaderStuck(true);
                  setOpenSeatPlayerId(id);
                }}
                outLabel="Bankrupt"
                projectorMode={isProjectorMode}
                hideMoney={currentSpecialHand === 'finalTable'}
              />
            )
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:gap-6">
              {players.map(renderPlayerSeat)}
            </div>
          )}
        </div>
      )}
    </>
  );
}
