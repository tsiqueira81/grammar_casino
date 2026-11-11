import React from 'react';
import { Check, Lock, LockOpen, Pause, Play, Plus, RotateCcw, Timer as TimerIcon } from 'lucide-react';
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

// Style A buttons for the timer strips. Plain labels; one gold button per strip.
const btnBase = 'h-9 px-4 rounded-full text-gc-small font-bold inline-flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer select-none active:scale-95 disabled:cursor-not-allowed disabled:active:scale-100';
const btnPrimary = `${btnBase} gc-btn-primary hover:brightness-105`;
const btnGhost = `${btnBase} bg-gc-line/[0.06] border border-gc-line/[0.16] text-gc-ink hover:bg-gc-line/[0.1] hover:border-gc-line/30`;
const btnDanger = `${btnBase} bg-gc-danger/[0.08] border border-gc-danger/40 text-gc-danger hover:border-gc-danger/70`;
const iconCls = 'w-4 h-4 shrink-0';

/** Teacher-facing control strip for a player's betting turn. */
export const TurnTimerControls: React.FC<TurnTimerControlsProps> = ({
  timer, remainingMs, isWarning, isFrozen, isSatOut, blockedByName,
  onStart, onPause, onAddTime, onLockNow, onUnlock,
}) => {
  const status = timer?.status ?? 'idle';
  const held = status === 'running' && !!timer?.held;
  const bonusSeconds = TURN_TIMER_BONUS_MS / 1000;

  let label: string;
  let labelClass = 'text-gc-quiet';
  if (status === 'idle') {
    label = blockedByName ? `Waiting for ${blockedByName} to finish` : 'Not started yet';
  } else if (status === 'running') {
    label = held ? 'On hold while a hint or window is open' : isWarning ? 'Last few seconds' : 'Betting now';
    labelClass = held ? 'text-gc-info' : isWarning ? 'text-gc-loss' : 'text-gc-win';
  } else if (status === 'paused') {
    label = 'Paused';
    labelClass = 'text-gc-info';
  } else if (timer?.skipped || isFrozen) {
    label = 'Frozen this hand';
    labelClass = 'text-gc-info';
  } else if (isSatOut) {
    label = 'Sat out (no bet)';
    labelClass = 'text-gc-loss';
  } else {
    label = 'Locked in';
    labelClass = 'text-gc-win';
  }

  const clockClass =
    status === 'locked' ? 'text-gc-quiet'
    : isWarning ? 'text-gc-loss animate-pulse'
    : status === 'paused' || held ? 'text-gc-info'
    : 'text-gc-money';

  const frameClass = isWarning
    ? 'border-gc-loss/60 bg-gc-loss/[0.06]'
    : status === 'running' && !held
      ? 'border-gc-win/40 bg-gc-win/[0.05]'
      : 'border-gc-line/[0.12] bg-gc-line/[0.05]';

  return (
    <div
      className={`mb-5 -mt-1 px-4 py-3 rounded-gc border flex flex-wrap items-center justify-between gap-3 transition-colors ${frameClass}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="w-9 h-9 rounded-full grid place-items-center bg-gc-line/[0.07] text-gc-quiet shrink-0" aria-hidden="true">
          {status === 'locked' ? <Lock className={iconCls} /> : <TimerIcon className={iconCls} />}
        </span>
        <div className="flex flex-col min-w-0">
          <span className="text-gc-cap font-semibold text-gc-quiet">Turn timer</span>
          <span className={`text-gc-small font-bold truncate ${labelClass}`}>{label}</span>
        </div>
        <span data-testid="turn-timer-remaining" className={`text-gc-title tabular-nums font-extrabold tracking-tight ${clockClass}`} aria-live="off">
          {formatClock(remainingMs)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(status === 'idle' || status === 'paused') && (
          <button
            type="button"
            onClick={onStart}
            data-hotkey="timer"
            disabled={status === 'idle' && !!blockedByName}
            title={status === 'idle' && blockedByName ? `Finish ${blockedByName}'s turn first` : status === 'paused' ? 'Resume the countdown' : 'Start this player\'s betting turn'}
            className={btnPrimary}
          >
            <Play className={iconCls} fill="currentColor" aria-hidden="true" />
            {status === 'paused' ? 'Resume' : 'Start turn'}
          </button>
        )}
        {status === 'running' && (
          <button type="button" onClick={onPause} title="Pause the countdown" className={btnGhost}>
            <Pause className={iconCls} aria-hidden="true" />
            Pause
          </button>
        )}
        {(status === 'running' || status === 'paused') && (
          <>
            <button type="button" data-hotkey="add-time" onClick={onAddTime} title={`Add ${bonusSeconds} seconds`} className={btnGhost}>
              <Plus className={iconCls} aria-hidden="true" />
              {bonusSeconds} s
            </button>
            <button
              type="button"
              onClick={onLockNow}
              title="End this turn now and lock the bet"
              className={status === 'running' ? btnPrimary : btnGhost}
            >
              <Lock className={iconCls} aria-hidden="true" />
              Lock in
            </button>
          </>
        )}
        {status === 'locked' && !isFrozen && (
          <button type="button" onClick={onUnlock} title="Teacher override: reopen this player's bet" className={btnDanger}>
            <LockOpen className={iconCls} aria-hidden="true" />
            Unlock
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
  const bonusSeconds = TURN_TIMER_BONUS_MS / 1000;
  const lockedText = `${lockedCount} of ${totalActivePlayers} locked in`;

  let subtitle: string;
  let subtitleClass = 'text-gc-quiet';
  if (allPlayersLocked) {
    subtitle = `All ${totalActivePlayers} players are locked in. Ready to reveal.`;
    subtitleClass = 'text-gc-win';
  } else if (status === 'running') {
    if (held) {
      subtitle = 'On hold while a hint or window is open';
      subtitleClass = 'text-gc-info';
    } else if (isWarning) {
      subtitle = 'Last few seconds. Lock in your bets now.';
      subtitleClass = 'text-gc-loss';
    } else {
      subtitle = 'Everyone is betting at the same time';
      subtitleClass = 'text-gc-win';
    }
  } else if (status === 'paused') {
    subtitle = 'Paused';
    subtitleClass = 'text-gc-info';
  } else if (status === 'locked') {
    subtitle = "Time's up. Betting is closed.";
    subtitleClass = 'text-gc-loss';
  } else {
    subtitle = `Betting is open. Start the ${turnTimerSeconds}-second countdown when you're ready.`;
  }

  const clockClass =
    allPlayersLocked
      ? 'text-gc-win'
      : status === 'locked'
        ? 'text-gc-loss'
        : isWarning
          ? 'text-gc-loss animate-pulse'
          : status === 'paused' || held
            ? 'text-gc-info'
            : 'text-gc-money';

  const barColor =
    allPlayersLocked
      ? 'bg-gc-win'
      : status === 'locked'
        ? 'bg-gc-loss'
        : isWarning
          ? 'bg-gc-loss animate-pulse'
          : status === 'paused' || held
            ? 'bg-gc-info'
            : 'bg-gc-gold';

  const frameClass =
    isWarning && !allPlayersLocked
      ? '!border-gc-loss/60'
      : allPlayersLocked
        ? '!border-gc-win/50'
        : status === 'running' && !held
          ? '!border-gc-win/35'
          : '';

  return (
    <div className={`gc-surface mb-5 p-4 sm:px-6 rounded-gc transition-colors flex flex-col gap-3 ${frameClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Left: what the timer is doing */}
        <div className="flex items-center gap-3.5 min-w-0">
          <span
            className={`w-12 h-12 rounded-gc-sm grid place-items-center shrink-0 bg-gc-line/[0.07] ${
              allPlayersLocked ? 'text-gc-win' : isWarning || status === 'locked' ? 'text-gc-loss' : 'text-gc-quiet'
            }`}
            aria-hidden="true"
          >
            {allPlayersLocked ? <Check className="w-6 h-6" strokeWidth={3} /> : status === 'locked' ? <Lock className="w-6 h-6" /> : <TimerIcon className="w-6 h-6" />}
          </span>
          <div className="flex flex-col min-w-0 gap-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-gc-body font-bold text-gc-ink">Round timer · {turnTimerSeconds} s</h2>
              <span className="h-6 px-2.5 inline-flex items-center gap-1 rounded-full text-gc-cap tabular-nums font-semibold bg-gc-line/[0.07] text-gc-quiet">
                <Lock className="w-3 h-3" aria-hidden="true" />
                {lockedText}
              </span>
            </div>
            <span className={`text-gc-small font-semibold ${subtitleClass}`}>{subtitle}</span>
          </div>
        </div>

        {/* Right: the clock and the teacher's controls */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 ml-auto">
          <div className="flex items-baseline gap-2">
            <span className="text-gc-cap font-semibold text-gc-quiet">Time left</span>
            <span data-testid="host-round-clock" className={`text-gc-display tabular-nums font-extrabold tracking-tight ${clockClass}`} aria-live="off">
              {formatClock(remainingMs)}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(status === 'idle' || status === 'paused') && !allPlayersLocked && (
              <button type="button" data-hotkey="timer" onClick={onStart} className={btnPrimary}>
                <Play className={iconCls} fill="currentColor" aria-hidden="true" />
                {status === 'paused' ? 'Resume' : 'Start timer'}
              </button>
            )}
            {status === 'running' && (
              <button type="button" onClick={onPause} className={btnGhost}>
                <Pause className={iconCls} aria-hidden="true" />
                Pause
              </button>
            )}
            {(status === 'running' || status === 'paused' || status === 'locked') && (
              <button
                type="button"
                onClick={onAddTime}
                data-hotkey="add-time"
                title={`Add ${bonusSeconds} seconds to the round timer`}
                className={btnGhost}
              >
                <Plus className={iconCls} aria-hidden="true" />
                {bonusSeconds} s
              </button>
            )}
            {(status === 'running' || status === 'paused') && (
              <button
                type="button"
                onClick={onLockNow}
                title="End the round timer now and close betting"
                className={btnGhost}
              >
                <Lock className={iconCls} aria-hidden="true" />
                End timer
              </button>
            )}
            {(status === 'locked' || status === 'paused') && (
              <button
                type="button"
                onClick={onReset}
                title="Reset and reopen the round timer for all players"
                className={btnGhost}
              >
                {status === 'locked' ? <LockOpen className={iconCls} aria-hidden="true" /> : <RotateCcw className={iconCls} aria-hidden="true" />}
                {status === 'locked' ? 'Reopen betting' : 'Reset'}
              </button>
            )}
            <button
              type="button"
              onClick={onToggleAutoStart}
              aria-pressed={autoStartTimer}
              className={`${btnBase} border ${
                autoStartTimer
                  ? 'bg-gc-gold/15 border-gc-gold/50 text-gc-money'
                  : 'bg-gc-line/[0.06] border-gc-line/[0.14] text-gc-quiet'
              }`}
              title="Start the round timer by itself when each hand is dealt"
            >
              Timer starts by itself: {autoStartTimer ? 'on' : 'off'}
            </button>
            {onOpenAiSettings && aiStatusLabel && (
              <button
                type="button"
                onClick={onOpenAiSettings}
                className={btnGhost}
                title="AI and offline settings"
              >
                {aiStatusLabel}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* The time left, as a bar */}
      <div className="w-full h-2 rounded-full bg-gc-line/[0.1] overflow-hidden" aria-hidden="true">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-gc-fast`}
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
  const hurry = isWarning && !lockedIn && !isTimeUp;
  const done = lockedIn || isTimeUp;

  const label = isTimeUp
    ? lockedIn
      ? "Time's up"
      : "Time's up · the teacher reopened betting"
    : status === 'paused' || held
      ? 'Timer paused'
      : status === 'running'
        ? hurry
          ? 'Hurry, lock in'
          : 'Time left'
        : 'Round timer';

  return (
    <div
      role="timer"
      aria-live="off"
      className={`gc-surface rounded-gc px-4 py-3 flex flex-col gap-2 transition-colors ${
        hurry ? 'border-gc-loss/70 bg-gc-loss/[0.06]' : lockedIn && !isTimeUp ? 'border-gc-win/50' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={`inline-flex items-center gap-1.5 text-gc-small font-bold ${
            hurry ? 'text-gc-loss' : lockedIn && !isTimeUp ? 'text-gc-win' : 'text-gc-quiet'
          }`}
        >
          {isTimeUp ? (
            <Lock className={iconCls} aria-hidden />
          ) : status === 'paused' || held ? (
            <Pause className={iconCls} aria-hidden />
          ) : lockedIn ? (
            <Check className={iconCls} aria-hidden />
          ) : (
            <TimerIcon className={iconCls} aria-hidden />
          )}
          {label}
        </span>
        <span
          className={`tabular-nums font-extrabold text-gc-title ${
            isTimeUp ? 'text-gc-quiet' : hurry ? 'text-gc-loss animate-gc-blink' : 'text-gc-ink'
          }`}
        >
          {formatClock(remainingMs)}
        </span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-gc-line/60 overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-gc-fast ${
            hurry ? 'bg-gc-loss' : done ? 'bg-gc-win' : 'bg-gc-gold'
          }`}
          style={{ width: `${Math.max(0, Math.min(100, Math.round(fraction * 100)))}%` }}
        />
      </div>
    </div>
  );
};
