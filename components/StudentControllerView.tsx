import { safeLocalStorage } from '../utils/safeStorage';
import { PhoneJoin } from './phone/PhoneJoin';
import { PhoneTopBar } from './phone/PhoneTopBar';
import { PhoneComfort } from './phone/PhoneComfort';
import { PhoneSentence } from './phone/PhoneSentence';
import { PhoneAnswer } from './phone/PhoneAnswer';
import { PhoneResults } from './phone/PhoneResults';
import { PhoneGameOver } from './phone/PhoneGameOver';
import { plainDescriptionOf } from '../game/powerUpCatalog';
import { settlePendingBet, type PendingBet } from '../game/presence';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { keepFieldInView } from '../utils/answerInputProps';
import { POWERUP_COST, POWER_UPS } from '../constants';
import { getRandomCharacterAvatar } from '../utils/characterAvatars';
import { PlayerAvatar, CharacterPickerPanel } from './PlayerAvatar';
import { Bet, PowerUpKey, QuestionType, SoundEffect, WheelItem } from '../types';
import { PlayerViewPayload, StudentIntent, isBetCompleteForQuestionType, isValidKeyWordTransformationPhrase } from '../utils/multiplayerProtocol';
import { StudentRoomController } from '../services/multiplayerService';
import WheelModal from './WheelModal';
import { StudentRoundTimerBar, useTurnCountdown } from './TurnTimer';
import { haptic, hapticsEnabled } from '../utils/haptics';
import { t } from '../strings/en';
import PowerUpSheet, { type PowerUpSheetInfo } from './PowerUpSheet';
import { addClockSample, clockOffset, toLocalTimer } from '../utils/clockSync';
import { Check, Lock, LockOpen, Snowflake, X } from 'lucide-react';
import { SFX_MUTED_STORAGE_KEY } from '../utils/soundEngine';
import { applyStudentPrefs, readStudentPrefs, saveStudentPrefs, type StudentPrefs } from '../utils/studentPrefs';
import { useFocusTrap } from '../utils/useFocusTrap';
import { isGapType, isOptionType, isTypedAnswerType, isWordAnswerType, questionTypeLabel } from '../game/questionTypes';

/** Package S5: how long a toast stays, and how many stack at once. */
const TOAST_MS = 7000;
const TOAST_LIMIT = 3;
/** The power-up a toast is about, found by its name in the title. */
const powerUpInTitle = (title: string): PowerUpKey | undefined =>
  (Object.keys(POWER_UPS) as PowerUpKey[]).find(k => title.toLowerCase().includes(POWER_UPS[k].name.toLowerCase()));

/** Package S4: the short build before the phone shows the ruling. */
const REVEAL_BUILD_MS = 1200;

