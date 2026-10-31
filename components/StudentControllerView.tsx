import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  AVATARS,
  HINT_COST,
  POWERUP_COST,
  POWER_UPS,
} from '../constants';
import { Bet, Player, PowerUpKey, QuestionType, SoundEffect, WheelItem } from '../types';
import {
  PlayerViewPayload,
  StudentIntent,
  isBetCompleteForQuestionType,
  isValidKeyWordTransformationPhrase,
} from '../utils/multiplayerProtocol';
import { StudentRoomController } from '../services/multiplayerService';
import WheelModal from './WheelModal';
import Modal from './Modal';
import { StudentRoundTimerBar, useTurnCountdown } from './TurnTimer';
import { generateGrammarReportPDF } from '../utils/pdfGenerator';

const STUDENT_SESSION_STORAGE_KEY = 'grammar_casino_student_session_v1';

interface SavedStudentSession {
  code: string;
  name: string;
  avatar: string;
  reconnectToken: string;
  playerId: number;
}

interface StudentControllerViewProps {
  initialRoomCode?: string;
  onExitStudentMode: () => void;
  playSound: (sound: SoundEffect, ...args: any[]) => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
}

export const StudentControllerView: React.FC<StudentControllerViewProps> = ({
  initialRoomCode = '',
  onExitStudentMode,
  playSound,
  isDarkMode,
  onToggleTheme,
}) => {
  const [roomCodeInput, setRoomCodeInput] = useState(() => initialRoomCode.toUpperCase());
  const [playerNameInput, setPlayerNameInput] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(() => AVATARS[Math.floor(Math.random() * 28)]);
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinWaitingMessage, setJoinWaitingMessage] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const [view, setView] = useState<PlayerViewPayload | null>(null);
  const [localBet, setLocalBet] = useState<Bet>({});
  const [activeToast, setActiveToast] = useState<{ title: string; message: string; icon?: string } | null>(null);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfStatusToast, setPdfStatusToast] = useState<string | null>(null);
  const [lockWarning, setLockWarning] = useState<{
    message: string;
    missingField: 'answer' | 'wager' | 'both';
  } | null>(null);

  const controllerRef = useRef<StudentRoomController | null>(null);
  const seenNotificationIdRef = useRef<string | null>(null);
  const lastRoundRef = useRef<number>(-1);
  const lastSentenceTextRef = useRef<string>('');
  const lastStepRef = useRef<string>('');

  // Focus & scroll refs for incomplete lock-in warnings
  const answerSectionRef = useRef<HTMLDivElement>(null);
  const wagerSectionRef = useRef<HTMLDivElement>(null);
  const firstOpinionBtnRef = useRef<HTMLButtonElement>(null);
  const firstOptionBtnRef = useRef<HTMLButtonElement>(null);
  const clozeWordInputRef = useRef<HTMLInputElement>(null);
  const splitWord1InputRef = useRef<HTMLInputElement>(null);
  const splitWord2InputRef = useRef<HTMLInputElement>(null);
  const wagerInputRef = useRef<HTMLInputElement>(null);

  // Load saved session on mount and auto-reconnect if matching room code
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STUDENT_SESSION_STORAGE_KEY);
      if (!raw) return;
      const saved: SavedStudentSession = JSON.parse(raw);
      if (saved.name) setPlayerNameInput(saved.name);
      if (saved.avatar) setSelectedAvatar(saved.avatar);
      const targetCode = (initialRoomCode || saved.code || '').toUpperCase();
      if (targetCode) setRoomCodeInput(targetCode);

      if (saved.code && saved.reconnectToken && (!initialRoomCode || saved.code === initialRoomCode.toUpperCase())) {
        handleJoinRoom(saved.code, saved.name, saved.avatar, saved.reconnectToken);
      }
    } catch {
      // Ignore storage errors
    }
    return () => {
      controllerRef.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleViewUpdate = useCallback(
    (nextView: PlayerViewPayload) => {
      setView(nextView);

      const nextSentenceText = nextView.sentence?.text || '';
      const isNewRound = nextView.round !== lastRoundRef.current;
      const isRedealtSentence =
        Boolean(nextSentenceText) &&
        Boolean(lastSentenceTextRef.current) &&
        nextSentenceText !== lastSentenceTextRef.current;

      // Sync localBet when a new round starts or when the teacher redeals a fresh sentence
      if (isNewRound || isRedealtSentence) {
        lastRoundRef.current = nextView.round;
        lastSentenceTextRef.current = nextSentenceText;
        setLocalBet(nextView.myBet || {});
        setLockWarning(null);
      } else {
        if (nextSentenceText && !lastSentenceTextRef.current) {
          lastSentenceTextRef.current = nextSentenceText;
        }
        // Only clamp localBet.bet if the player's maximum allowed wager dropped (e.g. Bet Cap, Hint, Power-Up).
        // Never overwrite localBet.bet with stale server echoes while the player is typing.
        setLocalBet((prev) => {
          const maxAllowed = Math.max(
            0,
            nextView.isBetCapped
              ? Math.min(nextView.me.money, nextView.betCapAmount)
              : nextView.me.money
          );
          const minAllowed = nextView.isHighRoller
            ? Math.min(maxAllowed, Math.max(1, nextView.minBetAmount))
            : 0;
          let updated = prev;
          if (
            updated.bet !== undefined &&
            updated.bet !== '' &&
            Number(updated.bet) > maxAllowed
          ) {
            updated = { ...updated, bet: maxAllowed > 0 ? maxAllowed : '' };
          } else if (
            minAllowed > 0 &&
            (updated.bet === undefined || updated.bet === '' || Number(updated.bet) < minAllowed)
          ) {
            updated = { ...updated, bet: minAllowed };
          }
          // If 50/50 Scalpel eliminated a currently selected MC option, clear it locally too
          const eliminated = (nextView.scalpelHint?.eliminatedOptions || []).map(o =>
            o.trim().toLowerCase()
          );
          if (eliminated.length > 0) {
            if (updated.selectedOption && eliminated.includes(updated.selectedOption.trim().toLowerCase())) {
              updated = { ...updated, selectedOption: undefined };
            }
            if (Array.isArray(updated.splitOptions) && updated.splitOptions.length > 0) {
              const filtered = updated.splitOptions.filter(
                o => !eliminated.includes(o.trim().toLowerCase())
              );
              if (filtered.length !== updated.splitOptions.length) {
                updated = { ...updated, splitOptions: filtered };
              }
            }
          }
          return updated;
        });
      }

      // Haptic feedback when transitioning to RESULTS
      if (lastStepRef.current !== nextView.step) {
        if (nextView.step === 'RESULTS' && 'vibrate' in navigator) {
          try {
            const won = (nextView.myRoundResult?.amountChanged ?? 0) > 0;
            navigator.vibrate(won ? [80, 50, 120] : [180]);
          } catch {}
        }
        lastStepRef.current = nextView.step;
      }

      if (
        nextView.lastNotification &&
        nextView.lastNotification.id !== seenNotificationIdRef.current
      ) {
        seenNotificationIdRef.current = nextView.lastNotification.id;
        setActiveToast({
          title: nextView.lastNotification.title,
          message: nextView.lastNotification.message,
          icon: nextView.lastNotification.icon,
        });
        playSound('powerUp');
      }
    },
    [playSound]
  );

  const handleJoinRoom = async (
    codeOverride?: string,
    nameOverride?: string,
    avatarOverride?: string,
    tokenOverride?: string
  ) => {
    const code = (codeOverride ?? roomCodeInput).trim().toUpperCase();
    const name = (nameOverride ?? playerNameInput).trim();
    const avatar = avatarOverride ?? selectedAvatar;

    if (code.length < 4) {
      setJoinError('Please enter the 4-letter Room Code shown on the projector.');
      return;
    }
    if (!name) {
      setJoinError('Please enter your name to claim a seat.');
      return;
    }

    setIsJoining(true);
    setJoinError(null);
    setJoinWaitingMessage(null);

    try {
      let tokenToUse = tokenOverride || '';
      if (!tokenToUse) {
        try {
          const savedRaw = localStorage.getItem(STUDENT_SESSION_STORAGE_KEY);
          if (savedRaw) {
            const saved: SavedStudentSession = JSON.parse(savedRaw);
            if (saved.code === code && saved.name.toLowerCase() === name.toLowerCase()) {
              tokenToUse = saved.reconnectToken;
            }
          }
        } catch {}
      }

      controllerRef.current?.destroy();
      const ctrl = await StudentRoomController.joinRoom({
        code,
        name,
        avatar,
        reconnectToken: tokenToUse,
        onViewUpdate: handleViewUpdate,
        onKicked: () => {
          localStorage.removeItem(STUDENT_SESSION_STORAGE_KEY);
          setView(null);
          setJoinError('You were removed from the room or the room was closed.');
        },
        onConnectionChange: setIsConnected,
        onWaitingForTeacher: setJoinWaitingMessage,
      });

      controllerRef.current = ctrl;
      const sessionToSave: SavedStudentSession = {
        code: ctrl.code,
        name: ctrl.seat.name,
        avatar: ctrl.seat.avatar,
        reconnectToken: ctrl.seat.reconnectToken,
        playerId: ctrl.seat.playerId,
      };
      localStorage.setItem(STUDENT_SESSION_STORAGE_KEY, JSON.stringify(sessionToSave));
      playSound('addPlayer');
    } catch (err: any) {
      setJoinError(err.message || 'Could not connect to room.');
    } finally {
      setIsJoining(false);
      setJoinWaitingMessage(null);
    }
  };

  const sendIntent = useCallback((intent: StudentIntent) => {
    controllerRef.current?.sendIntent(intent);
  }, []);

  const { remainingMs: roundTimerRemainingMs } = useTurnCountdown(
    view?.roundTimer,
    view?.turnDurationMs || 0
  );

  const isRoundTimeUp = Boolean(
    view?.turnDurationMs &&
      view.turnDurationMs > 0 &&
      view.roundTimer &&
      (view.roundTimer.status === 'locked' ||
        (view.roundTimer.status === 'running' &&
          !view.roundTimer.held &&
          roundTimerRemainingMs <= 0) ||
        (view.roundTimer.status === 'paused' &&
          (view.roundTimer.remainingMs ?? 1) <= 0))
  );

  const isAutoLockedByLocalExpiry = Boolean(
    view?.turnDurationMs &&
      view.turnDurationMs > 0 &&
      view.roundTimer?.status === 'running' &&
      !view.roundTimer?.held &&
      roundTimerRemainingMs <= 0
  );

  const isPlayerLocked = Boolean(view?.lockedIn || isAutoLockedByLocalExpiry);
  const canStudentUnlock = Boolean(
    isPlayerLocked && !isRoundTimeUp && !view?.isProcessingResults
  );

  const updateBetField = (field: keyof Bet, value: any) => {
    if (!view || isPlayerLocked || view.isFrozen) return;
    let finalVal = value;
    if (field === 'bet') {
      const maxAllowed = Math.max(
        0,
        view.isBetCapped
          ? Math.min(view.me.money, view.betCapAmount)
          : view.me.money
      );
      const cleaned = String(value).replace(/[^\d]/g, '');
      if (cleaned === '') {
        finalVal = '';
      } else {
        const parsed = parseInt(cleaned, 10);
        finalVal = isNaN(parsed) ? '' : Math.max(0, Math.min(parsed, maxAllowed));
      }
    }
    setLocalBet((prev) => ({ ...prev, [field]: finalVal }));
    if (lockWarning) {
      setLockWarning(null);
    }
    sendIntent({ type: 'SET_BET', field, value: finalVal });
  };

  const handleToggleLockIn = () => {
    if (!view || view.isFrozen) return;
    if (isPlayerLocked) {
      // Players cannot unlock their bet after the round timer has expired; only the teacher can unlock
      if (!canStudentUnlock) return;
      playSound('click');
      setLockWarning(null);
      sendIntent({ type: 'LOCK_IN', locked: false });
      return;
    }

    const qType: QuestionType = view.sentence?.questionType || 'binary';
    const hasSplitBet = view.myActivePowerUps.some((pu) => pu.type === 'SPLIT_BET');
    const minRequiredWager = view.isHighRoller && view.minBetAmount > 0 ? view.minBetAmount : 1;

    const hasValidWager =
      localBet.bet !== undefined &&
      localBet.bet !== '' &&
      !isNaN(Number(localBet.bet)) &&
      Number(localBet.bet) >= minRequiredWager;

    const cleanBaseLower = (view.sentence?.baseWord || '').trim().toLowerCase();
    const isUnchangedBaseWord =
      qType === 'wordFormation' &&
      Boolean(cleanBaseLower) &&
      (hasSplitBet
        ? [localBet.splitClozeAnswers?.[0], localBet.splitClozeAnswers?.[1]].some(
            (w) => Boolean(w?.trim()) && w!.trim().toLowerCase() === cleanBaseLower
          )
        : Boolean(localBet.clozeAnswer?.trim()) &&
          localBet.clozeAnswer!.trim().toLowerCase() === cleanBaseLower);

    const isInvalidKwtAnswer =
      qType === 'keyWordTransformation' &&
      (hasSplitBet
        ? [localBet.splitClozeAnswers?.[0], localBet.splitClozeAnswers?.[1]].some(
            (w) => Boolean(w?.trim()) && !isValidKeyWordTransformationPhrase(w, view.sentence?.baseWord)
          )
        : Boolean(localBet.clozeAnswer?.trim()) &&
          !isValidKeyWordTransformationPhrase(localBet.clozeAnswer, view.sentence?.baseWord));

    let hasValidAnswer = false;
    if (qType === 'multipleChoice') {
      hasValidAnswer = hasSplitBet
        ? (localBet.splitOptions?.length || 0) >= 1
        : Boolean(localBet.selectedOption?.trim());
    } else if (qType === 'keyWordTransformation') {
      hasValidAnswer = hasSplitBet
        ? (isValidKeyWordTransformationPhrase(localBet.splitClozeAnswers?.[0], view.sentence?.baseWord) &&
            (!localBet.splitClozeAnswers?.[1]?.trim() || isValidKeyWordTransformationPhrase(localBet.splitClozeAnswers?.[1], view.sentence?.baseWord))) ||
          (!localBet.splitClozeAnswers?.[0]?.trim() && isValidKeyWordTransformationPhrase(localBet.splitClozeAnswers?.[1], view.sentence?.baseWord))
        : isValidKeyWordTransformationPhrase(localBet.clozeAnswer, view.sentence?.baseWord);
    } else if (qType === 'openCloze' || qType === 'wordFormation') {
      const isWordOk = (w?: string) => {
        const trimmed = (w || '').trim().toLowerCase();
        if (!trimmed) return false;
        if (qType === 'wordFormation' && cleanBaseLower && trimmed === cleanBaseLower) return false;
        return true;
      };
      hasValidAnswer = hasSplitBet
        ? isWordOk(localBet.splitClozeAnswers?.[0]) || isWordOk(localBet.splitClozeAnswers?.[1])
        : isWordOk(localBet.clozeAnswer);
    } else {
      hasValidAnswer = hasSplitBet
        ? true
        : localBet.opinion === 'correct' || localBet.opinion === 'incorrect';
    }

    if (
      !hasValidAnswer ||
      !hasValidWager ||
      isUnchangedBaseWord ||
      isInvalidKwtAnswer ||
      !isBetCompleteForQuestionType(localBet, qType, hasSplitBet, view.sentence?.baseWord)
    ) {
      playSound('error');
      if ('vibrate' in navigator) {
        try {
          navigator.vibrate([100, 50, 100]);
        } catch {}
      }

      let message = '';
      let missingField: 'answer' | 'wager' | 'both' = 'both';
      if (isUnchangedBaseWord) {
        missingField = 'answer';
        message = `Hold on! "${(view.sentence?.baseWord || '').toUpperCase()}" is the unchanged base word. Transform its form (e.g. add a prefix or suffix) before locking in!`;
      } else if (isInvalidKwtAnswer) {
        missingField = 'answer';
        message = `Hold on! Use 2 to 6 words and include the exact unchanged key word "${(view.sentence?.baseWord || 'KEY').toUpperCase()}" before locking in!`;
      } else if (!hasValidAnswer && !hasValidWager) {
        missingField = 'both';
        if (qType === 'multipleChoice') {
          message = hasSplitBet
            ? 'Hold on! Pick 2 options (50/50) or tap 1 option twice for 100% (2×), and enter a wager amount before locking in.'
            : 'Hold on! Choose an option (A–D) in Step 1 and enter a wager amount in Step 2 before locking in.';
        } else if (qType === 'keyWordTransformation') {
          message = `Hold on! Complete the gap in 2–6 words using "${(view.sentence?.baseWord || 'KEY').toUpperCase()}" unchanged in Step 1 and enter a wager in Step 2.`;
        } else if (qType === 'wordFormation') {
          message = `Hold on! Transform (${(view.sentence?.baseWord || 'ROOT').toUpperCase()}) in Step 1 and enter a wager amount in Step 2 before locking in.`;
        } else if (qType === 'openCloze') {
          message = hasSplitBet
            ? 'Hold on! Type at least 1 candidate word in Step 1 and enter a wager amount in Step 2 before locking in.'
            : 'Hold on! Type the missing word in Step 1 and enter a wager amount in Step 2 before locking in.';
        } else {
          message = 'Hold on! Choose Valid or Flawed in Step 1 and enter a wager amount in Step 2 before locking in.';
        }
      } else if (!hasValidAnswer) {
        missingField = 'answer';
        if (qType === 'multipleChoice') {
          message = hasSplitBet
            ? 'Step 1 Incomplete: Pick 2 options (50/50) or tap the same option twice for 100% (2×) before locking in!'
            : 'Step 1 Incomplete: Please choose an option (A, B, C, or D) before locking in!';
        } else if (qType === 'keyWordTransformation') {
          message = `Step 1 Incomplete: Type 2 to 6 words including the unchanged key word "${(view.sentence?.baseWord || 'KEY').toUpperCase()}" before locking in!`;
        } else if (qType === 'wordFormation') {
          message = `Step 1 Incomplete: Please transform the base word (${(view.sentence?.baseWord || 'ROOT').toUpperCase()}) to fit the gap before locking in!`;
        } else if (qType === 'openCloze') {
          message = hasSplitBet
            ? 'Step 1 Incomplete: Please type at least 1 candidate word before locking in!'
            : 'Step 1 Incomplete: Please type the missing word before locking in!';
        } else {
          message = 'Step 1 Incomplete: Please choose Valid (✓) or Flawed (✕) before locking in!';
        }
      } else {
        missingField = 'wager';
        message =
          view.isHighRoller && view.minBetAmount > 0
            ? `🔥 High Roller Fever Active: Your minimum wager this round is $${view.minBetAmount.toLocaleString()} (50% of your bankroll)!`
            : 'Step 2 Incomplete: Please enter a wager amount ($1 or more, or tap a quick chip) before locking in!';
      }

      setLockWarning({ message, missingField });

      // Scroll to and focus the specific control that needs doing
      window.requestAnimationFrame(() => {
        if (!hasValidAnswer || isUnchangedBaseWord || isInvalidKwtAnswer) {
          answerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (qType === 'multipleChoice') {
            firstOptionBtnRef.current?.focus();
          } else if (qType === 'openCloze' || qType === 'wordFormation' || qType === 'keyWordTransformation') {
            if (hasSplitBet) {
              const targetInput = !localBet.splitClozeAnswers?.[0]?.trim()
                ? splitWord1InputRef.current
                : splitWord2InputRef.current;
              targetInput?.focus();
            } else {
              clozeWordInputRef.current?.focus();
            }
          } else {
            firstOpinionBtnRef.current?.focus();
          }
        } else {
          wagerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          wagerInputRef.current?.focus();
        }
      });
      return;
    }

    setLockWarning(null);
    playSound('bet');
    sendIntent({ type: 'SET_FULL_BET', bet: localBet });
    sendIntent({ type: 'LOCK_IN', locked: true, bet: localBet });
  };

  const handleLeaveRoom = () => {
    controllerRef.current?.destroy();
    controllerRef.current = null;
    localStorage.removeItem(STUDENT_SESSION_STORAGE_KEY);
    setView(null);
    onExitStudentMode();
  };

  // ============================================================================
  // Screen 1: Join Form (Not yet seated in a room)
  // ============================================================================
  if (!view) {
    return (
      <div className="game-container felt-noise min-h-screen text-slate-800 dark:text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md glass-panel rounded-3xl p-6 sm:p-8 border-2 border-[#d4af37] shadow-2xl space-y-6 animate-fade-in">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onExitStudentMode}
              className="text-xs font-sans font-bold uppercase tracking-wider text-amber-800 dark:text-[#fef08a] hover:underline cursor-pointer min-h-[44px] flex items-center"
            >
              &larr; Solo Offline Table
            </button>
            <button
              type="button"
              onClick={onToggleTheme}
              className="w-11 h-11 rounded-full felt-well border border-[#d4af37]/50 flex items-center justify-center text-base cursor-pointer"
              title="Toggle Theme"
            >
              {isDarkMode ? '☀️' : '🌙'}
            </button>
          </div>

          <div className="text-center space-y-1">
            <div className="text-xs font-sans uppercase tracking-[0.25em] text-amber-800 dark:text-[#d4af37] font-bold">
              Student Controller
            </div>
            <h1 className="text-3xl sm:text-4xl font-display font-black text-gold tracking-wider">
              JOIN SALON
            </h1>
          </div>

          {joinError && (
            <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-700 dark:text-rose-200 text-xs font-medium text-center">
              {joinError}
            </div>
          )}

          {isJoining && joinWaitingMessage && (
            <div role="status" className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/50 text-amber-900 dark:text-amber-100 text-sm font-medium text-center">
              {joinWaitingMessage}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-sans uppercase tracking-widest text-slate-600 dark:text-amber-200/80 font-bold mb-1.5">
                4-Letter Room Code
              </label>
              <input
                type="text"
                maxLength={4}
                value={roomCodeInput}
                onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                placeholder="E.G. K7XM"
                className="w-full h-14 text-center text-2xl font-display font-black tracking-[0.35em] uppercase rounded-xl bg-white/90 dark:bg-black/50 border-2 border-[#d4af37]/60 focus:border-[#d4af37] text-slate-900 dark:text-[#fef08a] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-sans uppercase tracking-widest text-slate-600 dark:text-amber-200/80 font-bold mb-1.5">
                Your High-Roller Name
              </label>
              <input
                type="text"
                maxLength={20}
                value={playerNameInput}
                onChange={(e) => setPlayerNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleJoinRoom();
                }}
                placeholder="Enter your name..."
                className="w-full h-12 px-4 text-base font-semibold rounded-xl bg-white/90 dark:bg-black/50 border border-[#d4af37]/50 focus:border-[#d4af37] text-slate-900 dark:text-white focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-sans uppercase tracking-widest text-slate-600 dark:text-amber-200/80 font-bold">
                  Choose Avatar
                </label>
                <span className="text-2xl">{selectedAvatar}</span>
              </div>
              <div className="grid grid-cols-6 gap-2 max-h-40 overflow-y-auto p-2 rounded-xl felt-well modal-content-scroll">
                {AVATARS.slice(0, 48).map((av) => (
                  <button
                    key={av}
                    type="button"
                    onClick={() => {
                      playSound('click');
                      setSelectedAvatar(av);
                    }}
                    className={`min-h-[44px] rounded-xl text-2xl flex items-center justify-center transition-transform cursor-pointer ${
                      selectedAvatar === av
                        ? 'bg-amber-500/30 border-2 border-[#d4af37] scale-105'
                        : 'hover:bg-white/10'
                    }`}
                  >
                    {av}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              disabled={isJoining}
              onClick={() => handleJoinRoom()}
              className="w-full min-h-[52px] rounded-xl bg-gradient-to-b from-[#fef08a] via-[#eab308] to-[#a16207] text-[#1c0a04] font-sans font-black text-base uppercase tracking-[0.18em] shadow-lg active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50"
            >
              {isJoining ? (joinWaitingMessage ? 'WAITING FOR TEACHER...' : 'CONNECTING...') : 'TAKE SEAT AT TABLE →'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // Derived State for Active Student Controller
  // ============================================================================
  const qType: QuestionType = view.sentence?.questionType || 'binary';
  const isClozeRound = qType === 'multipleChoice' || qType === 'openCloze' || qType === 'wordFormation' || qType === 'keyWordTransformation';
  const hasSplitBet = view.myActivePowerUps.some((pu) => pu.type === 'SPLIT_BET');
  const maxAllowedBet = view.isBetCapped
    ? Math.min(view.me.money, view.betCapAmount)
    : view.me.money;

  // Format sentence HTML with optional Grammar Goggles highlight and Cloze gap
  let sentenceHtml = view.sentence?.text || '';
  if (view.sentence?.grammarPhrase && sentenceHtml) {
    const escaped = view.sentence.grammarPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    sentenceHtml = sentenceHtml.replace(
      new RegExp(`(${escaped})`, 'gi'),
      `<span class="bg-amber-300/80 dark:bg-amber-500/30 text-amber-950 dark:text-[#fef08a] border-b-2 border-[#d4af37] px-1.5 py-0.5 rounded font-bold">$1</span>`
    );
  }
  if (isClozeRound && sentenceHtml) {
    const inlineBaseBadge =
      qType === 'wordFormation' && view.sentence?.baseWord
        ? ` <span class="inline-block px-2 py-0.5 rounded bg-amber-400/30 dark:bg-amber-500/25 border border-[#d4af37] text-amber-950 dark:text-[#fef08a] font-sans tabular-nums font-black text-xs sm:text-sm tracking-widest not-italic align-middle">(${view.sentence.baseWord.toUpperCase()})</span>`
        : '';
    sentenceHtml = sentenceHtml.replace(
      /_{3,}/g,
      `<span class="inline-block min-w-[3.2rem] px-2 py-0.5 mx-1 rounded bg-amber-500/20 border-b-2 border-[#d4af37] text-amber-900 dark:text-[#fef08a] font-sans tabular-nums font-bold not-italic">_____</span>${inlineBaseBadge}`
    );
  }

  return (
    <div className="game-container felt-noise min-h-screen text-slate-800 dark:text-slate-100 flex flex-col justify-between pb-24">
      {/* Compact Sticky Top App Bar (<= 56px height to honor 15% mobile sticky cap) */}
      <header className="sticky top-0 z-30 h-14 px-3 sm:px-5 bg-amber-50/90 dark:bg-[#051a0f]/90 backdrop-blur-md border-b border-[#d4af37]/40 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setShowAvatarPicker((v) => !v)}
            className="w-10 h-10 rounded-full border border-[#d4af37] bg-black/20 flex items-center justify-center text-xl shrink-0 cursor-pointer"
            title="Change Avatar"
          >
            {view.me.avatar}
          </button>
          <div className="min-w-0">
            <div className="text-xs sm:text-sm font-sans font-extrabold text-slate-900 dark:text-amber-50 truncate">
              {view.me.name}
            </div>
            <div className="text-[10px] font-sans tabular-nums text-slate-500 dark:text-amber-200/70 flex items-center gap-1.5">
              <span>Room {view.roomCode}</span>
              <span>&middot;</span>
              <span>{isConnected ? 'Live' : 'Syncing'}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {view.me.winStreak > 0 && (
            <span className="text-xs font-sans tabular-nums font-bold text-amber-700 dark:text-amber-300 tabular-nums">
              🔥 {view.me.winStreak}
            </span>
          )}
          <div className="px-3 py-1 rounded-xl felt-well border border-[#d4af37]/60 font-sans tabular-nums font-black text-sm sm:text-base text-amber-900 dark:text-[#fef08a] tabular-nums">
            ${view.me.money.toLocaleString()}
          </div>
          <button
            type="button"
            onClick={handleLeaveRoom}
            className="min-h-[40px] px-2.5 rounded-lg border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-sans font-bold uppercase cursor-pointer"
            title="Leave Room"
          >
            Exit
          </button>
        </div>
      </header>

      {/* Optional Quick Avatar Switcher Drawer */}
      {showAvatarPicker && (
        <div className="w-full max-w-xl mx-auto px-4 pt-3">
          <div className="glass-panel rounded-2xl p-4 border border-[#d4af37]/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-sans font-bold uppercase tracking-wider">Tap New Avatar</span>
              <button
                type="button"
                onClick={() => setShowAvatarPicker(false)}
                className="text-xs text-amber-500 font-bold"
              >
                Close
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1.5 max-h-36 overflow-y-auto">
              {AVATARS.slice(0, 42).map((av) => (
                <button
                  key={av}
                  type="button"
                  onClick={() => {
                    sendIntent({ type: 'UPDATE_PROFILE', avatar: av });
                    setShowAvatarPicker(false);
                  }}
                  className="min-h-[42px] text-2xl rounded-lg hover:bg-amber-500/20 flex items-center justify-center"
                >
                  {av}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Content Container */}
      <main className="w-full max-w-xl mx-auto px-3 sm:px-4 pt-4 space-y-4 flex-1">

        {/* ================================================================
            WAITING IN LOBBY (PLAYER_SETUP or SETTINGS)
           ================================================================ */}
        {(view.step === 'PLAYER_SETUP' || view.step === 'SETTINGS') && (
          <div className="glass-panel rounded-3xl p-6 text-center space-y-5 border border-[#d4af37]/50">
            <div className="w-20 h-20 mx-auto rounded-full border-2 border-[#d4af37] felt-well flex items-center justify-center text-5xl shadow-lg">
              {view.me.avatar}
            </div>
            <div className="space-y-1">
              <div className="text-xs font-sans uppercase tracking-[0.25em] text-emerald-600 dark:text-emerald-400 font-bold">
                Seat Confirmed · Ready to Deal
              </div>
              <h2 className="text-2xl font-sans font-black text-slate-900 dark:text-amber-50 uppercase">
                Welcome, {view.me.name}!
              </h2>
              <p className="text-xs text-slate-600 dark:text-amber-200/75">
                Watch the main projector. Your betting pad will unlock automatically as soon as the teacher deals Hand #1.
              </p>
            </div>

            <div className="felt-well rounded-2xl p-4 text-left space-y-2">
              <div className="text-xs font-sans uppercase tracking-widest text-amber-800 dark:text-[#d4af37] font-bold">
                Players at the Table ({view.peers.length})
              </div>
              <div className="flex flex-wrap gap-2">
                {view.peers.map((p) => (
                  <span
                    key={p.id}
                    className="px-3 py-1.5 rounded-xl bg-white/70 dark:bg-black/40 border border-[#d4af37]/30 text-xs font-sans font-bold flex items-center gap-1.5"
                  >
                    <span>{p.avatar}</span>
                    <span>{p.name}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================
            ACTIVE ROUND BETTING PAD (IN_GAME)
           ================================================================ */}
        {view.step === 'IN_GAME' && (
          <>
            {/* Shared Multiplayer Round Timer Bar (when enabled by Teacher) */}
            {view.turnDurationMs && view.turnDurationMs > 0 && (
              <StudentRoundTimerBar
                timer={view.roundTimer}
                turnDurationMs={view.turnDurationMs}
                lockedIn={isPlayerLocked}
              />
            )}

            {/* Status Banner if Frozen or Bankrupt */}
            {view.me.money <= 0 ? (
              <div className="p-4 rounded-2xl bg-rose-500/20 border-2 border-rose-400 text-center space-y-1">
                <div className="text-2xl">💸</div>
                <div className="text-sm font-sans font-extrabold uppercase tracking-wider text-rose-900 dark:text-rose-200">
                  {view.gameMode === 'lastPlayer' ? 'Eliminated (Bankrupt)!' : 'Bankrupt This Hand!'}
                </div>
                <div className="text-xs text-rose-800 dark:text-rose-100/80">
                  {view.gameMode === 'lastPlayer'
                    ? 'You are out of funds in High-Roller Survival. Watch the remaining contenders battle it out!'
                    : 'You are out of funds for this hand and will receive a $150 House Bailout next round.'}
                </div>
              </div>
            ) : view.isFrozen ? (
              <div className="p-4 rounded-2xl bg-cyan-500/20 border-2 border-cyan-400 text-center space-y-1">
                <div className="text-2xl">❄️</div>
                <div className="text-sm font-sans font-extrabold uppercase tracking-wider text-cyan-900 dark:text-cyan-200">
                  Frozen This Round!
                </div>
                <div className="text-xs text-cyan-800 dark:text-cyan-100/80">
                  You were hit by a freeze effect and must sit out Hand #{view.round}.
                </div>
              </div>
            ) : null}

            {/* Sentence Card */}
            <div className="glass-panel rounded-2xl p-4 sm:p-5 border-2 border-[#d4af37] shadow-xl space-y-3">
              <div className="flex items-center justify-between text-[11px] font-sans uppercase tracking-widest text-amber-800 dark:text-[#d4af37] font-bold">
                <span>
                  Hand #{view.round} &middot; {view.settings.topic} ({view.settings.level})
                </span>
                <span>
                  {qType === 'multipleChoice'
                    ? '🔠 MC Cloze'
                    : qType === 'openCloze'
                      ? '✍️ Open Cloze'
                      : qType === 'wordFormation'
                        ? '🧬 Word Form'
                        : qType === 'keyWordTransformation'
                          ? '🔑 Key Word (Part 4)'
                          : '⚖️ Valid / Flawed'}
                </span>
              </div>

              {view.isLoadingSentence || !view.sentence ? (
                <div className="py-8 text-center space-y-2">
                  <div className="text-3xl animate-bounce">♠️</div>
                  <div className="text-sm font-sans font-bold uppercase tracking-widest text-amber-700 dark:text-[#fef08a]">
                    Croupier is Dealing Hand #{view.round}...
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5 py-1">
                  {qType === 'keyWordTransformation' && view.sentence.leadInSentence && (
                    <div className="p-3 rounded-xl felt-well border border-[#d4af37]/40 text-center space-y-1">
                      <div className="text-[10px] font-sans uppercase tracking-widest text-amber-800 dark:text-[#d4af37] font-bold">
                        Lead-In Sentence
                      </div>
                      <p className="text-base sm:text-lg font-editorial italic text-slate-900 dark:text-amber-50 leading-snug">
                        &ldquo;{view.sentence.leadInSentence}&rdquo;
                      </p>
                      {view.sentence.baseWord && (
                        <div className="pt-1 flex items-center justify-center gap-2">
                          <span className="text-[10px] font-sans font-extrabold uppercase tracking-widest text-amber-900 dark:text-amber-200">
                            🔑 Key Word:
                          </span>
                          <span className="px-2.5 py-0.5 rounded-md bg-amber-400/35 dark:bg-amber-500/30 border border-[#d4af37] font-sans tabular-nums font-black text-xs sm:text-sm tracking-widest text-amber-950 dark:text-[#fef08a]">
                            {view.sentence.baseWord.toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  <p
                    className="text-lg sm:text-xl font-editorial italic text-slate-900 dark:text-amber-50 leading-relaxed text-center py-1"
                    dangerouslySetInnerHTML={{ __html: `&ldquo;${sentenceHtml}&rdquo;` }}
                  />
                </div>
              )}

              {/* Active Power-Ups & Effects Row */}
              {(view.myActivePowerUps.length > 0 || view.me.effects.length > 0 || view.isBetCapped || view.isHighRoller) && (
                <div className="pt-2 border-t border-[#d4af37]/20 flex flex-wrap items-center gap-1.5 text-xs">
                  {view.myActivePowerUps.map((pu, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-0.5 rounded-lg bg-purple-500/20 border border-purple-400/40 text-purple-900 dark:text-purple-200 font-semibold"
                    >
                      {POWER_UPS[pu.type]?.icon} {POWER_UPS[pu.type]?.name}
                    </span>
                  ))}
                  {view.isBetCapped && (
                    <span className="px-2.5 py-0.5 rounded-lg bg-rose-500/20 border border-rose-400/40 text-rose-800 dark:text-rose-200 font-semibold">
                      🧢 Max Bet ${view.betCapAmount}
                    </span>
                  )}
                  {view.isHighRoller && (
                    <span className="px-2.5 py-0.5 rounded-lg bg-orange-500/25 border border-orange-400/60 text-orange-900 dark:text-orange-200 font-semibold">
                      🔥 High Roller: Min Bet ${view.minBetAmount}
                    </span>
                  )}
                </div>
              )}

              {/* 50/50 Scalpel Open Cloze Clue */}
              {view.scalpelHint?.clozeMask && (
                <div className="p-3 rounded-xl bg-cyan-500/15 border border-cyan-400/50 flex items-center justify-between gap-2 text-xs text-cyan-950 dark:text-cyan-100">
                  <strong className="font-sans uppercase tracking-wider flex items-center gap-1.5">
                    <span>✂️</span>
                    <span>50/50 Scalpel Clue:</span>
                  </strong>
                  <span className="font-sans tabular-nums font-extrabold text-sm px-2.5 py-0.5 rounded bg-cyan-500/25 border border-cyan-400/50 tracking-wider">
                    {view.scalpelHint.clozeMask}
                  </span>
                </div>
              )}

              {/* Peekaboo Live Spy Feed */}
              {view.peekabooSpyFeed && view.peekabooSpyFeed.length > 0 && (
                <div className="p-3 rounded-xl bg-indigo-500/15 border border-indigo-400/50 space-y-1.5 text-xs text-indigo-950 dark:text-indigo-100">
                  <div className="font-sans font-extrabold uppercase tracking-wider text-indigo-800 dark:text-indigo-300 flex items-center justify-between">
                    <span>🕵️ Peekaboo Live Spyglass</span>
                    <span className="text-[10px] font-sans tabular-nums px-1.5 py-0.5 rounded bg-indigo-500/25">
                      LIVE FEED
                    </span>
                  </div>
                  {view.peekabooSpyFeed.map(spy => (
                    <div
                      key={spy.targetId}
                      className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-indigo-400/25"
                    >
                      <div className="flex items-center gap-1.5 font-bold">
                        <span>{spy.targetAvatar}</span>
                        <span>{spy.targetName}</span>
                        <span className="text-[10px] font-sans tabular-nums opacity-80">
                          {spy.lockedIn ? '🔒 Locked' : '✏️ Drafting'}
                        </span>
                      </div>
                      <div className="font-sans tabular-nums font-bold text-right">
                        <span className="text-amber-700 dark:text-[#fef08a] mr-2">
                          {spy.answerSummary}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-black/20 border border-indigo-400/40">
                          {spy.betAmount !== '' ? `$${Number(spy.betAmount).toLocaleString()}` : '$0'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Ask the Table Live Anonymized Poll Feed */}
              {view.audiencePollFeed && (
                <div className="p-3 rounded-xl bg-sky-500/15 border border-sky-400/50 space-y-2 text-xs text-sky-950 dark:text-sky-100">
                  <div className="font-sans font-extrabold uppercase tracking-wider text-sky-800 dark:text-sky-300 flex items-center justify-between gap-2">
                    <span>📊 Ask the Table · Live Poll</span>
                    <span className="text-[10px] font-sans tabular-nums px-1.5 py-0.5 rounded bg-sky-500/25">
                      {view.audiencePollFeed.summaryText}
                    </span>
                  </div>
                  {view.audiencePollFeed.breakdown.length > 0 && (
                    <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-sky-400/25">
                      {view.audiencePollFeed.breakdown.map((item, idx) => (
                        <div
                          key={idx}
                          className="p-2 rounded-lg bg-black/15 border border-sky-400/30 flex flex-col gap-1"
                        >
                          <div className="flex items-center justify-between gap-1 text-[11px] font-bold">
                            <span className="truncate">{item.label}</span>
                            <span className="font-sans tabular-nums text-amber-700 dark:text-[#fef08a] shrink-0">
                              {item.percent}%
                            </span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-black/25 overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-sky-400 to-emerald-400 rounded-full transition-all duration-300"
                              style={{ width: `${Math.min(100, Math.max(0, item.percent))}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Private AI Hint Display */}
              {view.myHint && (
                <div className="p-3 rounded-xl felt-well border border-amber-400/50 text-xs text-slate-800 dark:text-amber-100">
                  <strong className="font-sans uppercase tracking-wider text-amber-700 dark:text-[#fef08a]">
                    💡 Private Croupier Hint:{' '}
                  </strong>
                  {view.myHint.isLoading ? 'Consulting the Croupier...' : view.myHint.text}
                </div>
              )}
            </div>

            {/* Answer Selection Controls */}
            {!view.isFrozen && view.me.money > 0 && view.sentence && (() => {
              const highlightAnswerMissing =
                lockWarning?.missingField === 'answer' || lockWarning?.missingField === 'both';
              const highlightWagerMissing =
                lockWarning?.missingField === 'wager' || lockWarning?.missingField === 'both';

              return (
                <div
                  className={`glass-panel rounded-2xl p-4 sm:p-5 space-y-4 border border-[#d4af37]/40 transition-opacity ${
                    isPlayerLocked ? 'opacity-70 pointer-events-none' : ''
                  }`}
                >
                  {lockWarning && (
                    <div
                      role="alert"
                      className="px-3.5 py-2.5 rounded-xl bg-rose-500/15 dark:bg-rose-950/75 border-2 border-rose-500 text-rose-900 dark:text-rose-100 text-xs sm:text-sm font-sans font-bold flex items-center justify-between gap-2 shadow-[0_0_20px_rgba(244,63,94,0.35)] animate-fade-in"
                    >
                      <div className="flex items-center gap-2 text-left">
                        <span className="text-base select-none shrink-0">⚠️</span>
                        <span>{lockWarning.message}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setLockWarning(null)}
                        className="text-xs px-2 py-0.5 rounded bg-rose-500/25 hover:bg-rose-500/40 text-rose-900 dark:text-rose-100 font-sans font-bold cursor-pointer shrink-0"
                      >
                        OK
                      </button>
                    </div>
                  )}

                  <div
                    ref={answerSectionRef}
                    className={`space-y-3 rounded-xl transition-all ${
                      highlightAnswerMissing
                        ? 'p-3 border-2 border-rose-500 ring-2 ring-rose-500/35 bg-rose-500/10'
                        : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-sans font-extrabold uppercase tracking-widest text-slate-700 dark:text-amber-200">
                        1. Choose Your Ruling {hasSplitBet ? '(⚖️ Split Bet Active)' : ''}
                      </div>
                      {highlightAnswerMissing && (
                        <span className="text-[10px] font-sans font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-rose-500 text-white">
                          Required
                        </span>
                      )}
                    </div>

                    {/* Format A: Binary (Valid / Flawed) */}
                    {qType === 'binary' && (
                      <div className="space-y-3">
                        {hasSplitBet ? (
                          <div className="space-y-2 felt-well p-3.5 rounded-xl">
                            <div className="flex justify-between text-xs font-sans tabular-nums font-bold">
                              <span className="text-emerald-600 dark:text-emerald-400">
                                ✓ Valid: {localBet.splitCorrectPercent ?? 50}%
                              </span>
                              <span className="text-rose-600 dark:text-rose-400">
                                ✕ Flawed: {100 - (localBet.splitCorrectPercent ?? 50)}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={10}
                              value={localBet.splitCorrectPercent ?? 50}
                              onChange={(e) => updateBetField('splitCorrectPercent', Number(e.target.value))}
                              className="w-full accent-amber-500 h-6 cursor-pointer"
                            />
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-3">
                            <button
                              ref={firstOpinionBtnRef}
                              type="button"
                              onClick={() => updateBetField('opinion', 'correct')}
                              className={`min-h-[54px] rounded-xl font-sans font-extrabold text-sm uppercase tracking-wider border-2 transition-all cursor-pointer flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-[#d4af37] ${
                                localBet.opinion === 'correct'
                                  ? 'bg-emerald-600 text-white border-emerald-300 shadow-lg scale-[1.01]'
                                  : highlightAnswerMissing
                                    ? 'felt-well text-slate-800 dark:text-amber-50 border-rose-400'
                                    : 'felt-well text-slate-800 dark:text-amber-50 border-[#d4af37]/40'
                              }`}
                            >
                              <span>✓</span>
                              <span>Valid</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => updateBetField('opinion', 'incorrect')}
                              className={`min-h-[54px] rounded-xl font-sans font-extrabold text-sm uppercase tracking-wider border-2 transition-all cursor-pointer flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-[#d4af37] ${
                                localBet.opinion === 'incorrect'
                                  ? 'bg-rose-600 text-white border-rose-300 shadow-lg scale-[1.01]'
                                  : highlightAnswerMissing
                                    ? 'felt-well text-slate-800 dark:text-amber-50 border-rose-400'
                                    : 'felt-well text-slate-800 dark:text-amber-50 border-[#d4af37]/40'
                              }`}
                            >
                              <span>✕</span>
                              <span>Flawed</span>
                            </button>
                          </div>
                        )}

                        {(localBet.opinion === 'incorrect' ||
                          (hasSplitBet && (localBet.splitCorrectPercent ?? 50) < 100)) && (
                          <div>
                            <label className="block text-[11px] font-sans uppercase tracking-wider text-amber-800 dark:text-[#fef08a] font-bold mb-1">
                              Optional Bonus Correction (+100% Payout if Flawed):
                            </label>
                            <input
                              type="text"
                              value={localBet.userCorrection || ''}
                              onChange={(e) => updateBetField('userCorrection', e.target.value)}
                              placeholder="Type the corrected sentence or phrase..."
                              className="w-full min-h-[46px] px-3.5 rounded-xl bg-white/90 dark:bg-black/50 border border-[#d4af37]/50 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-[#d4af37]"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Format B: Multiple Choice Cloze */}
                    {qType === 'multipleChoice' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {(() => {
                          const eliminatedSet = new Set(
                            (view.scalpelHint?.eliminatedOptions || []).map((o) =>
                              o.trim().toLowerCase()
                            )
                          );
                          return (view.sentence.options || []).map((opt, idx) => {
                            const letter = ['A', 'B', 'C', 'D'][idx] || '';
                            const isEliminatedOpt = eliminatedSet.has(opt.trim().toLowerCase());
                            const splitList = localBet.splitOptions || [];
                            const isSelected = hasSplitBet
                              ? splitList.includes(opt)
                              : localBet.selectedOption === opt;
                            const isDoubleStacked =
                              hasSplitBet && splitList.length === 2 && splitList[0] === opt && splitList[1] === opt;

                            return (
                              <button
                                key={opt}
                                ref={idx === 0 ? firstOptionBtnRef : undefined}
                                type="button"
                                disabled={isEliminatedOpt}
                                onClick={() => {
                                  if (isEliminatedOpt) return;
                                  if (hasSplitBet) {
                                    let next: string[];
                                    if (splitList.length === 0) {
                                      next = [opt];
                                    } else if (splitList.length === 1) {
                                      next = [splitList[0], opt];
                                    } else if (splitList.includes(opt)) {
                                      next = splitList.filter((o) => o !== opt);
                                    } else {
                                      next = [splitList[1], opt];
                                    }
                                    updateBetField('splitOptions', next);
                                  } else {
                                    updateBetField('selectedOption', opt);
                                  }
                                }}
                                className={`min-h-[52px] px-4 py-2.5 rounded-xl border-2 text-left font-sans font-bold text-sm transition-all flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-[#d4af37] ${
                                  isEliminatedOpt
                                    ? 'opacity-40 grayscale cursor-not-allowed bg-slate-900/30 border-rose-500/40 text-slate-400 line-through'
                                    : isSelected
                                      ? 'cursor-pointer bg-emerald-600 text-white border-emerald-300 shadow-md'
                                      : highlightAnswerMissing
                                        ? 'cursor-pointer felt-well text-slate-800 dark:text-amber-50 border-rose-400'
                                        : 'cursor-pointer felt-well text-slate-800 dark:text-amber-50 border-[#d4af37]/40'
                                }`}
                              >
                                <span className={isEliminatedOpt ? 'line-through' : ''}>
                                  <strong className="font-sans tabular-nums mr-2">{letter}.</strong>
                                  {opt}
                                </span>
                                {isEliminatedOpt ? (
                                  <span className="text-[10px] font-sans tabular-nums bg-rose-500/25 text-rose-200 px-1.5 py-0.5 rounded font-black no-underline">
                                    ✂️ Cut
                                  </span>
                                ) : isDoubleStacked ? (
                                  <span className="text-[10px] font-sans tabular-nums bg-amber-400 text-black px-1.5 py-0.5 rounded font-black">
                                    2×
                                  </span>
                                ) : null}
                              </button>
                            );
                          });
                        })()}
                      </div>
                    )}

                    {/* Format C, D & E: Open Cloze, Word Formation & Key Word Transformation */}
                    {(qType === 'openCloze' || qType === 'wordFormation' || qType === 'keyWordTransformation') && (() => {
                      const cleanBase = (view.sentence?.baseWord || '').trim().toLowerCase();
                      const isUnchangedBase =
                        qType === 'wordFormation' &&
                        Boolean(cleanBase) &&
                        (hasSplitBet
                          ? [localBet.splitClozeAnswers?.[0], localBet.splitClozeAnswers?.[1]].some(
                              (w) => Boolean(w?.trim()) && w!.trim().toLowerCase() === cleanBase
                            )
                          : Boolean(localBet.clozeAnswer?.trim()) &&
                            localBet.clozeAnswer!.trim().toLowerCase() === cleanBase);

                      const kwtCheck = (() => {
                        const raw = (localBet.clozeAnswer || '').trim();
                        const words = raw ? raw.split(/\s+/).filter(Boolean) : [];
                        const escaped = cleanBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const hasKeyWord = cleanBase
                          ? new RegExp(`\\b${escaped}\\b`, 'i').test(raw)
                          : true;
                        const isValidCount = words.length >= 2 && words.length <= 6;
                        return { raw, wordCount: words.length, hasKeyWord, isValidCount };
                      })();

                      return (
                        <div className="space-y-2.5">
                          {qType === 'wordFormation' && view.sentence?.baseWord && (
                            <div className="p-2.5 rounded-xl bg-amber-500/15 border border-[#d4af37] flex items-center justify-between gap-2">
                              <span className="text-[11px] font-sans font-extrabold uppercase tracking-wider text-amber-950 dark:text-amber-100 flex items-center gap-1.5">
                                <span>🧬</span>
                                <span>Base Word to Transform:</span>
                              </span>
                              <span className="px-2.5 py-0.5 rounded-lg bg-amber-400/30 dark:bg-amber-500/25 border border-[#d4af37] font-sans tabular-nums font-black text-sm tracking-widest text-amber-950 dark:text-[#fef08a]">
                                ({view.sentence.baseWord.toUpperCase()})
                              </span>
                            </div>
                          )}
                          {qType === 'keyWordTransformation' && view.sentence?.baseWord && (
                            <div className="p-2.5 rounded-xl bg-amber-500/15 border border-[#d4af37] flex items-center justify-between gap-2">
                              <div className="text-left">
                                <span className="text-[11px] font-sans font-extrabold uppercase tracking-wider text-amber-950 dark:text-amber-100 flex items-center gap-1.5">
                                  <span>🔑</span>
                                  <span>Key Word (Do Not Change):</span>
                                </span>
                                <span className="text-[10px] text-slate-600 dark:text-amber-200/75 block">
                                  2–6 words · 1 Mark (1×) or 2 Marks (2×)
                                </span>
                              </div>
                              <span className="px-2.5 py-0.5 rounded-lg bg-amber-400/35 dark:bg-amber-500/30 border border-[#d4af37] font-sans tabular-nums font-black text-sm tracking-widest text-amber-950 dark:text-[#fef08a]">
                                {view.sentence.baseWord.toUpperCase()}
                              </span>
                            </div>
                          )}
                          {hasSplitBet ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              <input
                                ref={splitWord1InputRef}
                                type="text"
                                maxLength={qType === 'keyWordTransformation' ? 80 : 32}
                                value={localBet.splitClozeAnswers?.[0] || ''}
                                onChange={(e) =>
                                  updateBetField('splitClozeAnswers', [
                                    qType === 'keyWordTransformation'
                                      ? e.target.value.replace(/\s{2,}/g, ' ')
                                      : e.target.value.replace(/\s+/g, ''),
                                    localBet.splitClozeAnswers?.[1] || '',
                                  ])
                                }
                                placeholder={
                                  qType === 'keyWordTransformation' && view.sentence?.baseWord
                                    ? `2–6 words using ${view.sentence.baseWord.toUpperCase()} (50%)`
                                    : qType === 'wordFormation' && view.sentence?.baseWord
                                      ? `Derived form #1 of ${view.sentence.baseWord.toUpperCase()} (50%)`
                                      : 'Candidate Word #1 (50%)'
                                }
                                className={`w-full min-h-[48px] px-3.5 rounded-xl bg-white/90 dark:bg-black/50 border-2 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none ${
                                  highlightAnswerMissing || isUnchangedBase ? 'border-rose-500 ring-2 ring-rose-500/30' : 'border-[#d4af37]/50 focus:border-[#d4af37]'
                                }`}
                              />
                              <input
                                ref={splitWord2InputRef}
                                type="text"
                                maxLength={qType === 'keyWordTransformation' ? 80 : 32}
                                value={localBet.splitClozeAnswers?.[1] || ''}
                                onChange={(e) =>
                                  updateBetField('splitClozeAnswers', [
                                    localBet.splitClozeAnswers?.[0] || '',
                                    qType === 'keyWordTransformation'
                                      ? e.target.value.replace(/\s{2,}/g, ' ')
                                      : e.target.value.replace(/\s+/g, ''),
                                  ])
                                }
                                placeholder={
                                  qType === 'keyWordTransformation' && view.sentence?.baseWord
                                    ? `2nd phrase using ${view.sentence.baseWord.toUpperCase()} (50%)`
                                    : qType === 'wordFormation' && view.sentence?.baseWord
                                      ? `Derived form #2 of ${view.sentence.baseWord.toUpperCase()} (50%)`
                                      : 'Candidate Word #2 (50%)'
                                }
                                className={`w-full min-h-[48px] px-3.5 rounded-xl bg-white/90 dark:bg-black/50 border-2 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none ${
                                  highlightAnswerMissing || isUnchangedBase ? 'border-rose-500 ring-2 ring-rose-500/30' : 'border-[#d4af37]/50 focus:border-[#d4af37]'
                                }`}
                              />
                            </div>
                          ) : (
                            <input
                              ref={clozeWordInputRef}
                              type="text"
                              maxLength={qType === 'keyWordTransformation' ? 80 : 32}
                              value={localBet.clozeAnswer || ''}
                              onChange={(e) =>
                                updateBetField(
                                  'clozeAnswer',
                                  qType === 'keyWordTransformation'
                                    ? e.target.value.replace(/\s{2,}/g, ' ')
                                    : e.target.value.replace(/\s+/g, '')
                                )
                              }
                              placeholder={
                                qType === 'keyWordTransformation' && view.sentence?.baseWord
                                  ? `Type 2–6 words including ${view.sentence.baseWord.toUpperCase()}...`
                                  : qType === 'wordFormation' && view.sentence?.baseWord
                                    ? `Transform (${view.sentence.baseWord.toUpperCase()}) to fit the gap...`
                                    : 'Type the single missing word...'
                              }
                              className={`w-full min-h-[50px] px-4 rounded-xl bg-white/90 dark:bg-black/50 border-2 text-base font-bold text-slate-900 dark:text-white focus:outline-none ${
                                highlightAnswerMissing || isUnchangedBase ? 'border-rose-500 ring-2 ring-rose-500/30' : 'border-[#d4af37]/60 focus:border-[#d4af37]'
                              }`}
                            />
                          )}
                          {qType === 'keyWordTransformation' && !hasSplitBet && kwtCheck.raw && (
                            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-sans">
                              <span
                                className={`px-2 py-0.5 rounded font-bold border ${
                                  kwtCheck.hasKeyWord
                                    ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/40'
                                    : 'bg-rose-500/15 text-rose-800 dark:text-rose-200 border-rose-500/50'
                                }`}
                              >
                                {kwtCheck.hasKeyWord
                                  ? `✓ Key word "${(view.sentence?.baseWord || 'KEY').toUpperCase()}" included`
                                  : `⚠️ Include unchanged "${(view.sentence?.baseWord || 'KEY').toUpperCase()}"`}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded font-sans tabular-nums font-bold border ${
                                  kwtCheck.isValidCount
                                    ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/40'
                                    : 'bg-amber-500/20 text-amber-900 dark:text-amber-200 border-amber-500/50'
                                }`}
                              >
                                {kwtCheck.wordCount} / 2–6 words
                              </span>
                            </div>
                          )}
                          {isUnchangedBase && (
                            <div className="px-3 py-2 rounded-xl bg-rose-500/15 border border-rose-500/60 text-rose-800 dark:text-rose-200 text-xs font-sans font-bold flex items-center gap-2">
                              <span>⚠️</span>
                              <span>
                                You typed the unchanged base word <strong>({(view.sentence?.baseWord || '').toUpperCase()})</strong>. Transform its form (e.g. add a prefix or suffix) to lock in!
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Wager Amount Controls */}
                  <div
                    ref={wagerSectionRef}
                    className={`space-y-2.5 rounded-xl transition-all ${
                      highlightWagerMissing
                        ? 'p-3 border-2 border-rose-500 ring-2 ring-rose-500/35 bg-rose-500/10'
                        : 'pt-3 border-t border-[#d4af37]/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-sans font-extrabold uppercase tracking-widest text-slate-700 dark:text-amber-200">
                          2. Set Your Wager
                        </span>
                        {highlightWagerMissing && (
                          <span className="text-[10px] font-sans font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-rose-500 text-white">
                            Required
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-sans tabular-nums text-amber-800 dark:text-[#fef08a] tabular-nums">
                        {view.isHighRoller ? `Min: $${view.minBetAmount.toLocaleString()} · ` : ''}Max: ${maxAllowedBet.toLocaleString()}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-sans tabular-nums font-bold text-amber-700 dark:text-[#fef08a]">
                          $
                        </span>
                        <input
                          ref={wagerInputRef}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={localBet.bet ?? ''}
                          onChange={(e) => updateBetField('bet', e.target.value)}
                          placeholder={view.isHighRoller ? String(view.minBetAmount) : '0'}
                          className={`w-full min-h-[48px] pl-8 pr-3 rounded-xl bg-white/90 dark:bg-black/50 border-2 font-sans tabular-nums font-black text-lg text-slate-900 dark:text-[#fef08a] tabular-nums focus:outline-none ${
                            highlightWagerMissing
                              ? 'border-rose-500 ring-2 ring-rose-500/35'
                              : 'border-[#d4af37]/60 focus:border-[#d4af37]'
                          }`}
                        />
                      </div>
                    </div>

                    {/* Quick Chip Buttons */}
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        {
                          label: view.isHighRoller ? `MIN ($${view.minBetAmount})` : '$50',
                          val: view.isHighRoller
                            ? Math.min(maxAllowedBet, view.minBetAmount)
                            : Math.min(50, maxAllowedBet),
                        },
                        {
                          label: '25%',
                          val: Math.max(
                            view.isHighRoller ? view.minBetAmount : 0,
                            Math.floor(maxAllowedBet * 0.25)
                          ),
                        },
                        {
                          label: '50%',
                          val: Math.max(
                            view.isHighRoller ? view.minBetAmount : 0,
                            Math.floor(maxAllowedBet * 0.5)
                          ),
                        },
                        { label: 'ALL IN', val: maxAllowedBet },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => updateBetField('bet', preset.val)}
                          className="min-h-[44px] rounded-xl felt-well border border-[#d4af37]/40 hover:border-[#d4af37] font-sans tabular-nums font-bold text-xs text-slate-900 dark:text-[#fef08a] active:scale-95 transition-transform cursor-pointer"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Hint & Power-Up Row */}
                  <div className="pt-3 border-t border-[#d4af37]/20 grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      disabled={
                        Boolean(view.myHint?.text || view.myHint?.isLoading) ||
                        view.me.money < HINT_COST
                      }
                      onClick={() => {
                        playSound('hint');
                        sendIntent({ type: 'BUY_HINT' });
                      }}
                      className="min-h-[46px] px-3 rounded-xl felt-well border border-amber-400/50 text-xs font-sans font-extrabold uppercase tracking-wider text-amber-900 dark:text-[#fef08a] disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <span>💡</span>
                      <span>{view.myHint?.text ? 'Hint Active' : `Buy Hint ($${HINT_COST})`}</span>
                    </button>

                    <button
                      type="button"
                      disabled={!view.canBuyPowerUp}
                      onClick={() => {
                        playSound('powerUp');
                        sendIntent({ type: 'BUY_RANDOM_POWER_UP' });
                      }}
                      className="min-h-[46px] px-3 rounded-xl bg-purple-600/25 border border-purple-400/60 text-xs font-sans font-extrabold uppercase tracking-wider text-purple-900 dark:text-purple-100 disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <span>⚡</span>
                      <span>Power-Up (${POWERUP_COST})</span>
                    </button>
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {/* ================================================================
            ROUND RESULTS (RESULTS)
           ================================================================ */}
        {view.step === 'RESULTS' && (
          <div className="space-y-4 animate-fade-in">
            {/* Personal Outcome Banner */}
            {view.myRoundResult && (
              <div
                className={`p-5 rounded-3xl border-2 text-center space-y-2 shadow-xl ${
                  view.myRoundResult.amountChanged > 0
                    ? 'bg-emerald-950/60 border-emerald-400 text-emerald-50'
                    : view.myRoundResult.amountChanged < 0
                      ? 'bg-rose-950/60 border-rose-400 text-rose-50'
                      : 'glass-panel border-[#d4af37]'
                }`}
              >
                <div className="text-xs font-sans uppercase tracking-[0.25em] font-bold opacity-80 flex items-center justify-center gap-2">
                  <span>Hand #{view.round} Settlement</span>
                  {qType === 'keyWordTransformation' && view.myRoundResult.marksAwarded !== undefined && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-sans tabular-nums bg-amber-400/30 border border-amber-300/60 text-amber-100">
                      {view.myRoundResult.marksAwarded}/2 Marks
                    </span>
                  )}
                </div>
                <div className="text-3xl font-sans tabular-nums font-black tabular-nums">
                  {view.myRoundResult.amountChanged > 0
                    ? `+$${view.myRoundResult.amountChanged.toLocaleString()}`
                    : view.myRoundResult.amountChanged < 0
                      ? `-$${Math.abs(view.myRoundResult.amountChanged).toLocaleString()}`
                      : '$0'}
                </div>
                <div className="text-sm font-sans font-extrabold uppercase tracking-wider">
                  {view.myRoundResult.outcomeText}
                </div>
                {view.myRoundResult.correctionFeedback && (
                  <div className="text-xs opacity-85 italic pt-1">
                    {view.myRoundResult.correctionFeedback}
                  </div>
                )}
              </div>
            )}

            {/* Official House Ruling */}
            {view.sentence && (
              <div className="glass-panel rounded-2xl p-4 sm:p-5 border border-[#d4af37]/50 space-y-2.5 text-left">
                <div className="text-xs font-sans font-extrabold uppercase tracking-wider text-amber-800 dark:text-[#fef08a]">
                  {isClozeRound
                    ? `✓ Official Answer: "${view.sentence.correctAnswer}"`
                    : view.sentence.isCorrect
                      ? '✓ Valid Sentence'
                      : `✕ Flawed — Revision: "${view.sentence.correction}"`}
                </div>
                {view.sentence.explanation && (
                  <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                    {view.sentence.explanation}
                  </p>
                )}
              </div>
            )}

            {/* Live Standings */}
            <div className="glass-panel rounded-2xl p-4 border border-[#d4af37]/40 space-y-2.5">
              <div className="text-xs font-sans font-extrabold uppercase tracking-widest text-amber-800 dark:text-[#d4af37]">
                Table Standings
              </div>
              <div className="divide-y divide-[#d4af37]/15">
                {[...view.peers]
                  .sort((a, b) => b.money - a.money)
                  .map((p, idx) => (
                    <div
                      key={p.id}
                      className={`py-2.5 flex items-center justify-between text-sm ${
                        p.id === view.me.id ? 'font-extrabold text-amber-700 dark:text-[#fef08a]' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="font-sans tabular-nums text-xs opacity-70 w-5">#{idx + 1}</span>
                        <span className="text-xl">{p.avatar}</span>
                        <span className="truncate font-sans uppercase">{p.name}</span>
                      </div>
                      <span className="font-sans tabular-nums font-bold tabular-nums">
                        ${p.money.toLocaleString()}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================
            TABLE CLOSED / GAME OVER (GAME_OVER)
           ================================================================ */}
        {view.step === 'GAME_OVER' && (() => {
          const sortedPeers = [...view.peers].sort((a, b) => b.money - a.money);
          const myRank = Math.max(1, sortedPeers.findIndex(p => p.id === view.me.id) + 1);
          const history = view.roundHistory || [];
          let myTotalHands = 0;
          let myWins = 0;
          history.forEach(round => {
            const res = round.playerResults.find(
              pr => pr.playerId === view.me.id || pr.playerName === view.me.name
            );
            if (res) {
              myTotalHands++;
              if (res.isWin) myWins++;
            }
          });
          const myAccuracy = myTotalHands > 0 ? Math.round((myWins / myTotalHands) * 100) : 0;
          const isMeChampion = view.winner?.id === view.me.id;

          const handleDownloadPdf = () => {
            if (isGeneratingPdf || history.length === 0) return;
            playSound('click');
            setIsGeneratingPdf(true);
            setPdfStatusToast(null);

            setTimeout(() => {
              try {
                const reportPlayers: Player[] = view.peers.map(p => ({
                  id: p.id,
                  name: p.name,
                  avatar: p.avatar,
                  money: p.money,
                  winStreak: p.winStreak,
                  effects: p.effects,
                  history: [],
                }));

                const doc = generateGrammarReportPDF({
                  history,
                  players: reportPlayers,
                  winner: view.winner || null,
                  settings: {
                    topic: view.settings.topic,
                    level: view.settings.level as any,
                    theme: view.settings.theme,
                  },
                  gameMode: view.gameMode,
                  totalRounds: view.totalRounds,
                  targetAmount: view.targetAmount,
                  filterName: 'All Rounds',
                });

                const dateStamp = new Date().toISOString().slice(0, 10);
                doc.save(`Grammar_Casino_Report_Card_${dateStamp}.pdf`);
                playSound('success');
                setPdfStatusToast('✨ Grammar Report Card PDF downloaded!');
                setTimeout(() => setPdfStatusToast(null), 4000);
              } catch (err) {
                console.error('Failed to generate PDF on student device:', err);
                setPdfStatusToast('⚠️ Could not generate PDF. Please try again.');
                setTimeout(() => setPdfStatusToast(null), 4000);
              } finally {
                setIsGeneratingPdf(false);
              }
            }, 100);
          };

          return (
            <div className="space-y-4 animate-fade-in pb-8">
              {/* Table Closed Header Banner */}
              <div className="text-center pt-2 pb-1">
                <div className="text-[11px] font-sans uppercase tracking-[0.3em] text-amber-800 dark:text-[#d4af37] font-bold">
                  Salon Privé · Final Settlement
                </div>
                <h1 className="text-3xl sm:text-4xl font-black text-gold tracking-wider font-display title-glow mt-1">
                  TABLE CLOSED
                </h1>
                <div className="h-[1px] w-36 mx-auto bg-gradient-to-r from-transparent via-[#d4af37] to-transparent mt-2" />
              </div>

              {/* Champion Card */}
              {view.winner ? (
                <div className="luxury-card rounded-3xl p-6 text-center relative border-2 border-[#d4af37] shadow-2xl space-y-3">
                  <div className="text-4xl filter drop-shadow">👑</div>
                  <div className="w-20 h-20 mx-auto rounded-full border-3 border-[#d4af37] felt-well flex items-center justify-center text-5xl shadow-lg">
                    {view.winner.avatar}
                  </div>
                  <div>
                    <div className="text-[11px] font-sans uppercase tracking-[0.25em] text-amber-800 dark:text-[#fef08a] font-bold">
                      {isMeChampion ? '🎉 You Are The Champion!' : 'Grand Salon Champion'}
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-sans font-extrabold text-slate-900 dark:text-amber-50 uppercase tracking-wider mt-0.5">
                      {view.winner.name}
                    </h2>
                  </div>
                  <div className="felt-well rounded-2xl p-3.5 border border-[#d4af37]/30">
                    <div className="text-[10px] font-sans uppercase tracking-[0.2em] text-slate-500 dark:text-amber-200/70 font-bold">
                      Winning Vault Balance
                    </div>
                    <div className="text-3xl font-sans tabular-nums font-black text-gold-flat tabular-nums mt-0.5">
                      ${view.winner.money.toLocaleString()}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="luxury-card rounded-3xl p-6 text-center border-2 border-[#d4af37]/50 shadow-xl space-y-2">
                  <div className="text-5xl">🏛️</div>
                  <h2 className="text-2xl font-sans font-extrabold text-slate-900 dark:text-amber-100 uppercase tracking-wider">
                    The House Prevails
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-amber-200/70 font-editorial italic">
                    Final accounts have been settled at the table.
                  </p>
                </div>
              )}

              {/* Personal Session Stats */}
              <div className="glass-panel rounded-2xl p-4 border border-[#d4af37]/50 space-y-3">
                <div className="text-xs font-sans font-extrabold uppercase tracking-widest text-amber-800 dark:text-[#d4af37] flex items-center justify-between">
                  <span>Your Final Summary</span>
                  <span className="font-sans tabular-nums text-slate-700 dark:text-[#fef08a]">
                    Rank #{myRank} of {sortedPeers.length}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2.5 text-center">
                  <div className="felt-well rounded-xl p-2.5 border border-[#d4af37]/25">
                    <div className="text-[10px] font-sans uppercase tracking-wider text-slate-500 dark:text-amber-200/70">
                      Final Vault
                    </div>
                    <div className="text-base sm:text-lg font-sans tabular-nums font-black text-emerald-700 dark:text-[#fef08a] tabular-nums mt-0.5">
                      ${view.me.money.toLocaleString()}
                    </div>
                  </div>
                  <div className="felt-well rounded-xl p-2.5 border border-[#d4af37]/25">
                    <div className="text-[10px] font-sans uppercase tracking-wider text-slate-500 dark:text-amber-200/70">
                      Hands Won
                    </div>
                    <div className="text-base sm:text-lg font-sans tabular-nums font-black text-slate-900 dark:text-amber-50 tabular-nums mt-0.5">
                      {myWins}/{myTotalHands}
                    </div>
                  </div>
                  <div className="felt-well rounded-xl p-2.5 border border-[#d4af37]/25">
                    <div className="text-[10px] font-sans uppercase tracking-wider text-slate-500 dark:text-amber-200/70">
                      Accuracy
                    </div>
                    <div className="text-base sm:text-lg font-sans tabular-nums font-black text-amber-800 dark:text-amber-300 tabular-nums mt-0.5">
                      {myAccuracy}%
                    </div>
                  </div>
                </div>
              </div>

              {/* Download PDF Report Card CTA */}
              {history.length > 0 && (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleDownloadPdf}
                    disabled={isGeneratingPdf}
                    className="w-full min-h-[52px] px-5 py-3.5 rounded-2xl bg-gradient-to-b from-[#fef08a] via-[#eab308] to-[#a16207] text-[#1c0a04] border border-[#fef9c3] font-sans font-black text-sm sm:text-base uppercase tracking-[0.14em] shadow-xl active:scale-98 transition-all cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2.5"
                  >
                    {isGeneratingPdf ? (
                      <>
                        <span className="animate-spin text-base">⏳</span>
                        <span>Generating Report Card PDF...</span>
                      </>
                    ) : (
                      <>
                        <span className="text-lg leading-none">📄</span>
                        <span>Download Grammar Report Card (PDF)</span>
                      </>
                    )}
                  </button>
                  {pdfStatusToast && (
                    <div className="text-center text-xs font-sans font-bold text-emerald-700 dark:text-emerald-300 py-1 animate-fade-in">
                      {pdfStatusToast}
                    </div>
                  )}
                </div>
              )}

              {/* Final Standings Leaderboard */}
              <div className="glass-panel rounded-2xl p-4 border border-[#d4af37]/40 space-y-2.5">
                <div className="text-xs font-sans font-extrabold uppercase tracking-widest text-amber-800 dark:text-[#d4af37]">
                  🏆 Final Standings
                </div>
                <div className="divide-y divide-[#d4af37]/15">
                  {sortedPeers.map((p, idx) => (
                    <div
                      key={p.id}
                      className={`py-2.5 flex items-center justify-between text-sm ${
                        p.id === view.me.id ? 'font-extrabold text-amber-700 dark:text-[#fef08a]' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="font-sans tabular-nums text-xs opacity-70 w-6">
                          {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                        </span>
                        <span className="text-xl">{p.avatar}</span>
                        <span className="truncate font-sans uppercase">{p.name}</span>
                      </div>
                      <span className="font-sans tabular-nums font-bold tabular-nums">
                        ${p.money.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}
      </main>

      {/* Sticky Bottom CTA Bar during IN_GAME */}
      {view.step === 'IN_GAME' && !view.isFrozen && view.me.money > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 p-3 bg-gradient-to-t from-black/90 via-black/70 to-transparent">
          <div className="max-w-xl mx-auto">
            <button
              type="button"
              onClick={handleToggleLockIn}
              disabled={isPlayerLocked && !canStudentUnlock}
              className={`w-full min-h-[52px] rounded-2xl font-sans font-black text-sm sm:text-base uppercase tracking-[0.18em] shadow-xl transition-all flex items-center justify-center gap-2 ${
                isPlayerLocked
                  ? !canStudentUnlock
                    ? 'bg-slate-800/95 text-amber-200 border-2 border-amber-500/50 cursor-not-allowed opacity-95'
                    : 'bg-emerald-600 text-white border-2 border-emerald-300 cursor-pointer'
                  : 'bg-gradient-to-b from-[#fef08a] via-[#eab308] to-[#a16207] text-[#1c0a04] border border-[#fef9c3] cursor-pointer'
              }`}
            >
              {isPlayerLocked ? (
                !canStudentUnlock ? (
                  <span>
                    {isRoundTimeUp
                      ? '🔒 TIME\u2019S UP · WAGER LOCKED'
                      : '🔒 WAGER LOCKED IN'}
                  </span>
                ) : (
                  <>
                    <span>✓ WAGER LOCKED IN</span>
                    <span className="text-[11px] font-sans font-normal opacity-90">(Tap to Unlock)</span>
                  </>
                )
              ) : (
                <span>LOCK IN WAGER 🔒</span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Target Selection Modal for Offensive Power-Ups */}
      {view.pendingTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel rounded-3xl max-w-md w-full p-6 border-2 border-[#d4af37] space-y-4">
            <div className="text-center space-y-1">
              <div className="text-4xl">{POWER_UPS[view.pendingTarget.powerUp]?.icon}</div>
              <h3 className="text-xl font-sans font-black text-gold uppercase">
                Activate {POWER_UPS[view.pendingTarget.powerUp]?.name}
              </h3>
              <p className="text-xs text-slate-600 dark:text-amber-100/80">
                {POWER_UPS[view.pendingTarget.powerUp]?.description}
              </p>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {view.pendingTarget.eligibleTargets.map((t) => {
                const blocked = t.isShielded || t.targetedThisRound;
                return (
                  <button
                    key={t.id}
                    type="button"
                    disabled={blocked}
                    onClick={() =>
                      sendIntent({
                        type: 'SELECT_POWER_UP_TARGET',
                        powerUp: view.pendingTarget!.powerUp,
                        targetId: t.id,
                      })
                    }
                    className={`w-full min-h-[52px] px-4 py-2.5 rounded-xl border flex items-center justify-between transition-all ${
                      blocked
                        ? 'opacity-45 grayscale cursor-not-allowed felt-well border-slate-500/30'
                        : 'felt-well border-[#d4af37]/60 hover:border-[#d4af37] cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl">{t.avatar}</span>
                      <div className="text-left">
                        <div className="text-sm font-sans font-bold text-slate-900 dark:text-white">
                          {t.name}
                        </div>
                        {blocked && (
                          <div className="text-[10px] text-amber-400 font-bold uppercase">
                            🛡️ Protected This Round
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="font-sans tabular-nums font-bold text-sm text-emerald-500 tabular-nums">
                      ${t.money.toLocaleString()}
                    </span>
                  </button>
                );
              })}
            </div>

            {view.pendingTarget.powerUp !== 'SWAP' && (
              <button
                type="button"
                onClick={() =>
                  sendIntent({
                    type: 'CANCEL_POWER_UP_TARGET',
                    powerUp: view.pendingTarget!.powerUp,
                  })
                }
                className="w-full min-h-[46px] rounded-xl felt-well border border-slate-400/40 text-xs font-sans font-bold uppercase tracking-wider"
              >
                Cancel &amp; Refund ($50)
              </button>
            )}
          </div>
        </div>
      )}

      {/* Wheel of Fortune Modal on Student Device */}
      {view.pendingWheelSpin && (
        <WheelModal
          player={view.me}
          onClose={() => {}}
          onApplyResult={(item: WheelItem) => {
            sendIntent({ type: 'APPLY_WHEEL_RESULT', itemId: item.id });
          }}
          playSound={playSound}
        />
      )}

      {/* Power-Up Activation Modal Window */}
      {activeToast && (
        <Modal
          title={activeToast.title}
          onClose={() => setActiveToast(null)}
          playSound={playSound}
          hideCloseButton
        >
          <div className="text-center py-4">
            <div className="text-7xl mb-5 filter drop-shadow-lg flex justify-center">
              <span>{activeToast.icon || '✨'}</span>
            </div>
            <p className="text-lg sm:text-xl text-slate-800 dark:text-slate-200 font-medium leading-relaxed whitespace-pre-line">
              {activeToast.message}
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default StudentControllerView;
