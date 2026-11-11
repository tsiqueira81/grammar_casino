import React, { useEffect, useState } from 'react';
import { useFocusTrap } from '../utils/useFocusTrap';
import QRCode from 'qrcode';
import { Player, SoundEffect } from '../types';
import { MultiplayerSeat } from '../utils/multiplayerProtocol';
import ActionButton from './ActionButton';
import { PlayerAvatar } from './PlayerAvatar';
import { Check, Copy, Lock, LockOpen, Smartphone, X } from 'lucide-react';
import { lobbyTipAt, missingFromClass } from '../game/classList';

interface MultiplayerLobbyModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string | null;
  roomLocked: boolean;
  hostConnected: boolean;
  seats: Record<number, MultiplayerSeat>;
  players: Player[];
  onCreateRoom: () => void;
  onCloseRoom: () => void;
  onToggleLockRoom: () => void;
  onKickPlayer: (playerId: number) => void;
  onBailoutBankruptPlayers: () => void;
  /** Package T4: the loaded class, so students not on a phone yet show as "Not here yet". */
  classListName?: string | null;
  /** Package T3: open the teacher-remote pairing, with the address phones use. */
  onOpenRemote?: (baseUrl: string) => void;
  remotePaired?: boolean;
  playSound: (sound: SoundEffect, ...args: any[]) => void;
}

