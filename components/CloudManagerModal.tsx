import React, { useState, useEffect, useMemo } from 'react';
import { CloudRostersTab } from './cloud/CloudRostersTab';
import { CloudReportsTab } from './cloud/CloudReportsTab';
import { CloudSentencesTab } from './cloud/CloudSentencesTab';
import { useFocusTrap } from '../utils/useFocusTrap';
import { motion } from 'motion/react';
import { AlertTriangle, Check, Cloud, Lock, RefreshCw, X } from 'lucide-react';
import { CEFRLevel, GameMode, Player, QuestionType, RoundHistoryRecord, Settings, SoundEffect } from '../types';
import ActionButton from './ActionButton';
import type { BuiltInSeedItem } from '../services/fallbackSentences';
import { generateSentence } from '../services/geminiService';
import { archiveSentenceToCloudBank, CloudCuratedSentence, CloudRoster, CloudSessionReport, deleteCloudCuratedSentence, deleteCloudRoster, deleteCloudSessionReport, getMissingBuiltInCloudSeedCount, listCloudRosters, listCloudSessionReports, saveCloudRoster, saveCloudSessionReport, seedBuiltInBankToCloud, signInTeacherWithGoogle, syncCloudSentenceBank } from '../services/firebaseService';

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
  // Rosters and reports hold student names, so the Firestore rules keep each teacher's in their
  // own private space (package A6). The vault asks for a Google sign-in instead of failing quietly.
  // App passes the email only for a verified Google sign-in.
  const isTeacherSignedIn = Boolean(teacherEmail);
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

  // Package L1: the built-in bank loads only when this window opens, not with the game.
  const [bank, setBank] = useState<{ counts: ReturnType<typeof import('../services/fallbackSentences')['getStaticBankCounts']>; seed: BuiltInSeedItem[] } | null>(null);
  useEffect(() => {
    if (!isOpen || bank) return;
    let alive = true;
    void import('../services/fallbackSentences').then(m => {
      if (alive) setBank({ counts: m.getStaticBankCounts(), seed: m.getBuiltInCuratedSentencesForCloudSeed() });
    });
    return () => { alive = false; };
  }, [isOpen, bank]);
  const staticCounts = bank?.counts ?? { totalCount: 0, binaryCount: 0, clozeCount: 0, wordFormationCount: 0, keyWordTransformationCount: 0 };
  const builtInSeed = useMemo(() => bank?.seed ?? [], [bank]);
  const missingBuiltInSeedCount = useMemo(
    () => getMissingBuiltInCloudSeedCount(sentences, builtInSeed),
    [sentences, bank]
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
        text: 'This Google account has no verified email, so it cannot keep class lists. Try another account.',
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

  // Package S8: the keyboard stays in this window while it is open.
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef, isOpen);
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
      const res = await seedBuiltInBankToCloud(sentences, builtInSeed, (done, total) => {
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
        ref={dialogRef}
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
                    Class rosters and session reports contain your students&apos; names and scores. Sign in with your Google account and they are kept in your own private space: no other teacher can see them.
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
                      Sign in with your Google account to open your rosters and saved sessions.
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
              <CloudRostersTab
                activeTab={activeTab}
                activeRosterObj={activeRosterObj}
                players={players}
                handleUpdateExistingRoster={handleUpdateExistingRoster}
                playSound={playSound}
                isSavingRoster={isSavingRoster}
                cardCls={cardCls}
                handleCreateNewRoster={handleCreateNewRoster}
                newRosterName={newRosterName}
                setNewRosterName={setNewRosterName}
                inputCls={inputCls}
                newRosterNotes={newRosterNotes}
                setNewRosterNotes={setNewRosterNotes}
                rosters={rosters}
                bailoutZeroOnResume={bailoutZeroOnResume}
                setBailoutZeroOnResume={setBailoutZeroOnResume}
                activeRosterId={activeRosterId}
                onLoadRoster={onLoadRoster}
                onClose={onClose}
                startingCash={startingCash}
                confirmDeleteRosterId={confirmDeleteRosterId}
                handleDeleteRoster={handleDeleteRoster}
                setConfirmDeleteRosterId={setConfirmDeleteRosterId}
              />

              {/* TAB 2: SESSION REPORTS & CLOUD SAVES */}
              <CloudReportsTab
                activeTab={activeTab}
                viewingReport={viewingReport}
                setViewingReport={setViewingReport}
                playSound={playSound}
                targetAmount={targetAmount}
                cardCls={cardCls}
                roundHistory={roundHistory}
                players={players}
                handleSaveCurrentSessionReport={handleSaveCurrentSessionReport}
                newReportTitle={newReportTitle}
                setNewReportTitle={setNewReportTitle}
                settings={settings}
                inputCls={inputCls}
                isSavingReport={isSavingReport}
                reports={reports}
                onLoadFullGameState={onLoadFullGameState}
                onClose={onClose}
                confirmDeleteReportId={confirmDeleteReportId}
                handleDeleteReport={handleDeleteReport}
                setConfirmDeleteReportId={setConfirmDeleteReportId}
              />

              {/* TAB 3: AUTO-GROWING CLOUD SENTENCE BANK */}
              <CloudSentencesTab
                activeTab={activeTab}
                cardCls={cardCls}
                staticCounts={staticCounts}
                sentences={sentences}
                handleSeedBuiltInToCloud={handleSeedBuiltInToCloud}
                playSound={playSound}
                missingBuiltInSeedCount={missingBuiltInSeedCount}
                isSeedingBuiltIn={isSeedingBuiltIn}
                isBatchGenerating={isBatchGenerating}
                seedProgress={seedProgress}
                batchTopic={batchTopic}
                setBatchTopic={setBatchTopic}
                inputCls={inputCls}
                batchLevel={batchLevel}
                setBatchLevel={setBatchLevel}
                batchFormat={batchFormat}
                setBatchFormat={setBatchFormat}
                batchCount={batchCount}
                setBatchCount={setBatchCount}
                handleBatchGenerateWithAi={handleBatchGenerateWithAi}
                batchProgress={batchProgress}
                sentenceSearch={sentenceSearch}
                setSentenceSearch={setSentenceSearch}
                sentenceTopicFilter={sentenceTopicFilter}
                setSentenceTopicFilter={setSentenceTopicFilter}
                sentenceLevelFilter={sentenceLevelFilter}
                setSentenceLevelFilter={setSentenceLevelFilter}
                sentenceFormatFilter={sentenceFormatFilter}
                setSentenceFormatFilter={setSentenceFormatFilter}
                filteredSentences={filteredSentences}
                confirmDeleteSentenceId={confirmDeleteSentenceId}
                handleDeleteSentence={handleDeleteSentence}
                setConfirmDeleteSentenceId={setConfirmDeleteSentenceId}
              />
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
