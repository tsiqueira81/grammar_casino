import React from 'react';
import { PlayerTurnTimer, SoundEffect } from '../types';
import { TURN_TIMER_BONUS_MS, TURN_TIMER_WARNING_SECONDS } from '../constants';

/**
 * Computes the time left for a player's turn timer.
 * Running timers store an absolute `endsAt` deadline (not a countdown), so the value
 * stays correct across background-tab throttling and page reloads.
 */
export const getTimerRemainingMs = (timer: PlayerTurnTimer | undefined, durationMs: number, now: number = Date.now()): number => {
  if (!timer || timer.status === 'idle') return timer?.remainingMs ?? durationMs;
  if (timer.status === 'running') {
    if (timer.held || timer.endsAt === undefined) return Math.max(0, timer.remainingMs ?? 0);
    return Math.max(0, timer.endsAt - now);
  }
  return Math.max(0, timer.remainingMs ?? 0);
};

export const formatClock = (ms: number): string => {
  const totalSeconds = Math.ceil(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

/**
 * Self-ticking countdown. Only the card that owns a live timer re-renders,
 * keeping the large App component out of the per-second render loop.
 * Plays a tick each second during the final warning window.
 */
export const useTurnCountdown = (
  timer: PlayerTurnTimer | undefined,
  durationMs: number,
  playSound?: (sound: SoundEffect) => void
) => {
  const isLive = timer?.status === 'running' && !timer.held;
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!isLive) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [isLive, timer?.endsAt]);

  const remainingMs = getTimerRemainingMs(timer, durationMs, now);
  const secondsLeft = Math.ceil(remainingMs / 1000);
  const fraction = durationMs > 0 ? Math.max(0, Math.min(1, remainingMs / durationMs)) : 0;
  const isWarning = timer?.status === 'running' && secondsLeft > 0 && secondsLeft <= TURN_TIMER_WARNING_SECONDS;

  // Ticking sound, once per second, during the last seconds of a live countdown
  const lastTickRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!isLive || !isWarning) {
      lastTickRef.current = null;
      return;
    }
    if (lastTickRef.current !== secondsLeft) {
      lastTickRef.current = secondsLeft;
      playSound?.('tick');
    }
  }, [isLive, isWarning, secondsLeft, playSound]);

  return { remainingMs, secondsLeft, fraction, isWarning, isLive };
};

/** Circular ring drawn around the player's avatar that drains as time runs out. */
export const TimerAvatarRing: React.FC<{ fraction: number; isWarning: boolean; status: PlayerTurnTimer['status']; held?: boolean }> = ({
  fraction, isWarning, status, held,
}) => {
  const size = 72;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - fraction);

  const color =
    status === 'locked' ? '#64748b'
    : status === 'paused' || held ? '#38bdf8'
    : isWarning ? '#f43f5e'
    : fraction < 0.33 ? '#f59e0b'
    : '#d4af37';

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`pointer-events-none absolute -top-2 -left-2 -rotate-90 z-10 ${isWarning ? 'animate-pulse' : ''}`}
      aria-hidden="true"
    >
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(212,175,55,0.18)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{
          transition: 'stroke-dashoffset 0.25s linear, stroke 0.3s ease',
          filter: isWarning ? 'drop-shadow(0 0 6px rgba(244,63,94,0.9))' : 'drop-shadow(0 0 3px rgba(212,175,55,0.5))',
        }}
      />
    </svg>
  );
};

interface TurnTimerControlsProps {
  timer: PlayerTurnTimer | undefined;
  remainingMs: number;
  isWarning: boolean;
  isFrozen: boolean;
  isSatOut: boolean;
  blockedByName?: string; // Another player's turn is active -> cannot start
  onStart: () => void;
  onPause: () => void;
  onAddTime: () => void;
  onLockNow: () => void;
  onUnlock: () => void;
}

const btnBase = 'px-2.5 py-1.5 rounded-lg text-[10px] sm:text-[11px] font-serif font-extrabold uppercase tracking-wider border transition-all cursor-pointer select-none disabled:opacity-40 disabled:cursor-not-allowed active:scale-95';

