import React from 'react';
import { Check, Clock, Snowflake, X } from 'lucide-react';
import { Player } from '../types';
import { PlayerAvatar } from './PlayerAvatar';

// Compact projector view for single-screen play: one small tile per player.
// Picks are never shown on a tile, so players can't copy each other from the board;
// the full betting card opens below the grid for the selected player only.

export type SeatStatus = 'waiting' | 'turn' | 'placed' | 'locked' | 'frozen' | 'satOut' | 'out';

export interface PlayerTile {
  player: Player;
  status: SeatStatus;
  badges: { icon: string; label: string }[];
}

interface PlayerTileGridProps {
  tiles: PlayerTile[];
  openPlayerId: number | null;
  onOpen: (playerId: number) => void;
  outLabel: string;
  projectorMode?: boolean;
  /** Package V2 step 3: in Table view, up to 8 players sit in one curved row, like seats at the rail. */
  arc?: boolean;
  /** Package G6 Final Table: the balances stay hidden until the reveal. */
  hideMoney?: boolean;
}

export const ARC_MAX_PLAYERS = 8;

/** How far down a seat in the curved row sits, in pixels: the ends high, the middle lowest. */
export function arcOffset(index: number, count: number, depth = 56): number {
  if (count < 3) return 0;
  const t = (index / (count - 1)) * 2 - 1; // -1 .. 1
  return Math.round(depth * (1 - t * t));
}

const STATUS_TEXT: Record<SeatStatus, string> = {
  waiting: 'Deciding',
  turn: 'Their turn',
  placed: 'Bet placed',
  locked: 'Locked in',
  frozen: 'Frozen',
  satOut: 'Sat out',
  out: 'Out',
};

// One colour per meaning: gold = their turn, blue = bet placed, green = locked in, red = out.
const STATUS_CLASS: Record<SeatStatus, string> = {
  waiting: 'bg-gc-line/[0.1] text-gc-quiet border border-gc-line/[0.15]',
  turn: 'bg-gc-gold text-gc-on-gold border border-transparent',
  placed: 'bg-gc-info/20 text-gc-info border border-gc-info/35',
  locked: 'bg-gc-win/20 text-gc-win border border-gc-win/35 animate-gc-pop',
  frozen: 'bg-gc-info/20 text-gc-info border border-gc-info/35',
  satOut: 'bg-gc-line/[0.1] text-gc-quiet border border-gc-line/[0.15]',
  out: 'bg-gc-loss/20 text-gc-loss border border-gc-loss/35',
};

const StatusIcon: React.FC<{ status: SeatStatus; projectorMode?: boolean }> = ({ status, projectorMode }) => {
  const cls = projectorMode ? 'w-4 h-4 shrink-0' : 'w-3.5 h-3.5 shrink-0';
  switch (status) {
    case 'waiting':
      return (
        <span className="inline-flex gap-[3px]" aria-hidden="true">
          <i className={`${projectorMode ? 'w-[6px] h-[6px]' : 'w-[5px] h-[5px]'} rounded-full bg-current animate-gc-blink`} />
          <i className={`${projectorMode ? 'w-[6px] h-[6px]' : 'w-[5px] h-[5px]'} rounded-full bg-current animate-gc-blink [animation-delay:0.2s]`} />
          <i className={`${projectorMode ? 'w-[6px] h-[6px]' : 'w-[5px] h-[5px]'} rounded-full bg-current animate-gc-blink [animation-delay:0.4s]`} />
        </span>
      );
    case 'locked':
      return <Check className={cls} strokeWidth={3} aria-hidden="true" />;
    case 'frozen':
      return <Snowflake className={cls} aria-hidden="true" />;
    case 'satOut':
      return <Clock className={cls} aria-hidden="true" />;
    case 'out':
      return <X className={cls} strokeWidth={3} aria-hidden="true" />;
    default:
      return null;
  }
};

