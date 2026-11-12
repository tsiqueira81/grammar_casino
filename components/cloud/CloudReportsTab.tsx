// The cloud window's reports and saved games tab (moved out of CloudManagerModal, F7).
import type { CloudManagerTab } from '../CloudManagerModal';
import React from 'react';
import { Trash2 } from 'lucide-react';
import { CEFRLevel, GameMode, Player, RoundHistoryRecord, Settings, SoundEffect } from '../../types';
import ActionButton from '../ActionButton';
import GrammarReportCard from '../GrammarReportCard';
import { CloudSessionReport } from '../../services/firebaseService';

export interface CloudReportsTabProps {
  activeTab: CloudManagerTab;
  viewingReport: CloudSessionReport;
  setViewingReport: React.Dispatch<React.SetStateAction<CloudSessionReport>>;
  playSound: (sound: SoundEffect) => void;
  targetAmount: string | number;
  cardCls: "p-4 rounded-gc bg-gc-line/[0.04] border border-gc-line/[0.12]";
  roundHistory: RoundHistoryRecord[];
  players: Player[];
  handleSaveCurrentSessionReport: (e: React.FormEvent) => Promise<void>;
  newReportTitle: string;
  setNewReportTitle: React.Dispatch<React.SetStateAction<string>>;
  settings: Settings;
  inputCls: "w-full h-11 px-3 rounded-gc-sm border border-gc-line/[0.2] bg-gc-bg/60 text-gc-body text-gc-ink placeholder:text-gc-quiet/70 focus:outline-none focus:border-gc-gold focus:ring-2 focus:ring-gc-gold/30";
  isSavingReport: boolean;
  reports: CloudSessionReport[];
  onLoadFullGameState: (gameState: any) => void;
  onClose: () => void;
  confirmDeleteReportId: string;
  handleDeleteReport: (reportId: string) => Promise<void>;
  setConfirmDeleteReportId: React.Dispatch<React.SetStateAction<string>>;
}

