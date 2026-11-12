// The lobby: players, the live room and starting a game (package F7: moved out of App.tsx without changes).

import { useGame } from '../state/gameStore';
import { type FinishedGame } from '../game/persistence';
import React from 'react';
import { SoundEffect } from '../types';
import { ArrowRight, BookOpen, Check, Cloud as CloudIcon, Smartphone, Monitor, Plus, QrCode, Pencil, X, MoreHorizontal, FolderOpen, Bot, CircleHelp } from 'lucide-react';
import ActionButton from '../components/ActionButton';
import TextInput from '../components/TextInput';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { CloudManagerTab } from '../components/CloudManagerModal';
import { MultiplayerSeat } from '../utils/multiplayerProtocol';
import { DEMO_BOT_COUNT } from '../game/demoBots';

export interface LobbyScreenProps {
  mpSeats: Record<number, MultiplayerSeat>;
  playerNameInputRef: React.RefObject<HTMLInputElement>;
  newPlayerName: string;
  setNewPlayerName: React.Dispatch<React.SetStateAction<string>>;
  handlePlayerNameKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  handleAddPlayer: () => void;
  playSound: (sound: SoundEffect, ...args: any[]) => void;
  mpRoomCode: string;
  mpHostConnected: boolean;
  isDemoRoom: boolean;
  setShowMpLobbyModal: React.Dispatch<React.SetStateAction<boolean>>;
  handleCreateMpRoom: () => Promise<void>;
  startDemoRoom: () => void;
  setIsStudentControllerMode: React.Dispatch<React.SetStateAction<boolean>>;
  setShowCoach: React.Dispatch<React.SetStateAction<boolean>>;
  activeCloudRoster: { id: string; className: string; };
  isEditingStartingCash: boolean;
  tempStartingCash: string;
  setTempStartingCash: React.Dispatch<React.SetStateAction<string>>;
  handleSaveStartingCash: () => void;
  setIsEditingStartingCash: React.Dispatch<React.SetStateAction<boolean>>;
  startingCash: number;
  handleOpenAvatarModal: (playerId: number) => void;
  editingPlayerIdInSetup: number;
  editingPlayerNameInSetup: string;
  setEditingPlayerNameInSetup: React.Dispatch<React.SetStateAction<string>>;
  handleUpdatePlayerName: (playerId: number, newName: string) => void;
  setEditingPlayerIdInSetup: React.Dispatch<React.SetStateAction<number>>;
  handleKickMpPlayer: (playerId: number) => void;
  handleDeletePlayer: (idToDelete: number) => void;
  handleStartGame: () => void;
  hasSetupPrefs: boolean;
  handleFinalizeSettings: () => void;
  quickStartSummary: string;
  setIsLobbyMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isLobbyMenuOpen: boolean;
  handleLoadGameClick: () => void;
  handleOpenCloudModal: (tab?: CloudManagerTab) => void;
  finishedGames: FinishedGame[];
  setShowPastReports: React.Dispatch<React.SetStateAction<boolean>>;
}

