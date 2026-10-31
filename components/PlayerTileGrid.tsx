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
  waiting: 'bg-gc-line/[0.07] text-gc-quiet',
  turn: 'bg-gc-gold text-gc-on-gold',
  placed: 'bg-gc-info/15 text-gc-info',
  locked: 'bg-gc-win/15 text-gc-win animate-gc-pop',
  frozen: 'bg-gc-info/15 text-gc-info',
  satOut: 'bg-gc-line/[0.07] text-gc-quiet',
  out: 'bg-gc-loss/15 text-gc-loss',
};

const StatusIcon: React.FC<{ status: SeatStatus }> = ({ status }) => {
  const cls = 'w-3.5 h-3.5 shrink-0';
  switch (status) {
    case 'waiting':
      return (
        <span className="inline-flex gap-[3px]" aria-hidden="true">
          <i className="w-[5px] h-[5px] rounded-full bg-current animate-gc-blink" />
          <i className="w-[5px] h-[5px] rounded-full bg-current animate-gc-blink [animation-delay:0.2s]" />
          <i className="w-[5px] h-[5px] rounded-full bg-current animate-gc-blink [animation-delay:0.4s]" />
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

const PlayerTileGrid: React.FC<PlayerTileGridProps> = ({ tiles, openPlayerId, onOpen, outLabel }) => {
  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5"
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
            className={`gc-surface relative w-full h-full rounded-gc shadow-gc-1 px-3 pt-4 pb-3.5 flex flex-col items-center gap-2 text-center cursor-pointer transition-transform duration-150 hover:-translate-y-[3px] focus:outline-none focus-visible:ring-4 focus-visible:ring-gc-turn/70 ${
              isOpen
                ? 'ring-2 ring-inset ring-gc-turn'
                : status === 'turn'
                  ? 'ring-2 ring-inset ring-gc-turn/80'
                  : ''
            } ${status === 'out' ? 'opacity-60' : ''}`}
          >
            <span
              className="w-14 h-14 rounded-full grid place-items-center text-3xl leading-none bg-gc-line/[0.08] border-2 border-gc-turn/70 select-none shrink-0"
              aria-hidden="true"
            >
              {player.avatar}
            </span>
            <span className="w-full text-gc-lead font-bold text-gc-ink truncate">{player.name}</span>
            <span className="text-gc-lead font-bold tabular-nums text-gc-money -mt-1">${player.money.toLocaleString()}</span>
            <span
              className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-gc-small font-bold whitespace-nowrap ${STATUS_CLASS[status]}`}
            >
              <StatusIcon status={status} />
              {statusText}
            </span>

            {badges.length > 0 && (
              <span className="flex flex-wrap justify-center gap-1" aria-label="Power-ups and effects">
                {badges.map((b, j) => (
                  <span
                    key={j}
                    title={b.label}
                    className="text-base leading-none px-1.5 py-1 rounded-md bg-gc-line/[0.07] border border-gc-line/[0.12]"
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