export function CloudReportsTab({
  activeTab,
  viewingReport,
  setViewingReport,
  playSound,
  targetAmount,
  cardCls,
  roundHistory,
  players,
  handleSaveCurrentSessionReport,
  newReportTitle,
  setNewReportTitle,
  settings,
  inputCls,
  isSavingReport,
  reports,
  onLoadFullGameState,
  onClose,
  confirmDeleteReportId,
  handleDeleteReport,
  setConfirmDeleteReportId,
}: CloudReportsTabProps) {

  return (
    <>
      {activeTab === 'reports' && (
        <div className="space-y-5">
          {viewingReport ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-gc-line/[0.12]">
                <div>
                  <p className="text-gc-cap font-semibold text-gc-quiet tabular-nums">
                    Archived session report &middot; {new Date(viewingReport.createdAt).toLocaleString()}
                  </p>
                  <h3 className="text-gc-lead font-bold text-gc-ink">{viewingReport.title}</h3>
                </div>
                <ActionButton
                  onClick={() => setViewingReport(null)}
                  playSound={playSound}
                  variant="ghost"
                  className="h-10 px-4 text-gc-small font-bold"
                >
                  &larr; All sessions
                </ActionButton>
              </div>

              <GrammarReportCard
                history={viewingReport.roundHistory}
                players={viewingReport.players.map((p) => ({
                  id: p.id,
                  name: p.name,
                  avatar: p.avatar,
                  money: p.money,
                  winStreak: p.winStreak,
                  history: [],
                  effects: [],
                }))}
                winner={
                  viewingReport.winnerName
                    ? {
                        id: 1,
                        name: viewingReport.winnerName,
                        avatar: viewingReport.winnerAvatar,
                        money: viewingReport.winnerMoney,
                        winStreak: 0,
                        history: [],
                        effects: [],
                      }
                    : null
                }
                playSound={playSound}
                onRestartGame={() => setViewingReport(null)}
                settings={{
                  topic: viewingReport.topic,
                  level: (viewingReport.level as CEFRLevel) || 'B1',
                  theme: viewingReport.theme,
                }}
                gameMode={(viewingReport.gameMode as GameMode) || 'rounds'}
                totalRounds={viewingReport.roundsPlayed}
                targetAmount={targetAmount}
              />
            </div>
          ) : (
            <>
              {/* Save Current Session to Cloud */}
              <div className={`${cardCls} space-y-3`}>
                <div>
                  <h3 className="text-gc-body font-bold text-gc-ink">
                    Save current session report &amp; table state
                  </h3>
                  <p className="text-gc-small text-gc-quiet">
                    Archives the Grammar Report Card ({roundHistory.length} hand{roundHistory.length === 1 ? '' : 's'} played) and full resumable table state to Firestore.
                  </p>
                </div>

                {players.length === 0 ? (
                  <p className="text-gc-small text-gc-quiet">
                    Start a game or seat players first to save a session report.
                  </p>
                ) : (
                  <form onSubmit={handleSaveCurrentSessionReport} className="flex flex-col sm:flex-row gap-2.5">
                    <input
                      type="text"
                      value={newReportTitle}
                      onChange={(e) => setNewReportTitle(e.target.value)}
                      placeholder={`Optional title (default: ${settings.topic} (${settings.level}) — Today)`}
                      maxLength={120}
                      className={`flex-1 ${inputCls}`}
                    />
                    <ActionButton
                      type="submit"
                      playSound={playSound}
                      variant="primary"
                      disabled={isSavingReport}
                      className="h-11 px-5 text-gc-small font-bold shrink-0"
                    >
                      {isSavingReport ? 'Saving…' : 'Save session'}
                    </ActionButton>
                  </form>
                )}
              </div>

              {/* Reports List */}
              {reports.length === 0 ? (
                <div className={`${cardCls} py-8 text-center space-y-1.5`}>
                  <p className="text-gc-body font-bold text-gc-ink">No Cloud session reports yet</p>
                  <p className="text-gc-small text-gc-quiet max-w-md mx-auto">
                    Save a session during or after a game to review full Grammar Report Cards and resume mid-game tables from any computer.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {reports.map((report) => (
                    <div
                      key={report.id}
                      className={`${cardCls} flex flex-wrap items-center justify-between gap-4`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-gc-body font-bold text-gc-ink">{report.title}</h4>
                          <span className="h-6 px-2 inline-flex items-center rounded-full bg-gc-gold/15 border border-gc-gold/40 text-gc-cap font-bold text-gc-ink">
                            {report.topic} &middot; {report.level}
                          </span>
                          <span className="h-6 px-2 inline-flex items-center rounded-full bg-gc-line/[0.08] text-gc-cap font-bold text-gc-quiet tabular-nums">
                            {report.roundsPlayed} hands &middot; {report.playerCount} players
                          </span>
                        </div>
                        <p className="text-gc-small text-gc-quiet">
                          Leader: <strong className="text-gc-ink">{report.winnerAvatar} {report.winnerName}</strong> (${report.winnerMoney.toLocaleString()}) &middot;{' '}
                          <span className="tabular-nums">{new Date(report.createdAt).toLocaleString()}</span>
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <ActionButton
                          type="button"
                          onClick={() => {
                            playSound('click');
                            setViewingReport(report);
                          }}
                          variant="ghost"
                          className="h-10 px-3.5 text-gc-small font-bold"
                        >
                          Report card
                        </ActionButton>

                        {report.fullGameState && (
                          <ActionButton
                            type="button"
                            onClick={() => {
                              playSound('startGame');
                              onLoadFullGameState(report.fullGameState);
                              onClose();
                            }}
                            variant="primary"
                            className="h-10 px-3.5 text-gc-small font-bold"
                            title="Resume this saved game table state"
                          >
                            Resume table
                          </ActionButton>
                        )}

                        {confirmDeleteReportId === report.id ? (
                          <div className="flex items-center gap-1.5">
                            <ActionButton
                              type="button"
                              onClick={() => handleDeleteReport(report.id)}
                              variant="danger"
                              className="h-9 px-3 text-gc-cap font-bold"
                            >
                              Confirm
                            </ActionButton>
                            <ActionButton
                              type="button"
                              onClick={() => setConfirmDeleteReportId(null)}
                              variant="ghost"
                              className="h-9 px-2.5 text-gc-cap font-bold"
                            >
                              Cancel
                            </ActionButton>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteReportId(report.id)}
                            className="w-9 h-9 rounded-full border border-gc-loss/30 hover:border-gc-loss bg-gc-loss/10 text-gc-loss grid place-items-center transition-colors cursor-pointer"
                            title="Delete session report"
                            aria-label={`Delete report ${report.title}`}
                          >
                            <Trash2 className="w-4 h-4" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
