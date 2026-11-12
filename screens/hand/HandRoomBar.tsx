// The live room bar above the table: room code, phones, hide-bets switch (moved out of HandScreen, F7).
import { useGame } from '../../state/gameStore';
import { presenceSummary } from '../../game/presence';
import React from 'react';
import { Player, SoundEffect } from '../../types';
import { Smartphone } from 'lucide-react';

export interface HandRoomBarProps {
  playSound: (sound: SoundEffect, ...args: any[]) => void;
  setShowMpLobbyModal: React.Dispatch<React.SetStateAction<boolean>>;
  mpLockedCount: number;
  unfrozenActivePlayers: Player[];
}

export function HandRoomBar({
  playSound,
  setShowMpLobbyModal,
  mpLockedCount,
  unfrozenActivePlayers,
}: HandRoomBarProps) {
  const mpRoomCode = useGame(s => s.mpRoomCode);
  const mpSeats = useGame(s => s.mpSeats);
  const mpAwayIds = useGame(s => s.mpAwayIds);
  const setMpHideProjectorBets = useGame(s => s.setMpHideProjectorBets);
  const mpHideProjectorBets = useGame(s => s.mpHideProjectorBets);
  return (
    <>
      {/* Live Classroom Multiplayer Projector Bar */}
      {mpRoomCode && (
        <div className="mb-5 p-3.5 sm:px-5 rounded-gc gc-surface flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              data-hotkey="room"
              onClick={() => {
                playSound('click');
                setShowMpLobbyModal(true);
              }}
              className="h-9 px-4 rounded-full bg-gc-gold text-gc-on-gold tabular-nums font-bold text-gc-small cursor-pointer hover:brightness-105 transition-all flex items-center gap-1.5"
            >
              <Smartphone className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Room {mpRoomCode} · QR code</span>
            </button>
            <span className="text-gc-small font-semibold text-gc-quiet tabular-nums" aria-live="polite">
              {presenceSummary(Object.keys(mpSeats).length, mpAwayIds.filter(id => mpSeats[id]).length)}
            </span>

            <div className="text-gc-small text-gc-quiet flex items-center gap-2">
              <span>Locked in:</span>
              <span className="tabular-nums font-bold text-gc-ink">
                {mpLockedCount} of {unfrozenActivePlayers.length}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => {
                playSound('click');
                setMpHideProjectorBets(v => !v);
              }}
              data-hotkey="hide-bets"
              aria-pressed={mpHideProjectorBets}
              className={`h-9 px-3.5 rounded-full text-gc-small font-semibold border transition-colors cursor-pointer flex items-center gap-1.5 ${
                mpHideProjectorBets
                  ? 'bg-gc-win/15 border-transparent text-gc-win'
                  : 'bg-gc-line/[0.06] border-gc-line/[0.14] text-gc-ink'
              }`}
              title="Hide students' bets on the projector (best when they bet on phones), or show every betting card"
            >
              <span>{mpHideProjectorBets ? 'Bets hidden on the projector' : 'Showing every betting card'}</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