/** Teacher-facing control strip for a player's betting turn. */
export const TurnTimerControls: React.FC<TurnTimerControlsProps> = ({
  timer, remainingMs, isWarning, isFrozen, isSatOut, blockedByName,
  onStart, onPause, onAddTime, onLockNow, onUnlock,
}) => {
  const status = timer?.status ?? 'idle';
  const held = status === 'running' && !!timer?.held;

  let label: string;
  let labelClass = 'text-amber-800 dark:text-amber-200/80';
  if (status === 'idle') {
    label = blockedByName ? `Waiting · ${blockedByName}'s turn` : 'Awaiting turn';
  } else if (status === 'running') {
    label = held ? 'Clock held · popup / hint' : 'Betting in progress';
    labelClass = held ? 'text-sky-700 dark:text-sky-300' : isWarning ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-300';
  } else if (status === 'paused') {
    label = 'Paused by teacher';
    labelClass = 'text-sky-700 dark:text-sky-300';
  } else if (timer?.skipped || isFrozen) {
    label = 'Skipped · frozen';
    labelClass = 'text-cyan-700 dark:text-cyan-300';
  } else if (isSatOut) {
    label = 'Sat out · no bet placed';
    labelClass = 'text-rose-700 dark:text-rose-300';
  } else {
    label = 'Bet locked';
    labelClass = 'text-slate-600 dark:text-slate-300';
  }

  const clockClass =
    status === 'locked' ? 'text-slate-500 dark:text-slate-400'
    : isWarning ? 'text-rose-600 dark:text-rose-400 animate-pulse'
    : status === 'paused' || held ? 'text-sky-700 dark:text-sky-300'
    : 'text-amber-800 dark:text-[#fef08a]';

  return (
    <div
      className={`mb-5 -mt-1 px-3.5 py-2.5 rounded-xl felt-well flex flex-wrap items-center justify-between gap-3 transition-all ${
        isWarning ? '!border-rose-500/70 shadow-[0_0_18px_rgba(244,63,94,0.35)]' : ''
      } ${status === 'running' && !held && !isWarning ? '!border-emerald-500/50' : ''}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-lg select-none" aria-hidden="true">{status === 'locked' ? '🔒' : '⏱️'}</span>
        <div className="flex flex-col leading-tight min-w-0">
          <span className="text-[9px] font-serif uppercase tracking-[0.2em] text-amber-900/70 dark:text-amber-200/60 font-bold">Turn Clock</span>
          <span className={`text-[11px] font-serif font-bold truncate ${labelClass}`}>{label}</span>
        </div>
        <span className={`font-mono-casino font-extrabold text-2xl tabular-nums tracking-tight ${clockClass}`} aria-live="off">
          {formatClock(remainingMs)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {(status === 'idle' || status === 'paused') && (
          <button
            type="button"
            onClick={onStart}
            disabled={status === 'idle' && !!blockedByName}
            title={status === 'idle' && blockedByName ? `Finish ${blockedByName}'s turn first` : status === 'paused' ? 'Resume the countdown' : 'Start this player\'s betting turn'}
            className={`${btnBase} bg-gradient-to-b from-emerald-500 to-emerald-700 text-white border-emerald-300/70 shadow-[0_2px_0_#064e3b]`}
          >
            ▶ {status === 'paused' ? 'Resume' : 'Start'}
          </button>
        )}
        {status === 'running' && (
          <button
            type="button"
            onClick={onPause}
            title="Pause the countdown"
            className={`${btnBase} bg-gradient-to-b from-sky-500 to-sky-700 text-white border-sky-300/70 shadow-[0_2px_0_#0c4a6e]`}
          >
            ⏸ Pause
          </button>
        )}
        {(status === 'running' || status === 'paused') && (
          <>
            <button
              type="button"
              onClick={onAddTime}
              title={`Add ${TURN_TIMER_BONUS_MS / 1000} seconds`}
              className={`${btnBase} bg-black/10 dark:bg-black/40 text-amber-900 dark:text-[#fef08a] border-[#d4af37]/60 hover:border-[#d4af37]`}
            >
              +{TURN_TIMER_BONUS_MS / 1000}s
            </button>
            <button
              type="button"
              onClick={onLockNow}
              title="End this turn now and lock the bet"
              className={`${btnBase} bg-black/10 dark:bg-black/40 text-slate-800 dark:text-slate-200 border-slate-400/50 hover:border-slate-300`}
            >
              🔒 Lock Now
            </button>
          </>
        )}
        {status === 'locked' && !isFrozen && (
          <button
            type="button"
            onClick={onUnlock}
            title="Teacher override: reopen this player's bet"
            className={`${btnBase} bg-black/10 dark:bg-black/40 text-rose-800 dark:text-rose-300 border-rose-400/50 hover:border-rose-400`}
          >
            🔓 Unlock
          </button>
        )}
      </div>
    </div>
  );
};
