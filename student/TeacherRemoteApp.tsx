// Package T3: the teacher's phone as a remote. It joins the room like a phone, with the one-time
// key in its avatar, and shows only what the teacher's screen sends it. Every button asks the
// teacher's screen to press the same button as a keyboard shortcut; nothing happens here.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StudentRoomController } from '../services/multiplayerService';
import type { PlayerViewPayload } from '../utils/multiplayerProtocol';
import { safeLocalStorage } from '../utils/safeStorage';
import {
  REMOTE_PHONE_STORAGE_KEY,
  remoteAvatar,
  remoteName,
  savedRemoteToken,
  type RemoteAction,
  type TeacherRemoteView,
} from '../game/teacherRemote';

const bigBtn =
  'w-full min-h-[72px] rounded-gc-lg bg-gc-gold text-gc-on-gold text-gc-lead font-extrabold px-4 cursor-pointer disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-ink';
const btn =
  'min-h-[56px] rounded-gc border border-gc-line/[0.2] bg-gc-line/[0.05] text-gc-body font-bold text-gc-ink px-3 cursor-pointer disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-turn';

// The page joins once, even when React runs its first effect twice (StrictMode): a second join
// would take a second seat, and the teacher's screen accepts only one remote.
const listeners: {
  view: (v: PlayerViewPayload) => void;
  kicked: () => void;
  connection: (c: boolean) => void;
  waiting: () => void;
} = { view: () => {}, kicked: () => {}, connection: () => {}, waiting: () => {} };
let joining: Promise<StudentRoomController> | null = null;

function joinOnce(roomCode: string, remoteKey: string): Promise<StudentRoomController> {
  if (joining) return joining;
  const code = roomCode.trim().toUpperCase();
  joining = StudentRoomController.joinRoom({
    code,
    name: remoteName(remoteKey),
    avatar: remoteAvatar(remoteKey),
    reconnectToken: savedRemoteToken(safeLocalStorage.getItem(REMOTE_PHONE_STORAGE_KEY), code, remoteKey),
    onViewUpdate: (v) => listeners.view(v),
    onKicked: () => {
      safeLocalStorage.removeItem(REMOTE_PHONE_STORAGE_KEY);
      listeners.kicked();
    },
    onConnectionChange: (c) => listeners.connection(c),
    onWaitingForTeacher: () => listeners.waiting(),
  }).then((ctrl) => {
    safeLocalStorage.setItem(REMOTE_PHONE_STORAGE_KEY, JSON.stringify({ code: ctrl.code, key: remoteKey, token: ctrl.seat.reconnectToken }));
    return ctrl;
  });
  joining.catch(() => {
    joining = null;
  });
  return joining;
}