export function LobbyScreen({
  mpSeats,
  playerNameInputRef,
  newPlayerName,
  setNewPlayerName,
  handlePlayerNameKeyDown,
  handleAddPlayer,
  playSound,
  mpRoomCode,
  mpHostConnected,
  isDemoRoom,
  setShowMpLobbyModal,
  handleCreateMpRoom,
  startDemoRoom,
  setIsStudentControllerMode,
  setShowCoach,
  activeCloudRoster,
  isEditingStartingCash,
  tempStartingCash,
  setTempStartingCash,
  handleSaveStartingCash,
  setIsEditingStartingCash,
  startingCash,
  handleOpenAvatarModal,
  editingPlayerIdInSetup,
  editingPlayerNameInSetup,
  setEditingPlayerNameInSetup,
  handleUpdatePlayerName,
  setEditingPlayerIdInSetup,
  handleKickMpPlayer,
  handleDeletePlayer,
  handleStartGame,
  hasSetupPrefs,
  handleFinalizeSettings,
  quickStartSummary,
  setIsLobbyMenuOpen,
  isLobbyMenuOpen,
  handleLoadGameClick,
  handleOpenCloudModal,
  finishedGames,
  setShowPastReports,
}: LobbyScreenProps) {
  // Package F6: the game in play comes from the store, not through props.
  const players = useGame(s => s.players);
  const phonesConnected = Object.values(mpSeats).filter((s: MultiplayerSeat) => s.connected).length;
  return (
  <div className="w-full max-w-5xl px-4 pt-6 sm:pt-2 pb-8 animate-gc-fade">
    {/* A smaller logo and one line */}
    <header className="text-center mb-8">
      <h1 className="font-logo text-gc-gold text-[40px] sm:text-[56px] leading-none font-semibold tracking-[0.06em]">
        Grammar Casino
      </h1>
      <p className="mt-3 text-gc-lead text-gc-quiet">Place your bets on English grammar.</p>
    </header>

    {/* Two ways to play */}
    <div className="grid md:grid-cols-2 gap-4 mb-4">
      <section className="gc-surface rounded-gc-lg p-5 sm:p-6 flex flex-col gap-4" aria-labelledby="lobby-local-title">
        <div className="flex items-start gap-3.5">
          <span className="w-11 h-11 shrink-0 rounded-full bg-gc-gold/15 text-gc-money grid place-items-center">
            <Monitor className="w-5 h-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="lobby-local-title" className="text-gc-lead font-bold text-gc-ink">Play on this screen</h2>
            <p className="text-gc-small text-gc-quiet">Add each player by name. Everyone bets on the projector.</p>
          </div>
        </div>
        <div className="flex gap-2.5 mt-auto">
          <TextInput
            ref={playerNameInputRef}
            value={newPlayerName}
            onChange={(e) => setNewPlayerName(e.target.value)}
            onKeyDown={handlePlayerNameKeyDown}
            placeholder="Player name"
            aria-label="Player name"
            maxLength={20}
            className="h-12 flex-1 min-w-0 text-gc-body"
          />
          <ActionButton
            onClick={handleAddPlayer}
            playSound={playSound}
            variant="ghost"
            className="h-12 px-5 text-gc-body font-bold shrink-0"
          >
            <span className="inline-flex items-center gap-1.5"><Plus className="w-4 h-4 shrink-0" aria-hidden="true" />Add player</span>
          </ActionButton>
        </div>
      </section>

      <section className="gc-surface rounded-gc-lg p-5 sm:p-6 flex flex-col gap-4" aria-labelledby="lobby-live-title">
        <div className="flex items-start gap-3.5">
          <span className="w-11 h-11 shrink-0 rounded-full bg-gc-gold/15 text-gc-money grid place-items-center">
            <Smartphone className="w-5 h-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="lobby-live-title" className="text-gc-lead font-bold text-gc-ink">Open a live room for phones</h2>
            <p className="text-gc-small text-gc-quiet">
              {mpRoomCode
                ? 'Students scan the QR code or type the room code on their phones.'
                : 'Students join with a code or QR code and bet on their own phones.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 mt-auto">
          {mpRoomCode ? (
            <>
              <span className="h-12 px-4 inline-flex items-center gap-2 rounded-gc-sm bg-gc-win/10 border border-gc-win/30 text-gc-ink font-bold tabular-nums">
                <span className={`w-2 h-2 rounded-full ${mpHostConnected ? 'bg-gc-win' : 'bg-gc-gold'}`} aria-hidden="true" />
                Room {mpRoomCode}
                <span className="text-gc-small font-semibold text-gc-quiet">· {phonesConnected} connected</span>
              </span>
              {!isDemoRoom && (
              <ActionButton
                data-hotkey="room"
                onClick={() => setShowMpLobbyModal(true)}
                playSound={playSound}
                variant="ghost"
                className="h-12 px-5 text-gc-body font-bold"
              >
                <span className="inline-flex items-center gap-1.5"><QrCode className="w-4 h-4 shrink-0" aria-hidden="true" />Show the QR code</span>
              </ActionButton>
              )}
            </>
          ) : (
            <>
              <ActionButton
                onClick={handleCreateMpRoom}
                variant="ghost"
                className="h-12 px-5 text-gc-body font-bold"
                title="Open a live room with a QR code"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 shrink-0" aria-hidden="true" />
                  Open a live room
                </span>
              </ActionButton>
              <button
                type="button"
                onClick={startDemoRoom}
                className="h-12 px-4 inline-flex items-center gap-1.5 rounded-gc-sm text-gc-body font-semibold text-gc-quiet hover:text-gc-ink hover:bg-gc-line/[0.06] cursor-pointer"
                title={`Try a room alone: ${DEMO_BOT_COUNT} bots join and bet. Nothing is saved.`}
              >
                <Bot className="w-4 h-4 shrink-0" aria-hidden="true" />
                Demo with bots
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              playSound('click');
              setIsStudentControllerMode(true);
            }}
            className="ml-auto text-gc-small font-semibold text-gc-quiet hover:text-gc-ink underline underline-offset-4 decoration-gc-line/30 cursor-pointer"
            title="Use this device as a student phone and join a room"
          >
            Join a room as a student
          </button>
          <button
            type="button"
            onClick={() => {
              playSound('click');
              setShowCoach(true);
            }}
            className="inline-flex items-center gap-1 text-gc-small font-semibold text-gc-quiet hover:text-gc-ink underline underline-offset-4 decoration-gc-line/30 cursor-pointer"
          >
            <CircleHelp className="w-3.5 h-3.5" aria-hidden="true" />
            How it works
          </button>
        </div>
      </section>
    </div>

    {/* Who is at the table */}
    <section className="gc-surface rounded-gc-lg p-5 sm:p-6 mb-6" aria-labelledby="lobby-table-title">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="lobby-table-title" className="text-gc-lead font-bold text-gc-ink">
            At the table <span className="text-gc-quiet font-semibold tabular-nums">({players.length})</span>
          </h2>
          {activeCloudRoster && (
            <span className="h-7 px-2.5 inline-flex items-center gap-1.5 rounded-full bg-gc-info/10 text-gc-info text-gc-cap font-bold">
              <CloudIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              Class: {activeCloudRoster.className}
            </span>
          )}
        </div>

        {isEditingStartingCash ? (
          <div className="flex items-center gap-2">
            <label htmlFor="gc-starting-cash" className="text-gc-small font-semibold text-gc-quiet">Starting money $</label>
            <input
              id="gc-starting-cash"
              type="number"
              min={1}
              step={100}
              value={tempStartingCash}
              onChange={(e) => setTempStartingCash(e.target.value)}
              onBlur={handleSaveStartingCash}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveStartingCash();
                else if (e.key === 'Escape') {
                  setIsEditingStartingCash(false);
                  setTempStartingCash(String(startingCash));
                }
              }}
              autoFocus
              className="w-24 h-10 px-3 rounded-gc-sm bg-gc-line/[0.05] border border-gc-gold text-gc-ink font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-gc-gold/30"
            />
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSaveStartingCash();
              }}
              aria-label="Save the starting money"
              className="w-10 h-10 rounded-full bg-gc-win/15 text-gc-win grid place-items-center cursor-pointer hover:bg-gc-win/25"
            >
              <Check className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              playSound('click');
              setTempStartingCash(String(startingCash));
              setIsEditingStartingCash(true);
            }}
            className="h-10 px-3.5 inline-flex items-center gap-2 rounded-full bg-gc-line/[0.05] border border-gc-line/[0.14] hover:border-gc-line/30 text-gc-small font-semibold text-gc-quiet cursor-pointer transition-colors"
            title="Change how much money each player starts with"
          >
            Starting money
            <b className="text-gc-money tabular-nums">${startingCash.toLocaleString()}</b>
            <Pencil className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          </button>
        )}
      </div>

      {players.length === 0 ? (
        <p className="py-6 text-center text-gc-body text-gc-quiet text-balance">
          No players yet. Add names above, or open a live room so students can join from their phones.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2.5" aria-label="Players at the table">
          {players.map((player) => {
            const mpSeat = mpSeats[player.id];
            return (
              <li
                key={player.id}
                className="h-12 pl-1.5 pr-1.5 inline-flex items-center gap-2 rounded-full bg-gc-line/[0.05] border border-gc-line/[0.14] animate-gc-pop"
                title={`${player.name} · $${player.money.toLocaleString()}${mpSeat ? (mpSeat.connected ? ' · on a phone' : ' · phone disconnected') : ''}`}
              >
                <button
                  type="button"
                  onClick={() => handleOpenAvatarModal(player.id)}
                  aria-label={`Change ${player.name}'s avatar`}
                  className="relative w-9 h-9 rounded-full bg-gc-card p-0.5 grid place-items-center leading-none ring-2 ring-gc-gold/50 hover:ring-gc-gold cursor-pointer transition-shadow"
                >
                  <PlayerAvatar value={player.avatar} size="sm" className="w-full h-full" />
                  {mpSeat && (
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 z-20 w-3 h-3 rounded-full border-2 border-gc-card ${mpSeat.connected ? 'bg-gc-win' : 'bg-gc-gold'}`}
                      aria-hidden="true"
                    />
                  )}
                </button>
                {editingPlayerIdInSetup === player.id ? (
                  <input
                    type="text"
                    value={editingPlayerNameInSetup}
                    onChange={(e) => setEditingPlayerNameInSetup(e.target.value)}
                    onBlur={() => {
                      if (editingPlayerNameInSetup.trim()) {
                        handleUpdatePlayerName(player.id, editingPlayerNameInSetup);
                      }
                      setEditingPlayerIdInSetup(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (editingPlayerNameInSetup.trim()) {
                          handleUpdatePlayerName(player.id, editingPlayerNameInSetup);
                        }
                        setEditingPlayerIdInSetup(null);
                      } else if (e.key === 'Escape') {
                        setEditingPlayerIdInSetup(null);
                      }
                    }}
                    autoFocus
                    maxLength={20}
                    aria-label="Player name"
                    className="w-28 bg-transparent border-b border-gc-gold text-gc-body font-bold text-gc-ink focus:outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPlayerIdInSetup(player.id);
                      setEditingPlayerNameInSetup(player.name);
                    }}
                    className="max-w-[10rem] truncate text-gc-body font-bold text-gc-ink cursor-text"
                    title="Click to change the name"
                  >
                    {player.name}
                  </button>
                )}
                {mpSeat && <Smartphone className="w-3.5 h-3.5 shrink-0 text-gc-quiet" aria-label="On a phone" />}
                <button
                  type="button"
                  onClick={() => (mpSeat ? handleKickMpPlayer(player.id) : handleDeletePlayer(player.id))}
                  aria-label={`Remove ${player.name}`}
                  className="w-8 h-8 rounded-full grid place-items-center text-gc-quiet hover:text-gc-loss hover:bg-gc-loss/10 cursor-pointer transition-colors"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>

    <div className="flex flex-wrap items-center justify-center gap-3">
      <ActionButton
        onClick={handleStartGame}
        playSound={playSound}
        variant="primary"
        className="min-h-[60px] px-10 text-gc-lead"
        disabled={players.length === 0}
      >
        <span className="inline-flex items-center gap-2.5">
          Set up the game
          <ArrowRight className="w-5 h-5 shrink-0" aria-hidden="true" />
        </span>
      </ActionButton>
      {/* Package T1: deal at once with the settings of the last game on this computer. */}
      {hasSetupPrefs && players.length > 0 && (
        <button
          type="button"
          onClick={handleFinalizeSettings}
          data-testid="quick-start"
          title="Deal the first hand now with the settings of your last game"
          className="min-h-[60px] px-5 inline-flex flex-col items-start justify-center rounded-full bg-gc-line/[0.06] border border-gc-gold/50 hover:border-gc-gold text-gc-ink cursor-pointer transition-colors text-left"
        >
          <span className="text-gc-body font-bold">Quick start</span>
          <span className="text-gc-cap text-gc-quiet" data-testid="quick-start-summary">{quickStartSummary}</span>
        </button>
      )}
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            playSound('click');
            setIsLobbyMenuOpen((v) => !v);
          }}
          aria-haspopup="menu"
          aria-expanded={isLobbyMenuOpen}
          className="h-[60px] px-5 inline-flex items-center gap-2 rounded-full bg-gc-line/[0.06] border border-gc-line/[0.16] hover:border-gc-line/30 text-gc-ink text-gc-body font-semibold cursor-pointer transition-colors"
        >
          <MoreHorizontal className="w-5 h-5 shrink-0" aria-hidden="true" />
          More
        </button>
        {isLobbyMenuOpen && (
          <>
            <div className="fixed inset-0 z-40" aria-hidden="true" onClick={() => setIsLobbyMenuOpen(false)} />
            <div
              role="menu"
              className="absolute z-50 bottom-full mb-2 left-1/2 -translate-x-1/2 sm:left-0 sm:translate-x-0 w-72 max-w-[calc(100vw-2rem)] p-1.5 rounded-gc bg-gc-raised border border-gc-line/[0.14] shadow-gc-2 text-left"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsLobbyMenuOpen(false);
                  handleLoadGameClick();
                }}
                className="w-full px-3 py-2.5 rounded-gc-sm flex items-start gap-3 text-left hover:bg-gc-line/[0.07] cursor-pointer"
              >
                <FolderOpen className="w-5 h-5 mt-0.5 shrink-0 text-gc-quiet" aria-hidden="true" />
                <span>
                  <span className="block text-gc-body font-semibold text-gc-ink">Load a saved game</span>
                  <span className="block text-gc-small text-gc-quiet">Open a game file (.json) from this computer</span>
                </span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsLobbyMenuOpen(false);
                  handleOpenCloudModal('rosters');
                }}
                className="w-full px-3 py-2.5 rounded-gc-sm flex items-start gap-3 text-left hover:bg-gc-line/[0.07] cursor-pointer"
              >
                <CloudIcon className="w-5 h-5 mt-0.5 shrink-0 text-gc-quiet" aria-hidden="true" />
                <span>
                  <span className="block text-gc-body font-semibold text-gc-ink">Class lists and reports</span>
                  <span className="block text-gc-small text-gc-quiet">Load a class from the cloud, or see saved games</span>
                </span>
              </button>
              {finishedGames.length > 0 && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsLobbyMenuOpen(false);
                    playSound('click');
                    setShowPastReports(true);
                  }}
                  className="w-full px-3 py-2.5 rounded-gc-sm flex items-start gap-3 text-left hover:bg-gc-line/[0.07] cursor-pointer"
                >
                  <BookOpen className="w-5 h-5 mt-0.5 shrink-0 text-gc-quiet" aria-hidden="true" />
                  <span>
                    <span className="block text-gc-body font-semibold text-gc-ink">Past reports ({finishedGames.length})</span>
                    <span className="block text-gc-small text-gc-quiet">Reports of games finished on this computer</span>
                  </span>
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  </div>
  );
}
