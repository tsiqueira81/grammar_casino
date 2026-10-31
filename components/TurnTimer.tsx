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

const btnBase = 'px-2.5 py-1.5 rounded-lg text-[10px] sm:text-[11px] font-sans font-extrabold uppercase tracking-wider border transition-all cursor-pointer select-none disabled:opacity-40 disabled:cursor-not-allowed active:scale-95';

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
          <span className="text-[9px] font-sans uppercase tracking-[0.2em] text-amber-900/70 dark:text-amber-200/60 font-bold">Turn Clock</span>
          <span className={`text-[11px] font-sans font-bold truncate ${labelClass}`}>{label}</span>
        </div>
        <span className={`font-sans tabular-nums font-extrabold text-2xl tabular-nums tracking-tight ${clockClass}`} aria-live="off">
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

interface MultiplayerRoundTimerFrameProps {
  timer: PlayerTurnTimer | undefined;
  turnDurationMs: number;
  turnTimerSeconds: number;
  allPlayersLocked: boolean;
  lockedCount: number;
  totalActivePlayers: number;
  autoStartTimer: boolean;
  onToggleAutoStart: () => void;
  onStart: () => void;
  onPause: () => void;
  onAddTime: () => void;
  onLockNow: () => void;
  onReset: () => void;
  onOpenAiSettings?: () => void;
  aiStatusLabel?: string;
  playSound?: (sound: SoundEffect) => void;
}

/**
 * Shared Round Timer frame displayed on the Host/Projector in Multiplayer mode
 * instead of the Turn Sequence frame, since all players bet simultaneously.
 */
