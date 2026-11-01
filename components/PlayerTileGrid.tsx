import React from 'react';
import { Check, Clock, Snowflake, X } from 'lucide-react';
import { Player } from '../types';

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

const PlayerTileGrid: React.FC<PlayerTileGridProps> = ({ tiles, openPlayerId, onOpen, outLabel, projectorMode = false }) => {
  return (
    <div
      className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 ${
        projectorMode ? 'lg:grid-cols-5 xl:grid-cols-6 gap-4' : 'lg:grid-cols-6 gap-3.5'
      }`}
      role="list"
      aria-label="Players at the table"
    >
      {tiles.map(({ player, status, badges }, i) => {
        const isOpen = openPlayerId === player.id;
        const statusText = status === 'out' ? outLabel : STATUS_TEXT[status];
        return (
          // The wrapper slides in when the hand is dealt; the button inside lifts on hover
          // (one element can't do both, the animation would pin its transform).
          <div key={player.id} role="listitem" className="animate-gc-slide-up" style={{ animationDelay: `${Math.min(i, 11) * 40}ms` }}>
          <button
            type="button"
            onClick={() => onOpen(player.id)}
            aria-pressed={isOpen}
            aria-label={`${player.name}, $${player.money.toLocaleString()}, ${statusText}. Open betting card.`}
            className={`gc-surface relative w-full h-full rounded-gc shadow-gc-1 ${
              projectorMode ? 'px-4 pt-5 pb-4 gap-2.5' : 'px-3 pt-4 pb-3.5 gap-2'
            } flex flex-col items-center text-center cursor-pointer transition-transform duration-150 hover:-translate-y-[3px] focus:outline-none focus-visible:ring-4 focus-visible:ring-gc-turn/70 ${
              isOpen
                ? projectorMode ? 'ring-[3px] ring-inset ring-gc-turn' : 'ring-2 ring-inset ring-gc-turn'
                : status === 'turn'
                  ? projectorMode ? 'ring-[3px] ring-inset ring-gc-turn/90' : 'ring-2 ring-inset ring-gc-turn/80'
                  : ''
            } ${status === 'out' ? 'opacity-65' : ''}`}
          >
            <span
              className={`${
                projectorMode ? 'w-16 h-16 text-4xl border-[3px]' : 'w-14 h-14 text-3xl border-2'
              } rounded-full grid place-items-center leading-none bg-gc-line/[0.1] border-gc-turn/85 select-none shrink-0`}
              aria-hidden="true"
            >
              {player.avatar}
            </span>
            <span className={`w-full ${projectorMode ? 'text-[23px] leading-7 font-extrabold' : 'text-gc-lead font-bold'} text-gc-ink truncate`}>
              {player.name}
            </span>
            <span className={`${projectorMode ? 'text-[24px] leading-7 font-extrabold' : 'text-gc-lead font-bold'} tabular-nums text-gc-money -mt-1`}>
              ${player.money.toLocaleString()}
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

