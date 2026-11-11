import { safeLocalStorage } from '../utils/safeStorage';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ANSWER_INPUT_PROPS, keepFieldInView } from '../utils/answerInputProps';
import {
  HINT_COST,
  POWERUP_COST,
  POWER_UPS,
} from '../constants';
import { getRandomCharacterAvatar } from '../utils/characterAvatars';
import { PlayerAvatar, CharacterPickerPanel } from './PlayerAvatar';
import { Bet, Player, PowerUpKey, QuestionType, SoundEffect, WheelItem } from '../types';
import {
  PlayerViewPayload,
  StudentIntent,
  isBetCompleteForQuestionType,
  isValidKeyWordTransformationPhrase,
} from '../utils/multiplayerProtocol';
import { StudentRoomController } from '../services/multiplayerService';
import WheelModal from './WheelModal';
import SentenceText from './SentenceText';
import Modal from './Modal';
import { StudentRoundTimerBar, useTurnCountdown } from './TurnTimer';
import { diffWords } from '../utils/errorHighlight';
import { generateFriendlyName } from '../utils/nameFilter';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Download,
  Lightbulb,
  Lock,
  LockOpen,
  LogOut,
  Moon,
  Snowflake,
  Sparkles,
  Sun,
  X,
} from 'lucide-react';

const STUDENT_SESSION_STORAGE_KEY = 'grammar_casino_student_session_v1';
/** Rooms this phone was removed from (package R6), with the time, kept for 12 hours. */
const REMOVED_ROOMS_STORAGE_KEY = 'grammar_casino_removed_rooms_v1';
const REMOVED_ROOM_MS = 12 * 60 * 60 * 1000;
const REMOVED_MESSAGE = 'The teacher removed you from this room.';

function readRemovedRooms(): Record<string, number> {
  try {
    const parsed = JSON.parse(safeLocalStorage.getItem(REMOVED_ROOMS_STORAGE_KEY) || '{}');
    const now = Date.now();
    const fresh: Record<string, number> = {};
    Object.entries(parsed || {}).forEach(([code, at]) => {
      if (typeof at === 'number' && now - at < REMOVED_ROOM_MS) fresh[code] = at;
    });
    return fresh;
  } catch {
    return {};
  }
}

function rememberRemovedRoom(code: string) {
  safeLocalStorage.setItem(REMOVED_ROOMS_STORAGE_KEY, JSON.stringify({ ...readRemovedRooms(), [code]: Date.now() }));
}

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

const isTouchScreen = () => {
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
};

