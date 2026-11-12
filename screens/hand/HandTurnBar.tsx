// The turn timers during a hand: the room's shared timer, or the hot-seat turn bar (moved out of HandScreen, F7).
import { useGame } from '../../state/gameStore';
import React from 'react';
import { Player, SoundEffect } from '../../types';
import { PlayerAvatar } from '../../components/PlayerAvatar';
import { MultiplayerRoundTimerFrame } from '../../components/TurnTimer';
import { SettingsModalTab } from '../../components/RoundSettingsModal';
import * as GeminiService from '../../services/geminiService';
import { sentenceStatus } from '../../game/aiStatus';

export interface HandTurnBarProps {
  isTurnTimerEnabled: boolean;
  turnDurationMs: number;
  allMpPlayersLocked: boolean;
  mpLockedCount: number;
  unfrozenActivePlayers: Player[];
  playSound: (sound: SoundEffect, ...args: any[]) => void;
  handleMpRoundTimerStart: () => void;
  handleMpRoundTimerPause: () => void;
  handleMpRoundTimerAddTime: () => void;
  handleMpRoundTimerLockNow: () => void;
  handleMpRoundTimerReset: () => void;
  handleOpenSettingsModal: (tab?: SettingsModalTab) => void;
  desktopStatus: GeminiService.DesktopStatus;
  activePlayers: Player[];
  isPlayerFrozen: (playerId: number) => boolean;
  activeTurnPlayer: Player;
  nextIdlePlayer: Player;
  handleTimerStart: (playerId: number) => void;
}

export function HandTurnBar({
  isTurnTimerEnabled,
  turnDurationMs,
  allMpPlayersLocked,
  mpLockedCount,
  unfrozenActivePlayers,
  playSound,
  handleMpRoundTimerStart,
  handleMpRoundTimerPause,
  handleMpRoundTimerAddTime,
  handleMpRoundTimerLockNow,
  handleMpRoundTimerReset,
  handleOpenSettingsModal,
  desktopStatus,
  activePlayers,
  isPlayerFrozen,
  activeTurnPlayer,
  nextIdlePlayer,
  handleTimerStart,
}: HandTurnBarProps) {
  const mpRoomCode = useGame(s => s.mpRoomCode);
  const mpRoundTimer = useGame(s => s.mpRoundTimer);
  const turnTimerSeconds = useGame(s => s.turnTimerSeconds);
  const autoStartNextTimer = useGame(s => s.autoStartNextTimer);
  const setAutoStartNextTimer = useGame(s => s.setAutoStartNextTimer);
  const currentSentence = useGame(s => s.currentSentence);
  const turnTimers = useGame(s => s.turnTimers);
  return (
    <>
      {/* In Multiplayer mode, display the Shared Round Timer for everyone instead of a Turn Sequence frame */}
      {isTurnTimerEnabled && mpRoomCode && (
        <MultiplayerRoundTimerFrame
          timer={mpRoundTimer}
          turnDurationMs={turnDurationMs}
          turnTimerSeconds={turnTimerSeconds}
          allPlayersLocked={allMpPlayersLocked}
          lockedCount={mpLockedCount}
          totalActivePlayers={unfrozenActivePlayers.length}
          autoStartTimer={autoStartNextTimer}
          onToggleAutoStart={() => {
            playSound('click');
            setAutoStartNextTimer(v => !v);
          }}
          onStart={handleMpRoundTimerStart}
          onPause={handleMpRoundTimerPause}
          onAddTime={handleMpRoundTimerAddTime}
          onLockNow={handleMpRoundTimerLockNow}
          onReset={handleMpRoundTimerReset}
          onOpenAiSettings={() => handleOpenSettingsModal('ai')}
          aiStatusLabel={sentenceStatus(desktopStatus, currentSentence).label}
          playSound={playSound}
        />
      )}

      {/* Croupier's Sequential Turn Bar when Turn Timer is enabled (Single-screen / Hot-Seat mode only) */}
      {isTurnTimerEnabled && !mpRoomCode && (
        <div className="mb-5 p-3.5 sm:px-5 rounded-gc gc-surface flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-gc-small font-bold text-gc-ink">
              Turns ({turnTimerSeconds} s each)
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {activePlayers.map((p, idx) => {
                const frozen = isPlayerFrozen(p.id);
                const st = turnTimers[p.id]?.status ?? 'idle';
                const badgeClass = frozen
                  ? 'bg-cyan-500/15 border-cyan-400/50 text-cyan-800 dark:text-cyan-200'
                  : st === 'running'
                    ? 'bg-gc-gold border-transparent text-gc-on-gold font-bold'
                    : st === 'paused'
                      ? 'bg-gc-info/15 border-transparent text-gc-info'
                      : st === 'locked'
                        ? 'bg-gc-win/15 border-transparent text-gc-win'
                        : 'bg-gc-line/[0.07] border-gc-line/[0.12] text-gc-quiet';
                return (
                  <React.Fragment key={p.id}>
                    {idx > 0 && <span className="text-gc-quiet/60 text-xs select-none" aria-hidden="true">&rarr;</span>}
                    <span className={`h-8 pl-1.5 pr-3 rounded-full text-gc-small font-semibold border flex items-center gap-1.5 ${badgeClass}`}>
                      <PlayerAvatar value={p.avatar} size="xs" />
                      <span>{p.name}</span>
                      <span className="text-[10px]">
                        {frozen ? '❄️' : st === 'running' ? '⏱️' : st === 'paused' ? '⏸' : st === 'locked' ? '🔒' : '⏳'}
                      </span>
                    </span>
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {!activeTurnPlayer && nextIdlePlayer && (
              <button
                type="button"
                onClick={() => handleTimerStart(nextIdlePlayer.id)}
                data-hotkey="timer"
                className="h-9 px-4 rounded-full text-gc-small font-bold gc-btn-primary hover:brightness-105 active:scale-95 transition-all cursor-pointer"
              >
                ▶ Start {nextIdlePlayer.name}'s turn
              </button>
            )}
            <button
              type="button"
              onClick={() => { playSound('click'); setAutoStartNextTimer(v => !v); }}
              aria-pressed={autoStartNextTimer}
              className={`h-9 px-3.5 rounded-full text-gc-small font-semibold border transition-colors cursor-pointer ${
                autoStartNextTimer
                  ? 'bg-gc-gold/15 border-gc-gold/50 text-gc-money'
                  : 'bg-gc-line/[0.06] border-gc-line/[0.14] text-gc-quiet'
              }`}
              title="Automatically start the next player's timer when the current player's timer finishes or locks"
            >
              Next turn starts by itself: {autoStartNextTimer ? 'on' : 'off'}
            </button>
                                <button
              type="button"
              onClick={() => handleOpenSettingsModal('ai')}
              className="h-9 px-3.5 bg-gc-line/[0.06] border border-gc-line/[0.14] hover:border-gc-line/30 rounded-full text-gc-small text-gc-ink flex items-center gap-1.5 font-semibold cursor-pointer transition-colors"
              title="AI and offline settings"
            >
              <span data-testid="sentence-status">{sentenceStatus(desktopStatus, currentSentence).label}</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
