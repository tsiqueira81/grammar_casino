// The phone's top bar: who you are, the room and hand, your balance (moved out of StudentControllerView, F7).

import React from 'react';
import { PlayerAvatar } from '../PlayerAvatar';
import { PlayerViewPayload } from '../../utils/multiplayerProtocol';
import { LogOut, Settings as SettingsIcon } from 'lucide-react';

export interface PhoneTopBarProps {
  setShowAvatarPicker: React.Dispatch<React.SetStateAction<boolean>>;
  showAvatarPicker: boolean;
  view: PlayerViewPayload;
  money: (n: number) => string;
  setShowComfort: React.Dispatch<React.SetStateAction<boolean>>;
  showComfort: boolean;
  handleLeaveRoom: () => void;
}

export function PhoneTopBar({
  setShowAvatarPicker,
  showAvatarPicker,
  view,
  money,
  setShowComfort,
  showComfort,
  handleLeaveRoom,
}: PhoneTopBarProps) {

  return (
    <>
      <header className="sticky top-0 z-30 min-h-16 pt-[env(safe-area-inset-top)] px-4 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] bg-gc-bg/85 backdrop-blur-md border-b border-gc-line/[0.1] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => setShowAvatarPicker((v) => !v)}
            className="w-11 h-11 rounded-full border-2 border-gc-turn/70 p-0.5 bg-gc-line/[0.08] grid place-items-center shrink-0 cursor-pointer hover:scale-105 transition-transform"
            aria-label="Change your avatar"
            aria-expanded={showAvatarPicker}
          >
            <PlayerAvatar value={view.me.avatar} size="md" className="w-full h-full" />
          </button>
          <div className="min-w-0">
            <div className="text-[15px] font-bold text-gc-ink truncate leading-tight">{view.me.name}</div>
            <div className="text-[12.5px] font-semibold text-gc-quiet tabular-nums flex items-center gap-1.5 leading-tight">
              <span>Room {view.roomCode}</span>
              {view.step === 'IN_GAME' || view.step === 'RESULTS' ? <span>· Hand {view.round}</span> : null}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {view.me.winStreak > 1 && (
            <span className="h-8 px-2.5 rounded-full bg-gc-gold/15 text-gc-money text-gc-small font-bold tabular-nums inline-flex items-center" title={`${view.me.winStreak} wins in a row`}>
              🔥 {view.me.winStreak}
            </span>
          )}
          <div className="h-9 px-3 rounded-full bg-gc-line/[0.07] border border-gc-line/[0.12] inline-flex items-center text-gc-body font-extrabold text-gc-money tabular-nums">
            {money(view.me.money)}
          </div>
          <button
            type="button"
            onClick={() => { setShowComfort((v) => !v); setShowAvatarPicker(false); }}
            className="w-11 h-11 rounded-full grid place-items-center text-gc-quiet hover:text-gc-ink cursor-pointer"
            aria-label="Phone settings"
            aria-expanded={showComfort}
            title="Phone settings"
            data-testid="comfort-button"
          >
            <SettingsIcon className="w-[18px] h-[18px]" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleLeaveRoom}
            className="w-11 h-11 rounded-full grid place-items-center text-gc-quiet hover:text-gc-danger cursor-pointer"
            aria-label="Leave the room"
            title="Leave the room"
          >
            <LogOut className="w-[18px] h-[18px]" aria-hidden="true" />
          </button>
        </div>
      </header>
    </>
  );
}
