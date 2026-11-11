import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  Check,
  Cloud,
  Lock,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
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
import { PlayerAvatar } from './PlayerAvatar';
import { getBuiltInCuratedSentencesForCloudSeed, getStaticBankCounts } from '../services/fallbackSentences';
import { generateSentence } from '../services/geminiService';
import {
  archiveSentenceToCloudBank,
  CloudCuratedSentence,
  CloudRoster,
  CloudSessionReport,
  deleteCloudCuratedSentence,
  deleteCloudRoster,
  deleteCloudSessionReport,
  getMissingBuiltInCloudSeedCount,
  listCloudRosters,
  listCloudSessionReports,
  saveCloudRoster,
  saveCloudSessionReport,
  seedBuiltInBankToCloud,
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

  // Cloud Seeder & AI Batch Generator state
  const [isSeedingBuiltIn, setIsSeedingBuiltIn] = useState<boolean>(false);
  const [seedProgress, setSeedProgress] = useState<{ done: number; total: number } | null>(null);
  const [batchTopic, setBatchTopic] = useState<string>(
    settings.topic && settings.topic !== 'My own choice' ? settings.topic : 'Tenses'
  );
  const [batchLevel, setBatchLevel] = useState<CEFRLevel>(settings.level || 'B2');
  const [batchFormat, setBatchFormat] = useState<QuestionType>('binary');
  const [batchCount, setBatchCount] = useState<number>(5);
  const [isBatchGenerating, setIsBatchGenerating] = useState<boolean>(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);

  const staticCounts = useMemo(() => getStaticBankCounts(), []);
  const missingBuiltInSeedCount = useMemo(
    () => getMissingBuiltInCloudSeedCount(sentences, getBuiltInCuratedSentencesForCloudSeed()),
    [sentences]
  );

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
        text: `Saved roster "${saved.name}" (${saved.playerCount} students) to Cloud!`,
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

  const handleSeedBuiltInToCloud = async () => {
    if (isSeedingBuiltIn || isBatchGenerating) return;
    playSound('click');
    setIsSeedingBuiltIn(true);
    setNotice(null);
    setSeedProgress({ done: 0, total: Math.max(1, missingBuiltInSeedCount) });
    try {
      const res = await seedBuiltInBankToCloud(sentences, getBuiltInCuratedSentencesForCloudSeed(), (done, total) => {
        setSeedProgress({ done, total });
      });
      setSentences(res.updatedList);
      if (res.ok) {
        playSound('success');
        setNotice({
          type: 'success',
          text:
            res.addedCount > 0
              ? `Pushed ${res.addedCount} curated sentences to Firestore! Cloud bank now holds ${res.totalCloudCount} sentences.`
              : `All ${staticCounts.totalCount} built-in sentences are already in your Firestore Cloud Bank!`,
        });
      } else {
        playSound('error');
        setNotice({
          type: 'error',
          text: res.error || 'Could not seed built-in sentences to Firestore.',
        });
      }
    } finally {
      setIsSeedingBuiltIn(false);
      setSeedProgress(null);
    }
  };

  const handleBatchGenerateWithAi = async () => {
    if (isBatchGenerating || isSeedingBuiltIn) return;
    playSound('click');
    setIsBatchGenerating(true);
    setNotice(null);
    setBatchProgress({ done: 0, total: batchCount });

    const pastTexts: string[] = sentences
      .filter((s) => s.level === batchLevel)
      .map((s) => (s.leadInSentence ? `${s.leadInSentence} -> ${s.correction}` : s.text));

    let added = 0;
    const newlyArchived: CloudCuratedSentence[] = [];

    try {
      for (let i = 0; i < batchCount; i++) {
        const genSettings: Settings = {
          topic: batchTopic,
          level: batchLevel,
          theme: settings.theme || 'General',
          challengeFormat: batchFormat,
        };
        const forceCorrect = batchFormat === 'binary' ? i % 2 === 0 : null;
        const generated = await generateSentence(
          genSettings,
          pastTexts,
          forceCorrect,
          null,
          [],
          batchFormat
        );
        if (generated && generated.text) {
          pastTexts.push(
            generated.leadInSentence
              ? `${generated.leadInSentence} -> ${generated.correction}`
              : generated.text
          );
          const archived = await archiveSentenceToCloudBank(generated, genSettings);
          if (archived) {
            added++;
            newlyArchived.push(archived);
            setSentences((prev) => [archived, ...prev.filter((p) => p.id !== archived.id)]);
          }
        }
        setBatchProgress({ done: i + 1, total: batchCount });
      }

      if (added > 0) {
        playSound('success');
        setNotice({
          type: 'success',
          text: `Generated & archived ${added} new ${batchLevel} ${batchTopic} sentence${added === 1 ? '' : 's'} to Firestore!`,
        });
      } else {
        playSound('error');
        setNotice({
          type: 'error',
          text: 'Could not archive new AI sentences. Check your connection or Groq API status.',
        });
      }
    } catch (err: any) {
      playSound('error');
      setNotice({
        type: 'error',
        text: err?.message || 'Batch generation encountered an error.',
      });
    } finally {
      setIsBatchGenerating(false);
      setBatchProgress(null);
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

  const cardCls = 'p-4 rounded-gc bg-gc-line/[0.04] border border-gc-line/[0.12]';
  const inputCls =
    'w-full h-11 px-3 rounded-gc-sm border border-gc-line/[0.2] bg-gc-bg/60 text-gc-body text-gc-ink placeholder:text-gc-quiet/70 focus:outline-none focus:border-gc-gold focus:ring-2 focus:ring-gc-gold/30';

  const tabs: { id: CloudManagerTab; label: string; icon: string; count: number }[] = [
    { id: 'rosters', label: 'Class rosters', icon: '👥', count: rosters.length },
    { id: 'reports', label: 'Session reports & saves', icon: '📜', count: reports.length },
    { id: 'sentences', label: 'Sentence bank', icon: '🧠', count: sentences.length },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 dark:bg-black/75 backdrop-blur-sm flex justify-center items-center z-50 p-3 sm:p-4"
      onClick={() => {
        playSound('click');
        onClose();
      }}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 12 }}
        transition={{ type: 'spring', damping: 28, stiffness: 340 }}
        role="dialog"
        aria-modal="true"
        aria-label="Cloud saves and rosters"
        className="gc-panel rounded-gc-lg w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-gc-line/[0.12] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 shrink-0 rounded-gc-sm bg-gc-gold/15 border border-gc-gold/40 text-gc-gold grid place-items-center">
              <Cloud className="w-5 h-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-gc-cap font-semibold text-gc-quiet">
                Class rosters &middot; Session reports &amp; saves &middot; Auto-growing AI sentence bank
              </p>
              <h2 className="font-logo text-gc-title font-bold text-gc-ink truncate">
                Cloud saves &amp; rosters
              </h2>
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
                className="h-10 px-3.5 rounded-full bg-gc-line/[0.06] hover:bg-gc-line/[0.12] border border-gc-line/[0.14] text-gc-small font-bold text-gc-ink inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                title="Refresh Cloud data from Firestore"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
                <span>{isLoading ? 'Syncing…' : 'Sync'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                playSound('click');
                onClose();
              }}
              aria-label="Close"
              className="w-10 h-10 shrink-0 rounded-full bg-gc-line/[0.06] hover:bg-gc-line/[0.12] text-gc-quiet hover:text-gc-ink grid place-items-center transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {!isTeacherSignedIn ? (
          <div className="p-6 sm:p-8 overflow-y-auto flex-1 modal-content-scroll text-gc-ink">
            <div className="max-w-lg mx-auto space-y-4">
              <div className={`${cardCls} flex items-start gap-3.5`}>
                <span className="w-10 h-10 shrink-0 rounded-gc-sm bg-gc-gold/15 border border-gc-gold/40 text-gc-gold grid place-items-center mt-0.5">
                  <Lock className="w-5 h-5" aria-hidden="true" />
                </span>
                <div className="space-y-1 min-w-0">
                  <h3 className="text-gc-body font-bold text-gc-ink">
                    Teacher sign-in required
                  </h3>
                  <p className="text-gc-small text-gc-quiet leading-relaxed">
                    Class rosters and session reports contain your students&apos; names and scores, so they open only for the teacher&apos;s Google account (<strong>{VERIFIED_TEACHER_EMAIL}</strong>).
                  </p>
                </div>
              </div>

              {notice && (
                <div
                  role="status"
                  className={`p-3.5 rounded-gc border text-gc-small font-semibold flex items-start gap-2.5 ${
                    notice.type === 'success'
                      ? 'bg-gc-win/10 border-gc-win/30 text-gc-win'
                      : 'bg-gc-loss/10 border-gc-loss/30 text-gc-loss'
                  }`}
                >
                  {notice.type === 'success' ? (
                    <Check className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  )}
                  <span>{notice.text}</span>
                </div>
              )}

              {isDesktopApp ? (
                <div className={`${cardCls} text-gc-small text-gc-quiet leading-relaxed`}>
                  Google sign-in doesn&apos;t open inside the desktop app. Open the web version of Grammar Casino in your browser to manage Cloud rosters and reports.
                </div>
              ) : (
                <div className={`${cardCls} flex flex-wrap items-center justify-between gap-3`}>
                  <div className="min-w-0">
                    <p className="text-gc-body font-bold text-gc-ink">Sign in with Google</p>
                    <p className="text-gc-small text-gc-quiet">
                      {teacherEmail
                        ? `Currently signed in as ${teacherEmail}. Switch to ${VERIFIED_TEACHER_EMAIL}.`
                        : `Sign in with ${VERIFIED_TEACHER_EMAIL} to open your rosters and saved sessions.`}
                    </p>
                  </div>
                  <ActionButton
                    type="button"
                    onClick={handleCloudSignIn}
                    playSound={playSound}
                    variant="primary"
                    disabled={isSigningIn}
                    className="h-11 px-5 text-gc-small font-bold"
                  >
                    {isSigningIn
                      ? 'Signing in…'
                      : teacherEmail
                        ? 'Switch Google account'
                        : 'Sign in with Google'}
                  </ActionButton>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Navigation Tabs */}
            <div className="px-4 sm:px-6 pt-3 pb-3 border-b border-gc-line/[0.12]">
              <div className="flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Cloud sections">
                {tabs.map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => {
                        playSound('click');
                        setActiveTab(tab.id);
                        setViewingReport(null);
                      }}
                      className={`shrink-0 h-10 px-3.5 rounded-full border text-gc-small font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-turn ${
                        isActive
                          ? 'bg-gc-gold/15 border-gc-gold text-gc-ink'
                          : 'border-transparent text-gc-quiet hover:text-gc-ink hover:bg-gc-line/[0.06]'
                      }`}
                    >
                      <span aria-hidden="true">{tab.icon}</span>
                      <span className="whitespace-nowrap">{tab.label}</span>
                      <span className="px-1.5 py-0.5 rounded-full bg-gc-line/[0.08] text-gc-cap tabular-nums">
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Body Content */}
            <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5 text-gc-ink modal-content-scroll">
              {notice && (
                <div
                  role="status"
                  className={`p-3.5 rounded-gc border text-gc-small font-semibold flex items-center justify-between gap-3 ${
                    notice.type === 'success'
                      ? 'bg-gc-win/10 border-gc-win/30 text-gc-win'
                      : 'bg-gc-loss/10 border-gc-loss/30 text-gc-loss'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {notice.type === 'success' ? (
                      <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                    )}
                    <span>{notice.text}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNotice(null)}
                    aria-label="Dismiss notice"
                    className="text-gc-small opacity-75 hover:opacity-100 cursor-pointer"
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              )}

              {/* TAB 1: CLASSROOM ROSTERS */}
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

              {/* TAB 2: SESSION REPORTS & CLOUD SAVES */}
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

              {/* TAB 3: AUTO-GROWING CLOUD SENTENCE BANK */}
              {activeTab === 'sentences' && (
                <div className="space-y-4">
                  <div className={`${cardCls} space-y-3.5`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-gc-body font-bold text-gc-ink">
                          Auto-growing Cloud &amp; Offline sentence bank
                        </h3>
                        <p className="text-gc-small text-gc-quiet">
                          Uses incremental delta-syncing so large banks of 1,000+ sentences cost almost zero daily Firestore reads.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="h-7 px-3 inline-flex items-center rounded-full bg-gc-line/[0.08] text-gc-cap font-bold text-gc-ink tabular-nums"
                          title={`Right/Wrong: ${staticCounts.binaryCount} · MC/Open Cloze: ${staticCounts.clozeCount} · Word Form: ${staticCounts.wordFormationCount} · Key Word: ${staticCounts.keyWordTransformationCount}`}
                        >
                          Built-in Offline: {staticCounts.totalCount}
                        </span>
                        <span className="h-7 px-3 inline-flex items-center rounded-full bg-gc-win/15 border border-gc-win/30 text-gc-cap font-bold text-gc-win tabular-nums">
                          Firestore Cloud: {sentences.length}
                        </span>
                      </div>
                    </div>

                    {/* Format Breakdown & One-Click Cloud Seeder */}
                    <div className="pt-2.5 border-t border-gc-line/[0.1] flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-1.5 text-gc-cap text-gc-quiet tabular-nums">
                        <span className="px-2 py-0.5 rounded bg-gc-bg/60 border border-gc-line/[0.12]">
                          ⚖️ Binary: <strong>{staticCounts.binaryCount}</strong>
                        </span>
                        <span className="px-2 py-0.5 rounded bg-gc-bg/60 border border-gc-line/[0.12]">
                          🔠/✍️ Cloze: <strong>{staticCounts.clozeCount}</strong>
                        </span>
                        <span className="px-2 py-0.5 rounded bg-gc-bg/60 border border-gc-line/[0.12]">
                          🧬 Word Form: <strong>{staticCounts.wordFormationCount}</strong>
                        </span>
                        <span className="px-2 py-0.5 rounded bg-gc-bg/60 border border-gc-line/[0.12]">
                          🔑 Key Word: <strong>{staticCounts.keyWordTransformationCount}</strong>
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <ActionButton
                          type="button"
                          onClick={handleSeedBuiltInToCloud}
                          playSound={playSound}
                          variant={missingBuiltInSeedCount > 0 ? 'primary' : 'ghost'}
                          disabled={isSeedingBuiltIn || isBatchGenerating || missingBuiltInSeedCount === 0}
                          className="h-9 px-3.5 text-gc-cap font-bold"
                          title="Batch-upload all built-in curated sentences to Firestore curated_sentences"
                        >
                          {isSeedingBuiltIn && seedProgress
                            ? `Pushing to Cloud (${seedProgress.done}/${seedProgress.total})…`
                            : missingBuiltInSeedCount > 0
                              ? `⬆️ Push Built-in Bank to Cloud (+${missingBuiltInSeedCount})`
                              : '✓ All Built-in Sentences in Cloud'}
                        </ActionButton>
                      </div>
                    </div>
                  </div>

                  {/* AI Batch Generator into Cloud Bank */}
                  <div className={`${cardCls} space-y-2.5`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="text-gc-small font-bold text-gc-ink">
                          ✨ Batch-Populate Cloud Bank with AI (Groq GPT-OSS 120B)
                        </h4>
                        <p className="text-gc-cap text-gc-quiet">
                          Generate a fresh batch of verified Cambridge-style sentences and archive them directly to Firestore for offline play.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1">
                      <select
                        value={batchTopic}
                        onChange={(e) => setBatchTopic(e.target.value)}
                        disabled={isBatchGenerating}
                        aria-label="Batch generation grammar topic"
                        className={`sm:col-span-3 ${inputCls}`}
                      >
                        {GRAMMAR_TOPICS.filter((t) => t !== 'My own choice').map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                        <option value="Passive Voice">Passive Voice</option>
                      </select>

                      <select
                        value={batchLevel}
                        onChange={(e) => setBatchLevel(e.target.value as CEFRLevel)}
                        disabled={isBatchGenerating}
                        aria-label="Batch generation CEFR level"
                        className={`sm:col-span-2 ${inputCls}`}
                      >
                        {CEFR_LEVELS.map((l) => (
                          <option key={l} value={l}>
                            Level {l}
                          </option>
                        ))}
                      </select>

                      <select
                        value={batchFormat}
                        onChange={(e) => setBatchFormat(e.target.value as QuestionType)}
                        disabled={isBatchGenerating}
                        aria-label="Batch generation format"
                        className={`sm:col-span-3 ${inputCls}`}
                      >
                        <option value="binary">⚖️ Right or Wrong</option>
                        <option value="multipleChoice">🔠 Multiple-Choice Gap</option>
                        <option value="openCloze">✍️ Open Cloze</option>
                        <option value="wordFormation">🧬 Word Formation</option>
                        <option value="keyWordTransformation">🔑 Key Word Transformation</option>
                      </select>

                      <select
                        value={batchCount}
                        onChange={(e) => setBatchCount(Number(e.target.value))}
                        disabled={isBatchGenerating}
                        aria-label="Number of sentences to generate"
                        className={`sm:col-span-2 ${inputCls}`}
                      >
                        <option value={3}>3 sentences</option>
                        <option value={5}>5 sentences</option>
                        <option value={8}>8 sentences</option>
                      </select>

                      <div className="sm:col-span-2 flex">
                        <ActionButton
                          type="button"
                          onClick={handleBatchGenerateWithAi}
                          playSound={playSound}
                          variant="primary"
                          disabled={isBatchGenerating || isSeedingBuiltIn}
                          className="w-full h-11 px-3 text-gc-cap font-bold"
                        >
                          {isBatchGenerating && batchProgress
                            ? `${batchProgress.done}/${batchProgress.total}…`
                            : 'Generate'}
                        </ActionButton>
                      </div>
                    </div>
                  </div>

                  {/* Filter Bar */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                    <input
                      type="text"
                      value={sentenceSearch}
                      onChange={(e) => setSentenceSearch(e.target.value)}
                      placeholder="Search sentence or rule…"
                      className={inputCls}
                    />
                    <select
                      value={sentenceTopicFilter}
                      onChange={(e) => setSentenceTopicFilter(e.target.value)}
                      className={inputCls}
                    >
                      <option value="ALL">All topics</option>
                      {GRAMMAR_TOPICS.filter((t) => t !== 'My own choice').map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                      <option value="Passive Voice">Passive Voice</option>
                    </select>
                    <select
                      value={sentenceLevelFilter}
                      onChange={(e) => setSentenceLevelFilter(e.target.value)}
                      className={inputCls}
                    >
                      <option value="ALL">All CEFR levels</option>
                      {CEFR_LEVELS.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <select
                      value={sentenceFormatFilter}
                      onChange={(e) => setSentenceFormatFilter(e.target.value)}
                      className={inputCls}
                    >
                      <option value="ALL">All formats</option>
                      <option value="binary">⚖️ Right or Wrong</option>
                      <option value="multipleChoice">🔠 Multiple-Choice Gap</option>
                      <option value="openCloze">✍️ Open Cloze</option>
                      <option value="wordFormation">🧬 Word Formation</option>
                      <option value="keyWordTransformation">🔑 Key Word Transformation</option>
                    </select>
                  </div>

                  {/* Cloud Sentences List */}
                  {filteredSentences.length === 0 ? (
                    <div className={`${cardCls} py-8 text-center space-y-1.5`}>
                      <p className="text-gc-body font-bold text-gc-ink">
                        {sentences.length === 0
                          ? 'No Cloud AI sentences archived yet'
                          : 'No sentences match your filter'}
                      </p>
                      <p className="text-gc-small text-gc-quiet max-w-md mx-auto">
                        {sentences.length === 0
                          ? 'Generated sentences will automatically appear here when you are signed in.'
                          : 'Try clearing your search or selecting "All topics" and "All CEFR levels".'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[48vh] overflow-y-auto pr-1 modal-content-scroll">
                      {filteredSentences.map((item) => {
                        const isCloze =
                          item.questionType === 'multipleChoice' ||
                          item.questionType === 'openCloze' ||
                          item.questionType === 'wordFormation' ||
                          item.questionType === 'keyWordTransformation';
                        return (
                          <div
                            key={item.id}
                            className={`${cardCls} flex items-start justify-between gap-3`}
                          >
                            <div className="space-y-1.5 min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5 text-gc-cap font-bold tabular-nums">
                                <span className="px-2 py-0.5 rounded-full bg-gc-gold/15 border border-gc-gold/40 text-gc-ink">
                                  {item.topic} &middot; {item.level}
                                </span>
                                <span className="px-2 py-0.5 rounded-full bg-gc-line/[0.08] text-gc-quiet">
                                  {item.questionType === 'multipleChoice'
                                    ? '🔠 MC Cloze'
                                    : item.questionType === 'openCloze'
                                      ? '✍️ Open Cloze'
                                      : item.questionType === 'wordFormation'
                                        ? `🧬 Word Form (${item.baseWord || 'ROOT'})`
                                        : item.questionType === 'keyWordTransformation'
                                          ? `🔑 Key Word (${item.baseWord || 'KEY'})`
                                          : '⚖️ Right or Wrong'}
                                </span>
                                {isCloze ? (
                                  <span className="px-2 py-0.5 rounded-full bg-gc-win/15 text-gc-win">
                                    Answer: &ldquo;{item.correctAnswer}&rdquo;
                                  </span>
                                ) : (
                                  <span
                                    className={`px-2 py-0.5 rounded-full ${
                                      item.isCorrect
                                        ? 'bg-gc-win/15 text-gc-win'
                                        : 'bg-gc-loss/15 text-gc-loss'
                                    }`}
                                  >
                                    {item.isCorrect ? '✓ Right' : '✕ Wrong'}
                                  </span>
                                )}
                              </div>

                              <p className="text-gc-body font-semibold text-gc-ink">
                                &ldquo;{item.text}&rdquo;
                              </p>

                              {(!item.isCorrect || isCloze) && item.correction && (
                                <p className="text-gc-small text-gc-win font-medium">
                                  <strong>Correct form:</strong> &ldquo;{item.correction}&rdquo;
                                </p>
                              )}

                              <p className="text-gc-small text-gc-quiet leading-relaxed">
                                {item.explanation}
                              </p>
                            </div>

                            <div className="shrink-0">
                              {confirmDeleteSentenceId === item.id ? (
                                <div className="flex flex-col gap-1">
                                  <ActionButton
                                    type="button"
                                    onClick={() => handleDeleteSentence(item.id)}
                                    variant="danger"
                                    className="h-8 px-2.5 text-gc-cap font-bold"
                                  >
                                    Delete
                                  </ActionButton>
                                  <ActionButton
                                    type="button"
                                    onClick={() => setConfirmDeleteSentenceId(null)}
                                    variant="ghost"
                                    className="h-8 px-2 text-gc-cap font-bold"
                                  >
                                    Cancel
                                  </ActionButton>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteSentenceId(item.id)}
                                  className="w-9 h-9 rounded-full border border-gc-loss/30 hover:border-gc-loss bg-gc-loss/10 text-gc-loss grid place-items-center transition-colors cursor-pointer"
                                  title="Remove sentence from Cloud Sentence Bank"
                                  aria-label="Remove sentence"
                                >
                                  <Trash2 className="w-4 h-4" aria-hidden="true" />
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
        <div className="px-5 sm:px-6 py-3.5 border-t border-gc-line/[0.12] flex items-center justify-between gap-3">
          <p className="text-gc-cap text-gc-quiet truncate">
            {isTeacherSignedIn
              ? `Signed in as ${teacherEmail} · Connected to Firestore`
              : 'Not signed in'}
          </p>
          <ActionButton
            onClick={onClose}
            playSound={playSound}
            variant="ghost"
            className="h-10 px-5 text-gc-small font-bold"
          >
            Close
          </ActionButton>
        </div>
      </motion.div>
    </motion.div>
  );
};
export default CloudManagerModal;