const PlayerTileGrid: React.FC<PlayerTileGridProps> = ({ tiles, openPlayerId, onOpen, outLabel, projectorMode = false, arc = false, hideMoney = false }) => {
  const curved = arc && tiles.length >= 2 && tiles.length <= ARC_MAX_PLAYERS;
  return (
    <div
      className={
        curved
          ? `grid ${projectorMode ? 'gap-4' : 'gap-3.5'} items-start`
          : `grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 ${projectorMode ? 'lg:grid-cols-5 xl:grid-cols-6 gap-4' : 'lg:grid-cols-6 gap-3.5'}`
      }
      style={curved ? { gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))`, paddingBottom: arcOffset(Math.floor(tiles.length / 2), tiles.length) } : undefined}
      data-layout={curved ? 'arc' : 'grid'}
      role="list"
      aria-label="Players at the table"
    >
      {tiles.map(({ player, status, badges }, i) => {
        const isOpen = openPlayerId === player.id;
        const statusText = status === 'out' ? outLabel : STATUS_TEXT[status];
        const hasShield = badges.some(b => b.icon === '🛡️' || b.icon === '👼' || b.label.toLowerCase().includes('shield') || b.label.toLowerCase().includes('guardian'));
        const isFrozen = status === 'frozen' || badges.some(b => b.icon === '❄️' || b.label.toLowerCase().includes('sub-zero') || b.label.toLowerCase().includes('sub_zero'));
        const isOnFire = player.winStreak >= 3;
        const hasBetIn = status === 'placed' || status === 'locked';

        return (
          // The wrapper slides in when the hand is dealt; the button inside lifts on hover
          // (one element can't do both, the animation would pin its transform).
          <div key={player.id} role="listitem" className="animate-gc-slide-up" style={{ animationDelay: `${Math.min(i, 11) * 40}ms`, ...(curved ? { marginTop: arcOffset(i, tiles.length) } : {}) }}>
          <button
            type="button"
            data-seat-player={player.id}
            onClick={() => onOpen(player.id)}
            aria-pressed={isOpen}
            aria-label={`${player.name}, ${hideMoney ? 'balance hidden' : `$${player.money.toLocaleString()}`}, ${statusText}. Open betting card.`}
            className={`gc-surface relative w-full h-full rounded-gc shadow-gc-1 ${
              projectorMode ? 'px-4 pt-5 pb-4 gap-2.5' : 'px-3 pt-4 pb-3.5 gap-2'
            } flex flex-col items-center text-center cursor-pointer transition-transform duration-gc-fast hover:-translate-y-[3px] focus:outline-none focus-visible:ring-4 focus-visible:ring-gc-turn/70 overflow-hidden ${
              isOpen
                ? projectorMode ? 'ring-[3px] ring-inset ring-gc-turn' : 'ring-2 ring-inset ring-gc-turn'
                : status === 'turn'
                  ? projectorMode ? 'ring-[3px] ring-inset ring-gc-turn/90' : 'ring-2 ring-inset ring-gc-turn/80'
                  : isFrozen
                    ? 'ring-2 ring-inset ring-cyan-300/90 shadow-[inset_0_0_28px_rgba(34,211,238,0.38)]'
                    : hasShield
                      ? 'ring-2 ring-inset ring-amber-300/80'
                      : ''
            } ${status === 'out' ? 'opacity-65' : ''}`}
          >
            {/* Glacial frost aura & hanging icicles for frozen seats */}
            {isFrozen && (
              <>
                <span
                  className="pointer-events-none absolute inset-0 bg-gradient-to-b from-cyan-300/30 via-sky-500/15 to-cyan-400/25"
                  aria-hidden="true"
                />
                <svg
                  aria-hidden="true"
                  viewBox="0 0 240 28"
                  preserveAspectRatio="none"
                  className="pointer-events-none absolute top-0 inset-x-0 w-full h-4 text-cyan-200/90 drop-shadow-[0_2px_4px_rgba(8,145,178,0.5)]"
                >
                  <path
                    fill="currentColor"
                    d="M0,0 L240,0 L240,5 L228,18 L218,6 L204,24 L192,7 L180,15 L168,5 L154,26 L140,6 L128,17 L116,5 L102,22 L88,6 L76,16 L64,5 L48,25 L34,7 L22,18 L10,5 L0,16 Z"
                  />
                </svg>
              </>
            )}
            {hasShield && !isFrozen && (
              <span
                className="pointer-events-none absolute inset-0 bg-gradient-to-b from-amber-300/15 via-transparent to-transparent"
                aria-hidden="true"
              />
            )}

            {/* Win streak corner ribbon */}
            {isOnFire && status !== 'out' && (
              <span
                title={`${player.winStreak} hands won in a row!`}
                className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full bg-amber-400/25 border border-amber-400/70 text-gc-money text-[11px] font-black tabular-nums leading-none flex items-center gap-0.5 shadow-sm"
              >
                <span aria-hidden="true">🔥</span>
                <span>{player.winStreak}×</span>
              </span>
            )}

            <span className="relative inline-flex items-center justify-center shrink-0">
              {/* Frozen crystalline outer ring */}
              {isFrozen && (
                <span
                  className="pointer-events-none absolute -inset-1.5 rounded-full border-2 border-cyan-200/90 bg-cyan-300/20 shadow-[0_0_16px_rgba(34,211,238,0.65)] animate-pulse"
                  aria-hidden="true"
                />
              )}
              {/* Shield dome ring */}
              {hasShield && !isFrozen && (
                <span
                  className="pointer-events-none absolute -inset-1.5 rounded-full border-2 border-dashed border-amber-300/90 bg-amber-300/10 animate-pulse"
                  aria-hidden="true"
                />
              )}
              {/* Win streak golden aura */}
              {isOnFire && !isFrozen && (
                <span
                  className="pointer-events-none absolute -inset-1 rounded-full ring-2 ring-amber-400/80 shadow-[0_0_16px_rgba(251,191,36,0.55)]"
                  aria-hidden="true"
                />
              )}
              <span
                className={`${
                  projectorMode ? 'w-16 h-16 border-[3px]' : 'w-14 h-14 border-2'
                } rounded-full grid place-items-center leading-none p-0.5 ${
                  isFrozen
                    ? 'bg-cyan-500/30 border-cyan-200 shadow-[inset_0_0_14px_rgba(165,243,252,0.75)]'
                    : hasShield
                      ? 'bg-amber-400/15 border-amber-300'
                      : 'bg-gc-line/[0.1] border-gc-turn/85'
                } select-none shrink-0 relative z-10`}
                aria-hidden="true"
              >
                <PlayerAvatar value={player.avatar} size="lg" className="w-full h-full" />
              </span>

              {/* Tactile corner status badge on avatar */}
              {isFrozen ? (
                <span
                  className="absolute -bottom-1 -right-1 z-20 w-6 h-6 rounded-full bg-cyan-400 text-slate-950 border-2 border-gc-card grid place-items-center text-xs shadow-md"
                  aria-hidden="true"
                >
                  ❄️
                </span>
              ) : hasShield ? (
                <span
                  className="absolute -bottom-1 -right-1 z-20 w-6 h-6 rounded-full bg-amber-300 text-slate-950 border-2 border-gc-card grid place-items-center text-xs shadow-md"
                  aria-hidden="true"
                >
                  🛡️
                </span>
              ) : hasBetIn ? (
                <span
                  className="absolute -bottom-1 -right-1 z-20 w-6 h-6 rounded-full bg-gc-win text-[#042418] border-2 border-gc-card grid place-items-center shadow-md animate-gc-pop"
                  aria-hidden="true"
                >
                  <Check className="w-3.5 h-3.5" strokeWidth={3.5} />
                </span>
              ) : null}
            </span>

            <span className={`w-full ${projectorMode ? 'text-[23px] leading-7 font-extrabold' : 'text-gc-lead font-bold'} text-gc-ink truncate`}>
              {player.name}
            </span>
            <span data-testid="tile-money" className={`${projectorMode ? 'text-[24px] leading-7 font-extrabold' : 'text-gc-lead font-bold'} tabular-nums text-gc-money -mt-1`}>
              {hideMoney ? '$ ? ? ?' : `$${player.money.toLocaleString()}`}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 ${
                projectorMode ? 'h-8 px-3.5 text-base' : 'h-7 px-3 text-gc-small'
              } rounded-full font-bold whitespace-nowrap ${STATUS_CLASS[status]}`}
            >
              <StatusIcon status={status} projectorMode={projectorMode} />
              {statusText}
            </span>

            {badges.length > 0 && (
              <span className="flex flex-wrap justify-center gap-1" aria-label="Power-ups and effects">
                {badges.map((b, j) => (
                  <span
                    key={j}
                    title={b.label}
                    className={`${projectorMode ? 'text-lg px-2 py-1' : 'text-base px-1.5 py-1'} leading-none rounded-md bg-gc-line/[0.1] border border-gc-line/[0.18]`}
                  >
                    {b.icon}
                  </span>
                ))}
              </span>
            )}
          </button>
          </div>
        );
      })}
    </div>
  );
};

export default PlayerTileGrid;