export const MultiplayerLobbyModal: React.FC<MultiplayerLobbyModalProps> = ({
  isOpen,
  onClose,
  roomCode,
  roomLocked,
  hostConnected,
  seats,
  players,
  onCreateRoom,
  onCloseRoom,
  onToggleLockRoom,
  onKickPlayer,
  onBailoutBankruptPlayers,
  classListName = null,
  onOpenRemote,
  remotePaired = false,
  playSound,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);
  // The public production site; on it the "Public website" choice is pointless.
  const PUBLIC_SITE_URL = 'https://grammarcasino.pages.dev/';
  const isPublicHost =
    typeof window !== 'undefined' && window.location.hostname === 'grammarcasino.pages.dev';
  const isFileProtocol =
    typeof window !== 'undefined' && window.location.protocol === 'file:';
  const isAiStudioHost =
    typeof window !== 'undefined' &&
    (window.location.hostname.startsWith('ais-dev-') ||
      window.location.hostname.startsWith('ais-pre-') ||
      window.location.hostname.endsWith('.run.app'));

  // Default to the public website when running inside Electron (file:) or AI Studio private preview (ais-dev-)
  // because ais-dev-*.run.app is locked to the owner's Google account and returns 403 on other devices.
  const [usePublicUrl, setUsePublicUrl] = useState<boolean>(
    () => isFileProtocol || isAiStudioHost
  );

  // If the teacher chooses the current host while inside AI Studio's private `ais-dev-` preview,
  // automatically convert `ais-dev-` to the shareable `ais-pre-` origin so other devices aren't blocked by dev-only auth.
  const sharedCurrentOrigin =
    typeof window !== 'undefined'
      ? `${window.location.origin.replace('://ais-dev-', '://ais-pre-')}${window.location.pathname}`
      : '';

  const baseOrigin =
    usePublicUrl || isFileProtocol
      ? PUBLIC_SITE_URL
      : sharedCurrentOrigin;

  const joinUrl = roomCode ? `${baseOrigin}?room=${roomCode}` : '';
  /** The address in large type: "grammarcasino.pages.dev". */
  const joinHost = baseOrigin.replace(/^https?:\/\//, '').replace(/\/$/, '');

  // Package T4: a grammar tip that changes every few seconds while students join.
  const [tipStartedAt] = useState(() => Date.now());
  const [tipNow, setTipNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setInterval(() => setTipNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isOpen]);
  const tip = lobbyTipAt(tipNow - tipStartedAt);

  useEffect(() => {
    if (!roomCode || !joinUrl) {
      setQrDataUrl('');
      return;
    }
    QRCode.toDataURL(joinUrl, {
      width: 260,
      margin: 2,
      color: {
        dark: '#051a0f',
        light: '#fffdf7',
      },
    })
      .then(setQrDataUrl)
      .catch((err) => console.error('QR generation failed:', err));
  }, [roomCode, joinUrl]);

  // Package S8: the keyboard stays in this window while it is open.
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef, isOpen);
  if (!isOpen) return null;

  const handleCopyJoinLink = () => {
    if (!joinUrl) return;
    navigator.clipboard.writeText(joinUrl).then(() => {
      playSound('click');
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  const seatList = Object.values(seats) as MultiplayerSeat[];
  const bankruptCount = players.filter(p => p.money <= 0).length;
  const connectedCount = seatList.filter(s => s.connected).length;
  const missing = classListName ? missingFromClass(players, seatList.map(s => s.playerId)) : [];
  const ghostBtn = 'h-11 px-4 rounded-full border border-gc-line/[0.2] bg-gc-line/[0.05] hover:border-gc-line/40 text-gc-small font-bold text-gc-ink transition-colors cursor-pointer inline-flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-turn';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 dark:bg-black/75 backdrop-blur-sm animate-gc-fade"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Live room"
        className="gc-panel rounded-gc-lg max-w-6xl w-full p-5 sm:p-6 relative max-h-[92vh] overflow-y-auto modal-content-scroll text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 mb-5 border-b border-gc-line/[0.12]">
          <div className="min-w-0">
            <p className="text-gc-small text-gc-quiet">Phones join here</p>
            <h2 className="font-logo text-gc-title sm:text-gc-display font-bold text-gc-ink">Live room</h2>
          </div>
          <button
            type="button"
            onClick={() => {
              playSound('click');
              onClose();
            }}
            className="w-10 h-10 shrink-0 rounded-full bg-gc-line/[0.06] hover:bg-gc-line/[0.12] text-gc-quiet hover:text-gc-ink grid place-items-center transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {!roomCode ? (
          <div className="gc-surface rounded-gc-lg p-6 sm:p-8 text-center space-y-4">
            <div className="text-[48px] leading-none" aria-hidden="true">📱</div>
            <div className="max-w-md mx-auto space-y-2">
              <h3 className="text-gc-lead font-bold text-gc-ink">Open a live room</h3>
              <p className="text-gc-body text-gc-quiet leading-relaxed">
                Students join on their phones, tablets or laptops with a 4-letter code or the QR code. Everyone bets in secret at the same time while watching this screen.
              </p>
            </div>
            <div className="pt-2">
              <ActionButton
                onClick={onCreateRoom}
                playSound={playSound}
                variant="primary"
                className="h-14 px-10 text-gc-lead"
              >
                Open a live room
              </ActionButton>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-4 items-start">
              {/* Join panel: readable from the back row (package T4) */}
              <div className="gc-surface rounded-gc-lg p-5 flex flex-col items-center text-center gap-3" data-testid="join-panel">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={`QR code for room ${roomCode}`}
                    referrerPolicy="no-referrer"
                    className="w-56 h-56 rounded-gc bg-white p-1.5 shadow-gc-1"
                  />
                ) : (
                  <div className="w-56 h-56 rounded-gc border border-gc-line/[0.2] grid place-items-center text-gc-small text-gc-quiet">
                    Making the QR code…
                  </div>
                )}
                <div className="w-full">
                  <p className="text-gc-small font-semibold text-gc-quiet">Scan, or go to</p>
                  <p className="text-[26px] leading-tight font-bold text-gc-ink break-all" data-testid="join-address">{joinHost}</p>
                  <p className="mt-1 text-gc-small font-semibold text-gc-quiet">and type the code</p>
                  <div className="font-logo text-[52px] leading-none font-bold tracking-[0.24em] text-gc-gold select-all mt-1" data-testid="join-code">
                    {roomCode}
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1.5 text-gc-small font-semibold ${hostConnected ? 'text-gc-win' : 'text-gc-loss'}`}>
                  <span className={`w-2 h-2 rounded-full ${hostConnected ? 'bg-gc-win' : 'bg-gc-loss'}`} aria-hidden="true" />
                  {hostConnected ? 'Room online' : "Not connected: phones can't join yet"}
                </span>
              </div>

              {/* Seats */}
              <div className="min-w-0 flex flex-col gap-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-gc-lead font-bold text-gc-ink">
                    <span className="tabular-nums" data-testid="joined-count">{connectedCount}</span> connected
                    {missing.length > 0 && classListName && (
                      <span className="text-gc-quiet font-semibold text-gc-body"> · {missing.length} of {classListName} not here yet</span>
                    )}
                  </h3>
                  <span className="text-gc-cap text-gc-quiet">Tap a name to remove it.</span>
                </div>

                {players.length === 0 ? (
                  <div className="rounded-gc border border-dashed border-gc-line/[0.24] p-6 text-center text-gc-body text-gc-quiet">
                    Waiting for students to scan the QR code or type the code <strong className="text-gc-gold tabular-nums">{roomCode}</strong>…
                  </div>
                ) : (
                  <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-1 max-h-[56vh] overflow-y-auto pr-1 modal-content-scroll" aria-label="Seats">
                    {players.map((p) => {
                      const seat = seats[p.id];
                      const isRemote = Boolean(seat);
                      const isOnline = seat ? seat.connected : true;
                      const waiting = !isRemote && Boolean(classListName);
                      const status = waiting
                        ? 'Not here yet'
                        : !isRemote ? 'On this screen' : isOnline ? (seat.lockedIn ? 'Locked in' : 'On a phone') : 'Offline';
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => onKickPlayer(p.id)}
                            title={`Remove ${p.name}`}
                            aria-label={`Remove ${p.name} (${status})`}
                            data-testid="lobby-seat"
                            data-waiting={waiting ? 'true' : undefined}
                            className={`group relative w-full h-11 rounded-gc-sm pl-1.5 pr-2 flex items-center gap-2 text-left border transition-colors cursor-pointer ${
                              waiting
                                ? 'border-dashed border-gc-line/[0.22] bg-transparent opacity-55'
                                : 'gc-seat-pop border-gc-line/[0.12] bg-gc-line/[0.05] hover:border-gc-loss/50'
                            }`}
                          >
                            <PlayerAvatar value={p.avatar} size="sm" />
                            <span className="min-w-0 flex-1">
                              <span className="block text-gc-small font-bold text-gc-ink truncate">{p.name}</span>
                              <span className="flex items-center gap-1 text-gc-cap text-gc-quiet truncate">
                                {isRemote && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isOnline ? 'bg-gc-win' : 'bg-gc-quiet/60'}`} aria-hidden="true" />}
                                {status}
                              </span>
                            </span>
                            <X className="absolute top-1 right-1 w-3.5 h-3.5 text-gc-quiet opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 group-hover:text-gc-loss" aria-hidden="true" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <p className="text-gc-small text-gc-quiet rounded-gc-sm bg-gc-gold/[0.07] border border-gc-gold/20 px-3 py-2" data-testid="lobby-tip">
                  <span className="font-bold text-gc-gold">Tip · </span>{tip}
                </p>
              </div>
            </div>

            {/* Link and room controls */}
            <div className="gc-surface rounded-gc-lg p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <label htmlFor="mp-join-link" className="sr-only">Join link</label>
                <input
                  id="mp-join-link"
                  type="text"
                  readOnly
                  value={joinUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 min-w-0 h-11 px-3 rounded-gc-sm bg-gc-bg/60 border border-gc-line/[0.2] text-gc-small text-gc-ink tabular-nums focus:outline-none focus:border-gc-gold"
                />
                <button
                  type="button"
                  onClick={handleCopyJoinLink}
                  className="gc-btn-primary h-11 px-4 rounded-full text-gc-small font-bold cursor-pointer shrink-0 inline-flex items-center gap-1.5"
                >
                  {copiedLink ? <Check className="w-4 h-4" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
                  {copiedLink ? 'Copied' : 'Copy link'}
                </button>
              </div>
                  {!isPublicHost && !isFileProtocol && (
                    <div className="mt-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-gc-cap font-semibold text-gc-quiet">Link for students</span>
                        <div className="inline-flex p-0.5 rounded-full bg-gc-line/[0.06] border border-gc-line/[0.12]" role="group" aria-label="Link for students">
                          {[
                            { on: true, label: 'Public website' },
                            { on: false, label: 'This host' },
                          ].map(opt => (
                            <button
                              key={opt.label}
                              type="button"
                              aria-pressed={usePublicUrl === opt.on}
                              onClick={() => {
                                if (usePublicUrl === opt.on) return;
                                playSound('click');
                                setUsePublicUrl(opt.on);
                              }}
                              className={`h-8 px-3 rounded-full text-gc-cap font-bold transition-colors cursor-pointer ${
                                usePublicUrl === opt.on ? 'bg-gc-card text-gc-ink shadow-gc-1' : 'text-gc-quiet hover:text-gc-ink'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      {isAiStudioHost && (
                        <p className="text-gc-cap leading-snug px-3 py-2 rounded-gc-sm bg-gc-info/10 text-gc-ink">
                          {usePublicUrl ? (
                            <>Recommended. Students join at <span className="tabular-nums">grammarcasino.pages.dev</span> with no Google sign-in.</>
                          ) : (
                            <>This uses the shareable <span className="tabular-nums">ais-pre-…</span> link instead of your private <span className="tabular-nums">ais-dev-…</span> one. So phones don't see &ldquo;403 Access denied&rdquo;, first click <strong>Share</strong> at the top right of AI Studio and turn on public sharing.</>
                          )}
                        </p>
                      )}
                    </div>
                  )}
                {/* Room controls */}
                <div className="pt-3 border-t border-gc-line/[0.12] flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={roomLocked}
                    onClick={() => {
                      playSound('click');
                      onToggleLockRoom();
                    }}
                    className={ghostBtn}
                    title={roomLocked ? 'New phones cannot join. Tap to let them in.' : 'New phones can join. Tap to stop them.'}
                  >
                    {roomLocked ? <Lock className="w-4 h-4 text-gc-loss" aria-hidden="true" /> : <LockOpen className="w-4 h-4 text-gc-win" aria-hidden="true" />}
                    {roomLocked ? 'Room locked' : 'Room open'}
                  </button>

                  {onOpenRemote && (
                    <button
                      type="button"
                      onClick={() => onOpenRemote(baseOrigin)}
                      className={ghostBtn}
                      data-testid="open-teacher-remote"
                      title="Use your own phone to run the game from anywhere in the room"
                    >
                      <Smartphone className="w-4 h-4" aria-hidden="true" />
                      {remotePaired ? 'Teacher remote: paired' : 'Teacher remote'}
                    </button>
                  )}

                  {bankruptCount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        playSound('powerUp');
                        onBailoutBankruptPlayers();
                      }}
                      className={ghostBtn}
                    >
                      Give $150 to {bankruptCount === 1 ? 'the player' : `the ${bankruptCount} players`} with no money
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      playSound('lose', 0);
                      onCloseRoom();
                    }}
                    className="ml-auto h-11 px-4 rounded-full border border-gc-loss/40 hover:bg-gc-loss/10 text-gc-small font-bold text-gc-loss transition-colors cursor-pointer"
                  >
                    Close the room
                  </button>
                </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-gc-line/[0.12]">
              <ActionButton
                onClick={onClose}
                playSound={playSound}
                variant="primary"
                className="h-12 px-8 text-gc-body"
              >
                Back to the table
              </ActionButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MultiplayerLobbyModal;
