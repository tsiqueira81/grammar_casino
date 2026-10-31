import React, { useState, useEffect, useMemo } from 'react';
import {
  CEFRLevel,
  GameMode,
  Player,
  QuestionType,
  RoundHistoryRecord,
  Settings,
  SoundEffect,
} from '../types';
import { CEFR_LEVELS, GRAMMAR_TOPICS } from '../constants';
import ActionButton from './ActionButton';
import GrammarReportCard from './GrammarReportCard';
import { getStaticBankCounts } from '../services/fallbackSentences';
import {
  CloudCuratedSentence,
  CloudRoster,
  CloudSessionReport,
  deleteCloudCuratedSentence,
  deleteCloudRoster,
  deleteCloudSessionReport,
  listCloudRosters,
  listCloudSessionReports,
  saveCloudRoster,
  saveCloudSessionReport,
  signInTeacherWithGoogle,
  syncCloudSentenceBank,
  VERIFIED_TEACHER_EMAIL,
} from '../services/firebaseService';

export type CloudManagerTab = 'rosters' | 'reports' | 'sentences';

interface CloudManagerModalProps {
  isOpen: boolean;
  initialTab?: CloudManagerTab;
  onClose: () => void;
  players: Player[];
  startingCash: number;
  settings: Settings;
  gameMode: GameMode;
  totalRounds: number | string;
  targetAmount: number | string;
  roundHistory: RoundHistoryRecord[];
  winner: Player | null;
  activeRosterId: string | null;
  activeRosterName: string | null;
  onLoadRoster: (
    roster: CloudRoster,
    mode: 'fresh' | 'saved',
    bailoutZeroPlayers: boolean
  ) => void;
  onActiveRosterUpdated: (roster: CloudRoster) => void;
  onLoadFullGameState: (gameState: any) => void;
  buildCurrentFullGameState: () => any;
  playSound: (sound: SoundEffect) => void;
  /** Email of the Google account signed in on this device, or null. */
  teacherEmail: string | null;
  /** The desktop app can't show Google's sign-in window. */
  isDesktopApp: boolean;
}

