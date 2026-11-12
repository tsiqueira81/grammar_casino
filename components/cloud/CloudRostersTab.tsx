// The cloud window's class rosters tab (moved out of CloudManagerModal, F7).
import type { CloudManagerTab } from '../CloudManagerModal';
import React from 'react';
import { Trash2 } from 'lucide-react';
import { Player, SoundEffect } from '../../types';
import ActionButton from '../ActionButton';
import { PlayerAvatar } from '../PlayerAvatar';
import { CloudRoster } from '../../services/firebaseService';

export interface CloudRostersTabProps {
  activeTab: CloudManagerTab;
  activeRosterObj: CloudRoster;
  players: Player[];
  handleUpdateExistingRoster: (roster: CloudRoster) => Promise<void>;
  playSound: (sound: SoundEffect) => void;
  isSavingRoster: boolean;
  cardCls: "p-4 rounded-gc bg-gc-line/[0.04] border border-gc-line/[0.12]";
  handleCreateNewRoster: (e: React.FormEvent) => Promise<void>;
  newRosterName: string;
  setNewRosterName: React.Dispatch<React.SetStateAction<string>>;
  inputCls: "w-full h-11 px-3 rounded-gc-sm border border-gc-line/[0.2] bg-gc-bg/60 text-gc-body text-gc-ink placeholder:text-gc-quiet/70 focus:outline-none focus:border-gc-gold focus:ring-2 focus:ring-gc-gold/30";
  newRosterNotes: string;
  setNewRosterNotes: React.Dispatch<React.SetStateAction<string>>;
  rosters: CloudRoster[];
  bailoutZeroOnResume: boolean;
  setBailoutZeroOnResume: React.Dispatch<React.SetStateAction<boolean>>;
  activeRosterId: string;
  onLoadRoster: (roster: CloudRoster, mode: "fresh" | "saved", bailoutZeroPlayers: boolean) => void;
  onClose: () => void;
  startingCash: number;
  confirmDeleteRosterId: string;
  handleDeleteRoster: (rosterId: string) => Promise<void>;
  setConfirmDeleteRosterId: React.Dispatch<React.SetStateAction<string>>;
}