export const MultiplayerRoundTimerFrame: React.FC<MultiplayerRoundTimerFrameProps> = ({
  timer,
  turnDurationMs,
  turnTimerSeconds,
  allPlayersLocked,
  lockedCount,
  totalActivePlayers,
  autoStartTimer,
  onToggleAutoStart,
  onStart,
  onPause,
  onAddTime,
  onLockNow,
  onReset,
  onOpenAiSettings,
  aiStatusLabel,
  playSound,
}) => {
  const { remainingMs, fraction, isWarning } = useTurnCountdown(timer, turnDurationMs, playSound);
  const status = timer?.status ?? 'idle';
  const held = status === 'running' && !!timer?.held;

  let subtitle: string;
  let subtitleClass = 'text-amber-800 dark:text-amber-200/80';
  if (allPlayersLocked) {
    subtitle = `All ${totalActivePlayers} Players Locked In · Ready to Reveal!`;
    subtitleClass = 'text-emerald-700 dark:text-emerald-300';
  } else if (status === 'running') {
    if (held) {
      subtitle = 'Clock Held · Modal or Hint Open';
      subtitleClass = 'text-sky-700 dark:text-sky-300';
    } else if (isWarning) {
      subtitle = 'Final Seconds! Lock In Your Wagers Now!';
      subtitleClass = 'text-rose-600 dark:text-rose-400 animate-pulse';
    } else {
      subtitle = `All Players Betting Simultaneously (${lockedCount}/${totalActivePlayers} Locked)`;
      subtitleClass = 'text-emerald-700 dark:text-emerald-300';
    }
  } else if (status === 'paused') {
    subtitle = `Timer Paused by Teacher (${lockedCount}/${totalActivePlayers} Locked)`;
    subtitleClass = 'text-sky-700 dark:text-sky-300';
  } else if (status === 'locked') {
    subtitle = "Time's Up · Round Betting Closed";
    subtitleClass = 'text-rose-700 dark:text-rose-300';
  } else {
    subtitle = `Simultaneous Betting Open · Click Start for ${turnTimerSeconds}s Countdown`;
  }

  const clockClass =
    allPlayersLocked
      ? 'text-emerald-600 dark:text-emerald-400'
      : status === 'locked'
        ? 'text-rose-600 dark:text-rose-400'
        : isWarning
          ? 'text-rose-600 dark:text-rose-400 animate-pulse drop-shadow-[0_0_12px_rgba(244,63,94,0.65)]'
          : status === 'paused' || held
            ? 'text-sky-700 dark:text-sky-300'
            : 'text-amber-900 dark:text-[#fef08a] drop-shadow-[0_0_10px_rgba(212,175,55,0.35)]';

  const barColor =
    allPlayersLocked
      ? 'from-emerald-400 via-emerald-500 to-emerald-600'
      : status === 'locked'
        ? 'from-rose-500 to-rose-700'
        : isWarning
          ? 'from-rose-500 via-red-500 to-amber-500 animate-pulse'
          : status === 'paused' || held
            ? 'from-sky-400 to-sky-600'
            : fraction < 0.35
              ? 'from-amber-400 to-orange-500'
              : 'from-[#fef08a] via-[#d4af37] to-emerald-500';

  return (
    <div
      className={`mb-5 p-4 sm:px-6 rounded-2xl glass-panel border-2 transition-all flex flex-col gap-3 ${
        isWarning && !allPlayersLocked
          ? 'border-rose-500 shadow-[0_0_25px_rgba(244,63,94,0.35)]'
          : allPlayersLocked
            ? 'border-emerald-500/80 shadow-[0_0_20px_rgba(16,185,129,0.25)]'
            : status === 'running' && !held
              ? 'border-emerald-500/60 shadow-[0_0_18px_rgba(16,185,129,0.18)]'
              : 'border-[#d4af37]/60'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Left: Label + Big Shared Countdown Clock */}
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl felt-well border border-[#d4af37]/50 flex items-center justify-center text-2xl sm:text-3xl select-none shrink-0">
            {allPlayersLocked ? '✅' : status === 'locked' ? '🔒' : isWarning ? '🚨' : '⏱️'}
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] sm:text-xs font-sans font-extrabold uppercase tracking-[0.22em] text-amber-900 dark:text-[#d4af37]">
                Shared Round Timer ({turnTimerSeconds}s)
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-sans tabular-nums font-bold bg-amber-500/15 border border-[#d4af37]/40 text-amber-900 dark:text-[#fef08a]">
                🔒 {lockedCount}/{totalActivePlayers} Locked
              </span>
            </div>
            <span className={`text-xs sm:text-sm font-sans font-bold truncate ${subtitleClass}`}>
              {subtitle}
            </span>
          </div>
        </div>

        {/* Center/Right: Giant Digital Clock Display + Teacher Controls */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 ml-auto">
          <div className="px-4 py-1.5 rounded-2xl felt-well border border-[#d4af37]/50 flex items-center gap-2">
            <span className="text-[10px] font-sans uppercase tracking-widest text-amber-800/80 dark:text-amber-200/70 font-bold">
              Time Left
            </span>
            <span
              className={`font-sans tabular-nums font-black text-3xl sm:text-4xl tabular-nums tracking-tight ${clockClass}`}
              aria-live="off"
            >
              {formatClock(remainingMs)}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(status === 'idle' || status === 'paused') && !allPlayersLocked && (
              <button
                type="button"
                onClick={onStart}
                className={`${btnBase} bg-gradient-to-b from-emerald-500 to-emerald-700 text-white border-emerald-300/80 shadow-[0_2px_0_#064e3b] px-3.5 py-2 text-xs`}
              >
                ▶ {status === 'paused' ? 'Resume' : 'Start Timer'}
              </button>
            )}
            {status === 'running' && (
              <button
                type="button"
                onClick={onPause}
                className={`${btnBase} bg-gradient-to-b from-sky-500 to-sky-700 text-white border-sky-300/70 shadow-[0_2px_0_#0c4a6e] px-3 py-2 text-xs`}
              >
                ⏸ Pause
              </button>
            )}
            {(status === 'running' || status === 'paused' || status === 'locked') && (
              <button
                type="button"
                onClick={onAddTime}
                title={`Add ${TURN_TIMER_BONUS_MS / 1000} seconds to the round timer`}
                className={`${btnBase} bg-black/10 dark:bg-black/40 text-amber-900 dark:text-[#fef08a] border-[#d4af37]/60 hover:border-[#d4af37] px-3 py-2 text-xs`}
              >
                +{TURN_TIMER_BONUS_MS / 1000}s
              </button>
            )}
            {(status === 'running' || status === 'paused') && (
              <button
                type="button"
                onClick={onLockNow}
                title="End the round timer immediately and lock betting"
                className={`${btnBase} bg-black/10 dark:bg-black/40 text-slate-800 dark:text-slate-200 border-slate-400/50 hover:border-slate-300 px-3 py-2 text-xs`}
              >
                🔒 End Timer
              </button>
            )}
            {(status === 'locked' || status === 'paused') && (
              <button
                type="button"
                onClick={onReset}
                title="Reset and reopen the round timer for all players"
                className={`${btnBase} bg-black/10 dark:bg-black/40 text-amber-900 dark:text-[#fef08a] border-[#d4af37]/60 hover:border-[#d4af37] px-3 py-2 text-xs`}
              >
                {status === 'locked' ? '🔓 Reopen Timer' : '↺ Reset'}
              </button>
            )}
            <button
              type="button"
              onClick={onToggleAutoStart}
              className={`px-3 py-2 rounded-lg text-[10px] sm:text-[11px] font-sans font-bold uppercase tracking-wider border transition-all cursor-pointer ${
                autoStartTimer
                  ? 'bg-amber-500/20 border-[#d4af37] text-amber-900 dark:text-[#fef08a]'
                  : 'felt-well text-slate-600 dark:text-slate-300 border-slate-400/40'
              }`}
              title="Automatically start the shared round timer when each hand is dealt"
            >
              Auto-Start: {autoStartTimer ? 'ON' : 'OFF'}
            </button>
            {onOpenAiSettings && aiStatusLabel && (
              <button
                type="button"
                onClick={onOpenAiSettings}
                className="px-3 py-1.5 bg-white/80 dark:bg-[#051c10] border border-[#d4af37]/50 hover:border-[#d4af37] rounded-full text-xs font-sans text-slate-800 dark:text-amber-50 flex items-center gap-1.5 shadow-sm font-medium cursor-pointer transition-all hover:scale-105"
                title="Click to view AI & Offline Settings"
              >
                <span>{aiStatusLabel}</span>
                <span className="text-[10px] text-amber-600 dark:text-amber-400">⚙️</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Full-width Countdown Progress Bar */}
      <div className="w-full h-2.5 rounded-full bg-black/15 dark:bg-black/50 overflow-hidden p-0.5 border border-[#d4af37]/25">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-200`}
          style={{ width: `${Math.max(0, Math.min(100, Math.round(fraction * 100)))}%` }}
        />
      </div>
    </div>
  );
};

/**
 * Compact live round countdown bar displayed on Student Mobile Controllers
 * when the teacher has enabled a Round Timer in Multiplayer mode.
 */
export const StudentRoundTimerBar: React.FC<{
  timer: PlayerTurnTimer | undefined;
  turnDurationMs: number;
  lockedIn: boolean;
}> = ({ timer, turnDurationMs, lockedIn }) => {
  const { remainingMs, fraction, isWarning } = useTurnCountdown(timer, turnDurationMs);
  const status = timer?.status ?? 'idle';
  const held = status === 'running' && !!timer?.held;
  const isTimeUp =
    status === 'locked' ||
    (status === 'running' && !held && remainingMs <= 0) ||
    (status === 'paused' && remainingMs <= 0);

  return (
    <div
      className={`p-3 rounded-2xl glass-panel border transition-all flex flex-col gap-2 ${
        isWarning && !lockedIn && !isTimeUp
          ? 'border-rose-500 shadow-[0_0_16px_rgba(244,63,94,0.3)]'
          : lockedIn || isTimeUp
            ? 'border-emerald-500/60'
            : 'border-[#d4af37]/50'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-base">{lockedIn ? (isTimeUp ? '🔒' : '✅') : isTimeUp ? '🔒' : isWarning ? '🚨' : '⏱️'}</span>
          <span className="text-xs font-sans font-extrabold uppercase tracking-wider text-amber-900 dark:text-[#fef08a]">
            {isTimeUp
              ? lockedIn
                ? "Time's Up · Round Closed"
                : "Time's Up · Unlocked by Teacher"
              : status === 'paused' || held
                ? 'Round Timer Paused'
                : status === 'running'
                  ? isWarning
                    ? 'Hurry! Lock In Your Wager!'
                    : 'Round Timer Running'
                  : 'Round Timer Ready'}
          </span>
        </div>
        <span
          className={`font-sans tabular-nums font-black text-xl tabular-nums ${
            isTimeUp
              ? 'text-rose-600 dark:text-rose-400'
              : isWarning && !lockedIn
                ? 'text-rose-600 dark:text-rose-400 animate-pulse'
                : 'text-amber-900 dark:text-[#fef08a]'
          }`}
        >
          {formatClock(remainingMs)}
        </span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-black/15 dark:bg-black/50 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-200 ${
            isWarning && !lockedIn && !isTimeUp
              ? 'bg-rose-500 animate-pulse'
              : lockedIn || isTimeUp
                ? 'bg-emerald-500'
                : 'bg-gradient-to-r from-[#fef08a] via-[#d4af37] to-emerald-500'
          }`}
          style={{ width: `${Math.max(0, Math.min(100, Math.round(fraction * 100)))}%` }}
        />
      </div>
    </div>
  );
};

