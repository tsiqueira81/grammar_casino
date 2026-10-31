import React from 'react';
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

const STATUS_TEXT: Record<SeatStatus, { icon: string; text: string }> = {
  waiting: { icon: '🤔', text: 'Deciding' },
  turn: { icon: '⏱️', text: 'Their turn' },
  placed: { icon: '🂠', text: 'Bet placed' },
  locked: { icon: '🔒', text: 'Locked in' },
  frozen: { icon: '❄️', text: 'Frozen' },
  satOut: { icon: '⏳', text: 'Sat out' },
  out: { icon: '💸', text: 'Out' },
};

const PlayerTileGrid: React.FC<PlayerTileGridProps> = ({ tiles, openPlayerId, onOpen, outLabel }) => {
  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3"
      role="list"
      aria-label="Players at the table"
    >
      {tiles.map(({ player, status, badges }) => {
        const isOpen = openPlayerId === player.id;
        const isDone = status === 'placed' || status === 'locked';
        const statusInfo = status === 'out' ? { icon: '💸', text: outLabel } : STATUS_TEXT[status];
        return (
          <button
            key={player.id}
            type="button"
            role="listitem"
            onClick={() => onOpen(player.id)}
            aria-pressed={isOpen}
            aria-label={`${player.name}, $${player.money.toLocaleString()}, ${statusInfo.text}. Open betting card.`}
            className={`relative text-left rounded-2xl p-3 border-2 transition-all cursor-pointer glass-panel flex flex-col gap-2 hover:scale-[1.02] focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-300 ${
              isOpen
                ? 'border-[#fef08a] shadow-[0_0_24px_rgba(254,240,138,0.35)]'
                : status === 'out'
                  ? 'opacity-55 border-slate-500/30'
                  : status === 'frozen'
                    ? 'border-cyan-400/70'
                    : status === 'turn'
                      ? 'border-amber-400 animate-pulse'
                      : isDone
                        ? 'border-emerald-500'
                        : 'border-[#d4af37]/40'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-11 h-11 rounded-full border-2 border-[#d4af37] bg-black/30 flex items-center justify-center text-2xl shrink-0 select-none">
                {player.avatar}
              </div>
              <div className="min-w-0">
                <div className="font-serif font-extrabold uppercase tracking-wide text-base leading-tight text-slate-900 dark:text-amber-50 truncate">
                  {player.name}
                </div>
                <div className="font-mono-casino font-black text-base text-emerald-800 dark:text-[#fef08a]">
                  ${player.money.toLocaleString()}
                </div>
              </div>
            </div>

            <div
              className={`rounded-lg px-2 py-1.5 text-sm font-serif font-bold flex items-center justify-center gap-1.5 border ${
                isDone
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-950 dark:text-emerald-100'
                  : status === 'turn'
                    ? 'bg-amber-400/25 border-amber-300 text-amber-950 dark:text-amber-100'
                    : status === 'frozen'
                      ? 'bg-cyan-500/20 border-cyan-300 text-cyan-950 dark:text-cyan-100'
                      : 'bg-black/5 dark:bg-black/30 border-[#d4af37]/40 text-slate-800 dark:text-amber-100'
              }`}
            >
              <span aria-hidden="true">{statusInfo.icon}</span>
              <span>{statusInfo.text}</span>
            </div>

            {badges.length > 0 && (
              <div className="flex flex-wrap gap-1" aria-label="Power-ups and effects">
                {badges.map((b, i) => (
                  <span
                    key={i}
                    title={b.label}
                    className="text-base leading-none px-1 py-0.5 rounded-md bg-amber-500/15 border border-[#d4af37]/40"
                  >
                    {b.icon}
                  </span>
                ))}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default PlayerTileGrid;