export const StudentControllerView: React.FC<StudentControllerViewProps> = ({
  initialRoomCode = '',
  onExitStudentMode,
  playSound,
  isDarkMode,
  onToggleTheme,
}) => {
  const [roomCodeInput, setRoomCodeInput] = useState(() => initialRoomCode.toUpperCase());
  const [playerNameInput, setPlayerNameInput] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(() => getRandomCharacterAvatar());
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
  /** A text field has focus on a touch screen, so the on-screen keyboard is probably open. */
  const [isTyping, setIsTyping] = useState<'answer' | 'wager' | null>(null);
  const lastCorrectionTapRef = useRef<number>(0);

  // Load saved session on mount and auto-reconnect if matching room code
  useEffect(() => {
    try {
      const raw = safeLocalStorage.getItem(STUDENT_SESSION_STORAGE_KEY);
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
        if (nextView.step === 'RESULTS') {
          const delta = nextView.myRoundResult?.amountChanged ?? 0;
          if (delta > 0) playSound('roundWin');
          else if (delta < 0) playSound(nextView.me && nextView.me.money <= 0 ? 'bankrupt' : 'roundLose');
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
    if (readRemovedRooms()[code]) {
      setJoinError(REMOVED_MESSAGE);
      return;
    }

    setIsJoining(true);
    setJoinError(null);
    setJoinWaitingMessage(null);

    try {
      let tokenToUse = tokenOverride || '';
      if (!tokenToUse) {
        try {
          const savedRaw = safeLocalStorage.getItem(STUDENT_SESSION_STORAGE_KEY);
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
        onKicked: (reason?: 'removed' | 'closed') => {
          safeLocalStorage.removeItem(STUDENT_SESSION_STORAGE_KEY);
          setView(null);
          if (reason === 'removed') {
            rememberRemovedRoom(code);
            setJoinError(REMOVED_MESSAGE);
          } else {
            setJoinError('You were removed from the room or the room was closed.');
          }
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
      safeLocalStorage.setItem(STUDENT_SESSION_STORAGE_KEY, JSON.stringify(sessionToSave));
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

  // The teacher's Calm mode turns this phone's motion off too.
  const calmFromTeacher = Boolean(view?.calmMode);
  useEffect(() => {
    document.documentElement.classList.toggle('gc-calm-room', calmFromTeacher);
    return () => document.documentElement.classList.remove('gc-calm-room');
  }, [calmFromTeacher]);

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
    playSound('lockIn');
    sendIntent({ type: 'SET_FULL_BET', bet: localBet });
    sendIntent({ type: 'LOCK_IN', locked: true, bet: localBet });
  };

  // Enter on an answer field moves to the next missing control, or locks in when all is done.
  const onAnswerEnter = (e: React.KeyboardEvent<HTMLInputElement>, next: HTMLInputElement | null) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (next && !next.value.trim()) {
      next.focus();
      return;
    }
    if (!(Number(localBet.bet) > 0)) {
      wagerInputRef.current?.focus();
      return;
    }
    handleToggleLockIn();
  };

  // While the keyboard is open the pinned lock-in bar would cover the field, so it hides and
  // an inline lock-in button shows under the field instead.
  const typingBlurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTypingFocus = (el: HTMLElement, where: 'answer' | 'wager' = 'answer') => {
    if (typingBlurTimerRef.current) clearTimeout(typingBlurTimerRef.current);
    keepFieldInView(el);
    if (isTouchScreen()) setIsTyping(where);
  };
  const onTypingBlur = () => {
    // Wait a moment, so a tap on the inline lock-in button still lands.
    if (typingBlurTimerRef.current) clearTimeout(typingBlurTimerRef.current);
    typingBlurTimerRef.current = setTimeout(() => setIsTyping(null), 250);
  };

  const handleLeaveRoom = () => {
    if (view && !window.confirm('Leave the table? Your seat stays saved, and you can join again with the same name.')) return;
    controllerRef.current?.destroy();
    controllerRef.current = null;
    safeLocalStorage.removeItem(STUDENT_SESSION_STORAGE_KEY);
    setView(null);
    onExitStudentMode();
  };

  // ============================================================================
  // Screen 1: Join Form (Not yet seated in a room)
  // ============================================================================
  if (!view) {
    const fieldClass =
      'w-full rounded-gc border-2 border-gc-line/[0.14] bg-gc-line/[0.06] text-gc-ink placeholder:text-gc-quiet/70 focus:outline-none focus:border-gc-gold transition-colors';
    return (
      <div className="game-container min-h-[100dvh] text-gc-ink flex justify-center">
        <div className="w-full max-w-md min-h-[100dvh] flex flex-col px-[22px] pt-5 pb-7 animate-gc-slide-up">
          <div className="flex items-center justify-between mb-6">
            <p className="font-logo font-bold text-[17px] tracking-[0.08em] text-gc-gold m-0">Grammar Casino</p>
            <button
              type="button"
              onClick={onToggleTheme}
              className="w-11 h-11 rounded-gc-sm grid place-items-center bg-gc-line/[0.07] border border-gc-line/[0.12] text-gc-quiet cursor-pointer"
              aria-label={isDarkMode ? 'Switch to the light theme' : 'Switch to the dark theme'}
            >
              {isDarkMode ? <Sun className="w-[18px] h-[18px]" aria-hidden="true" /> : <Moon className="w-[18px] h-[18px]" aria-hidden="true" />}
            </button>
          </div>

          <h1 className="text-[30px] leading-tight font-extrabold tracking-tight m-0">Join the table</h1>
          <p className="mt-1.5 mb-5 text-gc-body text-gc-quiet">Type the code shown on the projector.</p>

          {joinError && (
            <div role="alert" className="mb-4 px-4 py-3 rounded-gc bg-gc-loss/10 border border-gc-loss/40 text-gc-small font-semibold text-gc-ink">
              {joinError}
            </div>
          )}
          {isJoining && joinWaitingMessage && (
            <div role="status" className="mb-4 px-4 py-3 rounded-gc bg-gc-info/10 border border-gc-info/35 text-gc-small font-semibold text-gc-ink">
              {joinWaitingMessage}
            </div>
          )}

          <label htmlFor="gc-join-code" className="block mb-2 text-gc-small font-bold text-gc-quiet">Room code</label>
          <input
            id="gc-join-code"
            type="text"
            maxLength={4}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={roomCodeInput}
            onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
            placeholder="K7XM"
            aria-label="Room code"
            className={`${fieldClass} h-[68px] mb-5 text-center text-[30px] font-extrabold tracking-[0.5em] pl-[0.5em] uppercase tabular-nums`}
          />

          <label htmlFor="gc-join-name" className="block mb-2 text-gc-small font-bold text-gc-quiet">Your name</label>
          <input
            id="gc-join-name"
            type="text"
            maxLength={20}
            autoComplete="off"
            value={playerNameInput}
            onChange={(e) => setPlayerNameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleJoinRoom();
            }}
            placeholder="First name"
            className={`${fieldClass} h-14 mb-2 px-4 text-lg font-semibold`}
          />
          <button
            type="button"
            onClick={() => setPlayerNameInput(generateFriendlyName())}
            className="mb-5 min-h-[44px] px-3 -ml-3 text-gc-small font-semibold text-gc-quiet underline underline-offset-4 cursor-pointer hover:text-gc-ink"
          >
            Give me a name
          </button>

          <span className="block mb-2 text-gc-small font-bold text-gc-quiet" id="gc-join-avatar">Choose & customize your character</span>
          <div role="group" aria-labelledby="gc-join-avatar">
            <CharacterPickerPanel
              value={selectedAvatar}
              onChange={setSelectedAvatar}
              playerName={playerNameInput || 'VIP Guest'}
              playSound={playSound}
              compact
            />
          </div>

          <div className="mt-auto pt-6 space-y-2">
            <button
              type="button"
              disabled={isJoining}
              onClick={() => handleJoinRoom()}
              className="gc-btn-primary w-full h-[58px] rounded-full text-lg font-extrabold flex items-center justify-center gap-2.5 cursor-pointer active:scale-[0.99] transition-transform"
            >
              {isJoining ? (joinWaitingMessage ? 'Waiting for the teacher…' : 'Connecting…') : (
                <>
                  Join the table
                  <ArrowRight className="w-[18px] h-[18px]" aria-hidden="true" />
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onExitStudentMode}
              className="w-full min-h-[44px] text-gc-small font-semibold text-gc-quiet underline underline-offset-4 cursor-pointer"
            >
              Back to the main screen
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

  // Plain names for the answer types, as on the projector.
  const formatLabel =
    qType === 'multipleChoice'
      ? 'Multiple choice'
      : qType === 'openCloze'
        ? 'Open cloze'
        : qType === 'wordFormation'
          ? 'Word formation'
          : qType === 'keyWordTransformation'
            ? 'Key word transformation'
            : 'Valid or flawed?';

  // A true minus sign: a hyphen leaves a gap before the $ at large sizes.
  const money = (n: number) => `${n < 0 ? '\u2212' : ''}$${Math.abs(Math.round(n)).toLocaleString()}`;
  const betAmountNum = Number(localBet.bet) || 0;

  // What the player has picked so far, in words (for the lock button and the locked-in screen).
  const pickText = (() => {
    if (qType === 'binary') {
      if (hasSplitBet) {
        const p = localBet.splitCorrectPercent ?? 50;
        return `${p}% Valid, ${100 - p}% Flawed`;
      }
      return localBet.opinion === 'correct' ? 'Valid' : localBet.opinion === 'incorrect' ? 'Flawed' : '';
    }
    if (qType === 'multipleChoice') {
      if (hasSplitBet) {
        const list = localBet.splitOptions || [];
        return list.length === 2 && list[0] === list[1] ? `${list[0]} (2×)` : list.join(' / ');
      }
      return localBet.selectedOption || '';
    }
    if (hasSplitBet) {
      return (localBet.splitClozeAnswers || []).map((w) => (w || '').trim()).filter(Boolean).join(' / ');
    }
    return (localBet.clozeAnswer || '').trim();
  })();
  const isReadyToLock = Boolean(pickText) && betAmountNum > 0;
  const lockLabel = isReadyToLock
    ? `Lock in ${money(betAmountNum)} on ${pickText}`
    : !pickText
      ? qType === 'binary'
        ? 'Choose Valid or Flawed'
        : qType === 'multipleChoice'
          ? 'Choose an answer'
          : 'Type your answer'
      : 'Now choose your bet';

  // Shown under the field being typed in while the keyboard hides the pinned lock-in bar.
  const inlineLockButton = (
    <button
      type="button"
      onClick={handleToggleLockIn}
      className={`w-full min-h-[52px] py-2.5 px-5 rounded-full text-gc-body font-extrabold flex items-center justify-center gap-2 cursor-pointer ${
        isReadyToLock ? 'gc-btn-primary' : 'bg-gc-card/95 border border-gc-line/[0.16] text-gc-quiet'
      }`}
    >
      {isReadyToLock && <Lock className="w-5 h-5 shrink-0" aria-hidden="true" />}
      <span className="break-words min-w-0">{lockLabel}</span>
    </button>
  );

  const sectionTitle = 'text-gc-small font-bold text-gc-quiet';
  const requiredChip = 'text-gc-cap font-bold px-2.5 py-0.5 rounded-full bg-gc-loss/15 text-gc-loss';
  const textField =
    'w-full rounded-gc-sm border-2 bg-gc-line/[0.05] text-gc-ink placeholder:text-gc-quiet/70 placeholder:font-sans placeholder:not-italic placeholder:text-gc-body focus:outline-none transition-colors';
  const fieldOk = 'border-gc-line/[0.16] focus:border-gc-gold';
  const fieldBad = 'border-gc-loss ring-2 ring-gc-loss/25';

  return (
    <div className="game-container min-h-[100dvh] text-gc-ink flex flex-col pb-28">
      {/* Package R8: the teacher paused the hand. Nothing can be changed until it resumes. */}
      {view.paused && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-6 bg-black/75 backdrop-blur-sm" role="alert" aria-live="assertive">
          <div className="w-full max-w-sm rounded-gc bg-gc-card border border-gc-line/[0.14] shadow-gc-1 p-6 text-center space-y-3">
            <p className="text-gc-h2 font-bold">Paused</p>
            <p className="text-gc-body">Your teacher paused the game. Your bet is safe. Wait a moment.</p>
          </div>
        </div>
      )}
      {/* Top bar: who you are, the room and hand, your balance */}
      <header className="sticky top-0 z-30 min-h-16 pt-[env(safe-area-inset-top)] px-4 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] bg-gc-bg/85 backdrop-blur-md border-b border-gc-line/[0.1] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => setShowAvatarPicker((v) => !v)}
            className="w-11 h-11 rounded-full border-2 border-gc-turn/70 p-0.5 bg-gc-line/[0.08] grid place-items-center shrink-0 cursor-pointer hover:scale-105 transition-transform"
            aria-label="Change your avatar"
            aria-expanded={showAvatarPicker}
          >
            <PlayerAvatar value={view.me.avatar} size="md" className="w-full h-full" />
          </button>
          <div className="min-w-0">
            <div className="text-[15px] font-bold text-gc-ink truncate leading-tight">{view.me.name}</div>
            <div className="text-[12.5px] font-semibold text-gc-quiet tabular-nums flex items-center gap-1.5 leading-tight">
              <span>Room {view.roomCode}</span>
              {view.step === 'IN_GAME' || view.step === 'RESULTS' ? <span>· Hand {view.round}</span> : null}
              {!isConnected && <span>· Reconnecting</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {view.me.winStreak > 1 && (
            <span className="h-8 px-2.5 rounded-full bg-gc-gold/15 text-gc-money text-gc-small font-bold tabular-nums inline-flex items-center" title={`${view.me.winStreak} wins in a row`}>
              🔥 {view.me.winStreak}
            </span>
          )}
          <div className="h-9 px-3 rounded-full bg-gc-line/[0.07] border border-gc-line/[0.12] inline-flex items-center text-gc-body font-extrabold text-gc-money tabular-nums">
            {money(view.me.money)}
          </div>
          <button
            type="button"
            onClick={handleLeaveRoom}
            className="w-11 h-11 rounded-full grid place-items-center text-gc-quiet hover:text-gc-danger cursor-pointer"
            aria-label="Leave the room"
            title="Leave the room"
          >
            <LogOut className="w-[18px] h-[18px]" aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Avatar picker */}
      {showAvatarPicker && (
        <div className="w-full max-w-xl mx-auto px-4 pt-3 animate-gc-slide-up">
          <div className="gc-surface rounded-gc-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-gc-small font-bold text-gc-ink">Customize your character</span>
              <button
                type="button"
                onClick={() => setShowAvatarPicker(false)}
                className="h-11 px-4 rounded-full text-gc-small font-bold text-gc-on-gold bg-gc-gold cursor-pointer"
              >
                Done
              </button>
            </div>
            <CharacterPickerPanel
              value={view.me.avatar}
              onChange={(av) => {
                sendIntent({ type: 'UPDATE_PROFILE', avatar: av });
              }}
              playerName={view.me.name}
              playSound={playSound}
              compact
            />
          </div>
        </div>
      )}

      <main className="w-full max-w-xl mx-auto px-4 pt-4 space-y-4 flex-1">

        {/* ================================================================
            WAITING IN LOBBY (PLAYER_SETUP or SETTINGS)
           ================================================================ */}
        {(view.step === 'PLAYER_SETUP' || view.step === 'SETTINGS') && (
          <div className="pt-8 pb-4 text-center animate-gc-slide-up">
            <div className="w-24 h-24 mx-auto rounded-full border-[3px] border-gc-turn/70 p-1 bg-gc-line/[0.08] grid place-items-center">
              <PlayerAvatar value={view.me.avatar} size="2xl" className="w-full h-full" animated />
            </div>
            <h1 className="mt-6 mb-1.5 text-[30px] leading-tight font-extrabold">You're in, {view.me.name}!</h1>
            <p className="m-0 text-[17px] leading-relaxed text-gc-quiet">
              Watch the projector. Your betting card opens here when the teacher deals the first hand.
            </p>

            <div className="mt-8 gc-surface rounded-gc-lg p-4 text-left">
              <h2 className={`${sectionTitle} mb-2.5`}>At the table ({view.peers.length})</h2>
              <div className="flex flex-wrap gap-2">
                {view.peers.map((p) => (
                  <span
                    key={p.id}
                    className={`h-9 pl-1.5 pr-3 rounded-full text-gc-small font-semibold inline-flex items-center gap-1.5 ${
                      p.id === view.me.id ? 'bg-gc-gold/15 text-gc-ink ring-1 ring-inset ring-gc-gold/50' : 'bg-gc-line/[0.07] text-gc-ink'
                    }`}
                  >
                    <PlayerAvatar value={p.avatar} size="xs" />
                    <span>{p.name}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================
            BETTING (IN_GAME)
           ================================================================ */}
        {view.step === 'IN_GAME' && (
          <>
            {/* Shared round timer, when the teacher turned it on */}
            {(view.turnDurationMs ?? 0) > 0 && (
              <StudentRoundTimerBar
                timer={view.roundTimer}
                turnDurationMs={view.turnDurationMs || 0}
                lockedIn={isPlayerLocked}
              />
            )}

            {/* Out of money, or frozen */}
            {view.me.money <= 0 ? (
              <div role="status" className="p-5 rounded-gc-lg bg-gc-loss/10 border border-gc-loss/40 text-center space-y-1">
                <div className="text-3xl" aria-hidden="true">💸</div>
                <div className="text-gc-lead font-extrabold text-gc-loss">
                  {view.gameMode === 'lastPlayer' ? "You're out of the game" : "You're out of money this hand"}
                </div>
                <p className="m-0 text-gc-small text-gc-quiet">
                  {view.gameMode === 'lastPlayer'
                    ? 'Watch the projector to see who wins.'
                    : 'You get $150 from the house at the start of the next hand.'}
                </p>
              </div>
            ) : view.isFrozen ? (
              <div role="status" className="p-5 rounded-gc-lg bg-gc-info/10 border border-gc-info/40 text-center space-y-1">
                <Snowflake className="w-8 h-8 mx-auto text-gc-info" aria-hidden="true" />
                <div className="text-gc-lead font-extrabold text-gc-info">You're frozen this hand</div>
                <p className="m-0 text-gc-small text-gc-quiet">Another player froze you. You can bet again on the next hand.</p>
              </div>
            ) : null}

            {isPlayerLocked && !view.isFrozen && view.me.money > 0 && view.sentence ? (
              /* Locked in: a calm screen until the reveal */
              <div className="pt-6 pb-2 flex flex-col items-center text-center animate-gc-slide-up">
                <div
                  className={`w-[120px] h-[120px] rounded-full grid place-items-center ${
                    isRoundTimeUp && !view.lockedIn ? 'bg-gc-loss/15 text-gc-loss' : 'bg-gc-win/15 text-gc-win animate-gc-ring'
                  }`}
                  aria-hidden="true"
                >
                  {isRoundTimeUp && !view.lockedIn ? <Lock className="w-14 h-14" strokeWidth={2.2} /> : <Check className="w-14 h-14" strokeWidth={2.4} />}
                </div>
                <h1 className="mt-6 mb-1.5 text-[30px] leading-tight font-extrabold">
                  {isRoundTimeUp && !view.lockedIn ? "Time's up" : "You're locked in"}
                </h1>
                <p className="m-0 text-[17px] leading-relaxed text-gc-quiet">Watch the projector for the reveal.</p>
                <span className="mt-4 max-w-full min-h-10 px-4 py-1.5 rounded-full inline-flex items-center gap-1.5 text-[17px] font-extrabold bg-gc-line/[0.07] border border-gc-line/[0.12]">
                  {pickText ? (
                    <>
                      <span className="break-words min-w-0">{pickText}</span>
                      <span className="text-gc-money tabular-nums shrink-0">· {money(betAmountNum)}</span>
                    </>
                  ) : (
                    'No bet placed'
                  )}
                </span>
                {canStudentUnlock ? (
                  <button
                    type="button"
                    onClick={handleToggleLockIn}
                    className="mt-6 min-h-[44px] px-4 inline-flex items-center gap-2 text-gc-small font-semibold text-gc-quiet underline underline-offset-4 cursor-pointer"
                  >
                    <LockOpen className="w-4 h-4" aria-hidden="true" />
                    Change my answer
                  </button>
                ) : (
                  <p className="mt-6 text-gc-small text-gc-quiet">
                    {isRoundTimeUp ? 'Only the teacher can reopen your bet now.' : 'The teacher is revealing the answer.'}
                  </p>
                )}
              </div>
            ) : (
              <>
                {/* The sentence */}
                <section className="gc-surface rounded-[20px] px-[18px] py-4 text-center animate-gc-deal" aria-label="The sentence">
                  <span className="inline-flex items-center h-[26px] px-[11px] rounded-full bg-gc-gold text-gc-on-gold text-[12.5px] font-bold">
                    Hand {view.round} · {formatLabel}
                  </span>
                  <div className="mt-1.5 text-gc-cap font-semibold text-gc-quiet">
                    {view.settings.topic} · {view.settings.level}
                  </div>

                  {view.isLoadingSentence || !view.sentence ? (
                    <div className="py-7 space-y-2">
                      <div className="text-3xl animate-pulse" aria-hidden="true">♠</div>
                      <div className="text-gc-body font-semibold text-gc-quiet">Dealing the next sentence…</div>
                    </div>
                  ) : (
                    <div className="space-y-3 pt-2">
                      {qType === 'keyWordTransformation' && view.sentence.leadInSentence && (
                        <div className="px-3.5 py-3 rounded-gc bg-gc-line/[0.05] border border-gc-line/[0.12] space-y-1.5">
                          <div className="text-gc-cap font-bold text-gc-quiet">First sentence (keep the meaning)</div>
                          <p className="m-0 text-gc-lead font-sentence italic text-gc-ink leading-snug">
                            &ldquo;{view.sentence.leadInSentence}&rdquo;
                          </p>
                          {view.sentence.baseWord && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-gc-gold text-gc-on-gold font-extrabold text-gc-small tracking-wider">
                              <span aria-hidden="true">🔑</span>
                              Key word: {view.sentence.baseWord.toUpperCase()}
                            </span>
                          )}
                        </div>
                      )}
                      <p
                        className="m-0 font-sentence italic font-medium text-[23px] leading-[1.3] text-gc-ink text-balance"
                      >
                        <SentenceText
                          text={view.sentence?.text || ''}
                          highlight={view.sentence?.grammarPhrase}
                          showGaps={isClozeRound}
                          baseWord={qType === 'wordFormation' ? view.sentence?.baseWord : null}
                          size="phone"
                        />
                      </p>
                    </div>
                  )}

                  {/* Power-ups and effects on this player */}
                  {(view.myActivePowerUps.length > 0 || view.isBetCapped || view.isHighRoller) && (
                    <div className="mt-3 pt-3 border-t border-gc-line/[0.1] flex flex-wrap justify-center gap-1.5 text-gc-cap font-semibold">
                      {view.myActivePowerUps.map((pu, idx) => (
                        <span key={idx} className="px-2.5 py-1 rounded-full bg-purple-500/15 text-purple-800 dark:text-purple-200">
                          {POWER_UPS[pu.type]?.icon} {POWER_UPS[pu.type]?.name}
                        </span>
                      ))}
                      {view.isBetCapped && (
                        <span className="px-2.5 py-1 rounded-full bg-gc-loss/15 text-gc-loss">
                          🧢 Bets up to ${view.betCapAmount}
                        </span>
                      )}
                      {view.isHighRoller && (
                        <span className="px-2.5 py-1 rounded-full bg-gc-gold/15 text-gc-money">
                          🔥 Bet at least ${view.minBetAmount}
                        </span>
                      )}
                    </div>
                  )}
                </section>

                {/* Scalpel clue */}
                {view.scalpelHint?.clozeMask && (
                  <div className="px-4 py-3 rounded-gc bg-gc-info/10 border border-gc-info/35 flex items-center justify-between gap-2 text-gc-small">
                    <span className="font-bold text-gc-ink flex items-center gap-1.5">
                      <span aria-hidden="true">✂️</span>
                      Scalpel clue
                    </span>
                    <span className="tabular-nums font-extrabold text-gc-body px-3 py-0.5 rounded-full bg-gc-info/15 text-gc-info tracking-wider">
                      {view.scalpelHint.clozeMask}
                    </span>
                  </div>
                )}

                {/* Peekaboo: what the spied-on players are doing */}
                {view.peekabooSpyFeed && view.peekabooSpyFeed.length > 0 && (
                  <div className="p-4 rounded-gc bg-indigo-500/10 border border-indigo-500/30 dark:border-indigo-300/30 space-y-2 text-gc-small">
                    <div className="font-bold text-gc-ink flex items-center justify-between">
                      <span>🕵️ Peekaboo</span>
                      <span className="text-gc-cap font-semibold text-gc-quiet">Live</span>
                    </div>
                    {view.peekabooSpyFeed.map((spy) => (
                      <div key={spy.targetId} className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gc-line/[0.1]">
                        <div className="flex items-center gap-1.5 font-semibold">
                          <PlayerAvatar value={spy.targetAvatar} size="xs" />
                          <span>{spy.targetName}</span>
                          <span className="text-gc-cap text-gc-quiet">{spy.lockedIn ? 'Locked in' : 'Deciding'}</span>
                        </div>
                        <div className="tabular-nums font-bold text-right">
                          <span className="mr-2">{spy.answerSummary}</span>
                          <span className="px-2 py-0.5 rounded-full bg-gc-gold/15 text-gc-money">
                            {spy.betAmount !== '' ? `$${Number(spy.betAmount).toLocaleString()}` : '$0'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Ask the table: anonymous poll */}
                {view.audiencePollFeed && (
                  <div className="p-4 rounded-gc bg-gc-info/10 border border-gc-info/35 space-y-2.5 text-gc-small">
                    <div className="font-bold text-gc-info flex items-center justify-between gap-2">
                      <span>📊 Ask the table (no names)</span>
                      <span className="text-gc-cap font-semibold px-2.5 py-0.5 rounded-full bg-gc-info/15">{view.audiencePollFeed.summaryText}</span>
                    </div>
                    {view.audiencePollFeed.breakdown.length > 0 && (
                      <div className="grid grid-cols-2 gap-2">
                        {view.audiencePollFeed.breakdown.map((item, idx) => (
                          <div key={idx} className="p-2.5 rounded-gc-sm bg-gc-card/70 border border-gc-line/[0.12] flex flex-col gap-1.5">
                            <div className="flex items-center justify-between gap-1 font-semibold">
                              <span className="truncate">{item.label}</span>
                              <span className="tabular-nums text-gc-info shrink-0">{item.percent}%</span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-gc-line/[0.1] overflow-hidden">
                              <div className="h-full bg-gc-info rounded-full transition-all duration-300" style={{ width: `${Math.min(100, Math.max(0, item.percent))}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Answer, wager, hint */}
                {!view.isFrozen && view.me.money > 0 && view.sentence && (() => {
                  const highlightAnswerMissing =
                    lockWarning?.missingField === 'answer' || lockWarning?.missingField === 'both';
                  const highlightWagerMissing =
                    lockWarning?.missingField === 'wager' || lockWarning?.missingField === 'both';

                  return (
                    <div className="space-y-5">
                      {lockWarning && (
                        <div
                          role="alert"
                          className="px-4 py-3 rounded-gc bg-gc-loss/10 border border-gc-loss/50 text-gc-ink text-gc-small font-semibold flex items-center justify-between gap-3 animate-gc-slide-up"
                        >
                          <div className="flex items-center gap-2.5 text-left">
                            <AlertTriangle className="w-5 h-5 shrink-0 text-gc-loss" aria-hidden="true" />
                            <span>{lockWarning.message}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setLockWarning(null)}
                            className="h-11 px-4 rounded-full bg-gc-line/[0.07] border border-gc-line/[0.16] text-gc-ink text-gc-small font-bold cursor-pointer shrink-0"
                          >
                            OK
                          </button>
                        </div>
                      )}

                      {/* Your answer */}
                      <section
                        ref={answerSectionRef}
                        aria-label="Your answer"
                        className={`space-y-2.5 rounded-gc transition-all ${highlightAnswerMissing ? 'p-3 -mx-3 ring-2 ring-gc-loss/60 bg-gc-loss/[0.06]' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <h2 className={`${sectionTitle} m-0`}>
                            Your answer{hasSplitBet ? ' (split bet)' : ''}
                          </h2>
                          {highlightAnswerMissing && <span className={requiredChip}>Needed</span>}
                        </div>

                        {/* Valid or flawed */}
                        {qType === 'binary' && (
                          <div className="space-y-3">
                            {hasSplitBet ? (
                              <div className="p-4 rounded-gc bg-indigo-500/[0.07] border border-indigo-500/30 dark:border-indigo-300/30 space-y-2">
                                <div className="flex justify-between text-gc-small font-bold tabular-nums">
                                  <span className="text-gc-win">Valid {localBet.splitCorrectPercent ?? 50}%</span>
                                  <span className="text-gc-loss">Flawed {100 - (localBet.splitCorrectPercent ?? 50)}%</span>
                                </div>
                                <input
                                  type="range"
                                  min={0}
                                  max={100}
                                  step={10}
                                  aria-label="How much goes on Valid"
                                  value={localBet.splitCorrectPercent ?? 50}
                                  onChange={(e) => updateBetField('splitCorrectPercent', Number(e.target.value))}
                                  className="w-full accent-amber-500 h-11 cursor-pointer"
                                />
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 gap-3">
                                <button
                                  ref={firstOpinionBtnRef}
                                  type="button"
                                  aria-pressed={localBet.opinion === 'correct'}
                                  onClick={() => updateBetField('opinion', 'correct')}
                                  className={`h-[104px] rounded-[18px] border-2 flex flex-col items-center justify-center gap-1.5 text-xl font-extrabold cursor-pointer transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-gc-gold/50 ${
                                    localBet.opinion === 'correct'
                                      ? 'bg-gc-win/15 border-emerald-700 dark:border-emerald-400 text-gc-win animate-gc-pulse'
                                      : 'bg-gc-line/[0.07] border-gc-line/[0.14] text-gc-ink'
                                  }`}
                                >
                                  <Check className="w-7 h-7" strokeWidth={2.6} aria-hidden="true" />
                                  Valid
                                </button>
                                <button
                                  type="button"
                                  aria-pressed={localBet.opinion === 'incorrect'}
                                  onClick={() => updateBetField('opinion', 'incorrect')}
                                  className={`h-[104px] rounded-[18px] border-2 flex flex-col items-center justify-center gap-1.5 text-xl font-extrabold cursor-pointer transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-gc-gold/50 ${
                                    localBet.opinion === 'incorrect'
                                      ? 'bg-gc-loss/15 border-rose-700 dark:border-rose-400 text-gc-loss animate-gc-pulse'
                                      : 'bg-gc-line/[0.07] border-gc-line/[0.14] text-gc-ink'
                                  }`}
                                >
                                  <X className="w-7 h-7" strokeWidth={2.6} aria-hidden="true" />
                                  Flawed
                                </button>
                              </div>
                            )}

                            {(localBet.opinion === 'incorrect' ||
                              (hasSplitBet && (localBet.splitCorrectPercent ?? 50) < 100)) && (() => {
                              const hasDoubleOrNothing = view.myActivePowerUps.some((pu) => pu.type === 'DOUBLE_OR_NOTHING');
                              return (
                                <div className="animate-gc-slide-up">
                                  <div className="flex items-center justify-between gap-2 mb-1.5">
                                    <label htmlFor="gc-phone-correction" className="block text-gc-small font-bold text-gc-ink">
                                      {hasDoubleOrNothing ? (
                                        <span className="text-amber-600 dark:text-amber-400 font-extrabold">
                                          🎲 Double or Nothing: correction required for 3× win
                                        </span>
                                      ) : (
                                        'Bonus: write the corrected sentence'
                                      )}
                                    </label>
                                    {view.sentence.text && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          playSound('click');
                                          updateBetField('userCorrection', view.sentence!.text);
                                        }}
                                        className="text-gc-cap font-semibold text-gc-quiet hover:text-gc-ink underline underline-offset-4 cursor-pointer"
                                      >
                                        Copy the sentence here
                                      </button>
                                    )}
                                  </div>
                                  <input
                                    id="gc-phone-correction"
                                    type="text"
                                    {...ANSWER_INPUT_PROPS}
                                    onFocus={(e) => onTypingFocus(e.currentTarget)}
                                    onBlur={onTypingBlur}
                                    onKeyDown={(e) => onAnswerEnter(e, null)}
                                    value={localBet.userCorrection || ''}
                                    onChange={(e) => updateBetField('userCorrection', e.target.value)}
                                    onDoubleClick={() => {
                                      if (view.sentence?.text) {
                                        playSound('click');
                                        updateBetField('userCorrection', view.sentence.text);
                                      }
                                    }}
                                    onTouchEnd={() => {
                                      const now = Date.now();
                                      if (now - lastCorrectionTapRef.current <= 350) {
                                        lastCorrectionTapRef.current = 0;
                                        if (view.sentence?.text) {
                                          playSound('click');
                                          updateBetField('userCorrection', view.sentence.text);
                                        }
                                      } else {
                                        lastCorrectionTapRef.current = now;
                                      }
                                    }}
                                    placeholder={
                                      hasDoubleOrNothing
                                        ? 'Write the corrected sentence (blank/wrong loses 1.5× bet)...'
                                        : 'Optional. Double-tap to copy the sentence here.'
                                    }
                                    className={`${textField} ${
                                      hasDoubleOrNothing && !localBet.userCorrection?.trim()
                                        ? 'border-amber-500/70 bg-amber-500/[0.04]'
                                        : fieldOk
                                    } min-h-[52px] px-4 font-sentence italic text-gc-lead`}
                                  />
                                  {hasDoubleOrNothing && !localBet.userCorrection?.trim() && (
                                    <p className="mt-1.5 text-gc-cap font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-gc-sm px-2.5 py-1.5">
                                      ⚠️ Heads up: With Double or Nothing active, locking in Flawed without a valid correction results in a −1.5× loss.
                                    </p>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        )}

                        {/* Multiple choice */}
                        {qType === 'multipleChoice' && (
                          <div className="grid grid-cols-1 gap-2.5">
                            {(() => {
                              const eliminatedSet = new Set(
                                (view.scalpelHint?.eliminatedOptions || []).map((o) => o.trim().toLowerCase())
                              );
                              return (view.sentence.options || []).map((opt, idx) => {
                                const letter = ['A', 'B', 'C', 'D'][idx] || '';
                                const isEliminatedOpt = eliminatedSet.has(opt.trim().toLowerCase());
                                const splitList = localBet.splitOptions || [];
                                const isSelected = hasSplitBet ? splitList.includes(opt) : localBet.selectedOption === opt;
                                const isDoubleStacked =
                                  hasSplitBet && splitList.length === 2 && splitList[0] === opt && splitList[1] === opt;

                                return (
                                  <button
                                    key={opt}
                                    ref={idx === 0 ? firstOptionBtnRef : undefined}
                                    type="button"
                                    disabled={isEliminatedOpt}
                                    aria-pressed={isSelected}
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
                                    className={`min-h-[60px] px-4 py-2.5 rounded-gc border-2 text-left flex items-center justify-between gap-3 transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-gc-gold/50 ${
                                      isEliminatedOpt
                                        ? 'opacity-50 cursor-not-allowed bg-gc-line/[0.04] border-gc-loss/30 text-gc-quiet'
                                        : isSelected
                                          ? 'cursor-pointer bg-gc-gold/15 border-gc-gold text-gc-ink animate-gc-pulse'
                                          : 'cursor-pointer bg-gc-line/[0.07] border-gc-line/[0.14] text-gc-ink'
                                    }`}
                                  >
                                    <span className="flex items-center gap-3 min-w-0">
                                      <span
                                        className={`w-9 h-9 rounded-full grid place-items-center text-gc-body font-extrabold shrink-0 ${
                                          isSelected ? 'bg-gc-gold text-gc-on-gold' : 'bg-gc-line/[0.08] text-gc-quiet'
                                        }`}
                                      >
                                        {letter}
                                      </span>
                                      <span className={`text-gc-lead font-sentence italic font-semibold break-words min-w-0 text-left ${isEliminatedOpt ? 'line-through' : ''}`}>
                                        {opt}
                                      </span>
                                    </span>
                                    {isEliminatedOpt ? (
                                      <span className="text-gc-cap font-bold px-2.5 py-1 rounded-full bg-gc-loss/15 text-gc-loss shrink-0">✂️ Cut</span>
                                    ) : isDoubleStacked ? (
                                      <span className="text-gc-cap font-bold px-2.5 py-1 rounded-full bg-gc-gold text-gc-on-gold shrink-0">2×</span>
                                    ) : null}
                                  </button>
                                );
                              });
                            })()}
                          </div>
                        )}

                        {/* Open cloze, word formation, key word transformation */}
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
                            const hasKeyWord = cleanBase ? new RegExp(`\\b${escaped}\\b`, 'i').test(raw) : true;
                            const isValidCount = words.length >= 2 && words.length <= 6;
                            return { raw, wordCount: words.length, hasKeyWord, isValidCount };
                          })();
                          const bad = highlightAnswerMissing || isUnchangedBase;
                          const baseUpper = (view.sentence?.baseWord || '').toUpperCase();

                          return (
                            <div className="space-y-2.5">
                              {qType === 'wordFormation' && view.sentence?.baseWord && (
                                <div className="px-4 py-3 rounded-gc bg-gc-gold/10 border border-gc-gold/40 flex items-center justify-between gap-2">
                                  <span className="text-gc-small font-bold text-gc-ink flex items-center gap-1.5">
                                    <span aria-hidden="true">🧬</span>
                                    Change the form of this word
                                  </span>
                                  <span className="px-3 py-0.5 rounded-full bg-gc-gold text-gc-on-gold font-extrabold text-gc-small tracking-wider">
                                    {baseUpper}
                                  </span>
                                </div>
                              )}
                              {qType === 'keyWordTransformation' && view.sentence?.baseWord && (
                                <div className="text-gc-small text-gc-quiet">
                                  Use 2 to 6 words, including <strong className="text-gc-ink">{baseUpper}</strong> unchanged. One mark pays 1×, two marks pay 2×.
                                </div>
                              )}
                              {hasSplitBet ? (
                                <div className="grid grid-cols-1 gap-2.5">
                                  <input
                                    ref={splitWord1InputRef}
                                    type="text"
                                    {...ANSWER_INPUT_PROPS}
                                    onFocus={(e) => onTypingFocus(e.currentTarget)}
                                    onBlur={onTypingBlur}
                                    onKeyDown={(e) => onAnswerEnter(e, splitWord2InputRef.current)}
                                    aria-label="First answer"
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
                                      qType === 'keyWordTransformation' && baseUpper
                                        ? `First answer, with ${baseUpper} (half)`
                                        : qType === 'wordFormation' && baseUpper
                                          ? `A new form of ${baseUpper} (half)`
                                          : 'First word (half)'
                                    }
                                    className={`${textField} ${bad ? fieldBad : fieldOk} min-h-[52px] px-4 font-sentence italic font-semibold text-gc-lead`}
                                  />
                                  <input
                                    ref={splitWord2InputRef}
                                    type="text"
                                    {...ANSWER_INPUT_PROPS}
                                    onFocus={(e) => onTypingFocus(e.currentTarget)}
                                    onBlur={onTypingBlur}
                                    onKeyDown={(e) => onAnswerEnter(e, null)}
                                    aria-label="Second answer"
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
                                    placeholder="Second answer (optional, half)"
                                    className={`${textField} ${bad ? fieldBad : fieldOk} min-h-[52px] px-4 font-sentence italic font-semibold text-gc-lead`}
                                  />
                                </div>
                              ) : (
                                <input
                                  ref={clozeWordInputRef}
                                  type="text"
                                  {...ANSWER_INPUT_PROPS}
                                  onFocus={(e) => onTypingFocus(e.currentTarget)}
                                  onBlur={onTypingBlur}
                                  onKeyDown={(e) => onAnswerEnter(e, null)}
                                  aria-label="Your answer"
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
                                    qType === 'keyWordTransformation' && baseUpper
                                      ? `2 to 6 words, including ${baseUpper}`
                                      : qType === 'wordFormation' && baseUpper
                                        ? `A new form of ${baseUpper}`
                                        : 'The missing word'
                                  }
                                  className={`${textField} ${bad ? fieldBad : fieldOk} h-14 px-4 font-sentence italic font-semibold text-gc-title`}
                                />
                              )}
                              {qType === 'keyWordTransformation' && !hasSplitBet && kwtCheck.raw && (
                                <div className="flex flex-wrap items-center justify-between gap-2 text-gc-cap">
                                  <span className={`px-2.5 py-1 rounded-full font-bold ${kwtCheck.hasKeyWord ? 'bg-gc-win/15 text-gc-win' : 'bg-gc-loss/15 text-gc-loss'}`}>
                                    {kwtCheck.hasKeyWord ? `✓ Key word ${baseUpper || 'KEY'} is in` : `Use ${baseUpper || 'KEY'} without changing it`}
                                  </span>
                                  <span className={`px-2.5 py-1 rounded-full tabular-nums font-bold ${kwtCheck.isValidCount ? 'bg-gc-win/15 text-gc-win' : 'bg-gc-gold/15 text-gc-money'}`}>
                                    {kwtCheck.wordCount} of 2 to 6 words
                                  </span>
                                </div>
                              )}
                              {isUnchangedBase && (
                                <div className="px-4 py-3 rounded-gc bg-gc-loss/10 border border-gc-loss/50 text-gc-ink text-gc-small font-semibold flex items-center gap-2.5">
                                  <AlertTriangle className="w-5 h-5 shrink-0 text-gc-loss" aria-hidden="true" />
                                  <span>
                                    That's the base word as it is (<strong>{baseUpper}</strong>). Change its form, for example with a prefix or suffix.
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        {isTyping === 'answer' && inlineLockButton}
                      </section>

                      {/* Your bet */}
                      <section
                        ref={wagerSectionRef}
                        aria-label="Your bet"
                        className={`space-y-2.5 rounded-gc transition-all ${highlightWagerMissing ? 'p-3 -mx-3 ring-2 ring-gc-loss/60 bg-gc-loss/[0.06]' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <h2 className={`${sectionTitle} m-0`}>Your bet</h2>
                          {highlightWagerMissing ? (
                            <span className={requiredChip}>Needed</span>
                          ) : (
                            <span className="text-gc-cap font-semibold text-gc-quiet tabular-nums">
                              {view.isHighRoller ? `At least $${view.minBetAmount.toLocaleString()} · ` : ''}Up to {money(maxAllowedBet)}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-2.5">
                          <div className="relative flex-1 min-w-0">
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 text-[38px] font-extrabold text-gc-money pointer-events-none" aria-hidden="true">$</span>
                            <input
                              ref={wagerInputRef}
                              type="text"
                              inputMode="numeric"
                              enterKeyHint="done"
                              autoComplete="off"
                              onFocus={(e) => onTypingFocus(e.currentTarget, 'wager')}
                              onBlur={onTypingBlur}
                              onKeyDown={(e) => {
                                if (e.key !== 'Enter') return;
                                e.preventDefault();
                                handleToggleLockIn();
                              }}
                              pattern="[0-9]*"
                              aria-label="Your bet in dollars"
                              value={localBet.bet ?? ''}
                              onChange={(e) => updateBetField('bet', e.target.value)}
                              placeholder={view.isHighRoller ? String(view.minBetAmount) : '0'}
                              className={`w-full h-14 pl-7 pr-1 bg-transparent border-0 border-b-2 rounded-none text-[38px] font-extrabold text-gc-money tabular-nums placeholder:text-gc-money/40 focus:outline-none ${
                                highlightWagerMissing ? 'border-gc-loss' : 'border-gc-line/[0.16] focus:border-gc-gold'
                              }`}
                            />
                          </div>
                          <div className="flex gap-2 shrink-0">
                            {view.isHighRoller && (
                              <button
                                type="button"
                                onClick={() => updateBetField('bet', Math.min(maxAllowedBet, view.minBetAmount))}
                                className="h-11 px-3.5 rounded-full border border-gc-line/[0.16] text-gc-small font-bold text-gc-ink cursor-pointer"
                              >
                                Least
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => updateBetField('bet', maxAllowedBet)}
                              className="h-11 px-3.5 rounded-full border border-gc-line/[0.16] text-gc-small font-bold text-gc-ink cursor-pointer"
                            >
                              All in
                            </button>
                            <button
                              type="button"
                              onClick={() => updateBetField('bet', '')}
                              className="h-11 px-3.5 rounded-full border border-gc-line/[0.16] text-gc-small font-bold text-gc-ink cursor-pointer"
                            >
                              Clear
                            </button>
                          </div>
                        </div>

                        {/* Chips add to the bet */}
                        <div className="grid grid-cols-4 gap-2.5 pt-1">
                          {[
                            { v: 10, cls: 'bg-[#2563eb]' },
                            { v: 25, cls: 'bg-[#15803d]' },
                            { v: 50, cls: 'bg-[#be123c]' },
                            { v: 100, cls: 'bg-[#1f2937] dark:bg-[#111827]' },
                          ].map((chip) => (
                            <button
                              key={chip.v}
                              type="button"
                              aria-label={`Add $${chip.v}`}
                              onClick={() => {
                                playSound('bet');
                                updateBetField('bet', Math.min(maxAllowedBet, betAmountNum + chip.v));
                              }}
                              className={`h-[52px] rounded-full text-white text-[15px] font-extrabold shadow-[0_6px_12px_-6px_rgba(0,0,0,0.6),inset_0_-3px_0_rgba(0,0,0,0.25)] active:scale-95 transition-transform cursor-pointer ${chip.cls}`}
                            >
                              +${chip.v}
                            </button>
                          ))}
                        </div>
                        {isTyping === 'wager' && inlineLockButton}
                      </section>

                      {/* Help: a hint and a power-up */}
                      <section aria-label="Help" className="space-y-2.5">
                        <button
                          type="button"
                          disabled={Boolean(view.myHint?.text || view.myHint?.isLoading) || view.me.money < HINT_COST}
                          onClick={() => {
                            playSound('hint');
                            sendIntent({ type: 'BUY_HINT' });
                          }}
                          className="w-full h-[52px] px-3.5 rounded-[14px] border border-gc-line/[0.12] bg-gc-line/[0.07] text-gc-ink text-[15px] font-bold flex items-center gap-2.5 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Lightbulb className="w-[18px] h-[18px] text-gc-quiet" aria-hidden="true" />
                          {view.myHint?.text ? 'Hint bought' : 'Get a hint'}
                          <span className="ml-auto text-gc-money tabular-nums">${HINT_COST}</span>
                        </button>
                        {view.myHint && (
                          <div className="px-4 py-3 rounded-[14px] bg-gc-info/10 text-gc-info text-[15px] font-semibold animate-gc-slide-up" role="status">
                            {view.myHint.isLoading ? 'Finding a hint…' : view.myHint.text}
                          </div>
                        )}
                        <button
                          type="button"
                          disabled={!view.canBuyPowerUp}
                          onClick={() => {
                            playSound('powerUp');
                            sendIntent({ type: 'BUY_RANDOM_POWER_UP' });
                          }}
                          className="w-full h-[52px] px-3.5 rounded-[14px] border border-gc-line/[0.12] bg-gc-line/[0.07] text-gc-ink text-[15px] font-bold flex items-center gap-2.5 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Sparkles className="w-[18px] h-[18px] text-purple-600 dark:text-purple-300" aria-hidden="true" />
                          Draw a power-up
                          <span className="ml-auto text-gc-money tabular-nums">${POWERUP_COST}</span>
                        </button>
                      </section>
                    </div>
                  );
                })()}
              </>
            )}
          </>
        )}

        {/* ================================================================
            RESULTS
           ================================================================ */}
        {view.step === 'RESULTS' && (() => {
          const change = view.myRoundResult?.amountChanged ?? 0;
          const won = change > 0;
          const lost = change < 0;
          const s = view.sentence;
          const correctionSegments =
            s && !isClozeRound && !s.isCorrect && s.correction ? diffWords(s.text, s.correction).corrected : null;
          return (
            <div className="space-y-4 animate-gc-fade">
              {/* Gold coins rain down on a win (reduced motion and calm mode skip it via index.css). */}
              {won && (
                <div className="gc-confetti pointer-events-none fixed inset-0 z-40 overflow-hidden [perspective:600px]" aria-hidden="true">
                  {Array.from({ length: 18 }, (_, i) => (
                    <span
                      key={i}
                      className="absolute -top-8 block rounded-full animate-gc-coin-fall"
                      style={{
                        left: `${(i * 41 + 7) % 96}%`,
                        width: i % 3 === 0 ? 30 : 24,
                        height: i % 3 === 0 ? 30 : 24,
                        background: 'radial-gradient(circle at 35% 30%, #fff6d5 0%, #f5c542 38%, #c8901e 72%, #8a5a10 100%)',
                        boxShadow: 'inset 0 0 0 3px rgb(255 236 170 / 0.55), 0 2px 6px rgb(0 0 0 / 0.25)',
                        animationDelay: `${(i % 6) * 0.12 + (i % 4) * 0.05}s`,
                        animationDuration: `${1.8 + ((i * 7) % 8) / 10}s`,
                        ['--gc-drift' as string]: `${((i * 37) % 80) - 40}px`,
                      } as React.CSSProperties}
                    />
                  ))}
                </div>
              )}
              {view.myRoundResult && (
                <div
                  className={`-mx-4 -mt-4 px-4 pt-8 pb-2 text-center ${
                    won
                      ? 'bg-gradient-to-b from-emerald-400/25 to-transparent'
                      : lost
                        ? 'bg-gradient-to-b from-rose-400/25 to-transparent'
                        : ''
                  }`}
                >
                  <p className={`m-0 text-lg font-bold ${won ? 'text-gc-money animate-gc-glow' : 'text-gc-quiet'}`}>
                    {won ? 'You called it!' : lost ? 'Not this time' : 'No change this hand'}
                  </p>
                  <p
                    role="status"
                    className={`m-0 mt-1 text-[64px] leading-none font-extrabold tabular-nums ${
                      won ? 'text-gc-win animate-gc-pop' : lost ? 'text-gc-loss animate-gc-shake' : 'text-gc-ink animate-gc-pop'
                    }`}
                  >
                    {won ? '+' : ''}
                    {money(change)}
                  </p>
                  <p className="m-0 mt-3 text-[17px] text-gc-quiet">
                    Balance <b className="text-gc-money tabular-nums">{money(view.me.money)}</b>
                  </p>
                  <div className="mt-2 flex flex-wrap justify-center gap-1.5 text-gc-cap font-semibold">
                    {view.myRoundResult.outcomeText && !/^(win|lose)$/i.test(view.myRoundResult.outcomeText.trim()) && (
                      <span className="px-2.5 py-1 rounded-full bg-gc-line/[0.07] text-gc-quiet">{view.myRoundResult.outcomeText}</span>
                    )}
                    {qType === 'keyWordTransformation' && view.myRoundResult.marksAwarded !== undefined && (
                      <span className="px-2.5 py-1 rounded-full bg-gc-gold/15 text-gc-money">
                        {view.myRoundResult.marksAwarded} of 2 marks
                      </span>
                    )}
                  </div>
                  {view.myRoundResult.correctionFeedback && (
                    <p className="m-0 mt-2 text-gc-small text-gc-quiet">{view.myRoundResult.correctionFeedback}</p>
                  )}
                </div>
              )}

              {/* The ruling */}
              {s && (
                <div className="gc-surface rounded-[20px] px-[18px] py-4 animate-gc-slide-up [animation-delay:0.4s] space-y-2">
                  <h2 className="m-0 text-gc-small font-bold text-gc-quiet">
                    {isClozeRound ? 'The answer' : s.isCorrect ? 'It was valid, exactly as written:' : 'It was flawed. The correction:'}
                  </h2>
                  {isClozeRound ? (
                    <p className="m-0 font-sentence italic text-xl leading-snug">
                      <mark className="bg-gc-win/20 text-gc-win rounded-md px-1.5">{s.correctAnswer}</mark>
                    </p>
                  ) : (
                    <p className="m-0 font-sentence italic text-xl leading-[1.35]">
                      &ldquo;
                      {correctionSegments
                        ? correctionSegments.map((seg, i) =>
                            seg.mark ? (
                              <mark key={i} className="bg-gc-win/20 text-gc-win rounded-md px-1">{seg.text}</mark>
                            ) : (
                              <React.Fragment key={i}>{seg.text}</React.Fragment>
                            )
                          )
                        : s.isCorrect
                          ? s.text
                          : s.correction || s.text}
                      &rdquo;
                    </p>
                  )}
                  {s.explanation && (
                    <p className="m-0 pt-2 border-t border-gc-line/[0.1] text-[15px] leading-relaxed text-gc-ink">
                      <span className="font-bold">Why: </span>
                      {s.explanation}
                    </p>
                  )}
                </div>
              )}

              {/* Standings */}
              <div className="gc-surface rounded-[20px] px-[18px] py-4 animate-gc-slide-up [animation-delay:0.6s]">
                <h2 className="m-0 mb-1 text-gc-small font-bold text-gc-quiet">Standings</h2>
                <ol className="m-0 p-0 list-none divide-y divide-gc-line/[0.1]">
                  {[...view.peers]
                    .sort((a, b) => b.money - a.money)
                    .map((p, idx) => (
                      <li key={p.id} className={`py-2.5 flex items-center justify-between gap-3 ${p.id === view.me.id ? 'font-extrabold' : 'font-semibold'}`}>
                        <span className="flex items-center gap-2.5 min-w-0">
                          <span className="w-6 text-gc-cap text-gc-quiet tabular-nums">{idx + 1}</span>
                          <PlayerAvatar value={p.avatar} size="xs" />
                          <span className="truncate">{p.name}{p.id === view.me.id ? ' (you)' : ''}</span>
                        </span>
                        <span className="tabular-nums text-gc-money">{money(p.money)}</span>
                      </li>
                    ))}
                </ol>
              </div>

              <p className="text-center text-gc-small text-gc-quiet pt-1 text-balance">The next hand appears here when the teacher deals it.</p>
            </div>
          );
        })()}

        {/* ================================================================
            GAME OVER
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

            setTimeout(async () => {
              try {
                // The PDF library is large, so a phone downloads it only when asked for a report card.
                const { generateGrammarReportPDF } = await import('../utils/pdfGenerator');
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
                setPdfStatusToast('Your report card is downloaded.');
                setTimeout(() => setPdfStatusToast(null), 4000);
              } catch (err) {
                console.error('Failed to generate PDF on student device:', err);
                setPdfStatusToast('The report card could not be made. Please try again.');
                setTimeout(() => setPdfStatusToast(null), 4000);
              } finally {
                setIsGeneratingPdf(false);
              }
            }, 100);
          };

          const statTile = 'rounded-gc bg-gc-line/[0.06] border border-gc-line/[0.1] px-2 py-3';
          return (
            <div className="space-y-4 animate-gc-slide-up pb-6">
              <div className="text-center pt-3">
                <div className="text-gc-small font-bold text-gc-quiet">Final results</div>
                <h1 className="m-0 mt-1 font-logo font-bold text-[32px] tracking-[0.06em] text-gc-gold">Table closed</h1>
              </div>

              {view.winner ? (
                <div className="gc-surface rounded-[20px] p-6 text-center space-y-3">
                  <div className="text-4xl" aria-hidden="true">👑</div>
                  <div className="w-20 h-20 mx-auto rounded-full border-[3px] border-gc-gold p-1 bg-gc-line/[0.08] grid place-items-center">
                    <PlayerAvatar value={view.winner.avatar} size="xl" className="w-full h-full" animated />
                  </div>
                  <div>
                    <div className="text-gc-small font-bold text-gc-money">{isMeChampion ? 'You won the game!' : 'The winner'}</div>
                    <h2 className="m-0 mt-0.5 text-[28px] font-extrabold">{view.winner.name}</h2>
                  </div>
                  <div className="text-gc-title font-extrabold text-gc-money tabular-nums">{money(view.winner.money)}</div>
                </div>
              ) : (
                <div className="gc-surface rounded-[20px] p-6 text-center space-y-1.5">
                  <div className="text-4xl" aria-hidden="true">🏛️</div>
                  <h2 className="m-0 text-gc-title font-extrabold">The house wins</h2>
                  <p className="m-0 text-gc-small text-gc-quiet">Nobody reached the goal this time.</p>
                </div>
              )}

              <div className="gc-surface rounded-[20px] px-[18px] py-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="m-0 text-gc-small font-bold text-gc-quiet">Your game</h2>
                  <span className="text-gc-small font-bold tabular-nums">Rank {myRank} of {sortedPeers.length}</span>
                </div>
                <div className="grid grid-cols-3 gap-2.5 text-center">
                  <div className={statTile}>
                    <div className="text-gc-cap font-semibold text-gc-quiet">Balance</div>
                    <div className="text-gc-lead font-extrabold text-gc-money tabular-nums">{money(view.me.money)}</div>
                  </div>
                  <div className={statTile}>
                    <div className="text-gc-cap font-semibold text-gc-quiet">Hands won</div>
                    <div className="text-gc-lead font-extrabold tabular-nums">{myWins} of {myTotalHands}</div>
                  </div>
                  <div className={statTile}>
                    <div className="text-gc-cap font-semibold text-gc-quiet">Accuracy</div>
                    <div className="text-gc-lead font-extrabold tabular-nums">{myAccuracy}%</div>
                  </div>
                </div>
              </div>

              {history.length > 0 && (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleDownloadPdf}
                    disabled={isGeneratingPdf}
                    className="gc-btn-primary w-full h-[58px] rounded-full text-[17px] font-extrabold flex items-center justify-center gap-2.5 cursor-pointer disabled:cursor-wait"
                  >
                    <Download className="w-5 h-5" aria-hidden="true" />
                    {isGeneratingPdf ? 'Making your report card…' : 'Download my report card (PDF)'}
                  </button>
                  {pdfStatusToast && (
                    <div role="status" className="text-center text-gc-small font-semibold text-gc-quiet animate-gc-fade">
                      {pdfStatusToast}
                    </div>
                  )}
                </div>
              )}

              <div className="gc-surface rounded-[20px] px-[18px] py-4">
                <h2 className="m-0 mb-1 text-gc-small font-bold text-gc-quiet">Final standings</h2>
                <ol className="m-0 p-0 list-none divide-y divide-gc-line/[0.1]">
                  {sortedPeers.map((p, idx) => (
                    <li key={p.id} className={`py-2.5 flex items-center justify-between gap-3 ${p.id === view.me.id ? 'font-extrabold' : 'font-semibold'}`}>
                      <span className="flex items-center gap-2.5 min-w-0">
                        <span className="w-6 text-center text-gc-cap tabular-nums">
                          {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                        </span>
                        <PlayerAvatar value={p.avatar} size="xs" />
                        <span className="truncate">{p.name}{p.id === view.me.id ? ' (you)' : ''}</span>
                      </span>
                      <span className="tabular-nums text-gc-money">{money(p.money)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          );
        })()}
      </main>

      {/* Lock-in button, pinned to the bottom while betting */}
      {view.step === 'IN_GAME' && !view.isFrozen && view.me.money > 0 && !isPlayerLocked && view.sentence && !isTyping && (
        <div className="fixed bottom-0 inset-x-0 z-30 px-4 pt-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-gc-bg via-gc-bg/90 to-transparent">
          <div className="max-w-xl mx-auto">
            <button
              type="button"
              onClick={handleToggleLockIn}
              className={`w-full min-h-[58px] py-3 px-5 rounded-full text-lg font-extrabold flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] transition-all ${
                isReadyToLock ? 'gc-btn-primary' : 'bg-gc-card/95 border border-gc-line/[0.16] text-gc-quiet shadow-gc-1'
              }`}
            >
              {isReadyToLock && <Lock className="w-5 h-5 shrink-0" aria-hidden="true" />}
              <span className="break-words min-w-0">{lockLabel}</span>
            </button>
          </div>
        </div>
      )}

      {/* Choosing a target for an attack power-up */}
      {view.pendingTarget && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="gc-panel rounded-gc-lg max-w-md w-full p-5 space-y-4 animate-gc-slide-up" role="dialog" aria-modal="true" aria-labelledby="gc-target-title">
            <div className="text-center space-y-1">
              <div className="text-4xl" aria-hidden="true">{POWER_UPS[view.pendingTarget.powerUp]?.icon}</div>
              <h3 id="gc-target-title" className="m-0 text-gc-title font-extrabold">
                {POWER_UPS[view.pendingTarget.powerUp]?.name}: choose a player
              </h3>
              <p className="m-0 text-gc-small text-gc-quiet">{POWER_UPS[view.pendingTarget.powerUp]?.description}</p>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
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
                    className={`w-full min-h-[56px] px-4 py-2.5 rounded-gc border flex items-center justify-between transition-colors ${
                      blocked
                        ? 'opacity-50 cursor-not-allowed bg-gc-line/[0.04] border-gc-line/[0.1]'
                        : 'bg-gc-line/[0.07] border-gc-line/[0.14] hover:border-gc-gold cursor-pointer'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <PlayerAvatar value={t.avatar} size="sm" />
                      <span className="text-left">
                        <span className="block text-gc-body font-bold text-gc-ink">{t.name}</span>
                        {blocked && <span className="block text-gc-cap font-semibold text-gc-quiet">🛡️ Protected this hand</span>}
                      </span>
                    </span>
                    <span className="tabular-nums font-bold text-gc-money">{money(t.money)}</span>
                  </button>
                );
              })}
            </div>

            {(view.pendingTarget.powerUp !== 'SWAP' ||
              view.pendingTarget.eligibleTargets.every((t) => t.isShielded || t.targetedThisRound)) && (
              <button
                type="button"
                onClick={() =>
                  sendIntent({
                    type: 'CANCEL_POWER_UP_TARGET',
                    powerUp: view.pendingTarget!.powerUp,
                  })
                }
                className="w-full h-12 rounded-full bg-gc-line/[0.07] border border-gc-line/[0.16] text-gc-small font-bold text-gc-ink cursor-pointer"
              >
                Cancel and get ${POWERUP_COST} back
              </button>
            )}
          </div>
        </div>
      )}

      {/* Wheel of Fortune on the student's phone */}
      {view.pendingWheelSpin && (
        <WheelModal
          player={view.me}
          forcedItemId={view.pendingWheelItemId}
          onClose={() => {}}
          onApplyResult={(item: WheelItem) => {
            sendIntent({ type: 'APPLY_WHEEL_RESULT', itemId: item.id });
          }}
          playSound={playSound}
        />
      )}

      {/* Power-up news for this player */}
      {activeToast && (
        <Modal
          title={activeToast.title}
          onClose={() => setActiveToast(null)}
          playSound={playSound}
          hideCloseButton
        >
          <div className="text-center py-4">
            <div className="text-7xl mb-5 flex justify-center" aria-hidden="true">
              <span>{activeToast.icon || '✨'}</span>
            </div>
            <p className="text-lg sm:text-xl text-gc-ink font-medium leading-relaxed whitespace-pre-line">
              {activeToast.message}
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default StudentControllerView;