export function CloudRostersTab({
  activeTab,
  activeRosterObj,
  players,
  handleUpdateExistingRoster,
  playSound,
  isSavingRoster,
  cardCls,
  handleCreateNewRoster,
  newRosterName,
  setNewRosterName,
  inputCls,
  newRosterNotes,
  setNewRosterNotes,
  rosters,
  bailoutZeroOnResume,
  setBailoutZeroOnResume,
  activeRosterId,
  onLoadRoster,
  onClose,
  startingCash,
  confirmDeleteRosterId,
  handleDeleteRoster,
  setConfirmDeleteRosterId,
}: CloudRostersTabProps) {

  return (
    <>
      {activeTab === 'rosters' && (
        <div className="space-y-5">
          {activeRosterObj && players.length > 0 && (
            <div className="p-4 rounded-gc bg-gc-win/10 border border-gc-win/30 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-gc-cap font-bold text-gc-win">Active classroom roster loaded</p>
                <p className="text-gc-body font-bold text-gc-ink">
                  {activeRosterObj.name} ({players.length} students seated)
                </p>
              </div>
              <ActionButton
                onClick={() => handleUpdateExistingRoster(activeRosterObj)}
                playSound={playSound}
                variant="primary"
                disabled={isSavingRoster}
                className="h-10 px-4 text-gc-small"
              >
                {isSavingRoster ? 'Syncing…' : 'Sync current bankrolls'}
              </ActionButton>
            </div>
          )}

          {/* Save Current Table as New Roster */}
          <div className={`${cardCls} space-y-3`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-gc-body font-bold text-gc-ink">
                  Save seated table as a Cloud roster
                </h3>
                <p className="text-gc-small text-gc-quiet">
                  Save your current {players.length} seated student{players.length === 1 ? '' : 's'} (names, avatars, and bankrolls) for future classes.
                </p>
              </div>
              <span className="h-7 px-2.5 inline-flex items-center rounded-full bg-gc-gold/15 border border-gc-gold/40 text-gc-cap font-bold text-gc-ink tabular-nums">
                {players.length} seated
              </span>
            </div>

            {players.length === 0 ? (
              <p className="text-gc-small text-gc-quiet">
                Add students to the table first (or have them join via QR code) to save them as a reusable class roster.
              </p>
            ) : (
              <form onSubmit={handleCreateNewRoster} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pt-1">
                <input
                  type="text"
                  value={newRosterName}
                  onChange={(e) => setNewRosterName(e.target.value)}
                  placeholder="Class name (e.g. Period 2 — B2 Upper Intermediate)"
                  maxLength={80}
                  className={`sm:col-span-5 ${inputCls}`}
                />
                <input
                  type="text"
                  value={newRosterNotes}
                  onChange={(e) => setNewRosterNotes(e.target.value)}
                  placeholder="Optional notes (e.g. Mon/Wed class)"
                  maxLength={120}
                  className={`sm:col-span-4 ${inputCls}`}
                />
                <div className="sm:col-span-3 flex">
                  <ActionButton
                    type="submit"
                    playSound={playSound}
                    variant="primary"
                    disabled={!newRosterName.trim() || isSavingRoster}
                    className="w-full h-11 px-4 text-gc-small"
                  >
                    {isSavingRoster ? 'Saving…' : 'Save roster'}
                  </ActionButton>
                </div>
              </form>
            )}
          </div>

          {/* Resume Mode Option Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <p className="text-gc-small font-bold text-gc-ink">
              Saved classroom rosters ({rosters.length})
            </p>
            <label className="flex items-center gap-2 text-gc-small text-gc-quiet cursor-pointer select-none">
              <input
                type="checkbox"
                checked={bailoutZeroOnResume}
                onChange={(e) => setBailoutZeroOnResume(e.target.checked)}
                className="rounded border-gc-line/30 accent-amber-500 w-4 h-4 cursor-pointer"
              />
              <span>When resuming saved bankrolls, bail out $0 students to $150</span>
            </label>
          </div>

          {/* Rosters List */}
          {rosters.length === 0 ? (
            <div className={`${cardCls} py-8 text-center space-y-1.5`}>
              <p className="text-gc-body font-bold text-gc-ink">No Cloud rosters saved yet</p>
              <p className="text-gc-small text-gc-quiet max-w-md mx-auto">
                Seat your students at the table and save them above to load your class in one click on any device.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {rosters.map((roster) => {
                const isActive = roster.id === activeRosterId;
                return (
                  <div
                    key={roster.id}
                    className={`p-4 rounded-gc border transition-colors space-y-3 ${
                      isActive
                        ? 'bg-gc-win/[0.06] border-gc-win/40'
                        : 'bg-gc-line/[0.04] border-gc-line/[0.12] hover:border-gc-line/25'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-gc-body font-bold text-gc-ink">{roster.name}</h4>
                          {isActive && (
                            <span className="h-6 px-2 inline-flex items-center rounded-full bg-gc-win/15 text-gc-win text-gc-cap font-bold">
                              Active roster
                            </span>
                          )}
                          <span className="h-6 px-2 inline-flex items-center rounded-full bg-gc-line/[0.08] text-gc-quiet text-gc-cap font-bold tabular-nums">
                            {roster.playerCount} students
                          </span>
                        </div>
                        {roster.notes && (
                          <p className="text-gc-small text-gc-quiet mt-0.5">{roster.notes}</p>
                        )}
                        <p className="text-gc-cap text-gc-quiet tabular-nums mt-1">
                          Updated {new Date(roster.updatedAt).toLocaleString()} &middot; Fresh stack: $
                          {roster.startingCash.toLocaleString()}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <ActionButton
                          type="button"
                          onClick={() => {
                            playSound('startGame');
                            onLoadRoster(roster, 'fresh', bailoutZeroOnResume);
                            onClose();
                          }}
                          variant="ghost"
                          className="h-10 px-3.5 text-gc-small font-bold"
                          title={`Load ${roster.name} with everyone reset to $${startingCash.toLocaleString()}`}
                        >
                          Fresh start (${startingCash})
                        </ActionButton>

                        <ActionButton
                          type="button"
                          onClick={() => {
                            playSound('startGame');
                            onLoadRoster(roster, 'saved', bailoutZeroOnResume);
                            onClose();
                          }}
                          variant="primary"
                          className="h-10 px-3.5 text-gc-small font-bold"
                          title="Load students with their exact saved bankrolls and win streaks"
                        >
                          Resume bankrolls
                        </ActionButton>

                        {players.length > 0 && (
                          <ActionButton
                            type="button"
                            onClick={() => handleUpdateExistingRoster(roster)}
                            disabled={isSavingRoster}
                            variant="ghost"
                            className="h-10 px-3 text-gc-small font-bold"
                            title="Overwrite this roster with the current table's players and bankrolls"
                          >
                            Update
                          </ActionButton>
                        )}

                        {confirmDeleteRosterId === roster.id ? (
                          <div className="flex items-center gap-1.5">
                            <ActionButton
                              type="button"
                              onClick={() => handleDeleteRoster(roster.id)}
                              variant="danger"
                              className="h-9 px-3 text-gc-cap font-bold"
                            >
                              Confirm
                            </ActionButton>
                            <ActionButton
                              type="button"
                              onClick={() => setConfirmDeleteRosterId(null)}
                              variant="ghost"
                              className="h-9 px-2.5 text-gc-cap font-bold"
                            >
                              Cancel
                            </ActionButton>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteRosterId(roster.id)}
                            className="w-9 h-9 rounded-full border border-gc-loss/30 hover:border-gc-loss bg-gc-loss/10 text-gc-loss grid place-items-center transition-colors cursor-pointer"
                            title="Delete roster"
                            aria-label={`Delete roster ${roster.name}`}
                          >
                            <Trash2 className="w-4 h-4" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Student Bankrolls Preview Pills */}
                    <div className="flex flex-wrap gap-1.5 pt-2 border-t border-gc-line/[0.1]">
                      {roster.players.map((p, i) => (
                        <span
                          key={`${p.id}_${i}`}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gc-bg/60 border border-gc-line/[0.14] text-gc-cap"
                        >
                          <PlayerAvatar value={p.avatar} size="xs" />
                          <span className="font-bold text-gc-ink">{p.name}</span>
                          <span className="tabular-nums font-bold text-gc-win">
                            ${p.money.toLocaleString()}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}
