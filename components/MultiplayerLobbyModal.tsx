import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Player, SoundEffect } from '../types';
import { MultiplayerSeat } from '../utils/multiplayerProtocol';
import ActionButton from './ActionButton';

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="glass-panel rounded-2xl max-w-3xl w-full p-6 sm:p-8 border-2 border-[#d4af37] shadow-[0_25px_70px_rgba(0,0,0,0.85)] relative max-h-[90vh] overflow-y-auto modal-content-scroll text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 mb-6 border-b border-[#d4af37]/30">
          <div>
            <div className="text-xs font-serif uppercase tracking-[0.25em] text-amber-800 dark:text-[#d4af37] font-bold">
              Live Classroom Controller · Host Relay
            </div>
            <h2 className="text-2xl sm:text-3xl font-display font-black text-gold uppercase tracking-wider mt-0.5">
              Multiplayer Salon Lobby
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              playSound('click');
              onClose();
            }}
            className="w-9 h-9 rounded-full felt-well border border-[#d4af37]/50 hover:border-[#d4af37] flex items-center justify-center text-lg text-slate-700 dark:text-amber-100 cursor-pointer"
            title="Close Lobby Window"
          >
            &times;
          </button>
        </div>

        {!roomCode ? (
          <div className="felt-well rounded-2xl p-8 text-center space-y-5">
            <div className="text-5xl select-none">📱</div>
            <div className="max-w-md mx-auto space-y-2">
              <h3 className="text-xl font-serif font-extrabold text-slate-900 dark:text-amber-50 uppercase tracking-wider">
                Host a Live Classroom Table
              </h3>
              <p className="text-sm text-slate-600 dark:text-amber-100/75 leading-relaxed">
                Open a live room so students can join from their phones, tablets, or laptops using a 4-letter Room Code or QR scan. Everyone places hidden wagers simultaneously while watching this projector screen.
              </p>
            </div>
            <div className="pt-2">
              <ActionButton
                onClick={onCreateRoom}
                playSound={playSound}
                variant="gold"
                className="py-4 px-10 text-base sm:text-lg tracking-[0.15em]"
              >
                OPEN LIVE MULTIPLAYER ROOM
              </ActionButton>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Top Split: QR Code + Room Code & Controls */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
              {/* Left QR Card */}
              <div className="md:col-span-5 felt-well rounded-2xl p-5 flex flex-col items-center justify-center text-center border border-[#d4af37]/40">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={`QR code for room ${roomCode}`}
                    referrerPolicy="no-referrer"
                    className="w-48 h-48 sm:w-52 sm:h-52 rounded-xl border-2 border-[#d4af37] shadow-lg bg-white p-1.5"
                  />
                ) : (
                  <div className="w-48 h-48 rounded-xl border-2 border-[#d4af37]/40 flex items-center justify-center text-xs font-mono-casino text-amber-300">
                    Generating QR...
                  </div>
                )}
                <div className="mt-3 text-xs font-serif uppercase tracking-widest text-slate-600 dark:text-amber-200/80 font-bold">
                  Scan with Phone Camera to Join
                </div>
              </div>

              {/* Right Room Code & Actions */}
              <div className="md:col-span-7 felt-well rounded-2xl p-5 flex flex-col justify-between border border-[#d4af37]/40 space-y-4">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-serif uppercase tracking-[0.2em] text-slate-500 dark:text-amber-200/70 font-bold">
                      Room Code
                    </span>
                    <span
                      className={`text-xs font-mono-casino font-semibold ${
                        hostConnected ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'
                      }`}
                    >
                      {hostConnected ? 'Room online' : "Not connected: phones can't join yet"} &middot; {seatList.filter(s => s.connected).length} Connected
                    </span>
                  </div>

                  <div className="py-3 px-4 rounded-xl bg-amber-500/10 dark:bg-black/50 border border-[#d4af37]/60 text-center">
                    <div className="text-4xl sm:text-5xl font-display font-black tracking-[0.28em] text-gold select-all">
                      {roomCode}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={joinUrl}
                      className="flex-1 text-xs font-mono-casino px-3 py-2.5 rounded-lg bg-white/80 dark:bg-black/40 border border-[#d4af37]/40 text-slate-800 dark:text-amber-100 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCopyJoinLink}
                      className="px-4 py-2.5 rounded-lg bg-[#d4af37] hover:bg-amber-400 text-black font-serif font-extrabold text-xs uppercase tracking-wider transition-colors cursor-pointer shrink-0"
                    >
                      {copiedLink ? 'Copied ✓' : 'Copy Link'}
                    </button>
                  </div>

                  {!isNetlifyHost && !isFileProtocol && (
                    <div className="mt-2.5 space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-amber-200/75">
                        <span>Student Link Mode:</span>
                        <button
                          type="button"
                          onClick={() => {
                            playSound('click');
                            setUseNetlifyUrl((prev) => !prev);
                          }}
                          className="px-2.5 py-1 rounded-md border border-[#d4af37]/40 hover:border-[#d4af37] bg-amber-500/10 text-amber-900 dark:text-[#fef08a] font-mono-casino text-[10px] cursor-pointer transition-colors"
                        >
                          {useNetlifyUrl
                            ? '🌐 Public Web (siqueiragrammarcasino.netlify.app) · Switch to Shared Host'
                            : '🔗 Shared Host (ais-pre) · Switch to Public Netlify URL'}
                        </button>
                      </div>
                      {isAiStudioHost && (
                        <div className="text-[10px] leading-snug px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-[#d4af37]/30 text-slate-700 dark:text-amber-100/80">
                          {useNetlifyUrl ? (
                            <span>
                              <strong>Public Mode (Recommended):</strong> Students join via{' '}
                              <span className="font-mono-casino">siqueiragrammarcasino.netlify.app</span> with{' '}
                              <strong>no Google login required</strong>.
                            </span>
                          ) : (
                            <span>
                              <strong>AI Studio Shared Mode:</strong> Uses{' '}
                              <span className="font-mono-casino">ais-pre-...</span> instead of your private{' '}
                              <span className="font-mono-casino">ais-dev-...</span> link. To avoid{' '}
                              <strong>403 Access Denied</strong> on other people&apos;s phones, click{' '}
                              <strong>Share</strong> in the top-right of AI Studio and enable public sharing first.
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Host Controls */}
                <div className="pt-3 border-t border-[#d4af37]/20 flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      playSound('click');
                      onToggleLockRoom();
                    }}
                    className={`px-4 py-2.5 rounded-xl text-xs font-serif font-extrabold uppercase tracking-wider border transition-all cursor-pointer flex items-center gap-1.5 ${
                      roomLocked
                        ? 'bg-rose-500/20 border-rose-400 text-rose-800 dark:text-rose-200'
                        : 'bg-emerald-500/20 border-emerald-400 text-emerald-900 dark:text-emerald-200'
                    }`}
                  >
                    <span>{roomLocked ? '🔒 Room Locked' : '🔓 Room Open'}</span>
                  </button>

                  {bankruptCount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        playSound('powerUp');
                        onBailoutBankruptPlayers();
                      }}
                      className="px-4 py-2.5 rounded-xl text-xs font-serif font-extrabold uppercase tracking-wider border border-amber-400 bg-amber-500/20 text-amber-900 dark:text-[#fef08a] hover:bg-amber-500/30 transition-all cursor-pointer"
                    >
                      +$150 Bailout ({bankruptCount} Broke)
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      playSound('lose', 0);
                      onCloseRoom();
                    }}
                    className="ml-auto px-3.5 py-2.5 rounded-xl text-xs font-serif font-bold uppercase tracking-wider border border-rose-500/40 hover:border-rose-500 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                  >
                    Close Room
                  </button>
                </div>
              </div>
            </div>

            {/* Connected Student Seats List */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-serif font-extrabold uppercase tracking-widest text-slate-900 dark:text-amber-50">
                  Seated Players ({players.length})
                </h3>
                <span className="text-xs text-slate-500 dark:text-amber-200/70">
                  Automatic $150 House Bailout &amp; 1-Attack-Per-Round Shield Active
                </span>
              </div>

              {players.length === 0 ? (
                <div className="felt-well rounded-xl p-6 text-center text-sm text-slate-600 dark:text-amber-100/70 italic font-editorial">
                  Waiting for students to scan the QR code or enter code <strong className="font-mono-casino not-italic text-amber-700 dark:text-[#fef08a]">{roomCode}</strong>...
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-60 overflow-y-auto pr-1 modal-content-scroll">
                  {players.map((p) => {
                    const seat = seats[p.id];
                    const isRemote = Boolean(seat);
                    const isOnline = seat ? seat.connected : true;
                    return (
                      <div
                        key={p.id}
                        className="felt-well rounded-xl p-3 flex items-center justify-between gap-2 border border-[#d4af37]/30"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-2xl shrink-0">{p.avatar}</span>
                          <div className="min-w-0">
                            <div className="font-serif font-extrabold text-sm text-slate-900 dark:text-amber-50 truncate">
                              {p.name}
                            </div>
                            <div className="text-[11px] font-mono-casino text-slate-500 dark:text-amber-200/75 flex items-center gap-1.5">
                              <span className="tabular-nums">${p.money.toLocaleString()}</span>
                              <span>&middot;</span>
                              <span>
                                {!isRemote
                                  ? 'Local Seat'
                                  : isOnline
                                    ? seat.lockedIn
                                      ? 'Locked ✓'
                                      : 'Online'
                                    : 'Offline'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => onKickPlayer(p.id)}
                          className="w-7 h-7 rounded-full border border-rose-500/30 hover:border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center text-sm cursor-pointer shrink-0"
                          title={`Remove ${p.name}`}
                        >
                          &times;
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-[#d4af37]/20">
              <ActionButton
                onClick={onClose}
                playSound={playSound}
                variant="gold"
                className="py-3 px-8 text-sm tracking-widest"
              >
                DONE &amp; RETURN TO TABLE
              </ActionButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MultiplayerLobbyModal;