const STUDENT_SESSION_STORAGE_KEY = 'grammar_casino_student_session_v1';
/** Package R2: a phone tells the teacher it is still there this often, while on screen. */
const HEARTBEAT_EVERY_MS = 20_000;
/** A lock-in the teacher has not confirmed yet is sent again after this long. */
const LOCK_RETRY_MS = 3_000;
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
  playSound: playSoundProp,
  isDarkMode,
  onToggleTheme,
}) => {
  // Package S6: comfort settings on this phone (sound, vibration, text size, font, motion, theme).
  const [soundOn, setSoundOn] = useState(() => safeLocalStorage.getItem(SFX_MUTED_STORAGE_KEY) !== 'true');
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;
  const playSound = useCallback((sound: SoundEffect, ...args: any[]) => {
    if (soundOnRef.current) playSoundProp(sound, ...args);
  }, [playSoundProp]);
  const [comfort, setComfort] = useState<StudentPrefs>(() => readStudentPrefs());
  const [showComfort, setShowComfort] = useState(false);
  useEffect(() => {
    applyStudentPrefs(comfort);
    saveStudentPrefs(comfort);
  }, [comfort]);
  useEffect(() => () => applyStudentPrefs({ textSize: 'normal', plainFont: false, lessMotion: false }), []);
  const [roomCodeInput, setRoomCodeInput] = useState(() => initialRoomCode.toUpperCase());
  const [playerNameInput, setPlayerNameInput] = useState('');
  // Package S9: a QR scan or join link already holds the code, so the form asks only for a name.
  const [codeFromLink, setCodeFromLink] = useState(() => /^[A-Z0-9]{4}$/i.test(initialRoomCode));
  const [welcomeName, setWelcomeName] = useState<string | null>(null);
  const [selectedAvatar, setSelectedAvatar] = useState(() => getRandomCharacterAvatar());
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinWaitingMessage, setJoinWaitingMessage] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const [view, setView] = useState<PlayerViewPayload | null>(null);
  // Package S8: the keyboard stays in the target window while it is open.
  const targetDialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(targetDialogRef, Boolean(view?.pendingTarget));
  const [localBet, setLocalBet] = useState<Bet>({});
  const localBetRef = useRef<Bet>({});
  localBetRef.current = localBet;
  // Package S5: power-up news arrives as toasts that stack and fade, never blocking a bet.
  const [toasts, setToasts] = useState<{ id: string; title: string; message: string; icon?: string }[]>([]);
  const dismissToast = useCallback((id: string) => setToasts(prev => prev.filter(t => t.id !== id)), []);
  const [sheet, setSheet] = useState<PowerUpSheetInfo | null>(null);
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
  const clockSamplesRef = useRef<number[]>([]);
  // Package R2: is this phone online, and when did it last ask to lock in (until the host confirms).
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  const [lockSentAt, setLockSentAt] = useState<number | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const lastSentenceTextRef = useRef<string>('');
  const lastStepRef = useRef<string>('');
  const [revealBuilding, setRevealBuilding] = useState(false);

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
      if (saved.name) {
        setPlayerNameInput(saved.name);
        setWelcomeName(saved.name);
      }
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
      // Package R3: learn how far the teacher's clock is from this phone's.
      if (typeof nextView.serverNow === 'number') {
        clockSamplesRef.current = addClockSample(clockSamplesRef.current, nextView.serverNow, Date.now());
        setClockOffsetMs(clockOffset(clockSamplesRef.current));
      }

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

      // Package S4: the phone's own reveal. A short build, then the ruling with sound and a
      // vibration. Calm mode and reduced motion skip the build.
      if (lastStepRef.current !== nextView.step) {
        if (nextView.step === 'RESULTS') {
          const delta = nextView.myRoundResult?.amountChanged ?? 0;
          const land = () => {
            setRevealBuilding(false);
            if (delta > 0) { playSound('roundWin'); haptic('win'); }
            else if (delta < 0) { playSound(nextView.me && nextView.me.money <= 0 ? 'bankrupt' : 'roundLose'); haptic('lose'); }
          };
          const calm =
            Boolean(nextView.calmMode) ||
            (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
          if (calm || !nextView.myRoundResult) land();
          else {
            setRevealBuilding(true);
            window.setTimeout(land, REVEAL_BUILD_MS);
          }
        } else {
          setRevealBuilding(false);
        }
        lastStepRef.current = nextView.step;
      }

      if (
        nextView.lastNotification &&
        nextView.lastNotification.id !== seenNotificationIdRef.current
      ) {
        seenNotificationIdRef.current = nextView.lastNotification.id;
        const note = nextView.lastNotification;
        setToasts(prev => [...prev, { id: note.id, title: note.title, message: note.message, icon: note.icon }].slice(-TOAST_LIMIT));
        window.setTimeout(() => setToasts(prev => prev.filter(t => t.id !== note.id)), TOAST_MS);
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

  // Package L5: "Got it" / "Still confused" after the reveal, remembered for the hand.
  const [showPractice, setShowPractice] = useState(false);
  const [myReaction, setMyReaction] = useState<{ round: number; value: 'gotIt' | 'confused' } | null>(null);
  const sendReaction = useCallback((round: number, value: 'gotIt' | 'confused') => {
    setMyReaction({ round, value });
    sendIntent({ type: 'FEEDBACK_REACTION', round, value });
  }, [sendIntent]);

  // --- Package R2: presence, waking up, and lock-ins the teacher confirmed ---
  const hasSeat = Boolean(view);
  useEffect(() => {
    if (!hasSeat) return;
    const beat = () => {
      if (document.visibilityState === 'visible') sendIntent({ type: 'HEARTBEAT' });
    };
    const id = window.setInterval(beat, HEARTBEAT_EVERY_MS);
    return () => window.clearInterval(id);
  }, [hasSeat, sendIntent]);

  useEffect(() => {
    if (!hasSeat) return;
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } };
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const keepAwake = () => {
      if (!nav.wakeLock || document.visibilityState !== 'visible') return;
      nav.wakeLock.request('screen').then(l => {
        if (cancelled) void l.release().catch(() => {});
        else lock = l;
      }).catch(() => {});
    };
    // Back in the foreground: stay awake again, and tell the teacher at once.
    const onReturn = () => {
      setIsOnline(navigator.onLine !== false);
      if (document.visibilityState !== 'visible') return;
      keepAwake();
      sendIntent({ type: 'HEARTBEAT' });
    };
    const onOffline = () => setIsOnline(false);
    keepAwake();
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('online', onReturn);
    window.addEventListener('pageshow', onReturn);
    window.addEventListener('offline', onOffline);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('online', onReturn);
      window.removeEventListener('pageshow', onReturn);
      window.removeEventListener('offline', onOffline);
      if (lock) void lock.release().catch(() => {});
    };
  }, [hasSeat, sendIntent]);

  // "Locked in" shows only once the teacher's screen confirms it; until then "Sending…",
  // and the lock-in is sent again every 3 seconds.
  const confirmedLock = Boolean(view?.lockedIn);
  // Package S4: a short buzz when the teacher's screen confirms the lock-in.
  const wasLockedRef = useRef(false);
  useEffect(() => {
    if (confirmedLock && !wasLockedRef.current && view?.step === 'IN_GAME') haptic('lock');
    wasLockedRef.current = confirmedLock;
  }, [confirmedLock, view?.step]);
  useEffect(() => {
    if (lockSentAt === null) return;
    if (confirmedLock || view?.step !== 'IN_GAME') {
      setLockSentAt(null);
      return;
    }
    const id = window.setTimeout(() => {
      sendIntent({ type: 'LOCK_IN', locked: true, bet: localBetRef.current });
      setLockSentAt(Date.now());
    }, LOCK_RETRY_MS);
    return () => window.clearTimeout(id);
  }, [lockSentAt, confirmedLock, view?.step, sendIntent]);
  const isLockSending = lockSentAt !== null && !confirmedLock;
  const isOffline = !isOnline || (hasSeat && !isConnected);

  // Package R2: a bet changed while offline is sent again when the phone is back, if the hand
  // is still open; otherwise the student is told plainly that it did not reach the table.
  const pendingBetRef = useRef<PendingBet | null>(null);
  const [betLostRound, setBetLostRound] = useState<number | null>(null);
  useEffect(() => {
    if (!isOffline || !view || view.step !== 'IN_GAME') return;
    pendingBetRef.current = { round: view.round, sentence: view.sentence?.text || '', bet: localBet, resentAt: null };
  }, [isOffline, localBet, view?.round, view?.step, view?.sentence?.text]);
  useEffect(() => {
    if (!view) return;
    const { pending, action } = settlePendingBet(pendingBetRef.current, view, isOffline, Date.now());
    const bet = pendingBetRef.current?.bet;
    pendingBetRef.current = pending;
    if (action === 'resend' && bet) sendIntent({ type: 'SET_FULL_BET', bet });
    if (action === 'lost') setBetLostRound(view.round);
  }, [view, isOffline, sendIntent]);
  const betLost = betLostRound !== null && view?.round === betLostRound && view?.step !== 'IN_GAME';

  // The round deadline read on this phone's clock (package R3).
  const roundTimer = useMemo(() => toLocalTimer(view?.roundTimer, clockOffsetMs), [view?.roundTimer, clockOffsetMs]);
  const { remainingMs: roundTimerRemainingMs } = useTurnCountdown(
    roundTimer,
    view?.turnDurationMs || 0
  );
  // Package S4: a tick each second in the last 5 seconds, while this phone has not locked in.
  const secondsLeft = roundTimer?.status === 'running' ? Math.ceil(roundTimerRemainingMs / 1000) : 0;
  // Package V6: and a soft tick sound with it (not in Calm mode; the phone's own sound switch applies).
  useEffect(() => {
    if (view?.step === 'IN_GAME' && !view?.lockedIn && !view?.paused && secondsLeft >= 1 && secondsLeft <= 5) {
      haptic('tick');
      if (!view?.calmMode) playSound('tick');
    }
    // playSound changes identity with the sound settings; the tick should not repeat for that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, view?.step, view?.lockedIn]);
  const [vibrationOn, setVibrationOn] = useState(() => hapticsEnabled());

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
    if (isOptionType(qType)) {
      hasValidAnswer = hasSplitBet
        ? (localBet.splitOptions?.length || 0) >= 1
        : Boolean(localBet.selectedOption?.trim());
    } else if (qType === 'keyWordTransformation') {
      hasValidAnswer = hasSplitBet
        ? (isValidKeyWordTransformationPhrase(localBet.splitClozeAnswers?.[0], view.sentence?.baseWord) &&
            (!localBet.splitClozeAnswers?.[1]?.trim() || isValidKeyWordTransformationPhrase(localBet.splitClozeAnswers?.[1], view.sentence?.baseWord))) ||
          (!localBet.splitClozeAnswers?.[0]?.trim() && isValidKeyWordTransformationPhrase(localBet.splitClozeAnswers?.[1], view.sentence?.baseWord))
        : isValidKeyWordTransformationPhrase(localBet.clozeAnswer, view.sentence?.baseWord);
    } else if (isWordAnswerType(qType)) {
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
      haptic('error');

      let message = '';
      let missingField: 'answer' | 'wager' | 'both' = 'both';
      // Package S3: plain messages, from strings/en.ts.
      const word = `"${(view.sentence?.baseWord || '').toUpperCase()}"`;
      const split = hasSplitBet && (isOptionType(qType) || qType === 'openCloze') ? 'Split' : '';
      if (isUnchangedBaseWord) {
        missingField = 'answer';
        message = t('lock.baseWordUnchanged', { word });
      } else if (isInvalidKwtAnswer) {
        missingField = 'answer';
        message = t('lock.kwtRule', { word });
      } else if (!hasValidAnswer && !hasValidWager) {
        missingField = 'both';
        message = t(`lock.needBoth.${qType}${split}` as Parameters<typeof t>[0], { word });
      } else if (!hasValidAnswer) {
        missingField = 'answer';
        message = t(`lock.needAnswer.${qType}${split}` as Parameters<typeof t>[0], { word });
      } else {
        missingField = 'wager';
        message =
          view.isHighRoller && view.minBetAmount > 0
            ? t('lock.highRollerMin', { amount: `$${view.minBetAmount.toLocaleString()}` })
            : t('lock.needBet');
      }

      setLockWarning({ message, missingField });

      // Scroll to and focus the specific control that needs doing
      window.requestAnimationFrame(() => {
        if (!hasValidAnswer || isUnchangedBaseWord || isInvalidKwtAnswer) {
          answerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (isOptionType(qType)) {
            firstOptionBtnRef.current?.focus();
          } else if (isTypedAnswerType(qType)) {
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
    setLockSentAt(Date.now());
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
      <PhoneJoin
        onToggleTheme={onToggleTheme}
        isDarkMode={isDarkMode}
        welcomeName={welcomeName}
        codeFromLink={codeFromLink}
        joinError={joinError}
        isJoining={isJoining}
        joinWaitingMessage={joinWaitingMessage}
        roomCodeInput={roomCodeInput}
        setCodeFromLink={setCodeFromLink}
        setRoomCodeInput={setRoomCodeInput}
        fieldClass={fieldClass}
        playerNameInput={playerNameInput}
        setPlayerNameInput={setPlayerNameInput}
        handleJoinRoom={handleJoinRoom}
        onExitStudentMode={onExitStudentMode}
      />
    );
  }

  // ============================================================================
  // Derived State for Active Student Controller
  // ============================================================================
  const qType: QuestionType = view.sentence?.questionType || 'binary';
  const isClozeRound = isGapType(qType);
  const hasSplitBet = view.myActivePowerUps.some((pu) => pu.type === 'SPLIT_BET');
  const maxAllowedBet = view.isBetCapped
    ? Math.min(view.me.money, view.betCapAmount)
    : view.me.money;

  // Plain names for the answer types, as on the projector.
  const formatLabel = qType === 'binary' ? 'Valid or flawed?' : questionTypeLabel(qType);

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
    if (isOptionType(qType)) {
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
  const lockLabel = isOffline
    ? 'Offline: waiting for the connection'
    : isLockSending
    ? 'Sending…'
    : isReadyToLock
    ? `Lock in ${money(betAmountNum)} on ${pickText}`
    : !pickText
      ? qType === 'binary'
        ? 'Choose Valid or Flawed'
        : isOptionType(qType)
          ? 'Choose an answer'
          : 'Type your answer'
      : 'Now choose your bet';

  // Shown under the field being typed in while the keyboard hides the pinned lock-in bar.
  const inlineLockButton = (
    <button
      type="button"
      onClick={handleToggleLockIn}
      disabled={isOffline || isLockSending}
      className={`w-full min-h-[52px] disabled:opacity-70 disabled:cursor-not-allowed py-2.5 px-5 rounded-full text-gc-body font-extrabold flex items-center justify-center gap-2 cursor-pointer ${
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
      {/* Package R2: a clear banner while the phone is offline. */}
      {isOffline && (
        <div role="status" className="sticky top-0 z-40 w-full px-4 py-3 bg-gc-loss text-white text-gc-body font-bold text-center">
          You're offline. Reconnecting… Your bet stays on this phone.
        </div>
      )}
      {!isOffline && betLost && (
        <div role="status" data-testid="bet-lost" className="w-full px-4 py-3 bg-gc-loss/15 text-gc-loss text-gc-body font-bold text-center">
          That bet did not reach the table. It does not count this hand.
        </div>
      )}
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
      <PhoneTopBar
        setShowAvatarPicker={setShowAvatarPicker}
        showAvatarPicker={showAvatarPicker}
        view={view}
        money={money}
        setShowComfort={setShowComfort}
        showComfort={showComfort}
        handleLeaveRoom={handleLeaveRoom}
      />

      {/* Package S6: phone settings */}
      <PhoneComfort
        showComfort={showComfort}
        setShowComfort={setShowComfort}
        soundOn={soundOn}
        setSoundOn={setSoundOn}
        vibrationOn={vibrationOn}
        setVibrationOn={setVibrationOn}
        comfort={comfort}
        setComfort={setComfort}
        isDarkMode={isDarkMode}
        onToggleTheme={onToggleTheme}
      />

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
            {!showAvatarPicker && (
              <button
                type="button"
                onClick={() => setShowAvatarPicker(true)}
                className="mb-3 min-h-[44px] px-4 rounded-full text-gc-small font-bold text-gc-on-gold bg-gc-gold cursor-pointer"
              >
                Choose your character
              </button>
            )}
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
                timer={roundTimer}
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
                {view.betsSplit && (
                  <p className="mt-2 mb-0 text-gc-body font-semibold text-gc-ink" data-testid="room-split">
                    The room: {view.betsSplit}
                  </p>
                )}
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
                {/* Package G6: a special hand says so before the sentence */}
                {view.specialHand && (
                  <div
                    role="status"
                    data-testid="phone-special-hand"
                    className="rounded-[16px] px-4 py-2.5 flex items-center gap-3 bg-gc-gold/[0.12] border border-gc-gold/40"
                  >
                    <span className="text-[24px] leading-none" aria-hidden="true">{view.specialHand.icon}</span>
                    <span className="min-w-0 text-left">
                      <span className="block text-gc-body font-extrabold text-gc-gold">{view.specialHand.title}</span>
                      <span className="block text-gc-small text-gc-ink">{view.specialHand.rule}</span>
                    </span>
                  </div>
                )}
                {/* The sentence */}
                <PhoneSentence
                  view={view}
                  formatLabel={formatLabel}
                  money={money}
                  qType={qType}
                  isClozeRound={isClozeRound}
                  setSheet={setSheet}
                />

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
                              <div className="h-full bg-gc-info rounded-full transition-all duration-gc-base" style={{ width: `${Math.min(100, Math.max(0, item.percent))}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Answer, wager, hint */}
                <PhoneAnswer
                  view={view}
                  lockWarning={lockWarning}
                  setLockWarning={setLockWarning}
                  answerSectionRef={answerSectionRef}
                  sectionTitle={sectionTitle}
                  hasSplitBet={hasSplitBet}
                  requiredChip={requiredChip}
                  qType={qType}
                  localBet={localBet}
                  updateBetField={updateBetField}
                  firstOpinionBtnRef={firstOpinionBtnRef}
                  playSound={playSound}
                  onTypingFocus={onTypingFocus}
                  onTypingBlur={onTypingBlur}
                  onAnswerEnter={onAnswerEnter}
                  lastCorrectionTapRef={lastCorrectionTapRef}
                  textField={textField}
                  fieldOk={fieldOk}
                  firstOptionBtnRef={firstOptionBtnRef}
                  splitWord1InputRef={splitWord1InputRef}
                  splitWord2InputRef={splitWord2InputRef}
                  fieldBad={fieldBad}
                  clozeWordInputRef={clozeWordInputRef}
                  isTyping={isTyping}
                  inlineLockButton={inlineLockButton}
                  wagerSectionRef={wagerSectionRef}
                  money={money}
                  maxAllowedBet={maxAllowedBet}
                  wagerInputRef={wagerInputRef}
                  handleToggleLockIn={handleToggleLockIn}
                  betAmountNum={betAmountNum}
                  sendIntent={sendIntent}
                />
              </>
            )}
          </>
        )}

        {/* ================================================================
            RESULTS
           ================================================================ */}
        <PhoneResults
          view={view}
          isClozeRound={isClozeRound}
          myReaction={myReaction}
          money={money}
          revealBuilding={revealBuilding}
          qType={qType}
          sendReaction={sendReaction}
        />

        {/* ================================================================
            GAME OVER
           ================================================================ */}
        <PhoneGameOver
          view={view}
          isGeneratingPdf={isGeneratingPdf}
          playSound={playSound}
          setIsGeneratingPdf={setIsGeneratingPdf}
          setPdfStatusToast={setPdfStatusToast}
          money={money}
          setShowPractice={setShowPractice}
          showPractice={showPractice}
          pdfStatusToast={pdfStatusToast}
        />
      </main>

      {/* Lock-in button, pinned to the bottom while betting */}
      {view.step === 'IN_GAME' && !view.isFrozen && view.me.money > 0 && !isPlayerLocked && view.sentence && !isTyping && (
        <div className="fixed bottom-0 inset-x-0 z-30 px-4 pt-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-gc-bg via-gc-bg/90 to-transparent">
          <div className="max-w-xl mx-auto">
            <button
              type="button"
              onClick={handleToggleLockIn}
              disabled={isOffline || isLockSending}
              className={`w-full min-h-[58px] disabled:opacity-70 disabled:cursor-not-allowed py-3 px-5 rounded-full text-lg font-extrabold flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] transition-all ${
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
          <div ref={targetDialogRef} className="gc-panel rounded-gc-lg max-w-md w-full p-5 space-y-4 animate-gc-slide-up" role="dialog" aria-modal="true" aria-labelledby="gc-target-title">
            <div className="text-center space-y-1">
              <div className="text-4xl" aria-hidden="true">{POWER_UPS[view.pendingTarget.powerUp]?.icon}</div>
              <h3 id="gc-target-title" className="m-0 text-gc-title font-extrabold">
                {POWER_UPS[view.pendingTarget.powerUp]?.name}: choose a player
              </h3>
              <p className="m-0 text-gc-small text-gc-quiet">{plainDescriptionOf(view.pendingTarget.powerUp)}</p>
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

      {/* Power-up news for this player (package S5): toasts that stack and fade, never blocking */}
      <div className="fixed top-2 inset-x-0 z-40 px-3 flex flex-col items-center gap-2 pointer-events-none" role="status" aria-live="polite" data-testid="toasts">
        {toasts.map(toast => {
          const key = powerUpInTitle(toast.title);
          return (
            <div key={toast.id} className="pointer-events-auto w-full max-w-md gc-surface rounded-[18px] shadow-lg px-4 py-3 flex items-start gap-3 animate-gc-slide-up" data-testid="toast">
              <span className="text-[28px] leading-none" aria-hidden="true">{toast.icon || '✨'}</span>
              <div className="min-w-0 flex-1">
                <p className="m-0 text-[16px] font-extrabold text-gc-ink">{toast.title}</p>
                <p className="m-0 text-[15px] text-gc-ink whitespace-pre-line">{toast.message}</p>
                {key && (
                  <button type="button" onClick={() => { setSheet({ key }); dismissToast(toast.id); }} className="mt-1 min-h-[32px] text-[14px] font-bold text-gc-info underline underline-offset-4 cursor-pointer">
                    {t('powerUp.whatDoesItDo')}
                  </button>
                )}
              </div>
              <button type="button" onClick={() => dismissToast(toast.id)} className="w-9 h-9 shrink-0 grid place-items-center rounded-full text-gc-quiet cursor-pointer" aria-label={t('powerUp.dismiss')}>
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
      {sheet && <PowerUpSheet info={sheet} onClose={() => setSheet(null)} />}
    </div>
  );
};

export default StudentControllerView;
