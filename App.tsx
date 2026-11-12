import { safeLocalStorage } from './utils/safeStorage';
import { migrateSavedGame } from './game/persistence';
import { getRevealGate, isEveryRoomPlayerReady } from './game/revealGate';
import { useLaterTimers } from './utils/useLaterTimers';
import { safePlayerName } from './utils/nameFilter';
import { LATE_BET_GRACE_MS } from './utils/clockSync';
import { plainDescriptionOf } from './game/powerUpCatalog';
import { BOOMERANG_REFLECTED_PLACED, clearNegativeEffects, isBoomerangReflected, isProtectedFromWheelBounty, mayBuyPowerUps } from './game/powerUpRules';
import { mapWithLimit } from './utils/flushPlan';
import { awaySeatIds, presenceSummary } from './game/presence';
import { HOTKEY_HELP, findHotkeyButton, hotkeyAction } from './utils/hotkeys';
import { APP_VERSION, logEvent } from './utils/debugLog';
import { QUALITY_KEY, parseStoredQuality, resolveTier, type QualityChoice, type QualityTier } from './show/quality';
import { firestoreUsageToday, takeGameUsage } from './utils/firestoreUsage';
import { DebugLogModal } from './components/DebugLogModal';
import { OwnDeckModal } from './components/OwnDeckModal';
import { deckSummary, parseDeckText, sentenceRecordOf } from './game/teacherDeck';
import { addMisses, cancelSecondLook, grantFreeDraws, mostMissedPoint, revokeFreeDraws, scheduleSecondLook, secondLookFor, spendFreeDraw, type FreeDraws, type MissTally, type SecondLook } from './game/spacing';
import { answerSplit, reactionCounts, recordReaction, roomSplitLine, type HandReactions } from './game/answerSplit';
import { SETUP_PREFS_KEY, parseSetupPrefs, serializeSetupPrefs, type SetupPrefs } from './game/setupPrefs';
import { addFinishedGame, getResumeOffer, parseFinishedGames, readSave, stampSave, type FinishedGame } from './game/persistence';
import { base64ToBytes, pcmToAudioBuffer } from './utils/ttsAudio';
/** Package T5: reports of the last 20 finished games on this computer. */
const FINISHED_GAMES_STORAGE_KEY = 'grammar_casino_finished_games_v1';
import { tableViewOn } from './show/tableView';
import { CEREMONY_DONE, ceremonyTimes, cueForStage, drawMoment, placeShown, type CeremonyStage } from './game/ceremony';
import { buildReport, classResultLine } from './game/report';
import { checkGameEnd, pickWinnerAtGameEnd, pickWinnerWhenEndedEarly, refundHandSpending } from './game/flow';
import { canUndoReveal, listAnswersToAccept, resettleWithAcceptedAnswer, undoRevealSecondsLeft, voidHand, canAcceptOtherAnswers, type RevealSnapshot } from './game/ruling';
import { checkBet, isBetComplete } from './game/betValidity';
import { hasShieldProtection, isFrozenBySubZero } from './game/status';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { clampBetInput, getBetCap, getBetLimits, getDisplayedMinBet, getHighRoller } from './game/betLimits';
import { 
  Player, Settings, GeneratedSentence, Bet, Hint, RoundResultInfo, GameError, 
  PowerUpKey, ActivePowerUp, ShowTargetModalPayload, ShowPowerUpModalPayload,
  Step, GameMode, SoundEffect, GrammarTopic, CEFRLevel, Theme, PlayerHistory, PlayerEffect, UsedPowerUp,
  WheelItem, RoundHistoryRecord, RoundPlayerResult, PlayerTurnTimer, QuestionType, ChallengeFormat
} from './types';
import { 
  POWER_UPS, GRAMMAR_TOPICS, QUICK_LEXICAL_TOPICS, CEFR_LEVELS, CEFR_DIFFICULTY_PROFILES, THEMES, LOCAL_STORAGE_KEY, 
  INITIAL_PLAYER_MONEY, MIN_TARGET_AMOUNT, DEFAULT_TARGET_AMOUNT, HINT_COST, POWERUP_COST, TAXMAN_AMOUNT, GENEROUS_GIFT_AMOUNT, BET_CAP_AMOUNT,
  JACKPOT_MULTIPLIER, AVATARS, TOPIC_SUBTYPES, getSubtypesForTopic, WHEEL_ITEMS, TURN_TIMER_OPTIONS, TURN_TIMER_BONUS_MS,
  CHALLENGE_FORMATS, ALL_QUESTION_TYPES, DEFAULT_MIXED_FORMATS, getEffectiveMixedFormats, CLOZE_DISABLED_POWER_UPS, BINARY_DISABLED_POWER_UPS, MP_ONLY_POWER_UPS, NON_OFFENSIVE_TARGETED_POWER_UPS
} from './constants';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, Cloud as CloudIcon, Copy, Lock, LockOpen, Moon, Projector, Save, Smartphone, Sparkles, Sun, Volume2, VolumeX, Wind, Monitor, Plus, QrCode, Pencil, X, MoreHorizontal, FolderOpen, AlertTriangle, Info, RotateCcw, Eye, Pause, Play, Maximize, Minimize, Keyboard, WifiOff, Flag, Bot, CircleHelp, Clock } from 'lucide-react';
import { MotionConfig } from 'motion/react';
import ActionButton from './components/ActionButton';
import TextInput from './components/TextInput';
import Modal from './components/Modal';
import PlayerBettingCard from './components/PlayerBettingCard';
import PlayerTileGrid, { PlayerTile, SeatStatus } from './components/PlayerTileGrid';
import { PlayerAvatar, CharacterPickerPanel } from './components/PlayerAvatar';
import { getRandomCharacterAvatar } from './utils/characterAvatars';
import {
  canCancelPowerUpTarget,
  canSubmitBetWithLock,
  createReentryGuard,
  drawWheelItem,
  isKnownAvatar,
  refundHint,
  resolvePendingPowerUp,
  resolveWheelResult,
  runAlwaysClearing,
  sanitizePlayerName,
} from './game/intents';
import CountUp from './components/CountUp';
import { getTimerRemainingMs, MultiplayerRoundTimerFrame } from './components/TurnTimer';
import WheelModal from './components/WheelModal';
import SentenceText from './components/SentenceText';
import PowerUpTooltip from './components/PowerUpTooltip';
import GrammarReportCard from './components/GrammarReportCard';
import { ChipRack, PokerChip } from './components/ChipStacks';
import RoundSettingsModal, { SettingsModalTab } from './components/RoundSettingsModal';
import DeckConfigModal from './components/DeckConfigModal';
import MultiplayerLobbyModal from './components/MultiplayerLobbyModal';
import StudentControllerView from './components/StudentControllerView';
import CloudManagerModal, { CloudManagerTab } from './components/CloudManagerModal';
import BroadcastCutIn, { BroadcastCutInPayload } from './components/BroadcastCutIn';
import ThemeAmbience from './components/ThemeAmbience';
import type {
  ChipTossEvent,
  PotSweepEvent,
  JackpotEvent,
  BoomerangArcEvent,
  ShoeDealEvent,
  Seat3DState,
} from './components/Tabletop3DOverlay';
// three.js is only needed on the teacher's table, so phones never download it.
const Tabletop3DOverlay = React.lazy(() => import('./components/Tabletop3DOverlay'));
const TableBackdrop = React.lazy(() => import('./components/TableBackdrop'));
/** Package F6 (part): how long the game waits after the last change before saving it. */
const SAVE_DEBOUNCE_MS = 1000;
/** Package T2: how long "Undo" stays up after a player is removed. */
const REMOVE_UNDO_MS = 5000;
import {
  MultiplayerSeat,
  buildAllPlayerViews,
  isPlayerTargetedThisRound,
  isBetCompleteForQuestionType,
  isValidKeyWordTransformationPhrase,
  buildAudiencePollSummary,
  isPlayerUnderdog,
  SHARED_VIEW_KEYS,
} from './utils/multiplayerProtocol';
import { HostRoomController, HostEventPayload, SeatTakeoverRequest, loadSavedHostRoom } from './services/multiplayerService';
import * as GeminiService from './services/geminiService';
import { potTotal } from './show/pot';
import { playCues, revealCueSheet } from './show/director';
import { lookForTheme } from './show/looks';
import { LENGTH_PRESETS, estimateMinutes, gameClockText, handsLeftNote } from './game/gameLength';
import { ADAPTIVE_LEVEL_KEY, levelChangeNotice, nextAdaptiveLevel } from './game/adaptiveLevel';
import { AWARDS_KEY, computeAwards } from './game/awards';
import { sentenceStatus } from './game/aiStatus';
import { flightPalette, type PowerUpFlightEvent } from './show/flight';
import { useFocusTrap } from './utils/useFocusTrap';
import LiveAnnouncer from './components/LiveAnnouncer';
import FirstRunCoach from './components/FirstRunCoach';
import { DemoRoomController, type HostRoomLike } from './services/demoRoom';
import { COACH_SEEN_KEY, shouldShowCoach } from './game/coach';
import { DEMO_BOT_COUNT } from './game/demoBots';
import { isE2eMode } from './utils/e2eContent';
import { classListMatch } from './game/classList';
import { SAY_IT_KEY, SPECIAL_HANDS_KEY, SPECIAL_HAND_INFO, payoutMultiplierFor, specialHandFor, specialHandLabelFor, spotlightRoundFor, fixItRoundFor, classCorrections, type SpecialHand } from './game/specialHands';
import { phaseAnnouncement } from './game/announce';
import { DEFAULT_MUSIC_VOLUME, MUSIC_VOLUME_KEY, createMusicEngine, layerForStep, musicDuckFor, secondsLeftOnTimers } from './utils/musicEngine';
import { createSoundEngine, clampVolume, DEFAULT_SFX_VOLUME, SFX_VOLUME_STORAGE_KEY, SFX_MUTED_STORAGE_KEY } from './utils/soundEngine';
import { settleRound, buildAcceptedAnswerSet, getAlternativeAcceptedAnswers, normalizeGapAnswer } from './utils/roundSettlement';
import { markErrorPhrase, diffWords, TextSegment } from './utils/errorHighlight';
import { getCefrTopicRuleSpec } from './utils/cefrGrammarMatrix';
import {
  subscribeToTeacherAuth,
  isVerifiedTeacherUser,
  syncCloudSentenceBank,
  CloudRoster,
} from './services/firebaseService';
import { isGapType, isOptionType, isTypedAnswerType, isWordAnswerType, questionTypeLabel } from './game/questionTypes';
import { wordOrderHint } from './game/newFormats';
import { REMOTE_STORAGE_KEY, buildRemoteView, isRemoteAction, isRemoteAvatar, newRemoteKey, remoteAvatar, remoteLink } from './game/teacherRemote';
import { RemotePairModal } from './components/RemotePairModal';
import { SpotErrorSentence, WordTiles, newFormatTask } from './components/NewFormatSentence';

const HOUSE_BAILOUT_AMOUNT = 150;
// The sentence banner sticks this far from the top of the window, just below the
// fixed top buttons (16 px margin + 44 px buttons + 16 px gap), so it never slides under them.
const STICKY_TOP_PX = 76;

// --- Sound engine (Web Audio, no downloads; see utils/soundEngine.ts) ---
const readStoredSfxVolume = (): number => {
  try {
    return clampVolume(safeLocalStorage.getItem(SFX_VOLUME_STORAGE_KEY), DEFAULT_SFX_VOLUME);
  } catch {
    return DEFAULT_SFX_VOLUME;
  }
};
const soundEngine = createSoundEngine(typeof window !== 'undefined' ? readStoredSfxVolume() : DEFAULT_SFX_VOLUME);
// Package V6: the music bed. The volume is kept per computer; 0 means no music.
function readStoredMusicVolume(): number {
  const raw = safeLocalStorage.getItem(MUSIC_VOLUME_KEY);
  const v = raw === null ? DEFAULT_MUSIC_VOLUME : Number(raw);
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_MUSIC_VOLUME;
}
const musicEngine = createMusicEngine(typeof window !== 'undefined' ? readStoredMusicVolume() : DEFAULT_MUSIC_VOLUME);



const loadInitialState = () => { 
  try { 
    // One versioned save format (package T5): game/persistence.ts reads every version.
    return readSave(safeLocalStorage.getItem(LOCAL_STORAGE_KEY), () => getRandomCharacterAvatar());
  } catch (e) { 
    console.error("Failed to load or parse game state from localStorage:", e);
    return null; 
  }
};

const initialGameState = loadInitialState();

// Package T1: last game's setup, remembered per browser.
function loadSetupPrefs(): Partial<SetupPrefs> {
  return parseSetupPrefs(safeLocalStorage.getItem(SETUP_PREFS_KEY), {
    levels: CEFR_LEVELS,
    questionTypes: ALL_QUESTION_TYPES,
    powerUps: Object.keys(POWER_UPS),
    timerOptions: TURN_TIMER_OPTIONS,
    minTargetAmount: MIN_TARGET_AMOUNT,
  }) ?? {};
}
const OWN_DECK_KEY = 'grammar_casino_own_deck_v1';
const initialPrefs = initialGameState ? {} : loadSetupPrefs();

const renderTextSegments = (segments: TextSegment[], markClassName: string) =>
  segments.map((seg, i) =>
    seg.mark ? (
      <mark key={i} className={markClassName}>{seg.text}</mark>
    ) : (
      <React.Fragment key={i}>{seg.text}</React.Fragment>
    )
  );

export function App() {
  const [step, setStep] = useState<Step>(initialGameState?.step || 'PLAYER_SETUP');
  const [players, setPlayers] = useState<Player[]>(initialGameState?.players || []);
  const [newPlayerName, setNewPlayerName] = useState('');
  const playerNameInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = initialGameState?.settings;
    if (saved) {
      return {
        ...saved,
        challengeFormat: saved.challengeFormat || 'binary',
        mixedFormats: getEffectiveMixedFormats(saved.mixedFormats),
      };
    }
    return initialPrefs.settings ?? {
      topic: GRAMMAR_TOPICS[0],
      level: CEFR_LEVELS[2],
      theme: THEMES[0],
      challengeFormat: 'binary',
      mixedFormats: DEFAULT_MIXED_FORMATS,
    };
  });
  const [mixedFormatSetupWarning, setMixedFormatSetupWarning] = useState<string | null>(null);
  const [customTopic, setCustomTopic] = useState(initialGameState?.customTopic || initialPrefs.customTopic || '');
  const [customTheme, setCustomTheme] = useState(initialGameState?.customTheme || initialPrefs.customTheme || '');
  const mixedFormatIndexRef = useRef(0);
  
  // Package G3: a new game starts in "Most money after N hands", the gentlest start for a class.
  const [gameMode, setGameMode] = useState<GameMode>(initialGameState?.gameMode || initialPrefs.gameMode || 'rounds');
  const [totalRounds, setTotalRounds] = useState<number | string>(initialGameState?.totalRounds || initialPrefs.totalRounds || 10);
  const [targetAmount, setTargetAmount] = useState<number | string>(initialGameState?.targetAmount || initialPrefs.targetAmount || DEFAULT_TARGET_AMOUNT);
  const [currentRound, setCurrentRound] = useState(initialGameState?.currentRound || 1);
  const currentRoundRef = useRef(currentRound);
  currentRoundRef.current = currentRound;
  // Package L6: missed grammar points come back two hands later ("a second look").
  const secondLookQueueRef = useRef<SecondLook[]>([]);
  // Package G6 Spotlight: misses per grammar point, the Spotlight hand, and free draws earned there.
  const missTallyRef = useRef<MissTally>({});
  const spotlightRoundRef = useRef<number | null>(null);
  const fixItRoundRef = useRef<number | null>(null);
  const [freeDraws, setFreeDraws] = useState<FreeDraws>({});
  const handSubtypeRef = useRef<string | null>(null);
  /** The hand the next fetch is for, when it is not the next hand (Swap this sentence). */
  const fetchTargetRoundRef = useRef<number | null>(null);
  const [secondLookRound, setSecondLookRound] = useState<number | null>(null);
  
  const [currentSentence, setCurrentSentence] = useState<GeneratedSentence | null>(initialGameState?.currentSentence || null);
  const [pastSentences, setPastSentences] = useState<string[]>(initialGameState?.pastSentences || []);
  const [pastMistakes, setPastMistakes] = useState<string[]>(initialGameState?.pastMistakes || []);
  const [sentenceBatch, setSentenceBatch] = useState<boolean[]>(initialGameState?.sentenceBatch || []);
  const [roundHistory, setRoundHistory] = useState<RoundHistoryRecord[]>(initialGameState?.roundHistory || []);
  const [showReportCardModal, setShowReportCardModal] = useState(false);

  const newBatch = () => {
    const batch = [true, true, false, false, false];
    for (let i = batch.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [batch[i], batch[j]] = [batch[j], batch[i]];
    }
    return batch;
  };

  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  
  const [bets, setBets] = useState<Record<number, Bet>>(initialGameState?.bets || {});
  const [hints, setHints] = useState<Record<number, Hint>>(initialGameState?.hints || {});
  const [roundResults, setRoundResults] = useState<RoundResultInfo[]>(initialGameState?.roundResults || []);
  const [winner, setWinner] = useState<Player | null>(initialGameState?.winner || null);
  const [error, setError] = useState<GameError | null>(null);
  
  const [isMuted, setIsMuted] = useState(() => {
    try {
      return safeLocalStorage.getItem(SFX_MUTED_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [sfxVolume, setSfxVolume] = useState(() => soundEngine.getVolume());
  const audioReady = soundEngine.isSupported();
  const [ttsVoices, setTtsVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [orpheusVoice, setOrpheusVoice] = useState<GeminiService.OrpheusVoiceId>(() => {
    try {
      const saved = safeLocalStorage.getItem('grammar_casino_orpheus_voice_v2');
      if (saved && GeminiService.ORPHEUS_VOICE_OPTIONS.some(v => v.id === saved)) {
        return saved as GeminiService.OrpheusVoiceId;
      }
    } catch {}
    return GeminiService.DEFAULT_ORPHEUS_VOICE;
  });
  const handleOrpheusVoiceChange = useCallback((nextVoice: GeminiService.OrpheusVoiceId) => {
    setOrpheusVoice(nextVoice);
    try {
      safeLocalStorage.setItem('grammar_casino_orpheus_voice_v2', nextVoice);
    } catch {}
  }, []);
  const [ttsAudioContext] = useState(() => new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 }));
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isSentenceRevealed, setIsSentenceRevealed] = useState(false);
  
  const [historyPlayer, setHistoryPlayer] = useState<Player | null>(null);
  // powerUpsUsedThisRound tracks usage history for current round per player.
  const [powerUpsUsedThisRound, setPowerUpsUsedThisRound] = useState<Record<number, UsedPowerUp[]>>(initialGameState?.powerUpsUsedThisRound || {});
  const [activePowerUps, setActivePowerUps] = useState<Record<number, ActivePowerUp[]>>(initialGameState?.activePowerUps || {}); // PlayerId -> PowerUps[]
  const [showPowerUpModal, setShowPowerUpModal] = useState<ShowPowerUpModalPayload | null>(null);
  const [showTargetModal, setShowTargetModal] = useState<ShowTargetModalPayload | null>(null);
  const [highlightedPhrase, setHighlightedPhrase] = useState<string | null>(initialGameState?.highlightedPhrase || null);
  const [availablePowerUps, setAvailablePowerUps] = useState<PowerUpKey[]>(() => {
    const allKeys = Object.keys(POWER_UPS) as PowerUpKey[];
    if (initialGameState?.availablePowerUps) {
      const saved = initialGameState.availablePowerUps as PowerUpKey[];
      const missing = allKeys.filter(k => !saved.includes(k));
      return [...saved, ...missing];
    }
    return allKeys;
  });
  const [selectedPowerUps, setSelectedPowerUps] = useState<PowerUpKey[]>(() => {
    const allKeys = Object.keys(POWER_UPS) as PowerUpKey[];
    if (initialGameState?.selectedPowerUps) {
      const saved = initialGameState.selectedPowerUps as PowerUpKey[];
      const missing = allKeys.filter(k => !saved.includes(k));
      return [...saved, ...missing];
    }
    return initialPrefs.deck ?? allKeys;
  });
  const [roundSpending, setRoundSpending] = useState<Record<number, number>>(initialGameState?.roundSpending || {}); // PlayerId -> amount spent

  const [isSentenceHeaderStuck, setIsSentenceHeaderStuck] = useState(false);
  const sentenceHeaderRef = useRef<HTMLDivElement>(null);

  const [simplifiedExplanation, setSimplifiedExplanation] = useState<{ text: string | null; loading: boolean }>({ text: null, loading: false });
  const [showAvatarModal, setShowAvatarModal] = useState<{ playerId: number } | null>(null);
  const [editingPlayerIdInSetup, setEditingPlayerIdInSetup] = useState<number | null>(null);
  const [editingPlayerNameInSetup, setEditingPlayerNameInSetup] = useState('');
  const [startingCash, setStartingCash] = useState<number>(initialGameState?.startingCash ?? initialPrefs.startingCash ?? INITIAL_PLAYER_MONEY);
  const [isEditingStartingCash, setIsEditingStartingCash] = useState(false);
  const [isLobbyMenuOpen, setIsLobbyMenuOpen] = useState(false);
  const [tempStartingCash, setTempStartingCash] = useState<string>(String(initialGameState?.startingCash ?? initialPrefs.startingCash ?? INITIAL_PLAYER_MONEY));
  const [showWheelModal, setShowWheelModal] = useState<{ playerId: number } | null>(null);
  const [usedSubtypes, setUsedSubtypes] = useState<string[]>([]);
  const [pendingLoadGame, setPendingLoadGame] = useState<any | null>(null);

  const [showDeckConfigModal, setShowDeckConfigModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsModalTab, setSettingsModalTab] = useState<SettingsModalTab>('topic');
  const [nextRoundSettings, setNextRoundSettings] = useState<Settings | null>(initialGameState?.nextRoundSettings || null);
  const [isSettingsDeckExpanded, setIsSettingsDeckExpanded] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return safeLocalStorage.getItem('grammar_casino_expand_settings_deck') === 'true';
    }
    return false;
  });

  // --- Betting Turn Timer State ---
  const [turnTimerSeconds, setTurnTimerSeconds] = useState<number>(() => {
    const saved = initialGameState?.turnTimerSeconds;
    if (typeof saved === 'number' && TURN_TIMER_OPTIONS.includes(saved)) return saved;
    return initialPrefs.turnTimerSeconds ?? 0;
  });
  const [turnTimers, setTurnTimers] = useState<Record<number, PlayerTurnTimer>>(initialGameState?.turnTimers || {});
  const [mpRoundTimer, setMpRoundTimer] = useState<PlayerTurnTimer>({ status: 'idle' });
  const mpAutoStartedRoundRef = useRef<number>(0);
  const mpTimerAutoPausedByAllLockedRef = useRef<boolean>(false);
  const [teacherRevealOverride, setTeacherRevealOverride] = useState<boolean>(initialGameState?.teacherRevealOverride || false);
  // Package R8: the teacher paused the hand. Timers stop, phones show a pause card and take no input.
  const later = useLaterTimers();
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  // Package R2: when each phone was last heard from, and who is away (nothing for 45 s).
  const mpLastSeenRef = useRef<Record<number, number>>({});
  const [mpAwayIds, setMpAwayIds] = useState<number[]>([]);
  // Package T5: "Resume or start fresh" when an unfinished game is opened again later
  // (not when a live room is reopening by itself), and the reports of finished games.
  const [resumeOffer, setResumeOffer] = useState(() => (loadSavedHostRoom() ? null : getResumeOffer(initialGameState, Date.now())));
  const [finishedGames, setFinishedGames] = useState<FinishedGame[]>(() => parseFinishedGames(safeLocalStorage.getItem(FINISHED_GAMES_STORAGE_KEY)));
  const [showPastReports, setShowPastReports] = useState(false);
  const [pastReport, setPastReport] = useState<FinishedGame | null>(null);
  // Package T2: shortcut list and full screen for presenting.
  const [showHotkeyHelp, setShowHotkeyHelp] = useState(false);
  const [showDebugLog, setShowDebugLog] = useState(false);
  // Package L4: the teacher's own sentences (kept per browser, dealt first).
  const [ownDeck, setOwnDeck] = useState<{ text: string; name: string }>(() => {
    try {
      const raw = safeLocalStorage.getItem(OWN_DECK_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed.text === 'string') return { text: parsed.text, name: String(parsed.name || 'My deck') };
    } catch {
      // start empty
    }
    return { text: '', name: 'My deck' };
  });
  const [showOwnDeck, setShowOwnDeck] = useState(false);
  const ownDeckItems = useMemo(() => parseDeckText(ownDeck.text).items, [ownDeck.text]);
  useEffect(() => {
    GeminiService.setTeacherDeck(ownDeckItems);
    safeLocalStorage.setItem(OWN_DECK_KEY, JSON.stringify(ownDeck));
  }, [ownDeckItems, ownDeck]);
  const [isFullscreen, setIsFullscreen] = useState(() => typeof document !== 'undefined' && Boolean(document.fullscreenElement));
  isPausedRef.current = isPaused;
  const [autoStartNextTimer, setAutoStartNextTimer] = useState<boolean>(initialGameState?.autoStartNextTimer ?? true);
  const turnDurationMs = turnTimerSeconds * 1000;
  const isTurnTimerEnabled = turnTimerSeconds > 0;

  // --- Live Classroom Multiplayer State ---
  const [initialUrlRoomCode] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get('room')?.trim().toUpperCase() || '';
    }
    return '';
  });
  const [isStudentControllerMode, setIsStudentControllerMode] = useState<boolean>(() => Boolean(initialUrlRoomCode));
  const [mpRoomCode, setMpRoomCode] = useState<string | null>(null);
  const [mpRoomLocked, setMpRoomLocked] = useState<boolean>(false);
  const [mpHostConnected, setMpHostConnected] = useState<boolean>(false);
  const [mpSeats, setMpSeats] = useState<Record<number, MultiplayerSeat>>({});
  const mpSeatsRef = useRef(mpSeats);
  mpSeatsRef.current = mpSeats;
  // Phones asking to play as a name that is already seated on another device (teacher decides).
  const [mpTakeoverRequests, setMpTakeoverRequests] = useState<SeatTakeoverRequest[]>([]);
  useEffect(() => {
    setMpTakeoverRequests([]);
  }, [mpRoomCode]);
  const [showMpLobbyModal, setShowMpLobbyModal] = useState<boolean>(false);
  // Shown for a few seconds after a reload reopened the live room.
  const [mpResumeNotice, setMpResumeNotice] = useState<string | null>(null);
  const [mpHideProjectorBets, setMpHideProjectorBets] = useState<boolean>(true);
  // Single-screen table layout: defaults to compact grid.
  const [tableLayoutPref, setTableLayoutPref] = useState<'grid' | 'cards'>('grid');
  const [openSeatPlayerId, setOpenSeatPlayerId] = useState<number | null>(null);
  const openSeatRef = useRef<HTMLDivElement>(null);
  const [mpStudentPendingTarget, setMpStudentPendingTarget] = useState<Record<number, PowerUpKey | null>>({});
  const [mpStudentPendingWheel, setMpStudentPendingWheel] = useState<Record<number, string>>({});
  const [mpStudentNotifications, setMpStudentNotifications] = useState<
    Record<number, { id: string; title: string; message: string; icon?: string } | null>
  >({});
  const mpControllerRef = useRef<HostRoomLike | null>(null);
  // Package T7: a demo room with bots. While it runs nothing is saved, so ending it (a page
  // reload) brings back exactly what was there before.
  const [isDemoRoom, setIsDemoRoom] = useState(false);
  const [showCoach, setShowCoach] = useState(false);
  const isDemoRef = useRef(false);
  const mpEventHandlerRef = useRef<(ev: HostEventPayload) => void>(() => {});

  // Desktop AI Engine and DPAPI Encryption status
  const [desktopStatus, setDesktopStatus] = useState<GeminiService.DesktopStatus>({
    isDesktop: false,
    isOnline: true,
    hasKey: false,
    isEncrypted: false,
  });

  // Google sign-in is only needed for cloud saves (decision D3). AI sentences and live rooms are open to everyone.
  const [teacherGoogleEmail, setTeacherGoogleEmail] = useState<string | null>(null);
  // A yes/no question before an action that cannot be undone (F4 fix 10)
  // Package R8: the table just before the last reveal, for Undo reveal and Correct the ruling.
  const [revealSnapshot, setRevealSnapshot] = useState<RevealSnapshot | null>(null);
  // Package L5: "Got it" / "Still confused" from the phones, per hand.
  const [handReactions, setHandReactions] = useState<HandReactions>({});
  // Package T3: the teacher's phone as a remote (one per room).
  const [remotePair, setRemotePair] = useState<{ code: string; key: string; seatId: number | null } | null>(() => {
    try {
      const raw = safeLocalStorage.getItem(REMOTE_STORAGE_KEY);
      const saved = raw ? JSON.parse(raw) : null;
      return saved && typeof saved.code === 'string' && typeof saved.key === 'string' ? { code: saved.code, key: saved.key, seatId: typeof saved.seatId === 'number' ? saved.seatId : null } : null;
    } catch {
      return null;
    }
  });
  const remotePairRef = useRef(remotePair);
  remotePairRef.current = remotePair;
  /** Remote seats that are no longer the remote (unpaired, or a second phone): their phones are told so, and nothing they send counts. */
  const [retiredRemoteSeats, setRetiredRemoteSeats] = useState<number[]>([]);
  const retiredRemoteSeatsRef = useRef(retiredRemoteSeats);
  retiredRemoteSeatsRef.current = retiredRemoteSeats;
  const [remoteNotice, setRemoteNotice] = useState<string | null>(null);
  const [showRemotePair, setShowRemotePair] = useState(false);
  const [remoteBase, setRemoteBase] = useState('');
  useEffect(() => {
    if (remotePair) safeLocalStorage.setItem(REMOTE_STORAGE_KEY, JSON.stringify(remotePair));
    else safeLocalStorage.removeItem(REMOTE_STORAGE_KEY);
  }, [remotePair]);
  // Package L7: the phones' "Got it" / "Still confused" counts go into each hand's record, so the
  // report and past reports keep them.
  useEffect(() => {
    setRoundHistory(prev => {
      let changed = false;
      const next = prev.map(r => {
        if (!handReactions[r.round]) return r;
        const c = reactionCounts(handReactions, r.round);
        if (r.feedback && r.feedback.gotIt === c.gotIt && r.feedback.confused === c.confused) return r;
        changed = true;
        return { ...r, feedback: c };
      });
      return changed ? next : prev;
    });
  }, [handReactions]);
  const [undoClock, setUndoClock] = useState(() => Date.now());
  const [showRulingModal, setShowRulingModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; confirmLabel: string; onConfirm: () => void } | null>(null);

  // Cloud Rosters, Session Reports & Cloud Sentence Bank Modal State
  const [showCloudModal, setShowCloudModal] = useState<boolean>(false);
  const [cloudModalTab, setCloudModalTab] = useState<CloudManagerTab>('rosters');
  const [activeCloudRoster, setActiveCloudRoster] = useState<{ id: string; className: string } | null>(null);

  const refreshDesktopStatus = useCallback(() => {
    GeminiService.getDesktopStatus().then(setDesktopStatus);
  }, []);

  useEffect(() => {
    refreshDesktopStatus();
    // Sync the auto-growing Cloud Sentence Bank into local cache on startup
    void syncCloudSentenceBank();

    // Listen to Firebase Google Auth state (cloud saves show who is signed in)
    const unsubscribeAuth = subscribeToTeacherAuth((user) => {
      setTeacherGoogleEmail(isVerifiedTeacherUser(user) ? user?.email || null : null);
    });

    const handleOnline = () => refreshDesktopStatus();
    const handleOffline = () => refreshDesktopStatus();
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      unsubscribeAuth();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshDesktopStatus]);

  // The vault asks for the teacher's Google sign-in itself (the Firestore rules require it),
  // so it opens straight away.
  const startDemoRoom = () => {
    if (mpControllerRef.current) return;
    playSound('startGame');
    isDemoRef.current = true;
    setIsDemoRoom(true);
    const controller = new DemoRoomController((ev) => mpEventHandlerRef.current(ev));
    mpControllerRef.current = controller;
    setMpRoomCode(controller.code);
    setMpRoomLocked(false);
    setMpHostConnected(true);
  };
  const endDemoRoom = () => {
    mpControllerRef.current?.destroy();
    mpControllerRef.current = null;
    window.location.reload();
  };

  const closeCoach = () => {
    setShowCoach(false);
    safeLocalStorage.setItem(COACH_SEEN_KEY, 'seen');
  };

  const handleOpenCloudModal = (tab: CloudManagerTab = 'rosters') => {
    playSound('click');
    setCloudModalTab(tab);
    setShowCloudModal(true);
  };

  const startHostMultiplayerRoom = async () => {
    try {
      playSound('startGame');
      if (mpControllerRef.current) {
        mpControllerRef.current.destroy();
      }
      const controller = await HostRoomController.createRoom(
        (ev) => mpEventHandlerRef.current(ev),
        (connected) => setMpHostConnected(connected)
      );
      mpControllerRef.current = controller;
      setMpRoomCode(controller.code);
      setMpRoomLocked(false);
      setShowMpLobbyModal(true);
    } catch (e: any) {
      setError({ title: 'Multiplayer Error', message: e?.message || 'Could not create multiplayer room.' });
    }
  };

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = safeLocalStorage.getItem('grammar_casino_theme');
      if (savedTheme) {
        return savedTheme === 'dark';
      }
      return true;
    }
    return true;
  });

  const toggleTheme = () => {
    setIsDarkMode(prev => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add('dark');
        safeLocalStorage.setItem('grammar_casino_theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        safeLocalStorage.setItem('grammar_casino_theme', 'light');
      }
      return next;
    });
  };

  // Projector mode: solid text and bigger small labels for reading from the back of a classroom.
  const [isProjectorMode, setIsProjectorMode] = useState<boolean>(() => {
    try {
      return safeLocalStorage.getItem('grammar_casino_projector_mode') === 'on';
    } catch {
      return false;
    }
  });

  // Calm mode: one switch that turns the table's motion off (the deal, pulses, count-ups,
  // confetti). Phones in a live room follow it too.
  // Package V1: quality of the 3D table. The teacher picks it, or Automatic learns it per computer.
  const [qualityStored, setQualityStored] = useState(() => parseStoredQuality(safeLocalStorage.getItem(QUALITY_KEY)));
  const [sessionQuality, setSessionQuality] = useState<QualityTier | null>(null);
  const qualityTier: QualityTier = sessionQuality ?? resolveTier(qualityStored, {
    hardwareConcurrency: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined,
    deviceMemory: typeof navigator !== 'undefined' ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory : undefined,
  });
  useEffect(() => {
    document.documentElement.dataset.quality3d = qualityTier;
  }, [qualityTier]);
  useEffect(() => {
    safeLocalStorage.setItem(QUALITY_KEY, JSON.stringify(qualityStored));
  }, [qualityStored]);
  const handleQualityChange = useCallback((tier: QualityTier, reason: string) => {
    logEvent('perf', `3D table quality ${tier} (${reason})`);
    setSessionQuality(tier);
    // Only a slow-frame step down is remembered for next time; a lost context is a one-off.
    if (reason === 'slow frames') setQualityStored(prev => (prev.choice === 'auto' ? { ...prev, learned: tier } : prev));
  }, []);
  const chooseQuality = useCallback((choice: QualityChoice) => {
    setSessionQuality(null);
    setQualityStored({ choice });
  }, []);
  const [isCalmMode, setIsCalmMode] = useState<boolean>(() => {
    try {
      return safeLocalStorage.getItem('grammar_casino_calm_mode') === 'on';
    } catch {
      return false;
    }
  });
  const [activeCutIn, setActiveCutIn] = useState<BroadcastCutInPayload | null>(null);
  useEffect(() => {
    if (activeCutIn || showPowerUpModal || !pendingFlightRef.current) return;
    const flight = pendingFlightRef.current;
    pendingFlightRef.current = null;
    setPowerUpFlightEvent(flight);
  }, [activeCutIn, showPowerUpModal]);
  const [chipTossEvent, setChipTossEvent] = useState<ChipTossEvent | null>(null);
  const [potSweepEvent, setPotSweepEvent] = useState<PotSweepEvent | null>(null);
  const [jackpotEvent, setJackpotEvent] = useState<JackpotEvent | null>(null);
  const [boomerangArcEvent, setBoomerangArcEvent] = useState<BoomerangArcEvent | null>(null);
  const [shoeDealEvent, setShoeDealEvent] = useState<ShoeDealEvent | null>(null);
  const [powerUpFlightEvent, setPowerUpFlightEvent] = useState<PowerUpFlightEvent | null>(null);
  // The flight waits until the cut-in and the power-up message are closed, so it is seen on the felt.
  const pendingFlightRef = useRef<PowerUpFlightEvent | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('gc-calm', isCalmMode);
    try {
      safeLocalStorage.setItem('grammar_casino_calm_mode', isCalmMode ? 'on' : 'off');
    } catch {
      // Storage can be blocked (private window); the mode still works for this visit.
    }
  }, [isCalmMode]);

  useEffect(() => {
    document.documentElement.classList.toggle('projector', isProjectorMode);
    try {
      safeLocalStorage.setItem('grammar_casino_projector_mode', isProjectorMode ? 'on' : 'off');
    } catch {
      // Storage can be blocked (private window); the mode still works for this visit.
    }
  }, [isProjectorMode]);

  // Package V2 step 2: Table view (the Blender table behind the game screens) where the 3D table
  // is on, outside Calm mode, on screens at least 1100 px wide; Classic view everywhere else.
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 0));
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const [tableViewFailed, setTableViewFailed] = useState(false);
  const isTableView = !tableViewFailed && tableViewOn({ step, quality: qualityTier, calmMode: isCalmMode, width: viewportWidth });
  useEffect(() => {
    document.documentElement.dataset.view = isTableView ? 'table' : 'classic';
  }, [isTableView]);
  const handleTableUnavailable = useCallback((reason: string) => {
    logEvent('perf', `Table view off (${reason}); using Classic view`);
    setTableViewFailed(true);
  }, []);

  // Package V10: projector text grows on the screens the class reads from afar (see index.css).
  useEffect(() => {
    const table = step === 'IN_GAME' || step === 'RESULTS' || step === 'GAME_OVER';
    document.documentElement.dataset.screen = table ? 'table' : 'setup';
  }, [step]);

  useEffect(() => {
    const savedTheme = safeLocalStorage.getItem('grammar_casino_theme');
    if (savedTheme === 'light') {
      document.documentElement.classList.remove('dark');
      setIsDarkMode(false);
    } else {
      document.documentElement.classList.add('dark');
      setIsDarkMode(true);
    }
  }, []);

  const activePlayers = players.filter(p => p.money > 0);

  // Sound and TTS setup. Browsers keep audio locked until the first tap,
  // so unlock the engine on the first user gesture anywhere on the page.
  useEffect(() => {
    const unlock = () => { soundEngine.unlock(); };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    try { safeLocalStorage.setItem(SFX_MUTED_STORAGE_KEY, String(isMuted)); } catch {}
  }, [isMuted]);

  // Package V6: music plays after the first click, never with sound off or in Calm mode,
  // fades between layers with the screen, and drops to 30% while the results are read.
  const [musicVolume, setMusicVolume] = useState(() => readStoredMusicVolume());
  const musicWanted = !isMuted && !isCalmMode && musicVolume > 0;
  useEffect(() => {
    musicEngine.setVolume(musicVolume);
    try { safeLocalStorage.setItem(MUSIC_VOLUME_KEY, String(musicVolume)); } catch {}
  }, [musicVolume]);
  useEffect(() => {
    if (!musicWanted) {
      musicEngine.stop();
      return;
    }
    const begin = () => musicEngine.start();
    begin();
    window.addEventListener('pointerdown', begin, { once: true });
    window.addEventListener('keydown', begin, { once: true });
    return () => {
      window.removeEventListener('pointerdown', begin);
      window.removeEventListener('keydown', begin);
    };
  }, [musicWanted]);
  // Package S8: the pause window keeps the keyboard while it is open.
  const pauseDialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(pauseDialogRef, isPaused && step === 'IN_GAME');

  // Package G7: "2 hands left" and "Last hand" on the hand badge.
  const handsLeftLabel = gameMode === 'rounds' ? handsLeftNote(currentRound, Number(totalRounds)) : null;
  // Package G7: the teacher's game clock, from the first deal.
  const [gameStartedAt, setGameStartedAt] = useState<number | null>(null);
  /** Package L7: when this hand's sentence was shown, for "time per hand" in the report. */
  const handShownAtRef = useRef<number | null>(null);
  const handShownTextRef = useRef<string>('');
  useEffect(() => {
    if (step !== 'IN_GAME' || isLoading || !currentSentence) return;
    const key = `${currentRound}|${currentSentence.text}`;
    if (handShownTextRef.current === key) return;
    handShownTextRef.current = key;
    handShownAtRef.current = Date.now();
  }, [step, isLoading, currentSentence, currentRound]);
  const [clockNow, setClockNow] = useState(() => Date.now());
  useEffect(() => {
    if (step === 'PLAYER_SETUP') setGameStartedAt(null);
    else if (step === 'IN_GAME' && currentRound === 1) setGameStartedAt(prev => prev ?? Date.now());
  }, [step, currentRound]);
  useEffect(() => {
    if (step !== 'IN_GAME' && step !== 'RESULTS') return;
    setClockNow(Date.now());
    const timer = setInterval(() => setClockNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, [step]);
  const clockStart = gameStartedAt ?? roundHistory[0]?.timestamp ?? null;
  const handsDone = step === 'RESULTS' ? currentRound : currentRound - 1;
  const gameClock = clockStart
    ? gameClockText({
        elapsedMs: clockNow - clockStart,
        handsDone,
        handsLeft: gameMode === 'rounds' ? Number(totalRounds) - handsDone : null,
      })
    : null;

  // Package G6: special hands, off unless the teacher turns them on.
  const [specialHandsOn, setSpecialHandsOn] = useState<boolean>(() => safeLocalStorage.getItem(SPECIAL_HANDS_KEY) === 'on');
  useEffect(() => {
    safeLocalStorage.setItem(SPECIAL_HANDS_KEY, specialHandsOn ? 'on' : 'off');
  }, [specialHandsOn]);
  const currentSpecialHand: SpecialHand | null = specialHandFor({
    enabled: specialHandsOn,
    gameMode,
    round: currentRound,
    totalRounds: Number(totalRounds),
    secondLookRound,
    questionType: currentSentence?.questionType,
    sentenceIsCorrect: currentSentence ? currentSentence.isCorrect : null,
  });
  const specialHandLabel = specialHandLabelFor(currentSpecialHand);
  spotlightRoundRef.current = specialHandsOn && gameMode === 'rounds' ? spotlightRoundFor(Number(totalRounds)) : null;
  fixItRoundRef.current = specialHandsOn && gameMode === 'rounds' ? fixItRoundFor(Number(totalRounds)) : null;
  // Package L9: "Say it" after each reveal, off unless the teacher turns it on.
  const [sayItOn, setSayItOn] = useState<boolean>(() => safeLocalStorage.getItem(SAY_IT_KEY) === 'on');
  useEffect(() => {
    safeLocalStorage.setItem(SAY_IT_KEY, sayItOn ? 'on' : 'off');
  }, [sayItOn]);
  // Package L6: the level follows the class, off unless the teacher turns it on.
  const [adaptiveLevelOn, setAdaptiveLevelOn] = useState<boolean>(() => safeLocalStorage.getItem(ADAPTIVE_LEVEL_KEY) === 'on');
  useEffect(() => {
    safeLocalStorage.setItem(ADAPTIVE_LEVEL_KEY, adaptiveLevelOn ? 'on' : 'off');
  }, [adaptiveLevelOn]);
  // Package G3 / V9: end-of-game awards, off unless the teacher turns them on.
  const [awardsOn, setAwardsOn] = useState<boolean>(() => safeLocalStorage.getItem(AWARDS_KEY) === 'on');
  useEffect(() => {
    safeLocalStorage.setItem(AWARDS_KEY, awardsOn ? 'on' : 'off');
  }, [awardsOn]);
  const adaptLastChangeRef = useRef(0);
  const [levelNotice, setLevelNotice] = useState<{ round: number; text: string } | null>(null);
  useEffect(() => {
    if (step === 'IN_GAME' && currentRound === 1) {
      adaptLastChangeRef.current = 0;
      setLevelNotice(null);
    }
  }, [step, currentRound]);
  useEffect(() => {
    if (!adaptiveLevelOn || step !== 'RESULTS' || roundHistory.length === 0) return;
    if (roundHistory[roundHistory.length - 1].round !== currentRound || levelNotice?.round === currentRound) return;
    if (gameMode === 'rounds' && currentRound >= Number(totalRounds)) return;
    const base = nextRoundSettings || settings;
    const change = nextAdaptiveLevel({ levels: CEFR_LEVELS, current: base.level, history: roundHistory, lastChangeRound: adaptLastChangeRef.current });
    if (!change) return;
    adaptLastChangeRef.current = currentRound;
    setNextRoundSettings({ ...base, level: change.level as Settings['level'] });
    setLevelNotice({ round: currentRound, text: levelChangeNotice(change) });
  }, [adaptiveLevelOn, step, roundHistory, currentRound, levelNotice, gameMode, totalRounds, nextRoundSettings, settings]);
  // Listening hand: the sentence stays hidden on the projector and the phones until the reveal,
  // unless the teacher shows it (the round number it was shown for).
  const [listenShownRound, setListenShownRound] = useState<number | null>(null);
  const isSentenceHiddenForListening =
    currentSpecialHand === 'listening' && step === 'IN_GAME' && listenShownRound !== currentRound;
  const [specialHandCard, setSpecialHandCard] = useState<{ hand: SpecialHand; round: number } | null>(null);
  useEffect(() => {
    if (step !== 'IN_GAME' || !currentSpecialHand) return;
    setSpecialHandCard({ hand: currentSpecialHand, round: currentRound });
    playSound('success');
    // A title card when the hand is dealt; not again for the same hand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, currentRound, currentSpecialHand]);
  useEffect(() => {
    if (!specialHandCard) return;
    const timer = setTimeout(() => setSpecialHandCard(null), isCalmMode ? 1800 : 2500);
    return () => clearTimeout(timer);
  }, [specialHandCard, isCalmMode]);

  // Package V8: the theme sets the felt, the lamp, the sparks and the music key.
  const stageLook = lookForTheme(settings.theme);
  useEffect(() => {
    musicEngine.setKey(stageLook.musicKey);
  }, [stageLook]);

  // Package V3: the pot plaque counts up from the last total it showed.
  const potNow = potTotal(bets);
  const lastPotShown = useRef(potNow);
  useEffect(() => {
    lastPotShown.current = potNow;
  }, [potNow]);

  // The music turns tense in the last 5 seconds of a turn timer, and drops while a sentence is read aloud.
  const [musicSecondsLeft, setMusicSecondsLeft] = useState<number | null>(null);
  useEffect(() => {
    const timers = mpRoomCode ? [mpRoundTimer] : (Object.values(turnTimers) as PlayerTurnTimer[]);
    if (step !== 'IN_GAME' || !isTurnTimerEnabled || secondsLeftOnTimers(timers, Date.now()) === null) {
      setMusicSecondsLeft(null);
      return;
    }
    const tick = () => setMusicSecondsLeft(secondsLeftOnTimers(timers, Date.now()));
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [step, isTurnTimerEnabled, mpRoomCode, mpRoundTimer, turnTimers]);
  useEffect(() => {
    musicEngine.setLayer(layerForStep(step, musicSecondsLeft));
  }, [step, musicSecondsLeft]);
  useEffect(() => {
    musicEngine.duck(musicDuckFor(step, isSpeaking));
  }, [step, isSpeaking]);

  const handleSfxVolumeChange = useCallback((next: number) => {
    const v = clampVolume(next);
    setSfxVolume(v);
    soundEngine.setVolume(v);
    try { safeLocalStorage.setItem(SFX_VOLUME_STORAGE_KEY, String(v)); } catch {}
  }, []);

  useEffect(() => { 
    const loadVoices = () => { 
      if ('speechSynthesis' in window) { 
        setTtsVoices(window.speechSynthesis.getVoices().filter(v => v.name && v.lang)); 
      } 
    }; 
    if ('speechSynthesis' in window) { 
      loadVoices(); 
      window.speechSynthesis.onvoiceschanged = loadVoices; 
    } 
    return () => { 
      if ('speechSynthesis' in window) { 
        window.speechSynthesis.cancel(); 
        window.speechSynthesis.onvoiceschanged = null; 
      } 
    }; 
  }, []);
  
  useEffect(() => { 
    return () => { 
      if ('speechSynthesis' in window && window.speechSynthesis.speaking) { 
        window.speechSynthesis.cancel(); 
      } 
    } 
  }, [step]);

  const playSound = useCallback((sound: SoundEffect, ...args: any[]) => {
    if (isMuted || !audioReady) return;
    soundEngine.play(sound, ...args);
  }, [isMuted, audioReady]);

  // Package V9: the winner's ceremony. Entering game over plays "The vault opens", third place,
  // second place, then the winner with the fanfare and the coin shower, then the class result.
  // Calm mode, reduced motion and a game that was reloaded on the final screen skip to the end.
  const [ceremonyStage, setCeremonyStage] = useState<CeremonyStage>(CEREMONY_DONE);
  const ceremonyStageRef = useRef<CeremonyStage>(CEREMONY_DONE);
  const ceremonyTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const ceremonyPrevStepRef = useRef(step);
  const podiumSize = Math.min(3, players.length);
  const ceremonyCtxRef = useRef({ playSound, isCalmMode, podiumSize, everyoneBust: false });
  ceremonyCtxRef.current = { playSound, isCalmMode, podiumSize, everyoneBust: !winner && players.length > 0 && players.every(p => p.money <= 0) };
  const enterCeremonyStage = useCallback((stage: CeremonyStage) => {
    const ctx = ceremonyCtxRef.current;
    const cue = cueForStage(stage, ctx.podiumSize);
    if (cue === 'drumroll' && !ctx.isCalmMode) ctx.playSound('drumroll');
    if (cue === 'step' && !ctx.isCalmMode) ctx.playSound('chipClink', 100);
    if (cue === 'winner') {
      ctx.playSound('gameOver');
      setJackpotEvent({ id: `game-over-${Date.now()}`, intensity: 1 });
    }
    ceremonyStageRef.current = stage;
    setCeremonyStage(stage);
  }, []);
  const skipCeremony = useCallback(() => {
    ceremonyTimersRef.current.forEach(clearTimeout);
    ceremonyTimersRef.current = [];
    if (ceremonyStageRef.current < 3) enterCeremonyStage(3);
    enterCeremonyStage(CEREMONY_DONE);
  }, [enterCeremonyStage]);
  useEffect(() => {
    const cameFrom = ceremonyPrevStepRef.current;
    ceremonyPrevStepRef.current = step;
    if (step !== 'GAME_OVER' || cameFrom === 'GAME_OVER') return;
    const ctx = ceremonyCtxRef.current;
    const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (ctx.isCalmMode || reduced || ctx.everyoneBust || ctx.podiumSize === 0) {
      enterCeremonyStage(3);
      enterCeremonyStage(CEREMONY_DONE);
      return;
    }
    enterCeremonyStage(0);
    ceremonyTimersRef.current = ceremonyTimes(ctx.podiumSize).map((at, i) => setTimeout(() => enterCeremonyStage((i + 1) as CeremonyStage), at));
    return () => {
      ceremonyTimersRef.current.forEach(clearTimeout);
      ceremonyTimersRef.current = [];
      ceremonyPrevStepRef.current = cameFrom; // so a remount (React strict mode) starts it again
    };
  }, [step, enterCeremonyStage]);

  const handleToggleSettingsDeckExpanded = useCallback(() => {
    playSound('click');
    setIsSettingsDeckExpanded(prev => {
      const next = !prev;
      try {
        safeLocalStorage.setItem('grammar_casino_expand_settings_deck', String(next));
      } catch (e) {}
      return next;
    });
  }, [playSound]);

  useEffect(() => {
    if (error) {
      playSound('error');
    }
  }, [error, playSound]);

  const speakText = useCallback(async (text: string | null) => { 
    if (isMuted || !text || isSpeaking) return; 
    
    // Sanitize "_____" to "... blank ..." so TTS never reads "underscore underscore underscore"
    const sanitizedText = text.replace(/_{2,}/g, '... blank ...');

    playSound('click');
    setIsSpeaking(true);

    // Fallback using Browser TTS
    const fallbackSpeak = () => {
        if (!('speechSynthesis' in window)) {
            setIsSpeaking(false);
            return;
        }
        try {
            window.speechSynthesis.cancel(); 
            const utterance = new SpeechSynthesisUtterance(sanitizedText); 
            if (ttsVoices.length > 0) { 
              let preferredVoice = ttsVoices.find(v => v.lang === 'en-US' && !v.localService && v.name.includes('Google')) || 
                                   ttsVoices.find(v => v.lang === 'en-US' && !v.localService) || 
                                   ttsVoices.find(v => v.lang === 'en-US') || 
                                   ttsVoices.find(v => v.lang.startsWith('en-') && !v.localService) || 
                                   ttsVoices.find(v => v.lang.startsWith('en-')); 
              if (preferredVoice) utterance.voice = preferredVoice; 
            } 
            utterance.onend = () => setIsSpeaking(false);
            utterance.onerror = () => setIsSpeaking(false);
            window.speechSynthesis.speak(utterance); 
        } catch (e) {
            console.error("Browser TTS error:", e);
            setIsSpeaking(false);
        }
    };

    try {
        // Try Orpheus / AI TTS (used for both challenge sentences and grammar explanations)
        const base64Audio = await GeminiService.generateSpeech(sanitizedText, orpheusVoice);
        
        if (ttsAudioContext.state === 'suspended') {
            await ttsAudioContext.resume();
        }

        const audioBytes = base64ToBytes(base64Audio);
        const audioBuffer = pcmToAudioBuffer(audioBytes, ttsAudioContext);
        
        const source = ttsAudioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ttsAudioContext.destination);
        source.onended = () => setIsSpeaking(false);
        source.start();

    } catch (e) { 
      console.warn("AI TTS failed, falling back to browser TTS:", e); 
      fallbackSpeak();
    } 
  }, [isMuted, ttsVoices, isSpeaking, ttsAudioContext, orpheusVoice]);

  // Package G6: a listening hand reads its sentence aloud once, after the title card.
  const listenSpokenRoundRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isSentenceHiddenForListening || !currentSentence?.text || isLoading) return;
    if (listenSpokenRoundRef.current === currentRound) return;
    listenSpokenRoundRef.current = currentRound;
    const timer = setTimeout(() => speakText(currentSentence.text), isCalmMode ? 1900 : 2600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSentenceHiddenForListening, currentSentence?.text, currentRound, isLoading]);

  // --- Betting Turn Timer Helpers, Effects & Controls ---
  const isPlayerFrozen = useCallback((playerId: number): boolean => {
    const player = players.find(p => p.id === playerId);
    if (!player) return false;
    return isFrozenBySubZero(player, Object.values(activePowerUps).flat() as ActivePowerUp[]);
  }, [players, activePowerUps]);

  const seat3DStates = useMemo<Seat3DState[]>(() => {
    const totalSeats = Math.max(1, activePlayers.length);
    return activePlayers.map((p, idx) => {
      const pActive = (activePowerUps[p.id] || []) as ActivePowerUp[];
      const hasShield = hasShieldProtection(pActive);
      return {
        playerId: p.id,
        seatIndex: idx,
        totalSeats,
        hasShield,
        isFrozen: isPlayerFrozen(p.id),
        winStreak: p.winStreak,
      };
    });
  }, [activePlayers, activePowerUps, isPlayerFrozen]);

  const hasPlayerPlacedBet = useCallback((playerId: number): boolean => {
    const hasSplitBet = (activePowerUps[playerId] || []).some(pu => pu.type === 'SPLIT_BET');
    const qType: QuestionType = currentSentence?.questionType || 'binary';
    return isBetComplete(bets[playerId], qType, hasSplitBet, currentSentence?.baseWord, {
      requirePositiveAmount: true,
      strictSplitBaseWord: true,
      strictOpinion: true,
    });
  }, [bets, activePowerUps, currentSentence]);

  // System hold: pause any running timer while a popup/modal is open or a hint is loading
  const isTimerSystemHeld = useMemo(() => {
    const anyModalOpen = Boolean(
      error ||
      historyPlayer ||
      (!mpRoomCode && showPowerUpModal) ||
      showTargetModal ||
      showAvatarModal ||
      showWheelModal ||
      pendingLoadGame ||
      showReportCardModal ||
      showSettingsModal ||
      showDeckConfigModal ||
      showCloudModal ||
      isLoading ||
      isProcessing
    );
    const anyHintLoading = (Object.values(hints) as Hint[]).some(h => Boolean(h?.isLoading));
    return anyModalOpen || anyHintLoading || isPaused || Boolean(resumeOffer);
  }, [
    isPaused, resumeOffer,
    error, historyPlayer, mpRoomCode, showPowerUpModal, showTargetModal, showAvatarModal,
    showWheelModal, pendingLoadGame, showReportCardModal, showSettingsModal,
    showDeckConfigModal, showCloudModal, isLoading, isProcessing, hints
  ]);

  // --- Single-screen compact grid ---
  const effectiveTableLayout: 'grid' | 'cards' = tableLayoutPref;

  // Close the open betting card when a new hand starts or the screen changes.
  useEffect(() => {
    setOpenSeatPlayerId(null);
  }, [currentRound, step]);

  // With the turn timer on, open the card of whoever's turn it is.
  const activeTurnPlayerId = isTurnTimerEnabled && !mpRoomCode
    ? players.find(p => {
        const st = turnTimers[p.id]?.status;
        return st === 'running' || st === 'paused';
      })?.id ?? null
    : null;
  useEffect(() => {
    if (activeTurnPlayerId !== null) setOpenSeatPlayerId(activeTurnPlayerId);
  }, [activeTurnPlayerId]);

  // Bring the opened card into view below the compact sticky sentence.
  useEffect(() => {
    if (openSeatPlayerId === null) return;
    setIsSentenceHeaderStuck(true);
    const id = window.setTimeout(() => {
      const el = openSeatRef.current;
      if (!el) return;
      const bannerHeight = sentenceHeaderRef.current?.offsetHeight ?? 0;
      const rectTop = el.getBoundingClientRect().top;
      const desiredTop = STICKY_TOP_PX + bannerHeight + 16;
      if (rectTop < desiredTop - 8 || rectTop > window.innerHeight * 0.45) {
        const top = rectTop + window.scrollY - desiredTop;
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      }
    }, 60);
    return () => window.clearTimeout(id);
  }, [openSeatPlayerId]);

  // Handler-level enforcement: returns true only when the player is allowed to make bet/hint/power-up changes
  const canPlayerAct = useCallback((playerId: number): boolean => {
    const player = players.find(p => p.id === playerId);
    if (!player || player.money <= 0) return false;
    if (isPlayerFrozen(playerId)) return false;
    // In Multiplayer mode, all players act simultaneously until they lock in or the shared round timer expires
    // (When the round timer expires, all seats are automatically set to lockedIn = true, and only the teacher can unlock a seat)
    if (mpRoomCode) {
      if (mpSeats[playerId]) {
        if (mpSeats[playerId].lockedIn) return false;
        if (
          isTurnTimerEnabled &&
          mpRoundTimer.status === 'running' &&
          !mpRoundTimer.held &&
          mpRoundTimer.endsAt !== undefined &&
          Date.now() >= mpRoundTimer.endsAt
        ) {
          return false;
        }
        return true;
      }
      if (isTurnTimerEnabled && mpRoundTimer.status === 'locked') return false;
      return true;
    }
    if (!isTurnTimerEnabled) return true;
    const t = turnTimers[playerId];
    if (!t || t.status !== 'running') return false;
    if (!t.held && t.endsAt !== undefined && Date.now() >= t.endsAt) return false;
    return true;
  }, [players, isPlayerFrozen, mpRoomCode, mpSeats, isTurnTimerEnabled, mpRoundTimer, turnTimers]);

  // Helper to lock a player and optionally auto-advance to the next unfrozen idle player in sequence
  const lockPlayerAndMaybeAdvance = useCallback((
    prev: Record<number, PlayerTurnTimer>,
    lockedPlayerId: number,
    shouldAdvance: boolean
  ): Record<number, PlayerTurnTimer> => {
    const now = Date.now();
    const next: Record<number, PlayerTurnTimer> = {
      ...prev,
      [lockedPlayerId]: {
        status: 'locked',
        remainingMs: 0,
        held: false,
        endsAt: undefined,
        skipped: prev[lockedPlayerId]?.skipped || isPlayerFrozen(lockedPlayerId),
      },
    };

    // Ensure all frozen active players are marked skipped & locked
    activePlayers.forEach(p => {
      if (isPlayerFrozen(p.id) && next[p.id]?.status !== 'locked') {
        next[p.id] = { status: 'locked', remainingMs: 0, skipped: true };
      }
    });

    if (shouldAdvance) {
      const anyOtherActiveTurn = activePlayers.some(p => {
        if (p.id === lockedPlayerId) return false;
        const st = next[p.id]?.status;
        return st === 'running' || st === 'paused';
      });
      if (!anyOtherActiveTurn) {
        const startIdx = activePlayers.findIndex(p => p.id === lockedPlayerId);
        const ordered = startIdx >= 0
          ? [...activePlayers.slice(startIdx + 1), ...activePlayers.slice(0, startIdx)]
          : activePlayers;
        const nextCandidate = ordered.find(p => {
          if (isPlayerFrozen(p.id)) return false;
          const st = next[p.id]?.status ?? 'idle';
          return st === 'idle';
        });
        if (nextCandidate) {
          next[nextCandidate.id] = isTimerSystemHeld
            ? { status: 'running', held: true, remainingMs: turnDurationMs }
            : { status: 'running', held: false, endsAt: now + turnDurationMs, remainingMs: turnDurationMs };
        }
      }
    }
    return next;
  }, [activePlayers, isPlayerFrozen, isTimerSystemHeld, turnDurationMs]);

  // Automatically skip & lock frozen players (Deep Freeze / Sub-Zero), and chain if they were mid-turn (Single-screen mode only)
  useEffect(() => {
    if (!isTurnTimerEnabled || Boolean(mpRoomCode) || step !== 'IN_GAME') return;
    setTurnTimers(prev => {
      let changed = false;
      let next = { ...prev };
      activePlayers.forEach(p => {
        if (isPlayerFrozen(p.id)) {
          const cur = next[p.id];
          if (!cur || cur.status !== 'locked' || !cur.skipped) {
            const wasRunning = cur?.status === 'running';
            next[p.id] = { status: 'locked', remainingMs: 0, skipped: true };
            if (wasRunning && autoStartNextTimer) {
              next = lockPlayerAndMaybeAdvance(next, p.id, true);
            }
            changed = true;
          }
        }
      });
      return changed ? next : prev;
    });
  }, [isTurnTimerEnabled, mpRoomCode, step, activePlayers, isPlayerFrozen, autoStartNextTimer, lockPlayerAndMaybeAdvance]);

  // Auto-hold running timers while any modal/popup is open or a hint is loading, and resume afterwards (Single-screen mode only)
  useEffect(() => {
    if (!isTurnTimerEnabled || Boolean(mpRoomCode) || step !== 'IN_GAME') return;
    const now = Date.now();
    setTurnTimers(prev => {
      let changed = false;
      const next = { ...prev };
      Object.keys(next).forEach(k => {
        const id = Number(k);
        const t = next[id];
        if (!t || t.status !== 'running') return;
        if (isTimerSystemHeld && !t.held) {
          const rem = t.endsAt !== undefined ? Math.max(0, t.endsAt - now) : (t.remainingMs ?? turnDurationMs);
          next[id] = { ...t, held: true, remainingMs: rem, endsAt: undefined };
          changed = true;
        } else if (!isTimerSystemHeld && t.held) {
          const rem = Math.max(0, t.remainingMs ?? turnDurationMs);
          next[id] = { ...t, held: false, endsAt: now + rem, remainingMs: rem };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [isTimerSystemHeld, isTurnTimerEnabled, mpRoomCode, step, turnDurationMs]);

  // Watch the active running timer's absolute `endsAt` deadline and lock when time runs out (Single-screen mode only)
  useEffect(() => {
    if (!isTurnTimerEnabled || Boolean(mpRoomCode) || step !== 'IN_GAME') return;
    const runningEntry = (Object.entries(turnTimers) as [string, PlayerTurnTimer][]).find(
      ([, t]) => t?.status === 'running' && !t.held && t.endsAt !== undefined
    );
    if (!runningEntry) return;
    const [idStr, timer] = runningEntry;
    const runningId = Number(idStr);
    const endsAt = timer.endsAt!;

    const checkExpiry = () => {
      if (Date.now() >= endsAt) {
        playSound('timeUp');
        setTurnTimers(prev => {
          const cur = prev[runningId];
          if (!cur || cur.status !== 'running' || cur.held) return prev;
          return lockPlayerAndMaybeAdvance(prev, runningId, autoStartNextTimer);
        });
      }
    };

    const delay = Math.max(0, endsAt - Date.now());
    const timeoutId = window.setTimeout(checkExpiry, delay + 15);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkExpiry();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isTurnTimerEnabled, step, turnTimers, autoStartNextTimer, lockPlayerAndMaybeAdvance, playSound]);

  const handleTimerStart = useCallback((playerId: number) => {
    if (!isTurnTimerEnabled) return;
    if (isPlayerFrozen(playerId)) {
      setTurnTimers(prev => ({ ...prev, [playerId]: { status: 'locked', remainingMs: 0, skipped: true } }));
      return;
    }
    playSound('click');
    const now = Date.now();
    setTurnTimers(prev => {
      // Enforce one timer at a time per player
      const otherActive = activePlayers.find(p => {
        if (p.id === playerId) return false;
        const st = prev[p.id]?.status;
        return st === 'running' || st === 'paused';
      });
      if (otherActive) return prev;

      const cur = prev[playerId];
      const rem = cur?.status === 'paused' && cur.remainingMs && cur.remainingMs > 0
        ? cur.remainingMs
        : turnDurationMs;
      return {
        ...prev,
        [playerId]: isTimerSystemHeld
          ? { status: 'running', held: true, remainingMs: rem }
          : { status: 'running', held: false, endsAt: now + rem, remainingMs: rem },
      };
    });
  }, [isTurnTimerEnabled, isPlayerFrozen, playSound, activePlayers, turnDurationMs, isTimerSystemHeld]);

  const handleTimerPause = useCallback((playerId: number) => {
    if (!isTurnTimerEnabled) return;
    playSound('click');
    const now = Date.now();
    setTurnTimers(prev => {
      const cur = prev[playerId];
      if (!cur || cur.status !== 'running') return prev;
      const rem = getTimerRemainingMs(cur, turnDurationMs, now);
      return {
        ...prev,
        [playerId]: { status: 'paused', remainingMs: rem, held: false, endsAt: undefined },
      };
    });
  }, [isTurnTimerEnabled, playSound, turnDurationMs]);

  const handleTimerAddTime = useCallback((playerId: number) => {
    if (!isTurnTimerEnabled) return;
    playSound('click');
    const now = Date.now();
    setTurnTimers(prev => {
      const cur = prev[playerId];
      if (!cur || (cur.status !== 'running' && cur.status !== 'paused')) return prev;
      const rem = getTimerRemainingMs(cur, turnDurationMs, now) + TURN_TIMER_BONUS_MS;
      if (cur.status === 'running' && !cur.held) {
        return {
          ...prev,
          [playerId]: { ...cur, endsAt: now + rem, remainingMs: rem },
        };
      }
      return {
        ...prev,
        [playerId]: { ...cur, remainingMs: rem },
      };
    });
  }, [isTurnTimerEnabled, playSound, turnDurationMs]);

  const handleTimerLockNow = useCallback((playerId: number) => {
    if (!isTurnTimerEnabled) return;
    playSound('timeUp');
    setTurnTimers(prev => lockPlayerAndMaybeAdvance(prev, playerId, autoStartNextTimer));
  }, [isTurnTimerEnabled, playSound, lockPlayerAndMaybeAdvance, autoStartNextTimer]);

  const handleTimerUnlock = useCallback((playerId: number) => {
    if (!isTurnTimerEnabled || isPlayerFrozen(playerId)) return;
    playSound('click');
    const now = Date.now();
    setTurnTimers(prev => {
      const next = { ...prev };
      // Pause any currently running player so only one timer runs at a time
      Object.keys(next).forEach(k => {
        const id = Number(k);
        if (id !== playerId && next[id]?.status === 'running') {
          const rem = getTimerRemainingMs(next[id], turnDurationMs, now);
          next[id] = { status: 'paused', remainingMs: rem, held: false, endsAt: undefined };
        }
      });
      const prevRem = next[playerId]?.remainingMs ?? 0;
      const grantMs = prevRem >= 15_000 ? prevRem : Math.min(turnDurationMs, Math.max(30_000, TURN_TIMER_BONUS_MS * 2));
      next[playerId] = isTimerSystemHeld
        ? { status: 'running', held: true, remainingMs: grantMs }
        : { status: 'running', held: false, endsAt: now + grantMs, remainingMs: grantMs };
      return next;
    });
  }, [isTurnTimerEnabled, isPlayerFrozen, playSound, turnDurationMs, isTimerSystemHeld]);

  // --- Shared Multiplayer Round Timer Effects & Controls ---
  // Auto-start the shared round timer when a new hand is revealed in Multiplayer mode (if Auto-Start is ON)
  useEffect(() => {
    if (!mpRoomCode || !isTurnTimerEnabled || step !== 'IN_GAME') return;
    if (!isSentenceRevealed || isLoading || !autoStartNextTimer) return;
    if (mpAutoStartedRoundRef.current === currentRound) return;
    mpAutoStartedRoundRef.current = currentRound;
    const now = Date.now();
    setMpRoundTimer(prev => {
      if (prev.status !== 'idle') return prev;
      return isTimerSystemHeld
        ? { status: 'running', held: true, remainingMs: turnDurationMs }
        : { status: 'running', held: false, endsAt: now + turnDurationMs, remainingMs: turnDurationMs };
    });
  }, [mpRoomCode, isTurnTimerEnabled, step, isSentenceRevealed, isLoading, autoStartNextTimer, currentRound, isTimerSystemHeld, turnDurationMs]);

  // Auto-hold & resume the shared Multiplayer round timer when a modal or hint is loading
  useEffect(() => {
    if (!mpRoomCode || !isTurnTimerEnabled || step !== 'IN_GAME') return;
    const now = Date.now();
    setMpRoundTimer(prev => {
      if (prev.status !== 'running') return prev;
      if (isTimerSystemHeld && !prev.held) {
        const rem = prev.endsAt !== undefined ? Math.max(0, prev.endsAt - now) : (prev.remainingMs ?? turnDurationMs);
        return { ...prev, held: true, remainingMs: rem, endsAt: undefined };
      }
      if (!isTimerSystemHeld && prev.held) {
        const rem = Math.max(0, prev.remainingMs ?? turnDurationMs);
        return { ...prev, held: false, endsAt: now + rem, remainingMs: rem };
      }
      return prev;
    });
  }, [mpRoomCode, isTurnTimerEnabled, step, isTimerSystemHeld, turnDurationMs]);

  // Watch the shared Multiplayer round timer's `endsAt` deadline and lock all seats when time expires
  useEffect(() => {
    if (!mpRoomCode || !isTurnTimerEnabled || step !== 'IN_GAME') return;
    if (mpRoundTimer.status !== 'running' || mpRoundTimer.held || mpRoundTimer.endsAt === undefined) return;
    // Package R3: the teacher's screen decides when time is up, and bets that arrive up to
    // 1.5 s after the deadline (slow Wi-Fi) still count.
    const endsAt = mpRoundTimer.endsAt + LATE_BET_GRACE_MS;

    const checkExpiry = () => {
      if (Date.now() >= endsAt) {
        playSound('timeUp');
        mpTimerAutoPausedByAllLockedRef.current = false;
        setMpRoundTimer({ status: 'locked', remainingMs: 0, held: false, endsAt: undefined });
        setTeacherRevealOverride(true);
        setMpSeats(prev => {
          const next: Record<number, MultiplayerSeat> = {};
          (Object.entries(prev) as [string, MultiplayerSeat][]).forEach(([k, seat]) => {
            next[Number(k)] = { ...seat, lockedIn: true };
          });
          return next;
        });
      }
    };

    const delay = Math.max(0, endsAt - Date.now());
    const timeoutId = window.setTimeout(checkExpiry, delay + 15);
    const intervalId = window.setInterval(checkExpiry, 250);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkExpiry();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [mpRoomCode, isTurnTimerEnabled, step, mpRoundTimer, playSound]);

  const handleMpRoundTimerStart = useCallback(() => {
    if (!isTurnTimerEnabled) return;
    playSound('click');
    mpTimerAutoPausedByAllLockedRef.current = false;
    const now = Date.now();
    setMpRoundTimer(prev => {
      const rem = prev.status === 'paused' && prev.remainingMs && prev.remainingMs > 0
        ? prev.remainingMs
        : turnDurationMs;
      return isTimerSystemHeld
        ? { status: 'running', held: true, remainingMs: rem }
        : { status: 'running', held: false, endsAt: now + rem, remainingMs: rem };
    });
  }, [isTurnTimerEnabled, playSound, turnDurationMs, isTimerSystemHeld]);

  const handleMpRoundTimerPause = useCallback(() => {
    if (!isTurnTimerEnabled) return;
    playSound('click');
    mpTimerAutoPausedByAllLockedRef.current = false;
    const now = Date.now();
    setMpRoundTimer(prev => {
      if (prev.status !== 'running') return prev;
      const rem = getTimerRemainingMs(prev, turnDurationMs, now);
      return { status: 'paused', remainingMs: rem, held: false, endsAt: undefined };
    });
  }, [isTurnTimerEnabled, playSound, turnDurationMs]);

  const handleMpRoundTimerAddTime = useCallback(() => {
    if (!isTurnTimerEnabled) return;
    playSound('click');
    mpTimerAutoPausedByAllLockedRef.current = false;
    const now = Date.now();
    setTeacherRevealOverride(false);
    setMpRoundTimer(prev => {
      if (prev.status === 'locked') {
        const rem = TURN_TIMER_BONUS_MS;
        return isTimerSystemHeld
          ? { status: 'running', held: true, remainingMs: rem }
          : { status: 'running', held: false, endsAt: now + rem, remainingMs: rem };
      }
      if (prev.status !== 'running' && prev.status !== 'paused') return prev;
      const rem = getTimerRemainingMs(prev, turnDurationMs, now) + TURN_TIMER_BONUS_MS;
      if (prev.status === 'running' && !prev.held) {
        return { ...prev, endsAt: now + rem, remainingMs: rem };
      }
      return { ...prev, remainingMs: rem };
    });
    if (mpRoundTimer.status === 'locked') {
      setMpSeats(prev => {
        const next: Record<number, MultiplayerSeat> = {};
        (Object.entries(prev) as [string, MultiplayerSeat][]).forEach(([k, seat]) => {
          next[Number(k)] = { ...seat, lockedIn: false };
        });
        return next;
      });
    }
  }, [isTurnTimerEnabled, playSound, turnDurationMs, isTimerSystemHeld, mpRoundTimer.status]);

  const handleMpRoundTimerLockNow = useCallback(() => {
    if (!isTurnTimerEnabled) return;
    playSound('timeUp');
    mpTimerAutoPausedByAllLockedRef.current = false;
    setMpRoundTimer({ status: 'locked', remainingMs: 0, held: false, endsAt: undefined });
    setTeacherRevealOverride(true);
    setMpSeats(prev => {
      const next: Record<number, MultiplayerSeat> = {};
      (Object.entries(prev) as [string, MultiplayerSeat][]).forEach(([k, seat]) => {
        next[Number(k)] = { ...seat, lockedIn: true };
      });
      return next;
    });
  }, [isTurnTimerEnabled, playSound]);

  const handleMpRoundTimerReset = useCallback(() => {
    if (!isTurnTimerEnabled) return;
    playSound('click');
    mpTimerAutoPausedByAllLockedRef.current = false;
    const now = Date.now();
    setTeacherRevealOverride(false);
    setMpSeats(prev => {
      const next: Record<number, MultiplayerSeat> = {};
      (Object.entries(prev) as [string, MultiplayerSeat][]).forEach(([k, seat]) => {
        next[Number(k)] = { ...seat, lockedIn: false };
      });
      return next;
    });
    setMpRoundTimer(
      isTimerSystemHeld
        ? { status: 'running', held: true, remainingMs: turnDurationMs }
        : { status: 'running', held: false, endsAt: now + turnDurationMs, remainingMs: turnDurationMs }
    );
  }, [isTurnTimerEnabled, playSound, isTimerSystemHeld, turnDurationMs]);

  const handleMpUnlockPlayer = useCallback((playerId: number) => {
    playSound('click');
    setMpSeats(prev => {
      if (!prev[playerId]) return prev;
      return {
        ...prev,
        [playerId]: { ...prev[playerId], lockedIn: false },
      };
    });
  }, [playSound]);

  // Save game state. Package F6 (part): at most one write a second while bets are typed, at once
  // when the screen changes, and on leaving the page, instead of a full write on every keystroke.
  const pendingSaveRef = useRef<Record<string, unknown> | null>(null);
  const lastSavedStepRef = useRef<string | null>(null);
  const flushSave = useCallback(() => {
    const gameState = pendingSaveRef.current;
    if (!gameState) return;
    pendingSaveRef.current = null;
    try {
      if (!safeLocalStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stampSave(gameState, Date.now())))) {
        console.warn('The browser would not save the game, so it is kept for this tab only.');
      }
      GeminiService.savePortableGame(gameState);
    } catch (e) {
      console.error("Failed to save game state:", e);
    }
  }, []);
  useEffect(() => { 
    if (isDemoRef.current) return;
    pendingSaveRef.current = { 
      step, players, settings, nextRoundSettings, customTopic, customTheme, gameMode, totalRounds, targetAmount,
      currentRound, currentSentence, pastSentences, pastMistakes, bets, hints, roundResults, winner,
      powerUpsUsedThisRound, activePowerUps, highlightedPhrase, availablePowerUps, selectedPowerUps, roundSpending,
      sentenceBatch, roundHistory, startingCash, turnTimerSeconds, turnTimers, teacherRevealOverride, autoStartNextTimer
    };
    if (lastSavedStepRef.current !== step) {
      lastSavedStepRef.current = step;
      flushSave();
      return;
    }
    const timer = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [step, players, settings, nextRoundSettings, customTopic, customTheme, gameMode, totalRounds, targetAmount, currentRound, currentSentence, pastSentences, pastMistakes, bets, hints, roundResults, winner, powerUpsUsedThisRound, activePowerUps, highlightedPhrase, availablePowerUps, selectedPowerUps, roundSpending, sentenceBatch, roundHistory, startingCash, turnTimerSeconds, turnTimers, teacherRevealOverride, autoStartNextTimer, flushSave]);
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flushSave();
    };
    window.addEventListener('pagehide', flushSave);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('pagehide', flushSave);
      document.removeEventListener('visibilitychange', onHidden);
      flushSave();
    };
  }, [flushSave]);

  // Sticky header logic: smoothly compact into an opaque bar when scrolling down
  useEffect(() => {
    if (step !== 'IN_GAME') {
      setIsSentenceHeaderStuck(false);
      return;
    }

    const handleScroll = () => {
      const y = window.scrollY;
      setIsSentenceHeaderStuck(prev => {
        if (openSeatPlayerId !== null) return true;
        if (y <= 12) return false;
        if (y > 44) {
          const scrollableSpace = document.documentElement.scrollHeight - window.innerHeight;
          if (effectiveTableLayout === 'cards' || scrollableSpace > 180) {
            return true;
          }
        }
        return prev;
      });
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [step, openSeatPlayerId, effectiveTableLayout]); 

  // Scroll to top when betting screen loads
  useEffect(() => {
    if (step === 'IN_GAME' || step === 'RESULTS') {
      setIsSentenceHeaderStuck(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [step, currentRound]);

  // ... (handlers remain largely the same, logic is preserved)
  const handleSaveStartingCash = useCallback(() => {
    setIsEditingStartingCash(false);
    const parsed = parseInt(tempStartingCash, 10);
    if (!isNaN(parsed) && parsed > 0) {
      setStartingCash(parsed);
      setPlayers(prev => prev.map(p => ({ ...p, money: parsed })));
      playSound('click');
    } else {
      setTempStartingCash(String(startingCash));
    }
  }, [tempStartingCash, startingCash, playSound]);

  const handleAddPlayer = () => { 
    if (newPlayerName.trim()) { 
      playSound('addPlayer'); 
      setPlayers(prev => {
        const randomAvatar = getRandomCharacterAvatar(prev.map(p => p.avatar));
        return [...prev, { 
          id: Date.now(), 
          name: safePlayerName(newPlayerName, prev.map(p => p.name)), 
          money: startingCash, 
          history: [], 
          avatar: randomAvatar, 
          winStreak: 0,
          effects: []
        }];
      }); 
      setNewPlayerName(''); 
      playerNameInputRef.current?.focus(); 
    } 
  };
  // Package T2: removing a player on this screen can be undone for 5 seconds.
  const [removedPlayer, setRemovedPlayer] = useState<{ player: Player; index: number } | null>(null);
  const handleDeletePlayer = (idToDelete: number) => { 
    playSound('lose', 0); 
    const index = players.findIndex(p => p.id === idToDelete);
    if (index !== -1) setRemovedPlayer({ player: players[index], index });
    setPlayers(prev => prev.filter(p => p.id !== idToDelete)); 
  };
  const undoRemovePlayer = () => {
    if (!removedPlayer) return;
    playSound('addPlayer');
    const { player, index } = removedPlayer;
    setPlayers(prev => (prev.some(p => p.id === player.id) ? prev : [...prev.slice(0, index), player, ...prev.slice(index)]));
    setRemovedPlayer(null);
  };
  useEffect(() => {
    if (!removedPlayer) return;
    const timer = setTimeout(() => setRemovedPlayer(null), REMOVE_UNDO_MS);
    return () => clearTimeout(timer);
  }, [removedPlayer]);
  const handleUpdateAvatar = (playerId: number, newAvatar: string) => {
    setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, avatar: newAvatar } : p));
  };
  const handleOpenAvatarModal = useCallback((playerId: number) => {
    playSound('click');
    setShowAvatarModal({ playerId });
  }, [playSound]);
  const handleUpdatePlayerName = useCallback((playerId: number, newName: string) => {
    if (!sanitizePlayerName(newName)) return;
    setPlayers(prev => {
      const trimmed = safePlayerName(newName, prev.filter(p => p.id !== playerId).map(p => p.name));
      const oldPlayer = prev.find(p => p.id === playerId);
      const oldName = oldPlayer?.name;
      const updated = prev.map(p => p.id === playerId ? { ...p, name: trimmed } : p);
      if (oldName && oldName !== trimmed) {
        setRoundResults(curr => curr.map(r => r.name === oldName ? { ...r, name: trimmed } : r));
      }
      return updated;
    });
    playSound('click');
  }, [playSound]);
  const handlePlayerNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (newPlayerName.trim()) {
        handleAddPlayer();
      } else if (players.length > 0) {
        handleStartGame();
      }
    }
  };
  const [settingsPart, setSettingsPart] = useState<1 | 2>(1);
  // Package A4: screen changes go to the debug log.
  useEffect(() => {
    logEvent('step', step === 'SETTINGS' ? `Screen: SETTINGS part ${settingsPart}` : `Screen: ${step}`);
    if (step === 'GAME_OVER') {
      // Package A3: what this game cost in Firestore operations (this device's share).
      const used = takeGameUsage();
      const day = firestoreUsageToday();
      if (used.reads || used.writes) logEvent('perf', `Firestore this game: ${used.reads} reads, ${used.writes} writes (today on this device: ${day.reads} reads, ${day.writes} writes)`);
    }
  }, [step, settingsPart]);
  useEffect(() => {
    logEvent('room', mpRoomCode ? `Live room ${mpRoomCode} open` : 'No live room');
  }, [mpRoomCode]);
  useEffect(() => {
    logEvent('step', `Hand ${currentRound}`);
  }, [currentRound]);

  // Package T1: the last game's settings are on this computer, so "Quick start" can deal at once.
  const hasSetupPrefs = useMemo(() => step === 'PLAYER_SETUP' && Boolean(safeLocalStorage.getItem(SETUP_PREFS_KEY)), [step]);
  const quickStartSummary = [
    settings.level,
    settings.challengeFormat === 'mixed' ? 'Mixed' : questionTypeLabel(settings.challengeFormat),
    gameMode === 'rounds' ? `${totalRounds} hand${Number(totalRounds) === 1 ? '' : 's'}` : gameMode === 'targetAmount' ? `first to $${Number(targetAmount).toLocaleString()}` : 'last player standing',
    `$${Number(startingCash).toLocaleString()} each`,
  ].filter(Boolean).join(' · ');

  const handleStartGame = () => { 
    if (players.length > 0) { 
      playSound('startGame'); 
      setSettingsPart(1);
      setStep('SETTINGS'); 
    } else { 
      setError({ title: "No Players!", message: "Please add at least one player to start the game." }); 
    } 
  };

  const handleAdvanceToSettingsPart2 = useCallback(() => {
    const finalTopic = settings.topic === "My own choice" ? customTopic.trim() : settings.topic;
    let finalTheme = settings.theme;

    if (!finalTopic || !settings.level || !finalTheme) {
      setError({ title: "Incomplete Setup", message: "Please choose a topic, level, and theme." });
      return;
    }
    if (settings.topic === "My own choice" && !finalTopic) {
      setError({ title: "Incomplete Setup", message: "Please enter your custom topic." });
      return;
    }
    if (settings.theme === "Custom ✍️") {
      if (!customTheme.trim()) {
        setError({ title: "Incomplete Setup", message: "Please enter your custom theme." });
        return;
      }
      finalTheme = customTheme.trim();
    }

    playSound('click');
    setSettingsPart(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [settings, customTopic, customTheme, playSound]);
  
  const prefetchRef = useRef<{
    key: string;
    promise: Promise<{
      generated: GeneratedSentence;
      subtype: string | null;
      allSubtypesLen: number;
      resolvedQuestionType: QuestionType;
      forceCorrect: boolean;
      remainingBatch: boolean[];
    }>;
  } | null>(null);

  // Background pre-fetch:
  // 1) On SETTINGS Part 2 (pre-fetches Round 1 as soon as Topic, Level, Theme & Format are locked in)
  // 2) In IN_GAME as soon as currentSentence is shown (pre-fetches Round N+1 while players place bets, unless on the final round)
  // 3) On RESULTS screen (fallback or if teacher changes nextRoundSettings on Results screen, unless on the final round)
  useEffect(() => {
    const isSettingsPart2 = step === 'SETTINGS' && settingsPart === 2;
    const isInGameWithSentence = step === 'IN_GAME' && Boolean(currentSentence) && !isLoading;
    const isResults = step === 'RESULTS';
    if (!isSettingsPart2 && !isInGameWithSentence && !isResults) return;

    // Skip pre-fetching if we are in Fixed Rounds mode and already on the final round
    if (!isSettingsPart2) {
      const numTotalRounds = typeof totalRounds === 'string' ? parseInt(totalRounds, 10) : totalRounds;
      if (gameMode === 'rounds' && !isNaN(numTotalRounds) && currentRound >= numTotalRounds) {
        return;
      }
    }

    let targetSettings: Settings;
    if (isSettingsPart2) {
      const resolvedTopic = settings.topic === "My own choice" ? customTopic.trim() : settings.topic;
      const resolvedTheme = settings.theme === "Custom ✍️" ? customTheme.trim() : settings.theme;
      if (!resolvedTopic || !settings.level || !resolvedTheme) return;
      targetSettings = {
        topic: resolvedTopic,
        level: settings.level,
        theme: resolvedTheme,
        challengeFormat: settings.challengeFormat || 'binary',
        mixedFormats: getEffectiveMixedFormats(settings.mixedFormats),
      };
    } else {
      const candidate = nextRoundSettings || settings;
      if (!candidate?.topic || !candidate?.level || !candidate?.theme) return;
      targetSettings = candidate;
    }

    const activeMixedSubsetKey = (targetSettings.challengeFormat || 'binary') === 'mixed'
      ? getEffectiveMixedFormats(targetSettings.mixedFormats).join(',')
      : '';
    const settingsKey = `${targetSettings.topic}|${targetSettings.level}|${targetSettings.theme}|${targetSettings.challengeFormat || 'binary'}|${activeMixedSubsetKey}|${pastSentences.length}`;
    if (prefetchRef.current?.key === settingsKey) return;

    const triggerPrefetch = () => {
      if (prefetchRef.current?.key === settingsKey) return;

      const formatSetting: ChallengeFormat = targetSettings.challengeFormat || 'binary';
      const rotationOrder: QuestionType[] = getEffectiveMixedFormats(targetSettings.mixedFormats);
      const formatIdx = isSettingsPart2 ? 0 : mixedFormatIndexRef.current;
      const resolvedQuestionType: QuestionType = formatSetting === 'mixed'
        ? rotationOrder[formatIdx % rotationOrder.length]
        : formatSetting;

      const currentBatch = (!isSettingsPart2 && sentenceBatch.length > 0) ? sentenceBatch : newBatch();
      const forceCorrect = resolvedQuestionType === 'binary' ? currentBatch[0] : true;
      const remainingBatch = currentBatch.slice(1);

      const topicKey = targetSettings.topic;
      const allSubtypes = getSubtypesForTopic(topicKey, targetSettings.level);
      const activeUsedSubtypes = isSettingsPart2 ? [] : usedSubtypes;
      const available = allSubtypes.filter(s => !activeUsedSubtypes.includes(s));
      const pool = available.length > 0 ? available : allSubtypes;
      const dueLook = isSettingsPart2 ? undefined : secondLookFor(secondLookQueueRef.current, currentRoundRef.current + 1);
      const subtype = dueLook ? dueLook.subtype : pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : null;

      const promise = GeminiService.generateSentence(
        targetSettings,
        pastSentences,
        forceCorrect,
        subtype,
        pastMistakes,
        resolvedQuestionType
      ).then(generated => ({
        generated,
        subtype,
        allSubtypesLen: allSubtypes.length,
        resolvedQuestionType,
        forceCorrect,
        remainingBatch,
      }));

      promise.catch(() => {});

      prefetchRef.current = {
        key: settingsKey,
        promise,
      };
    };

    // In IN_GAME, wait 600ms after sentence appears so the card flip animation and any immediate TTS click get priority
    if (isInGameWithSentence) {
      const timer = setTimeout(triggerPrefetch, 600);
      return () => clearTimeout(timer);
    }

    triggerPrefetch();
  }, [step, settingsPart, currentSentence, isLoading, gameMode, totalRounds, currentRound, nextRoundSettings, settings, customTopic, customTheme, pastSentences, pastMistakes, sentenceBatch, usedSubtypes]);

  const fetchNewSentence = useCallback(async (currentSettings: Settings, history: string[], forcedBatch?: boolean[], mistakeHistory?: string[]) => {
    setIsLoading(true);
    setCurrentSentence(null);
    setHighlightedPhrase(null);
    setIsCopied(false);
    setIsSentenceRevealed(false);
    const targetRound = fetchTargetRoundRef.current ?? currentRoundRef.current + 1;
    fetchTargetRoundRef.current = null;
    try {
        if (!currentSettings || !currentSettings.theme || !currentSettings.level || !currentSettings.topic) {
            throw new Error("Invalid settings provided to fetch a new sentence.");
        }
        const formatSetting: ChallengeFormat = currentSettings.challengeFormat || 'binary';
        const expectedMixedSubsetKey = formatSetting === 'mixed'
          ? getEffectiveMixedFormats(currentSettings.mixedFormats).join(',')
          : '';
        const expectedKey = `${currentSettings.topic}|${currentSettings.level}|${currentSettings.theme}|${formatSetting}|${expectedMixedSubsetKey}|${history.length}`;

        let generated: GeneratedSentence | null = null;
        let subtype: string | null = null;
        let allSubtypesLen = 0;
        let resolvedQuestionType: QuestionType = 'binary';
        let forceCorrect = true;

        // Package G6 Fix it: that hand is always a flawed Valid-or-flawed sentence, made fresh.
        const isFixItHand = fixItRoundRef.current === targetRound;
        if (!forcedBatch && !isFixItHand && prefetchRef.current?.key === expectedKey) {
          const activePrefetch = prefetchRef.current;
          prefetchRef.current = null;
          try {
            const prefetched = await activePrefetch.promise;
            generated = prefetched.generated;
            subtype = prefetched.subtype;
            allSubtypesLen = prefetched.allSubtypesLen;
            resolvedQuestionType = prefetched.resolvedQuestionType;
            forceCorrect = prefetched.forceCorrect;
            if (formatSetting === 'mixed') {
              mixedFormatIndexRef.current += 1;
            }
            if (resolvedQuestionType === 'binary') {
              setSentenceBatch(prefetched.remainingBatch);
            }
          } catch {
            generated = null;
          }
        }

        if (!generated) {
          const rotationOrder: QuestionType[] = getEffectiveMixedFormats(currentSettings.mixedFormats);
          resolvedQuestionType = isFixItHand
            ? 'binary'
            : formatSetting === 'mixed'
              ? rotationOrder[(mixedFormatIndexRef.current++) % rotationOrder.length]
              : formatSetting;

          const currentBatch = forcedBatch || (sentenceBatch.length > 0 ? sentenceBatch : newBatch());
          forceCorrect = isFixItHand ? false : resolvedQuestionType === 'binary' ? currentBatch[0] : true;
          if (resolvedQuestionType === 'binary' && !isFixItHand) {
            setSentenceBatch(currentBatch.slice(1));
          }

          const topicKey = currentSettings.topic;
          const allSubtypes = getSubtypesForTopic(topicKey, currentSettings.level);
          allSubtypesLen = allSubtypes.length;
          const available = allSubtypes.filter(s => !usedSubtypes.includes(s));
          const pool = available.length > 0 ? available : allSubtypes;
          const dueLook = secondLookFor(secondLookQueueRef.current, targetRound);
          // Package G6 Spotlight: the point the class has missed most so far.
          const spotlight = spotlightRoundRef.current === targetRound ? mostMissedPoint(missTallyRef.current, allSubtypes) : null;
          subtype = dueLook ? dueLook.subtype : spotlight ? spotlight : pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : null;

          const effectiveMistakes = mistakeHistory !== undefined ? mistakeHistory : pastMistakes;
          generated = await GeminiService.generateSentence(
            currentSettings, 
            history, 
            forceCorrect, 
            subtype,
            effectiveMistakes,
            resolvedQuestionType
          );
        }
        
        handSubtypeRef.current = subtype;
        {
          const due = secondLookFor(secondLookQueueRef.current, targetRound);
          setSecondLookRound(due && subtype === due.subtype ? targetRound : null);
        }
        if (subtype) {
          setUsedSubtypes(prev => {
            const next = [...prev, subtype!];
            return allSubtypesLen > 0 && next.length >= allSubtypesLen ? [] : next;
          });
        }

        // Never repeat mistakes, key words, target verbs/phrases, or structures across ANY question type
        const targetParts: string[] = [];
        if (generated.baseWord) {
          targetParts.push(`keyWord: ${generated.baseWord.trim()}`);
        }
        const coreTarget = (
          generated.correctAnswer ||
          generated.errorPhrase ||
          generated.grammarPhrase ||
          ''
        ).trim();
        if (coreTarget) {
          targetParts.push(coreTarget);
        }
        if (
          generated.grammarPhrase &&
          generated.grammarPhrase.trim() &&
          generated.grammarPhrase.trim().toLowerCase() !== coreTarget.toLowerCase()
        ) {
          targetParts.push(`phrase: "${generated.grammarPhrase.trim()}"`);
        }
        const structureTag = (generated.mistakeType || subtype || '').trim();
        if (structureTag) {
          targetParts.push(`focus: ${structureTag}`);
        }
        if (targetParts.length > 0) {
          const descriptor = targetParts.join(' | ');
          setPastMistakes(prev => {
            const lower = descriptor.toLowerCase();
            return prev.some(p => p.toLowerCase() === lower) ? prev : [...prev, descriptor];
          });
        }

        setCurrentSentence(generated);
        const sentenceRecord = sentenceRecordOf(generated);
        setPastSentences(prev => [...prev, sentenceRecord]);
        // Small delay to allow initial card render before flip
        later(() => {
            setIsSentenceRevealed(true);
            playSound('flip');
        }, 300);
    } catch (err: any) {
      console.error(err);
      setError({ title: "Sentence Generation Error", message: err.message || "Oops! We couldn't generate a sentence. Please check console or try again." });
      setStep(prev => (prev === 'IN_GAME' ? 'IN_GAME' : 'SETTINGS'));
    } finally {
      setIsLoading(false);
    }
  }, [sentenceBatch, usedSubtypes, pastMistakes, playSound]);

  const handleFinalizeSettings = useCallback(() => {
    const finalTopic = settings.topic === "My own choice" ? customTopic.trim() : settings.topic;
    let finalTheme = settings.theme;

    if (!finalTopic || !settings.level || !finalTheme) {
        setError({ title: "Incomplete Setup", message: "Please choose a topic, level, and theme." });
        return;
    }
    if (settings.topic === "My own choice" && !finalTopic) {
        setError({ title: "Incomplete Setup", message: "Please enter your custom topic." });
        return;
    }
    if (settings.theme === "Custom ✍️") {
        if (!customTheme.trim()){
            setError({ title: "Incomplete Setup", message: "Please enter your custom theme." });
            return;
        }
        finalTheme = customTheme.trim();
    }
    const numTotalRounds = typeof totalRounds === 'string' ? parseInt(totalRounds, 10) : totalRounds;
    if (gameMode === 'rounds' && (isNaN(numTotalRounds) || numTotalRounds <= 0)) {
        setError({ title: "Invalid Rounds", message: "Please enter a positive number of rounds." });
        return;
    }
    const numTargetAmount = typeof targetAmount === 'string' ? parseInt(targetAmount, 10) : targetAmount;
    if (gameMode === 'targetAmount' && (isNaN(numTargetAmount) || numTargetAmount < MIN_TARGET_AMOUNT)) {
        setError({ title: "Invalid Target Amount", message: `Target amount must be at least $${MIN_TARGET_AMOUNT.toLocaleString()}.` });
        return;
    }
    
    const newSettings: Settings = {
      topic: finalTopic,
      level: settings.level,
      theme: finalTheme,
      challengeFormat: settings.challengeFormat || 'binary',
      mixedFormats: getEffectiveMixedFormats(settings.mixedFormats),
    };
    mixedFormatIndexRef.current = 0;
    secondLookQueueRef.current = [];
    setSecondLookRound(null);
    missTallyRef.current = {};
    setFreeDraws({});
    safeLocalStorage.setItem(SETUP_PREFS_KEY, serializeSetupPrefs({
      settings: { ...settings, challengeFormat: newSettings.challengeFormat, mixedFormats: newSettings.mixedFormats },
      customTopic,
      customTheme,
      gameMode,
      totalRounds: numTotalRounds,
      targetAmount: numTargetAmount,
      startingCash,
      turnTimerSeconds,
      deck: selectedPowerUps,
    }));
    setSettings(newSettings);
    setCurrentRound(1);
    setPlayers(p => p.map(player => ({ ...player, money: startingCash, history: [], winStreak: 0, effects: [] }))); 
    setStep('IN_GAME');
    setRoundHistory([]);
    setHandReactions({});
    setBets({});
    setHints({});
    setRoundResults([]);
    setPowerUpsUsedThisRound({});
    setActivePowerUps({});
    setAvailablePowerUps(selectedPowerUps); 
    setRoundSpending({});
    setUsedSubtypes([]);
    setTurnTimers({});
    setMpRoundTimer({ status: 'idle', remainingMs: turnDurationMs });
    mpAutoStartedRoundRef.current = 0;
    setTeacherRevealOverride(false);
    setMpStudentPendingTarget({});
    setMpStudentPendingWheel({});
    setMpStudentNotifications({});
    setMpSeats(prev => {
      const next: Record<number, MultiplayerSeat> = {};
      (Object.entries(prev) as [string, MultiplayerSeat][]).forEach(([k, seat]) => {
        next[Number(k)] = { ...seat, lockedIn: false };
      });
      return next;
    });
    
    setSentenceBatch([]);
    // Pass undefined for forcedBatch so fetchNewSentence consumes the Round 1 sentence pre-fetched on Settings Part 2
    fetchNewSentence(newSettings, pastSentences, undefined, pastMistakes);
    playSound('success');
  }, [settings, customTopic, customTheme, gameMode, totalRounds, targetAmount, startingCash, turnTimerSeconds, selectedPowerUps, fetchNewSentence, playSound, pastSentences, pastMistakes]);
  
  const handleGetHint = useCallback(async (playerId: number) => {
      if (!canPlayerAct(playerId)) return;
      const player = players.find(p => p.id === playerId);
      if (!player || player.money < HINT_COST || !currentSentence || hints[playerId]?.text) return;
      
      playSound('hint');
      setPlayers(ps => ps.map(p => p.id === playerId ? {...p, money: p.money - HINT_COST} : p));
      setRoundSpending(s => ({...s, [playerId]: (s[playerId] || 0) + HINT_COST }));
      setHints(h => ({...h, [playerId]: { text: '', isLoading: true }}));
      
      try {
        const hintText = currentSentence.questionType === 'wordOrder' ? wordOrderHint(currentSentence) : await GeminiService.getHint(
          currentSentence.text,
          settings.topic,
          settings.level as any,
          // Spot the error is a flawed sentence, so it gets the hint a flawed sentence gets.
          currentSentence.questionType === 'spotError' ? 'binary' : (currentSentence.questionType || 'binary'),
          currentSentence.baseWord,
          currentSentence.leadInSentence
        );
        setHints(h => ({...h, [playerId]: { text: hintText, isLoading: false }}));
      } catch (err: any) {
        // Clear the hint so the student can try again, and refund against current money (F4 fix 6).
        setHints(h => {
          const next = { ...h };
          delete next[playerId];
          return next;
        });
        setPlayers(ps => ps.map(p => p.id === playerId ? {...p, money: refundHint(p.money) } : p));
        setRoundSpending(s => ({...s, [playerId]: Math.max(0, (s[playerId] || 0) - HINT_COST) }));
        setError({title: "Hint Error", message: "Could not fetch hint from AI."})
      }
  }, [canPlayerAct, players, currentSentence, settings.topic, settings.level, playSound, hints]); 
  
  const handleBetChange = useCallback((playerId: number, field: keyof Bet, value: any, ignoreLock = false) => {
    if (!ignoreLock && !canPlayerAct(playerId)) return;
    const player = players.find(p => p.id === playerId);
    if (!player) return;

    let finalValue = value;
    if (field === 'bet') {
      finalValue = clampBetInput(value, getBetLimits(player, activePowerUps).max);
    }
    setBets(prev => {
      const prevBetVal = prev[playerId]?.bet;
      const prevBetNum = typeof prevBetVal === 'number' && !isNaN(prevBetVal) ? prevBetVal : 0;
      const newBets = {
        ...prev,
        [playerId]: {
          ...(prev[playerId] || {}),
          [field]: finalValue
        }
      };
      if (field === 'bet') {
        const nextBetNum = typeof finalValue === 'number' && !isNaN(finalValue) ? finalValue : 0;
        const delta = nextBetNum - prevBetNum;
        if (delta > 0) {
          playSound('chipClink', delta);
          const seatIdx = Math.max(0, activePlayers.findIndex(p => p.id === playerId));
          setChipTossEvent({
            id: `${playerId}-${Date.now()}-${Math.random()}`,
            playerId,
            seatIndex: seatIdx,
            totalSeats: Math.max(1, activePlayers.length),
            amountDelta: delta,
          });
        } else {
          playSound('bet');
        }
      } else if (field === 'opinion' || field === 'selectedOption' || field === 'splitOptions') {
        playSound('bet');
      }
      return newBets;
    });
  }, [canPlayerAct, players, activePlayers, activePowerUps, playSound]);

  const handleUpdatePlayerMoney = useCallback((playerId: number, newAmount: number) => {
    const validAmount = Math.max(0, newAmount);
    setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, money: validAmount } : p));
    setBets(prevBets => {
      const playerBet = prevBets[playerId];
      if (!playerBet || playerBet.bet === undefined || playerBet.bet === '') {
        return prevBets;
      }
      const currentBetNum = Number(playerBet.bet);
      if (isNaN(currentBetNum)) return prevBets;

      const effects = players.find(p => p.id === playerId)?.effects ?? [];
      const maxAllowed = getBetLimits({ id: playerId, money: validAmount, effects }, activePowerUps).max;

      if (validAmount <= 0) {
        if (currentBetNum !== 0) {
          return {
            ...prevBets,
            [playerId]: { ...playerBet, bet: 0 }
          };
        }
      } else if (currentBetNum > maxAllowed) {
        return {
          ...prevBets,
          [playerId]: {
            ...playerBet,
            bet: maxAllowed
          }
        };
      }
      return prevBets;
    });
    playSound('click');
  }, [activePowerUps, playSound]);

  // Whenever there's a change in any player's current funds or active power-ups, ensure their bet stays within [minLimit, maxLimit]
  useEffect(() => {
    setBets(prevBets => {
      let changed = false;
      const updatedBets = { ...prevBets };

      players.forEach(player => {
        const playerBet = updatedBets[player.id];
        const { max: maxLimit, min: minLimit, isHighRoller } = getBetLimits(player, activePowerUps);

        if (player.money <= 0) {
          if (playerBet && playerBet.bet !== undefined && playerBet.bet !== '' && playerBet.bet !== 0) {
            updatedBets[player.id] = {
              ...playerBet,
              bet: 0
            };
            changed = true;
          }
          return;
        }

        if (isHighRoller && minLimit > 0) {
          const currentBetNum = playerBet?.bet !== undefined && playerBet?.bet !== '' ? Number(playerBet.bet) : 0;
          if (isNaN(currentBetNum) || currentBetNum < minLimit) {
            updatedBets[player.id] = {
              ...(playerBet || {}),
              bet: minLimit,
            };
            changed = true;
            return;
          }
        }

        if (!playerBet || playerBet.bet === undefined || playerBet.bet === '') {
          return;
        }

        const currentBetNum = Number(playerBet.bet);
        if (isNaN(currentBetNum)) return;

        if (currentBetNum > maxLimit) {
          updatedBets[player.id] = {
            ...playerBet,
            bet: maxLimit
          };
          changed = true;
        }
      });

      return changed ? updatedBets : prevBets;
    });
  }, [players, activePowerUps]);

  const handleBuyPowerUp = useCallback((playerId: number, powerUpKey: PowerUpKey, cost: number = POWERUP_COST) => {
    if (!canPlayerAct(playerId)) return;
    const player = players.find(p => p.id === playerId);
    if (!player || player.money < cost) return;
    if (!mayBuyPowerUps(player)) return;
    
    const isClozeRound = isGapType(currentSentence?.questionType);
    if (isClozeRound && CLOZE_DISABLED_POWER_UPS.includes(powerUpKey)) return;
    if (!isClozeRound && BINARY_DISABLED_POWER_UPS.includes(powerUpKey)) return;
    if (!mpRoomCode && MP_ONLY_POWER_UPS.includes(powerUpKey)) return;

    const usage = (powerUpsUsedThisRound[playerId] || []).length;
    const playerActive = (activePowerUps[playerId] || []) as ActivePowerUp[];
    const hasPowerSurge = playerActive.some(pu => pu.type === 'POWER_SURGE');
    const limit = hasPowerSurge ? 3 : 1;
    if (usage >= limit) return;

    if (!availablePowerUps.includes(powerUpKey)) return;

    const powerUp = POWER_UPS[powerUpKey];
    if (powerUp.requiresTarget) {
      const eligibleTargets = players.filter(p => p.id !== playerId && p.money > 0);
      const isNonOffensive = NON_OFFENSIVE_TARGETED_POWER_UPS.includes(powerUpKey);
      const ignoresShield = powerUpKey === 'COPYCAT';
      const unshieldedTargets = eligibleTargets.filter(p => {
        const pActivePowerUps = (activePowerUps[p.id] || []) as ActivePowerUp[];
        const hasShield = !ignoresShield && hasShieldProtection(pActivePowerUps);
        const alreadyAttacked = !isNonOffensive && Boolean(mpRoomCode) && isPlayerTargetedThisRound(p.id, powerUpsUsedThisRound, activePowerUps);
        return !hasShield && !alreadyAttacked;
      });
      if (eligibleTargets.length === 0 || unshieldedTargets.length === 0) {
        playSound('error');
        const msg = eligibleTargets.length === 0
          ? `There are no other active players at the table to target with ${powerUp.name}! Your $50 was not spent.`
          : `All other active players are protected by a Shield or have already been attacked once this round! Your $50 was not spent.`;
        if (mpRoomCode && mpSeats[playerId]) {
          setMpStudentNotifications(prev => ({
            ...prev,
            [playerId]: { id: String(Date.now()), title: 'No Available Targets', message: msg, icon: '🛡️' },
          }));
        } else {
          setShowPowerUpModal({
            title: "No Available Targets",
            message: msg,
            icon: "⚠️"
          });
        }
        return;
      }
    }

    playSound('powerUp');
    const newMoney = player.money - cost;

    setPlayers(ps => ps.map(p => p.id === playerId ? {...p, money: newMoney} : p));
    setPowerUpsUsedThisRound(prev => ({...prev, [playerId]: [...(prev[playerId] || []), cost === POWERUP_COST ? { key: powerUpKey } : { key: powerUpKey, cost }]}));
    setRoundSpending(s => ({...s, [playerId]: (s[playerId] || 0) + cost }));

    if (bets[playerId]?.bet && Number(bets[playerId]?.bet) > newMoney) {
        setBets(b => ({...b, [playerId]: {...b[playerId], bet: newMoney }}));
    }
    
    setAvailablePowerUps(avail => avail.filter(p => p !== powerUpKey));

    if (powerUp.requiresTarget) {
        if (mpRoomCode && mpSeats[playerId]) {
          setMpStudentPendingTarget(prev => ({ ...prev, [playerId]: powerUpKey }));
        } else {
          setShowTargetModal({ powerUp: powerUpKey, playerId });
        }
    } else {
        // Immediate effect logic
        // Package S5: the same short, plain description as the card itself.
        let modalMessage = `${powerUp.icon} ${plainDescriptionOf(powerUpKey)}`;
        
        if (powerUpKey === 'GRAMMAR_GOGGLES' && currentSentence) {
            if (!mpRoomCode || !mpSeats[playerId]) {
              setHighlightedPhrase(currentSentence.grammarPhrase || 'the key part of the sentence');
            }
            setActivePowerUps(prev => ({...prev, [playerId]: [...(prev[playerId] || []), {type: powerUpKey}]}));
        } else if (powerUpKey === 'SCALPEL' && currentSentence) {
            const qType = currentSentence.questionType || 'binary';
            if (isOptionType(qType)) {
              const correctNorm = (currentSentence.correctAnswer || '').trim().toLowerCase();
              const wrongOpts = (currentSentence.options || []).filter(
                o => o.trim().toLowerCase() !== correctNorm
              );
              const shuffledWrong = [...wrongOpts].sort(() => Math.random() - 0.5);
              const eliminatedOptions = shuffledWrong.slice(0, 2);
              const eliminatedNormSet = new Set(eliminatedOptions.map(o => o.trim().toLowerCase()));

              setActivePowerUps(prev => ({
                ...prev,
                [playerId]: [...(prev[playerId] || []), { type: 'SCALPEL', eliminatedOptions }],
              }));

              // Clear player's current pick if they had selected an eliminated option
              setBets(prev => {
                const cur = prev[playerId];
                if (!cur) return prev;
                let changed = false;
                const nextBet = { ...cur };
                if (nextBet.selectedOption && eliminatedNormSet.has(nextBet.selectedOption.trim().toLowerCase())) {
                  nextBet.selectedOption = undefined;
                  changed = true;
                }
                if (Array.isArray(nextBet.splitOptions) && nextBet.splitOptions.length > 0) {
                  const filtered = nextBet.splitOptions.filter(
                    o => !eliminatedNormSet.has(o.trim().toLowerCase())
                  );
                  if (filtered.length !== nextBet.splitOptions.length) {
                    nextBet.splitOptions = filtered;
                    changed = true;
                  }
                }
                return changed ? { ...prev, [playerId]: nextBet } : prev;
              });

              modalMessage = `${powerUp.icon} Eliminated 2 wrong options: "${eliminatedOptions.join('" & "')}"!`;
            } else if (qType === 'openCloze' && currentSentence.correctAnswer) {
              const word = currentSentence.correctAnswer.trim();
              const rest = Array(Math.max(0, word.length - 1)).fill('_').join(' ');
              const mask = `${word[0]}${rest ? ' ' + rest : ''} (${word.length} letter${word.length === 1 ? '' : 's'})`;
              setActivePowerUps(prev => ({
                ...prev,
                [playerId]: [...(prev[playerId] || []), { type: 'SCALPEL' }],
              }));
              modalMessage = `${powerUp.icon} Open Cloze Clue: ${mask}`;
            } else if (qType === 'wordFormation' && currentSentence.correctAnswer) {
              const word = currentSentence.correctAnswer.trim();
              let mask = '';
              if (word.length <= 3) {
                const rest = Array(Math.max(0, word.length - 1)).fill('_').join(' ');
                mask = `${word[0]}${rest ? ' ' + rest : ''} (${word.length} letter${word.length === 1 ? '' : 's'})`;
              } else {
                const middleCount = Math.max(1, word.length - 3);
                const middle = Array(middleCount).fill('_').join(' ');
                const lastTwo = `${word[word.length - 2]} ${word[word.length - 1]}`;
                mask = `${word[0]} ${middle} ${lastTwo} (${word.length} letters)`;
              }
              setActivePowerUps(prev => ({
                ...prev,
                [playerId]: [...(prev[playerId] || []), { type: 'SCALPEL' }],
              }));
              modalMessage = `${powerUp.icon} Word Formation Clue: ${mask}`;
            } else if ((qType === 'keyWordTransformation' || qType === 'wordOrder') && currentSentence.correctAnswer) {
              const words = currentSentence.correctAnswer.trim().split(/\s+/).filter(Boolean);
              let mask = '';
              if (words.length <= 2) {
                mask = `${words.length} words: ${words[0]} ___`;
              } else {
                const middle = Array(words.length - 2).fill('___').join(' ');
                mask = `${words.length} words: ${words[0]} ${middle} ${words[words.length - 1]}`;
              }
              setActivePowerUps(prev => ({
                ...prev,
                [playerId]: [...(prev[playerId] || []), { type: 'SCALPEL' }],
              }));
              modalMessage = `${powerUp.icon} ${qType === 'wordOrder' ? 'Word Order' : 'Key Word Transformation'} Clue: ${mask}`;
            } else {
              setActivePowerUps(prev => ({
                ...prev,
                [playerId]: [...(prev[playerId] || []), { type: 'SCALPEL' }],
              }));
            }
        } else if (powerUpKey === 'BOOMERANG') {
            // Check if an active round debuff was already placed on this player earlier this hand; if so, reflect it immediately!
            let reflectedCasterId: number | null = null;
            let reflectedDebuff: ActivePowerUp | null = null;
            const nextActive = { ...activePowerUps };

            for (const [sourceKey, list] of Object.entries(nextActive) as [string, ActivePowerUp[]][]) {
              const sId = Number(sourceKey);
              if (sId === playerId) continue;
              const arr = [...(list || [])];
              const idx = arr.findIndex(
                pu =>
                  pu.target === playerId &&
                  BOOMERANG_REFLECTED_PLACED.includes(pu.type)
              );
              if (idx !== -1) {
                reflectedCasterId = sId;
                reflectedDebuff = arr[idx];
                const casterPlayer = players.find(p => p.id === sId);
                const updatedDebuff: ActivePowerUp = {
                  ...reflectedDebuff,
                  target: sId,
                  ...(reflectedDebuff.type === 'HIGH_ROLLER' && casterPlayer
                    ? { amount: Math.max(1, Math.ceil(casterPlayer.money * 0.5)) }
                    : {}),
                };
                arr[idx] = updatedDebuff;
                nextActive[sId] = arr;
                break;
              }
            }

            if (reflectedCasterId !== null && reflectedDebuff !== null) {
              setActivePowerUps(nextActive);
              const casterName = players.find(p => p.id === reflectedCasterId)?.name || 'the attacker';
              modalMessage = `${powerUp.icon} Boomerang immediately reflected ${POWER_UPS[reflectedDebuff.type]?.name} back onto ${casterName}!`;
              playSound('boomerangWhoosh');
              const attackerIdx = Math.max(0, activePlayers.findIndex(p => p.id === reflectedCasterId));
              const defenderIdx = Math.max(0, activePlayers.findIndex(p => p.id === playerId));
              setBoomerangArcEvent({
                id: `${reflectedCasterId}-${playerId}-${Date.now()}`,
                attackerSeatIndex: attackerIdx,
                defenderSeatIndex: defenderIdx,
                totalSeats: Math.max(1, activePlayers.length),
              });
            } else {
              setActivePowerUps(prev => ({
                ...prev,
                [playerId]: [...(prev[playerId] || []), { type: 'BOOMERANG' }],
              }));
              modalMessage = `${powerUp.icon} Boomerang armed! Any offensive targeted power-up used against you this round will bounce back at the attacker.`;
            }
        } else if (powerUpKey === 'TAXMAN') {
            let taxCollected = 0;
            const updatedTaxedPlayers = players.map(p => {
                const pActivePowerUps = (activePowerUps[p.id] || []) as ActivePowerUp[];
                const isShielded = hasShieldProtection(pActivePowerUps);
                if (p.id !== playerId && activePlayers.find(ap => ap.id === p.id) && !isShielded) { 
                    const tax = Math.min(TAXMAN_AMOUNT, p.money);
                    taxCollected += tax;
                    return {...p, money: p.money - tax};
                }
                return p;
            });
            setPlayers(updatedTaxedPlayers.map(p => p.id === playerId ? {...p, money: p.money + taxCollected} : p)); 
            modalMessage = `${powerUp.icon} Stole $${TAXMAN_AMOUNT} per rival — collected $${taxCollected.toLocaleString()} total!`;
        } else if (powerUpKey === 'THE_TITHE') {
             let taxCollected = 0;
             const updatedTithePlayers = players.map(p => {
                const pActivePowerUps = (activePowerUps[p.id] || []) as ActivePowerUp[];
                const isShielded = hasShieldProtection(pActivePowerUps);
                if (p.id !== playerId && activePlayers.find(ap => ap.id === p.id) && !isShielded) { 
                    const tax = Math.floor(p.money * 0.10);
                    taxCollected += tax;
                    return {...p, money: p.money - tax};
                }
                return p;
             });
             setPlayers(updatedTithePlayers.map(p => p.id === playerId ? {...p, money: p.money + taxCollected} : p));
             modalMessage = `${powerUp.icon} Tithed 10% per rival — collected $${taxCollected.toLocaleString()} total!`;
        } else if (powerUpKey === 'GENEROUS') {
            const otherActivePlayers = activePlayers.filter(p => p.id !== playerId);
            const activeOtherPlayersCount = otherActivePlayers.length;
            // Cap gift per player so total gifts never exceed the caster's remaining money (newMoney)
            const giftPerPlayer = activeOtherPlayersCount > 0
                ? Math.min(GENEROUS_GIFT_AMOUNT, Math.floor(newMoney / activeOtherPlayersCount))
                : 0;
            const totalGiftCost = activeOtherPlayersCount * giftPerPlayer;
            const playerMoneyAfterGift = Math.max(0, newMoney - totalGiftCost);
            setPlayers(ps => ps.map(p => {
                if (p.id === playerId) return { ...p, money: playerMoneyAfterGift };
                if (otherActivePlayers.some(ap => ap.id === p.id)) return { ...p, money: p.money + giftPerPlayer };
                return p;
            }));
            if (bets[playerId]?.bet && Number(bets[playerId]?.bet) > playerMoneyAfterGift) {
                setBets(b => ({ ...b, [playerId]: { ...b[playerId], bet: playerMoneyAfterGift } }));
            }
            modalMessage = giftPerPlayer > 0
                ? `${powerUp.icon} Gave $${giftPerPlayer} to ${activeOtherPlayersCount} other player(s).`
                : `${powerUp.icon} You had no remaining funds to gift after buying the power-up!`;
        } else if (powerUpKey === 'GUARDIAN_ANGEL') {
            const newActivePowerUps = { ...activePowerUps };
            Object.keys(newActivePowerUps).forEach(sourceId => {
                const sId = Number(sourceId);
                newActivePowerUps[sId] = (newActivePowerUps[sId] as ActivePowerUp[]).filter((pu: ActivePowerUp) => {
                    if (pu.target === playerId && ['HALF_BAKED', 'SUB_ZERO', 'CRUCIO', 'THE_PUNISHER', 'BET_CAP', 'HIGH_ROLLER', 'SILENCED'].includes(pu.type)) {
                        return false; 
                    }
                    return true;
                });
            });
            newActivePowerUps[playerId] = [...(newActivePowerUps[playerId] || []), {type: powerUpKey}];
            setActivePowerUps(newActivePowerUps);
            setPlayers(ps => ps.map(p => {
                if (p.id === playerId) {
                    return { ...p, effects: clearNegativeEffects(p.effects) };
                }
                return p;
            }));
            modalMessage = `${powerUp.icon} Cleared negative effects and blocked rival attacks this round.`;
        } else if (powerUpKey === 'BLESSING') {
             setPlayers(ps => ps.map(p => {
                 if (p.id === playerId) {
                     return { ...p, effects: [...p.effects, { type: 'BLESSING', roundsLeft: 3 }] };
                 }
                 return p;
             }));
             modalMessage = `${powerUp.icon} Reduces any bet losses by 30% for the next 3 rounds.`;
        } else if (powerUpKey === 'SECOND_CHANCE') {
             setPlayers(ps => ps.map(p => {
                 if (p.id === playerId) {
                     return { ...p, effects: [...p.effects, { type: 'SECOND_CHANCE', roundsLeft: -1 }] };
                 }
                 return p;
             }));
             modalMessage = `${powerUp.icon} Auto-revives you with $300 the next time you hit $0.`;
        } else if (powerUpKey === 'ROBIN_HOOD') {
             const richestAmount = Math.max(...activePlayers.map(p => p.money));
             const richestPlayers = activePlayers.filter(p => p.money === richestAmount);
             
             let totalStolen = 0;
             const stolenLog: string[] = [];
             
             // Phase 1: Steal from Richest
             const newPlayerState = players.map(p => {
                 const pActivePowerUps = (activePowerUps[p.id] || []) as ActivePowerUp[];
                 const isShielded = hasShieldProtection(pActivePowerUps);
                 
                 if (richestPlayers.find(rp => rp.id === p.id) && !isShielded) {
                     const stolen = Math.floor(p.money * 0.20);
                     totalStolen += stolen;
                     stolenLog.push(`${p.name} (-$${stolen})`);
                     return { ...p, money: p.money - stolen };
                 }
                 return p;
             });
             
             // Phase 2: Distribute to others (beneficiaries)
             const beneficiaries = newPlayerState.filter(p => !richestPlayers.find(rp => rp.id === p.id) && p.money > 0);
             
             if (beneficiaries.length > 0 && totalStolen > 0) {
                 const share = Math.floor(totalStolen / beneficiaries.length);
                 const receivedLog: string[] = [];
                 
                 setPlayers(newPlayerState.map(p => {
                     if (beneficiaries.find(b => b.id === p.id)) {
                         receivedLog.push(`${p.name} (+$${share})`);
                         return { ...p, money: p.money + share };
                     }
                     return p;
                 }));
                 
                 modalMessage = `${powerUp.icon} Took 20% from ${stolenLog.join(', ')} and shared it with ${receivedLog.join(', ')}.`;
             } else {
                 setPlayers(newPlayerState); 
                 if (totalStolen > 0) {
                     modalMessage = `${powerUp.icon} Took 20% from ${stolenLog.join(', ')}, with no eligible players to receive it.`;
                 } else {
                     modalMessage = `${powerUp.icon} The richest player is shielded — no money stolen.`;
                 }
             }

        } else if (powerUpKey === 'THE_WHEEL') {
            if (mpRoomCode && mpSeats[playerId]) {
              // The host draws the prize now; the phone only animates towards it (F4 fix 1).
              setMpStudentPendingWheel(prev => ({ ...prev, [playerId]: drawWheelItem().id }));
            } else {
              setShowWheelModal({ playerId });
            }
            return;
        } else if (powerUpKey === 'TEACHERS_PET') {
            if (player.winStreak >= 3) {
                const grant = Math.floor(newMoney * 0.5);
                setPlayers(ps => ps.map(p => {
                    if (p.id === playerId) {
                        const remainingEffects = p.effects.filter(e => e.type !== 'TEACHERS_PET');
                        return { ...p, money: newMoney + grant, effects: remainingEffects };
                    }
                    return p;
                }));
                modalMessage = `${powerUp.icon} 3-win streak active! Instant +50% bankroll bonus (+$${grant.toLocaleString()}).`;
            } else {
                setPlayers(ps => ps.map(p => {
                    if (p.id === playerId) {
                        const existingWithout = p.effects.filter(e => e.type !== 'TEACHERS_PET');
                        return { ...p, effects: [...existingWithout, { type: 'TEACHERS_PET', roundsLeft: -1 }] };
                    }
                    return p;
                }));
                setActivePowerUps(prev => ({ ...prev, [playerId]: [...(prev[playerId] || []), { type: powerUpKey }] }));
                modalMessage = `${powerUp.icon} Reach a 3-win streak to earn +50% of your bankroll (Current: ${player.winStreak}/3).`;
            }
        } else if (powerUpKey === 'AUDIENCE_POLL') {
            setActivePowerUps(prev => ({ ...prev, [playerId]: [...(prev[playerId] || []), { type: 'AUDIENCE_POLL' }] }));
            const poll = buildAudiencePollSummary(players, bets, activePowerUps, currentSentence, playerId);
            const breakdownPreview = poll.breakdown.length > 0
              ? ` (${poll.breakdown.map(b => `${b.label}: ${b.percent}%`).join(' · ')})`
              : '';
            modalMessage = `${powerUp.icon} Live Ask the Table Poll active on your betting card! ${poll.summaryText}${breakdownPreview}`;
        } else if (powerUpKey === 'UNDERDOG') {
            setActivePowerUps(prev => ({ ...prev, [playerId]: [...(prev[playerId] || []), { type: 'UNDERDOG' }] }));
            const updatedPlayersPreview = players.map(p => p.id === playerId ? { ...p, money: newMoney } : p);
            const qualifiesNow = isPlayerUnderdog(playerId, updatedPlayersPreview);
            modalMessage = qualifiesNow
              ? `${powerUp.icon} Underdog Surge is on. You are behind, so a win this hand pays 2.5 times.`
              : `${powerUp.icon} ${plainDescriptionOf(powerUpKey)} You are ahead now, so it pays only if you drop to the bottom half by the end of the hand.`;
        } else if (powerUpKey === 'SCAVENGER') {
            setActivePowerUps(prev => ({ ...prev, [playerId]: [...(prev[playerId] || []), { type: 'SCAVENGER' }] }));
            modalMessage = `${powerUp.icon} Scavenger is on. You get 25% of what others lose this hand (up to $500).`;
        } else if (powerUpKey === 'CORRECTION_BOUNTY' || powerUpKey === 'LONE_WOLF' || powerUpKey === 'CROWD_SURFER' || powerUpKey === 'DOUBLE_OR_NOTHING') {
            setActivePowerUps(prev => ({ ...prev, [playerId]: [...(prev[playerId] || []), { type: powerUpKey }] }));
            modalMessage = `${powerUp.icon} ${plainDescriptionOf(powerUpKey)}`;
        } else {
            setActivePowerUps(prev => ({...prev, [playerId]: [...(prev[playerId] || []), {type: powerUpKey}]}));
        }
        if (mpRoomCode && mpSeats[playerId]) {
          setMpStudentNotifications(prev => ({
            ...prev,
            [playerId]: { id: String(Date.now()), title: powerUp.name, message: modalMessage, icon: powerUp.icon },
          }));
        }
        setActiveCutIn({
          id: `${playerId}-${powerUpKey}-${Date.now()}`,
          attackerName: player.name,
          attackerAvatar: player.avatar,
          powerUpName: powerUp.name,
          powerUpIcon: powerUp.icon,
          subtitle: modalMessage,
        });
        setShowPowerUpModal({ title: powerUp.name, message: modalMessage, icon: powerUp.icon });
    }
  }, [canPlayerAct, players, activePlayers, currentSentence, availablePowerUps, bets, powerUpsUsedThisRound, playSound, activePowerUps, mpRoomCode, mpSeats]); 

  const handleApplyWheelResult = useCallback((playerId: number, item: WheelItem) => {
    switch (item.id) {
      case 'jackpot': {
        setPlayers(ps => ps.map(p => p.id === playerId ? { ...p, money: p.money + 500 } : p));
        break;
      }
      case 'house_tax': {
        setPlayers(ps => ps.map(p => {
          if (p.id === playerId) {
            const newM = Math.max(0, p.money - 100);
            if (bets[playerId]?.bet && Number(bets[playerId]?.bet) > newM) {
              setBets(b => ({ ...b, [playerId]: { ...b[playerId], bet: newM } }));
            }
            return { ...p, money: newM };
          }
          return p;
        }));
        break;
      }
      case 'shield': {
        setActivePowerUps(prev => ({ ...prev, [playerId]: [...(prev[playerId] || []), { type: 'SHIELD' }] }));
        break;
      }
      case 'freeze': {
        setActivePowerUps(prev => ({ ...prev, [playerId]: [...(prev[playerId] || []), { type: 'SUB_ZERO', target: playerId }] }));
        setPlayers(ps => ps.map(p => p.id === playerId ? { ...p, effects: [...p.effects, { type: 'SUB_ZERO', roundsLeft: 1 }] } : p));
        setBets(b => ({ ...b, [playerId]: { bet: 0, opinion: undefined } }));
        break;
      }
      case 'safety_net': {
        setActivePowerUps(prev => ({ ...prev, [playerId]: [...(prev[playerId] || []), { type: 'SAFETY_NET' }] }));
        break;
      }
      case 'silenced': {
        setPlayers(ps => ps.map(p => p.id === playerId ? { ...p, effects: [...p.effects, { type: 'SILENCED', roundsLeft: 2 }] } : p));
        break;
      }
      case 'bounty': {
        let stolen = 0;
        setPlayers(ps => {
          const updated = ps.map(p => {
            if (p.id !== playerId && p.money > 0) {
              const pActive = (activePowerUps[p.id] || []) as ActivePowerUp[];
              const isShielded = isProtectedFromWheelBounty(pActive);
              if (!isShielded) {
                const take = Math.min(100, p.money);
                stolen += take;
                return { ...p, money: p.money - take };
              }
            }
            return p;
          });
          return updated.map(p => p.id === playerId ? { ...p, money: p.money + stolen } : p);
        });
        setBets(prevBets => {
          let nextBets = { ...prevBets };
          let changed = false;
          players.forEach(p => {
            if (p.id !== playerId && nextBets[p.id]?.bet) {
              const pActive = (activePowerUps[p.id] || []) as ActivePowerUp[];
              const isShielded = isProtectedFromWheelBounty(pActive);
              if (!isShielded) {
                const remainingMoney = Math.max(0, p.money - 100);
                if (Number(nextBets[p.id].bet) > remainingMoney) {
                  nextBets[p.id] = { ...nextBets[p.id], bet: remainingMoney };
                  changed = true;
                }
              }
            }
          });
          return changed ? nextBets : prevBets;
        });
        break;
      }
      case 'bet_cap': {
        setActivePowerUps(prev => ({ ...prev, [playerId]: [...(prev[playerId] || []), { type: 'BET_CAP', target: playerId, amount: 50 }] }));
        setPlayers(ps => ps.map(p => p.id === playerId ? { ...p, effects: [...p.effects, { type: 'BET_CAP', roundsLeft: 1 }] } : p));
        setBets(prevBets => {
          const currentBet = prevBets[playerId]?.bet;
          if (currentBet !== undefined && currentBet !== '' && Number(currentBet) > 50) {
            return {
              ...prevBets,
              [playerId]: { ...prevBets[playerId], bet: 50 }
            };
          }
          return prevBets;
        });
        break;
      }
      case 'lucky_refund': {
        setPlayers(ps => ps.map(p => p.id === playerId ? { ...p, money: p.money + 300 } : p));
        break;
      }
      case 'forced_charity': {
        setPlayers(ps => {
          const otherActive = ps.filter(p => p.id !== playerId && p.money > 0);
          const totalCost = otherActive.length * 25;
          return ps.map(p => {
            if (p.id === playerId) {
              const newM = Math.max(0, p.money - totalCost);
              if (bets[playerId]?.bet && Number(bets[playerId]?.bet) > newM) {
                setBets(b => ({ ...b, [playerId]: { ...b[playerId], bet: newM } }));
              }
              return { ...p, money: newM };
            }
            if (otherActive.some(oa => oa.id === p.id)) {
              return { ...p, money: p.money + 25 };
            }
            return p;
          });
        });
        break;
      }
      default:
        break;
    }

    const wheelTitle = item.type === 'positive' ? '🎡 Fortune Smiled!' : '🎡 Misfortune Struck!';
    const wheelMsg = `${item.icon} ${item.name}: ${item.description}`;
    if (mpRoomCode && mpSeats[playerId]) {
      setMpStudentPendingWheel(prev => {
        const next = { ...prev };
        delete next[playerId];
        return next;
      });
      setMpStudentNotifications(prev => ({
        ...prev,
        [playerId]: { id: String(Date.now()), title: wheelTitle, message: wheelMsg, icon: item.icon },
      }));
    }
    setShowPowerUpModal({
      title: wheelTitle,
      message: wheelMsg,
      icon: item.icon,
    });
  }, [bets, activePowerUps, players, mpRoomCode, mpSeats]); 
  
  const handleBuyRandomPowerUp = useCallback((playerId: number) => {
    if (!canPlayerAct(playerId)) return;
    const player = players.find(p => p.id === playerId);
    // Package G6 Spotlight: a free draw earned on the Spotlight hand costs nothing.
    const isFree = (freeDraws[playerId] || []).length > 0;
    const cost = isFree ? 0 : POWERUP_COST;
    if (!player || player.money < cost) return; 
    // A silenced player cannot buy, even if a phone sends the request anyway (G5 fix).
    if (!mayBuyPowerUps(player)) return;
    const usage = (powerUpsUsedThisRound[playerId] || []).length;
    const playerActive = (activePowerUps[playerId] || []) as ActivePowerUp[];
    const hasPowerSurge = playerActive.some(pu => pu.type === 'POWER_SURGE');
    const limit = hasPowerSurge ? 3 : 1;
    if (usage >= limit) return;

    const isClozeRound = isGapType(currentSentence?.questionType);
    const activeOtherPlayersCount = activePlayers.filter(p => p.id !== playerId).length;
    const drawablePool = availablePowerUps.filter(k => {
      if (isClozeRound && CLOZE_DISABLED_POWER_UPS.includes(k)) return false;
      if (!isClozeRound && BINARY_DISABLED_POWER_UPS.includes(k)) return false;
      if (!mpRoomCode && MP_ONLY_POWER_UPS.includes(k)) return false;
      if (k === 'GENEROUS' && player.money < cost + activeOtherPlayersCount * GENEROUS_GIFT_AMOUNT) return false;
      if (k === 'UNDERDOG' && !isPlayerUnderdog(playerId, players)) return false;
      return true;
    });

    if (drawablePool.length === 0) {
         if (mpRoomCode && mpSeats[playerId]) {
           setMpStudentNotifications(prev => ({
             ...prev,
             [playerId]: { id: String(Date.now()), title: 'Empty Deck', message: 'No more eligible power-ups available in the shoe for this hand!', icon: '🃏' },
           }));
         } else {
           setError({ title: "Empty Deck", message: "No more eligible power-ups available in the shoe for this hand!" });
         }
         return;
    }
    const randomIndex = Math.floor(Math.random() * drawablePool.length);
    const selectedPowerUp = drawablePool[randomIndex];
    // Package V4: the card leaves the dealer's shoe for this player's seat.
    setShoeDealEvent({
      id: `${playerId}-${Date.now()}`,
      playerId,
      seatIndex: Math.max(0, activePlayers.findIndex(p => p.id === playerId)),
      totalSeats: Math.max(1, activePlayers.length),
    });
    handleBuyPowerUp(playerId, selectedPowerUp, cost);
    if (isFree) setFreeDraws(prev => spendFreeDraw(prev, playerId));
  }, [canPlayerAct, players, powerUpsUsedThisRound, activePowerUps, availablePowerUps, currentSentence, handleBuyPowerUp, mpRoomCode, mpSeats, freeDraws]);

  const handleTogglePowerUpInDeck = useCallback((key: PowerUpKey) => {
    const isCurrentlyActive = selectedPowerUps.includes(key);
    if (isCurrentlyActive) {
      // Deactivate from deck
      setSelectedPowerUps(prev => prev.filter(k => k !== key));
      setAvailablePowerUps(prev => prev.filter(k => k !== key));
      playSound('click');
    } else {
      // Activate in deck
      setSelectedPowerUps(prev => [...prev, key]);
      setAvailablePowerUps(prev => prev.includes(key) ? prev : [...prev, key]);
      playSound('powerUp');
    }
  }, [selectedPowerUps, playSound]);

  const handleToggleAllPowerUps = useCallback((activateAll: boolean) => {
    const allKeys = Object.keys(POWER_UPS) as PowerUpKey[];
    if (activateAll) {
      setSelectedPowerUps(allKeys);
      setAvailablePowerUps(allKeys);
      playSound('powerUp');
    } else {
      setSelectedPowerUps([]);
      setAvailablePowerUps([]);
      playSound('click');
    }
  }, [playSound]);

  const handleOpenSettingsModal = useCallback((tab: SettingsModalTab = 'topic') => {
    playSound('click');
    setSettingsModalTab(tab);
    setShowSettingsModal(true);
  }, [playSound]);

  const handleSaveNextRoundSettings = useCallback((newSettings: Settings) => {
    setNextRoundSettings(newSettings);
    setShowSettingsModal(false);
  }, []);

  // Deals a new sentence for the hand in play: bets, hints and power-ups of the hand are cleared.
  const redealCurrentHand = useCallback((newSettings: Settings) => {
    setBets({});
    setHints({});
    setPowerUpsUsedThisRound({});
    setActivePowerUps({});
    setHighlightedPhrase(null);
    setIsCopied(false);
    setIsSentenceRevealed(false);
    setAvailablePowerUps(selectedPowerUps);
    setRoundSpending({});
    setSimplifiedExplanation({ text: null, loading: false });
    setTurnTimers({});
    setMpRoundTimer({ status: 'idle', remainingMs: turnDurationMs });
    mpAutoStartedRoundRef.current = 0;
    setTeacherRevealOverride(false);
    setMpStudentPendingTarget({});
    setMpStudentPendingWheel({});
    setMpStudentNotifications({});
    setMpSeats(prev => {
      const next: Record<number, MultiplayerSeat> = {};
      (Object.entries(prev) as [string, MultiplayerSeat][]).forEach(([k, seat]) => {
        next[Number(k)] = { ...seat, lockedIn: false };
      });
      return next;
    });
    // Clear any in-flight next-round prefetch so redealing the current hand generates a fresh sentence
    prefetchRef.current = null;
    fetchTargetRoundRef.current = currentRoundRef.current;
    fetchNewSentence(newSettings, pastSentences, undefined, pastMistakes);
  }, [selectedPowerUps, pastSentences, pastMistakes, fetchNewSentence]);

  const handleApplySettingsImmediately = useCallback((newSettings: Settings) => {
    setSettings(newSettings);
    setNextRoundSettings(null);
    setShowSettingsModal(false);
    redealCurrentHand(newSettings);
  }, [redealCurrentHand]);

  // Swap this sentence (package R8): a different sentence for the same hand, with what everyone
  // spent on hints and power-ups during it given back. Settings chosen for the next hand stay.
  const handleSwapSentence = useCallback(() => {
    setPlayers(ps => refundHandSpending(ps, roundSpending));
    redealCurrentHand(settings);
  }, [roundSpending, settings, redealCurrentHand]);

  const handleTargetedPowerUp = useCallback((targetId: number, overridePlayerId?: number, overridePowerUpKey?: PowerUpKey) => {
    const playerId = overridePlayerId ?? showTargetModal?.playerId;
    const powerUpKey = overridePowerUpKey ?? showTargetModal?.powerUp;
    if (playerId === undefined || !powerUpKey) return;
    const powerUpInfo = POWER_UPS[powerUpKey];
    const sourcePlayer = players.find(p => p.id === playerId);
    const targetPlayer = players.find(p => p.id === targetId);
    const isRemoteBuyer = Boolean(mpRoomCode && mpSeats[playerId]);

    const isNonOffensive = NON_OFFENSIVE_TARGETED_POWER_UPS.includes(powerUpKey);
    const ignoresShield = powerUpKey === 'COPYCAT';
    const targetActivePowerUps = (activePowerUps[targetId] || []) as ActivePowerUp[];
    const isTargetShielded = !ignoresShield && hasShieldProtection(targetActivePowerUps);
    const alreadyAttacked = !isNonOffensive && Boolean(mpRoomCode) && isPlayerTargetedThisRound(targetId, powerUpsUsedThisRound, activePowerUps);
    if (isTargetShielded || alreadyAttacked) {
        if (isRemoteBuyer) {
          setMpStudentNotifications(prev => ({
            ...prev,
            [playerId]: {
              id: String(Date.now()),
              title: 'Target Protected!',
              message: alreadyAttacked
                ? `🛡️ ${targetPlayer?.name} has already been targeted once this round! Pick another player.`
                : `🛡️ ${targetPlayer?.name} has a Shield active! Pick another player.`,
              icon: '🛡️',
            },
          }));
        } else {
          setShowTargetModal(null);
          setShowPowerUpModal({ title: "Blocked!", message: `🛡️ ${targetPlayer?.name} has a Shield active! Power-up failed.`, icon: "🛡️" });
        }
        return;
    }
    if (!targetPlayer || !sourcePlayer) return;

    // Check if target has a concealed BOOMERANG trap active (reflects offensive power-ups)
    const isOffensiveAttack = isBoomerangReflected(powerUpKey);
    const targetHasBoomerang = isOffensiveAttack && targetActivePowerUps.some(pu => pu.type === 'BOOMERANG');
    const effectiveTargetId = targetHasBoomerang ? playerId : targetId;
    const effectiveTargetPlayer = targetHasBoomerang ? sourcePlayer : targetPlayer;

    setPowerUpsUsedThisRound(prev => {
        const playerUsage = [...(prev[playerId] || [])];
        let index = -1;
        for(let i = playerUsage.length - 1; i >= 0; i--) {
            if (playerUsage[i].key === powerUpKey && !playerUsage[i].targetId) {
                index = i;
                break;
            }
        }
        if (index === -1) {
            for(let i = playerUsage.length - 1; i >= 0; i--) {
                if (playerUsage[i].key === powerUpKey) {
                    index = i;
                    break;
                }
            }
        }
        if (index !== -1) {
            playerUsage[index] = { ...playerUsage[index], targetId: effectiveTargetId };
        }
        return { ...prev, [playerId]: playerUsage };
    });

    // If Boomerang triggered, consume one BOOMERANG from targetPlayer's activePowerUps
    const removeBoomerangFromTarget = (prevMap: Record<number, ActivePowerUp[]>) => {
      if (!targetHasBoomerang) return prevMap;
      const list = [...(prevMap[targetId] || [])];
      const bIdx = list.findIndex(pu => pu.type === 'BOOMERANG');
      if (bIdx !== -1) {
        list.splice(bIdx, 1);
      }
      return { ...prevMap, [targetId]: list };
    };

    let customModalMessage: string | null = null;

    if (powerUpKey === 'THE_PUNISHER') {
        const newMoney = Math.floor(effectiveTargetPlayer.money * 0.75);
        setPlayers(ps => ps.map(p => p.id === effectiveTargetId ? {...p, money: newMoney} : p));
        if (targetHasBoomerang) {
          setActivePowerUps(prev => removeBoomerangFromTarget(prev));
          customModalMessage = `🪃 BOOMERANG! ${targetPlayer.name} reflected 💀 The Punisher back onto ${sourcePlayer.name}, cutting ${sourcePlayer.name}'s bankroll by 25% (now $${newMoney.toLocaleString()})!`;
        } else {
          customModalMessage = `${powerUpInfo.icon} Cut ${targetPlayer.name}'s bankroll by 25% (now $${newMoney.toLocaleString()}).`;
        }
    } else if (powerUpKey === 'PICKPOCKET') {
        if (targetHasBoomerang) {
          // Attacker gets pickpocketed for 20% by the defender!
          const stolen = Math.floor(sourcePlayer.money * 0.20);
          const newSourceMoney = Math.max(0, sourcePlayer.money - stolen);
          const newTargetMoney = targetPlayer.money + stolen;
          setPlayers(ps => ps.map(p => {
            if (p.id === playerId) return { ...p, money: newSourceMoney };
            if (p.id === targetId) return { ...p, money: newTargetMoney };
            return p;
          }));
          setActivePowerUps(prev => removeBoomerangFromTarget(prev));
          customModalMessage = `🪃 BOOMERANG! ${targetPlayer.name} reflected 🕵️‍♂️ Pickpocket and snatched $${stolen.toLocaleString()} (20%) from ${sourcePlayer.name}!`;
        } else {
          const stolen = Math.floor(targetPlayer.money * 0.20);
          const newTargetMoney = Math.max(0, targetPlayer.money - stolen);
          const newSourceMoney = sourcePlayer.money + stolen;
          setPlayers(ps => ps.map(p => {
            if (p.id === playerId) return { ...p, money: newSourceMoney };
            if (p.id === targetId) return { ...p, money: newTargetMoney };
            return p;
          }));
          customModalMessage = `${powerUpInfo.icon} Pickpocketed $${stolen.toLocaleString()} (20%) from ${targetPlayer.name}!`;
        }
    } else if (powerUpKey === 'SWAP') {
        const sourceFunds = sourcePlayer.money;
        const targetFunds = targetPlayer.money;
        if (targetHasBoomerang) {
          setActivePowerUps(prev => removeBoomerangFromTarget(prev));
          if (sourceFunds < targetFunds) {
            // Poorer attacker tried to Swap with a richer Boomerang holder: steal 25% of attacker's bankroll instead!
            const penalty = Math.floor(sourceFunds * 0.25);
            const newSource = Math.max(0, sourceFunds - penalty);
            const newTarget = targetFunds + penalty;
            setPlayers(ps => ps.map(p => {
              if (p.id === playerId) return { ...p, money: newSource };
              if (p.id === targetId) return { ...p, money: newTarget };
              return p;
            }));
            customModalMessage = `🪃 BOOMERANG! ${targetPlayer.name} deflected ${sourcePlayer.name}'s Swap and seized $${penalty.toLocaleString()} (25% of ${sourcePlayer.name}'s vault)!`;
          } else {
            // Attacker was richer, so the swap favors the defender
            setPlayers(ps => ps.map(p => {
              if (p.id === playerId) return { ...p, money: targetFunds };
              if (p.id === targetId) return { ...p, money: sourceFunds };
              return p;
            }));
            customModalMessage = `🪃 BOOMERANG! ${targetPlayer.name} reflected Swap in their favor ($${targetFunds.toLocaleString()} ↔ $${sourceFunds.toLocaleString()})!`;
          }
        } else {
          setPlayers(ps => ps.map(p => {
              if (p.id === playerId) return { ...p, money: targetFunds };
              if (p.id === targetId) return { ...p, money: sourceFunds };
              return p;
          }));
          setBets(prevBets => {
              let nextBets = { ...prevBets };
              let changed = false;
              if (nextBets[playerId]?.bet && Number(nextBets[playerId].bet) > targetFunds) {
                  nextBets[playerId] = { ...nextBets[playerId], bet: targetFunds };
                  changed = true;
              }
              if (nextBets[targetId]?.bet && Number(nextBets[targetId].bet) > sourceFunds) {
                  nextBets[targetId] = { ...nextBets[targetId], bet: sourceFunds };
                  changed = true;
              }
              return changed ? nextBets : prevBets;
          });
          customModalMessage = `${powerUpInfo.icon} Swapped bankrolls with ${targetPlayer.name} ($${sourceFunds.toLocaleString()} ↔ $${targetFunds.toLocaleString()}).`;
        }
    } else if (powerUpKey === 'CRUCIO') {
        setPlayers(ps => ps.map(p => {
            if (p.id === effectiveTargetId) {
                return { ...p, effects: [...p.effects, { type: 'CRUCIO', roundsLeft: 3 }] };
            }
            return p;
        }));
        if (targetHasBoomerang) {
          setActivePowerUps(prev => removeBoomerangFromTarget(prev));
          customModalMessage = `🪃 BOOMERANG! ${targetPlayer.name} reflected ⛓️ Crucio back onto ${sourcePlayer.name} for 3 rounds!`;
        }
    } else if (powerUpKey === 'SILENCER') {
        const targetUsage = powerUpsUsedThisRound[effectiveTargetId] || [];
        const hasUsedPowerUp = targetUsage.length > 0;
        const duration = hasUsedPowerUp ? 2 : 1;

        setPlayers(ps => ps.map(p => {
            if (p.id === effectiveTargetId) {
                return { ...p, effects: [...p.effects, { type: 'SILENCED', roundsLeft: duration }] };
            }
            return p;
        }));
        if (targetHasBoomerang) {
          setActivePowerUps(prev => removeBoomerangFromTarget(prev));
          customModalMessage = `🪃 BOOMERANG! ${targetPlayer.name} reflected 🤐 Silencer back onto ${sourcePlayer.name}!`;
        }
    } else if (powerUpKey === 'HIGH_ROLLER') {
        const minFloor = Math.max(1, Math.ceil(effectiveTargetPlayer.money * 0.50));
        setActivePowerUps(prev => {
          const base = removeBoomerangFromTarget(prev);
          // Clear any conflicting BET_CAP on effectiveTargetId
          const cleaned: Record<number, ActivePowerUp[]> = {};
          for (const [k, list] of Object.entries(base)) {
            cleaned[Number(k)] = (list || []).filter(
              pu => !(pu.type === 'BET_CAP' && pu.target === effectiveTargetId)
            );
          }
          cleaned[playerId] = [
            ...(cleaned[playerId] || []),
            { type: 'HIGH_ROLLER', target: effectiveTargetId, amount: minFloor },
          ];
          return cleaned;
        });
        setBets(prev => {
          const curBet = prev[effectiveTargetId]?.bet;
          if (curBet === undefined || curBet === '' || Number(curBet) < minFloor) {
            return { ...prev, [effectiveTargetId]: { ...(prev[effectiveTargetId] || {}), bet: minFloor } };
          }
          return prev;
        });
        if (targetHasBoomerang) {
          customModalMessage = `🪃 BOOMERANG! ${targetPlayer.name} reflected 🔥 High Roller back onto ${sourcePlayer.name} (forced minimum bet: $${minFloor.toLocaleString()})!`;
        } else {
          customModalMessage = `${powerUpInfo.icon} Forced ${targetPlayer.name}'s minimum wager to $${minFloor.toLocaleString()} (50% of bankroll) this hand!`;
        }
    } else if (powerUpKey === 'PEEKABOO') {
        setActivePowerUps(prev => ({
          ...prev,
          [playerId]: [...(prev[playerId] || []), { type: 'PEEKABOO', target: targetId }],
        }));
        const tBet = bets[targetId];
        const qType = currentSentence?.questionType || 'binary';
        let spySummary = 'Undecided';
        if (tBet) {
          if (isOptionType(qType)) {
            spySummary = tBet.selectedOption ? `"${tBet.selectedOption}"` : (tBet.splitOptions?.length ? `Split: ${tBet.splitOptions.join(' / ')}` : 'Undecided');
          } else if (isTypedAnswerType(qType)) {
            spySummary = tBet.clozeAnswer ? `"${tBet.clozeAnswer}"` : (tBet.splitClozeAnswers?.some(Boolean) ? `Split: ${tBet.splitClozeAnswers.filter(Boolean).join(' / ')}` : 'Undecided');
          } else {
            spySummary = tBet.opinion === 'correct' ? '✓ Valid' : tBet.opinion === 'incorrect' ? '✕ Flawed' : 'Undecided';
          }
        }
        const wagerStr = typeof tBet?.bet === 'number' ? `$${tBet.bet.toLocaleString()}` : '$0';
        customModalMessage = `${powerUpInfo.icon} Spying on ${targetPlayer.name}: Currently ${spySummary} with a ${wagerStr} wager. Live updates will appear on your betting pad!`;
    } else if (powerUpKey === 'COPYCAT') {
        setActivePowerUps(prev => ({
          ...prev,
          [playerId]: [...(prev[playerId] || []), { type: 'COPYCAT', target: targetId }],
        }));
        customModalMessage = `${powerUpInfo.icon} Copycat linked to ${targetPlayer.name}! If they win this hand, you earn +50% of their winnings; if they miss, you lose $100.`;
    } else if (powerUpKey === 'BLOOD_PACT') {
        setActivePowerUps(prev => ({
          ...prev,
          [playerId]: [...(prev[playerId] || []), { type: 'BLOOD_PACT', target: targetId }],
        }));
        customModalMessage = `${powerUpInfo.icon} Blood Pact sealed between ${sourcePlayer.name} and ${targetPlayer.name}! Both win = +50% bonus each; if one misses, the loser pays $100 to the winner!`;
        if (mpRoomCode && mpSeats[targetId]) {
          setMpStudentNotifications(prev => ({
            ...prev,
            [targetId]: {
              id: String(Date.now() + 1),
              title: '🤝 Blood Pact Sealed!',
              message: `${sourcePlayer.name} linked you in a Blood Pact for this round! If you both get the question right, you both get +50% payout. If one misses, the wrong player pays $100 to the right player!`,
              icon: '🤝',
            },
          }));
        }
    } else {
        setActivePowerUps(prev => {
          const base = removeBoomerangFromTarget(prev);
          // If BET_CAP is applied, remove any conflicting HIGH_ROLLER on effectiveTargetId
          const cleaned: Record<number, ActivePowerUp[]> = {};
          for (const [k, list] of Object.entries(base)) {
            cleaned[Number(k)] =
              powerUpKey === 'BET_CAP'
                ? (list || []).filter(pu => !(pu.type === 'HIGH_ROLLER' && pu.target === effectiveTargetId))
                : [...(list || [])];
          }
          cleaned[playerId] = [
            ...(cleaned[playerId] || []),
            {
              type: powerUpKey,
              target: effectiveTargetId,
              ...(powerUpKey === 'BET_CAP' ? { amount: BET_CAP_AMOUNT } : {}),
            },
          ];
          return cleaned;
        });
        if (targetHasBoomerang) {
          customModalMessage = `🪃 BOOMERANG! ${targetPlayer.name} reflected ${powerUpInfo.icon} ${powerUpInfo.name} back onto ${sourcePlayer.name}!`;
        }
    }
    
    // Automatically clamp effective target's bet even if their bet is already locked
    if (powerUpKey === 'BET_CAP') {
      setBets(prev => {
        const targetBet = prev[effectiveTargetId]?.bet;
        if (targetBet !== undefined && targetBet !== '' && Number(targetBet) > BET_CAP_AMOUNT) {
          return { ...prev, [effectiveTargetId]: { ...(prev[effectiveTargetId] || {}), bet: BET_CAP_AMOUNT } };
        }
        return prev;
      });
    }

    if (targetHasBoomerang && mpRoomCode && mpSeats[targetId]) {
      setMpStudentNotifications(prev => ({
        ...prev,
        [targetId]: {
          id: String(Date.now() + 2),
          title: '🪃 Boomerang Triggered!',
          message: `Your Boomerang reflected ${sourcePlayer.name}'s ${powerUpInfo.name} right back at them!`,
          icon: '🪃',
        },
      }));
    }

    playSound(targetHasBoomerang ? 'boomerangWhoosh' : 'powerUp');
    if (targetHasBoomerang) {
      const attackerIdx = Math.max(0, activePlayers.findIndex(p => p.id === playerId));
      const defenderIdx = Math.max(0, activePlayers.findIndex(p => p.id === targetId));
      setBoomerangArcEvent({
        id: `${playerId}-${targetId}-${Date.now()}`,
        attackerSeatIndex: attackerIdx,
        defenderSeatIndex: defenderIdx,
        totalSeats: Math.max(1, activePlayers.length),
      });
    } else {
      // Package V4: the card flies across the felt to the player it was used on.
      pendingFlightRef.current = ({
        id: `${playerId}-${targetId}-${powerUpKey}-${Date.now()}`,
        fromPlayerId: playerId,
        toPlayerId: targetId,
        fromSeatIndex: Math.max(0, activePlayers.findIndex(p => p.id === playerId)),
        toSeatIndex: Math.max(0, activePlayers.findIndex(p => p.id === targetId)),
        totalSeats: Math.max(1, activePlayers.length),
        palette: flightPalette(powerUpKey),
      });
    }
    const finalMsg = customModalMessage || `${powerUpInfo.icon} Used ${powerUpInfo.name} on ${targetPlayer.name}: ${plainDescriptionOf(powerUpKey)}`;
    if (isRemoteBuyer) {
      setMpStudentPendingTarget(prev => {
        const next = { ...prev };
        delete next[playerId];
        return next;
      });
      setMpStudentNotifications(prev => ({
        ...prev,
        [playerId]: { id: String(Date.now()), title: targetHasBoomerang ? '🪃 Boomerang Reflected!' : powerUpInfo.name, message: finalMsg, icon: targetHasBoomerang ? '🪃' : powerUpInfo.icon },
      }));
    } else {
      setShowTargetModal(null);
    }
    setActiveCutIn({
      id: `${playerId}-${targetId}-${powerUpKey}-${Date.now()}`,
      attackerName: targetHasBoomerang ? targetPlayer.name : sourcePlayer.name,
      attackerAvatar: targetHasBoomerang ? targetPlayer.avatar : sourcePlayer.avatar,
      targetName: targetHasBoomerang ? sourcePlayer.name : targetPlayer.name,
      targetAvatar: targetHasBoomerang ? sourcePlayer.avatar : targetPlayer.avatar,
      powerUpName: powerUpInfo.name,
      powerUpIcon: powerUpInfo.icon,
      isBoomerang: targetHasBoomerang,
      subtitle: finalMsg,
    });
    setShowPowerUpModal({
      title: targetHasBoomerang ? '🪃 Boomerang Reflected!' : powerUpInfo.name,
      message: finalMsg,
      icon: targetHasBoomerang ? '🪃' : powerUpInfo.icon,
    });
  }, [players, showTargetModal, activePowerUps, powerUpsUsedThisRound, playSound, mpRoomCode, mpSeats, bets, currentSentence]); 

  // True when the buyer of a targeted power-up has at least one player they can pick
  const hasSelectableTarget = useCallback((buyerId: number, powerUpKey: PowerUpKey): boolean => {
    const isNonOffensive = NON_OFFENSIVE_TARGETED_POWER_UPS.includes(powerUpKey);
    const ignoresShield = powerUpKey === 'COPYCAT';
    return players.some(p => {
      if (p.id === buyerId || p.money <= 0) return false;
      const targetActive = (activePowerUps[p.id] || []) as ActivePowerUp[];
      const hasShield = !ignoresShield && hasShieldProtection(targetActive);
      const alreadyAttacked = !isNonOffensive && Boolean(mpRoomCode) && isPlayerTargetedThisRound(p.id, powerUpsUsedThisRound, activePowerUps);
      return !hasShield && !alreadyAttacked;
    });
  }, [players, activePowerUps, mpRoomCode, powerUpsUsedThisRound]);

  const handleCancelTargetModal = useCallback((overridePlayerId?: number, overridePowerUpKey?: PowerUpKey) => {
    const playerId = overridePlayerId ?? showTargetModal?.playerId;
    const powerUpKey = overridePowerUpKey ?? showTargetModal?.powerUp;
    if (playerId === undefined || !powerUpKey) return;
    // Swap is refundable only when nobody can be targeted, so the dialog always has an exit (F4 fix 11)
    if (!canCancelPowerUpTarget(powerUpKey, hasSelectableTarget(playerId, powerUpKey))) return;
    // A free Spotlight draw gives nothing back (package G6).
    const usedList = powerUpsUsedThisRound[playerId] || [];
    const usedEntry = usedList[usedList.map(u => u.key).lastIndexOf(powerUpKey)];
    const refund = usedEntry?.cost ?? POWERUP_COST;
    setPlayers(ps => ps.map(p => p.id === playerId ? { ...p, money: p.money + refund } : p));
    setPowerUpsUsedThisRound(prev => {
      const list = prev[playerId] || [];
      const idx = list.map(u => u.key).lastIndexOf(powerUpKey);
      if (idx !== -1) {
        const next = [...list];
        next.splice(idx, 1);
        return { ...prev, [playerId]: next };
      }
      return prev;
    });
    setRoundSpending(s => ({ ...s, [playerId]: Math.max(0, (s[playerId] || 0) - refund) }));
    setAvailablePowerUps(avail => avail.includes(powerUpKey) ? avail : [...avail, powerUpKey]);
    if (mpRoomCode && mpSeats[playerId]) {
      setMpStudentPendingTarget(prev => {
        const next = { ...prev };
        delete next[playerId];
        return next;
      });
    } else {
      setShowTargetModal(null);
    }
    playSound('click');
  }, [showTargetModal, playSound, mpRoomCode, mpSeats, hasSelectableTarget, powerUpsUsedThisRound]);

  // --- Multiplayer Host Lifecycle & Intent Dispatcher ---
  useEffect(() => {
    mpEventHandlerRef.current = (event: HostEventPayload) => {
      // Package T3: the teacher's remote is never a player.
      const pair = remotePairRef.current;
      if ((event.type === 'STUDENT_JOINED' || event.type === 'STUDENT_RECONNECTED') && event.seat && isRemoteAvatar(event.seat.avatar)) {
        const seatId = event.seat.playerId;
        const keyOk = Boolean(pair && pair.code === mpRoomCode && event.seat.avatar === remoteAvatar(pair.key));
        // One remote at a time: a second phone with the same link is refused.
        if (keyOk && pair && (pair.seatId === null || pair.seatId === seatId)) {
          setRetiredRemoteSeats(prev => prev.filter(id => id !== seatId));
          setRemotePair({ ...pair, seatId });
          setShowRemotePair(false);
          setRemoteNotice(null);
          if (pair.seatId === null) playSound('success');
          logEvent('room', 'Teacher remote paired');
        } else {
          // Not kicked: a kick bans the phone from the room, and it may be a student who scanned the code.
          logEvent('room', 'A remote link that is not current was refused');
          setRetiredRemoteSeats(prev => (prev.includes(seatId) ? prev : [...prev, seatId]));
        }
        return;
      }
      if (event.playerId !== undefined && (event.playerId === pair?.seatId || retiredRemoteSeatsRef.current.includes(event.playerId))) {
        if (event.playerId === pair?.seatId && event.type === 'STUDENT_INTENT' && event.intent?.type === 'REMOTE_COMMAND') {
          const action = event.intent.action;
          const button = isRemoteAction(action) && typeof document !== 'undefined' ? findHotkeyButton(document, action) : null;
          if (button) {
            button.click();
            setRemoteNotice(null);
          } else {
            setRemoteNotice('That is not available right now.');
          }
        }
        return;
      }
      if ((event.type === 'STUDENT_JOINED' || event.type === 'STUDENT_RECONNECTED') && event.playerId !== undefined) {
        mpLastSeenRef.current[event.playerId] = Date.now();
        const seenId = event.playerId;
        setMpAwayIds(prev => (prev.includes(seenId) ? prev.filter(id => id !== seenId) : prev));
      }
      if (event.type === 'STUDENT_JOINED' && event.seat) {
        const seat = event.seat;
        const { playerId, avatar } = seat;
        playSound('addPlayer');
        setPlayers(prev => {
          // Package T4: with a class loaded, a phone named like a listed student takes that place.
          if (activeCloudRoster && step === 'PLAYER_SETUP' && !prev.some(p => p.id === playerId)) {
            const at = classListMatch(prev, Object.keys(mpSeatsRef.current).map(Number), seat.name);
            if (at !== -1) return prev.map((p, i) => (i === at ? { ...p, id: playerId, avatar: avatar || p.avatar } : p));
          }
          // Package R6: classroom-safe and unique at the table ("Ana 2").
          const name = safePlayerName(seat.name, prev.filter(p => p.id !== playerId).map(p => p.name));
          if (prev.some(p => p.id === playerId)) {
            return prev.map(p => p.id === playerId ? { ...p, name, avatar } : p);
          }
          return [
            ...prev,
            {
              id: playerId,
              name,
              money: startingCash,
              history: [],
              avatar: avatar || getRandomCharacterAvatar(prev.map(p => p.avatar)),
              winStreak: 0,
              effects: [],
            },
          ];
        });
        setMpSeats(prev => ({
          ...prev,
          [playerId]: {
            ...seat,
            connected: true,
            lockedIn: prev[playerId]?.lockedIn ?? (step === 'IN_GAME' && isTurnTimerEnabled && mpRoundTimer.status === 'locked'),
            lastSeen: Date.now(),
          },
        }));
      } else if (event.type === 'STUDENT_RECONNECTED' && event.seat) {
        const seat = event.seat;
        const { playerId, name, avatar } = seat;
        setPlayers(prev => prev.map(p => p.id === playerId
          ? { ...p, name: name ? safePlayerName(name, prev.filter(o => o.id !== playerId).map(o => o.name)) : p.name, avatar: avatar || p.avatar }
          : p));
        setMpSeats(prev => ({
          ...prev,
          [playerId]: {
            ...(prev[playerId] || seat),
            connected: true,
            lastSeen: Date.now(),
          },
        }));
      } else if (event.type === 'SEAT_TAKEOVER_REQUEST' && event.takeover) {
        const request = event.takeover;
        playSound('hint');
        setMpTakeoverRequests(prev => [...prev.filter(r => r.clientId !== request.clientId), request]);
      } else if (event.type === 'SEAT_TAKEOVER_CLOSED' && event.takeover) {
        const closedClientId = event.takeover.clientId;
        setMpTakeoverRequests(prev => prev.filter(r => r.clientId !== closedClientId));
      } else if (event.type === 'STUDENT_DISCONNECTED' && event.playerId !== undefined) {
        const playerId = event.playerId;
        logEvent('room', `Seat ${playerId} disconnected`);
        setMpSeats(prev => {
          if (!prev[playerId]) return prev;
          return {
            ...prev,
            [playerId]: { ...prev[playerId], connected: false },
          };
        });
      } else if (event.type === 'STUDENT_INTENT' && event.playerId !== undefined && event.intent) {
        const playerId = event.playerId;
        const intent = event.intent;
        // Package R2: remember when the phone was heard from, without rebroadcasting the table.
        mpLastSeenRef.current[playerId] = Date.now();
        setMpAwayIds(prev => (prev.includes(playerId) ? prev.filter(id => id !== playerId) : prev));

        // While the teacher has paused the hand, phones cannot bet, lock in or buy (package R8).
        if (isPausedRef.current && intent.type !== 'UPDATE_PROFILE' && intent.type !== 'HEARTBEAT') {
          logEvent('intent', `Seat ${playerId}: ${intent.type} ignored because the hand is paused`);
          return;
        }

        switch (intent.type) {
          case 'SET_BET': {
            handleBetChange(playerId, intent.field, intent.value);
            break;
          }
          case 'SET_FULL_BET': {
            // Normal lock checks apply; only the LOCK_IN intent itself may push past them (F4 fix 4).
            const entries = Object.entries(intent.bet || {}) as [keyof Bet, any][];
            entries.forEach(([field, val]) => {
              handleBetChange(playerId, field, val);
            });
            break;
          }
          case 'LOCK_IN': {
            const isMpTimeUp =
              isTurnTimerEnabled &&
              (mpRoundTimer.status === 'locked' ||
                (mpRoundTimer.status === 'running' &&
                  !mpRoundTimer.held &&
                  getTimerRemainingMs(mpRoundTimer, turnDurationMs) <= 0) ||
                (mpRoundTimer.status === 'paused' &&
                  (mpRoundTimer.remainingMs ?? 1) <= 0));

            if (isMpTimeUp && mpRoundTimer.status === 'running') {
              mpTimerAutoPausedByAllLockedRef.current = false;
              setMpRoundTimer({ status: 'locked', remainingMs: 0, held: false, endsAt: undefined });
              setTeacherRevealOverride(true);
              setMpSeats(prev => {
                const next: Record<number, MultiplayerSeat> = {};
                (Object.entries(prev) as [string, MultiplayerSeat][]).forEach(([k, seat]) => {
                  next[Number(k)] = { ...seat, lockedIn: true };
                });
                return next;
              });
            }

            const seatWasLocked = Boolean(mpSeats[playerId]?.lockedIn);
            const mayLockIn = canSubmitBetWithLock({
              isLockingIntent: Boolean(intent.locked),
              seatLocked: seatWasLocked,
              timeUp: isMpTimeUp,
              frozen: isPlayerFrozen(playerId),
            });
            if (intent.bet && mayLockIn) {
              const entries = Object.entries(intent.bet) as [keyof Bet, any][];
              entries.forEach(([field, val]) => {
                handleBetChange(playerId, field, val, true);
              });
            }
            if (intent.locked) {
              playSound('bet');
              setMpSeats(prev => {
                if (!prev[playerId]) return prev;
                return { ...prev, [playerId]: { ...prev[playerId], lockedIn: true } };
              });
            } else if (step === 'IN_GAME' && !isProcessing && !isMpTimeUp) {
              setMpSeats(prev => {
                if (!prev[playerId]) return prev;
                return { ...prev, [playerId]: { ...prev[playerId], lockedIn: false } };
              });
            }
            break;
          }
          case 'BUY_HINT': {
            handleGetHint(playerId);
            break;
          }
          case 'BUY_RANDOM_POWER_UP': {
            handleBuyRandomPowerUp(playerId);
            break;
          }
          case 'SELECT_POWER_UP_TARGET': {
            // Only a purchase the host recorded can be used; the phone's key is ignored (F4 fix 2).
            const pendingKey = resolvePendingPowerUp(mpStudentPendingTarget[playerId]);
            if (pendingKey) {
              handleTargetedPowerUp(intent.targetId, playerId, pendingKey);
            }
            break;
          }
          case 'CANCEL_POWER_UP_TARGET': {
            // Refund only a purchase the host recorded (F4 fix 3).
            const pendingKey = resolvePendingPowerUp(mpStudentPendingTarget[playerId]);
            if (pendingKey) {
              handleCancelTargetModal(playerId, pendingKey);
            }
            break;
          }
          case 'APPLY_WHEEL_RESULT': {
            // The prize is the one the host drew at purchase; intent.itemId is ignored (F4 fix 1).
            const drawnItem = resolveWheelResult(mpStudentPendingWheel[playerId]);
            if (drawnItem) {
              playSound('powerUp');
              handleApplyWheelResult(playerId, drawnItem);
            }
            break;
          }
          case 'FEEDBACK_REACTION': {
            if (step !== 'RESULTS' || intent.round !== currentRound) break;
            if (intent.value !== 'gotIt' && intent.value !== 'confused') break;
            setHandReactions(prev => recordReaction(prev, intent.round, playerId, intent.value));
            break;
          }
          case 'UPDATE_PROFILE': {
            const cleanName = sanitizePlayerName(intent.name);
            // Names are set before the game; once hands are dealt a phone may only change its avatar (R6).
            if (cleanName && (step === 'PLAYER_SETUP' || step === 'SETTINGS')) handleUpdatePlayerName(playerId, cleanName);
            if (isKnownAvatar(intent.avatar)) handleUpdateAvatar(playerId, intent.avatar.trim());
            break;
          }
        }
      }
    };
  }, [
    playSound,
    startingCash,
    handleBetChange,
    step,
    isProcessing,
    isTurnTimerEnabled,
    mpRoundTimer,
    turnDurationMs,
    handleGetHint,
    handleBuyRandomPowerUp,
    mpStudentPendingTarget,
    handleTargetedPowerUp,
    handleCancelTargetModal,
    mpStudentPendingWheel,
    handleApplyWheelResult,
    handleUpdatePlayerName,
    mpSeats,
    activeCloudRoster,
    isPlayerFrozen,
    currentRound,
  ]);

  const handleCreateMpRoom = useCallback(async () => {
    await startHostMultiplayerRoom();
  }, []);

  const handleCloseMpRoom = useCallback(() => {
    playSound('click');
    if (isDemoRef.current) {
      endDemoRoom();
      return;
    }
    if (mpControllerRef.current) {
      mpControllerRef.current.destroy();
      mpControllerRef.current = null;
    }
    setMpRoomCode(null);
    setMpRoomLocked(false);
    setMpHostConnected(false);
    setMpSeats({});
    setMpStudentPendingTarget({});
    setMpStudentPendingWheel({});
    setMpStudentNotifications({});
    setShowMpLobbyModal(false);
    prefetchRef.current = null;
  }, [playSound]);

  // Package R6: "Late joiners" off locks the room by itself when the first hand is dealt.
  // Phones already seated can still come back; the teacher can open the room again.
  const [lateJoinersAllowed, setLateJoinersAllowed] = useState<boolean>(() => safeLocalStorage.getItem('grammar_casino_late_joiners') !== 'off');
  useEffect(() => {
    safeLocalStorage.setItem('grammar_casino_late_joiners', lateJoinersAllowed ? 'on' : 'off');
  }, [lateJoinersAllowed]);
  const lateLockDoneRef = useRef(false);
  useEffect(() => {
    if (step === 'PLAYER_SETUP' || step === 'SETTINGS') {
      lateLockDoneRef.current = false;
      return;
    }
    if (step !== 'IN_GAME' || lateJoinersAllowed || !mpRoomCode || lateLockDoneRef.current) return;
    lateLockDoneRef.current = true;
    if (!mpRoomLocked) {
      setMpRoomLocked(true);
      mpControllerRef.current?.setRoomLocked(true);
      logEvent('room', 'Room locked at the first hand (late joiners off)');
    }
  }, [step, lateJoinersAllowed, mpRoomCode, mpRoomLocked]);

  const handleToggleLockMpRoom = useCallback(() => {
    playSound('click');
    setMpRoomLocked(prev => {
      const next = !prev;
      mpControllerRef.current?.setRoomLocked(next);
      return next;
    });
  }, [playSound]);

  const handleKickMpPlayer = useCallback((playerId: number) => {
    playSound('lose', 0);
    mpControllerRef.current?.kickPlayer(playerId);
    setMpSeats(prev => {
      const next = { ...prev };
      delete next[playerId];
      return next;
    });
    setPlayers(prev => prev.filter(p => p.id !== playerId));
  }, [playSound]);

  const handleBailoutBankruptPlayers = useCallback(() => {
    playSound('win', 0);
    setPlayers(prev => prev.map(p => p.money <= 0 ? { ...p, money: HOUSE_BAILOUT_AMOUNT } : p));
  }, [playSound]);

  // On unmount, stop listening but keep the room open and saved: a real page close never
  // runs this, and in development React unmounts once on purpose (StrictMode).
  useEffect(() => {
    return () => {
      mpControllerRef.current?.detach();
    };
  }, []);

  // Reopen the live room after the teacher's page reloads (package R1). Phones keep their
  // seats and bets: the room code, seats and handled intents were saved by the controller,
  // and the game itself comes back from the saved game state.
  useEffect(() => {
    if (isStudentControllerMode) return;
    const saved = loadSavedHostRoom();
    if (!saved) return;
    const controller = HostRoomController.resumeRoom(
      saved,
      (ev) => mpEventHandlerRef.current(ev),
      (connected) => setMpHostConnected(connected)
    );
    mpControllerRef.current = controller;
    const seats: Record<number, MultiplayerSeat> = {};
    controller.getSeats().forEach((seat) => {
      if (isRemoteAvatar(seat.avatar)) return; // the teacher's remote is never a player
      seats[seat.playerId] = seat;
    });
    setMpSeats(seats);
    setMpRoomLocked(controller.isLocked());
    setMpRoomCode(controller.code);
    setMpResumeNotice(`Room ${controller.code} is open again. Phones keep their seats and bets.`);
    return () => {
      if (mpControllerRef.current === controller) {
        controller.detach();
        mpControllerRef.current = null;
      }
    };
    // Runs once on load; the phone view never hosts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Package T7: the coach opens by itself on this computer's first visit to the lobby.
  useEffect(() => {
    let forced = false;
    try {
      forced = new URLSearchParams(window.location.search).get('coach') === '1';
    } catch {
      forced = false;
    }
    if (shouldShowCoach({ seen: safeLocalStorage.getItem(COACH_SEEN_KEY), step, studentPhone: isStudentControllerMode, testMode: isE2eMode(), forced })) {
      setShowCoach(true);
    }
    // Only on load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mpResumeNotice) return;
    const timer = setTimeout(() => setMpResumeNotice(null), 8000);
    return () => clearTimeout(timer);
  }, [mpResumeNotice]);

  // Broadcast per-player filtered views whenever relevant game state changes
  useEffect(() => {
    if (!mpRoomCode || !mpControllerRef.current) return;
    const views = buildAllPlayerViews({
      roomCode: mpRoomCode,
      roomLocked: mpRoomLocked,
      step,
      currentRound,
      totalRounds: typeof totalRounds === 'string' ? parseInt(totalRounds, 10) || 10 : totalRounds,
      gameMode,
      targetAmount: typeof targetAmount === 'string' ? parseInt(targetAmount, 10) || DEFAULT_TARGET_AMOUNT : targetAmount,
      settings,
      customTopic,
      customTheme,
      currentSentence,
      isLoading,
      isProcessing,
      players,
      seats: mpSeats,
      bets,
      hints,
      activePowerUps,
      powerUpsUsedThisRound,
      availablePowerUps,
      roundResults,
      roundHistory,
      winner,
      studentPendingTarget: mpStudentPendingTarget,
      studentPendingWheel: mpStudentPendingWheel,
      studentNotifications: mpStudentNotifications,
      roundTimer: isTurnTimerEnabled ? mpRoundTimer : undefined,
      turnDurationMs: isTurnTimerEnabled ? turnDurationMs : 0,
      calmMode: isCalmMode,
      paused: isPaused,
      specialHand: currentSpecialHand
        ? {
            title: SPECIAL_HAND_INFO[currentSpecialHand].title,
            rule: SPECIAL_HAND_INFO[currentSpecialHand].rule,
            icon: SPECIAL_HAND_INFO[currentSpecialHand].icon,
            ...(isSentenceHiddenForListening ? { hidesSentence: true } : {}),
          }
        : null,
      freeDraws,
    });
    // Package S4: once bets close (everyone here locked in, or time is up), the phones see the room's split.
    if (step === 'IN_GAME' && currentSentence && !isPaused) {
      const here = activePlayers.filter(p => mpSeats[p.id] && !mpAwayIds.includes(p.id));
      const closed = (here.length > 0 && here.every(p => mpSeats[p.id]?.lockedIn)) || (isTurnTimerEnabled && mpRoundTimer.status === 'locked');
      if (closed) {
        const qt = (currentSentence.questionType || 'binary') as QuestionType;
        const line = roomSplitLine(qt, answerSplit({
          qType: qt,
          bets,
          playerIds: here.map(p => p.id),
          sentenceIsCorrect: currentSentence.isCorrect,
          options: currentSentence.options,
          isRightAnswer: () => false,
        }));
        if (line) for (const id of Object.keys(views)) views[Number(id)] = { ...views[Number(id)], betsSplit: line };
      }
    }
    // Package T3: the remote gets the shared table plus its own view, never a player's.
    const pairNow = remotePair;
    const base = Object.values(views)[0] as unknown as Record<string, unknown> | undefined;
    const shared: Record<string, unknown> = {};
    if (base) for (const k of SHARED_VIEW_KEYS) if (base[k] !== undefined) shared[k] = base[k];
    for (const id of retiredRemoteSeats) {
      if (id !== pairNow?.seatId) views[id] = { ...shared, remote: { ended: true } } as unknown as typeof views[number];
    }
    if (pairNow && pairNow.seatId !== null && pairNow.code === mpRoomCode) {
      views[pairNow.seatId] = {
        ...shared,
        remote: buildRemoteView({
          step,
          round: currentRound,
          totalRounds: gameMode === 'rounds' ? Number(totalRounds) || null : null,
          paused: isPaused,
          sentence: currentSentence,
          players: activePlayers.map(p => ({ id: p.id, name: p.name })),
          lockedIds: Object.values(mpSeats).filter(s => s.lockedIn).map(s => s.playerId),
          awayIds: mpAwayIds,
          reactions: handReactions[currentRound] ? reactionCounts(handReactions, currentRound) : null,
          notice: remoteNotice,
        }),
      } as unknown as typeof views[number];
    }
    mpControllerRef.current.pushViews(views);
  }, [
    remotePair,
    retiredRemoteSeats,
    remoteNotice,
    handReactions,
    mpAwayIds,
    activePlayers,
    freeDraws,
    isSentenceHiddenForListening,
    isCalmMode,
    isPaused,
    currentSpecialHand,
    mpRoomCode,
    mpRoomLocked,
    step,
    currentRound,
    totalRounds,
    gameMode,
    targetAmount,
    settings,
    customTopic,
    customTheme,
    currentSentence,
    isLoading,
    isProcessing,
    players,
    mpSeats,
    bets,
    hints,
    activePowerUps,
    powerUpsUsedThisRound,
    availablePowerUps,
    roundResults,
    roundHistory,
    winner,
    mpStudentPendingTarget,
    mpStudentPendingWheel,
    mpStudentNotifications,
    isTurnTimerEnabled,
    mpRoundTimer,
    turnDurationMs,
  ]); 

  const verifyPlayerCorrections = useCallback(async () => {
    const qType: QuestionType = currentSentence?.questionType || 'binary';
    if (!currentSentence || qType !== 'binary' || currentSentence.isCorrect) return {}; 
    const playersToVerify = activePlayers.filter(p => {
        if (isPlayerFrozen(p.id)) return false;
        if (isTurnTimerEnabled && !mpRoomCode && !hasPlayerPlacedBet(p.id)) return false;
        const b = bets[p.id];
        if (!b) return false;
        
        const hasSplitBet = (activePowerUps[p.id] || []).some(pu => pu.type === 'SPLIT_BET');
        const isIncorrectVote = hasSplitBet 
            ? (b.splitCorrectPercent ?? 50) < 100 
            : b.opinion === 'incorrect';
            
        return isIncorrectVote && b.userCorrection?.trim();
    });

    if (playersToVerify.length === 0) return {};

    // Deduplicate normalized corrections across the classroom so identical student answers are verified once in parallel
    const normalizeText = (s: string) =>
      s.trim().toLowerCase().replace(/[.!?]+$/g, '').replace(/\s+/g, ' ');

    const officialNorm = normalizeText(currentSentence.correction || '');
    const verifications: Record<number, { isCorrect: boolean; feedback: string }> = {};
    const uniqueGroups = new Map<string, { rawText: string; playerIds: number[] }>();

    for (const player of playersToVerify) {
      const rawCorrection = (bets[player.id]?.userCorrection || '').trim();
      const norm = normalizeText(rawCorrection);
      if (officialNorm && norm === officialNorm) {
        verifications[player.id] = {
          isCorrect: true,
          feedback: 'Exact match with House revision!',
        };
      } else {
        const existing = uniqueGroups.get(norm);
        if (existing) {
          existing.playerIds.push(player.id);
        } else {
          uniqueGroups.set(norm, { rawText: rawCorrection, playerIds: [player.id] });
        }
      }
    }

    if (uniqueGroups.size > 0) {
      setProcessingStatus(
        `Verifying ${uniqueGroups.size} unique correction(s) across ${playersToVerify.length} player(s)...`
      );
      // Package R5: at most 4 AI checks at once, so a full class does not flood the AI.
      await mapWithLimit(Array.from(uniqueGroups.values()), 4, async (group) => {
          try {
            const res = await GeminiService.verifyCorrection(
              currentSentence.text,
              group.rawText,
              currentSentence.correction,
              currentSentence.errorPhrase,
              currentSentence.acceptedAnswers
            );
            group.playerIds.forEach((pid) => {
              verifications[pid] = res;
            });
          } catch {
            group.playerIds.forEach((pid) => {
              verifications[pid] = {
                isCorrect: false,
                feedback: 'AI Judge could not verify due to an error.',
              };
            });
          }
        });
    }

    setProcessingStatus('');
    return verifications;
  }, [activePlayers, isPlayerFrozen, isTurnTimerEnabled, mpRoomCode, hasPlayerPlacedBet, bets, currentSentence, activePowerUps]);

  const revealResultsCore = useCallback(async (force = false) => {
    const unfrozenPlayersForAway = activePlayers.filter(p => !isPlayerFrozen(p.id)).map(p => p.id);
    // "Reveal now" (package R8) reveals even when not everyone is in, like the early-reveal switch.
    const revealOverride = teacherRevealOverride || force || (Boolean(mpRoomCode) && mpAwayIds.some(id => unfrozenPlayersForAway.includes(id)));
    const unfrozenPlayers = activePlayers.filter(p => !isPlayerFrozen(p.id));
    const qType: QuestionType = currentSentence?.questionType || 'binary';

    if (mpRoomCode) {
      const allMpReady = isEveryRoomPlayerReady({
        // Away phones (package R2) do not hold up the reveal; they sit the hand out.
        playerIds: unfrozenPlayers.filter(p => !mpAwayIds.includes(p.id)).map(p => p.id),
        bets,
        activePowerUps,
        questionType: qType,
        baseWord: currentSentence?.baseWord,
        seats: mpSeats,
      });
      if (!allMpReady && !revealOverride) {
        setError({
          title: "Bets Not Locked In",
          message: "Every active player must lock in their wager before revealing results (or use Teacher Override)."
        });
        return;
      }
    } else if (isTurnTimerEnabled) {
      const allLocked = unfrozenPlayers.every(p => turnTimers[p.id]?.status === 'locked');
      if (!allLocked && !revealOverride) {
        setError({ title: "Turns Still Active", message: "Every active player's turn must be locked before revealing results (or use Teacher Override)." });
        return;
      }
    } else {
      let hasUnchangedBaseWordPlayer: string | null = null;
      let hasInvalidKwtPlayer: string | null = null;
      const allValidBetsFinalized = unfrozenPlayers.every(p => {
        const hasSplitBet = (activePowerUps[p.id] || []).some(pu => pu.type === 'SPLIT_BET');
        const problem = checkBet(bets[p.id], qType, hasSplitBet, currentSentence?.baseWord, { strictSplitBaseWord: true });
        if (problem === 'unchangedBaseWord') hasUnchangedBaseWordPlayer = p.name;
        if (problem === 'invalidKeyWord') hasInvalidKwtPlayer = p.name;
        return problem === null;
      });

      if (!allValidBetsFinalized && !revealOverride) { 
        const promptMsg = hasUnchangedBaseWordPlayer
          ? `${hasUnchangedBaseWordPlayer} typed the unchanged base word "(${(currentSentence?.baseWord || '').toUpperCase()})". Players must transform the base word into a new grammatical form before revealing results!`
          : hasInvalidKwtPlayer
            ? `${hasInvalidKwtPlayer}'s answer must use 2 to 6 words and include the exact unchanged KEY WORD "${(currentSentence?.baseWord || '').toUpperCase()}"!`
            : isOptionType(qType)
              ? "All active (unfrozen) players must choose an option and enter a bet."
              : qType === 'keyWordTransformation'
                ? `All active (unfrozen) players must type a 2–6 word phrase containing "${(currentSentence?.baseWord || '').toUpperCase()}" and enter a bet.`
                : qType === 'wordFormation'
                  ? "All active (unfrozen) players must type a transformed form of the base word and enter a bet."
                  : qType === 'openCloze'
                    ? "All active (unfrozen) players must type their missing word(s) and enter a bet."
                    : "All active (unfrozen) players must select an opinion and enter a bet.";
        setError({
          title: hasUnchangedBaseWordPlayer
            ? "Transform the Base Word!"
            : hasInvalidKwtPlayer
              ? "Check Key Word & Word Count!"
              : "Invalid Bets",
          message: promptMsg,
        });
        return;
      }
    }

    if (!currentSentence) {
      setError({ title: "Game Error", message: "No sentence loaded to evaluate."});
      return;
    }

    const seatsBeforeReveal = mpSeats;
    const turnTimersBeforeReveal = turnTimers;
    // Lock all active players' timers or multiplayer seats when results are revealed
    if (mpRoomCode) {
      setMpSeats(prev => {
        const next: Record<number, MultiplayerSeat> = {};
        (Object.entries(prev) as [string, MultiplayerSeat][]).forEach(([k, seat]) => {
          next[Number(k)] = { ...seat, lockedIn: true };
        });
        return next;
      });
    } else if (isTurnTimerEnabled) {
      setTurnTimers(prev => {
        const next = { ...prev };
        activePlayers.forEach(p => {
          next[p.id] = {
            status: 'locked',
            remainingMs: 0,
            held: false,
            endsAt: undefined,
            skipped: prev[p.id]?.skipped || isPlayerFrozen(p.id),
          };
        });
        return next;
      });
    }

    // Active participating players (excluding frozen players and players who sat out without placing a bet)
    const validPlayers = unfrozenPlayers.filter(p =>
      (isTurnTimerEnabled && !mpRoomCode) ? hasPlayerPlacedBet(p.id) : hasPlayerPlacedBet(p.id) || !revealOverride
    );

    playSound('drumroll');
    setIsProcessing(true);
    let aiGradingFailed = false;

    // 1. Binary mode correction verification
    const verifications = await verifyPlayerCorrections();

    // 2. Open Cloze, Word Formation & Key Word Transformation instant (0ms) + single batched AI verification
    const { acceptedSet, baseWordNorm } = buildAcceptedAnswerSet(currentSentence, qType);

    const clozeWordVerifications: Record<string, { isCorrect: boolean; marks?: 0 | 1 | 2; feedback: string }> = {};
    // Word order is judged exactly; only open cloze and word formation ask the AI.
    if (qType === 'openCloze' || qType === 'wordFormation') {
      const unmatchedWordsMap = new Map<string, number>(); // normalizedWord -> representative playerId
      validPlayers.forEach(p => {
        const b = bets[p.id];
        if (!b) return;
        const pSplit = (activePowerUps[p.id] || []).some(pu => pu.type === 'SPLIT_BET');
        const candidateWords = pSplit
          ? [b.splitClozeAnswers?.[0], b.splitClozeAnswers?.[1]]
          : [b.clozeAnswer];

        candidateWords.forEach(rawWord => {
          const norm = normalizeGapAnswer(rawWord);
          if (!norm) return;
          if (baseWordNorm && norm === baseWordNorm) {
            clozeWordVerifications[norm] = {
              isCorrect: false,
              feedback: `Must transform the base word "${(currentSentence.baseWord || '').toUpperCase()}" into a new grammatical form!`,
            };
            return;
          }
          if (acceptedSet.has(norm)) {
            // Instant 0ms match!
            clozeWordVerifications[norm] = {
              isCorrect: true,
              feedback: `Instant match ("${rawWord?.trim()}")!`,
            };
          } else if (!unmatchedWordsMap.has(norm)) {
            unmatchedWordsMap.set(norm, p.id);
          }
        });
      });

      if (unmatchedWordsMap.size > 0) {
        setProcessingStatus(
          `Grading ${unmatchedWordsMap.size} custom ${qType === 'wordFormation' ? 'Word Formation' : 'Open Cloze'} answer(s) with AI Judge...`
        );
        const unmatchedWordsList = Array.from(unmatchedWordsMap.keys());

        try {
          const batchResults = await GeminiService.verifyOpenClozeBatch(
            currentSentence.text,
            currentSentence.correctAnswer || '',
            currentSentence.acceptedAnswers || [],
            unmatchedWordsList,
            qType,
            currentSentence.baseWord
          );
          Object.entries(batchResults).forEach(([wordKey, res]) => {
            clozeWordVerifications[normalizeGapAnswer(wordKey)] = res;
          });
        } catch (err) {
          console.error("Failed batched cloze verification:", err);
          aiGradingFailed = true;
        }
      }
    } else if (qType === 'keyWordTransformation') {
      const kwtToVerifyWithAi = new Set<string>();
      validPlayers.forEach(p => {
        const b = bets[p.id];
        if (!b) return;
        const pSplit = (activePowerUps[p.id] || []).some(pu => pu.type === 'SPLIT_BET');
        const candidatePhrases = pSplit
          ? [b.splitClozeAnswers?.[0], b.splitClozeAnswers?.[1]]
          : [b.clozeAnswer];

        candidatePhrases.forEach(rawPhrase => {
          const norm = normalizeGapAnswer(rawPhrase);
          if (!norm) return;
          const detResult = GeminiService.evaluateKeyWordTransformationDeterministic(
            rawPhrase || '',
            currentSentence.correctAnswer || '',
            currentSentence.acceptedAnswers || [],
            currentSentence.baseWord,
            currentSentence.mark1Parts,
            currentSentence.mark2Parts
          );
          clozeWordVerifications[norm] = detResult;
          // Only consult the AI Judge if the submission passed the mandatory key-word/word-count gate
          // AND at least one half is neither deterministically matched nor deterministically disqualified
          const hasValidKeyAndCount = isValidKeyWordTransformationPhrase(rawPhrase, currentSentence.baseWord);
          const hasUndecidedHalf =
            (!detResult.half1Matched && !detResult.half1Disqualified) ||
            (!detResult.half2Matched && !detResult.half2Disqualified);
          if (detResult.marks < 2 && hasValidKeyAndCount && hasUndecidedHalf) {
            kwtToVerifyWithAi.add(norm);
          }
        });
      });

      if (kwtToVerifyWithAi.size > 0) {
        setProcessingStatus(
          `Grading ${kwtToVerifyWithAi.size} Key Word Transformation answer(s) with Cambridge 2-Mark AI Judge...`
        );
        try {
          const batchResults = await GeminiService.verifyOpenClozeBatch(
            currentSentence.text,
            currentSentence.correctAnswer || '',
            currentSentence.acceptedAnswers || [],
            Array.from(kwtToVerifyWithAi),
            'keyWordTransformation',
            currentSentence.baseWord,
            currentSentence.leadInSentence,
            currentSentence.mark1Parts,
            currentSentence.mark2Parts
          );
          Object.entries(batchResults).forEach(([phraseKey, aiRes]) => {
            const normKey = normalizeGapAnswer(phraseKey);
            const existing = clozeWordVerifications[normKey];
            const aiMarks: 0 | 1 | 2 = aiRes.marks === 2 ? 2 : aiRes.marks === 1 ? 1 : (aiRes.isCorrect ? 2 : 0);
            const existingMarks: 0 | 1 | 2 = existing?.marks ?? 0;
            if (!existing || aiMarks >= existingMarks) {
              clozeWordVerifications[normKey] = {
                isCorrect: aiMarks >= 1,
                marks: aiMarks,
                feedback: aiRes.feedback || existing?.feedback || '',
              };
            }
          });
        } catch (err) {
          console.error("Failed batched Key Word Transformation verification:", err);
          aiGradingFailed = true;
        }
      }
    }

    setProcessingStatus('Calculating results...');
    const settleInput: Parameters<typeof settleRound>[0] = {
      currentSentence,
      qType,
      players,
      activePlayers,
      validPlayers,
      bets,
      activePowerUps,
      verifications,
      clozeWordVerifications,
      baseWordNorm,
      acceptedSet,
      isTurnTimerEnabled,
      isMultiplayer: Boolean(mpRoomCode),
      teacherRevealOverride: revealOverride,
      hasPlayerPlacedBet,
      currentRound,
      roundSpending,
      payoutMultiplier: payoutMultiplierFor(currentSpecialHand),
      specialHandTitle: currentSpecialHand ? SPECIAL_HAND_INFO[currentSpecialHand].title : undefined,
    };
    const settlement = settleRound(settleInput);
    settlement.sounds.forEach(({ sound, index }) => playSound(sound, index));
    const updatedPlayers = settlement.updatedPlayers;
    const someoneWentBust = updatedPlayers.some(p =>
      p.money <= 0 && (players.find(o => o.id === p.id)?.money ?? 0) > 0
    );
    const newRoundResultsData = settlement.roundResults;
    const newRoundPlayerResults = settlement.playerResults;

    // Trigger 3D pot sweep & croupier rake audio toward winning seats (or House bank if no winners)
    const winnerIds = new Set(
      newRoundPlayerResults.filter(r => r.amountChanged > 0).map(r => r.playerId)
    );
    const winnerSeatIndices: number[] = [];
    activePlayers.forEach((p, idx) => {
      if (winnerIds.has(p.id)) {
        winnerSeatIndices.push(idx);
      }
    });
    const sweepEvent: PotSweepEvent = {
      id: `round-${currentRound}-${Date.now()}`,
      winnerSeatIndices,
      winnerPlayerIds: activePlayers.filter(p => winnerIds.has(p.id)).map(p => p.id),
      totalSeats: Math.max(1, activePlayers.length),
    };
    // A small coin shower when someone at least doubles their stack this round
    const bigWin = newRoundPlayerResults.some(r => {
      const before = players.find(p => p.id === r.playerId)?.money ?? 0;
      return r.amountChanged > 0 && before > 0 && r.amountChanged >= before;
    });
    // Package V5: the director spaces the beats: verdict now, then the pot sweep, then the extras.
    const reduceMotion = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    playCues(
      revealCueSheet({ bigWin, bust: someoneWentBust, calm: isCalmMode || reduceMotion }),
      {
        sound: (name) => {
          if (name === 'potSweep') playSound('potSweep', winnerSeatIndices.length);
          else if (name === 'bankrupt') playSound('bankrupt');
        },
        table: (name) => {
          if (name === 'potSweep') setPotSweepEvent(sweepEvent);
          else if (name === 'jackpot') setJackpotEvent({ id: `big-win-${currentRound}-${Date.now()}`, intensity: 0.45 });
        },
      },
      later,
    );

    setPlayers(updatedPlayers);
    setRoundResults(newRoundResultsData);
    setRevealSnapshot({
      input: settleInput,
      output: settlement,
      revealedAt: Date.now(),
      round: currentRound,
      seatsBefore: seatsBeforeReveal,
      turnTimersBefore: turnTimersBeforeReveal,
      teacherRevealOverrideBefore: teacherRevealOverride,
      corrected: false,
    });
    setUndoClock(Date.now());
    {
      const numRounds = typeof totalRounds === 'string' ? parseInt(totalRounds, 10) : totalRounds;
      secondLookQueueRef.current = scheduleSecondLook(secondLookQueueRef.current, {
        round: currentRound,
        subtype: handSubtypeRef.current,
        bets: newRoundPlayerResults.length,
        misses: newRoundPlayerResults.filter(r => !r.isWin).length,
        handsLeft: gameMode === 'rounds' && !isNaN(numRounds) ? numRounds - currentRound : Infinity,
      });
      missTallyRef.current = addMisses(missTallyRef.current, handSubtypeRef.current, newRoundPlayerResults.filter(r => !r.isWin).length);
      if (currentSpecialHand === 'spotlight') {
        setFreeDraws(prev => grantFreeDraws(prev, newRoundPlayerResults.filter(r => r.isWin).map(r => r.playerId), currentRound));
      }
    }
    if (currentSentence) {
      const historyRecord: RoundHistoryRecord = {
        round: currentRound,
        sentence: currentSentence,
        topic: settings.topic === 'Custom' ? customTopic : settings.topic,
        level: settings.level,
        theme: settings.theme === 'Custom' ? customTheme : settings.theme,
        playerResults: newRoundPlayerResults,
        timestamp: Date.now(),
        ...(handShownAtRef.current ? { dealtAt: handShownAtRef.current } : {}),
      };
      setRoundHistory(prev => [...prev, historyRecord]);
    }
    setIsProcessing(false);
    setProcessingStatus('');
    setStep('RESULTS');
    if (aiGradingFailed) {
      setError({ title: 'AI judge unavailable', message: 'The AI judge did not answer, so typed answers were marked by exact match only.' });
    }
  }, [activePlayers, isPlayerFrozen, mpRoomCode, mpSeats, mpAwayIds, isTurnTimerEnabled, turnTimers, teacherRevealOverride, hasPlayerPlacedBet, bets, currentSentence, players, activePowerUps, playSound, verifyPlayerCorrections, roundSpending, currentRound, settings, customTopic, customTheme, isCalmMode, later, currentSpecialHand]);

  // The reveal must never hang: whatever fails, the spinner clears and the teacher is told (F4 fix 8)
  const handleRevealResults = useCallback(async (force?: unknown) => {
    const failure = await runAlwaysClearing(() => revealResultsCore(force === true), () => {
      setIsProcessing(false);
      setProcessingStatus('');
    });
    if (failure) {
      console.error('Reveal failed:', failure);
      setError({ title: 'Reveal failed', message: 'Something went wrong while marking this hand. Try revealing again.' });
    }
  }, [revealResultsCore]);
  
  // Package T2: keyboard shortcuts press the matching button on screen (utils/hotkeys.ts).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return;
      const target = e.target as HTMLElement | null;
      const action = hotkeyAction({
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
        targetTag: target?.tagName,
        targetEditable: Boolean(target?.isContentEditable),
      });
      if (!action) return;
      if (action === 'help') {
        e.preventDefault();
        setShowHotkeyHelp(v => !v);
        return;
      }
      if (action === 'debug-log') {
        e.preventDefault();
        setShowDebugLog(v => !v);
        return;
      }
      const button = findHotkeyButton(document, action);
      if (!button) return;
      e.preventDefault();
      button.click();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Full screen: entering it also turns on projector mode.
  useEffect(() => {
    const onChange = () => {
      const on = Boolean(document.fullscreenElement);
      setIsFullscreen(on);
      if (on) setIsProjectorMode(true);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const handleToggleFullscreen = useCallback(() => {
    playSound('click');
    try {
      if (document.fullscreenElement) void document.exitFullscreen?.();
      else void document.documentElement.requestFullscreen?.();
    } catch {
      // Some browsers refuse full screen; nothing else changes.
    }
  }, [playSound]);

  // Keep the teacher's screen awake for the whole game (Screen Wake Lock, where supported).
  const isGameRunning = step === 'IN_GAME' || step === 'RESULTS';
  useEffect(() => {
    if (!isGameRunning) return;
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } };
    if (!nav.wakeLock) return;
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const request = () => {
      if (document.visibilityState !== 'visible') return;
      nav.wakeLock!.request('screen').then(l => {
        if (cancelled) void l.release().catch(() => {});
        else lock = l;
      }).catch(() => {});
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', request);
      if (lock) void lock.release().catch(() => {});
    };
  }, [isGameRunning]);

  // Package T5: keep the report of a game in this computer's list of finished games.
  const archiveGame = useCallback((finishedAt: number) => {
    if (!roundHistory.length) return;
    const game: FinishedGame = {
      id: `game_${roundHistory[0].timestamp ?? roundHistory[0].round}`,
      finishedAt,
      winnerName: winner?.name ?? null,
      players: players.map(p => ({ id: p.id, name: p.name, money: p.money, avatar: p.avatar })),
      roundHistory,
      settings,
      gameMode,
      totalRounds,
      targetAmount,
    };
    setFinishedGames(prev => {
      const next = addFinishedGame(prev, game);
      safeLocalStorage.setItem(FINISHED_GAMES_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, [roundHistory, winner, players, settings, gameMode, totalRounds, targetAmount]);
  useEffect(() => {
    if (step === 'GAME_OVER' && !isDemoRef.current) archiveGame(Date.now());
    // Only when the game ends; archiveGame changes with every state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Package R2: every 5 s, work out which phones are away (silent for 45 s, or disconnected).
  useEffect(() => {
    if (!mpRoomCode) {
      setMpAwayIds(prev => (prev.length ? [] : prev));
      return;
    }
    const check = () => {
      const next = awaySeatIds(mpSeatsRef.current, mpLastSeenRef.current, Date.now());
      setMpAwayIds(prev => (prev.length === next.length && prev.every((id, i) => id === next[i]) ? prev : next));
    };
    check();
    const id = window.setInterval(check, 5000);
    return () => window.clearInterval(id);
  }, [mpRoomCode]);

  // A pause belongs to one hand: leaving the hand ends it.
  useEffect(() => {
    if (step !== 'IN_GAME') setIsPaused(false);
  }, [step]);

  // --- Package R8: fixing a reveal ---
  const isRevealSnapshotCurrent = Boolean(revealSnapshot && revealSnapshot.round === currentRound && step === 'RESULTS');
  const isUndoRevealOpen = isRevealSnapshotCurrent && canUndoReveal(revealSnapshot, undoClock, currentRound);
  useEffect(() => {
    if (!isUndoRevealOpen) return;
    const id = window.setInterval(() => setUndoClock(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [isUndoRevealOpen]);

  /** Shows a corrected ruling: new bankrolls, result rows and the hand's report-card entry. */
  const applyCorrectedRuling = useCallback((next: RevealSnapshot) => {
    setPlayers(next.output.updatedPlayers);
    setRoundResults(next.output.roundResults);
    setRoundHistory(prev => {
      const last = prev[prev.length - 1];
      if (!last || last.round !== next.round) return prev;
      return [...prev.slice(0, -1), { ...last, playerResults: next.output.playerResults }];
    });
    setRevealSnapshot(next);
  }, []);

  // Undo reveal: back to the hand as it was before the reveal (bets, seats and timers included).
  const handleUndoReveal = useCallback(() => {
    const snap = revealSnapshot;
    if (!snap || !canUndoReveal(snap, Date.now(), currentRound)) return;
    playSound('click');
    setPlayers(snap.input.players);
    setRoundResults([]);
    setRoundHistory(prev => (prev.length && prev[prev.length - 1].round === snap.round ? prev.slice(0, -1) : prev));
    if (mpRoomCode) setMpSeats(snap.seatsBefore);
    setTurnTimers(snap.turnTimersBefore);
    setTeacherRevealOverride(snap.teacherRevealOverrideBefore);
    setRevealSnapshot(null);
    secondLookQueueRef.current = cancelSecondLook(secondLookQueueRef.current, snap.round);
    setFreeDraws(prev => revokeFreeDraws(prev, snap.round));
    setStep('IN_GAME');
  }, [revealSnapshot, currentRound, playSound, mpRoomCode]);

  const handleVoidHand = useCallback(() => {
    if (!revealSnapshot) return;
    secondLookQueueRef.current = cancelSecondLook(secondLookQueueRef.current, revealSnapshot.round);
    setFreeDraws(prev => revokeFreeDraws(prev, revealSnapshot.round));
    GeminiService.forgetUnplayedSentence(currentSentence?.text);
    applyCorrectedRuling({ ...revealSnapshot, output: voidHand(revealSnapshot), corrected: true });
    setShowRulingModal(false);
  }, [revealSnapshot, applyCorrectedRuling, currentSentence]);

  const handleAcceptAnswer = useCallback((answer: string) => {
    if (!revealSnapshot) return;
    applyCorrectedRuling(resettleWithAcceptedAnswer(revealSnapshot, answer));
    setShowRulingModal(false);
  }, [revealSnapshot, applyCorrectedRuling]);

  // A double click on "Deal the next hand" must not skip a hand (F4 fix 9).
  // The guard is released once the screen moves on or the new sentence arrives.
  const nextRoundGuardRef = useRef(createReentryGuard());
  useEffect(() => {
    nextRoundGuardRef.current.release();
  }, [step, currentSentence]);

  const handleNextRound = useCallback(() => {
    if (!nextRoundGuardRef.current.tryEnter()) return;
    // Package L3: an AI item joins the cloud bank only once it was played (a voided one was forgotten).
    GeminiService.archivePlayedSentence(currentSentence?.text);
    const stillActivePlayers = players.filter(p => p.money > 0);
    // In a live room, bankrupt players get the $150 House Bailout, except in last player standing.
    const gameEndInput = { players, gameMode, currentRound, totalRounds, targetAmount, isRoom: Boolean(mpRoomCode) };
    const { isGameOver, bailoutEnabled: isBailoutEnabled } = checkGameEnd(gameEndInput);

    if (isGameOver) {
        // The fanfare and the coin shower wait for the winner's moment in the ceremony (V9).
        setWinner(pickWinnerAtGameEnd(gameEndInput));
        prefetchRef.current = null;
        setStep('GAME_OVER');
    } else {
        playSound('success');
        setCurrentRound(prev => prev + 1);
        const eliminatedPlayers = players.filter(p => p.money <= 0);
        const playerQueue = stillActivePlayers.length > 0
          ? [...stillActivePlayers.slice(1), stillActivePlayers[0]]
          : [];
        if (isBailoutEnabled) {
          const bailedOut = eliminatedPlayers.map(p => ({ ...p, money: HOUSE_BAILOUT_AMOUNT }));
          setPlayers([...playerQueue, ...bailedOut]);
          const nextNotifs: Record<number, { id: string; title: string; message: string; icon: string }> = {};
          eliminatedPlayers.forEach(p => {
            if (mpSeats[p.id]) {
              nextNotifs[p.id] = {
                id: String(Date.now()) + '_' + p.id,
                title: '🏦 House Bailout!',
                message: `The Croupier granted you a $${HOUSE_BAILOUT_AMOUNT} House Bailout so you stay in the action!`,
                icon: '🏦',
              };
            }
          });
          setMpStudentNotifications(nextNotifs);
        } else {
          setPlayers([...playerQueue, ...eliminatedPlayers]);
          setMpStudentNotifications({});
        }
        setMpStudentPendingTarget({});
        setMpStudentPendingWheel({});
        setMpSeats(prev => {
          const next: Record<number, MultiplayerSeat> = {};
          (Object.entries(prev) as [string, MultiplayerSeat][]).forEach(([k, seat]) => {
            next[Number(k)] = { ...seat, lockedIn: false };
          });
          return next;
        });
        setBets({});
        setHints({});
        setPowerUpsUsedThisRound({});
        setActivePowerUps({});
        setHighlightedPhrase(null);
        setIsCopied(false);
        setIsSentenceRevealed(false);
        setAvailablePowerUps(selectedPowerUps); 
        setRoundSpending({});
        setSimplifiedExplanation({ text: null, loading: false });
        setTurnTimers({});
        setMpRoundTimer({ status: 'idle', remainingMs: turnDurationMs });
        mpAutoStartedRoundRef.current = 0;
        setTeacherRevealOverride(false);
        
        // Pass current pastSentences history, using queued nextRoundSettings if set
        const activeSettings = nextRoundSettings || settings;
        if (nextRoundSettings) {
          setSettings(nextRoundSettings);
          setNextRoundSettings(null);
        }
        fetchNewSentence(activeSettings, pastSentences, undefined, pastMistakes);
        setStep('IN_GAME');
    }
  }, [players, gameMode, currentRound, totalRounds, targetAmount, settings, nextRoundSettings, fetchNewSentence, playSound, selectedPowerUps, pastSentences, pastMistakes, mpRoomCode, mpSeats, currentSentence]);

  const handleEndGameEarly = useCallback(() => {
    playSound('click');
    setWinner(pickWinnerWhenEndedEarly({ players, gameMode, targetAmount }));
    prefetchRef.current = null;
    setStep('GAME_OVER');
  }, [players, gameMode, targetAmount, playSound]);

  const handleRestartGame = useCallback(() => {
    if (isDemoRef.current) {
      endDemoRoom();
      return;
    }
    pendingSaveRef.current = null;
    safeLocalStorage.removeItem(LOCAL_STORAGE_KEY); 
    GeminiService.clearPortableGame();
    // Automatically close any open multiplayer room on restart / returning to lobby
    if (mpControllerRef.current) {
      mpControllerRef.current.destroy();
      mpControllerRef.current = null;
    }
    setMpRoomCode(null);
    setMpRoomLocked(false);
    setMpHostConnected(false);
    setMpSeats({});
    setMpStudentPendingTarget({});
    setMpStudentPendingWheel({});
    setMpStudentNotifications({});
    setShowMpLobbyModal(false);
    setStep('PLAYER_SETUP');
    setSettingsPart(1);
    prefetchRef.current = null;
    setPlayers([]);
    setNewPlayerName('');
    setSentenceBatch([]);
    setHandReactions({});
    const prefs = loadSetupPrefs();
    setSettings(prefs.settings ?? {
      topic: GRAMMAR_TOPICS[0],
      level: CEFR_LEVELS[2],
      theme: THEMES[0],
      challengeFormat: 'binary',
      mixedFormats: DEFAULT_MIXED_FORMATS,
    });
    setMixedFormatSetupWarning(null);
    mixedFormatIndexRef.current = 0;
    setCustomTopic(prefs.customTopic ?? '');
    setCustomTheme(prefs.customTheme ?? '');
    setGameMode(prefs.gameMode ?? 'rounds');
    setTotalRounds(prefs.totalRounds ?? 10);
    setTargetAmount(prefs.targetAmount ?? DEFAULT_TARGET_AMOUNT);
    setCurrentRound(1);
    setCurrentSentence(null);
    setPastSentences([]); // Clear history on restart
    setPastMistakes([]);
    setRoundHistory([]);
    setUsedSubtypes([]);
    setBets({});
    setHints({});
    setRoundResults([]);
    setWinner(null);
    setError(null);
    setIsProcessing(false);
    setProcessingStatus('');
    setPowerUpsUsedThisRound({});
    setActivePowerUps({});
    setHighlightedPhrase(null);
    setIsCopied(false);
    setIsSentenceRevealed(false);
    setAvailablePowerUps(Object.keys(POWER_UPS) as PowerUpKey[]);
    setSelectedPowerUps(prefs.deck ?? (Object.keys(POWER_UPS) as PowerUpKey[]));
    setNextRoundSettings(null);
    setRoundSpending({});
    setSimplifiedExplanation({ text: null, loading: false });
    setStartingCash(prefs.startingCash ?? INITIAL_PLAYER_MONEY);
    setIsEditingStartingCash(false);
    setTempStartingCash(String(prefs.startingCash ?? INITIAL_PLAYER_MONEY));
    setTurnTimerSeconds(prefs.turnTimerSeconds ?? 0);
    setTurnTimers({});
    setTeacherRevealOverride(false);
    setAutoStartNextTimer(true);
    if (playerNameInputRef.current) playerNameInputRef.current.focus();
  }, [playSound]);

  // Package T1: "Play again" keeps the class at the table (and the room open, so phones stay
  // seated), keeps the settings, and goes straight to the house rules: one more click deals.
  const handlePlayAgainSameClass = useCallback(() => {
    playSound('startGame');
    prefetchRef.current = null;
    setPlayers(prev => prev.map(p => ({ ...p, money: startingCash, history: [], winStreak: 0, effects: [] })));
    setCurrentRound(1);
    setCurrentSentence(null);
    setRoundHistory([]);
    setUsedSubtypes([]);
    setBets({});
    setHints({});
    setRoundResults([]);
    setWinner(null);
    setError(null);
    setIsProcessing(false);
    setProcessingStatus('');
    setPowerUpsUsedThisRound({});
    setActivePowerUps({});
    setHighlightedPhrase(null);
    setIsSentenceRevealed(false);
    setNextRoundSettings(null);
    setRoundSpending({});
    setSimplifiedExplanation({ text: null, loading: false });
    setTurnTimers({});
    setTeacherRevealOverride(false);
    setMpStudentPendingTarget({});
    setMpStudentPendingWheel({});
    setMpStudentNotifications({});
    setSentenceBatch([]);
    setHandReactions({});
    setSettingsPart(2);
    setStep('SETTINGS');
  }, [playSound, startingCash]);

  const handleLoadGameClick = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed.step === 'string') {
        setPendingLoadGame(parsed);
      } else {
        throw new Error("Invalid save file format.");
      }
    } catch (err: any) {
      console.error("Failed to load game:", err);
      setError({ title: "Load Failed", message: "Could not load the game file. It might be corrupted or invalid." });
    }
    
    // Reset input
    e.target.value = '';
  }, []);

  const handleConfirmLoadGame = useCallback(() => {
    if (!pendingLoadGame) return;
    try {
      const parsed: any = readSave(pendingLoadGame, () => getRandomCharacterAvatar()) || migrateSavedGame(pendingLoadGame, () => getRandomCharacterAvatar());
      
      setStep(parsed.step || 'PLAYER_SETUP');
      setPlayers(parsed.players || []);
      setSettings(
        parsed.settings
          ? {
              ...parsed.settings,
              challengeFormat: parsed.settings.challengeFormat || 'binary',
              mixedFormats: getEffectiveMixedFormats(parsed.settings.mixedFormats),
            }
          : {
              topic: GRAMMAR_TOPICS[0],
              level: CEFR_LEVELS[2],
              theme: THEMES[0],
              challengeFormat: 'binary',
              mixedFormats: ALL_QUESTION_TYPES,
            }
      );
      setCustomTopic(parsed.customTopic || '');
      setCustomTheme(parsed.customTheme || '');
      setGameMode(parsed.gameMode || 'lastPlayer');
      setTotalRounds(parsed.totalRounds || 10);
      setTargetAmount(parsed.targetAmount || DEFAULT_TARGET_AMOUNT);
      setCurrentRound(parsed.currentRound || 1);
      setCurrentSentence(parsed.currentSentence || null);
      setPastSentences(parsed.pastSentences || []);
      setPastMistakes(parsed.pastMistakes || []);
      setSentenceBatch(parsed.sentenceBatch || []);
      setBets(parsed.bets || {});
      setHints(parsed.hints || {});
      setRoundResults(parsed.roundResults || []);
      setWinner(parsed.winner || null);
      setPowerUpsUsedThisRound(parsed.powerUpsUsedThisRound || {});
      setActivePowerUps(parsed.activePowerUps || {});
      setHighlightedPhrase(parsed.highlightedPhrase || null);
      setAvailablePowerUps(parsed.availablePowerUps || Object.keys(POWER_UPS) as PowerUpKey[]);
      setSelectedPowerUps(parsed.selectedPowerUps || Object.keys(POWER_UPS) as PowerUpKey[]);
      setNextRoundSettings(parsed.nextRoundSettings || null);
      setRoundSpending(parsed.roundSpending || {});
      setStartingCash(parsed.startingCash ?? INITIAL_PLAYER_MONEY);
      setTempStartingCash(String(parsed.startingCash ?? INITIAL_PLAYER_MONEY));
      setTurnTimerSeconds(
        typeof parsed.turnTimerSeconds === 'number' && TURN_TIMER_OPTIONS.includes(parsed.turnTimerSeconds)
          ? parsed.turnTimerSeconds
          : 0
      );
      setTurnTimers(parsed.turnTimers || {});
      setTeacherRevealOverride(parsed.teacherRevealOverride || false);
      setAutoStartNextTimer(parsed.autoStartNextTimer ?? true);
      
      setPendingLoadGame(null);
      playSound('success');
    } catch (e) {
      console.error("Failed to apply loaded game state:", e);
      setError({ title: "Load Failed", message: "Could not apply the loaded game state." });
      setPendingLoadGame(null);
    }
  }, [pendingLoadGame, playSound]);

  const handleLoadCloudRoster = useCallback((roster: CloudRoster, mode: 'fresh' | 'saved') => {
    const startStack = mode === 'fresh' ? (roster.startingCash || startingCash) : startingCash;
    if (mode === 'fresh' && roster.startingCash) {
      setStartingCash(roster.startingCash);
      setTempStartingCash(String(roster.startingCash));
    }
    const loadedPlayers: Player[] = (roster.players || []).map((s, idx) => ({
      id: s.id || Date.now() + idx,
      name: s.name,
      avatar: s.avatar || getRandomCharacterAvatar(),
      money: mode === 'saved' ? (typeof s.money === 'number' ? s.money : startStack) : startStack,
      winStreak: mode === 'saved' ? (typeof s.winStreak === 'number' ? s.winStreak : 0) : 0,
      effects: [],
      history: [],
    }));
    setPlayers(loadedPlayers);
    setActiveCloudRoster({ id: roster.id, className: roster.name });
    if (step !== 'PLAYER_SETUP') {
      setStep('PLAYER_SETUP');
    }
    playSound('success');
  }, [startingCash, step, playSound]);

  const buildCurrentFullGameState = useCallback(() => {
    return stampSave({
      step, players, settings, nextRoundSettings, customTopic, customTheme, gameMode, totalRounds, targetAmount,
      currentRound, currentSentence, pastSentences, pastMistakes, bets, hints, roundResults, winner,
      powerUpsUsedThisRound, activePowerUps, highlightedPhrase, availablePowerUps, selectedPowerUps, roundSpending,
      sentenceBatch, roundHistory, startingCash, turnTimerSeconds, turnTimers, teacherRevealOverride, autoStartNextTimer
    }, Date.now());
  }, [
    step, players, settings, nextRoundSettings, customTopic, customTheme, gameMode, totalRounds, targetAmount,
    currentRound, currentSentence, pastSentences, pastMistakes, bets, hints, roundResults, winner,
    powerUpsUsedThisRound, activePowerUps, highlightedPhrase, availablePowerUps, selectedPowerUps, roundSpending,
    sentenceBatch, roundHistory, startingCash, turnTimerSeconds, turnTimers, teacherRevealOverride, autoStartNextTimer
  ]);

  const handleApplyCloudFullGameState = useCallback((parsed: any) => {
    try {
      setStep(parsed.step);
      setPlayers(parsed.players);
      setSettings({
        ...parsed.settings,
        challengeFormat: parsed.settings?.challengeFormat || 'binary',
        mixedFormats: getEffectiveMixedFormats(parsed.settings?.mixedFormats),
      });
      setNextRoundSettings(
        parsed.nextRoundSettings
          ? {
              ...parsed.nextRoundSettings,
              challengeFormat: parsed.nextRoundSettings.challengeFormat || 'binary',
              mixedFormats: getEffectiveMixedFormats(parsed.nextRoundSettings.mixedFormats),
            }
          : null
      );
      setCustomTopic(parsed.customTopic || '');
      setCustomTheme(parsed.customTheme || '');
      setGameMode(parsed.gameMode || 'lastPlayer');
      setTotalRounds(parsed.totalRounds || 10);
      setTargetAmount(parsed.targetAmount || 2000);
      setCurrentRound(parsed.currentRound || 0);
      setCurrentSentence(parsed.currentSentence || null);
      setPastSentences(parsed.pastSentences || []);
      setPastMistakes(parsed.pastMistakes || []);
      setBets(parsed.bets || {});
      setHints(parsed.hints || {});
      setRoundResults(parsed.roundResults || []);
      setWinner(parsed.winner || null);
      setPowerUpsUsedThisRound(parsed.powerUpsUsedThisRound || {});
      setActivePowerUps(parsed.activePowerUps || {});
      setHighlightedPhrase(parsed.highlightedPhrase || {});
      setAvailablePowerUps(parsed.availablePowerUps || Object.keys(POWER_UPS) as PowerUpKey[]);
      setSelectedPowerUps(parsed.selectedPowerUps || Object.keys(POWER_UPS) as PowerUpKey[]);
      setRoundSpending(parsed.roundSpending || {});
      setSentenceBatch(parsed.sentenceBatch || []);
      setRoundHistory(parsed.roundHistory || []);
      if (parsed.startingCash && typeof parsed.startingCash === 'number' && parsed.startingCash > 0) {
        setStartingCash(parsed.startingCash);
        setTempStartingCash(String(parsed.startingCash));
      }
      setTurnTimerSeconds(
        typeof parsed.turnTimerSeconds === 'number' && parsed.turnTimerSeconds >= 0
          ? parsed.turnTimerSeconds
          : 0
      );
      setTurnTimers(parsed.turnTimers || {});
      setTeacherRevealOverride(parsed.teacherRevealOverride || false);
      setAutoStartNextTimer(parsed.autoStartNextTimer ?? true);
      playSound('success');
    } catch (e) {
      console.error('Failed to apply cloud game state:', e);
      setError({ title: 'Cloud Restore Failed', message: 'Could not restore the saved cloud table state.' });
    }
  }, [playSound]);

  const handleSaveGameClick = useCallback(async () => {
    try {
      const gameState = buildCurrentFullGameState(); 
      const jsonStr = JSON.stringify(gameState, null, 2);
      const dateStr = new Date().toISOString().split('T')[0];
      const defaultFilename = `grammar-casino-save-${dateStr}.json`;

      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: defaultFilename,
            types: [{
              description: 'JSON File',
              accept: { 'application/json': ['.json'] },
            }],
          });
          const writable = await handle.createWritable();
          await writable.write(jsonStr);
          await writable.close();
          playSound('success');
          return;
        } catch (err: any) {
          if (err.name === 'AbortError') {
            return; // User cancelled
          }
          // If it's a SecurityError (e.g., cross-origin iframe), we catch it and proceed to the fallback below
          if (err.name !== 'SecurityError' && !err.message?.includes('Cross origin')) {
            console.error('Error saving file:', err);
            setError({ title: "Save Failed", message: "Could not save the game file." });
            return;
          }
          console.warn('showSaveFilePicker blocked by iframe, falling back to standard download.');
        }
      }

      // Fallback for browsers that don't support showSaveFilePicker or block it in iframes
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = defaultFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      playSound('success');
    } catch (e: any) {
      console.error("Failed to save game:", e);
      setError({ title: "Save Failed", message: "Could not save the game." });
    }
  }, [buildCurrentFullGameState, playSound]);

  const handleSimplifyExplanation = useCallback(async () => {
    if (!currentSentence || simplifiedExplanation.loading || simplifiedExplanation.text) return;
    playSound('click');
    setSimplifiedExplanation({ text: null, loading: true });
    setError(null);
    try {
        const detailed = await GeminiService.simplifyExplanation(
          currentSentence.explanation,
          settings.topic,
          currentSentence.text,
          currentSentence.correction
        );
        setSimplifiedExplanation({ text: detailed, loading: false });
        playSound('hint');
    } catch (err: any) {
        setError({ title: "AI Error", message: err.message || "Couldn't load the detailed explanation. Please try again." });
        setSimplifiedExplanation({ text: null, loading: false });
    }
  }, [currentSentence, settings.topic, simplifiedExplanation.loading, simplifiedExplanation.text, playSound]);

  const handleCopySentence = useCallback(() => {
    if (!currentSentence) return;
    navigator.clipboard.writeText(currentSentence.text).then(() => {
        setIsCopied(true);
        later(() => setIsCopied(false), 2000);
        playSound('click');
    }).catch(err => {
        console.error('Failed to copy text: ', err);
    });
  }, [currentSentence, playSound]);

  const getOrdinal = (n: number): string => { 
    const s = ["th", "st", "nd", "rd"], v = n % 100; 
    return n + (s[(v - 20) % 10] || s[v] || s[0]); 
  };
    
  const renderStepContent = () => {
    switch(step) {
        case 'PLAYER_SETUP': {
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
        case 'SETTINGS': {
          const resolvedTopicPreview = settings.topic === "My own choice" ? (customTopic.trim() || "Your own topic") : settings.topic;
          const resolvedThemePreview = settings.theme === "Custom ✍️" ? (customTheme.trim() || "Your own theme") : settings.theme;
          const currentFormatObj = CHALLENGE_FORMATS.find(f => f.id === (settings.challengeFormat || 'binary')) || CHALLENGE_FORMATS[0];
          const levelProfile = CEFR_DIFFICULTY_PROFILES[settings.level];
          const optionBase = 'border transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-turn';
          const optionOn = 'bg-gc-gold/15 border-gc-gold text-gc-ink';
          const optionOff = 'bg-gc-line/[0.05] border-gc-line/[0.14] text-gc-ink hover:border-gc-line/30';
          const pill = (on: boolean) => `h-11 px-4 inline-flex items-center gap-1.5 rounded-full text-gc-body font-semibold ${optionBase} ${on ? optionOn : optionOff}`;
          const sectionCls = 'gc-surface rounded-gc-lg p-5 sm:p-6 text-left';
          const sectionTitle = 'text-gc-lead font-bold text-gc-ink';
          const sectionHint = 'text-gc-small text-gc-quiet mt-0.5';
          const winLabel =
            gameMode === 'lastPlayer'
              ? 'Last player standing'
              : gameMode === 'rounds'
                ? `${totalRounds || '?'} hands`
                : `First to $${Number(targetAmount || 0).toLocaleString()}`;
          // Package T1: say what is missing next to the button, instead of only after a click.
          const setupProblem = (() => {
            if (settings.topic === 'My own choice' && !customTopic.trim()) return 'Type your own topic to go on.';
            if (settings.theme === 'Custom ✍️' && !customTheme.trim()) return 'Type your own theme to go on.';
            if (settingsPart === 2) {
              const n = typeof totalRounds === 'string' ? parseInt(totalRounds, 10) : totalRounds;
              if (gameMode === 'rounds' && (isNaN(n) || n <= 0)) return 'Type a number of hands (1 or more) to deal.';
              const t = typeof targetAmount === 'string' ? parseInt(targetAmount, 10) : targetAmount;
              if (gameMode === 'targetAmount' && (isNaN(t) || t < MIN_TARGET_AMOUNT)) return `Type a target of at least $${MIN_TARGET_AMOUNT.toLocaleString()} to deal.`;
            }
            return null;
          })();
          const summaryChips = [
            resolvedTopicPreview,
            settings.level,
            resolvedThemePreview,
            currentFormatObj.shortLabel,
            ...(settingsPart === 2
              ? [winLabel, turnTimerSeconds === 0 ? 'No timer' : `${turnTimerSeconds} s timer`]
              : []),
          ];

          return (
          <div className="w-full max-w-5xl px-4 pt-6 sm:pt-2 pb-36 animate-gc-fade">
            <header className="text-center mb-6">
              <p className="text-gc-small font-semibold text-gc-quiet">Step {settingsPart} of 2</p>
              <h1 className="font-logo text-gc-gold text-[34px] sm:text-[44px] leading-tight font-semibold tracking-[0.04em]">Table setup</h1>

              {/* The two steps */}
              <nav aria-label="Setup steps" className="mt-4 inline-flex p-1 rounded-full bg-gc-line/[0.06] border border-gc-line/[0.12] gap-1 max-w-full">
                {([
                  { n: 1 as const, label: 'Questions' },
                  { n: 2 as const, label: 'House rules' },
                ]).map(({ n, label }) => {
                  const isCurrent = settingsPart === n;
                  const isDone = n === 1 && settingsPart === 2;
                  return (
                    <button
                      key={n}
                      type="button"
                      aria-current={isCurrent ? 'step' : undefined}
                      onClick={() => {
                        if (settingsPart === n) return;
                        if (n === 1) {
                          playSound('click');
                          setSettingsPart(1);
                        } else {
                          handleAdvanceToSettingsPart2();
                        }
                      }}
                      className={`h-10 pl-1.5 pr-4 inline-flex items-center gap-2 rounded-full text-gc-small font-bold transition-colors cursor-pointer ${
                        isCurrent ? 'bg-gc-card text-gc-ink shadow-gc-1' : 'text-gc-quiet hover:text-gc-ink'
                      }`}
                    >
                      <span className={`w-7 h-7 rounded-full grid place-items-center text-gc-cap tabular-nums ${
                        isCurrent ? 'bg-gc-gold text-gc-on-gold' : isDone ? 'bg-gc-win/20 text-gc-win' : 'bg-gc-line/[0.08]'
                      }`}>
                        {isDone ? <Check className="w-4 h-4" aria-hidden="true" /> : n}
                      </span>
                      {label}
                    </button>
                  );
                })}
              </nav>
            </header>

            {settingsPart === 1 ? (
              <div className="space-y-4 animate-gc-fade">
                {/* Topic */}
                <section className={sectionCls} aria-labelledby="setup-topic">
                  <h2 id="setup-topic" className={sectionTitle}>Topic</h2>
                  <p className={sectionHint}>A grammar point, collocations, or a topic of your own.</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {GRAMMAR_TOPICS.map(item => {
                      const isActive = settings.topic === item;
                      return (
                        <button
                          key={item}
                          type="button"
                          aria-pressed={isActive}
                          onClick={() => { playSound('click'); setSettings(s => ({ ...s, topic: item })); }}
                          className={pill(isActive)}
                        >
                          {isActive && <Check className="w-4 h-4 shrink-0" aria-hidden="true" />}
                          {item === 'My own choice' ? 'My own topic' : item}
                        </button>
                      );
                    })}
                  </div>
                  {settings.topic === 'My own choice' && (
                    <div className="mt-4 space-y-3 animate-gc-fade">
                      <TextInput
                        value={customTopic}
                        onChange={e => setCustomTopic(e.target.value)}
                        placeholder="We are studying… for example: unit 6, second conditional, travel"
                        aria-label="Your own topic"
                        className="h-12"
                      />
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-gc-small font-semibold text-gc-quiet mr-1">Quick picks:</span>
                        {QUICK_LEXICAL_TOPICS.map(lex => {
                          const isPicked = customTopic.trim().toLowerCase() === lex.toLowerCase();
                          return (
                            <button
                              key={lex}
                              type="button"
                              aria-pressed={isPicked}
                              onClick={() => { playSound('click'); setCustomTopic(lex); }}
                              className={`h-8 px-3 rounded-full text-gc-small font-semibold ${optionBase} ${isPicked ? optionOn : optionOff}`}
                            >
                              {lex}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </section>

                {/* Level */}
                <section className={sectionCls} aria-labelledby="setup-level">
                  <h2 id="setup-level" className={sectionTitle}>Level</h2>
                  <p className={sectionHint}>How long the sentences are, and how hard the mistakes are to spot.</p>
                  <div className="mt-4 grid grid-cols-3 sm:grid-cols-6 gap-2" role="group" aria-label="Level">
                    {CEFR_LEVELS.map(item => {
                      const isActive = settings.level === item;
                      return (
                        <button
                          key={item}
                          type="button"
                          aria-pressed={isActive}
                          onClick={() => { playSound('click'); setSettings(s => ({ ...s, level: item })); }}
                          className={`h-16 rounded-gc-sm flex flex-col items-center justify-center ${optionBase} ${isActive ? optionOn : optionOff}`}
                        >
                          <span className="text-gc-lead font-extrabold tabular-nums leading-none">{item}</span>
                          <span className="mt-1 text-gc-cap text-gc-quiet">{CEFR_DIFFICULTY_PROFILES[item]?.title}</span>
                        </button>
                      );
                    })}
                  </div>
                  {levelProfile && (() => {
                    const activeTopicSpec = settings.topic !== 'My own choice'
                      ? getCefrTopicRuleSpec(settings.topic, settings.level)
                      : null;
                    return (
                      <div className="mt-4 p-4 rounded-gc-sm bg-gc-line/[0.04] border border-gc-line/[0.1] space-y-3 text-gc-small">
                        <dl className="grid sm:grid-cols-3 gap-3">
                          <div>
                            <dt className="font-bold text-gc-ink">Sentences</dt>
                            <dd className="text-gc-quiet">{levelProfile.syntax}</dd>
                          </div>
                          <div>
                            <dt className="font-bold text-gc-ink">Vocabulary</dt>
                            <dd className="text-gc-quiet">{levelProfile.lexis}</dd>
                          </div>
                          <div>
                            <dt className="font-bold text-gc-ink">Mistakes</dt>
                            <dd className="text-gc-quiet">{levelProfile.mistakeIdentification}</dd>
                          </div>
                        </dl>
                        {activeTopicSpec && (
                          <div className="pt-3 border-t border-gc-line/[0.1]">
                            <div className="font-bold text-gc-ink">
                              Cambridge EGP Focus ({settings.topic} · {settings.level})
                            </div>
                            <div className="text-gc-quiet mt-0.5">
                              {activeTopicSpec.classroomSummary}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </section>

                {/* Theme */}
                <section className={sectionCls} aria-labelledby="setup-theme">
                  <h2 id="setup-theme" className={sectionTitle}>Theme</h2>
                  <p className={sectionHint}>The setting for the sentences, such as fantasy or business.</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {THEMES.map(item => {
                      const isActive = settings.theme === item;
                      return (
                        <button
                          key={item}
                          type="button"
                          aria-pressed={isActive}
                          onClick={() => { playSound('click'); setSettings(s => ({ ...s, theme: item })); }}
                          className={pill(isActive)}
                        >
                          {item === 'Custom ✍️' ? 'My own theme ✍️' : item}
                        </button>
                      );
                    })}
                  </div>
                  {settings.theme === 'Custom ✍️' && (
                    <div className="mt-4 animate-gc-fade">
                      <TextInput
                        value={customTheme}
                        onChange={e => setCustomTheme(e.target.value)}
                        placeholder="For example: Football, Space travel, Cooking"
                        aria-label="Your own theme"
                        className="h-12"
                      />
                    </div>
                  )}
                </section>

                {/* Question type */}
                <section className={sectionCls} aria-labelledby="setup-format">
                  <h2 id="setup-format" className={sectionTitle}>Question type</h2>
                  <p className={sectionHint}>How students answer each sentence. You can change it between hands.</p>
                  <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {CHALLENGE_FORMATS.map(fmt => {
                      const isSelected = (settings.challengeFormat || 'binary') === fmt.id;
                      return (
                        <button
                          key={fmt.id}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => {
                            playSound('click');
                            setMixedFormatSetupWarning(null);
                            setSettings(s => ({
                              ...s,
                              challengeFormat: fmt.id,
                              mixedFormats: getEffectiveMixedFormats(s.mixedFormats),
                            }));
                          }}
                          className={`p-4 rounded-gc text-left flex items-start gap-3 ${optionBase} ${isSelected ? optionOn : optionOff}`}
                        >
                          <span className="w-10 h-10 shrink-0 rounded-full bg-gc-line/[0.06] grid place-items-center text-[22px] leading-none" aria-hidden="true">{fmt.icon}</span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                              <span className="text-gc-body font-bold">{fmt.label}</span>
                              {isSelected && <Check className="w-4 h-4 shrink-0 text-gc-money" aria-hidden="true" />}
                            </span>
                            <span className="block mt-0.5 text-gc-small text-gc-quiet">{fmt.subtitle}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {settings.challengeFormat === 'mixed' && (() => {
                    const activeMixed = getEffectiveMixedFormats(settings.mixedFormats);
                    const toggleMixedItem = (qType: QuestionType) => {
                      const isIncluded = activeMixed.includes(qType);
                      if (isIncluded) {
                        if (activeMixed.length <= 1) {
                          playSound('error');
                          setMixedFormatSetupWarning('Keep at least one question type in the mix.');
                          return;
                        }
                        playSound('click');
                        setMixedFormatSetupWarning(null);
                        setSettings(s => ({
                          ...s,
                          mixedFormats: ALL_QUESTION_TYPES.filter(q => activeMixed.includes(q) && q !== qType),
                        }));
                      } else {
                        playSound('click');
                        setMixedFormatSetupWarning(null);
                        setSettings(s => ({
                          ...s,
                          mixedFormats: ALL_QUESTION_TYPES.filter(q => activeMixed.includes(q) || q === qType),
                        }));
                      }
                    };
                    return (
                      <div className="mt-4 p-4 rounded-gc bg-gc-line/[0.04] border border-gc-line/[0.12] space-y-3 animate-gc-fade">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-gc-body font-bold text-gc-ink">
                            In the mix <span className="text-gc-quiet font-semibold tabular-nums">({activeMixed.length} of {ALL_QUESTION_TYPES.length})</span>
                          </h3>
                          {activeMixed.length < ALL_QUESTION_TYPES.length && (
                            <button
                              type="button"
                              onClick={() => {
                                playSound('click');
                                setMixedFormatSetupWarning(null);
                                setSettings(s => ({ ...s, mixedFormats: ALL_QUESTION_TYPES }));
                              }}
                              className="h-9 px-3.5 rounded-full text-gc-small font-semibold bg-gc-line/[0.06] border border-gc-line/[0.14] hover:border-gc-line/30 text-gc-ink cursor-pointer"
                            >
                              Turn all on
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {CHALLENGE_FORMATS.filter((c): c is typeof CHALLENGE_FORMATS[number] & { id: QuestionType } => c.id !== 'mixed').map(subFmt => {
                            const isChecked = activeMixed.includes(subFmt.id);
                            return (
                              <button
                                key={subFmt.id}
                                type="button"
                                role="checkbox"
                                aria-checked={isChecked}
                                onClick={() => toggleMixedItem(subFmt.id)}
                                className={`h-11 pl-2 pr-4 inline-flex items-center gap-2 rounded-full text-gc-small font-semibold ${optionBase} ${isChecked ? optionOn : `${optionOff} text-gc-quiet`}`}
                              >
                                <span className={`w-6 h-6 rounded-full grid place-items-center ${isChecked ? 'bg-gc-gold text-gc-on-gold' : 'bg-gc-line/[0.08]'}`}>
                                  {isChecked ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : null}
                                </span>
                                <span aria-hidden="true">{subFmt.icon}</span>
                                {subFmt.shortLabel}
                              </button>
                            );
                          })}
                        </div>
                        {mixedFormatSetupWarning && (
                          <p role="alert" className="text-gc-small font-semibold text-gc-loss flex items-center gap-1.5">
                            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                            {mixedFormatSetupWarning}
                          </p>
                        )}
                        <p className="text-gc-small text-gc-quiet">
                          <span className="font-semibold text-gc-ink">Order: </span>
                          {activeMixed
                            .map(q => CHALLENGE_FORMATS.find(f => f.id === q)?.shortLabel || q)
                            .join(', then ')}
                        </p>
                      </div>
                    );
                  })()}

                  {settings.challengeFormat && settings.challengeFormat !== 'binary' && (
                    <p className="mt-4 text-gc-small text-gc-quiet flex items-start gap-2">
                      <Info className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                      <span>
                        Gap questions, Spot the error and Word order pay 1:1. Key word transformation pays 1× the bet for 1 mark and 2× for 2 marks.
                        A split bet covers two answers at half the bet each. The correction bonus and Grammar Goggles are off for gap questions.
                      </span>
                    </p>
                  )}
                </section>

                {/* Package L4: the teacher's own sentences */}
                <section className={sectionCls} aria-labelledby="setup-own">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h2 id="setup-own" className={sectionTitle}>Your own sentences <span className="text-gc-quiet font-semibold">(optional)</span></h2>
                      <p className={sectionHint} data-testid="own-deck-status">
                        {ownDeckItems.length
                          ? `${ownDeck.name}: ${deckSummary(ownDeckItems)}. They are dealt first.`
                          : 'Paste sentences from your lesson or your students\' writing. The game deals them first.'}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {ownDeckItems.length > 0 && (
                        <ActionButton onClick={() => { playSound('click'); setOwnDeck(d => ({ ...d, text: '' })); }} variant="ghost" className="h-11 px-4 text-gc-body font-semibold">
                          Remove
                        </ActionButton>
                      )}
                      <ActionButton onClick={() => { playSound('click'); setShowOwnDeck(true); }} variant="ghost" className="h-11 px-5 text-gc-body font-bold">
                        {ownDeckItems.length ? 'Edit' : 'Add sentences'}
                      </ActionButton>
                    </div>
                  </div>
                </section>
              </div>
            ) : (
              <div className="space-y-4 animate-gc-fade">
                {/* How to win */}
                <section className={sectionCls} aria-labelledby="setup-win">
                  <h2 id="setup-win" className={sectionTitle}>How to win</h2>
                  <p className={sectionHint}>When the game ends and who is the winner. A player who reaches $0 is bankrupt and out for good{mpRoomCode && gameMode !== 'lastPlayer' ? ', except in a live room, where they get a $150 House Bailout at the next hand' : ''}.</p>
                  <div className="mt-4 grid md:grid-cols-3 gap-2.5">
                    {([
                      { mode: 'rounds' as const, icon: '⏳', title: 'Set number of hands', text: 'The most money after the last hand wins.' },
                      { mode: 'lastPlayer' as const, icon: '👑', title: 'Last player standing', text: 'Play until only one player has money left.' },
                      { mode: 'targetAmount' as const, icon: '🎯', title: 'Target amount', text: 'The first player to reach the target wins.' },
                    ]).map(opt => {
                      const isSelected = gameMode === opt.mode;
                      return (
                        <div
                          key={opt.mode}
                          className={`rounded-gc ${optionBase} ${isSelected ? optionOn : optionOff} !cursor-default`}
                        >
                          <button
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => { playSound('click'); setGameMode(opt.mode); }}
                            className="w-full p-4 text-left flex items-start gap-3 cursor-pointer rounded-gc focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-turn"
                          >
                            <span className="w-10 h-10 shrink-0 rounded-full bg-gc-line/[0.06] grid place-items-center text-[22px] leading-none" aria-hidden="true">{opt.icon}</span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center justify-between gap-2">
                                <span className="text-gc-body font-bold">{opt.title}</span>
                                {isSelected && <Check className="w-4 h-4 shrink-0 text-gc-money" aria-hidden="true" />}
                              </span>
                              <span className="block mt-0.5 text-gc-small text-gc-quiet">{opt.text}</span>
                            </span>
                          </button>
                          {isSelected && opt.mode === 'rounds' && (
                            <div className="px-4 pb-4 flex flex-wrap items-center gap-2">
                              <label htmlFor="gc-total-rounds" className="text-gc-small font-semibold text-gc-quiet">Hands</label>
                              <TextInput
                                id="gc-total-rounds"
                                type="number"
                                min={1}
                                max={100}
                                value={String(totalRounds)}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setTotalRounds(val === '' ? '' : parseInt(val, 10));
                                }}
                                className="w-20 h-10 !py-1 text-center font-bold tabular-nums"
                              />
                              {LENGTH_PRESETS.map(({ hands: r, name, timerSeconds: presetTimer }) => (
                                <button
                                  key={r}
                                  type="button"
                                  aria-pressed={totalRounds === r}
                                  onClick={() => {
                                    playSound('click');
                                    setTotalRounds(r);
                                    // Package G7: a preset sets the timer too (shown on the button).
                                    if (presetTimer !== undefined && TURN_TIMER_OPTIONS.includes(presetTimer)) {
                                      setTurnTimerSeconds(presetTimer);
                                      setTurnTimers({});
                                      setMpRoundTimer({ status: 'idle', remainingMs: presetTimer * 1000 });
                                      mpAutoStartedRoundRef.current = 0;
                                    }
                                  }}
                                  title={presetTimer ? `${r} hands and a ${presetTimer}-second timer` : `${r} hands`}
                                  className={`min-h-9 min-w-[2.5rem] px-3 py-1 rounded-full text-gc-small font-bold ${optionBase} ${totalRounds === r ? 'bg-gc-gold text-gc-on-gold border-transparent' : optionOff}`}
                                >
                                  <span className="tabular-nums">{r}</span> · {name}
                                  {presetTimer ? <span className="font-semibold opacity-80"> · {presetTimer} s</span> : null}
                                </button>
                              ))}
                              {Number(totalRounds) > 0 && (
                                <p className="w-full text-gc-small text-gc-quiet" data-testid="length-estimate">
                                  About {estimateMinutes({ hands: Number(totalRounds), players: players.length, timerSeconds: turnTimerSeconds, room: Boolean(mpRoomCode) })} minutes with {mpRoomCode ? 'this room' : `${players.length} player${players.length === 1 ? '' : 's'}`}.
                                </p>
                              )}
                              <label className="w-full mt-1 flex items-center justify-between gap-4 p-3 rounded-gc-sm bg-gc-line/[0.04] border border-gc-line/[0.1] cursor-pointer">
                                <span>
                                  <span className="block text-gc-body font-semibold text-gc-ink">Special hands</span>
                                  <span className="block text-gc-small text-gc-quiet">
                                    The last hand is the Final Table (wins pay double). A second-look sentence pays 1.5 times. Halfway through, a Valid-or-flawed sentence is read aloud, not shown, until the reveal. In longer games, a Spotlight hand repeats the most-missed point, and a Fix it hand asks everyone to correct a sentence.
                                  </span>
                                </span>
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={specialHandsOn}
                                  onClick={() => { playSound('click'); setSpecialHandsOn(v => !v); }}
                                  className={`relative w-12 h-7 shrink-0 rounded-full transition-colors cursor-pointer ${specialHandsOn ? 'bg-gc-win' : 'bg-gc-line/25'}`}
                                >
                                  <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${specialHandsOn ? 'translate-x-5' : ''}`} />
                                  <span className="sr-only">Special hands</span>
                                </button>
                              </label>
                            </div>
                          )}
                          {isSelected && opt.mode === 'targetAmount' && (
                            <div className="px-4 pb-4 flex flex-wrap items-center gap-2">
                              <label htmlFor="gc-target-amount" className="text-gc-small font-semibold text-gc-quiet">Target $</label>
                              <TextInput
                                id="gc-target-amount"
                                type="number"
                                min={MIN_TARGET_AMOUNT}
                                step={250}
                                value={String(targetAmount)}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setTargetAmount(val === '' ? '' : parseInt(val, 10));
                                }}
                                className="w-24 h-10 !py-1 text-center font-bold tabular-nums"
                              />
                              {[2000, 2500, 3000, 5000].map((amt) => (
                                <button
                                  key={amt}
                                  type="button"
                                  aria-pressed={Number(targetAmount) === amt}
                                  onClick={() => { playSound('click'); setTargetAmount(amt); }}
                                  className={`h-9 px-2.5 rounded-full text-gc-small font-bold tabular-nums ${optionBase} ${Number(targetAmount) === amt ? 'bg-gc-gold text-gc-on-gold border-transparent' : optionOff}`}
                                >
                                  ${amt.toLocaleString()}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* Timer */}
                <section className={sectionCls} aria-labelledby="setup-timer">
                  <h2 id="setup-timer" className={sectionTitle}>{mpRoomCode ? 'Round timer' : 'Turn timer'}</h2>
                  <p className={sectionHint}>
                    {mpRoomCode
                      ? 'One countdown for everyone while they place their bets on their phones.'
                      : 'Time for each player to choose, bet, and buy hints or power-ups.'}
                  </p>
                  <div className="mt-4 grid grid-cols-3 sm:grid-cols-6 gap-2" role="group" aria-label={mpRoomCode ? 'Round timer' : 'Turn timer'}>
                    {TURN_TIMER_OPTIONS.map(secs => {
                      const isSelected = turnTimerSeconds === secs;
                      return (
                        <button
                          key={secs}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => {
                            playSound('click');
                            setTurnTimerSeconds(secs);
                            setTurnTimers({});
                            setMpRoundTimer({ status: 'idle', remainingMs: secs * 1000 });
                            mpAutoStartedRoundRef.current = 0;
                          }}
                          className={`h-14 rounded-gc-sm flex flex-col items-center justify-center ${optionBase} ${isSelected ? optionOn : optionOff}`}
                        >
                          <span className="text-gc-body font-extrabold tabular-nums leading-none">{secs === 0 ? 'Off' : `${secs} s`}</span>
                          <span className="mt-1 text-gc-cap text-gc-quiet">{secs === 0 ? 'No limit' : mpRoomCode ? 'per round' : 'per turn'}</span>
                        </button>
                      );
                    })}
                  </div>
                  {turnTimerSeconds > 0 && (
                    <label className="mt-4 flex items-center justify-between gap-4 p-3.5 rounded-gc-sm bg-gc-line/[0.04] border border-gc-line/[0.1] cursor-pointer">
                      <span>
                        <span className="block text-gc-body font-semibold text-gc-ink">Start the timer by itself</span>
                        <span className="block text-gc-small text-gc-quiet">
                          {mpRoomCode
                            ? 'The countdown starts as soon as each hand is dealt.'
                            : "When one player locks in, the next player's timer starts."}
                        </span>
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={autoStartNextTimer}
                        onClick={() => { playSound('click'); setAutoStartNextTimer(v => !v); }}
                        className={`relative w-12 h-7 shrink-0 rounded-full transition-colors cursor-pointer ${autoStartNextTimer ? 'bg-gc-win' : 'bg-gc-line/25'}`}
                      >
                        <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${autoStartNextTimer ? 'translate-x-5' : ''}`} />
                        <span className="sr-only">Start the timer by itself</span>
                      </button>
                    </label>
                  )}
                </section>

                {/* Package L6: the level follows the class */}
                <section className={sectionCls} aria-labelledby="setup-adaptive-level">
                  <label className="flex items-center justify-between gap-4 cursor-pointer">
                    <span>
                      <span id="setup-adaptive-level" className={`block ${sectionTitle}`}>Level follows the class</span>
                      <span className={`block ${sectionHint}`}>
                        After every three hands: over 85% right, the next hands go one level up; under 45%, one level down. You see a notice each time.
                      </span>
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={adaptiveLevelOn}
                      onClick={() => { playSound('click'); setAdaptiveLevelOn(v => !v); }}
                      className={`relative w-12 h-7 shrink-0 rounded-full transition-colors cursor-pointer ${adaptiveLevelOn ? 'bg-gc-win' : 'bg-gc-line/25'}`}
                    >
                      <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${adaptiveLevelOn ? 'translate-x-5' : ''}`} />
                      <span className="sr-only">Level follows the class</span>
                    </button>
                  </label>
                </section>

                {/* Package G3 / V9: awards at the end */}
                <section className={sectionCls} aria-labelledby="setup-awards">
                  <label className="flex items-center justify-between gap-4 cursor-pointer">
                    <span>
                      <span id="setup-awards" className={`block ${sectionTitle}`}>Awards at the end</span>
                      <span className={`block ${sectionHint}`}>
                        After the winner, up to five awards (sharpest eye, hot streak, best corrector, comeback, boldest bet), each to a different student. They change no money.
                      </span>
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={awardsOn}
                      onClick={() => { playSound('click'); setAwardsOn(v => !v); }}
                      className={`relative w-12 h-7 shrink-0 rounded-full transition-colors cursor-pointer ${awardsOn ? 'bg-gc-win' : 'bg-gc-line/25'}`}
                    >
                      <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${awardsOn ? 'translate-x-5' : ''}`} />
                      <span className="sr-only">Awards at the end</span>
                    </button>
                  </label>
                </section>

                {/* Package L9: speaking after the reveal */}
                <section className={sectionCls} aria-labelledby="setup-say-it">
                  <label className="flex items-center justify-between gap-4 cursor-pointer">
                    <span>
                      <span id="setup-say-it" className={`block ${sectionTitle}`}>Say it</span>
                      <span className={`block ${sectionHint}`}>
                        After each reveal, the screen asks students to say the right sentence aloud to a partner. No microphone is used.
                      </span>
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={sayItOn}
                      onClick={() => { playSound('click'); setSayItOn(v => !v); }}
                      className={`relative w-12 h-7 shrink-0 rounded-full transition-colors cursor-pointer ${sayItOn ? 'bg-gc-win' : 'bg-gc-line/25'}`}
                    >
                      <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${sayItOn ? 'translate-x-5' : ''}`} />
                      <span className="sr-only">Say it</span>
                    </button>
                  </label>
                </section>

                {/* Power-ups */}
                <section className={sectionCls} aria-labelledby="setup-powerups">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h2 id="setup-powerups" className={sectionTitle}>
                        Power-ups <span className="text-gc-quiet font-semibold tabular-nums">({selectedPowerUps.length} of {(Object.keys(POWER_UPS) as PowerUpKey[]).length})</span>
                      </h2>
                      <p className={sectionHint}>Cards players can draw during a hand to help themselves or slow down others.</p>
                    </div>
                    <ActionButton
                      onClick={() => { playSound('click'); setShowDeckConfigModal(true); }}
                      variant="ghost"
                      className="h-11 px-5 text-gc-body font-bold shrink-0"
                    >
                      Choose power-ups
                    </ActionButton>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-1.5" aria-label="Power-ups in the deck">
                    {selectedPowerUps.slice(0, 16).map(k => (
                      <span key={k} className="w-9 h-9 rounded-full bg-gc-line/[0.06] grid place-items-center text-[18px] leading-none" title={POWER_UPS[k]?.name}>
                        {POWER_UPS[k]?.icon}
                      </span>
                    ))}
                    {selectedPowerUps.length > 16 && (
                      <span className="ml-1 text-gc-small font-semibold text-gc-quiet tabular-nums">+{selectedPowerUps.length - 16} more</span>
                    )}
                    {selectedPowerUps.length === 0 && (
                      <span className="text-gc-small text-gc-quiet">No power-ups. Players can still buy hints.</span>
                    )}
                  </div>
                </section>
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-gc-cap text-gc-quiet">
              <label className="inline-flex items-center gap-2">
                3D table
                <select
                  value={qualityStored.choice}
                  onChange={e => chooseQuality(e.target.value as QualityChoice)}
                  data-testid="quality-choice"
                  className="min-h-[44px] rounded-gc-sm bg-gc-line/[0.05] border border-gc-line/[0.2] px-2 text-gc-ink"
                >
                  <option value="auto">Automatic{qualityStored.choice === 'auto' ? ` (${qualityTier === 'off' ? 'off' : qualityTier})` : ''}</option>
                  <option value="off">Off</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
              <span data-testid="settings-version">Grammar Casino {APP_VERSION} · Shift+L shows the debug log</span>
            </div>

            {/* Summary and the next step, always in reach */}
            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gc-line/[0.12] bg-gc-bg/90 backdrop-blur-md">
              <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
                <ul className="hidden md:flex flex-1 min-w-0 flex-wrap gap-1.5" aria-label="Your choices">
                  {summaryChips.map((c, i) => (
                    <li key={i} className="h-8 px-3 inline-flex items-center rounded-full bg-gc-line/[0.06] border border-gc-line/[0.12] text-gc-small font-semibold text-gc-ink max-w-[14rem] truncate">
                      {c}
                    </li>
                  ))}
                </ul>
                <p className="md:hidden flex-1 min-w-0 text-gc-small text-gc-quiet truncate">{summaryChips.join(' · ')}</p>
                <ActionButton
                  onClick={() => {
                    playSound('click');
                    if (settingsPart === 2) setSettingsPart(1);
                    else setStep('PLAYER_SETUP');
                  }}
                  variant="ghost"
                  className="h-12 px-4 text-gc-body font-semibold shrink-0"
                  title={settingsPart === 2 ? 'Back to the questions' : 'Back to the lobby'}
                >
                  <span className="inline-flex items-center gap-1.5"><ArrowLeft className="w-4 h-4 shrink-0" aria-hidden="true" /><span className="hidden sm:inline">Back</span></span>
                </ActionButton>
                {setupProblem && (
                  <p id="setup-problem" role="status" className="text-gc-small font-semibold text-gc-danger max-w-[16rem] text-right" data-testid="setup-problem">{setupProblem}</p>
                )}
                {settingsPart === 1 ? (
                  <ActionButton
                    onClick={handleAdvanceToSettingsPart2}
                    aria-describedby={setupProblem ? 'setup-problem' : undefined}
                    variant="primary"
                    className="h-12 px-6 text-gc-body shrink-0"
                  >
                    <span className="inline-flex items-center gap-2">Next: house rules<ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" /></span>
                  </ActionButton>
                ) : (
                  <ActionButton
                    onClick={handleFinalizeSettings}
                    playSound={playSound}
                    aria-describedby={setupProblem ? 'setup-problem' : undefined}
                    variant="primary"
                    className="h-12 px-6 text-gc-body shrink-0"
                  >
                    <span className="inline-flex items-center gap-2">Deal the first hand<ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" /></span>
                  </ActionButton>
                )}
              </div>
            </div>
          </div>
          );
        }
        case 'IN_GAME': { 
            const unfrozenActivePlayers = activePlayers.filter(p => !isPlayerFrozen(p.id));
            const currentQuestionType: QuestionType = currentSentence?.questionType || 'binary';
            const isClozeRound = isGapType(currentQuestionType);

            // Who is in, and whether the answer may be revealed (game/revealGate.ts).
            const revealGate = getRevealGate({
              playerIds: unfrozenActivePlayers.filter(p => !(mpRoomCode && mpAwayIds.includes(p.id))).map(p => p.id),
              bets,
              activePowerUps,
              questionType: currentQuestionType,
              baseWord: currentSentence?.baseWord,
              mode: mpRoomCode ? 'room' : isTurnTimerEnabled ? 'turnTimer' : 'free',
              seats: mpSeats,
              turnTimers,
              teacherOverride: teacherRevealOverride,
            });
            const allValidBetsFinalized = revealGate.allBetsValid;
            const allActivePlayersLocked = revealGate.allTimersLocked;
            const lockedCount = revealGate.timerLockedCount;
            const mpLockedCount = revealGate.roomLockedCount;
            const allMpPlayersLocked = revealGate.allRoomLocked;
            const canRevealResults = revealGate.canReveal;

            // Bets bar and reveal button: how many players are in, and what the reveal waits for.
            const betsReadyCount = revealGate.readyCount;
            const betsReadyWord = mpRoomCode || isTurnTimerEnabled ? 'locked in' : 'bets placed';
            const everyoneIn = revealGate.everyoneIn;
            const revealNote = !canRevealResults
              ? `when all ${unfrozenActivePlayers.length} ${mpRoomCode || isTurnTimerEnabled ? 'are locked in' : 'have bet'}`
              : teacherRevealOverride && !everyoneIn
                ? 'before everyone is in'
                : '';

            // Find the single player whose turn is currently active (running or paused)
            const activeTurnPlayer = isTurnTimerEnabled
              ? unfrozenActivePlayers.find(p => {
                  const st = turnTimers[p.id]?.status;
                  return st === 'running' || st === 'paused';
                })
              : undefined;

            // Next idle unfrozen player in table order
            const nextIdlePlayer = isTurnTimerEnabled
              ? unfrozenActivePlayers.find(p => (turnTimers[p.id]?.status ?? 'idle') === 'idle')
              : undefined;

            const renderPlayerSeat = (player: Player) => {
                      const allActive = Object.values(activePowerUps).flat() as ActivePowerUp[];
                      const playerActive = (activePowerUps[player.id] || []) as ActivePowerUp[];
                      const { isCapped: isBetCapped, capAmount: betCapAmount } = getBetCap(player, activePowerUps);
                      const { isHighRoller } = getHighRoller(player, activePowerUps);
                      const minBetAmount = getDisplayedMinBet(player, activePowerUps);
const scalpelPu = playerActive.find(pu => pu.type === 'SCALPEL');
                      let scalpelHint: { eliminatedOptions?: string[]; clozeMask?: string } | null = null;
                      if (scalpelPu && currentSentence) {
                        if (isOptionType(currentQuestionType)) {
                          scalpelHint = { eliminatedOptions: scalpelPu.eliminatedOptions || [] };
                        } else if (currentQuestionType === 'openCloze' && currentSentence.correctAnswer) {
                          const word = currentSentence.correctAnswer.trim();
                          if (word.length > 0) {
                            const rest = Array(Math.max(0, word.length - 1)).fill('_').join(' ');
                            scalpelHint = {
                              clozeMask: `${word[0]}${rest ? ' ' + rest : ''} (${word.length} letter${word.length === 1 ? '' : 's'})`,
                            };
                          }
                        } else if (currentQuestionType === 'wordFormation' && currentSentence.correctAnswer) {
                          const word = currentSentence.correctAnswer.trim();
                          if (word.length > 0) {
                            if (word.length <= 3) {
                              const rest = Array(Math.max(0, word.length - 1)).fill('_').join(' ');
                              scalpelHint = {
                                clozeMask: `${word[0]}${rest ? ' ' + rest : ''} (${word.length} letter${word.length === 1 ? '' : 's'})`,
                              };
                            } else {
                              const middleCount = Math.max(1, word.length - 3);
                              const middle = Array(middleCount).fill('_').join(' ');
                              const lastTwo = `${word[word.length - 2]} ${word[word.length - 1]}`;
                              scalpelHint = {
                                clozeMask: `${word[0]} ${middle} ${lastTwo} (${word.length} letters)`,
                              };
                            }
                          }
                        } else if ((currentQuestionType === 'keyWordTransformation' || currentQuestionType === 'wordOrder') && currentSentence.correctAnswer) {
                          const words = currentSentence.correctAnswer.trim().split(/\s+/).filter(Boolean);
                          if (words.length > 0) {
                            if (words.length <= 2) {
                              scalpelHint = {
                                clozeMask: `${words.length} words: ${words[0]} ___`,
                              };
                            } else {
                              const middle = Array(words.length - 2).fill('___').join(' ');
                              scalpelHint = {
                                clozeMask: `${words.length} words: ${words[0]} ${middle} ${words[words.length - 1]}`,
                              };
                            }
                          }
                        }
                      }
                      const isFrozen = isFrozenBySubZero(player, allActive);
                      const myActive = playerActive[0]; 
                      const playerTimer = turnTimers[player.id];
                      const isSatOut = isTurnTimerEnabled && playerTimer?.status === 'locked' && !isFrozen && !hasPlayerPlacedBet(player.id);
                      const mpSeat = mpSeats[player.id];
                      const audiencePollFeed = playerActive.some(pu => pu.type === 'AUDIENCE_POLL')
                        ? buildAudiencePollSummary(players, bets, activePowerUps, currentSentence, player.id)
                        : null;
                      
                      return (
                        <div key={player.id} className="space-y-2">
                          {mpRoomCode && mpSeat?.lockedIn && !isFrozen && player.money > 0 && (
                            <div className="flex items-center justify-between gap-3 px-4 py-2 rounded-gc bg-gc-win/10 border border-gc-win/40">
                              <span className="text-gc-small font-semibold text-gc-ink flex items-center gap-2 min-w-0">
                                <Lock className="w-4 h-4 shrink-0 text-gc-win" aria-hidden="true" />
                                <span className="truncate">{player.name} locked in on their phone</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => handleMpUnlockPlayer(player.id)}
                                title="Let this player change their bet"
                                className="h-9 px-3 shrink-0 rounded-full border border-gc-line/[0.2] bg-gc-line/[0.05] hover:border-gc-line/40 text-gc-small font-bold text-gc-ink transition-colors cursor-pointer inline-flex items-center gap-1.5"
                              >
                                <LockOpen className="w-4 h-4" aria-hidden="true" />
                                Unlock
                              </button>
                            </div>
                          )}
                          <PlayerBettingCard 
                            hasFreeDraw={(freeDraws[player.id] || []).length > 0}
                            player={player} 
                            bet={bets[player.id]} 
                            onBetChange={handleBetChange} 
                            onGetHint={handleGetHint} 
                            hint={hints[player.id]} 
                            playSound={playSound} 
                            onGetPowerUp={handleBuyRandomPowerUp} 
                            powerUpUsedThisRound={(powerUpsUsedThisRound[player.id] || []).length >= ((playerActive.some(p => p.type === 'POWER_SURGE') ? 3 : 1))} 
                            activePowerUp={myActive} 
                            isBetCapped={isBetCapped} 
                            betCapAmount={betCapAmount}
                            isHighRoller={isHighRoller}
                            minBetAmount={minBetAmount}
                            scalpelHint={scalpelHint}
                            audiencePollFeed={audiencePollFeed}
                            isFrozen={isFrozen}
                            activePowerUps={playerActive} 
                            usedPowerUps={powerUpsUsedThisRound[player.id] || []}
                            players={players} 
                            onUpdateMoney={handleUpdatePlayerMoney}
                            currentSentenceText={currentSentence?.text}
                            questionType={currentQuestionType}
                            options={currentSentence?.options}
                            baseWord={currentSentence?.baseWord}
                            onChangeAvatar={handleOpenAvatarModal}
                            onUpdateName={handleUpdatePlayerName}
                            targetAmount={gameMode === 'targetAmount' ? (typeof targetAmount === 'string' ? parseInt(targetAmount, 10) : targetAmount) : undefined}
                            timerEnabled={isTurnTimerEnabled && !mpRoomCode}
                            turnTimer={playerTimer}
                            turnDurationMs={turnDurationMs}
                            canAct={canPlayerAct(player.id)}
                            isSatOut={isSatOut && !mpRoomCode}
                            timerBlockedByName={!mpRoomCode && activeTurnPlayer && activeTurnPlayer.id !== player.id ? activeTurnPlayer.name : undefined}
                            onTimerStart={handleTimerStart}
                            onTimerPause={handleTimerPause}
                            onTimerAddTime={handleTimerAddTime}
                            onTimerLockNow={handleTimerLockNow}
                            onTimerUnlock={handleTimerUnlock}
                          />
                        </div>
                      );
            };

            // Compact grid (single-screen): tile status per player, never the pick itself.
            const playerTiles: PlayerTile[] = players.map(player => {
              const playerActive = (activePowerUps[player.id] || []) as ActivePowerUp[];
              const frozen = isPlayerFrozen(player.id);
              const timer = turnTimers[player.id];
              const placed = hasPlayerPlacedBet(player.id);
              let status: SeatStatus = 'waiting';
              if (player.money <= 0) status = 'out';
              else if (frozen) status = 'frozen';
              else if (isTurnTimerEnabled && timer?.status === 'locked') status = placed ? 'locked' : 'satOut';
              else if (activeTurnPlayer?.id === player.id) status = 'turn';
              else if (placed) status = 'placed';
              const badges = [
                ...playerActive.map(pu => ({ icon: POWER_UPS[pu.type]?.icon || '✨', label: POWER_UPS[pu.type]?.name || pu.type })),
                ...player.effects.map(ef => ({ icon: POWER_UPS[ef.type as PowerUpKey]?.icon || '✨', label: POWER_UPS[ef.type as PowerUpKey]?.name || ef.type })),
              ];
              return { player, status, badges };
            });
            const openSeatPlayer = openSeatPlayerId !== null ? players.find(p => p.id === openSeatPlayerId) || null : null;
            const nextSeatPlayer = (() => {
              if (!openSeatPlayer) return null;
              const idx = players.findIndex(p => p.id === openSeatPlayer.id);
              for (let k = 1; k < players.length; k++) {
                const candidate = players[(idx + k) % players.length];
                if (candidate.money > 0 && !isPlayerFrozen(candidate.id) && !hasPlayerPlacedBet(candidate.id)) return candidate;
              }
              return null;
            })();

            const sentenceLength = currentSentence?.text?.length || 0;
            const sentenceTextClass = isSentenceHeaderStuck
              ? isProjectorMode
                ? (sentenceLength > 140
                    ? "text-lg sm:text-xl lg:text-2xl leading-snug font-semibold"
                    : "text-xl sm:text-2xl lg:text-[1.75rem] leading-snug font-semibold")
                : (sentenceLength > 140
                    ? "text-base sm:text-lg lg:text-xl leading-snug"
                    : "text-lg sm:text-xl lg:text-2xl leading-snug")
              : isProjectorMode
                ? sentenceLength > 150
                  ? "text-2xl sm:text-3xl lg:text-4xl leading-[1.28] font-semibold"
                  : sentenceLength > 90
                    ? "text-3xl sm:text-4xl lg:text-[2.85rem] leading-[1.24] font-semibold"
                    : "text-4xl sm:text-5xl lg:text-[3.5rem] leading-[1.22] font-semibold"
                : sentenceLength > 150
                  ? "text-xl sm:text-2xl lg:text-3xl leading-[1.3]"
                  : sentenceLength > 90
                    ? "text-2xl sm:text-3xl lg:text-4xl leading-[1.25]"
                    : "text-3xl sm:text-4xl lg:text-[2.875rem] leading-[1.3]";

            const activeFormatConfig = CHALLENGE_FORMATS.find(f => f.id === (settings.challengeFormat || 'binary')) || CHALLENGE_FORMATS[0];
            const nextFormatConfig = nextRoundSettings?.challengeFormat
              ? CHALLENGE_FORMATS.find(f => f.id === nextRoundSettings.challengeFormat)
              : undefined;
            const currentHandFormatBadge = currentQuestionType === 'binary' ? 'Valid or flawed?' : questionTypeLabel(currentQuestionType);
            // Style A chips under the sentence: quiet, no emoji; a gold "Next" tag when a change is queued.
            const metaChip = 'inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-gc-line/[0.07] border border-gc-line/[0.12] text-gc-small font-medium text-gc-quiet whitespace-nowrap';
            const nextTag = 'inline-flex items-center h-5 px-1.5 rounded-full bg-gc-gold text-gc-on-gold text-gc-cap font-bold';
            // The settings drawer under the chips (style A).
            const drawerCell = 'px-3 py-2 rounded-gc bg-gc-line/[0.05] border border-gc-line/[0.12]';
            const drawerLink = 'h-8 px-2.5 rounded-full text-gc-small font-semibold text-gc-ink hover:bg-gc-line/[0.08] transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-turn';
            const mixIcons = (formats: Settings['mixedFormats']) =>
              getEffectiveMixedFormats(formats).map(q => CHALLENGE_FORMATS.find(f => f.id === q)?.icon).filter(Boolean).join('');
            const formatIsChanging = Boolean(nextFormatConfig && (
              nextFormatConfig.id !== activeFormatConfig.id ||
              (nextFormatConfig.id === 'mixed' &&
                getEffectiveMixedFormats(nextRoundSettings?.mixedFormats).join(',') !== getEffectiveMixedFormats(settings.mixedFormats).join(','))
            ));
            const aiLine = sentenceStatus(desktopStatus, currentSentence);
            const drawerRows: { tab: SettingsModalTab; icon: string; label: string; value: string; next?: string | null; note?: string; warn?: boolean }[] = [
              {
                tab: 'topic', icon: '📚', label: 'Topic', value: settings.topic,
                next: nextRoundSettings && nextRoundSettings.topic !== settings.topic ? nextRoundSettings.topic : null,
                note: currentSentence?.bankTopic ? `This hand: ${currentSentence.bankTopic}` : undefined,
              },
              {
                tab: 'level', icon: '📊', label: 'Level', value: settings.level,
                next: nextRoundSettings && nextRoundSettings.level !== settings.level ? nextRoundSettings.level : null,
              },
              {
                tab: 'theme', icon: '🎭', label: 'Theme', value: settings.theme,
                next: nextRoundSettings && nextRoundSettings.theme !== settings.theme ? nextRoundSettings.theme : null,
              },
              {
                tab: 'format', icon: activeFormatConfig.icon, label: 'Question type',
                value: activeFormatConfig.id === 'mixed' ? `${activeFormatConfig.shortLabel} ${mixIcons(settings.mixedFormats)}` : activeFormatConfig.shortLabel,
                next: formatIsChanging && nextFormatConfig
                  ? (nextFormatConfig.id === 'mixed' ? `${nextFormatConfig.shortLabel} ${mixIcons(nextRoundSettings?.mixedFormats)}` : nextFormatConfig.shortLabel)
                  : null,
              },
              {
                tab: 'ai', icon: aiLine.icon, label: 'Sentences',
                value: aiLine.label,
                note: [desktopStatus.isPortable ? 'Portable' : '', desktopStatus.isReadOnly ? 'Read-only' : ''].filter(Boolean).join(' · ') || undefined,
                warn: desktopStatus.decryptionFailed,
              },
            ];

            return ( 
              <div className={`w-full ${isProjectorMode ? 'max-w-7xl' : 'max-w-6xl'} animate-fade-in p-2 md:p-4`}> 
                {/* 3D Bespoke Casino Playing Card Container */}
                <div
                  ref={sentenceHeaderRef}
                  className={`card-reveal-container sticky z-30 mb-5 sm:mb-6 ${isSentenceHeaderStuck ? 'is-stuck' : ''}`}
                  style={{ top: STICKY_TOP_PX }}
                >
                  <div className={`card-reveal-flipper ${isSentenceRevealed && !isLoading ? 'revealed' : ''}`}>
                    
                    {/* Front of the card, shown while the next sentence is dealt */}
                    <div className="card-reveal-front">
                       <div className={`casino-back-pattern h-full w-full rounded-gc-lg flex flex-col items-center justify-center gap-3 p-8 ${isLoading ? 'animate-pulse' : ''}`}>
                          <div className="w-14 h-14 rounded-full border border-[#f1cf72]/60 bg-black/25 grid place-items-center text-3xl text-[#f1cf72] select-none" aria-hidden="true">
                            ♠
                          </div>
                          <p className="text-gc-lead font-semibold text-[#f8f4ea] select-none">
                            {isLoading ? 'Dealing the next sentence…' : 'Next sentence'}
                          </p>
                       </div>
                    </div>

                    {/* Back of the card: the sentence */}
                    <div className="card-reveal-back">
                      <div className={`sticky-sentence rounded-gc-lg px-4 sm:px-8 transition-[padding,background-color,box-shadow] duration-gc-fast ${
                        isSentenceHeaderStuck
                          ? 'stuck py-2.5 sm:py-3'
                          : 'gc-panel shadow-gc-2 relative py-5 sm:py-7 animate-gc-deal'
                      }`}> 
                        {isSentenceRevealed && !isLoading && !isSentenceHeaderStuck && (
                          <span aria-hidden="true" className="gc-sheen pointer-events-none absolute inset-0 overflow-hidden rounded-gc-lg">
                            <span className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-gc-sheen [animation-delay:0.7s]" />
                          </span>
                        )}
                        {currentSentence && (
                          <>
                            {isSentenceHeaderStuck ? (
                              <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-gc-line/[0.1]">
                                <div className="flex flex-wrap items-center gap-2 min-w-0">
                                  <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-gc-gold text-gc-on-gold text-gc-cap font-bold whitespace-nowrap">
                                    Hand {currentRound}{gameMode === 'rounds' ? ` of ${totalRounds}` : ''} · {currentHandFormatBadge}{specialHandLabel ? ` · ${specialHandLabel}` : secondLookRound === currentRound ? ' · Second look' : ''}{handsLeftLabel ? ` · ${handsLeftLabel}` : ''}
                                  </span>
                                  {currentQuestionType === 'keyWordTransformation' && currentSentence.baseWord && (
                                    <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-gc-gold/20 border border-gc-gold/50 text-gc-money font-extrabold text-gc-cap tracking-wider whitespace-nowrap">
                                      <span aria-hidden="true">🔑</span>
                                      <span>Key word: {currentSentence.baseWord.toUpperCase()}</span>
                                      <span className="hidden md:inline font-semibold text-gc-quiet tracking-normal">· 2 to 6 words</span>
                                    </span>
                                  )}
                                  <span className="hidden lg:inline-flex items-center gap-1.5 text-gc-cap font-medium text-gc-quiet truncate">
                                    <span>{settings.topic}</span>
                                    <span aria-hidden="true">·</span>
                                    <span>{settings.level}</span>
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button 
                                    onClick={handleCopySentence}
                                    className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-gc-cap font-semibold text-gc-quiet hover:text-gc-ink bg-gc-line/[0.06] border border-gc-line/[0.12] transition-colors cursor-pointer"
                                    title="Copy sentence to clipboard"
                                  >
                                    {isCopied ? <Check className="w-3 h-3 shrink-0" aria-hidden="true" /> : <Copy className="w-3 h-3 shrink-0" aria-hidden="true" />}
                                    <span>{isCopied ? 'Copied' : 'Copy'}</span>
                                  </button>
                                  <button 
                                    data-hotkey="read"
                                    onClick={() =>
                                      speakText(
                                        currentQuestionType === 'keyWordTransformation'
                                          ? `${currentSentence.leadInSentence ? `Lead-in sentence: ${currentSentence.leadInSentence}. ` : ''}Key word: ${currentSentence.baseWord || ''}. Target sentence: ${currentSentence.text}`
                                          : currentQuestionType === 'wordFormation' && currentSentence.baseWord
                                            ? `${currentSentence.text}. Base word: ${currentSentence.baseWord}.`
                                            : currentSentence.text
                                      )
                                    } 
                                    disabled={isSpeaking}
                                    className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-gc-cap font-semibold text-gc-quiet hover:text-gc-ink bg-gc-line/[0.06] border border-gc-line/[0.12] transition-colors ${isSpeaking ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                    title="Read sentence aloud"
                                  >
                                    <Volume2 className="w-3 h-3 shrink-0" aria-hidden="true" />
                                    <span>{isSpeaking ? 'Speaking…' : 'Listen'}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleToggleSettingsDeckExpanded}
                                    aria-expanded={isSettingsDeckExpanded}
                                    className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-gc-cap font-semibold text-gc-ink bg-gc-line/[0.06] border border-gc-line/[0.12] hover:border-gc-line/30 transition-colors cursor-pointer"
                                    title={isSettingsDeckExpanded ? "Hide this round's settings" : "Show and change this round's settings"}
                                  >
                                    <span>{isSettingsDeckExpanded ? 'Hide settings' : 'Settings'}</span>
                                    <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${isSettingsDeckExpanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex justify-center">
                                <span className="inline-flex items-center h-8 px-3.5 rounded-full bg-gc-gold text-gc-on-gold text-gc-small font-bold whitespace-nowrap">
                                  Hand {currentRound}{gameMode === 'rounds' ? ` of ${totalRounds}` : ''} · {currentHandFormatBadge}{specialHandLabel ? ` · ${specialHandLabel}` : secondLookRound === currentRound ? ' · Second look' : ''}{handsLeftLabel ? ` · ${handsLeftLabel}` : ''}
                                </span>
                              </div>
                            )}
                            
                            <div className={`relative flex flex-col items-center justify-center ${isSentenceHeaderStuck ? 'pt-1.5 pb-0.5' : 'py-3 sm:py-4'}`}> 
                                {/* Top-right utility actions (full unstuck mode only) */}
                                {!isSentenceHeaderStuck && (
                                  <div className="flex gap-2 mb-2 sm:mb-0 sm:absolute sm:right-0 sm:-top-10 z-20">
                                      <button 
                                        onClick={handleCopySentence}
                                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-gc-cap font-semibold text-gc-quiet hover:text-gc-ink bg-gc-line/[0.06] border border-gc-line/[0.12] transition-colors cursor-pointer"
                                        title="Copy sentence to clipboard"
                                      >
                                        {isCopied ? <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
                                        <span>{isCopied ? 'Copied' : 'Copy'}</span>
                                      </button>
                                      <button 
                                        onClick={() =>
                                          speakText(
                                            currentQuestionType === 'keyWordTransformation'
                                              ? `${currentSentence.leadInSentence ? `Lead-in sentence: ${currentSentence.leadInSentence}. ` : ''}Key word: ${currentSentence.baseWord || ''}. Target sentence: ${currentSentence.text}`
                                              : currentQuestionType === 'wordFormation' && currentSentence.baseWord
                                                ? `${currentSentence.text}. Base word: ${currentSentence.baseWord}.`
                                                : currentSentence.text
                                          )
                                        } 
                                        disabled={isSpeaking}
                                        className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-gc-cap font-semibold text-gc-quiet hover:text-gc-ink bg-gc-line/[0.06] border border-gc-line/[0.12] transition-colors ${isSpeaking ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                        title="Read sentence aloud"
                                      >
                                        <Volume2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                        <span>{isSpeaking ? 'Speaking…' : 'Listen'}</span>
                                      </button>
                                  </div>
                                )}

                                {currentQuestionType === 'keyWordTransformation' && currentSentence.leadInSentence && (
                                  isSentenceHeaderStuck ? (
                                    <div className="w-full max-w-5xl mx-auto mb-1 px-3 py-1 rounded-gc-sm bg-gc-line/[0.06] border border-gc-line/[0.12] text-center">
                                      <span className="text-gc-cap font-bold text-gc-quiet mr-2">First sentence:</span>
                                      <span className={`${isProjectorMode ? 'text-base sm:text-lg font-medium' : 'text-sm sm:text-base'} font-sentence italic text-gc-ink`}>
                                        &ldquo;{currentSentence.leadInSentence}&rdquo;
                                      </span>
                                    </div>
                                  ) : (
                                    <div className={`w-full ${isProjectorMode ? 'max-w-4xl px-5 py-3.5' : 'max-w-3xl px-4 py-3'} mx-auto mb-3 rounded-gc bg-gc-line/[0.05] border border-gc-line/[0.12] text-center space-y-1.5`}>
                                      <div className="text-gc-small font-bold text-gc-quiet">
                                        First sentence (keep the meaning)
                                      </div>
                                      <p className={`${isProjectorMode ? 'text-xl sm:text-[26px] leading-snug font-medium' : 'text-gc-lead sm:text-[22px]'} font-sentence italic text-gc-ink`}>
                                        &ldquo;{currentSentence.leadInSentence}&rdquo;
                                      </p>
                                      {currentSentence.baseWord && (
                                        <div className="pt-1 flex items-center justify-center gap-2.5 flex-wrap">
                                          <span className={`inline-flex items-center gap-1.5 ${isProjectorMode ? 'px-4 py-1.5 text-lg' : 'px-3.5 py-1 text-gc-body'} rounded-full bg-gc-gold text-gc-on-gold font-extrabold tracking-wider`}>
                                            <span aria-hidden="true">🔑</span>
                                            <span>Key word: {currentSentence.baseWord.toUpperCase()}</span>
                                          </span>
                                          <span className="text-gc-small text-gc-quiet">
                                            Use 2 to 6 words, including this word unchanged
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  )
                                )}

                                {!isSentenceHeaderStuck && newFormatTask(currentQuestionType) && (
                                  <p data-testid="format-task" className="text-center text-gc-body font-semibold text-gc-quiet">
                                    {newFormatTask(currentQuestionType)}
                                  </p>
                                )}
                                <p 
                                  className={`${sentenceTextClass} text-gc-ink font-sentence italic font-medium text-center text-balance max-w-5xl mx-auto px-2 sm:px-6 ${isSentenceHeaderStuck ? 'pt-0.5' : 'pt-3 sm:pt-4'}`}
                                >
                                  {isSentenceHiddenForListening ? (
                                    <span data-testid="listening-hidden" className="not-italic font-sans flex flex-col items-center gap-3">
                                      <span className={isSentenceHeaderStuck ? 'text-gc-lead font-bold' : 'text-3xl sm:text-4xl font-bold'}>
                                        <span aria-hidden="true">🎧 </span>Listen to the sentence.
                                      </span>
                                      {!isSentenceHeaderStuck && (
                                        <span className="flex flex-wrap justify-center gap-2.5 text-gc-body">
                                          <button
                                            type="button"
                                            onClick={() => speakText(currentSentence.text)}
                                            disabled={isSpeaking}
                                            className="h-11 px-5 rounded-full bg-gc-gold text-gc-on-gold font-bold inline-flex items-center gap-2 cursor-pointer disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-turn"
                                          >
                                            <Volume2 className="w-4 h-4" aria-hidden="true" />
                                            {isSpeaking ? 'Reading…' : 'Play it again'}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setListenShownRound(currentRound)}
                                            className="h-11 px-5 rounded-full bg-gc-line/[0.08] border border-gc-line/[0.18] text-gc-ink font-semibold cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-turn"
                                          >
                                            Show the sentence
                                          </button>
                                        </span>
                                      )}
                                    </span>
                                  ) : currentQuestionType === 'spotError' && currentSentence.options?.length === 4 ? (
                                    <SpotErrorSentence parts={currentSentence.options} compact={isSentenceHeaderStuck} />
                                  ) : currentQuestionType === 'wordOrder' && currentSentence.options?.length ? (
                                    <WordTiles tiles={currentSentence.options} size={isSentenceHeaderStuck ? 'md' : 'lg'} />
                                  ) : (
                                  <SentenceText
                                    text={currentSentence?.text || ''}
                                    highlight={highlightedPhrase}
                                    showGaps={isClozeRound}
                                    baseWord={currentQuestionType === 'wordFormation' ? currentSentence?.baseWord : null}
                                  />
                                  )}
                                </p>
                            </div> 
                            
                            {/* Settings chips under the sentence; hidden when compact sticky unless the settings drawer is open */}
                            <div className={`flex flex-col items-center w-full ${isSentenceHeaderStuck ? (isSettingsDeckExpanded ? 'mt-2' : 'hidden') : 'mt-4'}`}> 
                                {!isSentenceHeaderStuck && (
                                  <button
                                    type="button"
                                    onClick={handleToggleSettingsDeckExpanded}
                                    className="group flex items-center justify-center gap-2 flex-wrap rounded-gc-sm p-1 cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-turn"
                                    title={isSettingsDeckExpanded ? "Hide this round's settings" : "Show and change this round's settings"}
                                    aria-expanded={isSettingsDeckExpanded}
                                  >
                                  <span className={metaChip}>
                                    {settings.topic}
                                    {nextRoundSettings && nextRoundSettings.topic !== settings.topic && (
                                      <span className={nextTag}>Next: {nextRoundSettings.topic}</span>
                                    )}
                                    {currentSentence?.bankTopic && (
                                      <span
                                        className="inline-flex items-center h-5 px-1.5 rounded-full bg-gc-info/15 text-gc-info text-gc-cap font-bold"
                                        title={`The offline bank has no unused ${settings.level} items for ${settings.topic}, so this hand uses ${currentSentence.bankTopic} at the same level.`}
                                      >
                                        This hand: {currentSentence.bankTopic}
                                      </span>
                                    )}
                                  </span>
                                  <span className={metaChip}>
                                    {settings.level}
                                    {nextRoundSettings && nextRoundSettings.level !== settings.level && (
                                      <span className={nextTag}>Next: {nextRoundSettings.level}</span>
                                    )}
                                  </span>
                                  <span className={metaChip}>
                                    {settings.theme}
                                    {nextRoundSettings && nextRoundSettings.theme !== settings.theme && (
                                      <span className={nextTag}>Next: {nextRoundSettings.theme}</span>
                                    )}
                                  </span>
                                  <span className={metaChip}>
                                    {activeFormatConfig.shortLabel}
                                    {activeFormatConfig.id === 'mixed' && (
                                      <span className="text-gc-cap">
                                        ({getEffectiveMixedFormats(settings.mixedFormats).map(q => CHALLENGE_FORMATS.find(f => f.id === q)?.icon).filter(Boolean).join('')})
                                      </span>
                                    )}
                                    {nextFormatConfig && (
                                      nextFormatConfig.id !== activeFormatConfig.id ||
                                      (nextFormatConfig.id === 'mixed' &&
                                        getEffectiveMixedFormats(nextRoundSettings?.mixedFormats).join(',') !==
                                          getEffectiveMixedFormats(settings.mixedFormats).join(','))
                                    ) && (
                                      <span className={nextTag}>
                                        Next: {nextFormatConfig.shortLabel}
                                        {nextFormatConfig.id === 'mixed' && ` (${getEffectiveMixedFormats(nextRoundSettings?.mixedFormats).map(q => CHALLENGE_FORMATS.find(f => f.id === q)?.icon).filter(Boolean).join('')})`}
                                      </span>
                                    )}
                                  </span>
                                  {gameMode === 'targetAmount' && (
                                    <span className={`${metaChip} tabular-nums`}>Target ${Number(targetAmount).toLocaleString()}</span>
                                  )}
                                  <span className={`${metaChip} tabular-nums`}>
                                    {selectedPowerUps.length} of {(Object.keys(POWER_UPS) as PowerUpKey[]).length} power-ups
                                  </span>
                                  <span className={`${metaChip} tabular-nums`}>
                                    {turnTimerSeconds === 0 ? 'No timer' : `${turnTimerSeconds} s ${mpRoomCode ? 'per round' : 'per turn'}`}
                                  </span>
                                  <span className={`${metaChip} ${desktopStatus.decryptionFailed ? '!text-gc-loss' : ''}`}>
                                    {sentenceStatus(desktopStatus).label}
                                    {desktopStatus.isPortable && <span className="text-gc-cap" title="Portable edition">· Portable</span>}
                                    {desktopStatus.isReadOnly && <span className="text-gc-cap text-gc-loss" title="Read-only media">· Read-only</span>}
                                  </span>
                                  <span className={`${metaChip} text-gc-ink group-hover:border-gc-line/30`}>
                                    {isSettingsDeckExpanded ? 'Hide settings' : 'Settings'}
                                    <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${isSettingsDeckExpanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                                  </span>
                                </button>
                                )}

                                {/* The game's settings. Each row opens the settings window on its tab. */}
                                {isSettingsDeckExpanded && (
                                  <div className="w-full max-w-4xl mt-3 gc-surface rounded-gc-lg p-3 sm:p-4 text-left animate-gc-fade">
                                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1">
                                      <h3 className="text-gc-body font-bold text-gc-ink">Game settings</h3>
                                      <p className="text-gc-cap text-gc-quiet">Change them for this hand or from the next one.</p>
                                    </div>

                                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                      {drawerRows.map(row => (
                                        <button
                                          key={row.tab}
                                          type="button"
                                          onClick={() => handleOpenSettingsModal(row.tab)}
                                          className={`group flex items-center gap-3 w-full min-h-[60px] ${drawerCell} hover:border-gc-gold/60 text-left transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-turn`}
                                          title={`Change the ${row.label.toLowerCase()}`}
                                        >
                                          <span className="w-9 h-9 shrink-0 rounded-full bg-gc-line/[0.07] grid place-items-center text-[18px] leading-none" aria-hidden="true">{row.icon}</span>
                                          <span className="flex-1 min-w-0">
                                            <span className="block text-gc-cap font-semibold text-gc-quiet">{row.label}</span>
                                            <span className={`block text-gc-small font-bold truncate ${row.warn ? 'text-gc-loss' : 'text-gc-ink'}`}>{row.value}</span>
                                            {row.note && <span className="block text-gc-cap text-gc-info truncate">{row.note}</span>}
                                          </span>
                                          {row.next && (
                                            <span className="inline-block shrink-0 max-w-[9rem] truncate h-5 leading-5 px-1.5 rounded-full bg-gc-gold text-gc-on-gold text-gc-cap font-bold">
                                              Next: {row.next}
                                            </span>
                                          )}
                                          <Pencil className="w-4 h-4 shrink-0 text-gc-quiet group-hover:text-gc-gold transition-colors" aria-hidden="true" />
                                        </button>
                                      ))}

                                      {/* Timer: one tap, no window */}
                                      <div className={`min-h-[60px] ${drawerCell}`}>
                                        <span id="drawer-timer-label" className="block text-gc-cap font-semibold text-gc-quiet">
                                          {mpRoomCode ? 'Round timer' : 'Turn timer'}, in seconds
                                        </span>
                                        <div className="mt-1.5 grid grid-cols-6 gap-1" role="group" aria-labelledby="drawer-timer-label">
                                          {TURN_TIMER_OPTIONS.map(secs => {
                                            const isSelected = turnTimerSeconds === secs;
                                            return (
                                              <button
                                                key={secs}
                                                type="button"
                                                aria-pressed={isSelected}
                                                onClick={() => {
                                                  playSound('click');
                                                  setTurnTimerSeconds(secs);
                                                  // Package T2: a new timer length never unlocks a player who is already locked in.
                                                  setTurnTimers(prev => {
                                                    const kept: typeof prev = {};
                                                    (Object.entries(prev) as [string, PlayerTurnTimer][]).forEach(([k, t]) => {
                                                      if (t?.status === 'locked') kept[Number(k)] = t;
                                                    });
                                                    return kept;
                                                  });
                                                  setMpRoundTimer(prev => (prev.status === 'locked' ? prev : { status: 'idle', remainingMs: secs * 1000 }));
                                                  mpAutoStartedRoundRef.current = 0;
                                                }}
                                                className={`h-8 rounded-gc-sm border text-gc-small font-bold tabular-nums transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-turn ${
                                                  isSelected
                                                    ? 'bg-gc-gold/15 border-gc-gold text-gc-ink'
                                                    : 'border-gc-line/[0.14] text-gc-ink hover:border-gc-line/30'
                                                }`}
                                              >
                                                {secs === 0 ? 'Off' : secs}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    </div>

                                    {/* Power-ups: tap one to turn it on or off */}
                                    <div className={`mt-2 ${drawerCell}`}>
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="text-gc-small font-semibold text-gc-ink">
                                          Power-ups <span className="text-gc-quiet tabular-nums">({selectedPowerUps.length} of {(Object.keys(POWER_UPS) as PowerUpKey[]).length})</span>
                                        </span>
                                        <span className="flex flex-wrap items-center gap-1">
                                          <button type="button" onClick={() => handleToggleAllPowerUps(true)} className={drawerLink}>All on</button>
                                          <button type="button" onClick={() => handleToggleAllPowerUps(false)} className={drawerLink}>All off</button>
                                          <button type="button" onClick={() => { playSound('click'); setShowDeckConfigModal(true); }} className={drawerLink}>Choose power-ups</button>
                                        </span>
                                      </div>
                                      <div className="mt-2 flex flex-wrap gap-1">
                                        {(Object.keys(POWER_UPS) as PowerUpKey[]).map(key => {
                                          const isActive = selectedPowerUps.includes(key);
                                          const isDisabledInCloze = isClozeRound && CLOZE_DISABLED_POWER_UPS.includes(key);
                                          const isDisabledInBinary = !isClozeRound && BINARY_DISABLED_POWER_UPS.includes(key);
                                          const isDisabledInSolo = !mpRoomCode && MP_ONLY_POWER_UPS.includes(key);
                                          const isFormatDisabled = isDisabledInCloze || isDisabledInBinary || isDisabledInSolo;
                                          const powerUp = POWER_UPS[key];
                                          const whyNotNow = isDisabledInCloze
                                            ? 'Not used on gap questions'
                                            : isDisabledInBinary
                                              ? 'Only on gap questions'
                                              : isDisabledInSolo
                                                ? 'Only in a live room'
                                                : '';
                                          return (
                                            <PowerUpTooltip
                                              key={key}
                                              powerUpKey={key}
                                              placement="bottom"
                                              statusBadge={
                                                <div className={`font-semibold ${isFormatDisabled ? 'text-amber-300' : isActive ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                  {whyNotNow || (isActive ? 'On. Tap to turn it off.' : 'Off. Tap to turn it on.')}
                                                </div>
                                              }
                                            >
                                              <button
                                                type="button"
                                                aria-pressed={isActive}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleTogglePowerUpInDeck(key);
                                                }}
                                                className={`relative w-9 h-9 rounded-full grid place-items-center text-[18px] leading-none border transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-turn ${
                                                  isActive && !isFormatDisabled
                                                    ? 'bg-gc-gold/15 border-gc-gold/60 hover:scale-110'
                                                    : 'border-gc-line/[0.14] opacity-35 grayscale hover:opacity-75'
                                                }`}
                                                title={`${powerUp.name}: ${whyNotNow || (isActive ? 'on' : 'off')}`}
                                                aria-label={`${powerUp.name}${whyNotNow ? ` (${whyNotNow.toLowerCase()})` : ''}`}
                                              >
                                                {powerUp.icon}
                                              </button>
                                            </PowerUpTooltip>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </div>
                                )}
                            </div> 
                          </>
                        )}
                      </div> 
                    </div>

                  </div>
                </div>

                {/* In Multiplayer mode, display the Shared Round Timer for everyone instead of a Turn Sequence frame */}
                {isTurnTimerEnabled && mpRoomCode && (
                  <MultiplayerRoundTimerFrame
                    timer={mpRoundTimer}
                    turnDurationMs={turnDurationMs}
                    turnTimerSeconds={turnTimerSeconds}
                    allPlayersLocked={allMpPlayersLocked}
                    lockedCount={mpLockedCount}
                    totalActivePlayers={unfrozenActivePlayers.length}
                    autoStartTimer={autoStartNextTimer}
                    onToggleAutoStart={() => {
                      playSound('click');
                      setAutoStartNextTimer(v => !v);
                    }}
                    onStart={handleMpRoundTimerStart}
                    onPause={handleMpRoundTimerPause}
                    onAddTime={handleMpRoundTimerAddTime}
                    onLockNow={handleMpRoundTimerLockNow}
                    onReset={handleMpRoundTimerReset}
                    onOpenAiSettings={() => handleOpenSettingsModal('ai')}
                    aiStatusLabel={sentenceStatus(desktopStatus, currentSentence).label}
                    playSound={playSound}
                  />
                )}

                {/* Croupier's Sequential Turn Bar when Turn Timer is enabled (Single-screen / Hot-Seat mode only) */}
                {isTurnTimerEnabled && !mpRoomCode && (
                  <div className="mb-5 p-3.5 sm:px-5 rounded-gc gc-surface flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-gc-small font-bold text-gc-ink">
                        Turns ({turnTimerSeconds} s each)
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {activePlayers.map((p, idx) => {
                          const frozen = isPlayerFrozen(p.id);
                          const st = turnTimers[p.id]?.status ?? 'idle';
                          const badgeClass = frozen
                            ? 'bg-cyan-500/15 border-cyan-400/50 text-cyan-800 dark:text-cyan-200'
                            : st === 'running'
                              ? 'bg-gc-gold border-transparent text-gc-on-gold font-bold'
                              : st === 'paused'
                                ? 'bg-gc-info/15 border-transparent text-gc-info'
                                : st === 'locked'
                                  ? 'bg-gc-win/15 border-transparent text-gc-win'
                                  : 'bg-gc-line/[0.07] border-gc-line/[0.12] text-gc-quiet';
                          return (
                            <React.Fragment key={p.id}>
                              {idx > 0 && <span className="text-gc-quiet/60 text-xs select-none" aria-hidden="true">&rarr;</span>}
                              <span className={`h-8 pl-1.5 pr-3 rounded-full text-gc-small font-semibold border flex items-center gap-1.5 ${badgeClass}`}>
                                <PlayerAvatar value={p.avatar} size="xs" />
                                <span>{p.name}</span>
                                <span className="text-[10px]">
                                  {frozen ? '❄️' : st === 'running' ? '⏱️' : st === 'paused' ? '⏸' : st === 'locked' ? '🔒' : '⏳'}
                                </span>
                              </span>
                            </React.Fragment>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {!activeTurnPlayer && nextIdlePlayer && (
                        <button
                          type="button"
                          onClick={() => handleTimerStart(nextIdlePlayer.id)}
                          data-hotkey="timer"
                          className="h-9 px-4 rounded-full text-gc-small font-bold gc-btn-primary hover:brightness-105 active:scale-95 transition-all cursor-pointer"
                        >
                          ▶ Start {nextIdlePlayer.name}'s turn
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => { playSound('click'); setAutoStartNextTimer(v => !v); }}
                        aria-pressed={autoStartNextTimer}
                        className={`h-9 px-3.5 rounded-full text-gc-small font-semibold border transition-colors cursor-pointer ${
                          autoStartNextTimer
                            ? 'bg-gc-gold/15 border-gc-gold/50 text-gc-money'
                            : 'bg-gc-line/[0.06] border-gc-line/[0.14] text-gc-quiet'
                        }`}
                        title="Automatically start the next player's timer when the current player's timer finishes or locks"
                      >
                        Next turn starts by itself: {autoStartNextTimer ? 'on' : 'off'}
                      </button>
                                          <button
                        type="button"
                        onClick={() => handleOpenSettingsModal('ai')}
                        className="h-9 px-3.5 bg-gc-line/[0.06] border border-gc-line/[0.14] hover:border-gc-line/30 rounded-full text-gc-small text-gc-ink flex items-center gap-1.5 font-semibold cursor-pointer transition-colors"
                        title="AI and offline settings"
                      >
                        <span data-testid="sentence-status">{sentenceStatus(desktopStatus, currentSentence).label}</span>
                      </button>
                    </div>
                  </div>
                )}
                {/* Live Classroom Multiplayer Projector Bar */}
                {mpRoomCode && (
                  <div className="mb-5 p-3.5 sm:px-5 rounded-gc gc-surface flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <button
                        type="button"
                        data-hotkey="room"
                        onClick={() => {
                          playSound('click');
                          setShowMpLobbyModal(true);
                        }}
                        className="h-9 px-4 rounded-full bg-gc-gold text-gc-on-gold tabular-nums font-bold text-gc-small cursor-pointer hover:brightness-105 transition-all flex items-center gap-1.5"
                      >
                        <Smartphone className="w-4 h-4 shrink-0" aria-hidden="true" />
                        <span>Room {mpRoomCode} · QR code</span>
                      </button>
                      <span className="text-gc-small font-semibold text-gc-quiet tabular-nums" aria-live="polite">
                        {presenceSummary(Object.keys(mpSeats).length, mpAwayIds.filter(id => mpSeats[id]).length)}
                      </span>

                      <div className="text-gc-small text-gc-quiet flex items-center gap-2">
                        <span>Locked in:</span>
                        <span className="tabular-nums font-bold text-gc-ink">
                          {mpLockedCount} of {unfrozenActivePlayers.length}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          playSound('click');
                          setMpHideProjectorBets(v => !v);
                        }}
                        data-hotkey="hide-bets"
                        aria-pressed={mpHideProjectorBets}
                        className={`h-9 px-3.5 rounded-full text-gc-small font-semibold border transition-colors cursor-pointer flex items-center gap-1.5 ${
                          mpHideProjectorBets
                            ? 'bg-gc-win/15 border-transparent text-gc-win'
                            : 'bg-gc-line/[0.06] border-gc-line/[0.14] text-gc-ink'
                        }`}
                        title="Hide students' bets on the projector (best when they bet on phones), or show every betting card"
                      >
                        <span>{mpHideProjectorBets ? 'Bets hidden on the projector' : 'Showing every betting card'}</span>
                      </button>
                    </div>
                  </div>
                )}

                {mpRoomCode && mpHideProjectorBets ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {players.map((player, idx) => {
                      const allActive = Object.values(activePowerUps).flat() as ActivePowerUp[];
                      const playerActive = (activePowerUps[player.id] || []) as ActivePowerUp[];
                      const isFrozen = isFrozenBySubZero(player, allActive);
                      const mpSeat = mpSeats[player.id];
                      const hasSplit = playerActive.some(pu => pu.type === 'SPLIT_BET');
                      const isBetReady = mpSeat
                        ? mpSeat.lockedIn
                        : isBetCompleteForQuestionType(bets[player.id], currentQuestionType, hasSplit, currentSentence?.baseWord);
                      const isBankrupt = player.money <= 0;
                      const isAway = Boolean(mpSeat && mpAwayIds.includes(player.id));

                      return (
                        <div
                          key={player.id}
                          data-away={isAway ? 'true' : undefined}
                          className={`gc-surface rounded-gc shadow-gc-1 p-4 transition-all flex flex-col justify-between gap-3 animate-gc-slide-up ${
                            isBankrupt || isAway ? 'opacity-60 grayscale' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-12 h-12 rounded-full border-2 border-gc-turn/70 p-0.5 bg-gc-line/[0.08] flex items-center justify-center relative shrink-0">
                                <PlayerAvatar value={player.avatar} size="md" className="w-full h-full" />
                                {mpSeat && (
                                  <span
                                    className={`w-3.5 h-3.5 rounded-full border-2 border-gc-card absolute -bottom-0.5 -right-0.5 z-20 ${
                                      mpSeat.connected ? 'bg-gc-win' : 'bg-gc-gold'
                                    }`}
                                    title={mpSeat.connected ? 'Connected on a phone' : 'Disconnected'}
                                  />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="text-gc-lead font-bold text-gc-ink truncate">
                                  {player.name}
                                </div>
                                <div className="text-gc-cap text-gc-quiet tabular-nums inline-flex items-center gap-1">
                                  Seat {idx + 1} · {isAway ? <><WifiOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />away</> : mpSeat ? 'on a phone' : 'at the table'}
                                </div>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <div className="text-gc-cap text-gc-quiet">
                                Balance
                              </div>
                              <div className="tabular-nums font-extrabold text-gc-lead text-gc-money">
                                ${player.money.toLocaleString()}
                              </div>
                            </div>
                          </div>

                          {/* Active power-ups / effects row */}
                          {(playerActive.length > 0 || player.effects.length > 0) && (
                            <div className="flex flex-wrap gap-1.5">
                              {playerActive.map((pu, i) => (
                                <span
                                  key={i}
                                  className="px-2 py-0.5 rounded-full text-gc-cap font-semibold bg-gc-line/[0.07] border border-gc-line/[0.12] text-gc-ink"
                                >
                                  {POWER_UPS[pu.type]?.icon} {POWER_UPS[pu.type]?.name}
                                </span>
                              ))}
                              {player.effects.map((ef, i) => (
                                <span
                                  key={`ef-${i}`}
                                  className="px-2 py-0.5 rounded-full text-[10px] font-sans font-bold bg-purple-500/15 border border-purple-400/40 text-purple-900 dark:text-purple-200"
                                >
                                  {POWER_UPS[ef.type as PowerUpKey]?.icon || '✨'} {ef.type}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Status Pill */}
                          <div className="flex items-center gap-2">
                            <div
                              className={`flex-1 h-9 px-3 rounded-full text-gc-small font-bold text-center flex items-center justify-center gap-2 ${
                                isBankrupt
                                  ? 'bg-gc-loss/15 text-gc-loss'
                                  : isFrozen
                                    ? 'bg-gc-info/15 text-gc-info'
                                    : isBetReady
                                      ? 'bg-gc-win/15 text-gc-win animate-gc-pop'
                                      : 'bg-gc-line/[0.07] text-gc-quiet'
                              }`}
                            >
                              {isBankrupt ? (
                                <span>{gameMode === 'lastPlayer' ? 'Bankrupt' : 'Out until the next hand'}</span>
                              ) : isFrozen ? (
                                <span>Frozen this hand</span>
                              ) : isBetReady ? (
                                <>
                                  <Check className="w-4 h-4 shrink-0" strokeWidth={3} aria-hidden="true" />
                                  <span>Locked in (bet hidden)</span>
                                </>
                              ) : (
                                <>
                                  <span className="inline-flex gap-[3px]" aria-hidden="true">
                                    <i className="w-[5px] h-[5px] rounded-full bg-current animate-gc-blink" />
                                    <i className="w-[5px] h-[5px] rounded-full bg-current animate-gc-blink [animation-delay:0.2s]" />
                                    <i className="w-[5px] h-[5px] rounded-full bg-current animate-gc-blink [animation-delay:0.4s]" />
                                  </span>
                                  <span>Deciding on their phone</span>
                                </>
                              )}
                            </div>
                            {mpSeat?.lockedIn && !isBankrupt && !isFrozen && (
                              <button
                                type="button"
                                onClick={() => handleMpUnlockPlayer(player.id)}
                                title="Teacher only: unlock this player's bet so they can change it"
                                className="h-9 px-3.5 rounded-full text-gc-small font-semibold border border-gc-line/[0.16] bg-gc-line/[0.06] hover:border-gc-line/30 text-gc-ink transition-colors cursor-pointer shrink-0 flex items-center gap-1.5"
                              >
                                <LockOpen className="w-4 h-4 shrink-0" aria-hidden="true" />
                                <span>Unlock</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {!mpRoomCode && (
                      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-1">
                        <div className="min-w-0">
                          <h2 className="text-gc-lead font-bold text-gc-ink">Bets</h2>
                          <p className="text-gc-small text-gc-quiet">
                            {effectiveTableLayout === 'grid'
                              ? 'Tap a player to open their betting card. Picks stay hidden until the reveal.'
                              : 'All betting cards are open, so everyone can see each pick.'}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                          <div className="flex items-center gap-3 text-gc-small text-gc-quiet">
                            {potNow > 0 && (
                              <span className="gc-pot-plaque text-gc-small" data-testid="pot-plaque">
                                <span className="gc-pot-plaque-label">Pot</span>
                                <span className="gc-pot-plaque-amount">$<CountUp from={lastPotShown.current} to={potNow} durationMs={500} /></span>
                              </span>
                            )}
                            <span className="tabular-nums whitespace-nowrap">{betsReadyCount} of {unfrozenActivePlayers.length} {betsReadyWord}</span>
                            <span
                              className="block h-2 w-40 sm:w-56 rounded-full bg-gc-line/[0.08] border border-gc-line/[0.12] overflow-hidden"
                              role="progressbar"
                              aria-label="Bets in"
                              aria-valuemin={0}
                              aria-valuemax={unfrozenActivePlayers.length}
                              aria-valuenow={betsReadyCount}
                            >
                              <span
                                className="block h-full rounded-full bg-emerald-700 dark:bg-emerald-400 transition-[width] duration-gc-slow ease-gc-out"
                                style={{ width: `${unfrozenActivePlayers.length ? Math.round((betsReadyCount / unfrozenActivePlayers.length) * 100) : 0}%` }}
                              />
                            </span>
                          </div>
                          <div className="inline-flex p-1 rounded-full bg-gc-line/[0.07] border border-gc-line/[0.12]" role="group" aria-label="Table layout">
                            {(['grid', 'cards'] as const).map(layout => (
                              <button
                                key={layout}
                                type="button"
                                onClick={() => { playSound('click'); setTableLayoutPref(layout); }}
                                aria-pressed={effectiveTableLayout === layout}
                                className={`h-8 px-3.5 rounded-full text-gc-small font-semibold transition-colors cursor-pointer ${
                                  effectiveTableLayout === layout
                                    ? 'bg-gc-card text-gc-ink shadow-gc-1'
                                    : 'text-gc-quiet hover:text-gc-ink'
                                }`}
                              >
                                {layout === 'grid' ? 'Grid' : 'Full cards'}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    {!mpRoomCode && effectiveTableLayout === 'grid' ? (
                      openSeatPlayer ? (
                        <div ref={openSeatRef} key={openSeatPlayer.id} className="space-y-3 pt-1 animate-gc-slide-up">
                          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                            <div className="flex flex-wrap items-center gap-2 min-w-0">
                              <h2 className="text-gc-lead font-bold text-gc-ink mr-1">
                                {openSeatPlayer.name}'s betting card
                              </h2>
                              <div className="hidden sm:flex items-center gap-1.5 flex-wrap" role="group" aria-label="Switch player">
                                {playerTiles.map(({ player: p, status }) => {
                                  const isCurrent = p.id === openSeatPlayer.id;
                                  const isOut = status === 'out';
                                  return (
                                    <button
                                      key={p.id}
                                      type="button"
                                      disabled={isOut}
                                      onClick={() => {
                                        playSound('click');
                                        setOpenSeatPlayerId(p.id);
                                      }}
                                      className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-gc-cap font-semibold border transition-colors ${
                                        isCurrent
                                          ? 'bg-gc-gold/20 border-gc-turn text-gc-ink font-bold'
                                          : isOut
                                            ? 'opacity-40 border-gc-line/[0.1] text-gc-quiet cursor-not-allowed'
                                            : 'bg-gc-line/[0.06] border-gc-line/[0.14] text-gc-quiet hover:text-gc-ink hover:border-gc-line/30 cursor-pointer'
                                      }`}
                                    >
                                      <PlayerAvatar value={p.avatar} size="xs" />
                                      <span className="max-w-[6rem] truncate">{p.name}</span>
                                      {status === 'placed' && <Check className="w-3.5 h-3.5 text-gc-win shrink-0" strokeWidth={3} aria-hidden="true" />}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  playSound('click');
                                  setOpenSeatPlayerId(null);
                                  setIsSentenceHeaderStuck(false);
                                  window.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                                className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full text-gc-small font-semibold border border-gc-line/[0.16] text-gc-ink hover:bg-gc-line/[0.06] transition-colors cursor-pointer"
                              >
                                <ChevronLeft className="w-4 h-4 shrink-0" aria-hidden="true" />
                                All players
                              </button>
                              {nextSeatPlayer && (
                                <button
                                  type="button"
                                  onClick={() => { playSound('click'); setOpenSeatPlayerId(nextSeatPlayer.id); }}
                                  className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full text-gc-small font-semibold border border-gc-line/[0.16] text-gc-ink hover:bg-gc-line/[0.06] transition-colors cursor-pointer"
                                >
                                  Next: {nextSeatPlayer.name}
                                  <ChevronRight className="w-4 h-4 shrink-0" aria-hidden="true" />
                                </button>
                              )}
                            </div>
                          </div>
                          {renderPlayerSeat(openSeatPlayer)}
                        </div>
                      ) : (
                        <PlayerTileGrid
                          tiles={playerTiles}
                          openPlayerId={null}
                          onOpen={(id) => {
                            playSound('click');
                            setIsSentenceHeaderStuck(true);
                            setOpenSeatPlayerId(id);
                          }}
                          outLabel="Bankrupt"
                          projectorMode={isProjectorMode}
                          arc={isTableView}
                          hideMoney={currentSpecialHand === 'finalTable'}
                        />
                      )
                    ) : (
                      <div className="grid grid-cols-1 gap-5 sm:gap-6">
                        {players.map(renderPlayerSeat)}
                      </div>
                    )}
                  </div>
                )}
                {/* Package T2: one control bar, pinned to the bottom of the screen during the hand,
                    so the teacher never scrolls past 35 seats to reveal. */}
                <div
                  className="relative sm:sticky sm:bottom-0 z-30 mt-10 -mx-3 sm:-mx-4 px-3 sm:px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-gc-bg/90 backdrop-blur-md border-t border-gc-line/[0.12] flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 print:hidden"
                  data-testid="control-bar"
                  role="toolbar"
                  aria-label="Hand controls"
                >
                  <div className={`order-first w-full sm:w-auto flex justify-center rounded-full ${canRevealResults && !isProcessing ? 'animate-gc-breathe' : ''}`}>
                    <ActionButton 
                      data-hotkey="primary"
                      onClick={handleRevealResults} 
                      playSound={playSound} 
                      variant="primary"
                      className="w-full md:w-auto min-h-[52px] text-gc-lead py-3 px-10" 
                      disabled={isProcessing || !canRevealResults}
                    >
                      {isProcessing ? processingStatus || 'Settling the bets…' : (
                        <span className="inline-flex flex-wrap items-baseline justify-center gap-x-3 gap-y-0.5">
                          <span>Reveal the answer</span>
                          {revealNote && <span className="text-gc-body font-semibold opacity-80">{revealNote}</span>}
                        </span>
                      )}
                    </ActionButton>
                  </div>

                  {/* Always offer an early reveal, so one player who never bets cannot block the hand (F4 fix 12) */}
                  {(mpRoomCode ? !allMpPlayersLocked : isTurnTimerEnabled ? !allActivePlayersLocked : !allValidBetsFinalized) && (
                    <button
                      type="button"
                      onClick={() => {
                        playSound('click');
                        setTeacherRevealOverride(v => !v);
                      }}
                      aria-pressed={teacherRevealOverride}
                      className={`text-gc-small font-semibold underline underline-offset-4 px-2 py-1.5 rounded-md transition-colors cursor-pointer ${
                        teacherRevealOverride ? 'text-gc-loss' : 'text-gc-quiet hover:text-gc-ink'
                      }`}
                      title="Teacher only: allow the reveal before every player has locked in"
                    >
                      {teacherRevealOverride ? 'Early reveal is on. Turn it off' : 'Let me reveal before everyone is in'}
                    </button>
                  )}

                  {/* Teacher controls (package R8): reveal now, pause, swap the sentence. */}
                  {(mpRoomCode ? !allMpPlayersLocked : isTurnTimerEnabled ? !allActivePlayersLocked : !allValidBetsFinalized) && (
                    <button
                      type="button"
                      disabled={isLoading || isProcessing || !currentSentence}
                      onClick={() => {
                        playSound('click');
                        setConfirmAction({
                          title: 'Reveal now?',
                          message: 'The answer is revealed straight away. Players who have not placed a bet sit this hand out.',
                          confirmLabel: 'Reveal now',
                          onConfirm: () => { void handleRevealResults(true); },
                        });
                      }}
                      data-hotkey="reveal-now"
                      className="inline-flex items-center gap-1.5 min-h-[44px] text-gc-small font-semibold text-gc-quiet hover:text-gc-ink px-3 rounded-md transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Teacher only: reveal the answer without waiting for everyone"
                    >
                      <Eye className="w-4 h-4 shrink-0" aria-hidden="true" />
                      Reveal now
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={isLoading || isProcessing}
                    onClick={() => { playSound('click'); setIsPaused(true); }}
                    data-hotkey="pause"
                    className="inline-flex items-center gap-1.5 min-h-[44px] text-gc-small font-semibold text-gc-quiet hover:text-gc-ink px-3 rounded-md transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Teacher only: stop the timers and the phones for a moment"
                  >
                    <Pause className="w-4 h-4 shrink-0" aria-hidden="true" />
                    Pause
                  </button>
                  <button
                    type="button"
                    disabled={isLoading || isProcessing}
                    onClick={() => {
                      playSound('click');
                      setConfirmAction({
                        title: 'Swap this sentence?',
                        message: 'A different sentence is dealt for this hand. Bets are cleared, and everyone gets back what they spent on hints and power-ups this hand.',
                        confirmLabel: 'Swap the sentence',
                        onConfirm: handleSwapSentence,
                      });
                    }}
                    data-hotkey="swap"
                    className="inline-flex items-center gap-1.5 min-h-[44px] text-gc-small font-semibold text-gc-quiet hover:text-gc-ink px-3 rounded-md transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Teacher only: deal a different sentence for this hand"
                  >
                    <RotateCcw className="w-4 h-4 shrink-0" aria-hidden="true" />
                    Swap this sentence
                  </button>
                  {gameMode === 'rounds' && currentRound < Number(totalRounds) && (
                    <button
                      type="button"
                      onClick={() => {
                        playSound('click');
                        setConfirmAction({
                          title: 'Finish after this hand?',
                          message: `This becomes the last hand (hand ${currentRound} of ${currentRound}). The most money after it wins.`,
                          confirmLabel: 'Make it the last hand',
                          onConfirm: () => setTotalRounds(currentRound),
                        });
                      }}
                      className="inline-flex items-center gap-1.5 min-h-[44px] text-gc-small font-semibold text-gc-quiet hover:text-gc-ink px-3 rounded-md transition-colors cursor-pointer"
                      title="Teacher only: end the game after this hand"
                    >
                      <Flag className="w-4 h-4 shrink-0" aria-hidden="true" />
                      Finish after this hand
                    </button>
                  )}
                  {gameClock && (
                    <span className="inline-flex items-center gap-1.5 min-h-[44px] px-3 text-gc-small font-semibold text-gc-quiet tabular-nums" data-testid="game-clock">
                      <Clock className="w-4 h-4 shrink-0" aria-hidden="true" />
                      {gameClock}
                    </span>
                  )}
                </div> 
              </div> 
            ); 
        }
        case 'RESULTS': {
            const numTargetAmount = typeof targetAmount === 'string' ? parseInt(targetAmount, 10) : targetAmount;
            const {
              isGameOver,
              isRoundLimitReached,
              hasTargetWinner,
              isEliminationVictory,
              isAllBankrupt,
              bailoutEnabled: isBailoutEnabled,
            } = checkGameEnd({ players, gameMode, currentRound, totalRounds, targetAmount, isRoom: Boolean(mpRoomCode) });
            const resultQuestionType: QuestionType = currentSentence?.questionType || 'binary';
            const isResultCloze = isGapType(resultQuestionType);
            // Flawed Valid/Flawed sentences: underline the mistake and highlight the fix.
            const revealHighlight = (() => {
              if (!currentSentence || isResultCloze || currentSentence.isCorrect || !currentSentence.correction) return null;
              const diff = diffWords(currentSentence.text, currentSentence.correction);
              const fromPhrase = markErrorPhrase(currentSentence.text, currentSentence.errorPhrase);
              const sentence = fromPhrase || diff.original;
              return { sentence, correction: diff.corrected };
            })();
            const nextFormatObj = CHALLENGE_FORMATS.find(f => f.id === (nextRoundSettings?.challengeFormat || settings.challengeFormat || 'binary')) || CHALLENGE_FORMATS[0];

            // Payouts: rank by balance (ties share a rank), and how far each player moved this hand.
            const rankOf = (value: number, all: number[]) => 1 + all.filter(v => v > value).length;
            const newTotals = roundResults.map(r => r.newTotal);
            const prevTotals = roundResults.map(r => r.newTotal - r.amountChanged);
            const payoutRows = [...roundResults]
              .sort((a, b) => b.newTotal - a.newTotal)
              .map(result => {
                const rank = rankOf(result.newTotal, newTotals);
                const prevRank = rankOf(result.newTotal - result.amountChanged, prevTotals);
                return { result, rank, move: prevRank - rank };
              });
            const showMoves = currentRound > 1;
            const rankBadge = (rank: number) =>
              rank === 1
                ? 'bg-[#f1cf72] text-[#231803]'
                : rank === 2
                  ? 'bg-[#d6dbe0] text-[#1f2937]'
                  : rank === 3
                    ? 'bg-[#d39a6a] text-[#2b1608]'
                    : 'bg-gc-line/[0.08] text-gc-quiet';
            const chipButton = 'inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-gc-line/[0.07] border border-gc-line/[0.12] text-gc-small font-semibold text-gc-ink hover:border-gc-line/30 transition-colors cursor-pointer';
            const rulingWord = isResultCloze ? null : currentSentence?.isCorrect ? 'Valid' : 'Flawed';

            return ( 
            <div className={`w-full ${isProjectorMode ? 'max-w-7xl' : 'max-w-6xl'} animate-fade-in p-2 md:p-4`}>
                {hasTargetWinner && (
                  <div className="mb-5 px-5 py-4 rounded-gc bg-gc-win/15 text-gc-win text-center text-gc-lead font-extrabold animate-gc-pop" role="status">
                    Target of ${numTargetAmount.toLocaleString()} reached. We have a winner!
                  </div>
                )}

                {/* The ruling: the sentence again, a stamp, then the correction and why */}
                <section className="gc-surface shadow-gc-2 rounded-gc-lg relative px-5 sm:px-14 pt-6 pb-7 text-center animate-gc-deal" aria-label="The ruling">
                    <div className="flex justify-center">
                      <span className="inline-flex items-center h-8 px-3.5 rounded-full bg-gc-gold text-gc-on-gold text-gc-small font-bold whitespace-nowrap">
                        Hand {currentRound}{gameMode === 'rounds' ? ` of ${totalRounds}` : ''} · The ruling
                      </span>
                    </div>
                    {rulingWord && (
                      <span
                        role="status"
                        className={`lg:absolute lg:top-6 lg:right-8 mt-4 lg:mt-0 inline-block px-4 py-1 border-4 border-current rounded-gc-sm text-gc-title sm:text-[28px] font-extrabold uppercase tracking-[0.06em] animate-gc-stamp ${
                          currentSentence?.isCorrect ? 'text-emerald-700 dark:text-emerald-400' : 'text-gc-danger'
                        }`}
                      >
                        {rulingWord}
                      </span>
                    )}

                    {resultQuestionType === 'keyWordTransformation' && currentSentence?.leadInSentence && (
                      <div className={`mt-5 mx-auto ${isProjectorMode ? 'max-w-4xl px-5 py-3.5' : 'max-w-3xl px-4 py-3'} rounded-gc bg-gc-line/[0.05] border border-gc-line/[0.12]`}>
                        <div className="text-gc-small font-bold text-gc-quiet mb-0.5">
                          First sentence{currentSentence.baseWord ? ` · Key word: ${currentSentence.baseWord.toUpperCase()}` : ''}
                        </div>
                        <div className={`${isProjectorMode ? 'text-xl sm:text-[26px] leading-snug font-medium' : 'text-gc-lead'} font-sentence italic text-gc-ink`}>
                          &ldquo;{currentSentence.leadInSentence}&rdquo;
                        </div>
                      </div>
                    )}

                    <p className={`font-sentence italic ${isProjectorMode ? 'font-semibold text-4xl sm:text-5xl lg:text-[3.35rem] leading-[1.24]' : 'font-medium text-3xl sm:text-4xl lg:text-[2.875rem] leading-[1.3]'} text-gc-ink text-balance mt-5 max-w-5xl mx-auto ${rulingWord ? 'lg:px-28' : ''}`}>
                      &ldquo;{revealHighlight
                        ? renderTextSegments(revealHighlight.sentence, 'bg-transparent text-gc-danger underline decoration-wavy decoration-2 underline-offset-[9px] animate-gc-fade [animation-delay:0.55s]')
                        : currentSentence?.text}&rdquo;
                      {resultQuestionType === 'wordFormation' && currentSentence?.baseWord && (
                        <span className="inline-block ml-2 px-2.5 py-0.5 rounded-md bg-gc-gold/15 border border-gc-gold/40 text-gc-money font-sans tabular-nums font-black not-italic tracking-wider text-gc-lead align-middle">
                          ({currentSentence.baseWord.toUpperCase()})
                        </span>
                      )}
                    </p>
                </section>

                {levelNotice && levelNotice.round === currentRound && (
                  <div role="status" data-testid="level-notice" className="mt-4 px-5 py-3 rounded-gc-lg bg-gc-info/[0.08] border border-gc-info/30 text-center text-gc-body font-semibold text-gc-ink">
                    {levelNotice.text}
                  </div>
                )}

                {sayItOn && currentSentence && (() => {
                  // A gap sentence is said with the answer in the gap; other types say the corrected sentence.
                  const said = /_{2,}/.test(currentSentence.text) && currentSentence.correctAnswer
                    ? currentSentence.text.replace(/_{2,}/g, currentSentence.correctAnswer)
                    : isResultCloze || !currentSentence.isCorrect ? currentSentence.correction : currentSentence.text;
                  if (!said) return null;
                  return (
                    <div data-testid="say-it" className="mt-4 px-5 py-4 rounded-gc-lg bg-gc-gold/[0.12] border border-gc-gold/40 text-center animate-gc-slide-up">
                      <div className="text-gc-body font-extrabold text-gc-ink">
                        <span aria-hidden="true">🗣️ </span>Say it: turn to a partner and say the right sentence aloud.
                      </div>
                      <div className={`mt-1.5 font-sentence italic text-gc-ink ${isProjectorMode ? 'text-2xl sm:text-3xl font-semibold' : 'text-gc-lead sm:text-2xl'}`}>&ldquo;{said}&rdquo;</div>
                    </div>
                  );
                })()}

                {currentSpecialHand === 'fixIt' && (() => {
                  const record = roundHistory.find(r => r.round === currentRound);
                  const list = classCorrections(record?.playerResults || []);
                  return (
                    <div data-testid="fixit-corrections" className="mt-4 px-5 sm:px-8 py-4 rounded-gc-lg gc-surface text-left animate-gc-slide-up">
                      <h3 className="text-gc-body font-extrabold text-gc-ink">
                        <span aria-hidden="true">🛠️ </span>The class&rsquo;s corrections
                      </h3>
                      {list.length === 0 ? (
                        <p className="mt-1 text-gc-small text-gc-quiet">Nobody typed a correction this time.</p>
                      ) : (
                        <ul className="mt-2 space-y-1.5">
                          {list.map((c, i) => (
                            <li key={i} className="flex items-start gap-2.5">
                              <span className={`mt-0.5 shrink-0 inline-flex items-center h-6 px-2 rounded-full text-gc-cap font-bold ${c.accepted ? 'bg-gc-win/15 text-gc-win' : 'bg-gc-line/[0.08] text-gc-quiet'}`}>
                                {c.accepted ? 'Accepted' : 'Not quite'}
                              </span>
                              <span className={`font-sentence italic text-gc-ink ${isProjectorMode ? 'text-2xl' : 'text-gc-lead'}`}>&ldquo;{c.text}&rdquo;</span>
                              {c.count > 1 && <span className="mt-1 text-gc-cap text-gc-quiet tabular-nums shrink-0">×{c.count}</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })()}

                {isResultCloze && currentSentence?.correction && (
                    <div className="gc-surface rounded-gc-lg mt-4 px-5 sm:px-8 py-5 animate-gc-slide-up [animation-delay:0.75s]">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                            <h3 className="text-gc-small font-bold text-gc-quiet">
                              The answer: <span className="text-gc-win">&ldquo;{currentSentence?.correctAnswer}&rdquo;</span>
                            </h3>
                            {(isTypedAnswerType(resultQuestionType)) && (() => {
                              const altAccepted = getAlternativeAcceptedAnswers(currentSentence.correctAnswer, currentSentence.acceptedAnswers);
                              return altAccepted.length > 0 ? (
                                <span className="text-gc-small font-semibold text-gc-win bg-gc-win/15 px-2.5 py-0.5 rounded-full">
                                  Also accepted: {altAccepted.map(a => `"${a}"`).join(', ')}
                                </span>
                              ) : null;
                            })()}
                        </div>
                        <p className={`font-sentence italic text-gc-ink ${isProjectorMode ? 'text-3xl sm:text-4xl font-semibold' : 'text-2xl sm:text-[30px]'} leading-snug`}>
                          &ldquo;{currentSentence.correction}&rdquo;
                        </p>

                        {resultQuestionType === 'keyWordTransformation' &&
                          currentSentence.mark1Parts && currentSentence.mark1Parts.length > 0 &&
                          currentSentence.mark2Parts && currentSentence.mark2Parts.length > 0 && (
                            <div className="mt-4 pt-3.5 border-t border-gc-line/[0.12]">
                              <div className="text-gc-cap font-bold uppercase tracking-wider text-gc-quiet mb-2">
                                Cambridge Part 4 · 2-Mark Split Breakdown
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                <div className="rounded-gc bg-gc-win/[0.08] border border-gc-win/30 px-3.5 py-2.5 flex items-center justify-between gap-3">
                                  <div>
                                    <div className="text-gc-cap font-extrabold uppercase tracking-wider text-gc-win">
                                      1st Half · 1 Mark
                                    </div>
                                    <div className={`font-sentence italic font-semibold text-gc-ink ${isProjectorMode ? 'text-2xl' : 'text-lg'}`}>
                                      &ldquo;{currentSentence.mark1Parts[0]}&rdquo;
                                    </div>
                                  </div>
                                  <span className="shrink-0 px-2.5 py-1 rounded-full bg-gc-win/20 text-gc-win text-gc-cap font-black tabular-nums">
                                    +1 pt
                                  </span>
                                </div>

                                <div className="rounded-gc bg-gc-gold/[0.10] border border-gc-gold/35 px-3.5 py-2.5 flex items-center justify-between gap-3">
                                  <div>
                                    <div className="text-gc-cap font-extrabold uppercase tracking-wider text-gc-money">
                                      2nd Half · 1 Mark
                                    </div>
                                    <div className={`font-sentence italic font-semibold text-gc-ink ${isProjectorMode ? 'text-2xl' : 'text-lg'}`}>
                                      &ldquo;{currentSentence.mark2Parts[0]}&rdquo;
                                    </div>
                                  </div>
                                  <span className="shrink-0 px-2.5 py-1 rounded-full bg-gc-gold/25 text-gc-money text-gc-cap font-black tabular-nums">
                                    +1 pt
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                    </div>
                )}

                {!isResultCloze && !currentSentence?.isCorrect && (
                    <div className="gc-surface rounded-gc-lg mt-4 px-5 sm:px-8 py-5 animate-gc-slide-up [animation-delay:0.75s]">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                            <h3 className="text-gc-small font-bold text-gc-quiet">Correction</h3>
                            {currentSentence?.errorPhrase && (
                                <span className="text-gc-small font-semibold text-gc-loss bg-gc-loss/15 px-2.5 py-0.5 rounded-full">
                                    The mistake: &ldquo;{currentSentence.errorPhrase}&rdquo;{currentSentence.mistakeType ? ` · ${currentSentence.mistakeType}` : ''}
                                </span>
                            )}
                        </div>
                        <p className={`font-sentence italic text-gc-ink ${isProjectorMode ? 'text-3xl sm:text-4xl font-semibold' : 'text-2xl sm:text-[30px]'} leading-snug`}>
                          &ldquo;{revealHighlight
                            ? renderTextSegments(revealHighlight.correction, 'bg-gc-win/20 text-gc-win rounded-md px-1.5')
                            : currentSentence?.correction}&rdquo;
                        </p>
                    </div>
                )}

                <div className="gc-surface rounded-gc-lg mt-3.5 px-5 sm:px-8 py-5 animate-gc-slide-up [animation-delay:1s]">
                    <h3 className="text-gc-small font-bold text-gc-quiet mb-1.5">Why</h3>
                    <p className="text-gc-ink text-gc-body sm:text-gc-lead leading-relaxed">
                      {currentSentence?.explanation}
                    </p>
                    {simplifiedExplanation.text && (
                        <div className="mt-3 px-4 py-3 rounded-gc-sm bg-gc-info/15 text-gc-info text-gc-body">
                            <strong>In more detail:</strong> {simplifiedExplanation.text}
                        </div>
                    )}
                    <div className="flex flex-wrap gap-2 mt-4">
                      <button 
                          onClick={() => {
                          if (!currentSentence) return;
                          if (isResultCloze) {
                            // Read the full completed sentence on the Results screen!
                            const fullCompleted = currentSentence.correction || currentSentence.text.replace(/_{2,}/g, currentSentence.correctAnswer || '');
                            const parts = [
                                resultQuestionType === 'keyWordTransformation' && currentSentence.leadInSentence
                                  ? `Lead-in sentence: ${currentSentence.leadInSentence}`
                                  : null,
                                fullCompleted,
                                `Explanation: ${currentSentence.explanation}`
                            ].filter(Boolean);
                            speakText(parts.join('. '));
                          } else {
                            const parts = [
                                currentSentence.text,
                                !currentSentence.isCorrect ? `Correction: ${currentSentence.correction}` : null,
                                `Explanation: ${currentSentence.explanation}`
                            ].filter(Boolean);
                            speakText(parts.join('. '));
                          }
                          }} 
                          disabled={isSpeaking}
                          className={`${chipButton} ${isSpeaking ? 'opacity-50 !cursor-not-allowed' : ''}`}
                          title="Read the sentence, the correction and the explanation aloud"
                      >
                          <Volume2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                          {isSpeaking ? 'Speaking…' : 'Listen'}
                      </button>
                      {currentSentence?.explanation && (
                        <button 
                            onClick={handleSimplifyExplanation} 
                            disabled={simplifiedExplanation.loading || !!simplifiedExplanation.text} 
                            className={`${chipButton} disabled:opacity-50 disabled:cursor-default`}
                        >
                            {simplifiedExplanation.loading ? 'Loading…' : simplifiedExplanation.text ? 'More detail shown' : 'Explain in more detail'}
                        </button>
                      )}
                    </div>
                </div>

                {/* Package L5: what the class answered, and how many are still confused. */}
                {(() => {
                  const snap = isRevealSnapshotCurrent ? revealSnapshot : null;
                  const qt = (currentSentence.questionType || 'binary') as QuestionType;
                  const accepted = snap?.input.acceptedSet ?? buildAcceptedAnswerSet(currentSentence, qt).acceptedSet;
                  const verdicts = snap?.input.clozeWordVerifications ?? {};
                  const rows = answerSplit({
                    qType: qt,
                    bets,
                    playerIds: (snap?.input.validPlayers ?? players).map(p => p.id),
                    sentenceIsCorrect: currentSentence.isCorrect,
                    options: currentSentence.options,
                    isRightAnswer: (a) => {
                      const k = normalizeGapAnswer(a);
                      if (isOptionType(qt)) return k === normalizeGapAnswer(currentSentence.correctAnswer);
                      if (qt === 'keyWordTransformation') return verdicts[k]?.marks === 2;
                      return accepted.has(k) || Boolean(verdicts[k]?.isCorrect);
                    },
                  });
                  const counts = reactionCounts(handReactions, currentRound);
                  if (rows.length === 0 && counts.gotIt + counts.confused === 0) return null;
                  const shown = rows.slice(0, 6);
                  const top = Math.max(1, ...shown.map(r => r.count));
                  return (
                    <div className="gc-surface rounded-gc-lg p-6 mt-6 animate-gc-slide-up [animation-delay:1.1s]" data-testid="answer-split">
                      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
                        <h3 className="text-gc-title font-bold text-gc-ink">What the class answered</h3>
                        {counts.gotIt + counts.confused > 0 && (
                          <p className="text-gc-body font-semibold" data-testid="reaction-counts">
                            <span className="text-gc-win">{counts.gotIt} got it</span>
                            <span className="text-gc-quiet"> · </span>
                            <span className={counts.confused > 0 ? 'text-gc-danger' : 'text-gc-quiet'}>{counts.confused} still confused</span>
                          </p>
                        )}
                      </div>
                      <ul className="space-y-2">
                        {shown.map(r => (
                          <li key={r.label} className="flex items-center gap-3">
                            <span className={`w-48 shrink-0 truncate text-gc-lead font-semibold ${r.isRight ? 'text-gc-win' : 'text-gc-ink'}`}>{r.isRight ? '✓ ' : ''}{r.label}</span>
                            <span className="flex-1 h-4 rounded-full bg-gc-line/[0.08] overflow-hidden" aria-hidden="true">
                              <span className={`block h-full rounded-full ${r.isRight ? 'bg-gc-win/70' : 'bg-gc-quiet/50'}`} style={{ width: `${(r.count / top) * 100}%` }} />
                            </span>
                            <span className="w-16 text-right tabular-nums text-gc-lead font-bold">{r.count}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}

                {/* Payouts */}
                <div className="flex flex-wrap items-end justify-between gap-4 mt-10 mb-4 animate-gc-slide-up [animation-delay:1.25s]">
                  <div>
                    <h2 className="text-gc-display font-extrabold text-gc-ink">Hand {currentRound} payouts</h2>
                    <p className="text-gc-body text-gc-quiet mt-1">
                      {gameMode === 'rounds'
                        ? `Hand ${currentRound} of ${totalRounds}.`
                        : gameMode === 'targetAmount'
                          ? `The first player to reach $${numTargetAmount.toLocaleString()} wins.`
                          : 'The last player with money wins.'}
                    </p>
                  </div>
                  <ActionButton onClick={handleSaveGameClick} playSound={playSound} variant="ghost" className="h-10 px-4 text-gc-small font-semibold" title="Save the table so you can carry on later">
                    <span className="inline-flex items-center gap-2"><Save className="w-4 h-4 shrink-0" aria-hidden="true" />Save</span>
                  </ActionButton>
                </div>

                <div className="gc-panel rounded-gc-lg overflow-hidden animate-gc-slide-up [animation-delay:1.3s]">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="text-gc-small font-bold text-gc-quiet">
                        <tr>
                            <th className="py-3 pl-5 sm:pl-6 pr-2 w-16 font-bold">Rank</th>
                            <th className="py-3 px-3 font-bold">Player</th>
                            <th className="py-3 px-3 font-bold">Pick</th>
                            <th className="py-3 px-3 text-right font-bold">Change</th>
                            <th className="py-3 px-3 text-right font-bold">Balance</th>
                            {showMoves && <th className="py-3 pl-3 pr-5 sm:pr-6 text-right w-20 font-bold">Move</th>}
                        </tr>
                        </thead>
                        <tbody className="text-gc-ink">
                        {payoutRows.map(({ result, rank, move }, index) => {
                            const player = players.find(p => p.name === result.name);
                            const pickText = result.playerAnswerDisplay && result.playerAnswerDisplay !== result.outcomeText
                              ? result.playerAnswerDisplay
                              : '';
                            return (
                            <tr key={result.name} className="border-t border-gc-line/[0.1] animate-gc-slide-up" style={{ animationDelay: `${1400 + Math.min(index, 12) * 80}ms` }}>
                              <td className="py-3.5 pl-5 sm:pl-6 pr-2">
                                <span className={`w-9 h-9 rounded-full grid place-items-center font-extrabold text-gc-small tabular-nums ${rankBadge(rank)}`}>
                                  {rank}
                                </span>
                              </td>
                              <td className="py-3.5 px-3">
                                <div className="flex items-center gap-3">
                                  {player ? (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenAvatarModal(player.id)}
                                      className="w-11 h-11 rounded-full border-2 border-gc-turn/70 p-0.5 bg-gc-line/[0.08] grid place-items-center leading-none hover:scale-110 transition-transform cursor-pointer shrink-0"
                                      title={`Change ${player.name}'s avatar`}
                                    >
                                      <PlayerAvatar value={player.avatar} size="md" className="w-full h-full" />
                                    </button>
                                  ) : (
                                    <span className="text-2xl">{'👤'}</span>
                                  )}
                                  <span className="text-gc-lead font-bold">
                                    {result.name}
                                  </span>
                                </div>
                              </td>
                              <td className="py-3.5 px-3">
                                  <div className="flex flex-wrap items-center gap-2 text-gc-body font-semibold">
                                    <span>{pickText || result.outcomeText}</span>
                                    {pickText && result.bet > 0 && (
                                      <span className="text-gc-quiet font-normal tabular-nums">· ${result.bet.toLocaleString()} bet</span>
                                    )}
                                    {result.marksAwarded !== undefined && (
                                      <span className="px-2 py-0.5 rounded-full text-gc-cap font-bold tabular-nums bg-gc-line/[0.08] text-gc-quiet">
                                        {result.marksAwarded}/2 marks
                                      </span>
                                    )}
                                  </div>
                                  {pickText && (
                                    <div className="text-gc-small text-gc-quiet mt-0.5">
                                      {result.outcomeText}
                                    </div>
                                  )}
                                  {result.correctionFeedback && (
                                    <div className="text-gc-small text-gc-quiet mt-1 italic max-w-sm">
                                      {result.correctionFeedback}
                                    </div>
                                  )}
                              </td>
                              <td className={`py-3.5 px-3 text-right tabular-nums font-extrabold text-gc-lead whitespace-nowrap ${result.amountChanged > 0 ? 'text-gc-win animate-gc-glow' : result.amountChanged < 0 ? 'text-gc-loss' : 'text-gc-quiet'}`}>
                                  {result.amountChanged > 0 ? `+$${result.amountChanged.toLocaleString()}` : result.amountChanged < 0 ? `-$${Math.abs(result.amountChanged).toLocaleString()}` : '$0'}
                              </td>
                              <td className="py-3.5 px-3 text-right tabular-nums font-extrabold text-gc-lead text-gc-money whitespace-nowrap">
                                  $<CountUp from={result.newTotal - result.amountChanged} to={result.newTotal} delayMs={1500 + Math.min(index, 12) * 80} />
                              </td>
                              {showMoves && (
                                <td className={`py-3.5 pl-3 pr-5 sm:pr-6 text-right text-gc-small font-bold whitespace-nowrap ${move > 0 ? 'text-gc-win' : move < 0 ? 'text-gc-loss' : 'text-gc-quiet'}`}>
                                  {move > 0 ? (
                                    <span className="inline-flex items-center gap-0.5"><ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />{move}<span className="sr-only"> places up</span></span>
                                  ) : move < 0 ? (
                                    <span className="inline-flex items-center gap-0.5"><ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />{-move}<span className="sr-only"> places down</span></span>
                                  ) : (
                                    <span aria-label="No change">–</span>
                                  )}
                                </td>
                              )}
                            </tr>
                        )})}
                        </tbody>
                    </table>
                  </div>
                </div>

                {!isGameOver && (
                  <div className="mt-6 px-4 py-3.5 rounded-gc bg-gc-line/[0.05] border border-gc-line/[0.12] flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="text-gc-small font-bold text-gc-ink">Next hand</span>
                      <span className="text-gc-small text-gc-quiet"> · click a setting to change it before you deal</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenSettingsModal('topic')}
                        className={chipButton}
                        title="Change the topic for the next hand"
                      >
                        {nextRoundSettings?.topic || settings.topic}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenSettingsModal('level')}
                        className={chipButton}
                        title="Change the level for the next hand"
                      >
                        {nextRoundSettings?.level || settings.level}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenSettingsModal('theme')}
                        className={chipButton}
                        title="Change the theme for the next hand"
                      >
                        {nextRoundSettings?.theme || settings.theme}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenSettingsModal('format')}
                        className={chipButton}
                        title="Change the kind of question for the next hand"
                      >
                        {nextFormatObj.shortLabel}
                      </button>
                    </div>
                  </div>
                )}
                
                <div className="mt-8 flex flex-wrap justify-between items-center gap-4 pb-10 relative w-full">
                  <div className="flex-1 flex justify-start gap-2 flex-wrap">
                    {isUndoRevealOpen && (
                      <ActionButton
                        data-hotkey="undo-reveal"
                        onClick={handleUndoReveal}
                        variant="secondary"
                        className="h-10 px-4 text-gc-small font-semibold"
                        title="Teacher only: go back to the hand as it was before the reveal"
                      >
                        <span className="inline-flex items-center gap-2"><RotateCcw className="w-4 h-4 shrink-0" aria-hidden="true" />Undo reveal ({undoRevealSecondsLeft(revealSnapshot, undoClock)} s)</span>
                      </ActionButton>
                    )}
                    {isRevealSnapshotCurrent && (
                      <ActionButton
                        onClick={() => { playSound('click'); setShowRulingModal(true); }}
                        variant="ghost"
                        className="h-10 px-4 text-gc-small font-semibold"
                        title="Teacher only: void this hand or accept another answer"
                      >
                        Correct the ruling
                      </ActionButton>
                    )}
                    {roundHistory.length > 0 && (
                      <ActionButton
                        onClick={() => { playSound('click'); setShowReportCardModal(true); }}
                        variant="ghost"
                        className="h-10 px-4 text-gc-small font-semibold"
                        title="See the grammar report card for every hand so far"
                      >
                        Report card ({roundHistory.length})
                      </ActionButton>
                    )}
                    <ActionButton
                      onClick={() => handleOpenCloudModal('reports')}
                      variant="ghost"
                      className="h-10 px-4 text-gc-small font-semibold"
                      title="Save or load the session report and table in the cloud"
                    >
                      <span className="inline-flex items-center gap-2"><CloudIcon className="w-4 h-4 shrink-0" aria-hidden="true" />Save to cloud</span>
                    </ActionButton>
                  </div>
                  <ActionButton data-hotkey="primary" onClick={handleNextRound} playSound={playSound} variant="primary" className="min-h-[60px] text-gc-lead py-3 px-10">
                      <span className="inline-flex items-center gap-2.5">
                        {isGameOver ? 'See the final results' : 'Deal the next hand'}
                        <ArrowRight className="w-5 h-5 shrink-0" aria-hidden="true" />
                      </span>
                  </ActionButton>
                  <div className="flex-1 flex justify-end">
                    {!isGameOver && (
                      <ActionButton 
                        onClick={() => setConfirmAction({
                          title: 'End the game now?',
                          message: 'The game stops here and the final results are shown. You cannot go back to this hand.',
                          confirmLabel: 'End the game',
                          onConfirm: handleEndGameEarly,
                        })}
                        variant="ghost"
                        className="h-10 px-4 text-gc-small font-semibold text-gc-loss"
                        title="End the game now and go to the final results"
                      >
                        End the game early
                      </ActionButton>
                    )}
                  </div>
                </div>
            </div>
            ); 
        }
        case 'GAME_OVER': {
          const ranked = [...players].sort((a, b) => b.money - a.money);
          if (winner) {
            const wi = ranked.findIndex(p => p.id === winner.id);
            if (wi > 0) ranked.unshift(...ranked.splice(wi, 1));
          }
          const podium = ranked.slice(0, 3);
          const everyoneBust = !winner && players.every(p => p.money <= 0);
          // Podium order on screen: 2nd, 1st, 3rd
          const podiumOrder = [podium[1], podium[0], podium[2]];
          const podiumStyle = [
            { place: 2, block: 'h-24 sm:h-28', avatar: 'w-16 h-16 sm:w-20 sm:h-20 text-[34px] sm:text-[42px]', delay: '0.25s' },
            { place: 1, block: 'h-36 sm:h-44', avatar: 'w-20 h-20 sm:w-28 sm:h-28 text-[44px] sm:text-[60px]', delay: '0s' },
            { place: 3, block: 'h-16 sm:h-20', avatar: 'w-14 h-14 sm:w-16 sm:h-16 text-[30px] sm:text-[34px]', delay: '0.45s' },
          ];
          // Package V9: the ceremony reveals each part in turn; everything stays in the page
          // (only faded), so screen readers and the buttons below never wait for it.
          const stage = ceremonyStage;
          const ceremonyOn = stage < CEREMONY_DONE;
          const winnerShown = stage >= 3;
          const reveal = (shown: boolean) => `transition-[opacity,transform] duration-gc-slow ease-gc-out ${shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`;
          const classLine = classResultLine(buildReport(roundHistory, players));
          const saveMoment = () => {
            playSound('click');
            const places = podiumOrder
              .map((p, idx) => (p ? { place: podiumStyle[idx].place, name: p.name, money: p.money } : null))
              .filter((x): x is { place: number; name: string; money: number } => x !== null);
            const url = drawMoment(places, winner ? `${winner.name} wins!` : 'Table closed', classLine);
            if (!url) return;
            const a = document.createElement('a');
            a.href = url;
            a.download = `grammar-casino-${new Date().toISOString().slice(0, 10)}.png`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            logEvent('info', 'Saved the podium picture');
          };
          return (
          <div className="relative w-full max-w-5xl px-4 pt-6 sm:pt-2 pb-12 text-center animate-gc-fade">
            {/* Package V10: no HTML confetti here any more; the 3D coin shower and sparks celebrate
                the winner (nothing on table Off, Calm mode or reduced motion). */}
            <p className="text-gc-small font-semibold text-gc-quiet">Final results</p>
            <h1 className="font-logo text-gc-gold text-[38px] sm:text-[52px] leading-tight font-semibold tracking-[0.04em]">
              {ceremonyOn && !winnerShown ? 'The vault opens…' : 'Table closed'}
            </h1>
            {ceremonyOn && (
              <button
                type="button"
                onClick={() => { playSound('click'); skipCeremony(); }}
                data-testid="ceremony-skip"
                className="absolute right-4 top-4 h-11 px-4 rounded-full border border-gc-line/20 bg-gc-card/80 text-gc-small font-semibold text-gc-quiet hover:text-gc-ink cursor-pointer"
              >
                Skip
              </button>
            )}
            <p className={`mt-2 text-gc-lead text-gc-quiet text-balance ${reveal(winnerShown)}`}>
              {winner ? (
                <>
                  <b className="text-gc-ink">{winner.name}</b> wins with <b className="text-gc-money tabular-nums">${winner.money.toLocaleString()}</b>
                  {gameMode === 'targetAmount' && <> and passed the ${Number(targetAmount).toLocaleString()} target</>}
                  .
                </>
              ) : everyoneBust ? (
                'Every player ran out of money. The house wins.'
              ) : (
                "It's a tie at the top, so there is no single winner."
              )}
            </p>

            {podium.length > 0 && !everyoneBust && (
              <ol className="mt-10 flex items-end justify-center gap-2.5 sm:gap-5" aria-label="Top three players">
                {podiumOrder.map((p, idx) => {
                  if (!p) return <li key={`empty-${idx}`} className="w-24 sm:w-40" aria-hidden="true" />;
                  const st = podiumStyle[idx];
                  const isFirst = st.place === 1;
                  return (
                    <li
                      key={p.id}
                      className={`w-24 sm:w-40 flex flex-col items-center ${reveal(placeShown(st.place, stage))}`}
                      data-shown={placeShown(st.place, stage) ? 'true' : 'false'}
                    >
                      <span className="sr-only">Place {st.place}: </span>
                      {isFirst && winner && <span className="text-[30px] sm:text-[38px] leading-none mb-1" aria-hidden="true">👑</span>}
                      <span className={`${st.avatar} rounded-full bg-gc-card p-1 grid place-items-center leading-none ring-4 ${isFirst ? 'ring-gc-gold' : 'ring-gc-line/20'} shadow-gc-1`} aria-hidden="true">
                        <PlayerAvatar value={p.avatar} size={isFirst ? '2xl' : 'xl'} className="w-full h-full" animated={isFirst} />
                      </span>
                      <span className={`mt-2 max-w-full truncate font-bold text-gc-ink ${isFirst ? 'text-gc-title' : 'text-gc-body sm:text-gc-lead'}`}>{p.name}</span>
                      <span className="text-gc-small sm:text-gc-body font-bold text-gc-money tabular-nums">${p.money.toLocaleString()}</span>
                      <span
                        className={`mt-2 w-full ${st.block} rounded-t-gc grid place-items-start justify-center pt-3 border border-b-0 ${
                          isFirst ? 'bg-gc-gold/25 border-gc-gold/50' : 'bg-gc-line/[0.07] border-gc-line/[0.14]'
                        }`}
                      >
                        <span className={`font-extrabold tabular-nums ${isFirst ? 'text-gc-money text-[36px] sm:text-[44px]' : 'text-gc-quiet text-[28px] sm:text-[32px]'} leading-none`}>
                          {st.place}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
            {podium.length > 0 && !everyoneBust && <div className="h-px bg-gc-line/[0.14] max-w-xl mx-auto" aria-hidden="true" />}

            {awardsOn && (() => {
              const awards = computeAwards(roundHistory, startingCash);
              if (awards.length === 0) return null;
              return (
                <ul className={`mt-6 mx-auto max-w-3xl p-0 list-none grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 ${reveal(stage >= CEREMONY_DONE)}`} data-testid="awards" aria-label="Awards">
                  {awards.map(a => (
                    <li key={a.id} className="gc-surface rounded-gc-lg px-3 py-4 text-center">
                      <div className="text-[34px] leading-none" aria-hidden="true">{a.icon}</div>
                      <div className="mt-2 text-gc-small font-bold text-gc-quiet">{a.title}</div>
                      <div className="text-gc-lead font-extrabold text-gc-ink break-words">{a.name}</div>
                      <div className="text-gc-cap text-gc-quiet">{a.detail}</div>
                    </li>
                  ))}
                </ul>
              );
            })()}

            {classLine && (
              <p className={`mt-6 mx-auto max-w-2xl text-gc-lead font-semibold text-gc-ink text-balance ${reveal(stage >= CEREMONY_DONE)}`} data-testid="class-result">
                {classLine}
              </p>
            )}

            {everyoneBust && (
              <div className="mt-8 mx-auto max-w-md gc-surface rounded-gc-lg p-8">
                <div className="text-[56px] leading-none mb-3" aria-hidden="true">🏛️</div>
                <h2 className="text-gc-title font-bold text-gc-ink">The house wins</h2>
                <p className="mt-1 text-gc-body text-gc-quiet">Nobody has any money left.</p>
              </div>
            )}

            <div className="mt-8 flex flex-wrap justify-center items-center gap-3">
              <ActionButton onClick={handlePlayAgainSameClass} variant="primary" className="min-h-[60px] px-10 text-gc-lead" title="Same players and settings; the room stays open">
                <span className="inline-flex items-center gap-2.5"><RotateCcw className="w-5 h-5 shrink-0" aria-hidden="true" />Play again</span>
              </ActionButton>
              <ActionButton onClick={handleRestartGame} playSound={playSound} variant="ghost" className="h-12 px-5 text-gc-body font-semibold">
                New class
              </ActionButton>
              <ActionButton onClick={() => handleOpenCloudModal('reports')} playSound={playSound} variant="ghost" className="h-12 px-5 text-gc-body font-semibold">
                <span className="inline-flex items-center gap-2"><CloudIcon className="w-4 h-4 shrink-0" aria-hidden="true" />Save to the cloud</span>
              </ActionButton>
              {podium.length > 0 && !everyoneBust && (
                <ActionButton onClick={saveMoment} variant="ghost" className="h-12 px-5 text-gc-body font-semibold" title="Download a picture of the podium (nicknames only) for the class group">
                  Save this moment
                </ActionButton>
              )}
            </div>

            {/* The session report */}
            <div className="w-full mt-10 text-left">
              <GrammarReportCard
                history={roundHistory}
                players={players}
                winner={winner}
                playSound={playSound}
                onRestartGame={handleRestartGame}
                settings={settings}
                gameMode={gameMode}
                totalRounds={totalRounds}
                targetAmount={targetAmount}
              />
            </div>
          </div>
          );
        }
        default: return <div className="p-20 text-center text-gold font-sans text-2xl animate-pulse">Initializing Table...</div>;
    }
  };

  if (isStudentControllerMode) {
    const initialUrlRoom = typeof window !== 'undefined'
      ? (new URLSearchParams(window.location.search).get('room') || '')
      : '';
    return (
      <MotionConfig reducedMotion="user">
      <StudentControllerView
        initialRoomCode={initialUrlRoom}
        playSound={playSound}
        isDarkMode={isDarkMode}
        onToggleTheme={toggleTheme}
          onExitStudentMode={() => {
          if (typeof window !== 'undefined' && window.location.search.includes('room=')) {
            const url = new URL(window.location.href);
            url.searchParams.delete('room');
            window.history.replaceState({}, '', url.toString());
          }
          setIsStudentControllerMode(false);
        }}
      />
      </MotionConfig>
    );
  }

  return (
    <MotionConfig reducedMotion={isCalmMode ? 'always' : 'user'}>
      <div className="game-container felt-noise min-h-screen text-slate-800 dark:text-slate-100 flex flex-col justify-start items-center p-2 md:p-4 selection:bg-amber-500 selection:text-black font-sans transition-colors duration-gc-base relative">
        <ThemeAmbience theme={settings.theme} calmMode={isCalmMode} />
        {isTableView && (
          <React.Suspense fallback={null}>
            <TableBackdrop quality={qualityTier} redrawKey={step} onUnavailable={handleTableUnavailable} look={stageLook} />
          </React.Suspense>
        )}
        <React.Suspense fallback={null}>
        <Tabletop3DOverlay
          active={step === 'IN_GAME' || step === 'RESULTS' || step === 'GAME_OVER'}
          calmMode={isCalmMode}
          quality={qualityTier}
          onQualityChange={handleQualityChange}
          projectorMode={isProjectorMode}
          seatStates={seat3DStates}
          tossEvent={chipTossEvent}
          sweepEvent={potSweepEvent}
          boomerangEvent={boomerangArcEvent}
          shoeEvent={shoeDealEvent}
          flightEvent={powerUpFlightEvent}
          jackpotEvent={jackpotEvent}
          potTotal={step === 'IN_GAME' || step === 'RESULTS' ? potNow : 0}
          behindInterface={isTableView}
          sparkPalette={stageLook.sparks}
          onChipImpactSound={(denom) => playSound('chipClink', denom)}
        />
        </React.Suspense>
        <LiveAnnouncer
          message={phaseAnnouncement({
            step,
            round: currentRound,
            totalRounds: gameMode === 'rounds' ? Number(totalRounds) : null,
            paused: isPaused && step === 'IN_GAME',
            winnerName: winner?.name ?? null,
          })}
        />
        {specialHandCard && (
          <div
            className="fixed inset-0 z-[60] pointer-events-none grid place-items-center p-4"
            role="status"
            data-testid="special-hand-card"
          >
            <div className="gc-panel gc-special-card rounded-gc-lg px-8 py-6 text-center shadow-gc-2 border border-gc-gold/50">
              <div className="text-[44px] leading-none" aria-hidden="true">{SPECIAL_HAND_INFO[specialHandCard.hand].icon}</div>
              <p className="mt-2 font-logo text-[40px] leading-tight font-bold text-gc-gold">{SPECIAL_HAND_INFO[specialHandCard.hand].title}</p>
              <p className="mt-1 text-gc-lead font-semibold text-gc-ink">{SPECIAL_HAND_INFO[specialHandCard.hand].rule}</p>
            </div>
          </div>
        )}
        {showCoach && (
          <FirstRunCoach
            onClose={closeCoach}
            onDemo={mpRoomCode ? null : () => {
              closeCoach();
              startDemoRoom();
            }}
          />
        )}
        {isDemoRoom && (
          <div
            data-testid="demo-banner"
            className={`fixed ${step === 'IN_GAME' ? 'bottom-4 sm:bottom-auto sm:top-20' : 'bottom-4'} left-4 z-40 max-w-[calc(100vw-2rem)] h-11 pl-3 pr-1.5 inline-flex items-center gap-2 rounded-full gc-panel shadow-gc-2 text-gc-small font-semibold text-gc-ink`}
          >
            <Bot className="w-4 h-4 text-gc-gold shrink-0" aria-hidden="true" />
            <span className="truncate">Demo with {DEMO_BOT_COUNT} bots. Nothing is saved.</span>
            <button
              type="button"
              onClick={endDemoRoom}
              className="h-8 px-3 rounded-full bg-gc-line/[0.08] hover:bg-gc-line/[0.16] font-bold cursor-pointer"
            >
              End demo
            </button>
          </div>
        )}
        <BroadcastCutIn cutIn={activeCutIn} onComplete={() => setActiveCutIn(null)} calmMode={isCalmMode} />
        {step !== 'PLAYER_SETUP' && ( 
          <div className="fixed top-4 left-4 z-50">
             <button
                type="button"
                onClick={() => {
                  playSound('click');
                  setConfirmAction({
                    title: 'Leave this game?',
                    message: step === 'GAME_OVER'
                      ? 'You go back to the lobby and these final results close.'
                      : 'You go back to the lobby. This game ends, its scores are cleared and any open room is closed.',
                    confirmLabel: 'Leave the game',
                    onConfirm: handleRestartGame,
                  });
                }}
                className="h-11 px-3.5 inline-flex items-center gap-2 rounded-full bg-gc-card/80 border border-gc-line/[0.14] hover:border-gc-line/30 text-gc-ink shadow-gc-1 backdrop-blur-md transition-colors cursor-pointer text-gc-small font-semibold"
                title="Leave the table and go back to the lobby"
             >
                <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">Lobby</span>
             </button>
          </div>
        )}
        
        {/* While the sentence banner is stuck, a solid band sits behind the top buttons so the
            table scrolling underneath never shows between them and the banner. */}
        {step === 'IN_GAME' && isSentenceHeaderStuck && (
          <div aria-hidden="true" className="top-band fixed inset-x-0 top-0 z-[29]" style={{ height: STICKY_TOP_PX }} />
        )}

        {/* Top Controls: Multiplayer Room Badge, Teacher AI / Offline Mode Gate, Theme Toggle & Audio */}
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 sm:gap-2.5">
          {mpRoomCode && (
            <button
              type="button"
              onClick={() => {
                playSound('click');
                setShowMpLobbyModal(true);
              }}
              className="h-11 px-3.5 inline-flex items-center gap-2 rounded-full bg-gc-card/80 border border-gc-line/[0.14] hover:border-gc-line/30 text-gc-ink shadow-gc-1 backdrop-blur-md transition-colors cursor-pointer text-gc-small font-semibold tabular-nums"
              title="Open the room: QR code and who is connected"
            >
              <span className={`w-2 h-2 rounded-full ${mpHostConnected ? 'bg-gc-win animate-pulse' : 'bg-gc-gold'}`} />
              <Smartphone className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span><span className="sr-only sm:not-sr-only">Room </span>{mpRoomCode}</span>
              <span className="px-1.5 py-0.5 rounded-full bg-gc-win/15 text-gc-win text-gc-cap font-bold">
                {Object.values(mpSeats).filter((s: MultiplayerSeat) => s.connected).length}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handleOpenCloudModal(step === 'PLAYER_SETUP' ? 'rosters' : 'reports')}
            className="h-11 px-3.5 inline-flex items-center gap-2 rounded-full bg-gc-card/80 border border-gc-line/[0.14] hover:border-gc-line/30 text-gc-ink shadow-gc-1 backdrop-blur-md transition-colors cursor-pointer text-gc-small font-semibold"
            title="Cloud: class rosters, session reports and your own sentence bank"
          >
            <CloudIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">Cloud</span>
          </button>

          <button
            type="button"
            onClick={() => {
              playSound('click');
              setIsCalmMode(prev => !prev);
            }}
            className={`w-11 h-11 inline-flex items-center justify-center rounded-gc-sm bg-gc-card/80 border border-gc-line/[0.14] hover:border-gc-line/30 text-gc-ink shadow-gc-1 backdrop-blur-md transition-colors cursor-pointer ${
              isCalmMode ? '!bg-gc-gold !text-gc-on-gold !border-transparent' : ''
            }`}
            aria-pressed={isCalmMode}
            aria-label="Calm mode: turn the motion off"
            title={isCalmMode ? 'Calm mode is on: motion is off for the whole class. Click to turn motion back on.' : 'Calm mode: turn the motion off for the whole class'}
          >
            <Wind className="w-5 h-5" aria-hidden="true" />
          </button>

          <button 
            onClick={toggleTheme}
            className="w-11 h-11 inline-flex items-center justify-center rounded-gc-sm bg-gc-card/80 border border-gc-line/[0.14] hover:border-gc-line/30 text-gc-ink shadow-gc-1 backdrop-blur-md transition-colors cursor-pointer" 
            aria-label={isDarkMode ? "Switch to the light theme" : "Switch to the dark theme"}
            title={isDarkMode ? "Light theme" : "Dark theme"}
          > 
            {isDarkMode ? <Sun className="w-5 h-5" aria-hidden="true" /> : <Moon className="w-5 h-5" aria-hidden="true" />}
          </button>

          <button
            type="button"
            data-hotkey="fullscreen"
            onClick={handleToggleFullscreen}
            className="!hidden sm:!inline-flex w-11 h-11 inline-flex items-center justify-center rounded-gc-sm bg-gc-card/80 border border-gc-line/[0.14] hover:border-gc-line/30 text-gc-ink shadow-gc-1 backdrop-blur-md transition-colors cursor-pointer"
            aria-pressed={isFullscreen}
            aria-label={isFullscreen ? 'Leave full screen' : 'Full screen'}
            title={isFullscreen ? 'Leave full screen (F)' : 'Full screen (F)'}
          >
            {isFullscreen ? <Minimize className="w-5 h-5" aria-hidden="true" /> : <Maximize className="w-5 h-5" aria-hidden="true" />}
          </button>

          <button
            type="button"
            onClick={() => { playSound('click'); setShowHotkeyHelp(true); }}
            className="!hidden sm:!inline-flex w-11 h-11 inline-flex items-center justify-center rounded-gc-sm bg-gc-card/80 border border-gc-line/[0.14] hover:border-gc-line/30 text-gc-ink shadow-gc-1 backdrop-blur-md transition-colors cursor-pointer"
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
          >
            <Keyboard className="w-5 h-5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => {
              playSound('click');
              setIsProjectorMode(prev => !prev);
            }}
            className={`!hidden sm:!inline-flex w-11 h-11 inline-flex items-center justify-center rounded-gc-sm bg-gc-card/80 border border-gc-line/[0.14] hover:border-gc-line/30 text-gc-ink shadow-gc-1 backdrop-blur-md transition-colors cursor-pointer ${
              isProjectorMode ? '!bg-gc-gold !text-gc-on-gold !border-transparent' : ''
            }`}
            aria-pressed={isProjectorMode}
            aria-label="Projector mode: larger, solid text for the back of the room"
            title={isProjectorMode ? 'Projector mode is on: click for normal text' : 'Projector mode: larger, solid text for the back of the room'}
          >
            <Projector className="w-5 h-5" aria-hidden="true" />
          </button>

          {audioReady && (
            <div className="group relative inline-flex items-center">
              <button
                data-hotkey="mute"
                onClick={() => {
                  const newMutedState = !isMuted;
                  setIsMuted(newMutedState);
                  if (newMutedState && 'speechSynthesis' in window) {
                    window.speechSynthesis.cancel();
                  }
                  if (!newMutedState) soundEngine.play('click');
                }}
                className="w-11 h-11 inline-flex items-center justify-center rounded-gc-sm bg-gc-card/80 border border-gc-line/[0.14] hover:border-gc-line/30 text-gc-ink shadow-gc-1 backdrop-blur-md transition-colors cursor-pointer"
                aria-label={isMuted ? "Unmute" : "Mute"}
                title={isMuted ? "Sound on" : "Sound off"}
              >
                {isMuted ? <VolumeX className="w-5 h-5" aria-hidden="true" /> : <Volume2 className="w-5 h-5" aria-hidden="true" />}
              </button>
              {!isMuted && (
                <label className="absolute right-0 top-full mt-2 hidden group-hover:flex group-focus-within:flex items-center gap-2 px-3 py-2 rounded-gc-sm bg-gc-card/95 border border-gc-line/[0.14] shadow-gc-1 backdrop-blur-md text-gc-cap font-semibold text-gc-quiet whitespace-nowrap z-50">
                  Effects
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={sfxVolume}
                    onChange={(e) => handleSfxVolumeChange(parseFloat(e.target.value))}
                    onPointerUp={() => soundEngine.play('chipClink', 100)}
                    onKeyUp={() => soundEngine.play('chipClink', 100)}
                    className="w-28 accent-amber-500 cursor-pointer"
                    aria-label="Sound effects volume"
                  />
                  <span className="ml-2">Music</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={musicVolume}
                    onChange={(e) => setMusicVolume(Math.min(1, Math.max(0, parseFloat(e.target.value) || 0)))}
                    className="w-24 accent-amber-500 cursor-pointer"
                    aria-label="Music volume"
                    title={isCalmMode ? 'Music is off in Calm mode' : 'Music volume (0 turns it off)'}
                  />
                </label>
              )}
            </div>
          )}

          <select
            value={orpheusVoice}
            onChange={(e) => {
              playSound('click');
              handleOrpheusVoiceChange(e.target.value as GeminiService.OrpheusVoiceId);
            }}
            aria-label="Reading voice"
            title="The voice that reads sentences and explanations aloud (one setting for the whole game)"
            className="h-11 px-2.5 rounded-gc-sm bg-gc-card/80 border border-gc-line/[0.14] hover:border-gc-line/30 text-gc-ink text-gc-cap font-semibold shadow-gc-1 backdrop-blur-md transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-turn"
          >
            {GeminiService.ORPHEUS_VOICE_OPTIONS.map((v) => (
              <option key={v.id} value={v.id} className="bg-gc-card text-gc-ink">
                🎙️ {v.label}
              </option>
            ))}
          </select>
        </div>

        <div className="main-content-wrapper w-full flex flex-col justify-center items-center py-12 md:py-16"> 
          {renderStepContent()} 
        </div>
      </div>
      <input 
        type="file" 
        ref={fileInputRef} 
        style={{ display: 'none' }} 
        accept=".json,application/json" 
        onChange={handleFileChange} 
      />
      {error && (<Modal title={error.title} onClose={() => setError(null)} playSound={playSound}><p className="text-gc-body text-gc-ink leading-relaxed">{error.message}</p></Modal>)}
      {historyPlayer && ( 
        <Modal title={`${historyPlayer.name}'s hands`} onClose={() => setHistoryPlayer(null)} playSound={playSound}> 
          <div className="space-y-4 text-left max-h-[60vh] overflow-y-auto pr-2 modal-content-scroll"> 
            {historyPlayer.history.length > 0 ? ( 
              historyPlayer.history.map((item, index) => ( 
                <div key={index} className="p-4 rounded-gc bg-gc-line/[0.04] border border-gc-line/[0.12]"> 
                  <div className="flex justify-between gap-3 mb-2">
                    <span className="text-gc-small font-bold text-gc-quiet">Hand {item.round}</span> 
                    <span className={`tabular-nums font-bold ${item.amount >= 0 ? 'text-gc-win' : 'text-gc-loss'}`}> 
                        {item.amount >= 0 ? '+' : '\u2212'}${Math.abs(item.amount).toLocaleString()}
                    </span> 
                  </div>
                  <p className="text-gc-body text-gc-ink font-sentence italic mb-3">&ldquo;{item.sentence}&rdquo;</p> 
                  <div className="flex justify-between text-gc-small text-gc-quiet border-t border-gc-line/[0.1] pt-2 tabular-nums">
                    <span>Spent ${item.spent}</span>
                    <span className="text-gc-ink font-bold">Total ${item.endTotal}</span>
                  </div>
                </div> 
              )) 
            ) : ( <p className="text-center py-10 text-gc-quiet">No hands played yet.</p> )} 
          </div> 
        </Modal> 
      )}
      {showPowerUpModal && 
        <Modal 
            title={showPowerUpModal.title} 
            onClose={() => setShowPowerUpModal(null)} 
            playSound={playSound}
            hideCloseButton
        > 
            <div className="text-center py-4"> 
                <div className="text-7xl mb-6 filter drop-shadow-lg flex justify-center">
                  <PowerUpTooltip
                    icon={showPowerUpModal.icon || POWER_UPS[Object.keys(POWER_UPS).find(k => POWER_UPS[k as PowerUpKey].name === showPowerUpModal.title) as PowerUpKey]?.icon}
                    name={showPowerUpModal.title}
                    description={showPowerUpModal.message}
                    placement="bottom"
                  >
                    <span className="cursor-help hover:scale-110 transition-transform inline-block">
                      {showPowerUpModal.icon || POWER_UPS[Object.keys(POWER_UPS).find(k => POWER_UPS[k as PowerUpKey].name === showPowerUpModal.title) as PowerUpKey]?.icon}
                    </span>
                  </PowerUpTooltip>
                </div> 
                <p className="text-gc-lead text-gc-ink font-medium leading-relaxed whitespace-pre-line">{showPowerUpModal.message}</p> 
            </div> 
        </Modal>
      }
      {resumeOffer && (
        <Modal title="Welcome back" onClose={() => setResumeOffer(null)} playSound={playSound} hideOkButton>
          <p className="text-gc-body text-gc-ink mb-5">An unfinished game is saved on this computer.</p>
          <div className="flex flex-col gap-3">
            <ActionButton onClick={() => setResumeOffer(null)} playSound={playSound} variant="primary" className="min-h-[52px] px-5 text-gc-body">
              {resumeOffer.label}
            </ActionButton>
            <ActionButton
              onClick={() => {
                archiveGame(Date.now());
                setResumeOffer(null);
                handleRestartGame();
              }}
              playSound={playSound}
              variant="secondary"
              className="min-h-[44px] px-5"
            >
              Start fresh
            </ActionButton>
          </div>
        </Modal>
      )}
      {showPastReports && (
        <Modal title="Past reports" onClose={() => setShowPastReports(false)} playSound={playSound}>
          <p className="text-gc-small text-gc-quiet mb-3">The last {finishedGames.length === 1 ? 'game' : `${finishedGames.length} games`} finished on this computer. Save a report to the cloud to keep it for good.</p>
          <ul className="space-y-2">
            {finishedGames.map(g => (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => { playSound('click'); setShowPastReports(false); setPastReport(g); }}
                  className="w-full min-h-[44px] text-left rounded-gc-sm border border-gc-line/[0.14] hover:border-gc-line/30 px-3 py-2 cursor-pointer text-gc-ink"
                >
                  <span className="block font-semibold">{new Date(g.finishedAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="block text-gc-small text-gc-quiet">
                    {g.players.length} players · {g.roundHistory.length} {g.roundHistory.length === 1 ? 'hand' : 'hands'}{g.winnerName ? ` · ${g.winnerName} won` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}
      {pastReport && (
        <Modal title="Report card" onClose={() => setPastReport(null)} playSound={playSound}>
          <div className="max-h-[78vh] overflow-y-auto pr-1 modal-content-scroll">
            <GrammarReportCard
              history={pastReport.roundHistory}
              players={pastReport.players.map(p => ({ ...p, history: [], winStreak: 0, effects: [] }))}
              winner={null}
              playSound={playSound}
              onRestartGame={() => setPastReport(null)}
              settings={pastReport.settings}
              gameMode={pastReport.gameMode as GameMode | undefined}
              totalRounds={pastReport.totalRounds}
              targetAmount={pastReport.targetAmount}
            />
          </div>
        </Modal>
      )}
      {showOwnDeck && (
        <OwnDeckModal
          initialText={ownDeck.text}
          initialName={ownDeck.name}
          playSound={playSound}
          onClose={() => setShowOwnDeck(false)}
          onUse={(text, name) => { setOwnDeck({ text, name: name.trim() || 'My deck' }); setShowOwnDeck(false); }}
        />
      )}
      {showDebugLog && <DebugLogModal onClose={() => setShowDebugLog(false)} playSound={playSound} />}
      {showHotkeyHelp && (
        <Modal title="Keyboard shortcuts" onClose={() => setShowHotkeyHelp(false)} playSound={playSound}>
          <p className="text-gc-body text-gc-ink mb-4">A presenter clicker works too: its buttons send Page Down and Page Up.</p>
          <p className="text-gc-small text-gc-quiet -mt-2 mb-4">Version {APP_VERSION}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-gc-body text-gc-ink">
            {HOTKEY_HELP.map(h => (
              <React.Fragment key={h.keys}>
                <dt className="font-bold whitespace-nowrap">{h.keys}</dt>
                <dd>{h.action}</dd>
              </React.Fragment>
            ))}
          </dl>
        </Modal>
      )}
      {isPaused && step === 'IN_GAME' && (
        <div ref={pauseDialogRef} className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="gc-pause-title">
          <div className="w-full max-w-md rounded-gc bg-gc-card border border-gc-line/[0.14] shadow-gc-1 p-8 text-center space-y-5 text-gc-ink">
            <Pause className="w-12 h-12 mx-auto text-gc-gold" aria-hidden="true" />
            <h2 id="gc-pause-title" className="text-gc-h2 font-bold">Paused</h2>
            <p className="text-gc-body">Timers are stopped{mpRoomCode ? ' and phones are on hold' : ''}. Nothing is lost.</p>
            <ActionButton data-hotkey="pause" onClick={() => setIsPaused(false)} playSound={playSound} variant="primary" className="min-h-[52px] w-full text-gc-lead">
              <span className="inline-flex items-center gap-2"><Play className="w-5 h-5 shrink-0" aria-hidden="true" />Resume the hand</span>
            </ActionButton>
          </div>
        </div>
      )}
      {showRulingModal && revealSnapshot && (() => {
        const answers = listAnswersToAccept(revealSnapshot);
        const acceptable = canAcceptOtherAnswers(revealSnapshot.input);
        return (
          <Modal title="Correct the ruling" onClose={() => setShowRulingModal(false)} playSound={playSound} hideOkButton>
            <div className="space-y-5 text-gc-ink">
              <p className="text-gc-body">If this item was judged wrongly, fix it here. Bankrolls are worked out again from the moment before the reveal.</p>
              {acceptable && (
                <section aria-labelledby="gc-accept-heading" className="space-y-2">
                  <h3 id="gc-accept-heading" className="text-gc-body font-bold">Accept this answer too</h3>
                  {answers.length === 0 ? (
                    <p className="text-gc-small text-gc-quiet">No other answer was given this hand.</p>
                  ) : (
                    <ul className="space-y-2">
                      {answers.map(a => (
                        <li key={a.answer} className="flex items-center justify-between gap-3 rounded-gc-sm border border-gc-line/[0.14] px-3 py-2">
                          <span className="min-w-0 break-words">
                            <span className="font-semibold">“{a.answer}”</span>
                            <span className="text-gc-small text-gc-quiet"> · {a.players === 1 ? '1 player' : `${a.players} players`}</span>
                          </span>
                          <ActionButton onClick={() => handleAcceptAnswer(a.answer)} playSound={playSound} variant="secondary" className="min-h-[44px] px-4 shrink-0">
                            Accept
                          </ActionButton>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
              <section aria-labelledby="gc-void-heading" className="space-y-2">
                <h3 id="gc-void-heading" className="text-gc-body font-bold">Void the hand</h3>
                <p className="text-gc-small text-gc-quiet">Every stake is returned. Money spent on hints and power-ups stays spent.</p>
                <ActionButton onClick={handleVoidHand} playSound={playSound} variant="danger" className="min-h-[44px] px-5">
                  Void the hand
                </ActionButton>
              </section>
            </div>
          </Modal>
        );
      })()}
      {confirmAction && (
        <Modal title={confirmAction.title} onClose={() => setConfirmAction(null)} playSound={playSound} hideOkButton>
          <p className="text-gc-body text-gc-ink mb-5">{confirmAction.message}</p>
          <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
            <ActionButton onClick={() => setConfirmAction(null)} variant="secondary" className="min-h-[44px] px-5">
              Stay
            </ActionButton>
            <ActionButton
              onClick={() => {
                const action = confirmAction.onConfirm;
                setConfirmAction(null);
                action();
              }}
              variant="danger"
              className="min-h-[44px] px-5"
            >
              {confirmAction.confirmLabel}
            </ActionButton>
          </div>
        </Modal>
      )}
      {showTargetModal && (() => {
        const isSwap = showTargetModal.powerUp === 'SWAP';
        const buyerPlayer = players.find(p => p.id === showTargetModal.playerId);
        const powerUpInfo = POWER_UPS[showTargetModal.powerUp];

        return (
          <Modal 
              title={`Activate: ${powerUpInfo.name}`} 
              onClose={() => {}}
              closable={false}
              hideCloseButton
              hideOkButton
          > 
              <div className="space-y-4"> 
                  <div className="flex justify-center mb-2">
                    <PowerUpTooltip powerUpKey={showTargetModal.powerUp} placement="bottom">
                      <span className="text-5xl filter drop-shadow-lg cursor-help hover:scale-110 transition-transform inline-block">
                        {powerUpInfo.icon}
                      </span>
                    </PowerUpTooltip>
                  </div>
                  <p className="text-center mb-4 text-lg text-slate-600 dark:text-slate-400 font-editorial italic border-b border-slate-200 dark:border-slate-700 pb-3">
                    "{plainDescriptionOf(showTargetModal.powerUp)}"
                  </p> 

                  {isSwap && buyerPlayer && (
                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/50 text-center text-xs font-sans text-amber-900 dark:text-amber-200 shadow-sm">
                      <div className="flex items-center justify-center gap-1.5 font-sans mb-1">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">Your Current Vault:</span>
                        <span className="font-sans tabular-nums font-bold text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-100/70 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                          ${buyerPlayer.money.toLocaleString()}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Select a player to swap vaults with.
                      </p>
                    </div>
                  )}

                  <p className="text-center text-amber-600 dark:text-amber-400 font-bold uppercase tracking-widest text-xs mb-2">
                    Select Target Player
                  </p>

                  <div className="grid grid-cols-1 gap-2.5 max-h-[50vh] overflow-y-auto pr-1">
                  {players.filter(p => p.id !== showTargetModal.playerId && p.money > 0).length > 0 ?
                   (players.filter(p => p.id !== showTargetModal.playerId && p.money > 0).map(p => {
                      const targetActivePowerUps = (activePowerUps[p.id] || []) as ActivePowerUp[];
                      const isNonOffensive = NON_OFFENSIVE_TARGETED_POWER_UPS.includes(showTargetModal.powerUp);
                      const ignoresShield = showTargetModal.powerUp === 'COPYCAT';
                      const hasShield = !ignoresShield && hasShieldProtection(targetActivePowerUps);
                      const alreadyAttacked = !isNonOffensive && Boolean(mpRoomCode) && isPlayerTargetedThisRound(p.id, powerUpsUsedThisRound, activePowerUps);
                      const isShielded = hasShield || alreadyAttacked;
                      return ( 
                      <ActionButton 
                          key={p.id} 
                          onClick={() => handleTargetedPowerUp(p.id)} 
                          variant="purple"
                          className={`w-full py-3 px-4 transition-all ${isShielded ? 'grayscale opacity-50 cursor-not-allowed' : 'hover:scale-[1.01]'}`}
                          disabled={isShielded}
                          title={isShielded ? `${p.name} is Protected!` : `Target ${p.name}`}
                      > 
                          <div className="flex items-center justify-between w-full gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <PlayerAvatar value={p.avatar} size="sm" />
                              <div className="text-left truncate">
                                <span className="font-bold text-lg tracking-wide block truncate">{p.name}</span>
                                {isShielded && (
                                  <span className="text-[10px] text-amber-300 font-bold uppercase tracking-wider block">
                                    🛡️ {alreadyAttacked ? 'Already Targeted This Hand' : 'Shield Active'}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 font-sans tabular-nums font-bold text-emerald-400 dark:text-emerald-300 bg-black/40 px-3 py-1 rounded-lg border border-emerald-500/30 text-base shadow-inner shrink-0">
                              <span className="text-xs opacity-75">💰</span>
                              <span>${p.money.toLocaleString()}</span>
                            </div>
                          </div>
                      </ActionButton>
                  )})) : <p className="text-center text-slate-500 py-4">No available targets.</p>}
                  </div>

                  {canCancelPowerUpTarget(showTargetModal.powerUp, hasSelectableTarget(showTargetModal.playerId, showTargetModal.powerUp)) && (
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60">
                      <ActionButton
                        onClick={() => handleCancelTargetModal()}
                        variant="secondary"
                        className="w-full py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5"
                      >
                        <span>↩️</span>
                        <span>Cancel & Refund ($50)</span>
                      </ActionButton>
                    </div>
                  )}
              </div> 
          </Modal>
        );
      })()}
      {showAvatarModal && (() => {
        const modalPlayer = players.find(p => p.id === showAvatarModal.playerId);
        return (
          <Modal 
            title={modalPlayer ? `Customize Character · ${modalPlayer.name}` : "Customize Character"} 
            onClose={() => setShowAvatarModal(null)} 
            playSound={playSound}
            maxWidth="max-w-2xl"
          >
            <CharacterPickerPanel
              value={modalPlayer?.avatar || ''}
              onChange={(av) => handleUpdateAvatar(showAvatarModal.playerId, av)}
              playerName={modalPlayer?.name}
              playSound={playSound}
            />
          </Modal>
        );
      })()}
      {showWheelModal && players.find(p => p.id === showWheelModal.playerId) && (
        <WheelModal
          player={players.find(p => p.id === showWheelModal.playerId)!}
          onClose={() => setShowWheelModal(null)}
          onApplyResult={(item) => handleApplyWheelResult(showWheelModal.playerId, item)}
          playSound={playSound}
        />
      )}
      {pendingLoadGame && (
        <Modal title="Load this game?" onClose={() => setPendingLoadGame(null)} playSound={playSound} hideOkButton>
          <div className="space-y-4">
            <div className="p-4 rounded-gc bg-gc-line/[0.04] border border-gc-line/[0.12]">
              <h3 className="text-gc-small font-bold text-gc-quiet mb-3">The game</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-gc-small">
                <div><dt className="text-gc-quiet">How to win</dt><dd className="text-gc-ink font-semibold">{pendingLoadGame.gameMode === 'lastPlayer' ? 'Last player standing' : pendingLoadGame.gameMode === 'rounds' ? 'Set number of hands' : 'Target amount'}</dd></div>
                <div>
                  <dt className="text-gc-quiet">{pendingLoadGame.gameMode === 'targetAmount' ? 'Target' : 'Hand'}</dt>
                  <dd className="text-gc-ink font-semibold tabular-nums">
                    {pendingLoadGame.gameMode === 'targetAmount' ? `$${(pendingLoadGame.targetAmount || 2000).toLocaleString()}` : `${pendingLoadGame.currentRound} of ${pendingLoadGame.totalRounds}`}
                  </dd>
                </div>
                <div><dt className="text-gc-quiet">Topic</dt><dd className="text-gc-ink font-semibold">{pendingLoadGame.settings?.topic}</dd></div>
                <div><dt className="text-gc-quiet">Level</dt><dd className="text-gc-ink font-semibold">{pendingLoadGame.settings?.level}</dd></div>
              </dl>
            </div>
            <div className="p-4 rounded-gc bg-gc-line/[0.04] border border-gc-line/[0.12]">
              <h3 className="text-gc-small font-bold text-gc-quiet mb-3">Players ({pendingLoadGame.players?.length || 0})</h3>
              <ul className="space-y-1.5 max-h-[200px] overflow-y-auto pr-2 modal-content-scroll">
                {pendingLoadGame.players?.map((p: any) => (
                  <li key={p.id} className="flex justify-between items-center gap-3 px-3 py-2 rounded-gc-sm bg-gc-line/[0.05]">
                    <span className="flex items-center gap-2 min-w-0">
                      <PlayerAvatar value={p.avatar} size="xs" />
                      <span className="text-gc-body font-bold text-gc-ink truncate">{p.name}</span>
                    </span>
                    <span className="text-gc-body font-bold text-gc-money tabular-nums">${Number(p.money).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex gap-3 pt-2">
              <ActionButton onClick={() => setPendingLoadGame(null)} playSound={playSound} variant="ghost" className="flex-1 h-12 text-gc-body font-bold">Cancel</ActionButton>
              <ActionButton onClick={handleConfirmLoadGame} playSound={playSound} variant="primary" className="flex-1 h-12 text-gc-body">Load the game</ActionButton>
            </div>
          </div>
        </Modal>
      )}
      {showReportCardModal && (
        <Modal 
          title="Report card" 
          onClose={() => setShowReportCardModal(false)} 
          playSound={playSound}
        >
          <div className="max-h-[78vh] overflow-y-auto pr-1 modal-content-scroll">
            <GrammarReportCard
              history={roundHistory}
              players={players}
              winner={winner}
              playSound={playSound}
              onRestartGame={handleRestartGame}
              settings={settings}
              gameMode={gameMode}
              totalRounds={totalRounds}
              targetAmount={targetAmount}
            />
          </div>
        </Modal>
      )}
      {showSettingsModal && (
        <RoundSettingsModal
          isOpen={showSettingsModal}
          onClose={() => { setShowSettingsModal(false); refreshDesktopStatus(); }}
          initialTab={settingsModalTab}
          currentSettings={settings}
          nextSettings={nextRoundSettings || settings}
          currentRound={currentRound}
          playSound={playSound}
          onSaveNextRound={handleSaveNextRoundSettings}
          onApplyCurrentRound={step === 'IN_GAME' ? handleApplySettingsImmediately : undefined}
        />
      )}
      {showDeckConfigModal && (
        <DeckConfigModal
          isOpen={showDeckConfigModal}
          onClose={() => setShowDeckConfigModal(false)}
          selectedPowerUps={selectedPowerUps}
          onTogglePowerUp={(key) => {
            setSelectedPowerUps(prev => {
              const updated = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
              if (step === 'IN_GAME') {
                setAvailablePowerUps(updated);
              }
              return updated;
            });
          }}
          onSelectAll={() => {
            const allKeys = Object.keys(POWER_UPS) as PowerUpKey[];
            setSelectedPowerUps(allKeys);
            if (step === 'IN_GAME') {
              setAvailablePowerUps(allKeys);
            }
          }}
          onClearAll={() => {
            setSelectedPowerUps([]);
            if (step === 'IN_GAME') {
              setAvailablePowerUps([]);
            }
          }}
          onSetDeck={(keys) => {
            setSelectedPowerUps(keys);
            if (step === 'IN_GAME') {
              setAvailablePowerUps(keys);
            }
          }}
          playSound={playSound}
        />
      )}
      {removedPlayer && step === 'PLAYER_SETUP' && (
        <div
          role="status"
          data-testid="undo-remove"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] w-[min(92vw,26rem)] gc-panel rounded-gc-lg px-4 py-3 flex items-center gap-3"
        >
          <p className="flex-1 min-w-0 text-gc-body font-bold text-gc-ink truncate">Removed {removedPlayer.player.name}.</p>
          <button
            type="button"
            onClick={undoRemovePlayer}
            className="h-10 px-4 rounded-full bg-gc-gold text-gc-on-gold text-gc-small font-bold cursor-pointer"
          >
            Undo
          </button>
        </div>
      )}
      {mpResumeNotice && mpRoomCode && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] w-[min(92vw,30rem)] gc-panel rounded-gc-lg border-gc-win/50 px-4 py-3 flex items-center gap-3"
        >
          <span className="w-2 h-2 shrink-0 rounded-full bg-gc-win" aria-hidden="true" />
          <p className="flex-1 min-w-0 text-gc-body font-bold text-gc-ink">{mpResumeNotice}</p>
          <button
            type="button"
            onClick={() => setMpResumeNotice(null)}
            className="h-10 px-4 rounded-full border border-gc-line/[0.2] text-gc-small font-bold text-gc-ink cursor-pointer"
          >
            OK
          </button>
        </div>
      )}
      {mpRoomCode && mpTakeoverRequests.length > 0 && (() => {
        const request = mpTakeoverRequests[0];
        return (
          <div
            role="alertdialog"
            aria-live="assertive"
            aria-label={`New phone wants to play as ${request.name}`}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] w-[min(92vw,30rem)] gc-panel rounded-gc-lg border-gc-gold/60 p-4"
          >
            <div className="flex items-start gap-3">
              <PlayerAvatar value={request.avatar || '📱'} size="md" />
              <div className="flex-1 min-w-0">
                <p className="text-gc-body font-bold text-gc-ink">
                  A new phone wants to play as {request.name}.
                </p>
                <p className="text-gc-small mt-1 text-gc-quiet">
                  {request.name}'s seat is already on another phone. Only say yes if {request.name} really changed phones: the new phone sees and controls their bet, and the old one is signed out.
                </p>
                {mpTakeoverRequests.length > 1 && (
                  <p className="text-gc-small mt-1 font-semibold text-gc-ink">+{mpTakeoverRequests.length - 1} more waiting</p>
                )}
                <div className="flex flex-wrap gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => {
                      playSound('click');
                      mpControllerRef.current?.answerSeatTakeover(request.clientId, true);
                      setMpTakeoverRequests(prev => prev.filter(r => r.clientId !== request.clientId));
                    }}
                    className="gc-btn-primary h-11 px-5 rounded-full text-gc-small font-bold cursor-pointer"
                  >
                    Yes, it's {request.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      playSound('click');
                      mpControllerRef.current?.answerSeatTakeover(request.clientId, false);
                      setMpTakeoverRequests(prev => prev.filter(r => r.clientId !== request.clientId));
                    }}
                    className="h-11 px-5 rounded-full border border-gc-line/[0.2] bg-gc-line/[0.05] hover:border-gc-line/40 text-gc-small font-bold text-gc-ink cursor-pointer"
                  >
                    No, keep the seat
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      {showMpLobbyModal && (
        <MultiplayerLobbyModal
          isOpen={showMpLobbyModal}
          onClose={() => setShowMpLobbyModal(false)}
          roomCode={mpRoomCode}
          roomLocked={mpRoomLocked}
          hostConnected={mpHostConnected}
          players={players}
          seats={mpSeats}
          onCreateRoom={handleCreateMpRoom}
          classListName={activeCloudRoster?.className ?? null}
          onToggleLockRoom={handleToggleLockMpRoom}
          lateJoinersAllowed={lateJoinersAllowed}
          onToggleLateJoiners={() => { playSound('click'); setLateJoinersAllowed(v => !v); }}
          onKickPlayer={handleKickMpPlayer}
          onCloseRoom={handleCloseMpRoom}
          onBailoutBankruptPlayers={handleBailoutBankruptPlayers}
          onOpenRemote={(base) => { playSound('click'); setRemoteBase(base); setShowMpLobbyModal(false); setShowRemotePair(true); }}
          remotePaired={Boolean(remotePair && remotePair.code === mpRoomCode && remotePair.seatId !== null)}
          playSound={playSound}
        />
      )}
      {showRemotePair && mpRoomCode && (
        <RemotePairModal
          link={remotePair && remotePair.code === mpRoomCode && remotePair.seatId === null ? remoteLink(remoteBase, mpRoomCode, remotePair.key) : null}
          paired={Boolean(remotePair && remotePair.code === mpRoomCode && remotePair.seatId !== null)}
          onMakeLink={() => {
            setRemotePair({ code: mpRoomCode, key: newRemoteKey(), seatId: null });
          }}
          onUnpair={() => {
            if (remotePair?.seatId != null) {
              // That phone is told it is no longer the remote.
              const old = remotePair.seatId;
              setRetiredRemoteSeats(prev => (prev.includes(old) ? prev : [...prev, old]));
            }
            setRemotePair(null);
          }}
          roomLocked={mpRoomLocked}
          onClose={() => setShowRemotePair(false)}
        />
      )}
      {showCloudModal && (
        <CloudManagerModal
          isOpen={showCloudModal}
          onClose={() => setShowCloudModal(false)}
          initialTab={cloudModalTab}
          players={players}
          startingCash={startingCash}
          settings={settings}
          gameMode={gameMode}
          totalRounds={totalRounds}
          targetAmount={targetAmount}
          roundHistory={roundHistory}
          winner={winner}
          buildCurrentFullGameState={buildCurrentFullGameState}
          activeRosterId={activeCloudRoster?.id || null}
          activeRosterName={activeCloudRoster?.className || ''}
          onLoadRoster={(roster, mode) => {
            // Package T5: loading a class during a game asks first, and keeps the game's report.
            if (step === 'IN_GAME' || step === 'RESULTS') {
              setConfirmAction({
                title: 'Load this class now?',
                message: 'The game in progress ends. Its report is kept under Past reports on this computer.',
                confirmLabel: 'Load the class',
                onConfirm: () => {
                  archiveGame(Date.now());
                  setRoundHistory([]);
                  setHandReactions({});
                  setRoundResults([]);
                  setCurrentRound(1);
                  setCurrentSentence(null);
                  setBets({});
                  handleLoadCloudRoster(roster, mode);
                },
              });
              return;
            }
            handleLoadCloudRoster(roster, mode);
          }}
          onLoadFullGameState={handleApplyCloudFullGameState}
          onActiveRosterUpdated={(roster: CloudRoster) => setActiveCloudRoster({ id: roster.id, className: roster.name })}
          playSound={playSound}
          teacherEmail={teacherGoogleEmail}
          isDesktopApp={desktopStatus.isDesktop}
        />
      )}
    </MotionConfig>
  );
}