export const CloudManagerModal: React.FC<CloudManagerModalProps> = ({
  isOpen,
  initialTab = 'rosters',
  onClose,
  players,
  startingCash,
  settings,
  gameMode,
  totalRounds,
  targetAmount,
  roundHistory,
  winner,
  activeRosterId,
  activeRosterName,
  onLoadRoster,
  onActiveRosterUpdated,
  onLoadFullGameState,
  buildCurrentFullGameState,
  playSound,
  teacherEmail,
  isDesktopApp,
}) => {
  // Rosters and reports hold student names, so the Firestore rules only open them to the
  // teacher's Google account. The vault asks for that sign-in instead of failing quietly.
  const isTeacherSignedIn = (teacherEmail || '').trim().toLowerCase() === VERIFIED_TEACHER_EMAIL;
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<CloudManagerTab>(initialTab);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Rosters state
  const [rosters, setRosters] = useState<CloudRoster[]>([]);
  const [newRosterName, setNewRosterName] = useState<string>('');
  const [newRosterNotes, setNewRosterNotes] = useState<string>('');
  const [bailoutZeroOnResume, setBailoutZeroOnResume] = useState<boolean>(true);
  const [confirmDeleteRosterId, setConfirmDeleteRosterId] = useState<string | null>(null);
  const [isSavingRoster, setIsSavingRoster] = useState<boolean>(false);

  // Reports state
  const [reports, setReports] = useState<CloudSessionReport[]>([]);
  const [newReportTitle, setNewReportTitle] = useState<string>('');
  const [viewingReport, setViewingReport] = useState<CloudSessionReport | null>(null);
  const [confirmDeleteReportId, setConfirmDeleteReportId] = useState<string | null>(null);
  const [isSavingReport, setIsSavingReport] = useState<boolean>(false);

  // Sentences state
  const [sentences, setSentences] = useState<CloudCuratedSentence[]>([]);
  const [sentenceSearch, setSentenceSearch] = useState<string>('');
  const [sentenceTopicFilter, setSentenceTopicFilter] = useState<string>('ALL');
  const [sentenceLevelFilter, setSentenceLevelFilter] = useState<string>('ALL');
  const [sentenceFormatFilter, setSentenceFormatFilter] = useState<string>('ALL');
  const [confirmDeleteSentenceId, setConfirmDeleteSentenceId] = useState<string | null>(null);

  const staticCounts = useMemo(() => getStaticBankCounts(), []);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setNotice(null);
      setViewingReport(null);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (isOpen && isTeacherSignedIn) {
      void refreshAllCloudData();
    }
  }, [isOpen, isTeacherSignedIn]);

  const handleCloudSignIn = async () => {
    if (isSigningIn) return;
    playSound('click');
    setIsSigningIn(true);
    setNotice(null);
    const res = await signInTeacherWithGoogle();
    setIsSigningIn(false);
    if (!res.ok) {
      if (res.error) setNotice({ type: 'error', text: res.error });
      return;
    }
    if (!res.isVerifiedTeacher) {
      playSound('error');
      setNotice({
        type: 'error',
        text: `Signed in as ${res.user?.email || 'another account'}. Class rosters and reports open only for ${VERIFIED_TEACHER_EMAIL}.`,
      });
      return;
    }
    playSound('success');
  };

  const refreshAllCloudData = async () => {
    setIsLoading(true);
    try {
      const [loadedRosters, loadedReports, loadedSentences] = await Promise.all([
        listCloudRosters(),
        listCloudSessionReports(),
        syncCloudSentenceBank(),
      ]);
      setRosters(loadedRosters);
      setReports(loadedReports);
      setSentences(loadedSentences);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleCreateNewRoster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRosterName.trim() || players.length === 0 || isSavingRoster) return;
    setIsSavingRoster(true);
    setNotice(null);
    const saved = await saveCloudRoster({
      name: newRosterName.trim(),
      notes: newRosterNotes.trim(),
      startingCash,
      players,
    });
    setIsSavingRoster(false);
    if (saved) {
      playSound('success');
      setRosters((prev) => [saved, ...prev.filter((r) => r.id !== saved.id)]);
      onActiveRosterUpdated(saved);
      setNewRosterName('');
      setNewRosterNotes('');
      setNotice({
        type: 'success',
        text: `Saved roster "${saved.name}" (${saved.playerCount} students) to Firebase Cloud!`,
      });
    } else {
      playSound('error');
      setNotice({ type: 'error', text: 'Could not save roster to Firestore. Check your connection.' });
    }
  };

  const handleUpdateExistingRoster = async (roster: CloudRoster) => {
    if (players.length === 0 || isSavingRoster) return;
    setIsSavingRoster(true);
    setNotice(null);
    const updated = await saveCloudRoster({
      id: roster.id,
      name: roster.name,
      notes: roster.notes,
      startingCash: roster.startingCash || startingCash,
      players,
    });
    setIsSavingRoster(false);
    if (updated) {
      playSound('success');
      setRosters((prev) => [updated, ...prev.filter((r) => r.id !== updated.id)]);
      onActiveRosterUpdated(updated);
      setNotice({
        type: 'success',
        text: `Synced latest bankrolls & streaks for "${updated.name}" (${updated.playerCount} students)!`,
      });
    } else {
      playSound('error');
      setNotice({ type: 'error', text: 'Failed to update Cloud Roster.' });
    }
  };

  const handleDeleteRoster = async (rosterId: string) => {
    const ok = await deleteCloudRoster(rosterId);
    if (ok) {
      playSound('click');
      setRosters((prev) => prev.filter((r) => r.id !== rosterId));
      setConfirmDeleteRosterId(null);
      setNotice({ type: 'success', text: 'Deleted classroom roster from Cloud.' });
    } else {
      playSound('error');
      setNotice({ type: 'error', text: 'Could not delete roster.' });
    }
  };

  const handleSaveCurrentSessionReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (players.length === 0 || isSavingReport) return;
    setIsSavingReport(true);
    setNotice(null);
    const fullGameState = buildCurrentFullGameState();
    const saved = await saveCloudSessionReport({
      title: newReportTitle.trim() || undefined,
      topic: settings.topic,
      level: settings.level,
      theme: settings.theme,
      gameMode,
      players,
      roundHistory,
      winner,
      fullGameState,
    });
    setIsSavingReport(false);
    if (saved) {
      playSound('success');
      setReports((prev) => [saved, ...prev]);
      setNewReportTitle('');
      setNotice({
        type: 'success',
        text: `Saved session "${saved.title}" (Report Card + Resumable Table State) to Cloud!`,
      });
    } else {
      playSound('error');
      setNotice({ type: 'error', text: 'Could not save session report to Cloud.' });
    }
  };

  const handleDeleteReport = async (reportId: string) => {
    const ok = await deleteCloudSessionReport(reportId);
    if (ok) {
      playSound('click');
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      setConfirmDeleteReportId(null);
      if (viewingReport?.id === reportId) setViewingReport(null);
      setNotice({ type: 'success', text: 'Deleted session report from Cloud.' });
    } else {
      playSound('error');
      setNotice({ type: 'error', text: 'Could not delete session report.' });
    }
  };

  const handleDeleteSentence = async (sentenceId: string) => {
    const ok = await deleteCloudCuratedSentence(sentenceId);
    if (ok) {
      playSound('click');
      setSentences((prev) => prev.filter((s) => s.id !== sentenceId));
      setConfirmDeleteSentenceId(null);
      setNotice({ type: 'success', text: 'Removed sentence from Cloud Sentence Bank.' });
    } else {
      playSound('error');
      setNotice({ type: 'error', text: 'Could not delete sentence from Cloud.' });
    }
  };

  const filteredSentences = sentences.filter((s) => {
    if (sentenceTopicFilter !== 'ALL' && s.topic.toLowerCase() !== sentenceTopicFilter.toLowerCase()) {
      return false;
    }
    if (sentenceLevelFilter !== 'ALL' && s.level !== sentenceLevelFilter) {
      return false;
    }
    if (sentenceFormatFilter !== 'ALL' && (s.questionType || 'binary') !== sentenceFormatFilter) {
      return false;
    }
    if (sentenceSearch.trim()) {
      const q = sentenceSearch.trim().toLowerCase();
      return (
        s.text.toLowerCase().includes(q) ||
        s.correction.toLowerCase().includes(q) ||
        s.explanation.toLowerCase().includes(q) ||
        s.topic.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const activeRosterObj = rosters.find((r) => r.id === activeRosterId) || null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl glass-panel border-2 border-[#d4af37] shadow-[0_25px_70px_rgba(0,0,0,0.85)] overflow-hidden text-left">
        {/* Modal Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-amber-100/90 via-amber-50/90 to-amber-100/90 dark:from-[#04180e] dark:via-[#082a18] dark:to-[#04180e] border-b border-[#d4af37]/40 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-[#d4af37]/20 border border-[#d4af37]/60 flex items-center justify-center text-xl shadow-inner">
              ☁️
            </span>
            <div>
              <h2 className="text-lg sm:text-xl font-sans font-extrabold uppercase tracking-widest text-slate-900 dark:text-[#fef08a]">
                Salon Privé Cloud Vault
              </h2>
              <p className="text-xs text-slate-600 dark:text-amber-200/70">
                Classroom Rosters &middot; Session Reports &amp; Cloud Saves &middot; Auto-Growing AI Sentence Bank
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isTeacherSignedIn && (
            <button
              type="button"
              onClick={() => {
                playSound('click');
                void refreshAllCloudData();
              }}
              disabled={isLoading}
              className="px-3 py-1.5 rounded-xl felt-well border border-[#d4af37]/50 hover:border-[#d4af37] text-xs font-sans font-bold uppercase tracking-wider text-amber-900 dark:text-[#fef08a] cursor-pointer transition-all flex items-center gap-1.5"
              title="Refresh Cloud Data from Firestore"
            >
              <span className={isLoading ? 'animate-spin inline-block' : ''}>🔄</span>
              <span>{isLoading ? 'Syncing...' : 'Sync'}</span>
            </button>
            )}
            <button
              type="button"
              onClick={() => {
                playSound('click');
                onClose();
              }}
              className="w-9 h-9 rounded-full felt-well border border-[#d4af37]/50 hover:border-rose-400 text-slate-700 dark:text-amber-100 flex items-center justify-center text-lg font-bold cursor-pointer"
              title="Close Cloud Vault"
            >
              &times;
            </button>
          </div>
        </div>

        {!isTeacherSignedIn ? (
          <div className="p-5 sm:p-8 overflow-y-auto flex-1 modal-content-scroll">
            <div className="max-w-xl mx-auto text-center space-y-4">
              <div className="text-4xl select-none" aria-hidden="true">🔐</div>
              <h3 className="text-lg font-sans font-extrabold uppercase tracking-wider text-slate-900 dark:text-[#fef08a]">
                Teacher sign-in required
              </h3>
              <p className="text-sm leading-relaxed text-slate-700 dark:text-amber-100">
                Class rosters and session reports contain your students' names, so they open only for the
                teacher's Google account ({VERIFIED_TEACHER_EMAIL}). The Teacher PIN still unlocks Live AI and
                room hosting, but not the Cloud Vault.
              </p>
              {notice && (
                <div
                  className={`p-3 rounded-xl border text-xs sm:text-sm font-semibold text-left ${
                    notice.type === 'success'
                      ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-900 dark:text-emerald-200'
                      : 'bg-rose-500/15 border-rose-400/50 text-rose-900 dark:text-rose-200'
                  }`}
                >
                  {notice.type === 'success' ? '✓ ' : '⚠️ '}
                  {notice.text}
                </div>
              )}
              {isDesktopApp ? (
                <p className="text-sm leading-relaxed p-3 rounded-xl felt-well border border-[#d4af37]/40 text-slate-800 dark:text-amber-100">
                  Google sign-in doesn't work inside the desktop app. Open the web version of Grammar Casino in your
                  browser to use the Cloud Vault.
                </p>
              ) : (
                <>
                  {teacherEmail && (
                    <p className="text-xs text-slate-600 dark:text-amber-200">
                      This device is signed in as <strong>{teacherEmail}</strong>. Choose the teacher account instead.
                    </p>
                  )}
                  <ActionButton
                    type="button"
                    onClick={handleCloudSignIn}
                    playSound={playSound}
                    variant="gold"
                    disabled={isSigningIn}
                    className="py-2.5 px-6 text-sm"
                  >
                    {isSigningIn ? 'Signing in...' : teacherEmail ? '🔐 Switch Google account' : '🔐 Sign in with Google'}
                  </ActionButton>
                </>
              )}
            </div>
          </div>
        ) : (
        <>
        {/* Navigation Tabs */}
        <div className="px-5 pt-3 bg-amber-50/60 dark:bg-[#03130b] border-b border-[#d4af37]/30 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              playSound('click');
              setActiveTab('rosters');
              setViewingReport(null);
            }}
            className={`px-4 py-2.5 rounded-t-xl font-sans text-xs sm:text-sm font-extrabold uppercase tracking-wider border-t border-x transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'rosters'
                ? 'bg-gradient-to-b from-[#fef08a] via-[#eab308] to-[#a16207] text-[#1c0a04] border-[#fef9c3] shadow'
                : 'felt-well border-[#d4af37]/30 text-slate-700 dark:text-amber-100/80 hover:text-amber-900 dark:hover:text-[#fef08a]'
            }`}
          >
            <span>👥</span>
            <span>Class Rosters ({rosters.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              playSound('click');
              setActiveTab('reports');
              setViewingReport(null);
            }}
            className={`px-4 py-2.5 rounded-t-xl font-sans text-xs sm:text-sm font-extrabold uppercase tracking-wider border-t border-x transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'reports'
                ? 'bg-gradient-to-b from-[#fef08a] via-[#eab308] to-[#a16207] text-[#1c0a04] border-[#fef9c3] shadow'
                : 'felt-well border-[#d4af37]/30 text-slate-700 dark:text-amber-100/80 hover:text-amber-900 dark:hover:text-[#fef08a]'
            }`}
          >
            <span>📜</span>
            <span>Session Reports &amp; Saves ({reports.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              playSound('click');
              setActiveTab('sentences');
              setViewingReport(null);
            }}
            className={`px-4 py-2.5 rounded-t-xl font-sans text-xs sm:text-sm font-extrabold uppercase tracking-wider border-t border-x transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'sentences'
                ? 'bg-gradient-to-b from-[#fef08a] via-[#eab308] to-[#a16207] text-[#1c0a04] border-[#fef9c3] shadow'
                : 'felt-well border-[#d4af37]/30 text-slate-700 dark:text-amber-100/80 hover:text-amber-900 dark:hover:text-[#fef08a]'
            }`}
          >
            <span>🧠</span>
            <span>Cloud Sentence Bank ({sentences.length})</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5 modal-content-scroll">
          {notice && (
            <div
              className={`p-3.5 rounded-xl border text-xs sm:text-sm font-semibold flex items-center justify-between gap-3 ${
                notice.type === 'success'
                  ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-900 dark:text-emerald-200'
                  : 'bg-rose-500/15 border-rose-400/50 text-rose-900 dark:text-rose-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <span>{notice.type === 'success' ? '✓' : '⚠️'}</span>
                <span>{notice.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setNotice(null)}
                className="text-xs opacity-75 hover:opacity-100 cursor-pointer"
              >
                &times;
              </button>
            </div>
          )}

          {/* TAB 1: CLASSROOM ROSTERS */}
          {activeTab === 'rosters' && (
            <div className="space-y-6">
              {/* Quick Sync Active Roster Banner */}
              {activeRosterObj && players.length > 0 && (
                <div className="p-4 rounded-xl bg-emerald-500/15 border-2 border-emerald-400/50 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-sans tabular-nums uppercase tracking-widest text-emerald-800 dark:text-emerald-300 font-bold">
                      Active Classroom Roster Loaded
                    </div>
                    <div className="text-base font-sans font-extrabold text-slate-900 dark:text-amber-50">
                      {activeRosterObj.name} ({players.length} Students Seated)
                    </div>
                  </div>
                  <ActionButton
                    onClick={() => handleUpdateExistingRoster(activeRosterObj)}
                    playSound={playSound}
                    variant="gold"
                    disabled={isSavingRoster}
                    className="py-2.5 px-5 text-xs"
                  >
                    {isSavingRoster ? 'Syncing...' : '🔄 Sync Current Bankrolls to Roster'}
                  </ActionButton>
                </div>
              )}

              {/* Save Current Table as New Roster */}
              <div className="p-4 sm:p-5 rounded-xl felt-well border border-[#d4af37]/40 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm sm:text-base font-sans font-extrabold uppercase tracking-wider text-slate-900 dark:text-[#fef08a]">
                      💾 Save Seated Table as Cloud Roster
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-amber-200/70">
                      Save your current {players.length} seated student{players.length === 1 ? '' : 's'} (names, avatars, and current bankrolls) for future classes.
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-amber-500/20 border border-[#d4af37]/40 font-sans tabular-nums text-xs font-bold text-amber-900 dark:text-[#fef08a]">
                    {players.length} Seated
                  </span>
                </div>

                {players.length === 0 ? (
                  <div className="text-xs italic text-slate-500 dark:text-amber-200/60 py-1">
                    Add students to the table first (or have them join via QR code) to save them as a reusable class roster.
                  </div>
                ) : (
                  <form onSubmit={handleCreateNewRoster} className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1">
                    <input
                      type="text"
                      value={newRosterName}
                      onChange={(e) => setNewRosterName(e.target.value)}
                      placeholder="Class Name (e.g. Period 2 — B2 Upper Intermediate)"
                      maxLength={80}
                      className="sm:col-span-5 px-3.5 py-2.5 rounded-xl bg-white/90 dark:bg-black/50 border border-[#d4af37]/50 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-none focus:border-[#fef08a]"
                    />
                    <input
                      type="text"
                      value={newRosterNotes}
                      onChange={(e) => setNewRosterNotes(e.target.value)}
                      placeholder="Optional notes (e.g. Mon/Wed League)"
                      maxLength={120}
                      className="sm:col-span-4 px-3.5 py-2.5 rounded-xl bg-white/90 dark:bg-black/50 border border-[#d4af37]/50 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-none focus:border-[#fef08a]"
                    />
                    <div className="sm:col-span-3 flex">
                      <ActionButton
                        type="submit"
                        playSound={playSound}
                        variant="gold"
                        disabled={!newRosterName.trim() || isSavingRoster}
                        className="w-full py-2.5 px-4 text-xs"
                      >
                        {isSavingRoster ? 'Saving...' : '+ Save New Roster'}
                      </ActionButton>
                    </div>
                  </form>
                )}
              </div>

              {/* Resume Mode Option Toggle */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                <div className="text-xs font-sans font-extrabold uppercase tracking-wider text-amber-900 dark:text-[#fef08a]">
                  Saved Classroom Rosters ({rosters.length})
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-amber-100 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={bailoutZeroOnResume}
                    onChange={(e) => setBailoutZeroOnResume(e.target.checked)}
                    className="rounded border-[#d4af37] accent-amber-500 w-4 h-4 cursor-pointer"
                  />
                  <span>When resuming saved bankrolls, bail out $0 students to $150</span>
                </label>
              </div>

              {/* Rosters List */}
              {rosters.length === 0 ? (
                <div className="p-8 rounded-2xl felt-well text-center space-y-2">
                  <div className="text-3xl opacity-60">👥</div>
                  <div className="text-sm font-sans font-bold text-slate-700 dark:text-amber-100">
                    No Cloud Rosters Saved Yet
                  </div>
                  <p className="text-xs text-slate-500 dark:text-amber-200/60 max-w-md mx-auto">
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
                        className={`p-4 rounded-2xl felt-well border transition-all space-y-3 ${
                          isActive
                            ? 'border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.15)]'
                            : 'border-[#d4af37]/35 hover:border-[#d4af37]/70'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-sans font-extrabold text-base text-slate-900 dark:text-amber-50 uppercase tracking-wide">
                                {roster.name}
                              </h4>
                              {isActive && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-sans tabular-nums font-bold bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-400/50">
                                  ACTIVE TABLE ROSTER
                                </span>
                              )}
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-sans tabular-nums font-bold bg-amber-500/15 text-amber-900 dark:text-[#fef08a] border border-[#d4af37]/40">
                                {roster.playerCount} Students
                              </span>
                            </div>
                            {roster.notes && (
                              <p className="text-xs text-slate-600 dark:text-amber-200/75 mt-0.5">{roster.notes}</p>
                            )}
                            <div className="text-[10px] font-sans tabular-nums text-slate-500 dark:text-amber-200/50 mt-1">
                              Updated {new Date(roster.updatedAt).toLocaleString()} &middot; Default Fresh Stack: $
                              {roster.startingCash.toLocaleString()}
                            </div>
                          </div>

                          {/* Roster Action Buttons: Fresh Start vs Saved Bankrolls */}
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                playSound('startGame');
                                onLoadRoster(roster, 'fresh', bailoutZeroOnResume);
                                onClose();
                              }}
                              className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-sans font-extrabold uppercase tracking-wider text-xs shadow cursor-pointer transition-all flex items-center gap-1.5"
                              title={`Load ${roster.name} with everyone reset to $${startingCash.toLocaleString()}`}
                            >
                              <span>🌱</span>
                              <span>Fresh Start (${startingCash})</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                playSound('startGame');
                                onLoadRoster(roster, 'saved', bailoutZeroOnResume);
                                onClose();
                              }}
                              className="px-3 py-2 rounded-xl bg-gradient-to-b from-[#fef08a] via-[#eab308] to-[#a16207] text-[#1c0a04] font-sans font-extrabold uppercase tracking-wider text-xs border border-[#fef9c3] shadow cursor-pointer hover:brightness-105 transition-all flex items-center gap-1.5"
                              title="Load students with their exact saved bankrolls and win streaks from their last session"
                            >
                              <span>🏆</span>
                              <span>Resume Saved Bankrolls</span>
                            </button>

                            {players.length > 0 && (
                              <button
                                type="button"
                                onClick={() => handleUpdateExistingRoster(roster)}
                                disabled={isSavingRoster}
                                className="px-2.5 py-2 rounded-xl felt-well border border-[#d4af37]/50 hover:border-[#d4af37] text-amber-900 dark:text-[#fef08a] font-sans font-bold uppercase tracking-wider text-[11px] cursor-pointer transition-all"
                                title="Overwrite this roster with the current table's players and bankrolls"
                              >
                                💾 Update
                              </button>
                            )}

                            {confirmDeleteRosterId === roster.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRoster(roster.id)}
                                  className="px-2.5 py-1.5 rounded-lg bg-rose-600 text-white text-[11px] font-bold cursor-pointer"
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteRosterId(null)}
                                  className="px-2 py-1.5 rounded-lg felt-well text-[11px] cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteRosterId(roster.id)}
                                className="w-8 h-8 rounded-xl border border-rose-500/30 hover:border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center text-xs cursor-pointer"
                                title="Delete Roster"
                              >
                                🗑️
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Student Bankrolls Preview Pills */}
                        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-[#d4af37]/15">
                          {roster.players.map((p, i) => (
                            <span
                              key={`${p.id}_${i}`}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/75 dark:bg-black/40 border border-[#d4af37]/30 text-xs"
                            >
                              <span>{p.avatar}</span>
                              <span className="font-sans font-bold text-slate-800 dark:text-amber-50">{p.name}</span>
                              <span className="font-sans tabular-nums font-bold text-emerald-700 dark:text-emerald-400">
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

          {/* TAB 2: SESSION REPORTS & CLOUD SAVES */}
          {activeTab === 'reports' && (
            <div className="space-y-5">
              {viewingReport ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#d4af37]/30">
                    <div>
                      <div className="text-[10px] font-sans tabular-nums uppercase tracking-widest text-amber-800 dark:text-[#d4af37]">
                        Archived Session Report Card &middot; {new Date(viewingReport.createdAt).toLocaleString()}
                      </div>
                      <h3 className="text-lg font-sans font-extrabold text-slate-900 dark:text-amber-50">
                        {viewingReport.title}
                      </h3>
                    </div>
                    <ActionButton
                      onClick={() => setViewingReport(null)}
                      playSound={playSound}
                      variant="outline-gold"
                      className="py-2 px-4 text-xs"
                    >
                      &larr; Back to All Sessions
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
                  <div className="p-4 sm:p-5 rounded-xl felt-well border border-[#d4af37]/40 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm sm:text-base font-sans font-extrabold uppercase tracking-wider text-slate-900 dark:text-[#fef08a]">
                          ☁️ Save Current Session Report &amp; Table State
                        </h3>
                        <p className="text-xs text-slate-600 dark:text-amber-200/70">
                          Archives the Grammar Report Card ({roundHistory.length} hand{roundHistory.length === 1 ? '' : 's'} played) and full resumable table state to Firestore.
                        </p>
                      </div>
                    </div>

                    {players.length === 0 ? (
                      <div className="text-xs italic text-slate-500 dark:text-amber-200/60">
                        Start a game or seat players first to save a session report.
                      </div>
                    ) : (
                      <form onSubmit={handleSaveCurrentSessionReport} className="flex flex-col sm:flex-row gap-3">
                        <input
                          type="text"
                          value={newReportTitle}
                          onChange={(e) => setNewReportTitle(e.target.value)}
                          placeholder={`Optional title (default: ${settings.topic} (${settings.level}) — Today)`}
                          maxLength={120}
                          className="flex-1 px-3.5 py-2.5 rounded-xl bg-white/90 dark:bg-black/50 border border-[#d4af37]/50 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-none focus:border-[#fef08a]"
                        />
                        <ActionButton
                          type="submit"
                          playSound={playSound}
                          variant="gold"
                          disabled={isSavingReport}
                          className="py-2.5 px-6 text-xs shrink-0"
                        >
                          {isSavingReport ? 'Saving...' : '☁️ Save Session to Cloud'}
                        </ActionButton>
                      </form>
                    )}
                  </div>

                  {/* Reports List */}
                  {reports.length === 0 ? (
                    <div className="p-8 rounded-2xl felt-well text-center space-y-2">
                      <div className="text-3xl opacity-60">📜</div>
                      <div className="text-sm font-sans font-bold text-slate-700 dark:text-amber-100">
                        No Cloud Session Reports Yet
                      </div>
                      <p className="text-xs text-slate-500 dark:text-amber-200/60 max-w-md mx-auto">
                        Save a session during or after a game to review full Grammar Report Cards and resume mid-game tables from any computer.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {reports.map((report) => (
                        <div
                          key={report.id}
                          className="p-4 rounded-2xl felt-well border border-[#d4af37]/35 hover:border-[#d4af37]/70 transition-all flex flex-wrap items-center justify-between gap-4"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-sans font-extrabold text-base text-slate-900 dark:text-amber-50">
                                {report.title}
                              </h4>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-sans tabular-nums font-bold bg-amber-500/20 text-amber-900 dark:text-[#fef08a] border border-[#d4af37]/40">
                                {report.topic} &middot; {report.level}
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-sans tabular-nums font-bold bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-400/40">
                                {report.roundsPlayed} Hands &middot; {report.playerCount} Players
                              </span>
                            </div>
                            <div className="text-xs text-slate-600 dark:text-amber-200/75 flex items-center gap-3 flex-wrap">
                              <span>
                                👑 Leader: <strong>{report.winnerAvatar} {report.winnerName}</strong> ($
                                {report.winnerMoney.toLocaleString()})
                              </span>
                              <span>&middot;</span>
                              <span className="font-sans tabular-nums text-[11px] opacity-75">
                                {new Date(report.createdAt).toLocaleString()}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                playSound('click');
                                setViewingReport(report);
                              }}
                              className="px-3 py-2 rounded-xl bg-gradient-to-b from-[#fef08a] via-[#eab308] to-[#a16207] text-[#1c0a04] font-sans font-extrabold uppercase tracking-wider text-xs border border-[#fef9c3] shadow cursor-pointer hover:brightness-105 transition-all flex items-center gap-1.5"
                            >
                              <span>📊</span>
                              <span>Report Card</span>
                            </button>

                            {report.fullGameState && (
                              <button
                                type="button"
                                onClick={() => {
                                  playSound('startGame');
                                  onLoadFullGameState(report.fullGameState);
                                  onClose();
                                }}
                                className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-sans font-extrabold uppercase tracking-wider text-xs shadow cursor-pointer transition-all flex items-center gap-1.5"
                                title="Resume this saved game table state"
                              >
                                <span>▶️</span>
                                <span>Resume Table</span>
                              </button>
                            )}

                            {confirmDeleteReportId === report.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteReport(report.id)}
                                  className="px-2.5 py-1.5 rounded-lg bg-rose-600 text-white text-[11px] font-bold cursor-pointer"
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteReportId(null)}
                                  className="px-2 py-1.5 rounded-lg felt-well text-[11px] cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteReportId(report.id)}
                                className="w-8 h-8 rounded-xl border border-rose-500/30 hover:border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center text-xs cursor-pointer"
                                title="Delete Session Report"
                              >
                                🗑️
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

          {/* TAB 3: AUTO-GROWING CLOUD SENTENCE BANK */}
          {activeTab === 'sentences' && (
            <div className="space-y-4">
              {/* Summary Banner */}
              <div className="p-4 rounded-xl felt-well border border-[#d4af37]/40 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm sm:text-base font-sans font-extrabold uppercase tracking-wider text-slate-900 dark:text-[#fef08a]">
                    🧠 Auto-Growing Cloud Sentence Bank
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-amber-200/70">
                    Every verified sentence generated in Live Gemini AI mode is automatically archived to Firestore and merged into your Offline Curated Bank.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full bg-amber-500/15 border border-[#d4af37]/40 font-sans tabular-nums text-xs font-bold text-amber-900 dark:text-[#fef08a]">
                    📚 Built-In: {staticCounts.totalCount}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/50 font-sans tabular-nums text-xs font-bold text-emerald-800 dark:text-emerald-300">
                    ☁️ Cloud AI: {sentences.length}
                  </span>
                </div>
              </div>

              {/* Filter Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                <input
                  type="text"
                  value={sentenceSearch}
                  onChange={(e) => setSentenceSearch(e.target.value)}
                  placeholder="Search sentence or rule..."
                  className="px-3 py-2 rounded-xl felt-well border border-[#d4af37]/40 text-xs text-slate-900 dark:text-white focus:outline-none"
                />
                <select
                  value={sentenceTopicFilter}
                  onChange={(e) => setSentenceTopicFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl felt-well border border-[#d4af37]/40 text-xs text-slate-900 dark:text-white focus:outline-none"
                >
                  <option value="ALL">All Topics</option>
                  {GRAMMAR_TOPICS.filter((t) => t !== 'My own choice').map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <select
                  value={sentenceLevelFilter}
                  onChange={(e) => setSentenceLevelFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl felt-well border border-[#d4af37]/40 text-xs text-slate-900 dark:text-white focus:outline-none"
                >
                  <option value="ALL">All CEFR Levels</option>
                  {CEFR_LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
                <select
                  value={sentenceFormatFilter}
                  onChange={(e) => setSentenceFormatFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl felt-well border border-[#d4af37]/40 text-xs text-slate-900 dark:text-white focus:outline-none"
                >
                  <option value="ALL">All Formats</option>
                  <option value="binary">⚖️ Valid or Flawed</option>
                  <option value="multipleChoice">🔠 Multiple-Choice Cloze</option>
                  <option value="openCloze">✍️ Open Cloze</option>
                  <option value="wordFormation">🧬 Word Formation</option>
                </select>
              </div>

              {/* Cloud Sentences List */}
              {filteredSentences.length === 0 ? (
                <div className="p-8 rounded-2xl felt-well text-center space-y-2">
                  <div className="text-3xl opacity-60">🧠</div>
                  <div className="text-sm font-sans font-bold text-slate-700 dark:text-amber-100">
                    {sentences.length === 0
                      ? 'No Cloud AI Sentences Archived Yet'
                      : 'No Sentences Match Your Filter'}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-amber-200/60 max-w-md mx-auto">
                    {sentences.length === 0
                      ? 'Play any round with Live Gemini AI unlocked and each generated sentence will automatically appear here for review.'
                      : 'Try clearing your search or selecting "All Topics" / "All CEFR Levels".'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[48vh] overflow-y-auto pr-1 modal-content-scroll">
                  {filteredSentences.map((item) => {
                    const isCloze =
                      item.questionType === 'multipleChoice' ||
                      item.questionType === 'openCloze' ||
                      item.questionType === 'wordFormation';
                    return (
                      <div
                        key={item.id}
                        className="p-3.5 rounded-xl felt-well border border-[#d4af37]/30 hover:border-[#d4af37]/60 transition-all flex items-start justify-between gap-3"
                      >
                        <div className="space-y-1.5 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-sans tabular-nums font-bold">
                            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-900 dark:text-[#fef08a] border border-[#d4af37]/40">
                              {item.topic} &middot; {item.level}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-purple-500/15 text-purple-900 dark:text-purple-200 border border-purple-400/30">
                              {item.questionType === 'multipleChoice'
                                ? '🔠 MC Cloze'
                                : item.questionType === 'openCloze'
                                  ? '✍️ Open Cloze'
                                  : item.questionType === 'wordFormation'
                                    ? `🧬 Word Form (${item.baseWord || 'ROOT'})`
                                    : '⚖️ Binary'}
                            </span>
                            {isCloze ? (
                              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-400/40">
                                Answer: &ldquo;{item.correctAnswer}&rdquo;
                              </span>
                            ) : (
                              <span
                                className={`px-2 py-0.5 rounded border ${
                                  item.isCorrect
                                    ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-400/40'
                                    : 'bg-rose-500/20 text-rose-800 dark:text-rose-300 border-rose-400/40'
                                }`}
                              >
                                {item.isCorrect ? '✓ VALID' : '✕ FLAWED'}
                              </span>
                            )}
                          </div>

                          <p className="text-sm sm:text-base font-editorial italic text-slate-900 dark:text-amber-50">
                            &ldquo;{item.text}&rdquo;
                          </p>

                          {(!item.isCorrect || isCloze) && item.correction && (
                            <div className="text-xs text-emerald-800 dark:text-emerald-300 font-medium">
                              <strong>Revision:</strong> &ldquo;{item.correction}&rdquo;
                            </div>
                          )}

                          <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                            🎓 {item.explanation}
                          </div>
                        </div>

                        <div className="shrink-0">
                          {confirmDeleteSentenceId === item.id ? (
                            <div className="flex flex-col gap-1">
                              <button
                                type="button"
                                onClick={() => handleDeleteSentence(item.id)}
                                className="px-2.5 py-1 rounded bg-rose-600 text-white text-[10px] font-bold cursor-pointer"
                              >
                                Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteSentenceId(null)}
                                className="px-2 py-1 rounded felt-well text-[10px] cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteSentenceId(item.id)}
                              className="w-8 h-8 rounded-xl border border-rose-500/30 hover:border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center text-xs cursor-pointer"
                              title="Remove sentence from Cloud Sentence Bank"
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        </>
        )}

        {/* Footer */}
        <div className="px-5 py-3 bg-amber-50/70 dark:bg-[#04180e] border-t border-[#d4af37]/30 flex items-center justify-between">
          <div className="text-[11px] font-sans text-slate-500 dark:text-amber-200/60">
            {isTeacherSignedIn ? <>Signed in as {teacherEmail} &middot; Connected to Firestore</> : 'Teacher not signed in'}
          </div>
          <ActionButton onClick={onClose} playSound={playSound} variant="outline-gold" className="py-2 px-5 text-xs">
            Close Vault
          </ActionButton>
        </div>
      </div>
    </div>
  );
};
export default CloudManagerModal;
