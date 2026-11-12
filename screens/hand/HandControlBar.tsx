// The bar of hand controls pinned under the table (package T2; moved out of HandScreen, F7).
import { useGame } from '../../state/gameStore';
import React from 'react';
import { SoundEffect } from '../../types';
import { RotateCcw, Eye, Pause, Flag, Clock } from 'lucide-react';
import ActionButton from '../../components/ActionButton';

export interface HandControlBarProps {
  canRevealResults: boolean;
  handleRevealResults: (force?: unknown) => Promise<void>;
  playSound: (sound: SoundEffect, ...args: any[]) => void;
  revealNote: string;
  allMpPlayersLocked: boolean;
  isTurnTimerEnabled: boolean;
  allActivePlayersLocked: boolean;
  allValidBetsFinalized: boolean;
  setConfirmAction: React.Dispatch<React.SetStateAction<{ title: string; message: string; confirmLabel: string; onConfirm: () => void; }>>;
  handleSwapSentence: () => void;
  gameClock: string;
}

export function HandControlBar({
  canRevealResults,
  handleRevealResults,
  playSound,
  revealNote,
  allMpPlayersLocked,
  isTurnTimerEnabled,
  allActivePlayersLocked,
  allValidBetsFinalized,
  setConfirmAction,
  handleSwapSentence,
  gameClock,
}: HandControlBarProps) {
  const isProcessing = useGame(s => s.isProcessing);
  const processingStatus = useGame(s => s.processingStatus);
  const mpRoomCode = useGame(s => s.mpRoomCode);
  const setTeacherRevealOverride = useGame(s => s.setTeacherRevealOverride);
  const teacherRevealOverride = useGame(s => s.teacherRevealOverride);
  const isLoading = useGame(s => s.isLoading);
  const currentSentence = useGame(s => s.currentSentence);
  const setIsPaused = useGame(s => s.setIsPaused);
  const gameMode = useGame(s => s.gameMode);
  const currentRound = useGame(s => s.currentRound);
  const totalRounds = useGame(s => s.totalRounds);
  const setTotalRounds = useGame(s => s.setTotalRounds);
  return (
    <>
      {/* Package T2: one control bar, pinned to the bottom of the screen during the hand,
          so the teacher never scrolls past 35 seats to reveal. */}
      <div
        className="relative sm:sticky sm:bottom-0 z-30 mt-10 -mx-3 sm:-mx-4 px-3 sm:px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-gc-bg/90 backdrop-blur-md border-t border-gc-line/[0.12] flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 print:hidden"
        data-testid="control-bar"
        role="toolbar"
        aria-label="Hand controls"
      >
        <div className={`order-first w-full sm:w-auto flex justify-center rounded-full ${canRevealResults && !isProcessing ? 'animate-gc-breathe' : ''}`}>
          <ActionButton 
            data-hotkey="primary"
            onClick={handleRevealResults} 
            playSound={playSound} 
            variant="primary"
            className="w-full md:w-auto min-h-[52px] text-gc-lead py-3 px-10" 
            disabled={isProcessing || !canRevealResults}
          >
            {isProcessing ? processingStatus || 'Settling the bets…' : (
              <span className="inline-flex flex-wrap items-baseline justify-center gap-x-3 gap-y-0.5">
                <span>Reveal the answer</span>
                {revealNote && <span className="text-gc-body font-semibold opacity-80">{revealNote}</span>}
              </span>
            )}
          </ActionButton>
        </div>

        {/* Always offer an early reveal, so one player who never bets cannot block the hand (F4 fix 12) */}
        {(mpRoomCode ? !allMpPlayersLocked : isTurnTimerEnabled ? !allActivePlayersLocked : !allValidBetsFinalized) && (
          <button
            type="button"
            onClick={() => {
              playSound('click');
              setTeacherRevealOverride(v => !v);
            }}
            aria-pressed={teacherRevealOverride}
            className={`text-gc-small font-semibold underline underline-offset-4 px-2 py-1.5 rounded-md transition-colors cursor-pointer ${
              teacherRevealOverride ? 'text-gc-loss' : 'text-gc-quiet hover:text-gc-ink'
            }`}
            title="Teacher only: allow the reveal before every player has locked in"
          >
            {teacherRevealOverride ? 'Early reveal is on. Turn it off' : 'Let me reveal before everyone is in'}
          </button>
        )}

        {/* Teacher controls (package R8): reveal now, pause, swap the sentence. */}
        {(mpRoomCode ? !allMpPlayersLocked : isTurnTimerEnabled ? !allActivePlayersLocked : !allValidBetsFinalized) && (
          <button
            type="button"
            disabled={isLoading || isProcessing || !currentSentence}
            onClick={() => {
              playSound('click');
              setConfirmAction({
                title: 'Reveal now?',
                message: 'The answer is revealed straight away. Players who have not placed a bet sit this hand out.',
                confirmLabel: 'Reveal now',
                onConfirm: () => { void handleRevealResults(true); },
              });
            }}
            data-hotkey="reveal-now"
            className="inline-flex items-center gap-1.5 min-h-[44px] text-gc-small font-semibold text-gc-quiet hover:text-gc-ink px-3 rounded-md transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            title="Teacher only: reveal the answer without waiting for everyone"
          >
            <Eye className="w-4 h-4 shrink-0" aria-hidden="true" />
            Reveal now
          </button>
        )}
        <button
          type="button"
          disabled={isLoading || isProcessing}
          onClick={() => { playSound('click'); setIsPaused(true); }}
          data-hotkey="pause"
          className="inline-flex items-center gap-1.5 min-h-[44px] text-gc-small font-semibold text-gc-quiet hover:text-gc-ink px-3 rounded-md transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          title="Teacher only: stop the timers and the phones for a moment"
        >
          <Pause className="w-4 h-4 shrink-0" aria-hidden="true" />
          Pause
        </button>
        <button
          type="button"
          disabled={isLoading || isProcessing}
          onClick={() => {
            playSound('click');
            setConfirmAction({
              title: 'Swap this sentence?',
              message: 'A different sentence is dealt for this hand. Bets are cleared, and everyone gets back what they spent on hints and power-ups this hand.',
              confirmLabel: 'Swap the sentence',
              onConfirm: handleSwapSentence,
            });
          }}
          data-hotkey="swap"
          className="inline-flex items-center gap-1.5 min-h-[44px] text-gc-small font-semibold text-gc-quiet hover:text-gc-ink px-3 rounded-md transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          title="Teacher only: deal a different sentence for this hand"
        >
          <RotateCcw className="w-4 h-4 shrink-0" aria-hidden="true" />
          Swap this sentence
        </button>
        {gameMode === 'rounds' && currentRound < Number(totalRounds) && (
          <button
            type="button"
            onClick={() => {
              playSound('click');
              setConfirmAction({
                title: 'Finish after this hand?',
                message: `This becomes the last hand (hand ${currentRound} of ${currentRound}). The most money after it wins.`,
                confirmLabel: 'Make it the last hand',
                onConfirm: () => setTotalRounds(currentRound),
              });
            }}
            className="inline-flex items-center gap-1.5 min-h-[44px] text-gc-small font-semibold text-gc-quiet hover:text-gc-ink px-3 rounded-md transition-colors cursor-pointer"
            title="Teacher only: end the game after this hand"
          >
            <Flag className="w-4 h-4 shrink-0" aria-hidden="true" />
            Finish after this hand
          </button>
        )}
        {gameClock && (
          <span className="inline-flex items-center gap-1.5 min-h-[44px] px-3 text-gc-small font-semibold text-gc-quiet tabular-nums" data-testid="game-clock">
            <Clock className="w-4 h-4 shrink-0" aria-hidden="true" />
            {gameClock}
          </span>
        )}
      </div> 
    </>
  );
}
