import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Player, SoundEffect } from '../types';
import { MultiplayerSeat } from '../utils/multiplayerProtocol';
import ActionButton from './ActionButton';
import { Check, Copy, Lock, LockOpen, X } from 'lucide-react';

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
  playSound,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);
  const isNetlifyHost =
    typeof window !== 'undefined' && window.location.hostname.includes('netlify.app');
  const isFileProtocol =
    typeof window !== 'undefined' && window.location.protocol === 'file:';
  const isAiStudioHost =
    typeof window !== 'undefined' &&
    (window.location.hostname.startsWith('ais-dev-') ||
      window.location.hostname.startsWith('ais-pre-') ||
      window.location.hostname.endsWith('.run.app'));

  // Default to the public Netlify URL when running inside Electron (file:) or AI Studio private preview (ais-dev-)
  // because ais-dev-*.run.app is locked to the owner's Google account and returns 403 on other devices.
  const [useNetlifyUrl, setUseNetlifyUrl] = useState<boolean>(
    () => isFileProtocol || isAiStudioHost
  );

  // If the teacher chooses the current host while inside AI Studio's private `ais-dev-` preview,
  // automatically convert `ais-dev-` to the shareable `ais-pre-` origin so other devices aren't blocked by dev-only auth.
  const sharedCurrentOrigin =
    typeof window !== 'undefined'
      ? `${window.location.origin.replace('://ais-dev-', '://ais-pre-')}${window.location.pathname}`
      : '';

  const baseOrigin =
    useNetlifyUrl || isFileProtocol
      ? 'https://siqueiragrammarcasino.netlify.app/'
      : sharedCurrentOrigin;

  const joinUrl = roomCode ? `${baseOrigin}?room=${roomCode}` : '';

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
  const ghostBtn = 'h-11 px-4 rounded-full border border-gc-line/[0.2] bg-gc-line/[0.05] hover:border-gc-line/40 text-gc-small font-bold text-gc-ink transition-colors cursor-pointer inline-flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-turn';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 dark:bg-black/75 backdrop-blur-sm animate-gc-fade"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Live room"
        className="gc-panel rounded-gc-lg max-w-3xl w-full p-5 sm:p-7 relative max-h-[92vh] overflow-y-auto modal-content-scroll text-left"
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
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch">
              {/* QR code */}
              <div className="md:col-span-5 gc-surface rounded-gc-lg p-5 flex flex-col items-center justify-center text-center">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={`QR code for room ${roomCode}`}
                    referrerPolicy="no-referrer"
                    className="w-52 h-52 sm:w-56 sm:h-56 rounded-gc bg-white p-1.5 shadow-gc-1"
                  />
                ) : (
                  <div className="w-52 h-52 rounded-gc border border-gc-line/[0.2] grid place-items-center text-gc-small text-gc-quiet">
                    Making the QR code…
                  </div>
                )}
                <p className="mt-3 text-gc-small font-semibold text-gc-quiet">Scan with the phone camera to join</p>
              </div>

              {/* Room code and controls */}
              <div className="md:col-span-7 gc-surface rounded-gc-lg p-5 flex flex-col justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                    <span className="text-gc-small font-semibold text-gc-quiet">Room code</span>
                    <span className={`inline-flex items-center gap-1.5 text-gc-small font-semibold ${hostConnected ? 'text-gc-win' : 'text-gc-loss'}`}>
                      <span className={`w-2 h-2 rounded-full ${hostConnected ? 'bg-gc-win' : 'bg-gc-loss'}`} aria-hidden="true" />
                      {hostConnected ? 'Room online' : "Not connected: phones can't join yet"}
                      <span className="text-gc-quiet tabular-nums">· {connectedCount} connected</span>
                    </span>
                  </div>

                  <div className="py-3 px-4 rounded-gc bg-gc-line/[0.05] border border-gc-gold/50 text-center">
                    <div className="font-logo text-[44px] sm:text-[56px] leading-tight font-bold tracking-[0.24em] text-gc-gold select-all">
                      {roomCode}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
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

                  {!isNetlifyHost && !isFileProtocol && (
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
                              aria-pressed={useNetlifyUrl === opt.on}
                              onClick={() => {
                                if (useNetlifyUrl === opt.on) return;
                                playSound('click');
                                setUseNetlifyUrl(opt.on);
                              }}
                              className={`h-8 px-3 rounded-full text-gc-cap font-bold transition-colors cursor-pointer ${
                                useNetlifyUrl === opt.on ? 'bg-gc-card text-gc-ink shadow-gc-1' : 'text-gc-quiet hover:text-gc-ink'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      {isAiStudioHost && (
                        <p className="text-gc-cap leading-snug px-3 py-2 rounded-gc-sm bg-gc-info/10 text-gc-ink">
                          {useNetlifyUrl ? (
                            <>Recommended. Students join at <span className="tabular-nums">siqueiragrammarcasino.netlify.app</span> with no Google sign-in.</>
                          ) : (
                            <>This uses the shareable <span className="tabular-nums">ais-pre-…</span> link instead of your private <span className="tabular-nums">ais-dev-…</span> one. So phones don't see &ldquo;403 Access denied&rdquo;, first click <strong>Share</strong> at the top right of AI Studio and turn on public sharing.</>
                          )}
                        </p>
                      )}
                    </div>
                  )}
                </div>

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
            </div>

            {/* Players */}
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2.5">
                <h3 className="text-gc-body font-bold text-gc-ink">
                  At the table <span className="text-gc-quiet font-semibold tabular-nums">({players.length})</span>
                </h3>
                <span className="text-gc-cap text-gc-quiet">
                  Players who run out of money get $150 from the house, except in Last player standing. Each player can be attacked once per hand.
                </span>
              </div>

              {players.length === 0 ? (
                <div className="rounded-gc border border-dashed border-gc-line/[0.24] p-6 text-center text-gc-body text-gc-quiet">
                  Waiting for students to scan the QR code or type the code <strong className="text-gc-gold tabular-nums">{roomCode}</strong>…
                </div>
              ) : (
                <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-60 overflow-y-auto pr-1 modal-content-scroll">
                  {players.map((p) => {
                    const seat = seats[p.id];
                    const isRemote = Boolean(seat);
                    const isOnline = seat ? seat.connected : true;
                    const status = !isRemote ? 'On this screen' : isOnline ? (seat.lockedIn ? 'Locked in' : 'Online') : 'Offline';
                    return (
                      <li
                        key={p.id}
                        className="rounded-gc p-2.5 pl-3 flex items-center justify-between gap-2 bg-gc-line/[0.05] border border-gc-line/[0.12]"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-[24px] leading-none shrink-0" aria-hidden="true">{p.avatar}</span>
                          <div className="min-w-0">
                            <div className="text-gc-small font-bold text-gc-ink truncate">{p.name}</div>
                            <div className="text-gc-cap text-gc-quiet flex items-center gap-1.5 tabular-nums">
                              <span className="text-gc-money font-semibold">${p.money.toLocaleString()}</span>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-1">
                                {isRemote && <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-gc-win' : 'bg-gc-quiet/60'}`} aria-hidden="true" />}
                                {status}
                              </span>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => onKickPlayer(p.id)}
                          className="w-9 h-9 rounded-full text-gc-quiet hover:text-gc-loss hover:bg-gc-loss/10 grid place-items-center cursor-pointer shrink-0 transition-colors"
                          title={`Remove ${p.name}`}
                          aria-label={`Remove ${p.name}`}
                        >
                          <X className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
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