export default function TeacherRemoteApp({ roomCode, remoteKey }: { roomCode: string; remoteKey: string }) {
  const [view, setView] = useState<TeacherRemoteView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);
  const [sending, setSending] = useState<RemoteAction | null>(null);
  const controllerRef = useRef<StudentRoomController | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', safeLocalStorage.getItem('grammar_casino_theme') !== 'light');
    let cancelled = false;
    listeners.view = (v) => !cancelled && setView(v.remote ?? null);
    listeners.kicked = () => !cancelled && setError('The room was closed.');
    listeners.connection = (c) => !cancelled && setConnected(c);
    listeners.waiting = () => !cancelled && setError('This link is not active. Make a new remote link on the teacher’s screen.');
    joinOnce(roomCode, remoteKey)
      .then((ctrl) => {
        if (!cancelled) controllerRef.current = ctrl;
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not reach the room.');
      });
    return () => {
      cancelled = true;
    };
  }, [roomCode, remoteKey]);

  const send = useCallback(async (action: RemoteAction) => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    setSending(action);
    try {
      await ctrl.sendIntent({ type: 'REMOTE_COMMAND', action });
    } finally {
      window.setTimeout(() => setSending(null), 400);
    }
  }, []);

  const ended = view?.ended;
  const live = view && !ended ? view : null;

  return (
    <main className="min-h-[100dvh] bg-gc-bg text-gc-ink font-sans px-4 py-5 max-w-md mx-auto space-y-4" data-testid="teacher-remote">
      <header className="flex items-baseline justify-between gap-3">
        <h1 className="font-logo text-gc-title font-bold">Teacher remote</h1>
        <span className="text-gc-small text-gc-quiet">Room {roomCode.toUpperCase()}</span>
      </header>
      {!connected && <p className="text-gc-small text-gc-loss">Reconnecting…</p>}

      {error ? (
        <p className="gc-surface rounded-gc p-4 text-gc-body" role="alert">{error}</p>
      ) : ended ? (
        <p className="gc-surface rounded-gc p-4 text-gc-body" role="alert" data-testid="remote-ended">
          This phone is no longer the remote. Make a new remote link on the teacher’s screen to pair again.
        </p>
      ) : !live ? (
        <p className="text-gc-body text-gc-quiet">Connecting to the teacher’s screen…</p>
      ) : (
        <>
          <section className="gc-surface rounded-gc-lg p-4 space-y-2">
            <p className="text-gc-small text-gc-quiet" data-testid="remote-round">
              {live.step === 'GAME_OVER' ? 'Game over' : `Hand ${live.round}${live.totalRounds ? ` of ${live.totalRounds}` : ''}`}
              {live.paused ? ' · Paused' : ''}
            </p>
            {live.sentence && <p className="font-sentence text-gc-lead leading-snug">{live.sentence}</p>}
            {live.answer && (
              <p className="text-gc-body font-bold text-gc-win" data-testid="remote-answer">
                Answer: {live.answer}
              </p>
            )}
            {live.explanation && <p className="text-gc-small text-gc-quiet">{live.explanation}</p>}
          </section>

          {live.step === 'IN_GAME' && (
            <section className="gc-surface rounded-gc-lg p-4 space-y-1" data-testid="remote-waiting">
              <p className="text-gc-body font-bold">
                {live.lockedIn} of {live.seated} locked in
              </p>
              {live.waitingFor.length > 0 && <p className="text-gc-small text-gc-quiet">Still deciding: {live.waitingFor.join(', ')}</p>}
            </section>
          )}
          {live.away.length > 0 && <p className="text-gc-small text-gc-loss">Away: {live.away.join(', ')}</p>}
          {live.reactions && (live.reactions.gotIt > 0 || live.reactions.confused > 0) && (
            <p className="text-gc-small" data-testid="remote-reactions">
              Got it: {live.reactions.gotIt} · Still confused: {live.reactions.confused}
            </p>
          )}

          <button type="button" className={bigBtn} onClick={() => void send('primary')} disabled={sending !== null || live.step === 'GAME_OVER'} data-testid="remote-primary">
            {live.primaryLabel}
          </button>
          {live.notice && <p className="text-gc-small text-gc-loss" role="status">{live.notice}</p>}

          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={btn} onClick={() => void send('pause')} disabled={sending !== null}>
              {live.paused ? 'Resume' : 'Pause'}
            </button>
            <button type="button" className={btn} onClick={() => void send('read')} disabled={sending !== null}>
              Read aloud
            </button>
            {live.step === 'IN_GAME' && (
              <>
                <button type="button" className={btn} onClick={() => void send('reveal-now')} disabled={sending !== null}>
                  Reveal now
                </button>
                <button type="button" className={btn} onClick={() => void send('swap')} disabled={sending !== null}>
                  Swap sentence
                </button>
                <button type="button" className={btn} onClick={() => void send('timer')} disabled={sending !== null}>
                  Start timer
                </button>
                <button type="button" className={btn} onClick={() => void send('add-time')} disabled={sending !== null}>
                  Add time
                </button>
              </>
            )}
            {live.step === 'RESULTS' && (
              <button type="button" className={btn} onClick={() => void send('undo-reveal')} disabled={sending !== null}>
                Undo reveal
              </button>
            )}
          </div>
        </>
      )}
    </main>
  );
}
