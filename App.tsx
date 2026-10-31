import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  Player, Settings, GeneratedSentence, Bet, Hint, RoundResultInfo, GameError, 
  PowerUpKey, ActivePowerUp, ShowTargetModalPayload, ShowPowerUpModalPayload,
  Step, GameMode, SoundEffect, GrammarTopic, CEFRLevel, Theme, PlayerHistory, PlayerEffect, UsedPowerUp,
  WheelItem, RoundHistoryRecord, RoundPlayerResult, PlayerTurnTimer, QuestionType, ChallengeFormat
} from './types';
import { 
  POWER_UPS, GRAMMAR_TOPICS, QUICK_LEXICAL_TOPICS, CEFR_LEVELS, CEFR_DIFFICULTY_PROFILES, THEMES, LOCAL_STORAGE_KEY, 
  INITIAL_PLAYER_MONEY, MIN_TARGET_AMOUNT, DEFAULT_TARGET_AMOUNT, HINT_COST, POWERUP_COST, TAXMAN_AMOUNT, GENEROUS_GIFT_AMOUNT, BET_CAP_AMOUNT,
  JACKPOT_MULTIPLIER, AVATARS, TOPIC_SUBTYPES, WHEEL_ITEMS, TURN_TIMER_OPTIONS, TURN_TIMER_BONUS_MS,
  CHALLENGE_FORMATS, ALL_QUESTION_TYPES, getEffectiveMixedFormats, CLOZE_DISABLED_POWER_UPS, BINARY_DISABLED_POWER_UPS, MP_ONLY_POWER_UPS, NON_OFFENSIVE_TARGETED_POWER_UPS
} from './constants';
import ActionButton from './components/ActionButton';
import TextInput from './components/TextInput';
import Modal from './components/Modal';
import PlayerBettingCard from './components/PlayerBettingCard';
import PlayerTileGrid, { PlayerTile, SeatStatus } from './components/PlayerTileGrid';
import { getTimerRemainingMs, MultiplayerRoundTimerFrame } from './components/TurnTimer';
import WheelModal from './components/WheelModal';
import PowerUpTooltip from './components/PowerUpTooltip';
import GrammarReportCard from './components/GrammarReportCard';
import { ChipRack, PokerChip } from './components/ChipStacks';
import RoundSettingsModal, { SettingsModalTab } from './components/RoundSettingsModal';
import DeckConfigModal from './components/DeckConfigModal';
import MultiplayerLobbyModal from './components/MultiplayerLobbyModal';
import StudentControllerView from './components/StudentControllerView';
import CloudManagerModal, { CloudManagerTab } from './components/CloudManagerModal';
import {
  MultiplayerSeat,
  buildAllPlayerViews,
  isPlayerTargetedThisRound,
  isBetCompleteForQuestionType,
  isValidKeyWordTransformationPhrase,
  buildAudiencePollSummary,
  isPlayerUnderdog,
} from './utils/multiplayerProtocol';
import { HostRoomController, HostEventPayload, SeatTakeoverRequest } from './services/multiplayerService';
import * as GeminiService from './services/geminiService';
import { settleRound, buildAcceptedAnswerSet } from './utils/roundSettlement';
import { markErrorPhrase, diffWords, TextSegment } from './utils/errorHighlight';
import {
  signInTeacherWithGoogle,
  signOutTeacherGoogle,
  subscribeToAuthChanges,
  syncCloudSentenceBank,
  isVerifiedTeacherUser,
  CloudRoster,
} from './services/firebaseService';

const HOUSE_BAILOUT_AMOUNT = 150;

// --- Tone.js Sound Manager ---
declare global {
  interface Window {
    Tone: any; // Or a more specific type if you have Tone.js typings
  }
}

let soundManagerInstance: { play: (sound: SoundEffect, ...args: any[]) => void } | null = null;

const initializeSounds = (): typeof soundManagerInstance => {
    if (typeof window.Tone === 'undefined') {
        return null;
    }
    if (soundManagerInstance) return soundManagerInstance;

    try {
      const sounds = {
          click: new window.Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0, release: 0.1 } }).toDestination(),
          addPlayer: new window.Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.3, sustain: 0.1, release: 0.2 } }).toDestination(),
          startGame: new window.Tone.PolySynth(window.Tone.Synth).toDestination(),
          win: new window.Tone.Synth({ volume: -6, oscillator: { type: 'pulse', width: 0.2 }, envelope: { attack: 0.01, decay: 0.4, sustain: 0, release: 0.2 } }).toDestination(),
          lose: new window.Tone.Synth({ volume: -6, oscillator: { type: 'fmsquare', modulationIndex: 10 }, envelope: { attack: 0.05, decay: 0.3, sustain: 0, release: 0.1 } }).toDestination(),
          hint: new window.Tone.PluckSynth().toDestination(),
          powerUp: new window.Tone.MembraneSynth({ pitchDecay: 0.01, octaves: 5, envelope: { attack: 0.001, decay: 0.2, sustain: 0.01, release: 0.1}}).toDestination(),
          gameOver: new window.Tone.PolySynth(window.Tone.Synth).toDestination(),
          bet: new window.Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.01, decay: 0.1, sustain: 0, release: 0.1 } }).toDestination(),
          flip: new window.Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.05 } }).toDestination(),
          error: new window.Tone.DuoSynth({ harmonicity: 1.5, voice0: { oscillator: { type: 'sine' } }, voice1: { oscillator: { type: 'sine' } } }).toDestination(),
          success: new window.Tone.PolySynth(window.Tone.Synth).toDestination(),
          tick: new window.Tone.Synth({ volume: -8, oscillator: { type: 'triangle' }, envelope: { attack: 0.002, decay: 0.06, sustain: 0, release: 0.03 } }).toDestination(),
          timeUp: new window.Tone.PolySynth(window.Tone.Synth, { volume: -4 }).toDestination(),
      };

      const play = (sound: SoundEffect, ...args: any[]) => {
          if (!window.Tone) return;
          const now = window.Tone.now();
          switch (sound) {
              case 'click': sounds.click.triggerAttackRelease('C4', '16n', now); break; // Raised pitch slightly
              case 'addPlayer': sounds.addPlayer.triggerAttackRelease('E4', '8n', now); break;
              case 'startGame': sounds.startGame.triggerAttackRelease(['C4', 'E4', 'G4'], '8n', now); break;
              case 'win': sounds.win.triggerAttackRelease('G5', '16n', now + (args[0] || 0) * 0.15); break; // Faster sequence
              case 'lose': sounds.lose.triggerAttackRelease('C2', '8n', now + (args[0] || 0) * 0.15); break;
              case 'hint': sounds.hint.triggerAttackRelease('A5', now); break; // Higher pitch for hint
              case 'powerUp': sounds.powerUp.triggerAttackRelease('C3', '8n', now); break;
              case 'gameOver': sounds.gameOver.triggerAttackRelease(['C5', 'E5', 'G5', 'C6'], '4n', now); break;
              case 'bet': sounds.bet.triggerAttackRelease('G3', '16n', now); break;
              case 'flip': sounds.flip.triggerAttackRelease('16n', now); break;
              case 'error': sounds.error.triggerAttackRelease('G2', '8n', now); break;
              case 'success': sounds.success.triggerAttackRelease(['C5', 'E5', 'G5'], '8n', now); break;
              case 'tick': sounds.tick.triggerAttackRelease('A5', '32n', now); break;
              case 'timeUp': sounds.timeUp.triggerAttackRelease(['G4', 'Eb4', 'C4'], '8n', now); break;
              default: break;
          }
      };
      soundManagerInstance = { play };
    } catch (e) {
      console.error("Failed to initialize Tone.js sounds:", e);
      soundManagerInstance = null;
    }
    return soundManagerInstance;
};

// --- Audio Decoding Helpers for Gemini TTS ---
function base64ToBytes(base64: string) {
  const binaryString = atob(base64);
  const length = binaryString.length;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function pcmToAudioBuffer(
  data: Uint8Array,
  ctx: AudioContext,
  defaultSampleRate: number = 24000,
  defaultNumChannels: number = 1
): AudioBuffer {
  let pcmBytes = data;
  let sampleRate = defaultSampleRate;
  let numChannels = defaultNumChannels;

  // Gemini 3.8 TTS unary calls return a complete WAV file (RIFF....WAVE) which
  // includes a 44-byte header and often trailing LIST/INFO metadata chunks at the end.
  // If we don't extract strictly the 'data' subchunk, those trailing metadata bytes
  // get played as a burst of static/noise at the end of the sentence.
  const isRiffWav =
    data.length > 44 &&
    data[0] === 0x52 && // 'R'
    data[1] === 0x49 && // 'I'
    data[2] === 0x46 && // 'F'
    data[3] === 0x46 && // 'F'
    data[8] === 0x57 && // 'W'
    data[9] === 0x41 && // 'A'
    data[10] === 0x56 && // 'V'
    data[11] === 0x45;   // 'E'

  if (isRiffWav) {
    let offset = 12;
    let foundDataChunk = false;
    while (offset + 8 <= data.length) {
      const chunkId = String.fromCharCode(
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3]
      );
      const chunkSize =
        (data[offset + 4] |
          (data[offset + 5] << 8) |
          (data[offset + 6] << 16) |
          (data[offset + 7] << 24)) >>>
        0;
      const chunkDataStart = offset + 8;

      if (chunkId === 'fmt ' && chunkSize >= 16 && chunkDataStart + 16 <= data.length) {
        const parsedChannels = data[chunkDataStart + 2] | (data[chunkDataStart + 3] << 8);
        const parsedRate =
          (data[chunkDataStart + 4] |
            (data[chunkDataStart + 5] << 8) |
            (data[chunkDataStart + 6] << 16) |
            (data[chunkDataStart + 7] << 24)) >>>
          0;
        if (parsedChannels >= 1 && parsedChannels <= 2) numChannels = parsedChannels;
        if (parsedRate >= 8000 && parsedRate <= 96000) sampleRate = parsedRate;
      } else if (chunkId === 'data') {
        // Streaming WAV headers sometimes set chunkSize to 0xFFFFFFFF; clamp to actual buffer length
        const availableBytes = data.length - chunkDataStart;
        const actualDataBytes =
          chunkSize > 0 && chunkSize <= availableBytes ? chunkSize : availableBytes;
        pcmBytes = data.subarray(chunkDataStart, chunkDataStart + actualDataBytes);
        foundDataChunk = true;
        break;
      }

      if (chunkSize === 0 || chunkDataStart + chunkSize > data.length) {
        break;
      }
      offset = chunkDataStart + chunkSize + (chunkSize % 2);
    }

    if (!foundDataChunk) {
      // Fallback: strip standard 44-byte WAV header
      pcmBytes = data.subarray(44);
    }
  }

  // Ensure even byte length for Int16Array
  const alignedByteLength = pcmBytes.byteLength - (pcmBytes.byteLength % 2);
  const sampleCount = Math.floor(alignedByteLength / 2);
  const view = new DataView(pcmBytes.buffer, pcmBytes.byteOffset, alignedByteLength);

  const rawFrameCount = Math.floor(sampleCount / numChannels);
  // Trim any tiny trailing click/pop in the last ~15ms and apply a smooth fade-in/fade-out
  const trimTailFrames = Math.min(Math.floor(sampleRate * 0.012), Math.floor(rawFrameCount * 0.05));
  const frameCount = Math.max(1, rawFrameCount - trimTailFrames);
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  const fadeInFrames = Math.min(Math.floor(sampleRate * 0.006), Math.floor(frameCount * 0.1));
  const fadeOutFrames = Math.min(Math.floor(sampleRate * 0.03), Math.floor(frameCount * 0.15));

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      const sampleIndex = (i * numChannels + channel) * 2;
      let sample = view.getInt16(sampleIndex, true) / 32768.0;

      if (i < fadeInFrames && fadeInFrames > 0) {
        sample *= i / fadeInFrames;
      } else if (i >= frameCount - fadeOutFrames && fadeOutFrames > 0) {
        const remaining = frameCount - 1 - i;
        // Cosine fade-out to eliminate any end-of-clip pop or noise
        const t = remaining / fadeOutFrames;
        sample *= 0.5 * (1 - Math.cos(Math.PI * t));
      }

      channelData[i] = sample;
    }
  }
  return buffer;
}


const loadInitialState = () => { 
  try { 
    const s = localStorage.getItem(LOCAL_STORAGE_KEY); 
    if (s) {
      const parsed = JSON.parse(s);
      // Migration: Add avatar, streak, effects to players if missing
      if (parsed.players) {
        parsed.players = parsed.players.map((p: any) => ({
            ...p,
            avatar: p.avatar || AVATARS[Math.floor(Math.random() * AVATARS.length)],
            winStreak: p.winStreak || 0,
            effects: p.effects || []
        }));
      }
      // Migration: powerUpsUsedThisRound to UsedPowerUp[]
      if (parsed.powerUpsUsedThisRound) {
        const fixedPowerUps: Record<number, UsedPowerUp[]> = {};
        Object.keys(parsed.powerUpsUsedThisRound).forEach(k => {
            const key = Number(k);
            const val = parsed.powerUpsUsedThisRound[key];
            if (Array.isArray(val)) {
                 if (val.length > 0 && typeof val[0] === 'string') {
                     fixedPowerUps[key] = val.map((p: string) => ({ key: p as PowerUpKey }));
                 } else {
                     fixedPowerUps[key] = val; 
                 }
            } else if (typeof val === 'number') {
                fixedPowerUps[key] = []; 
            } else {
                 fixedPowerUps[key] = [];
            }
        });
        parsed.powerUpsUsedThisRound = fixedPowerUps;
      }
      if (parsed && typeof parsed.step === 'string') return parsed;
    }
    return null;
  } catch (e) { 
    console.error("Failed to load or parse game state from localStorage:", e);
    return null; 
  }
};

const initialGameState = loadInitialState();

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
    return {
      topic: GRAMMAR_TOPICS[0],
      level: CEFR_LEVELS[2],
      theme: THEMES[0],
      challengeFormat: 'binary',
      mixedFormats: ALL_QUESTION_TYPES,
    };
  });
  const [mixedFormatSetupWarning, setMixedFormatSetupWarning] = useState<string | null>(null);
  const [customTopic, setCustomTopic] = useState(initialGameState?.customTopic || '');
  const [customTheme, setCustomTheme] = useState(initialGameState?.customTheme || '');
  const mixedFormatIndexRef = useRef(0);
  
  const [gameMode, setGameMode] = useState<GameMode>(initialGameState?.gameMode || 'lastPlayer');
  const [totalRounds, setTotalRounds] = useState<number | string>(initialGameState?.totalRounds || 10);
  const [targetAmount, setTargetAmount] = useState<number | string>(initialGameState?.targetAmount || DEFAULT_TARGET_AMOUNT);
  const [currentRound, setCurrentRound] = useState(initialGameState?.currentRound || 1);
  
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
  
  const [isMuted, setIsMuted] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [ttsVoices, setTtsVoices] = useState<SpeechSynthesisVoice[]>([]);
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
    return allKeys;
  });
  const [roundSpending, setRoundSpending] = useState<Record<number, number>>(initialGameState?.roundSpending || {}); // PlayerId -> amount spent

  const [isSentenceHeaderStuck, setIsSentenceHeaderStuck] = useState(false);
  const sentenceHeaderRef = useRef<HTMLDivElement>(null);

  const [simplifiedExplanation, setSimplifiedExplanation] = useState<{ text: string | null; loading: boolean }>({ text: null, loading: false });
  const [showAvatarModal, setShowAvatarModal] = useState<{ playerId: number } | null>(null);
  const [editingPlayerIdInSetup, setEditingPlayerIdInSetup] = useState<number | null>(null);
  const [editingPlayerNameInSetup, setEditingPlayerNameInSetup] = useState('');
  const [startingCash, setStartingCash] = useState<number>(initialGameState?.startingCash ?? INITIAL_PLAYER_MONEY);
  const [isEditingStartingCash, setIsEditingStartingCash] = useState(false);
  const [tempStartingCash, setTempStartingCash] = useState<string>(String(initialGameState?.startingCash ?? INITIAL_PLAYER_MONEY));
  const [showWheelModal, setShowWheelModal] = useState<{ playerId: number } | null>(null);
  const [usedSubtypes, setUsedSubtypes] = useState<string[]>([]);
  const [pendingLoadGame, setPendingLoadGame] = useState<any | null>(null);

  const [showDeckConfigModal, setShowDeckConfigModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsModalTab, setSettingsModalTab] = useState<SettingsModalTab>('topic');
  const [nextRoundSettings, setNextRoundSettings] = useState<Settings | null>(initialGameState?.nextRoundSettings || null);
  const [isSettingsDeckExpanded, setIsSettingsDeckExpanded] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('grammar_casino_expand_settings_deck') === 'true';
    }
    return false;
  });

  // --- Betting Turn Timer State ---
  const [turnTimerSeconds, setTurnTimerSeconds] = useState<number>(() => {
    const saved = initialGameState?.turnTimerSeconds;
    if (typeof saved === 'number' && TURN_TIMER_OPTIONS.includes(saved)) return saved;
    return 0;
  });
  const [turnTimers, setTurnTimers] = useState<Record<number, PlayerTurnTimer>>(initialGameState?.turnTimers || {});
  const [mpRoundTimer, setMpRoundTimer] = useState<PlayerTurnTimer>({ status: 'idle' });
  const mpAutoStartedRoundRef = useRef<number>(0);
  const mpTimerAutoPausedByAllLockedRef = useRef<boolean>(false);
  const [teacherRevealOverride, setTeacherRevealOverride] = useState<boolean>(initialGameState?.teacherRevealOverride || false);
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
  // Phones asking to play as a name that is already seated on another device (teacher decides).
  const [mpTakeoverRequests, setMpTakeoverRequests] = useState<SeatTakeoverRequest[]>([]);
  useEffect(() => {
    setMpTakeoverRequests([]);
  }, [mpRoomCode]);
  const [showMpLobbyModal, setShowMpLobbyModal] = useState<boolean>(false);
  const [mpHideProjectorBets, setMpHideProjectorBets] = useState<boolean>(true);
  // Single-screen table layout: null = automatic (compact grid from 4 players up).
  const [tableLayoutPref, setTableLayoutPref] = useState<'grid' | 'cards' | null>(null);
  const [openSeatPlayerId, setOpenSeatPlayerId] = useState<number | null>(null);
  const openSeatRef = useRef<HTMLDivElement>(null);
  const [mpStudentPendingTarget, setMpStudentPendingTarget] = useState<Record<number, PowerUpKey | null>>({});
  const [mpStudentPendingWheel, setMpStudentPendingWheel] = useState<Record<number, boolean>>({});
  const [mpStudentNotifications, setMpStudentNotifications] = useState<
    Record<number, { id: string; title: string; message: string; icon?: string } | null>
  >({});
  const mpControllerRef = useRef<HostRoomController | null>(null);
  const mpEventHandlerRef = useRef<(ev: HostEventPayload) => void>(() => {});

  // Desktop AI Engine and DPAPI Encryption status
  const [desktopStatus, setDesktopStatus] = useState<GeminiService.DesktopStatus>({
    isDesktop: false,
    isOnline: true,
    hasKey: false,
    isEncrypted: false,
  });

  // Teacher PIN & Google Auth Gate for Web Live AI, Cloud Vault & Live Classroom Hosting
  const [isTeacherAiUnlocked, setIsTeacherAiUnlocked] = useState<boolean>(() => GeminiService.isTeacherPinUnlocked());
  const [teacherGoogleEmail, setTeacherGoogleEmail] = useState<string | null>(null);
  const [isSigningInGoogle, setIsSigningInGoogle] = useState<boolean>(false);
  const [showTeacherPinModal, setShowTeacherPinModal] = useState<boolean>(false);
  const [teacherPinInput, setTeacherPinInput] = useState<string>('');
  const [newTeacherPinInput, setNewTeacherPinInput] = useState<string>('');
  const [showChangePinForm, setShowChangePinForm] = useState<boolean>(false);
  const [teacherPinNotice, setTeacherPinNotice] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [isVerifyingTeacherPin, setIsVerifyingTeacherPin] = useState<boolean>(false);
  const pendingCreateRoomAfterPinRef = useRef<boolean>(false);
  const pendingOpenCloudTabAfterPinRef = useRef<CloudManagerTab | null>(null);

  // Cloud Rosters, Session Reports & Cloud Sentence Bank Modal State
  const [showCloudModal, setShowCloudModal] = useState<boolean>(false);
  const [cloudModalTab, setCloudModalTab] = useState<CloudManagerTab>('rosters');
  const [activeCloudRoster, setActiveCloudRoster] = useState<{ id: string; name: string } | null>(null);

  const refreshDesktopStatus = useCallback(() => {
    GeminiService.getDesktopStatus().then(setDesktopStatus);
    GeminiService.checkTeacherPinStatus().then(setIsTeacherAiUnlocked);
  }, []);

  useEffect(() => {
    refreshDesktopStatus();
    // Sync the auto-growing Cloud Sentence Bank into local cache on startup
    void syncCloudSentenceBank();

    // Listen to Firebase Google Auth state
    const unsubscribeAuth = subscribeToAuthChanges(async (user) => {
      if (user && user.email) {
        setTeacherGoogleEmail(user.email);
        if (isVerifiedTeacherUser(user)) {
          try {
            const idToken = await user.getIdToken();
            await GeminiService.verifyTeacherGoogleOnServer(idToken);
          } catch {}
          setIsTeacherAiUnlocked(true);
        }
      } else {
        setTeacherGoogleEmail(null);
      }
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

  const handleOpenTeacherPinModal = () => {
    playSound('click');
    pendingCreateRoomAfterPinRef.current = false;
    pendingOpenCloudTabAfterPinRef.current = null;
    setTeacherPinInput('');
    setNewTeacherPinInput('');
    setShowChangePinForm(false);
    setTeacherPinNotice(null);
    setShowTeacherPinModal(true);
  };

  // The vault asks for the teacher's Google sign-in itself (the Firestore rules require it),
  // so it opens straight away instead of going through the Teacher PIN.
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

  const handleSignInWithGoogle = async () => {
    if (isSigningInGoogle) return;
    playSound('click');
    setIsSigningInGoogle(true);
    setTeacherPinNotice(null);
    const res = await signInTeacherWithGoogle();
    if (!res.ok || !res.user) {
      setIsSigningInGoogle(false);
      if (res.error) {
        setTeacherPinNotice({ type: 'error', text: res.error });
      }
      return;
    }

    setTeacherGoogleEmail(res.user.email || null);
    if (!res.isVerifiedTeacher) {
      setIsSigningInGoogle(false);
      playSound('error');
      setTeacherPinNotice({
        type: 'error',
        text: `Signed in as ${res.user.email}. Only teacher.siqueira@gmail.com automatically unlocks Teacher Mode without a PIN.`,
      });
      return;
    }

    if (res.idToken) {
      await GeminiService.verifyTeacherGoogleOnServer(res.idToken);
    }
    setIsSigningInGoogle(false);
    playSound('success');
    setIsTeacherAiUnlocked(true);

    if (pendingCreateRoomAfterPinRef.current) {
      pendingCreateRoomAfterPinRef.current = false;
      setShowTeacherPinModal(false);
      await startHostMultiplayerRoom();
      return;
    }
    if (pendingOpenCloudTabAfterPinRef.current) {
      const targetTab = pendingOpenCloudTabAfterPinRef.current;
      pendingOpenCloudTabAfterPinRef.current = null;
      setShowTeacherPinModal(false);
      setCloudModalTab(targetTab);
      setShowCloudModal(true);
      return;
    }
    setTeacherPinNotice({
      type: 'success',
      text: `Verified via Google (${res.user.email})! Live Gemini AI, QR Room Hosting & Cloud Vault are unlocked.`,
    });
  };

  const handleUnlockTeacherPin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!teacherPinInput.trim() || isVerifyingTeacherPin) return;
    setIsVerifyingTeacherPin(true);
    setTeacherPinNotice(null);
    const res = await GeminiService.verifyTeacherPinOnServer(teacherPinInput);
    setIsVerifyingTeacherPin(false);
    if (res.valid) {
      playSound('success');
      setIsTeacherAiUnlocked(true);
      setTeacherPinInput('');
      if (pendingCreateRoomAfterPinRef.current) {
        pendingCreateRoomAfterPinRef.current = false;
        setShowTeacherPinModal(false);
        await startHostMultiplayerRoom();
        return;
      }
      if (pendingOpenCloudTabAfterPinRef.current) {
        const targetTab = pendingOpenCloudTabAfterPinRef.current;
        pendingOpenCloudTabAfterPinRef.current = null;
        setShowTeacherPinModal(false);
        setCloudModalTab(targetTab);
        setShowCloudModal(true);
        return;
      }
      setTeacherPinNotice({
        type: 'success',
        text: 'Teacher PIN verified! Live Gemini AI & Live Room Hosting are unlocked for this session. The Cloud Vault needs your Google sign-in.',
      });
    } else {
      playSound('error');
      setTeacherPinNotice({ type: 'error', text: res.error || 'Incorrect Teacher PIN.' });
    }
  };

  const handleLockTeacherPin = async () => {
    playSound('click');
    pendingCreateRoomAfterPinRef.current = false;
    pendingOpenCloudTabAfterPinRef.current = null;
    GeminiService.clearSavedTeacherPin();
    if (teacherGoogleEmail) {
      await signOutTeacherGoogle();
      setTeacherGoogleEmail(null);
    }
    setIsTeacherAiUnlocked(false);
    setShowChangePinForm(false);
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
    setTeacherPinNotice({ type: 'success', text: 'Locked! Switched to Offline Curated Bank Mode (0 Gemini API usage).' });
  };

  const handleChangeTeacherPin = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentPin = teacherPinInput.trim() || GeminiService.getSavedTeacherPin();
    if (!currentPin || !newTeacherPinInput.trim() || isVerifyingTeacherPin) return;
    setIsVerifyingTeacherPin(true);
    setTeacherPinNotice(null);
    const res = await GeminiService.changeTeacherPinOnServer(currentPin, newTeacherPinInput);
    setIsVerifyingTeacherPin(false);
    if (res.ok) {
      playSound('success');
      setIsTeacherAiUnlocked(true);
      setTeacherPinInput('');
      setNewTeacherPinInput('');
      setShowChangePinForm(false);
      setTeacherPinNotice({ type: 'success', text: 'Teacher PIN updated! Keep your new PIN safe.' });
    } else {
      playSound('error');
      setTeacherPinNotice({ type: 'error', text: res.error || 'Could not update Teacher PIN.' });
    }
  };

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('grammar_casino_theme');
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
        localStorage.setItem('grammar_casino_theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('grammar_casino_theme', 'light');
      }
      return next;
    });
  };

  // Projector mode: solid text and bigger small labels for reading from the back of a classroom.
  const [isProjectorMode, setIsProjectorMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('grammar_casino_projector_mode') === 'on';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('projector', isProjectorMode);
    try {
      localStorage.setItem('grammar_casino_projector_mode', isProjectorMode ? 'on' : 'off');
    } catch {
      // Storage can be blocked (private window); the mode still works for this visit.
    }
  }, [isProjectorMode]);

  useEffect(() => {
    const savedTheme = localStorage.getItem('grammar_casino_theme');
    if (savedTheme === 'light') {
      document.documentElement.classList.remove('dark');
      setIsDarkMode(false);
    } else {
      document.documentElement.classList.add('dark');
      setIsDarkMode(true);
    }
  }, []);

  const activePlayers = players.filter(p => p.money > 0);

  // Sound and TTS setup
  useEffect(() => { 
    const script = document.createElement('script'); 
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/tone/14.7.77/Tone.js"; 
    script.async = true; 
    script.onload = () => { 
      initializeSounds(); 
      setAudioReady(true); 
    }; 
    document.body.appendChild(script); 
    return () => { 
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    }; 
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

  const playSound = useCallback(async (sound: SoundEffect, ...args: any[]) => { 
    if (isMuted || !audioReady || !soundManagerInstance) return; 
    if (window.Tone && window.Tone.context.state !== 'running') { 
      try {
        await window.Tone.start(); 
      } catch (e) {
        console.error("Error starting Tone.js audio context:", e);
        return;
      }
    } 
    soundManagerInstance.play(sound, ...args); 
  }, [isMuted, audioReady]);

  const handleToggleSettingsDeckExpanded = useCallback(() => {
    playSound('click');
    setIsSettingsDeckExpanded(prev => {
      const next = !prev;
      try {
        localStorage.setItem('grammar_casino_expand_settings_deck', String(next));
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
        // Try Gemini TTS
        const base64Audio = await GeminiService.generateSpeech(sanitizedText);
        
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
      console.warn("Gemini TTS failed, falling back to browser TTS:", e); 
      fallbackSpeak();
    } 
  }, [isMuted, ttsVoices, isSpeaking, ttsAudioContext]);

  // --- Betting Turn Timer Helpers, Effects & Controls ---
  const isPlayerFrozen = useCallback((playerId: number): boolean => {
    const player = players.find(p => p.id === playerId);
    if (!player) return false;
    const allPowerUps = Object.values(activePowerUps).flat() as ActivePowerUp[];
    return allPowerUps.some(pu => pu.type === 'SUB_ZERO' && pu.target === playerId) ||
           player.effects.some(e => e.type === 'SUB_ZERO');
  }, [players, activePowerUps]);

  const hasPlayerPlacedBet = useCallback((playerId: number): boolean => {
    const playerBet = bets[playerId];
    if (!playerBet) return false;
    const hasValidBetAmount = typeof playerBet.bet === 'number' && !isNaN(playerBet.bet) && Number(playerBet.bet) > 0;
    if (!hasValidBetAmount) return false;
    const hasSplitBet = (activePowerUps[playerId] || []).some(pu => pu.type === 'SPLIT_BET');
    const qType: QuestionType = currentSentence?.questionType || 'binary';

    if (qType === 'multipleChoice') {
      if (hasSplitBet) return (playerBet.splitOptions?.length ?? 0) >= 1;
      return Boolean(playerBet.selectedOption?.trim());
    }
    if (qType === 'openCloze' || qType === 'wordFormation') {
      const baseNorm = qType === 'wordFormation' ? (currentSentence?.baseWord || '').trim().toLowerCase() : '';
      const isValidWord = (w?: string) => {
        const trimmed = (w || '').trim().toLowerCase();
        if (!trimmed) return false;
        if (baseNorm && trimmed === baseNorm) return false;
        return true;
      };
      if (hasSplitBet) {
        const w1 = playerBet.splitClozeAnswers?.[0];
        const w2 = playerBet.splitClozeAnswers?.[1];
        if (baseNorm && ((w1?.trim() && w1.trim().toLowerCase() === baseNorm) || (w2?.trim() && w2.trim().toLowerCase() === baseNorm))) {
          return false;
        }
        return isValidWord(w1) || isValidWord(w2);
      }
      return isValidWord(playerBet.clozeAnswer);
    }
    if (qType === 'keyWordTransformation') {
      const keyWord = currentSentence?.baseWord;
      if (hasSplitBet) {
        const w1 = (playerBet.splitClozeAnswers?.[0] || '').trim();
        const w2 = (playerBet.splitClozeAnswers?.[1] || '').trim();
        if (!w1 && !w2) return false;
        if (w1 && !isValidKeyWordTransformationPhrase(w1, keyWord)) return false;
        if (w2 && !isValidKeyWordTransformationPhrase(w2, keyWord)) return false;
        return true;
      }
      return isValidKeyWordTransformationPhrase(playerBet.clozeAnswer, keyWord);
    }
    if (hasSplitBet) return true;
    return playerBet.opinion === 'correct' || playerBet.opinion === 'incorrect';
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
    return anyModalOpen || anyHintLoading;
  }, [
    error, historyPlayer, mpRoomCode, showPowerUpModal, showTargetModal, showAvatarModal,
    showWheelModal, pendingLoadGame, showReportCardModal, showSettingsModal,
    showDeckConfigModal, showCloudModal, isLoading, isProcessing, hints
  ]);

  // --- Single-screen compact grid ---
  const effectiveTableLayout: 'grid' | 'cards' = tableLayoutPref ?? (players.length >= 4 ? 'grid' : 'cards');

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

  // Bring the opened card into view below the sticky sentence.
  useEffect(() => {
    if (openSeatPlayerId === null) return;
    const id = window.setTimeout(() => {
      const el = openSeatRef.current;
      if (!el) return;
      // Leave room for the sticky sentence banner so it never covers the card's header.
      const bannerHeight = sentenceHeaderRef.current?.offsetHeight ?? 0;
      const top = el.getBoundingClientRect().top + window.scrollY - bannerHeight - 16;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }, 50);
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
    const endsAt = mpRoundTimer.endsAt;

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

  // Save game state
  useEffect(() => { 
    try { 
      const gameState = { 
        step, players, settings, nextRoundSettings, customTopic, customTheme, gameMode, totalRounds, targetAmount,
        currentRound, currentSentence, pastSentences, pastMistakes, bets, hints, roundResults, winner,
        powerUpsUsedThisRound, activePowerUps, highlightedPhrase, availablePowerUps, selectedPowerUps, roundSpending,
        sentenceBatch, roundHistory, startingCash, turnTimerSeconds, turnTimers, teacherRevealOverride, autoStartNextTimer
      }; 
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(gameState)); 
      GeminiService.savePortableGame(gameState); 
    } catch (e) { 
      console.error("Failed to save game state:", e); 
    } 
  }, [step, players, settings, nextRoundSettings, customTopic, customTheme, gameMode, totalRounds, targetAmount, currentRound, currentSentence, pastSentences, pastMistakes, bets, hints, roundResults, winner, powerUpsUsedThisRound, activePowerUps, highlightedPhrase, availablePowerUps, selectedPowerUps, roundSpending, sentenceBatch, roundHistory, startingCash, turnTimerSeconds, turnTimers, teacherRevealOverride, autoStartNextTimer]);

  // Sticky header logic
  useEffect(() => {
    const header = sentenceHeaderRef.current;
    if (!header) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsSentenceHeaderStuck(!entry.isIntersecting);
      },
      { rootMargin: "-17px 0px 0px 0px", threshold: [1] } 
    );

    observer.observe(header);
    return () => observer.disconnect();
  }, [step]); 

  // Scroll to top when betting screen loads
  useEffect(() => {
    if (step === 'IN_GAME' || step === 'RESULTS') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [step]);

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
      const randomAvatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
      setPlayers(prev => [...prev, { 
        id: Date.now(), 
        name: newPlayerName.trim(), 
        money: startingCash, 
        history: [], 
        avatar: randomAvatar, 
        winStreak: 0,
        effects: []
      }]); 
      setNewPlayerName(''); 
      playerNameInputRef.current?.focus(); 
    } 
  };
  const handleDeletePlayer = (idToDelete: number) => { 
    playSound('lose', 0); 
    setPlayers(prev => prev.filter(p => p.id !== idToDelete)); 
  };
  const handleUpdateAvatar = (playerId: number, newAvatar: string) => {
    setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, avatar: newAvatar } : p));
    setShowAvatarModal(null);
    playSound('click');
  };
  const handleOpenAvatarModal = useCallback((playerId: number) => {
    playSound('click');
    setShowAvatarModal({ playerId });
  }, [playSound]);
  const handleUpdatePlayerName = useCallback((playerId: number, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setPlayers(prev => {
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
    const settingsKey = `${targetSettings.topic}|${targetSettings.level}|${targetSettings.theme}|${targetSettings.challengeFormat || 'binary'}|${activeMixedSubsetKey}|${pastSentences.length}|${isTeacherAiUnlocked ? 'ai' : 'offline'}`;
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
      const allSubtypes = TOPIC_SUBTYPES[topicKey] || [];
      const activeUsedSubtypes = isSettingsPart2 ? [] : usedSubtypes;
      const available = allSubtypes.filter(s => !activeUsedSubtypes.includes(s));
      const pool = available.length > 0 ? available : allSubtypes;
      const subtype = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : null;

      const promise = GeminiService.generateSentence(
        targetSettings,
        pastSentences,
        forceCorrect,
        (resolvedQuestionType === 'binary' && forceCorrect) ? null : subtype,
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
  }, [step, settingsPart, currentSentence, isLoading, gameMode, totalRounds, currentRound, nextRoundSettings, settings, customTopic, customTheme, pastSentences, pastMistakes, sentenceBatch, usedSubtypes, isTeacherAiUnlocked]);

  const fetchNewSentence = useCallback(async (currentSettings: Settings, history: string[], forcedBatch?: boolean[], mistakeHistory?: string[]) => {
    setIsLoading(true);
    setCurrentSentence(null);
    setHighlightedPhrase(null);
    setIsCopied(false);
    setIsSentenceRevealed(false);
    try {
        if (!currentSettings || !currentSettings.theme || !currentSettings.level || !currentSettings.topic) {
            throw new Error("Invalid settings provided to fetch a new sentence.");
        }
        const formatSetting: ChallengeFormat = currentSettings.challengeFormat || 'binary';
        const expectedMixedSubsetKey = formatSetting === 'mixed'
          ? getEffectiveMixedFormats(currentSettings.mixedFormats).join(',')
          : '';
        const expectedKey = `${currentSettings.topic}|${currentSettings.level}|${currentSettings.theme}|${formatSetting}|${expectedMixedSubsetKey}|${history.length}|${GeminiService.isTeacherPinUnlocked() ? 'ai' : 'offline'}`;

        let generated: GeneratedSentence | null = null;
        let subtype: string | null = null;
        let allSubtypesLen = 0;
        let resolvedQuestionType: QuestionType = 'binary';
        let forceCorrect = true;

        if (!forcedBatch && prefetchRef.current?.key === expectedKey) {
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
          resolvedQuestionType = formatSetting === 'mixed'
            ? rotationOrder[(mixedFormatIndexRef.current++) % rotationOrder.length]
            : formatSetting;

          const currentBatch = forcedBatch || (sentenceBatch.length > 0 ? sentenceBatch : newBatch());
          forceCorrect = resolvedQuestionType === 'binary' ? currentBatch[0] : true;
          if (resolvedQuestionType === 'binary') {
            setSentenceBatch(currentBatch.slice(1));
          }

          const topicKey = currentSettings.topic;
          const allSubtypes = TOPIC_SUBTYPES[topicKey] || [];
          allSubtypesLen = allSubtypes.length;
          const available = allSubtypes.filter(s => !usedSubtypes.includes(s));
          const pool = available.length > 0 ? available : allSubtypes;
          subtype = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : null;

          const effectiveMistakes = mistakeHistory !== undefined ? mistakeHistory : pastMistakes;
          generated = await GeminiService.generateSentence(
            currentSettings, 
            history, 
            forceCorrect, 
            (resolvedQuestionType === 'binary' && forceCorrect) ? null : subtype,
            effectiveMistakes,
            resolvedQuestionType
          );
        }
        
        if ((resolvedQuestionType !== 'binary' || !forceCorrect) && subtype) {
          setUsedSubtypes(prev => {
            const next = [...prev, subtype!];
            return next.length >= allSubtypesLen ? [] : next;
          });
        }

        // Never repeat mistakes: track mistake phrase and type
        if (!generated.isCorrect) {
          const mistakePhrase = (generated.errorPhrase || generated.grammarPhrase || '').trim();
          if (mistakePhrase) {
            const descriptor = generated.mistakeType ? `${mistakePhrase} (${generated.mistakeType.trim()})` : mistakePhrase;
            setPastMistakes(prev => {
              const lower = descriptor.toLowerCase();
              return prev.some(p => p.toLowerCase() === lower) ? prev : [...prev, descriptor];
            });
          }
        }

        setCurrentSentence(generated);
        setPastSentences(prev => [...prev, generated!.text]);
        // Small delay to allow initial card render before flip
        setTimeout(() => {
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
    setSettings(newSettings);
    setCurrentRound(1);
    setPlayers(p => p.map(player => ({ ...player, money: startingCash, history: [], winStreak: 0, effects: [] }))); 
    setStep('IN_GAME');
    setRoundHistory([]);
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
  }, [settings, customTopic, customTheme, gameMode, totalRounds, targetAmount, startingCash, selectedPowerUps, fetchNewSentence, playSound, pastSentences, pastMistakes]);
  
  const handleGetHint = useCallback(async (playerId: number) => {
      if (!canPlayerAct(playerId)) return;
      const player = players.find(p => p.id === playerId);
      if (!player || player.money < HINT_COST || !currentSentence || hints[playerId]?.text) return;
      
      playSound('hint');
      setPlayers(ps => ps.map(p => p.id === playerId ? {...p, money: p.money - HINT_COST} : p));
      setRoundSpending(s => ({...s, [playerId]: (s[playerId] || 0) + HINT_COST }));
      setHints(h => ({...h, [playerId]: { text: '', isLoading: true }}));
      
      try {
        const hintText = await GeminiService.getHint(
          currentSentence.text,
          settings.topic,
          settings.level as any,
          currentSentence.questionType || 'binary',
          currentSentence.baseWord,
          currentSentence.leadInSentence
        );
        setHints(h => ({...h, [playerId]: { text: hintText, isLoading: false }}));
      } catch (err: any) {
        setHints(h => ({...h, [playerId]: { text: 'Hint error. Please try again.', isLoading: false }}));
        setPlayers(ps => ps.map(p => p.id === playerId ? {...p, money: player.money } : p)); 
        setRoundSpending(s => ({...s, [playerId]: (s[playerId] || 0) - HINT_COST }));
        setError({title: "Hint Error", message: "Could not fetch hint from AI."})
      }
  }, [canPlayerAct, players, currentSentence, settings.topic, settings.level, playSound, hints]); 
  
  const handleBetChange = useCallback((playerId: number, field: keyof Bet, value: any, ignoreLock = false) => {
    if (!ignoreLock && !canPlayerAct(playerId)) return;
    const player = players.find(p => p.id === playerId);
    if (!player) return;

    let finalValue = value;
    if (field === 'bet') {
      const allPowerUps = Object.values(activePowerUps).flat() as ActivePowerUp[];
      const playerCaps = allPowerUps.filter(pu => pu.type === 'BET_CAP' && (pu.target !== undefined ? pu.target === playerId : (activePowerUps[playerId] || []).includes(pu)));
      const isCapped = playerCaps.length > 0 || player.effects.some(e => e.type === 'BET_CAP');
      const capLimit = playerCaps.length > 0 
        ? playerCaps.reduce((min, pu) => Math.min(min, pu.amount ?? BET_CAP_AMOUNT), BET_CAP_AMOUNT)
        : (isCapped ? 50 : BET_CAP_AMOUNT);
      const maxBetAmount = isCapped ? Math.min(player.money, capLimit) : player.money;

      if (value === '') {
        finalValue = '';
      } else {
        const num = parseInt(String(value), 10);
        if (isNaN(num)) {
            finalValue = ''; 
        } else {
            finalValue = Math.max(0, Math.min(num, maxBetAmount));
        }
      }
    }
    setBets(prev => {
      const newBets = {
        ...prev,
        [playerId]: {
          ...(prev[playerId] || {}),
          [field]: finalValue
        }
      };
      if (field === 'opinion' || field === 'bet' || field === 'selectedOption' || field === 'splitOptions') {
          playSound('bet');
      }
      return newBets;
    });
  }, [canPlayerAct, players, activePowerUps, playSound]);

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

      const allPowerUps = Object.values(activePowerUps).flat() as ActivePowerUp[];
      const playerCaps = allPowerUps.filter(pu => pu.type === 'BET_CAP' && (pu.target !== undefined ? pu.target === playerId : (activePowerUps[playerId] || []).includes(pu)));
      const isCapped = playerCaps.length > 0 || (players.find(p => p.id === playerId)?.effects.some(e => e.type === 'BET_CAP') ?? false);
      const capLimit = playerCaps.length > 0 
        ? playerCaps.reduce((min, pu) => Math.min(min, pu.amount ?? BET_CAP_AMOUNT), BET_CAP_AMOUNT)
        : (isCapped ? 50 : BET_CAP_AMOUNT);
      const maxAllowed = isCapped ? Math.min(validAmount, capLimit) : validAmount;

      if (validAmount <= 0) {
        if (playerBet.bet !== 0 && playerBet.bet !== '') {
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
      const allPowerUps = Object.values(activePowerUps).flat() as ActivePowerUp[];

      players.forEach(player => {
        const playerBet = updatedBets[player.id];
        const playerCaps = allPowerUps.filter(pu => pu.type === 'BET_CAP' && (pu.target !== undefined ? pu.target === player.id : (activePowerUps[player.id] || []).includes(pu)));
        const isCapped = playerCaps.length > 0 || player.effects.some(e => e.type === 'BET_CAP');
        const capLimit = playerCaps.length > 0 
          ? playerCaps.reduce((min, pu) => Math.min(min, pu.amount ?? BET_CAP_AMOUNT), BET_CAP_AMOUNT)
          : (isCapped ? 50 : BET_CAP_AMOUNT);
        const maxLimit = isCapped ? Math.min(Math.max(0, player.money), capLimit) : Math.max(0, player.money);

        const playerHighRollers = allPowerUps.filter(pu => pu.type === 'HIGH_ROLLER' && pu.target === player.id);
        const isHighRoller = playerHighRollers.length > 0;
        const minLimit = isHighRoller && player.money > 0
          ? Math.min(
              maxLimit,
              Math.max(
                1,
                playerHighRollers.reduce(
                  (max, pu) => Math.max(max, pu.amount ?? Math.ceil(player.money * 0.5)),
                  Math.ceil(player.money * 0.5)
                )
              )
            )
          : 0;

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

  const handleBuyPowerUp = useCallback((playerId: number, powerUpKey: PowerUpKey) => {
    if (!canPlayerAct(playerId)) return;
    const player = players.find(p => p.id === playerId);
    if (!player || player.money < POWERUP_COST) return;
    
    const isClozeRound = currentSentence?.questionType === 'multipleChoice' || currentSentence?.questionType === 'openCloze' || currentSentence?.questionType === 'wordFormation' || currentSentence?.questionType === 'keyWordTransformation';
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
        const hasShield = !ignoresShield && pActivePowerUps.some(pu => pu.type === 'SHIELD' || pu.type === 'GUARDIAN_ANGEL');
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
    const newMoney = player.money - POWERUP_COST;

    setPlayers(ps => ps.map(p => p.id === playerId ? {...p, money: newMoney} : p));
    setPowerUpsUsedThisRound(prev => ({...prev, [playerId]: [...(prev[playerId] || []), { key: powerUpKey }]}));
    setRoundSpending(s => ({...s, [playerId]: (s[playerId] || 0) + POWERUP_COST }));

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
        let modalMessage = `${powerUp.icon} ${powerUp.description}`;
        
        if (powerUpKey === 'GRAMMAR_GOGGLES' && currentSentence) {
            if (!mpRoomCode || !mpSeats[playerId]) {
              setHighlightedPhrase(currentSentence.grammarPhrase || 'the key part of the sentence');
            }
            setActivePowerUps(prev => ({...prev, [playerId]: [...(prev[playerId] || []), {type: powerUpKey}]}));
        } else if (powerUpKey === 'SCALPEL' && currentSentence) {
            const qType = currentSentence.questionType || 'binary';
            if (qType === 'multipleChoice') {
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
            } else if (qType === 'keyWordTransformation' && currentSentence.correctAnswer) {
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
              modalMessage = `${powerUp.icon} Key Word Transformation Clue: ${mask}`;
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
                  ['HALF_BAKED', 'SUB_ZERO', 'BET_CAP', 'HIGH_ROLLER'].includes(pu.type)
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
                const isShielded = pActivePowerUps.some(pu => pu.type === 'SHIELD' || pu.type === 'GUARDIAN_ANGEL');
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
                const isShielded = pActivePowerUps.some(pu => pu.type === 'SHIELD' || pu.type === 'GUARDIAN_ANGEL');
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
            const activeOtherPlayersCount = activePlayers.filter(p => p.id !== playerId).length;
            const totalGiftCost = activeOtherPlayersCount * GENEROUS_GIFT_AMOUNT;
            const playerMoneyAfterGift = Math.max(0, newMoney - totalGiftCost);
            setPlayers(ps => ps.map(p => {
                if (p.id === playerId) return {...p, money: playerMoneyAfterGift };
                if (activePlayers.find(ap => ap.id === p.id)) return {...p, money: p.money + GENEROUS_GIFT_AMOUNT}; 
                return p;
            }));
             modalMessage = `${powerUp.icon} Gave $${GENEROUS_GIFT_AMOUNT} to ${activeOtherPlayersCount} other player(s).`;
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
                    return { ...p, effects: p.effects.filter(e => e.type !== 'CRUCIO' && e.type !== 'SILENCED') };
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
                 const isShielded = pActivePowerUps.some(pu => pu.type === 'SHIELD' || pu.type === 'GUARDIAN_ANGEL');
                 
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
              setMpStudentPendingWheel(prev => ({ ...prev, [playerId]: true }));
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
              ? `${powerUp.icon} Underdog Surge active! You are currently in underdog position — a winning bet this hand will award a 2.5× comeback payout (+150% winnings)!`
              : `${powerUp.icon} ${powerUp.description} (Note: You currently lead the table; Underdog Surge triggers if you are trailing or in the bottom half when bets settle.)`;
        } else if (powerUpKey === 'SCAVENGER') {
            setActivePowerUps(prev => ({ ...prev, [playerId]: [...(prev[playerId] || []), { type: 'SCAVENGER' }] }));
            modalMessage = `${powerUp.icon} Dead Pool Scavenger armed! You will scoop up 25% of every losing bet lost by other players to the House this round (up to +$500).`;
        } else if (powerUpKey === 'CORRECTION_BOUNTY' || powerUpKey === 'LONE_WOLF' || powerUpKey === 'CROWD_SURFER' || powerUpKey === 'DOUBLE_OR_NOTHING') {
            setActivePowerUps(prev => ({ ...prev, [playerId]: [...(prev[playerId] || []), { type: powerUpKey }] }));
            modalMessage = `${powerUp.icon} ${powerUp.description}`;
        } else {
            setActivePowerUps(prev => ({...prev, [playerId]: [...(prev[playerId] || []), {type: powerUpKey}]}));
        }
        if (mpRoomCode && mpSeats[playerId]) {
          setMpStudentNotifications(prev => ({
            ...prev,
            [playerId]: { id: String(Date.now()), title: powerUp.name, message: modalMessage, icon: powerUp.icon },
          }));
        }
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
              const isShielded = pActive.some(pu => pu.type === 'SHIELD');
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
              const isShielded = pActive.some(pu => pu.type === 'SHIELD');
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
    if (!player || player.money < POWERUP_COST) return; 
    const usage = (powerUpsUsedThisRound[playerId] || []).length;
    const playerActive = (activePowerUps[playerId] || []) as ActivePowerUp[];
    const hasPowerSurge = playerActive.some(pu => pu.type === 'POWER_SURGE');
    const limit = hasPowerSurge ? 3 : 1;
    if (usage >= limit) return;

    const isClozeRound = currentSentence?.questionType === 'multipleChoice' || currentSentence?.questionType === 'openCloze' || currentSentence?.questionType === 'wordFormation' || currentSentence?.questionType === 'keyWordTransformation';
    const drawablePool = availablePowerUps.filter(k => {
      if (isClozeRound && CLOZE_DISABLED_POWER_UPS.includes(k)) return false;
      if (!isClozeRound && BINARY_DISABLED_POWER_UPS.includes(k)) return false;
      if (!mpRoomCode && MP_ONLY_POWER_UPS.includes(k)) return false;
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
    handleBuyPowerUp(playerId, selectedPowerUp);
  }, [canPlayerAct, players, powerUpsUsedThisRound, activePowerUps, availablePowerUps, currentSentence, handleBuyPowerUp, mpRoomCode, mpSeats]);

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

  const handleApplySettingsImmediately = useCallback((newSettings: Settings) => {
    setSettings(newSettings);
    setNextRoundSettings(null);
    setShowSettingsModal(false);
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
    fetchNewSentence(newSettings, pastSentences, undefined, pastMistakes);
  }, [selectedPowerUps, pastSentences, pastMistakes, fetchNewSentence]);

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
    const isTargetShielded = !ignoresShield && targetActivePowerUps.some(pu => pu.type === 'SHIELD' || pu.type === 'GUARDIAN_ANGEL');
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
    const isOffensiveAttack = [
      'THE_PUNISHER',
      'PICKPOCKET',
      'SUB_ZERO',
      'BET_CAP',
      'HIGH_ROLLER',
      'HALF_BAKED',
      'SWAP',
      'CRUCIO',
      'SILENCER',
    ].includes(powerUpKey);
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
          if (qType === 'multipleChoice') {
            spySummary = tBet.selectedOption ? `"${tBet.selectedOption}"` : (tBet.splitOptions?.length ? `Split: ${tBet.splitOptions.join(' / ')}` : 'Undecided');
          } else if (qType === 'openCloze' || qType === 'wordFormation' || qType === 'keyWordTransformation') {
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

    playSound('powerUp');
    const finalMsg = customModalMessage || `${powerUpInfo.icon} Used ${powerUpInfo.name} on ${targetPlayer.name}: ${powerUpInfo.description}`;
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
    setShowPowerUpModal({
      title: targetHasBoomerang ? '🪃 Boomerang Reflected!' : powerUpInfo.name,
      message: finalMsg,
      icon: targetHasBoomerang ? '🪃' : powerUpInfo.icon,
    });
  }, [players, showTargetModal, activePowerUps, powerUpsUsedThisRound, playSound, mpRoomCode, mpSeats, bets, currentSentence]); 

  const handleCancelTargetModal = useCallback((overridePlayerId?: number, overridePowerUpKey?: PowerUpKey) => {
    const playerId = overridePlayerId ?? showTargetModal?.playerId;
    const powerUpKey = overridePowerUpKey ?? showTargetModal?.powerUp;
    if (playerId === undefined || !powerUpKey) return;
    if (powerUpKey === 'SWAP') return; // The Swap power-up cannot be refunded
    setPlayers(ps => ps.map(p => p.id === playerId ? { ...p, money: p.money + POWERUP_COST } : p));
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
    setRoundSpending(s => ({ ...s, [playerId]: Math.max(0, (s[playerId] || 0) - POWERUP_COST) }));
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
  }, [showTargetModal, playSound, mpRoomCode, mpSeats]);

  // --- Multiplayer Host Lifecycle & Intent Dispatcher ---
  useEffect(() => {
    mpEventHandlerRef.current = (event: HostEventPayload) => {
      if (event.type === 'STUDENT_JOINED' && event.seat) {
        const seat = event.seat;
        const { playerId, name, avatar } = seat;
        playSound('addPlayer');
        setPlayers(prev => {
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
              avatar: avatar || AVATARS[Math.floor(Math.random() * AVATARS.length)],
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
        setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, name: name || p.name, avatar: avatar || p.avatar } : p));
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
        setMpSeats(prev => {
          if (!prev[playerId]) return prev;
          return {
            ...prev,
            [playerId]: { ...prev[playerId], lastSeen: Date.now() },
          };
        });

        switch (intent.type) {
          case 'SET_BET': {
            handleBetChange(playerId, intent.field, intent.value);
            break;
          }
          case 'SET_FULL_BET': {
            const entries = Object.entries(intent.bet || {}) as [keyof Bet, any][];
            entries.forEach(([field, val]) => {
              handleBetChange(playerId, field, val, true);
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

            if (intent.bet) {
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
            const pendingKey = mpStudentPendingTarget[playerId] || intent.powerUp;
            if (pendingKey) {
              handleTargetedPowerUp(intent.targetId, playerId, pendingKey);
            }
            break;
          }
          case 'CANCEL_POWER_UP_TARGET': {
            const pendingKey = mpStudentPendingTarget[playerId] || intent.powerUp;
            if (pendingKey) {
              handleCancelTargetModal(playerId, pendingKey);
            }
            break;
          }
          case 'APPLY_WHEEL_RESULT': {
            if (mpStudentPendingWheel[playerId]) {
              const matchedItem = WHEEL_ITEMS.find(w => w.id === intent.itemId) || WHEEL_ITEMS[Math.floor(Math.random() * WHEEL_ITEMS.length)];
              playSound('powerUp');
              handleApplyWheelResult(playerId, matchedItem);
            }
            break;
          }
          case 'UPDATE_PROFILE': {
            if (intent.name?.trim()) handleUpdatePlayerName(playerId, intent.name.trim());
            if (intent.avatar) handleUpdateAvatar(playerId, intent.avatar);
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
  ]);

  const handleCreateMpRoom = useCallback(async () => {
    if (!desktopStatus.isDesktop && !GeminiService.isTeacherPinUnlocked()) {
      playSound('click');
      pendingCreateRoomAfterPinRef.current = true;
      setTeacherPinInput('');
      setNewTeacherPinInput('');
      setShowChangePinForm(false);
      setTeacherPinNotice({
        type: 'error',
        text: 'Teacher PIN required to host a Live Classroom Room (QR). Enter your PIN below to unlock.',
      });
      setShowTeacherPinModal(true);
      return;
    }
    await startHostMultiplayerRoom();
  }, [desktopStatus.isDesktop, playSound]);

  const handleCloseMpRoom = useCallback(() => {
    playSound('click');
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
    // Automatically lock Teacher PIN when closing the live room so students or subsequent sessions cannot re-host without the PIN
    GeminiService.clearSavedTeacherPin();
    setIsTeacherAiUnlocked(false);
    prefetchRef.current = null;
  }, [playSound]);

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

  // Cleanup multiplayer room controller on unmount
  useEffect(() => {
    return () => {
      mpControllerRef.current?.destroy();
    };
  }, []);

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
    });
    mpControllerRef.current.pushViews(views);
  }, [
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
      await Promise.all(
        Array.from(uniqueGroups.values()).map(async (group) => {
          try {
            const res = await GeminiService.verifyCorrection(
              currentSentence.text,
              group.rawText,
              currentSentence.correction
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
        })
      );
    }

    setProcessingStatus('');
    return verifications;
  }, [activePlayers, isPlayerFrozen, isTurnTimerEnabled, mpRoomCode, hasPlayerPlacedBet, bets, currentSentence, activePowerUps]);

  const handleRevealResults = useCallback(async () => {
    const unfrozenPlayers = activePlayers.filter(p => !isPlayerFrozen(p.id));
    const qType: QuestionType = currentSentence?.questionType || 'binary';

    if (mpRoomCode) {
      const allMpReady = unfrozenPlayers.every(p => {
        if (mpSeats[p.id]?.lockedIn) return true;
        const hasSplit = (activePowerUps[p.id] || []).some(pu => pu.type === 'SPLIT_BET');
        return isBetCompleteForQuestionType(bets[p.id], qType, hasSplit, currentSentence?.baseWord);
      });
      if (!allMpReady && !teacherRevealOverride) {
        setError({
          title: "Bets Not Locked In",
          message: "Every active player must lock in their wager before revealing results (or use Teacher Override)."
        });
        return;
      }
    } else if (isTurnTimerEnabled) {
      const allLocked = unfrozenPlayers.every(p => turnTimers[p.id]?.status === 'locked');
      if (!allLocked && !teacherRevealOverride) {
        setError({ title: "Turns Still Active", message: "Every active player's turn must be locked before revealing results (or use Teacher Override)." });
        return;
      }
    } else {
      let hasUnchangedBaseWordPlayer: string | null = null;
      let hasInvalidKwtPlayer: string | null = null;
      const baseNorm = qType === 'wordFormation' ? (currentSentence?.baseWord || '').trim().toLowerCase() : '';
      const allValidBetsFinalized = unfrozenPlayers.every(p => {
        const playerBet = bets[p.id];
        const hasValidBetAmount = typeof playerBet?.bet === 'number' && Number(playerBet.bet) >= 0;
        if (!hasValidBetAmount) return false;
        const hasSplitBet = (activePowerUps[p.id] || []).some(pu => pu.type === 'SPLIT_BET');
        if (qType === 'multipleChoice') {
          return hasSplitBet
            ? (playerBet?.splitOptions?.length ?? 0) >= 1
            : Boolean(playerBet?.selectedOption?.trim());
        }
        if (qType === 'openCloze' || qType === 'wordFormation') {
          if (hasSplitBet) {
            const w1 = (playerBet?.splitClozeAnswers?.[0] || '').trim().toLowerCase();
            const w2 = (playerBet?.splitClozeAnswers?.[1] || '').trim().toLowerCase();
            if (baseNorm && ((w1 && w1 === baseNorm) || (w2 && w2 === baseNorm))) {
              hasUnchangedBaseWordPlayer = p.name;
              return false;
            }
            return Boolean(w1 || w2);
          }
          const w = (playerBet?.clozeAnswer || '').trim().toLowerCase();
          if (baseNorm && w && w === baseNorm) {
            hasUnchangedBaseWordPlayer = p.name;
            return false;
          }
          return Boolean(w);
        }
        if (qType === 'keyWordTransformation') {
          const keyWord = currentSentence?.baseWord;
          if (hasSplitBet) {
            const w1 = (playerBet?.splitClozeAnswers?.[0] || '').trim();
            const w2 = (playerBet?.splitClozeAnswers?.[1] || '').trim();
            if (!w1 && !w2) return false;
            if ((w1 && !isValidKeyWordTransformationPhrase(w1, keyWord)) || (w2 && !isValidKeyWordTransformationPhrase(w2, keyWord))) {
              hasInvalidKwtPlayer = p.name;
              return false;
            }
            return true;
          }
          const w = (playerBet?.clozeAnswer || '').trim();
          if (!w) return false;
          if (!isValidKeyWordTransformationPhrase(w, keyWord)) {
            hasInvalidKwtPlayer = p.name;
            return false;
          }
          return true;
        }
        if (hasSplitBet) return true;
        return Boolean(playerBet?.opinion);
      });

      if (!allValidBetsFinalized && !teacherRevealOverride) { 
        const promptMsg = hasUnchangedBaseWordPlayer
          ? `${hasUnchangedBaseWordPlayer} typed the unchanged base word "(${(currentSentence?.baseWord || '').toUpperCase()})". Players must transform the base word into a new grammatical form before revealing results!`
          : hasInvalidKwtPlayer
            ? `${hasInvalidKwtPlayer}'s answer must use 2 to 6 words and include the exact unchanged KEY WORD "${(currentSentence?.baseWord || '').toUpperCase()}"!`
            : qType === 'multipleChoice'
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
      (isTurnTimerEnabled && !mpRoomCode) ? hasPlayerPlacedBet(p.id) : hasPlayerPlacedBet(p.id) || !teacherRevealOverride
    );

    playSound('flip');
    setIsProcessing(true);

    // 1. Binary mode correction verification
    const verifications = await verifyPlayerCorrections();

    // 2. Open Cloze, Word Formation & Key Word Transformation instant (0ms) + single batched AI verification
    const { acceptedSet, baseWordNorm } = buildAcceptedAnswerSet(currentSentence, qType);

    const clozeWordVerifications: Record<string, { isCorrect: boolean; marks?: 0 | 1 | 2; feedback: string }> = {};
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
          const norm = (rawWord || '').trim().toLowerCase();
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
            clozeWordVerifications[wordKey.trim().toLowerCase()] = res;
          });
        } catch (err) {
          console.error("Failed batched cloze verification:", err);
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
          const norm = (rawPhrase || '').trim().toLowerCase().replace(/\s+/g, ' ');
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
          // If deterministic check gave < 2 marks (and didn't fail the mandatory key-word/word-count check), consult AI Judge for valid alternative phrasing
          const hasValidKeyAndCount = isValidKeyWordTransformationPhrase(rawPhrase, currentSentence.baseWord);
          if (detResult.marks < 2 && hasValidKeyAndCount) {
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
            const normKey = phraseKey.trim().toLowerCase().replace(/\s+/g, ' ');
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
        }
      }
    }

    setProcessingStatus('Calculating results...');
    const settlement = settleRound({
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
      teacherRevealOverride,
      hasPlayerPlacedBet,
      currentRound,
      roundSpending,
    });
    settlement.sounds.forEach(({ sound, index }) => playSound(sound, index));
    const updatedPlayers = settlement.updatedPlayers;
    const newRoundResultsData = settlement.roundResults;
    const newRoundPlayerResults = settlement.playerResults;

    setPlayers(updatedPlayers);
    setRoundResults(newRoundResultsData);
    if (currentSentence) {
      const historyRecord: RoundHistoryRecord = {
        round: currentRound,
        sentence: currentSentence,
        topic: settings.topic === 'Custom' ? customTopic : settings.topic,
        level: settings.level,
        theme: settings.theme === 'Custom' ? customTheme : settings.theme,
        playerResults: newRoundPlayerResults,
        timestamp: Date.now(),
      };
      setRoundHistory(prev => [...prev, historyRecord]);
    }
    setIsProcessing(false);
    setProcessingStatus('');
    setStep('RESULTS');
  }, [activePlayers, isPlayerFrozen, mpRoomCode, mpSeats, isTurnTimerEnabled, turnTimers, teacherRevealOverride, hasPlayerPlacedBet, bets, currentSentence, players, activePowerUps, playSound, verifyPlayerCorrections, roundSpending, currentRound, settings, customTopic, customTheme]);
  
  const handleNextRound = useCallback(() => {
    const stillActivePlayers = players.filter(p => p.money > 0);
    const numTotalRounds = typeof totalRounds === 'string' ? parseInt(totalRounds,10) : totalRounds;
    const numTargetAmount = typeof targetAmount === 'string' ? parseInt(targetAmount, 10) : targetAmount;
    
    // In Multiplayer Classroom Mode, bankrupt players receive an automatic $150 House Bailout ONLY in Fixed Rounds or Target Bankroll modes (never in High-Roller Survival)
    const isBailoutEnabled = Boolean(mpRoomCode) && gameMode !== 'lastPlayer';
    const isRoundLimitReached = gameMode === 'rounds' && currentRound >= numTotalRounds;
    const hasTargetWinner = gameMode === 'targetAmount' && stillActivePlayers.some(p => p.money >= numTargetAmount);
    const isMultiplayerWinner = !isBailoutEnabled && players.length > 1 && stillActivePlayers.length <= 1;
    const isAllBankruptGameOver = !isBailoutEnabled && stillActivePlayers.length === 0;
    const isGameOver = isRoundLimitReached || hasTargetWinner || isMultiplayerWinner || isAllBankruptGameOver;

    if (isGameOver) {
        playSound('gameOver');
        let finalWinnerPlayer: Player | null = null;
        const pool = stillActivePlayers.length > 0 ? stillActivePlayers : players;
        if (gameMode === 'targetAmount' && stillActivePlayers.some(p => p.money >= numTargetAmount)) {
            const qualifiers = stillActivePlayers.filter(p => p.money >= numTargetAmount).sort((a, b) => b.money - a.money);
            finalWinnerPlayer = qualifiers[0];
            if (qualifiers.length > 1 && qualifiers[1].money === finalWinnerPlayer.money) {
                finalWinnerPlayer = null; // Tied
            }
        } else if (stillActivePlayers.length === 1 && !isBailoutEnabled) {
            finalWinnerPlayer = stillActivePlayers[0];
        } else if (pool.length >= 1 && isRoundLimitReached) {
             const sortedPlayers = [...pool].sort((a,b) => b.money - a.money);
             finalWinnerPlayer = sortedPlayers[0]; 
             if (sortedPlayers.length > 1 && sortedPlayers[1].money === finalWinnerPlayer.money) finalWinnerPlayer = null; 
        } else if (stillActivePlayers.length === 0) finalWinnerPlayer = null;
        setWinner(finalWinnerPlayer);
        // Automatically lock Live Mode when the game finishes so starting a new live game requires the Teacher PIN
        GeminiService.clearSavedTeacherPin();
        setIsTeacherAiUnlocked(false);
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
  }, [players, gameMode, currentRound, totalRounds, targetAmount, settings, nextRoundSettings, fetchNewSentence, playSound, selectedPowerUps, pastSentences, pastMistakes, mpRoomCode, mpSeats]);

  const handleEndGameEarly = useCallback(() => {
    playSound('gameOver');
    const stillActivePlayers = players.filter(p => p.money > 0);
    const numTargetAmount = typeof targetAmount === 'string' ? parseInt(targetAmount, 10) : targetAmount;
    let finalWinnerPlayer: Player | null = null;
    if (gameMode === 'targetAmount' && stillActivePlayers.some(p => p.money >= numTargetAmount)) {
      const qualifiers = stillActivePlayers.filter(p => p.money >= numTargetAmount).sort((a, b) => b.money - a.money);
      finalWinnerPlayer = qualifiers[0];
      if (qualifiers.length > 1 && qualifiers[1].money === finalWinnerPlayer.money) finalWinnerPlayer = null;
    } else if (stillActivePlayers.length === 1) {
        finalWinnerPlayer = stillActivePlayers[0];
    } else if (stillActivePlayers.length > 1) {
         const sortedPlayers = [...stillActivePlayers].sort((a,b) => b.money - a.money);
         finalWinnerPlayer = sortedPlayers[0]; 
         if (sortedPlayers.length > 1 && sortedPlayers[1].money === finalWinnerPlayer.money) finalWinnerPlayer = null; 
    }
    setWinner(finalWinnerPlayer);
    // Automatically lock Live Mode when the game ends early so starting a new live game requires the Teacher PIN
    GeminiService.clearSavedTeacherPin();
    setIsTeacherAiUnlocked(false);
    prefetchRef.current = null;
    setStep('GAME_OVER');
  }, [players, gameMode, targetAmount, playSound]);

  const handleRestartGame = useCallback(() => {
    localStorage.removeItem(LOCAL_STORAGE_KEY); 
    GeminiService.clearPortableGame();
    // Automatically close any open multiplayer room and lock Teacher PIN on restart / returning to lobby
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
    GeminiService.clearSavedTeacherPin();
    setIsTeacherAiUnlocked(false);
    setStep('PLAYER_SETUP');
    setSettingsPart(1);
    prefetchRef.current = null;
    setPlayers([]);
    setNewPlayerName('');
    setSentenceBatch([]);
    setSettings({
      topic: GRAMMAR_TOPICS[0],
      level: CEFR_LEVELS[2],
      theme: THEMES[0],
      challengeFormat: 'binary',
      mixedFormats: ALL_QUESTION_TYPES,
    });
    setMixedFormatSetupWarning(null);
    mixedFormatIndexRef.current = 0;
    setCustomTopic('');
    setCustomTheme('');
    setGameMode('lastPlayer');
    setTotalRounds(10);
    setTargetAmount(DEFAULT_TARGET_AMOUNT);
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
    setSelectedPowerUps(Object.keys(POWER_UPS) as PowerUpKey[]); 
    setNextRoundSettings(null);
    setRoundSpending({});
    setSimplifiedExplanation({ text: null, loading: false });
    setStartingCash(INITIAL_PLAYER_MONEY);
    setIsEditingStartingCash(false);
    setTempStartingCash(String(INITIAL_PLAYER_MONEY));
    setTurnTimerSeconds(0);
    setTurnTimers({});
    setTeacherRevealOverride(false);
    setAutoStartNextTimer(true);
    if (playerNameInputRef.current) playerNameInputRef.current.focus();
  }, [playSound]);

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
      const parsed = pendingLoadGame;
      if (parsed.players) {
        parsed.players = parsed.players.map((p: any) => ({
            ...p,
            avatar: p.avatar || AVATARS[Math.floor(Math.random() * AVATARS.length)],
            winStreak: p.winStreak || 0,
            effects: p.effects || []
        }));
      }
      if (parsed.powerUpsUsedThisRound) {
        const fixedPowerUps: Record<number, UsedPowerUp[]> = {};
        Object.keys(parsed.powerUpsUsedThisRound).forEach(k => {
            const key = Number(k);
            const val = parsed.powerUpsUsedThisRound[key];
            if (Array.isArray(val)) {
                 if (val.length > 0 && typeof val[0] === 'string') {
                     fixedPowerUps[key] = val.map((p: string) => ({ key: p as PowerUpKey }));
                 } else {
                     fixedPowerUps[key] = val; 
                 }
            } else {
                 fixedPowerUps[key] = [];
            }
        });
        parsed.powerUpsUsedThisRound = fixedPowerUps;
      }
      
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
      avatar: s.avatar || '🎰',
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
    return {
      step, players, settings, nextRoundSettings, customTopic, customTheme, gameMode, totalRounds, targetAmount,
      currentRound, currentSentence, pastSentences, pastMistakes, bets, hints, roundResults, winner,
      powerUpsUsedThisRound, activePowerUps, highlightedPhrase, availablePowerUps, selectedPowerUps, roundSpending,
      sentenceBatch, roundHistory, startingCash, turnTimerSeconds, turnTimers, teacherRevealOverride, autoStartNextTimer
    };
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
        setTimeout(() => setIsCopied(false), 2000);
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
        case 'PLAYER_SETUP': return ( 
          <div className="w-full max-w-4xl text-center p-4 animate-fade-in"> 
            {/* Ornate Monte Carlo Casino Crest & Header */}
            <div className="flex flex-col items-center mb-8">
              <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full bg-amber-500/10 dark:bg-black/40 border border-[#d4af37]/40 mb-4 shadow-sm">
                <span className="text-[#d4af37] text-xs tracking-widest">♠ ♥</span>
                <span className="text-[11px] font-serif uppercase tracking-[0.3em] text-amber-800 dark:text-[#fef08a] font-bold">
                  Salon Privé · Est. Monte Carlo
                </span>
                <span className="text-[#d4af37] text-xs tracking-widest">♦ ♣</span>
              </div>

              <h1 className="text-5xl sm:text-6xl md:text-7xl font-black text-gold mb-3 title-glow tracking-wider font-display">
                GRAMMAR CASINO
              </h1> 

              <div className="flex items-center justify-center gap-3 w-full max-w-lg my-1">
                <div className="h-[1px] bg-gradient-to-r from-transparent via-[#d4af37] to-[#d4af37] flex-1 opacity-70"></div>
                <span className="text-[#d4af37] text-sm select-none">❖</span>
                <div className="h-[1px] bg-gradient-to-l from-transparent via-[#d4af37] to-[#d4af37] flex-1 opacity-70"></div>
              </div>

              <p className="text-xs sm:text-sm md:text-base text-amber-900/80 dark:text-amber-200/85 mt-2 font-serif uppercase tracking-[0.25em] font-semibold">
                Bet Your Knowledge &middot; Risk Your Stack &middot; Master English
              </p>
            </div>
            
            {/* VIP Table Guest Registry */}
            <div className="glass-panel rounded-2xl p-6 sm:p-8 relative mb-8 text-left overflow-hidden">
              {/* Decorative Corner Brass Brackets */}
              <div className="pointer-events-none absolute top-2.5 left-2.5 w-4 h-4 border-t-2 border-l-2 border-[#d4af37]/50 rounded-tl-sm" />
              <div className="pointer-events-none absolute top-2.5 right-2.5 w-4 h-4 border-t-2 border-r-2 border-[#d4af37]/50 rounded-tr-sm" />
              <div className="pointer-events-none absolute bottom-2.5 left-2.5 w-4 h-4 border-b-2 border-l-2 border-[#d4af37]/50 rounded-bl-sm" />
              <div className="pointer-events-none absolute bottom-2.5 right-2.5 w-4 h-4 border-b-2 border-r-2 border-[#d4af37]/50 rounded-br-sm" />

              {/* Registry Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-6 border-b border-[#d4af37]/30">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-[#d4af37]/15 border border-[#d4af37]/40 flex items-center justify-center text-amber-700 dark:text-[#fef08a] text-sm font-serif font-bold">
                    ♠
                  </span>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg sm:text-xl font-serif font-extrabold uppercase tracking-widest text-slate-900 dark:text-amber-50">
                        VIP Table Registry
                      </h2>
                      {activeCloudRoster && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono-casino font-extrabold bg-amber-500/20 text-amber-800 dark:text-[#fef08a] border border-[#d4af37]/50">
                          ☁️ {activeCloudRoster.className}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-amber-200/60">
                      Register solo, load a Cloud Class Roster, or gather seats around the baize
                    </p>
                  </div>
                </div>

                {isEditingStartingCash ? (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl felt-well border-[#d4af37]">
                    <PokerChip denomination={100} size="xs" />
                    <div className="text-left">
                      <div className="text-[9px] font-serif uppercase tracking-widest text-slate-500 dark:text-amber-200/60">Starting Stack</div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-mono-casino font-extrabold text-amber-800 dark:text-[#fef08a]">$</span>
                        <input
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
                          className="w-20 text-xs font-mono-casino font-extrabold text-amber-900 dark:text-[#fef08a] bg-transparent border-b border-[#d4af37] focus:outline-none"
                        />
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSaveStartingCash();
                          }}
                          className="w-5 h-5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] flex items-center justify-center cursor-pointer font-bold"
                          title="Save starting cash"
                        >
                          ✓
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      playSound('click');
                      setTempStartingCash(String(startingCash));
                      setIsEditingStartingCash(true);
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl felt-well hover:border-[#d4af37] transition-all cursor-pointer group/stack"
                    title="Click to edit starting cash"
                  >
                    <PokerChip denomination={100} size="xs" as="div" />
                    <div className="text-left">
                      <div className="text-[9px] font-serif uppercase tracking-widest text-slate-500 dark:text-amber-200/60 flex items-center gap-1">
                        <span>Starting Stack</span>
                        <span className="opacity-0 group-hover/stack:opacity-100 transition-opacity text-amber-600 dark:text-amber-400">✏️</span>
                      </div>
                      <div className="text-xs font-mono-casino font-extrabold text-amber-800 dark:text-[#fef08a]">
                        ${startingCash.toLocaleString()}
                      </div>
                    </div>
                  </button>
                )}
              </div>

              {/* Live Classroom Multiplayer Bar */}
              <div className="mb-5 p-3.5 rounded-xl bg-gradient-to-r from-emerald-950/10 via-amber-500/10 to-emerald-950/10 dark:from-[#062415] dark:via-[#0b351f] dark:to-[#062415] border border-[#d4af37]/40 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-xl bg-[#d4af37]/20 border border-[#d4af37]/50 flex items-center justify-center text-lg shrink-0">
                    📱
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs sm:text-sm font-serif font-extrabold uppercase tracking-wider text-slate-900 dark:text-[#fef08a]">
                        Live Classroom Multiplayer
                      </span>
                      {mpRoomCode && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono-casino font-extrabold bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-500/40">
                          ROOM {mpRoomCode} · {Object.values(mpSeats).filter((s: MultiplayerSeat) => s.connected).length} ONLINE
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-amber-100/70">
                      {mpRoomCode
                        ? 'Students can scan the QR code or enter the room code on their phones to claim a seat.'
                        : 'Let students join from their phones via QR code or 4-letter Room Code — or play on this screen.'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {mpRoomCode ? (
                    <button
                      type="button"
                      onClick={() => {
                        playSound('click');
                        setShowMpLobbyModal(true);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-gradient-to-b from-[#fef08a] via-[#eab308] to-[#a16207] text-[#1c0a04] font-serif font-extrabold uppercase tracking-wider text-xs border border-[#fef9c3] shadow cursor-pointer hover:brightness-105 transition-all flex items-center gap-1.5"
                    >
                      <span>📡</span>
                      <span>Show QR &amp; Room ({mpRoomCode})</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleCreateMpRoom}
                      className="px-3.5 py-2 rounded-xl bg-gradient-to-b from-[#fef08a] via-[#eab308] to-[#a16207] text-[#1c0a04] font-serif font-extrabold uppercase tracking-wider text-xs border border-[#fef9c3] shadow cursor-pointer hover:brightness-105 transition-all flex items-center gap-1.5"
                      title={
                        isTeacherAiUnlocked || desktopStatus.isDesktop
                          ? 'Open a Live Classroom Room with QR Code'
                          : 'Teacher PIN required to host a Live Classroom Room'
                      }
                    >
                      <span>{isTeacherAiUnlocked || desktopStatus.isDesktop ? '📱' : '🔒'}</span>
                      <span>{isTeacherAiUnlocked || desktopStatus.isDesktop ? 'Open Live Room (QR)' : 'Open Live Room (PIN)'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      playSound('click');
                      setIsStudentControllerMode(true);
                    }}
                    className="px-3 py-2 rounded-xl felt-well border border-[#d4af37]/50 hover:border-[#d4af37] text-amber-900 dark:text-[#fef08a] font-serif font-bold uppercase tracking-wider text-xs cursor-pointer transition-all flex items-center gap-1.5"
                    title="Join an existing room as a student controller"
                  >
                    <span>🎮</span>
                    <span>Join Room</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenCloudModal('rosters')}
                    className="px-3 py-2 rounded-xl felt-well border border-[#d4af37]/50 hover:border-[#d4af37] text-amber-900 dark:text-[#fef08a] font-serif font-bold uppercase tracking-wider text-xs cursor-pointer transition-all flex items-center gap-1.5"
                    title="Open Cloud Classroom Rosters, Session Reports & Cloud Sentence Bank"
                  >
                    <span>☁️</span>
                    <span>Cloud Rosters</span>
                  </button>
                </div>
              </div>

              {/* Add Player Input Row */}
              <div className="flex flex-col sm:flex-row gap-3 mb-6"> 
                <TextInput
                  ref={playerNameInputRef}
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  onKeyDown={handlePlayerNameKeyDown}
                  placeholder="Enter High-Roller's name..."
                  className="text-lg h-14 flex-1"
                /> 
                <ActionButton
                  onClick={handleAddPlayer}
                  playSound={playSound}
                  variant="outline-green"
                  className="flex items-center justify-center gap-2 px-8 h-14 text-sm sm:text-base shrink-0"
                >
                  <span>+ Seat Player</span>
                </ActionButton> 
              </div> 
              
              {/* Seated Players Grid */}
              <div className="min-h-[88px]"> 
                {players.length === 0 ? (
                  <div className="felt-well rounded-xl p-6 text-center flex flex-col items-center justify-center gap-2">
                    <div className="text-2xl opacity-60 select-none">🃏</div>
                    <div className="text-slate-600 dark:text-amber-100/70 font-editorial italic text-base">
                      The velvet seats are open. Enter a player name above or open a Live Room so students can join from their phones.
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {players.map((player, index) => {
                      const mpSeat = mpSeats[player.id];
                      return ( 
                      <div
                        key={player.id}
                        className="felt-well rounded-xl p-3 flex items-center justify-between gap-3 group hover:border-[#d4af37]/70 transition-all"
                      > 
                        <div className="flex items-center gap-3 min-w-0">
                          <button 
                            type="button"
                            onClick={() => handleOpenAvatarModal(player.id)} 
                            className="w-11 h-11 rounded-full border-2 border-[#d4af37] bg-gradient-to-b from-amber-50 to-amber-100 dark:from-[#0d3520] dark:to-[#04150c] flex items-center justify-center text-2xl hover:scale-110 transition-transform cursor-pointer focus:outline-none shadow-md shrink-0 relative"
                            title="Change Avatar"
                          >
                            {player.avatar}
                            {mpSeat && (
                              <span
                                className={`w-3 h-3 rounded-full border-2 border-white dark:border-[#04150c] absolute -bottom-0.5 -right-0.5 ${
                                  mpSeat.connected ? 'bg-emerald-500' : 'bg-amber-500'
                                }`}
                                title={mpSeat.connected ? 'Connected via Mobile' : 'Mobile Disconnected'}
                              />
                            )}
                          </button> 
                          <div className="min-w-0">
                            <div className="text-[9px] font-mono-casino uppercase tracking-widest text-amber-800/70 dark:text-[#d4af37]/80 flex items-center gap-1">
                              <span>Seat #{index + 1} &middot; ${player.money.toLocaleString()}</span>
                              {mpSeat && (
                                <span className="text-[8px] px-1 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                                  📱
                                </span>
                              )}
                            </div>
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
                                className="text-slate-900 dark:text-white font-serif uppercase tracking-wider text-sm font-bold bg-transparent border-b border-[#d4af37] focus:outline-none w-28"
                              />
                            ) : (
                              <div 
                                onClick={() => {
                                  setEditingPlayerIdInSetup(player.id);
                                  setEditingPlayerNameInSetup(player.name);
                                }}
                                className="text-slate-900 dark:text-amber-50 font-serif uppercase tracking-wider text-sm font-extrabold cursor-pointer hover:text-amber-700 dark:hover:text-[#fef08a] flex items-center gap-1.5 group/name truncate"
                                title="Click to edit name"
                              >
                                <span className="truncate">{player.name}</span>
                                <span className="text-[10px] opacity-0 group-hover/name:opacity-100 text-amber-600 dark:text-amber-400 shrink-0">✏️</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => mpSeat ? handleKickMpPlayer(player.id) : handleDeletePlayer(player.id)}
                          className="w-7 h-7 rounded-full border border-rose-500/30 hover:border-rose-500 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center text-base transition-colors cursor-pointer shrink-0"
                          title="Remove Seat"
                        >
                          &times;
                        </button> 
                      </div> 
                    );
                    })}
                  </div>
                )} 
              </div> 
            </div> 

            <div className="flex flex-wrap justify-center items-center gap-4">
              <ActionButton
                onClick={handleStartGame}
                playSound={playSound}
                variant="gold"
                className="text-base sm:text-lg py-4 px-12 tracking-[0.15em]"
                disabled={players.length === 0}
              >
                ENTER SALON &amp; TABLE SETUP &rarr;
              </ActionButton> 
              <ActionButton
                onClick={handleLoadGameClick}
                playSound={playSound}
                variant="outline-gold"
                className="text-sm py-4 px-5 flex items-center gap-2"
                title="Load Saved Game File (.json)"
              >
                <span>📂</span>
                <span className="hidden sm:inline">Load File</span>
              </ActionButton>
              <ActionButton
                onClick={() => handleOpenCloudModal('rosters')}
                playSound={playSound}
                variant="outline-gold"
                className="text-sm py-4 px-5 flex items-center gap-2"
                title="Open Cloud Rosters, Saved Sessions & Sentence Bank"
              >
                <span>☁️</span>
                <span className="hidden sm:inline">Cloud Vault</span>
              </ActionButton>
            </div>
          </div> 
        );
        case 'SETTINGS': {
          const resolvedTopicPreview = settings.topic === "My own choice" ? (customTopic.trim() || "Custom Topic") : settings.topic;
          const resolvedThemePreview = settings.theme === "Custom ✍️" ? (customTheme.trim() || "Custom Theme") : settings.theme;
          const currentFormatObj = CHALLENGE_FORMATS.find(f => f.id === (settings.challengeFormat || 'binary')) || CHALLENGE_FORMATS[0];

          return ( 
          <div className="w-full max-w-4xl text-center animate-fade-in p-4"> 
            <div className="flex flex-col items-center mb-6">
              <div className="text-xs font-serif uppercase tracking-[0.3em] text-amber-800 dark:text-[#d4af37] mb-1 font-bold">
                Croupier's Charter · Step {settingsPart} of 2
              </div>
              <h2 className="text-3xl sm:text-5xl font-black text-gold tracking-widest uppercase title-glow font-display">
                Table Configuration
              </h2> 
              <div className="h-[1px] w-48 bg-gradient-to-r from-transparent via-[#d4af37] to-transparent mt-3 opacity-70" />

              {/* Two-Part Stepper Bar */}
              <div className="mt-5 inline-flex items-center p-1.5 rounded-2xl felt-well border border-[#d4af37]/40 gap-2 max-w-full">
                <button
                  type="button"
                  onClick={() => {
                    if (settingsPart !== 1) {
                      playSound('click');
                      setSettingsPart(1);
                    }
                  }}
                  className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-serif font-extrabold uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                    settingsPart === 1
                      ? 'bg-gradient-to-b from-[#fef08a] via-[#eab308] to-[#a16207] text-[#1c0a04] shadow-[0_4px_14px_rgba(202,138,4,0.35)]'
                      : 'text-slate-700 dark:text-amber-100/80 hover:text-amber-900 dark:hover:text-[#fef08a]'
                  }`}
                >
                  <span className="w-5 h-5 rounded-full bg-black/20 flex items-center justify-center text-[11px] font-mono-casino">1</span>
                  <span>Linguistic Setup</span>
                </button>
                <span className="text-[#d4af37]/60 font-serif text-sm select-none">&rarr;</span>
                <button
                  type="button"
                  onClick={() => {
                    if (settingsPart !== 2) {
                      handleAdvanceToSettingsPart2();
                    }
                  }}
                  className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-serif font-extrabold uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                    settingsPart === 2
                      ? 'bg-gradient-to-b from-[#fef08a] via-[#eab308] to-[#a16207] text-[#1c0a04] shadow-[0_4px_14px_rgba(202,138,4,0.35)]'
                      : 'text-slate-700 dark:text-amber-100/80 hover:text-amber-900 dark:hover:text-[#fef08a]'
                  }`}
                >
                  <span className="w-5 h-5 rounded-full bg-black/20 flex items-center justify-center text-[11px] font-mono-casino">2</span>
                  <span>House Rules &amp; Power-Ups</span>
                </button>
              </div>
            </div>

            {settingsPart === 1 ? (
              <>
                <div className="space-y-8 glass-panel p-6 sm:p-9 rounded-2xl relative animate-fade-in">
                  {[
                    { title: "I. Language Domain", subtitle: "Choose a grammar rule, collocations, or a custom lexical topic for the shoe", items: GRAMMAR_TOPICS, settingKey: 'topic', customKey: 'customTopic', customValue: customTopic, setCustomValue: setCustomTopic, customPlaceholder: "Enter custom lexical or grammar topic (e.g., School Subjects, Places in Town, Inversion)..." },
                    { title: "II. Stakes & Proficiency (CEFR)", subtitle: "Select syntactic complexity and mistake subtlety", items: CEFR_LEVELS, settingKey: 'level' },
                    { title: "III. Salon Atmosphere & Theme", subtitle: "Flavor the AI-generated narratives", items: THEMES, settingKey: 'theme', customKey: 'customTheme', customValue: customTheme, setCustomValue: setCustomTheme, customPlaceholder: "Enter custom narrative theme..." }
                  ].map(section => (
                    <div key={section.title} className="text-left">
                      <div className="mb-3.5 border-l-4 border-[#d4af37] pl-3.5">
                        <h3 className="text-lg sm:text-xl font-serif text-slate-900 dark:text-[#fef08a] font-extrabold uppercase tracking-wider">
                          {section.title}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-amber-200/60">{section.subtitle}</p>
                      </div>

                      <div className={`grid grid-cols-2 ${section.items.length === 6 ? 'sm:grid-cols-3 md:grid-cols-6' : section.items.length === 9 ? 'sm:grid-cols-3' : section.items.length > 6 ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-2.5 sm:gap-3`}>
                        {section.items.map(item => {
                          const isActive = settings[section.settingKey as keyof Settings] === item;
                          return (
                            <button
                              key={item}
                              onClick={() => { playSound('click'); setSettings(s => ({...s, [section.settingKey]: item})); }} 
                              className={`p-3 rounded-xl transition-all duration-200 text-xs sm:text-sm font-serif border cursor-pointer relative overflow-hidden ${
                                isActive
                                  ? 'bg-gradient-to-b from-[#fef08a] via-[#eab308] to-[#a16207] text-[#1c0a04] border-[#fef9c3] shadow-[0_6px_18px_rgba(202,138,4,0.4),inset_0_1px_0_rgba(255,255,255,0.8)] font-extrabold scale-[1.02]'
                                  : 'felt-well text-slate-800 dark:text-amber-50/90 hover:border-[#d4af37] hover:bg-amber-500/10'
                              }`}
                            >
                              {item}
                            </button>
                          );
                        })}
                      </div>

                      {section.settingKey === 'level' && CEFR_DIFFICULTY_PROFILES[settings.level] && (
                        <div className="mt-3.5 p-4 rounded-xl felt-well text-xs space-y-1.5 animate-fade-in">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="font-mono-casino font-bold px-2.5 py-0.5 rounded-full text-[11px] bg-[#d4af37]/20 border border-[#d4af37]/50 text-amber-950 dark:text-[#fef08a]">
                              {settings.level} — {CEFR_DIFFICULTY_PROFILES[settings.level]?.title}
                            </span>
                            <span className="text-[11px] text-amber-800/80 dark:text-[#d4af37] font-serif uppercase tracking-widest">
                              Croupier's Briefing
                            </span>
                          </div>
                          <div className="text-slate-700 dark:text-slate-300">
                            <strong className="text-slate-900 dark:text-amber-100">Syntax &amp; Structure:</strong> {CEFR_DIFFICULTY_PROFILES[settings.level]?.syntax}
                          </div>
                          <div className="text-slate-700 dark:text-slate-300">
                            <strong className="text-slate-900 dark:text-amber-100">Lexis &amp; Register:</strong> {CEFR_DIFFICULTY_PROFILES[settings.level]?.lexis}
                          </div>
                          <div className="text-amber-900 dark:text-amber-300 font-medium">
                            <strong className="text-amber-950 dark:text-[#fef08a]">Mistake Spotting:</strong> {CEFR_DIFFICULTY_PROFILES[settings.level]?.mistakeIdentification}
                          </div>
                        </div>
                      )}
                      {section.customKey && settings[section.settingKey as keyof Settings] === (section.settingKey === 'topic' ? "My own choice" : "Custom ✍️") && (
                        <div className="mt-3.5 space-y-2.5 animate-fade-in">
                          <TextInput value={section.customValue || ""} onChange={e => section.setCustomValue!(e.target.value)} placeholder={section.customPlaceholder} />
                          {section.settingKey === 'topic' && (
                            <div className="p-3 rounded-xl felt-well flex flex-wrap items-center gap-1.5">
                              <span className="text-[11px] font-serif uppercase tracking-wider text-amber-800 dark:text-[#fef08a] font-bold mr-1">
                                Quick Lexical Topics:
                              </span>
                              {QUICK_LEXICAL_TOPICS.map(lex => {
                                const isPicked = (section.customValue || '').trim().toLowerCase() === lex.toLowerCase();
                                return (
                                  <button
                                    key={lex}
                                    type="button"
                                    onClick={() => {
                                      playSound('click');
                                      section.setCustomValue!(lex);
                                    }}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-serif transition-all cursor-pointer border ${
                                      isPicked
                                        ? 'bg-gradient-to-b from-[#fef08a] via-[#eab308] to-[#a16207] text-[#1c0a04] border-[#fef9c3] font-extrabold shadow-sm'
                                        : 'bg-white/70 dark:bg-black/30 text-slate-800 dark:text-amber-100/85 border-[#d4af37]/40 hover:border-[#d4af37]'
                                    }`}
                                  >
                                    {lex}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* IV. Challenge Format Selector */}
                  <div className="text-left border-t border-[#d4af37]/25 pt-6">
                    <div className="mb-3.5 border-l-4 border-emerald-400 pl-3.5">
                      <h3 className="text-lg sm:text-xl font-serif text-slate-900 dark:text-[#fef08a] font-extrabold uppercase tracking-wider">
                        IV. Challenge Format
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-amber-200/60">
                        Choose how players evaluate each sentence (can also be switched mid-game between hands!)
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {CHALLENGE_FORMATS.map(fmt => {
                        const currentFormat: ChallengeFormat = settings.challengeFormat || 'binary';
                        const isSelected = currentFormat === fmt.id;
                        return (
                          <button
                            key={fmt.id}
                            type="button"
                            onClick={() => {
                              playSound('click');
                              setMixedFormatSetupWarning(null);
                              setSettings(s => ({
                                ...s,
                                challengeFormat: fmt.id,
                                mixedFormats: getEffectiveMixedFormats(s.mixedFormats),
                              }));
                            }}
                            className={`p-4 rounded-xl border-2 text-left transition-all duration-200 cursor-pointer flex items-start gap-3.5 ${
                              isSelected
                                ? 'bg-gradient-to-b from-[#fef08a] via-[#eab308] to-[#a16207] text-[#1c0a04] border-[#fef9c3] shadow-[0_6px_18px_rgba(202,138,4,0.4),inset_0_1px_0_rgba(255,255,255,0.8)] scale-[1.01]'
                                : 'felt-well text-slate-800 dark:text-amber-50/90 hover:border-[#d4af37] hover:bg-amber-500/10'
                            }`}
                          >
                            <span className="text-2xl sm:text-3xl select-none shrink-0 mt-0.5">{fmt.icon}</span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-serif font-extrabold text-sm sm:text-base uppercase tracking-wider">
                                  {fmt.label}
                                </span>
                                {isSelected && (
                                  <span className="text-[10px] font-mono-casino font-black uppercase px-2 py-0.5 rounded-full bg-black/20 text-[#1c0a04]">
                                    Active
                                  </span>
                                )}
                              </div>
                              <p className={`text-xs mt-1 leading-relaxed ${isSelected ? 'text-[#1c0a04]/85 font-medium' : 'text-slate-500 dark:text-amber-200/70'}`}>
                                {fmt.subtitle}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Customizable Mixed Shoe Format Selector */}
                    {settings.challengeFormat === 'mixed' && (() => {
                      const activeMixed = getEffectiveMixedFormats(settings.mixedFormats);
                      const toggleMixedItem = (qType: QuestionType) => {
                        const isIncluded = activeMixed.includes(qType);
                        if (isIncluded) {
                          if (activeMixed.length <= 1) {
                            playSound('error');
                            setMixedFormatSetupWarning('At least 1 challenge format must remain active in the Mixed Shoe.');
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
                        <div className="mt-4 p-4 sm:p-5 rounded-xl felt-well border-2 border-[#d4af37]/60 space-y-3 animate-fade-in">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="text-xs sm:text-sm font-serif font-extrabold uppercase tracking-wider text-amber-900 dark:text-[#fef08a] flex items-center gap-2">
                                <span>🎛️</span>
                                <span>Customize Mixed Shoe Challenges</span>
                                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono-casino font-bold bg-[#d4af37]/20 border border-[#d4af37]/50 text-amber-950 dark:text-[#fef08a]">
                                  {activeMixed.length} of 5 Selected
                                </span>
                              </div>
                              <p className="text-xs text-slate-600 dark:text-amber-200/75 mt-0.5">
                                Toggle which of the 5 challenge formats are dealt in the Mixed Shoe rotation:
                              </p>
                            </div>
                            {activeMixed.length < 5 && (
                              <button
                                type="button"
                                onClick={() => {
                                  playSound('click');
                                  setMixedFormatSetupWarning(null);
                                  setSettings(s => ({ ...s, mixedFormats: ALL_QUESTION_TYPES }));
                                }}
                                className="px-3 py-1.5 rounded-lg text-xs font-serif font-bold uppercase tracking-wider bg-amber-500/20 hover:bg-amber-500/30 border border-[#d4af37]/60 text-amber-950 dark:text-[#fef08a] transition-all cursor-pointer"
                              >
                                Select All 5
                              </button>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5">
                            {CHALLENGE_FORMATS.filter((c): c is typeof CHALLENGE_FORMATS[number] & { id: QuestionType } => c.id !== 'mixed').map(subFmt => {
                              const isChecked = activeMixed.includes(subFmt.id);
                              return (
                                <button
                                  key={subFmt.id}
                                  type="button"
                                  onClick={() => toggleMixedItem(subFmt.id)}
                                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                                    isChecked
                                      ? 'bg-emerald-500/20 dark:bg-emerald-950/60 border-emerald-400 text-slate-900 dark:text-emerald-100 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                                      : 'bg-white/50 dark:bg-black/30 border-slate-300/60 dark:border-slate-800 text-slate-500 dark:text-slate-400 opacity-70 hover:opacity-100'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-xl select-none shrink-0">{subFmt.icon}</span>
                                    <span className="font-serif font-bold text-xs uppercase tracking-wider truncate">
                                      {subFmt.shortLabel}
                                    </span>
                                  </div>
                                  <span
                                    className={`w-5 h-5 rounded-md flex items-center justify-center text-xs font-black shrink-0 border ${
                                      isChecked
                                        ? 'bg-emerald-500 text-[#051a0f] border-emerald-300 shadow-sm'
                                        : 'bg-transparent border-slate-400/50 dark:border-slate-600'
                                    }`}
                                  >
                                    {isChecked ? '✓' : ''}
                                  </span>
                                </button>
                              );
                            })}
                          </div>

                          {mixedFormatSetupWarning && (
                            <div className="text-xs font-serif text-amber-900 dark:text-amber-200 bg-amber-500/15 border border-[#d4af37]/50 rounded-lg px-3 py-1.5 flex items-center gap-2">
                              <span>⚠️</span>
                              <span>{mixedFormatSetupWarning}</span>
                            </div>
                          )}

                          <div className="text-xs font-serif text-slate-700 dark:text-amber-100/85 flex flex-wrap items-center gap-1.5 pt-1 border-t border-[#d4af37]/20">
                            <span className="font-bold uppercase tracking-wider text-amber-800 dark:text-[#fef08a]">Rotation Order:</span>
                            <span>
                              {activeMixed
                                .map(q => {
                                  const found = CHALLENGE_FORMATS.find(f => f.id === q);
                                  return found ? `${found.icon} ${found.shortLabel}` : q;
                                })
                                .join('  →  ')}
                            </span>
                          </div>
                        </div>
                      );
                    })()}

                    {(settings.challengeFormat === 'multipleChoice' || settings.challengeFormat === 'openCloze' || settings.challengeFormat === 'wordFormation' || settings.challengeFormat === 'keyWordTransformation' || settings.challengeFormat === 'mixed') && (
                      <div className="mt-3 px-3.5 py-2 rounded-xl bg-amber-500/10 border border-[#d4af37]/35 text-[11px] font-serif text-amber-900 dark:text-amber-200/85 flex items-center gap-2">
                        <span>ℹ️</span>
                        <span>
                          <strong>Cloze &amp; Transformation House Rules:</strong> Clean 1:1 base payouts on Cloze &amp; Word Formation; <strong>Key Word Transformation</strong> awards <strong>1× Wager</strong> for 1/2 mark (partial) and <strong>2× Wager</strong> for 2/2 marks (full transformation)! <em>Split Bet</em> lets you hedge 2 options/phrases (50% each) or stack 1 for full payout. <em>Correction Bounty</em> &amp; <em>Grammar Goggles</em> are automatically disabled on Cloze hands.
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                  <ActionButton
                    onClick={() => { playSound('click'); setStep('PLAYER_SETUP'); }}
                    variant="outline-gold"
                    className="py-3.5 px-6 text-sm"
                  >
                    &larr; Guest Registry
                  </ActionButton>
                  <ActionButton
                    onClick={handleAdvanceToSettingsPart2}
                    variant="gold"
                    className="w-full sm:w-auto text-base sm:text-lg py-4 px-12 tracking-[0.12em]"
                  >
                    NEXT: HOUSE RULES &amp; POWER-UPS &rarr;
                  </ActionButton>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-8 glass-panel p-6 sm:p-9 rounded-2xl relative animate-fade-in">
                  {/* Locked-in Linguistic Setup Summary Bar */}
                  <div className="p-3.5 sm:p-4 rounded-xl felt-well border border-[#d4af37]/40 flex flex-wrap items-center justify-between gap-3 text-left">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-serif uppercase tracking-wider text-amber-800 dark:text-[#d4af37] font-bold mr-1">
                        Charter Locked:
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-[#d4af37]/40 font-serif font-bold text-slate-900 dark:text-[#fef08a]">
                        📚 {resolvedTopicPreview}
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-[#d4af37]/40 font-mono-casino font-bold text-slate-900 dark:text-[#fef08a]">
                        🎯 {settings.level}
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-[#d4af37]/40 font-serif font-bold text-slate-900 dark:text-[#fef08a]">
                        🎭 {resolvedThemePreview}
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-400/40 font-serif font-bold text-emerald-900 dark:text-emerald-200">
                        {currentFormatObj.icon} {currentFormatObj.label}
                        {settings.challengeFormat === 'mixed' && (
                          <span className="ml-1 opacity-90">
                            ({getEffectiveMixedFormats(settings.mixedFormats).map(q => CHALLENGE_FORMATS.find(f => f.id === q)?.icon).filter(Boolean).join(' ')})
                          </span>
                        )}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        playSound('click');
                        setSettingsPart(1);
                      }}
                      className="text-xs font-serif font-bold uppercase tracking-wider text-amber-800 dark:text-[#fef08a] hover:underline cursor-pointer shrink-0"
                    >
                      &larr; Edit Setup
                    </button>
                  </div>

                  {/* V. Configure Power-Up Shoe */}
                  <div className="text-left">
                    <div className="mb-3.5 border-l-4 border-purple-500 pl-3.5">
                      <h3 className="text-lg sm:text-xl font-serif text-slate-900 dark:text-[#fef08a] font-extrabold uppercase tracking-wider">
                        V. House Power-Up Shoe
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-amber-200/60">Curate the special cards available at the table</p>
                    </div>

                    <div className="p-4 sm:p-5 rounded-xl felt-well border-purple-400/40 dark:border-purple-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="space-y-1.5 flex-1 min-w-0 w-full">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="text-2xl filter drop-shadow select-none">🎴</span>
                          <span className="font-serif font-extrabold text-base sm:text-lg text-slate-900 dark:text-purple-100 uppercase tracking-wide">
                            Active Shoe Deck
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-mono-casino font-bold bg-purple-500/20 text-purple-900 dark:text-purple-200 border border-purple-400/50">
                            {selectedPowerUps.length} / {(Object.keys(POWER_UPS) as PowerUpKey[]).length} Cards
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300/80">
                          Players can draw random cards from this shoe during betting rounds to gain advantages or sabotage rivals.
                        </p>
                        <div className="flex items-center gap-1.5 pt-1 overflow-x-auto max-w-full py-0.5">
                          {selectedPowerUps.slice(0, 12).map(k => (
                            <span key={k} className="text-base select-none bg-black/10 dark:bg-black/40 px-1.5 py-0.5 rounded border border-purple-400/20" title={POWER_UPS[k]?.name}>
                              {POWER_UPS[k]?.icon}
                            </span>
                          ))}
                          {selectedPowerUps.length > 12 && (
                            <span className="text-[11px] font-mono-casino text-purple-700 dark:text-purple-300 font-bold ml-1">
                              +{selectedPowerUps.length - 12} more
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 w-full sm:w-auto shrink-0">
                        <ActionButton
                          onClick={() => {
                            playSound('click');
                            setShowDeckConfigModal(true);
                          }}
                          variant="purple"
                          className="w-full sm:w-auto px-6 py-3 text-xs sm:text-sm flex items-center justify-center gap-2"
                        >
                          <span>🎴</span>
                          <span>Customize Shoe</span>
                        </ActionButton>
                      </div>
                    </div>
                  </div>

                  {/* VI. Win Condition */}
                  <div className="text-left border-t border-[#d4af37]/25 pt-6"> 
                    <div className="mb-3.5 border-l-4 border-rose-500 pl-3.5">
                      <h3 className="text-lg sm:text-xl font-serif text-slate-900 dark:text-[#fef08a] font-extrabold uppercase tracking-wider">
                        VI. Table Rules &amp; Victory Condition
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-amber-200/60">Define how the Grand Champion is crowned</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4"> 
                      {/* Mode 1: Last Survivor */}
                      <button 
                        type="button"
                        onClick={() => { playSound('click'); setGameMode('lastPlayer'); }} 
                        className={`p-5 rounded-xl border-2 transition-all flex flex-col items-center justify-center text-center cursor-pointer ${
                          gameMode === 'lastPlayer'
                            ? 'bg-gradient-to-b from-amber-500/20 to-amber-900/20 border-[#d4af37] shadow-[0_0_25px_rgba(212,175,55,0.25)] scale-[1.01]'
                            : 'felt-well opacity-75 hover:opacity-100 hover:border-[#d4af37]/60'
                        }`}
                      >
                        <div className="text-3xl mb-2">👑</div>
                        <div className="font-serif text-base sm:text-lg text-slate-900 dark:text-amber-50 font-extrabold uppercase tracking-wider">High-Roller Survival</div>
                        <div className="text-xs text-slate-500 dark:text-amber-200/70 mt-1">Play until only one solvent player remains.</div>
                      </button> 

                      {/* Mode 2: Fixed Rounds */}
                      <div className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-3 ${
                        gameMode === 'rounds'
                          ? 'bg-gradient-to-b from-sky-500/20 to-blue-950/30 border-sky-400 shadow-[0_0_25px_rgba(56,189,248,0.25)] scale-[1.01]'
                          : 'felt-well opacity-75 hover:opacity-100 hover:border-sky-400/50'
                      }`}> 
                        <button 
                          type="button"
                          onClick={() => { playSound('click'); setGameMode('rounds'); }} 
                          className="w-full text-center cursor-pointer"
                        >
                            <div className="text-3xl mb-2">⏳</div>
                            <div className="font-serif text-base sm:text-lg text-slate-900 dark:text-amber-50 font-extrabold uppercase tracking-wider">Fixed Shoe Hands</div>
                            <div className="text-xs text-slate-500 dark:text-amber-200/70 mt-1">Richest vault after a set number of hands.</div>
                        </button> 
                        {gameMode === 'rounds' && (
                          <div className="flex flex-col items-center gap-2 pt-2 border-t border-sky-400/30 w-full">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-serif uppercase tracking-wider text-slate-700 dark:text-sky-200 font-bold">Hands:</span> 
                              <TextInput 
                                type="number" 
                                min={1}
                                max={100}
                                value={String(totalRounds)} 
                                onChange={(e) => { 
                                  const val = e.target.value; 
                                  setTotalRounds(val === '' ? '' : parseInt(val, 10));
                                }} 
                                className="w-20 text-center !py-1 font-mono-casino font-bold"
                              />
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px]">
                              {[5, 10, 15, 20].map((r) => (
                                <button
                                  key={r}
                                  type="button"
                                  onClick={() => { playSound('click'); setTotalRounds(r); }}
                                  className={`px-2 py-0.5 rounded border text-xs font-mono-casino transition-colors cursor-pointer ${totalRounds === r ? 'bg-sky-500 text-white border-sky-300 font-bold' : 'bg-black/10 dark:bg-black/40 text-slate-700 dark:text-slate-300 border-slate-400/40 hover:border-sky-400'}`}
                                >
                                  {r}
                                </button>
                              ))}
                            </div>
                          </div>
                        )} 
                      </div> 

                      {/* Mode 3: Target Amount */}
                      <div className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-3 ${
                        gameMode === 'targetAmount'
                          ? 'bg-gradient-to-b from-emerald-500/20 to-emerald-950/30 border-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.25)] scale-[1.01]'
                          : 'felt-well opacity-75 hover:opacity-100 hover:border-emerald-400/50'
                      }`}> 
                        <button 
                          type="button"
                          onClick={() => { playSound('click'); setGameMode('targetAmount'); }} 
                          className="w-full text-center cursor-pointer"
                        >
                            <div className="text-3xl mb-2">🎯</div>
                            <div className="font-serif text-base sm:text-lg text-slate-900 dark:text-amber-50 font-extrabold uppercase tracking-wider">Target Bankroll</div>
                            <div className="text-xs text-slate-500 dark:text-amber-200/70 mt-1">First high-roller to hit the vault target wins.</div>
                        </button> 
                        {gameMode === 'targetAmount' && (
                          <div className="flex flex-col items-center gap-2 pt-2 border-t border-emerald-400/30 w-full">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-serif uppercase tracking-wider text-slate-700 dark:text-emerald-200 font-bold">Goal: $</span> 
                              <TextInput 
                                type="number" 
                                min={MIN_TARGET_AMOUNT}
                                step={250}
                                value={String(targetAmount)} 
                                onChange={(e) => { 
                                  const val = e.target.value; 
                                  setTargetAmount(val === '' ? '' : parseInt(val, 10));
                                }} 
                                className="w-24 text-center !py-1 font-mono-casino font-bold"
                              />
                            </div>
                            <div className="flex flex-wrap justify-center items-center gap-1 text-[11px]">
                              {[2000, 2500, 3000, 5000].map((amt) => (
                                <button
                                  key={amt}
                                  type="button"
                                  onClick={() => { playSound('click'); setTargetAmount(amt); }}
                                  className={`px-2 py-0.5 rounded border text-[11px] font-mono-casino transition-colors cursor-pointer ${Number(targetAmount) === amt ? 'bg-emerald-600 text-white border-emerald-300 font-bold' : 'bg-black/10 dark:bg-black/40 text-slate-700 dark:text-slate-300 border-slate-400/40 hover:border-emerald-400'}`}
                                >
                                  ${amt >= 1000 ? `${amt / 1000}k` : amt}
                                </button>
                              ))}
                            </div>
                          </div>
                        )} 
                      </div> 
                    </div> 
                  </div> 

                  {/* VII. Betting Turn / Round Clock */}
                  <div className="text-left border-t border-[#d4af37]/25 pt-6">
                    <div className="mb-3.5 border-l-4 border-amber-400 pl-3.5 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-lg sm:text-xl font-serif text-slate-900 dark:text-[#fef08a] font-extrabold uppercase tracking-wider">
                          {mpRoomCode ? 'VII. Shared Round Clock' : 'VII. Betting Turn Clock'}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-amber-200/60">
                          {mpRoomCode
                            ? 'Set a shared countdown timer displayed to everyone while all players place their bets simultaneously'
                            : 'Set a per-player time limit for placing bets, writing corrections, and buying hints or power-ups'}
                        </p>
                      </div>
                      {turnTimerSeconds > 0 && (
                        <button
                          type="button"
                          onClick={() => { playSound('click'); setAutoStartNextTimer(v => !v); }}
                          className={`px-3 py-1.5 rounded-full text-xs font-serif font-bold uppercase tracking-wider border transition-all cursor-pointer ${
                            autoStartNextTimer
                              ? 'bg-emerald-500/20 border-emerald-400 text-emerald-900 dark:text-emerald-200'
                              : 'felt-well text-slate-600 dark:text-amber-200/70 border-[#d4af37]/40'
                          }`}
                          title={
                            mpRoomCode
                              ? 'When enabled, the shared round timer starts automatically as soon as each hand is dealt'
                              : "When enabled, locking or finishing one player's timer automatically starts the next player's timer"
                          }
                        >
                          {mpRoomCode
                            ? (autoStartNextTimer ? '✓ Auto-Start Round Timer: ON' : 'Auto-Start Round Timer: OFF')
                            : (autoStartNextTimer ? '✓ Auto-Advance Next Player: ON' : 'Auto-Advance Next Player: OFF')}
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 sm:gap-3">
                      {TURN_TIMER_OPTIONS.map(secs => {
                        const isSelected = turnTimerSeconds === secs;
                        return (
                          <button
                            key={secs}
                            type="button"
                            onClick={() => {
                              playSound('click');
                              setTurnTimerSeconds(secs);
                              setTurnTimers({});
                              setMpRoundTimer({ status: 'idle', remainingMs: secs * 1000 });
                              mpAutoStartedRoundRef.current = 0;
                            }}
                            className={`p-3.5 rounded-xl transition-all duration-200 font-serif border cursor-pointer flex flex-col items-center justify-center gap-1 ${
                              isSelected
                                ? 'bg-gradient-to-b from-[#fef08a] via-[#eab308] to-[#a16207] text-[#1c0a04] border-[#fef9c3] shadow-[0_6px_18px_rgba(202,138,4,0.4),inset_0_1px_0_rgba(255,255,255,0.8)] font-extrabold scale-[1.02]'
                                : 'felt-well text-slate-800 dark:text-amber-50/90 hover:border-[#d4af37] hover:bg-amber-500/10'
                            }`}
                          >
                            <span className="text-xl select-none">{secs === 0 ? '∞' : '⏱️'}</span>
                            <span className="text-xs sm:text-sm uppercase tracking-wider font-extrabold">
                              {secs === 0 ? 'Off' : `${secs}s`}
                            </span>
                            <span className={`text-[10px] font-sans ${isSelected ? 'text-[#1c0a04]/80 font-semibold' : 'opacity-65'}`}>
                              {secs === 0 ? 'No time limit' : 'Per player turn'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div> 

                <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                  <ActionButton
                    onClick={() => { playSound('click'); setSettingsPart(1); }}
                    variant="outline-gold"
                    className="py-3.5 px-6 text-sm"
                  >
                    &larr; Linguistic Setup
                  </ActionButton>
                  <ActionButton
                    onClick={handleFinalizeSettings}
                    playSound={playSound}
                    variant="gold"
                    className="w-full sm:w-auto text-lg sm:text-xl py-4 px-14 tracking-[0.15em]"
                  >
                    DEAL THE FIRST HAND ♠️
                  </ActionButton>
                </div>
              </>
            )}
          </div> 
          );
        }
        case 'IN_GAME': { 
            const unfrozenActivePlayers = activePlayers.filter(p => !isPlayerFrozen(p.id));
            const currentQuestionType: QuestionType = currentSentence?.questionType || 'binary';
            const isClozeRound = currentQuestionType === 'multipleChoice' || currentQuestionType === 'openCloze' || currentQuestionType === 'wordFormation' || currentQuestionType === 'keyWordTransformation';

            const allValidBetsFinalized = unfrozenActivePlayers.every(p => {
                const playerBet = bets[p.id];
                const hasValidBetAmount = typeof playerBet?.bet === 'number' && Number(playerBet.bet) >= 0;
                if (!hasValidBetAmount) return false;
                const hasSplitBet = (activePowerUps[p.id] || []).some(pu => pu.type === 'SPLIT_BET');
                if (currentQuestionType === 'multipleChoice') {
                    return hasSplitBet
                      ? (playerBet?.splitOptions?.length ?? 0) >= 1
                      : Boolean(playerBet?.selectedOption?.trim());
                }
                if (currentQuestionType === 'openCloze' || currentQuestionType === 'wordFormation') {
                    const baseNorm = currentQuestionType === 'wordFormation' ? (currentSentence?.baseWord || '').trim().toLowerCase() : '';
                    if (hasSplitBet) {
                      const w1 = (playerBet?.splitClozeAnswers?.[0] || '').trim().toLowerCase();
                      const w2 = (playerBet?.splitClozeAnswers?.[1] || '').trim().toLowerCase();
                      if (baseNorm && ((w1 && w1 === baseNorm) || (w2 && w2 === baseNorm))) return false;
                      return Boolean(w1 || w2);
                    }
                    const w = (playerBet?.clozeAnswer || '').trim().toLowerCase();
                    if (baseNorm && w && w === baseNorm) return false;
                    return Boolean(w);
                }
                if (currentQuestionType === 'keyWordTransformation') {
                    const keyWord = currentSentence?.baseWord;
                    if (hasSplitBet) {
                      const w1 = (playerBet?.splitClozeAnswers?.[0] || '').trim();
                      const w2 = (playerBet?.splitClozeAnswers?.[1] || '').trim();
                      if (!w1 && !w2) return false;
                      if (w1 && !isValidKeyWordTransformationPhrase(w1, keyWord)) return false;
                      if (w2 && !isValidKeyWordTransformationPhrase(w2, keyWord)) return false;
                      return true;
                    }
                    return isValidKeyWordTransformationPhrase(playerBet?.clozeAnswer, keyWord);
                }
                if (hasSplitBet) {
                     return true;
                }
                return Boolean(playerBet?.opinion);
            });

            const allActivePlayersLocked = unfrozenActivePlayers.every(p => turnTimers[p.id]?.status === 'locked');
            const lockedCount = unfrozenActivePlayers.filter(p => turnTimers[p.id]?.status === 'locked').length;
            const mpLockedCount = unfrozenActivePlayers.filter(p => {
              if (mpSeats[p.id]) return mpSeats[p.id].lockedIn;
              const hasSplit = (activePowerUps[p.id] || []).some(pu => pu.type === 'SPLIT_BET');
              return isBetCompleteForQuestionType(bets[p.id], currentQuestionType, hasSplit, currentSentence?.baseWord);
            }).length;
            const allMpPlayersLocked = unfrozenActivePlayers.length > 0 && mpLockedCount === unfrozenActivePlayers.length;
            const canRevealResults = mpRoomCode
              ? (allMpPlayersLocked || allValidBetsFinalized || teacherRevealOverride)
              : isTurnTimerEnabled
                ? (allActivePlayersLocked || teacherRevealOverride)
                : (allValidBetsFinalized || teacherRevealOverride);

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

            let sentenceHtml = highlightedPhrase && currentSentence ? 
              currentSentence.text.replace(new RegExp(`(${highlightedPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), `<span class="bg-amber-200/80 dark:bg-amber-500/25 text-amber-950 dark:text-[#fef08a] border-b-2 border-[#d4af37] px-1.5 py-0.5 rounded font-semibold">$1</span>`) 
              : currentSentence?.text || '';

            if (isClozeRound && sentenceHtml) {
              const inlineBaseWordBadge =
                currentQuestionType === 'wordFormation' && currentSentence?.baseWord
                  ? ` <span class="inline-block px-2.5 py-0.5 mx-1 rounded-md bg-amber-500/25 dark:bg-amber-400/20 border border-[#d4af37]/70 text-amber-950 dark:text-[#fef08a] font-mono-casino font-black not-italic tracking-wider text-[0.78em] align-middle select-none shadow-sm">(${currentSentence.baseWord.toUpperCase()})</span>`
                  : '';
              sentenceHtml = sentenceHtml.replace(
                /_{3,}/g,
                `<span class="inline-block min-w-[3.5rem] sm:min-w-[4.5rem] px-2 py-0.5 mx-1 rounded-md bg-amber-500/15 dark:bg-amber-400/15 border-b-2 border-[#d4af37] text-amber-900 dark:text-[#fef08a] font-mono-casino font-bold not-italic tracking-widest text-center select-none">_____</span>${inlineBaseWordBadge}`
              );
            }

            const renderPlayerSeat = (player: Player) => {
                      const allActive = Object.values(activePowerUps).flat() as ActivePowerUp[];
                      const playerActive = (activePowerUps[player.id] || []) as ActivePowerUp[];
                      const playerCaps = allActive.filter(pu => pu.type === 'BET_CAP' && (pu.target !== undefined ? pu.target === player.id : playerActive.includes(pu)));
                      const isBetCapped = playerCaps.length > 0 || player.effects.some(e => (e.type as string) === 'BET_CAP');
                      const betCapAmount = playerCaps.length > 0 
                        ? playerCaps.reduce((min, pu) => Math.min(min, pu.amount ?? BET_CAP_AMOUNT), BET_CAP_AMOUNT)
                        : (isBetCapped ? 50 : BET_CAP_AMOUNT);
                      const playerHighRollers = allActive.filter(pu => pu.type === 'HIGH_ROLLER' && pu.target === player.id);
                      const isHighRoller = playerHighRollers.length > 0;
                      const minBetAmount = isHighRoller
                        ? Math.min(
                            player.money,
                            Math.max(
                              1,
                              playerHighRollers.reduce(
                                (max, pu) => Math.max(max, pu.amount ?? Math.ceil(player.money * 0.5)),
                                Math.ceil(player.money * 0.5)
                              )
                            )
                          )
                        : 0;
                      const scalpelPu = playerActive.find(pu => pu.type === 'SCALPEL');
                      let scalpelHint: { eliminatedOptions?: string[]; clozeMask?: string } | null = null;
                      if (scalpelPu && currentSentence) {
                        if (currentQuestionType === 'multipleChoice') {
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
                        } else if (currentQuestionType === 'keyWordTransformation' && currentSentence.correctAnswer) {
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
                      const isFrozen = allActive.some(pu => pu.type === 'SUB_ZERO' && pu.target === player.id) || player.effects.some(e => (e.type as string) === 'SUB_ZERO');
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
                            <div className="flex items-center justify-between gap-3 px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-400/50 text-emerald-900 dark:text-emerald-200">
                              <span className="text-xs font-serif font-extrabold uppercase tracking-wider flex items-center gap-2">
                                <span>🔒</span>
                                <span>{player.name} Locked In Wager on Device</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => handleMpUnlockPlayer(player.id)}
                                title="Teacher Only: Unlock this player's wager so they can change their bet"
                                className="px-3 py-1 rounded-lg font-serif font-extrabold uppercase tracking-wider text-xs border border-[#d4af37]/70 hover:border-[#d4af37] bg-black/15 dark:bg-black/50 text-amber-900 dark:text-[#fef08a] transition-all cursor-pointer flex items-center gap-1.5"
                              >
                                <span>🔓</span>
                                <span>Unlock Player</span>
                              </button>
                            </div>
                          )}
                          <PlayerBettingCard 
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
            const sentenceTextClass = sentenceLength > 150
              ? "text-lg sm:text-xl md:text-2xl leading-snug md:leading-normal"
              : sentenceLength > 90
                ? "text-xl sm:text-2xl md:text-3xl leading-snug md:leading-relaxed"
                : "text-2xl sm:text-3xl md:text-4xl leading-relaxed";

            const activeFormatConfig = CHALLENGE_FORMATS.find(f => f.id === (settings.challengeFormat || 'binary')) || CHALLENGE_FORMATS[0];
            const nextFormatConfig = nextRoundSettings?.challengeFormat
              ? CHALLENGE_FORMATS.find(f => f.id === nextRoundSettings.challengeFormat)
              : undefined;
            const currentHandFormatBadge = currentQuestionType === 'multipleChoice'
              ? '🔠 Multiple-Choice Cloze'
              : currentQuestionType === 'openCloze'
                ? '✍️ Open Cloze'
                : currentQuestionType === 'wordFormation'
                  ? '🧬 Word Formation'
                  : currentQuestionType === 'keyWordTransformation'
                    ? '🔑 Key Word Transformation'
                    : '⚖️ Valid or Flawed';

            return ( 
              <div className="w-full max-w-5xl animate-fade-in p-2 md:p-4"> 
                {/* 3D Bespoke Casino Playing Card Container */}
                <div ref={sentenceHeaderRef} className="card-reveal-container sticky top-0 z-30 mb-5 sm:mb-6">
                  <div className={`card-reveal-flipper ${isSentenceRevealed && !isLoading ? 'revealed' : ''}`}>
                    
                    {/* Front of Card (Guilloché Crimson & Gold Foil Playing Card Back) */}
                    <div className="card-reveal-front">
                       <div className={`casino-back-pattern h-full w-full rounded-2xl flex flex-col items-center justify-center p-8 ${isLoading ? 'animate-pulse' : ''}`}>
                          <div className="w-16 h-16 rounded-full border-2 border-[#d4af37]/70 bg-black/40 flex items-center justify-center text-3xl text-[#fef08a] mb-3 shadow-[0_0_20px_rgba(212,175,55,0.3)] select-none">
                            ♠
                          </div>
                          <h2 className="text-xl sm:text-2xl font-serif font-extrabold text-[#fef08a] uppercase tracking-[0.35em] select-none drop-shadow">
                            DEALING FROM THE SHOE
                          </h2>
                          {isLoading && (
                            <div className="mt-2 text-amber-300/80 font-mono-casino text-xs uppercase tracking-[0.25em] animate-bounce">
                              Croupier is Shuffling...
                            </div>
                          )}
                       </div>
                    </div>

                    {/* Back of Card (The Revealed Dealer's Sentence Card) */}
                    <div className="card-reveal-back">
                      <div className={`sticky-sentence rounded-2xl p-4 sm:p-6 md:p-7 transition-all ${
                        isSentenceHeaderStuck
                          ? 'stuck'
                          : 'bg-gradient-to-b from-[#fffefb] via-[#faf5ea] to-[#f3ead8] dark:from-[#082616] dark:via-[#051a0f] dark:to-[#03120a] border-2 border-[#d4af37] shadow-[0_20px_50px_rgba(0,0,0,0.6),0_0_30px_rgba(212,175,55,0.15)] relative'
                      }`}> 
                        {currentSentence && (
                          <>
                            {/* Inner Playing Card Gold Hairline Frame */}
                            {!isSentenceHeaderStuck && (
                              <div className="pointer-events-none absolute inset-2 border border-[#d4af37]/30 rounded-xl" />
                            )}

                            {/* Playing Card Top-Left Index */}
                            <div className="pointer-events-none absolute top-3.5 left-4 hidden sm:flex flex-col items-center leading-none text-[#ca8a04] dark:text-[#d4af37] opacity-75 select-none">
                              <span className="font-serif font-black text-xs">R{currentRound}</span>
                              <span className="text-sm mt-0.5">♠</span>
                            </div>

                            {/* Playing Card Bottom-Right Index (Inverted) */}
                            {!isSentenceHeaderStuck && (
                              <div className="pointer-events-none absolute bottom-3.5 right-4 hidden sm:flex flex-col items-center leading-none text-[#ca8a04] dark:text-[#d4af37] opacity-75 rotate-180 select-none">
                                <span className="font-serif font-black text-xs">R{currentRound}</span>
                                <span className="text-sm mt-0.5">♠</span>
                              </div>
                            )}

                            {/* Bullion Plaque Overlapping Top Border */}
                            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-b from-[#fef08a] via-[#eab308] to-[#a16207] text-[#1c0a04] font-serif uppercase tracking-[0.2em] text-[11px] sm:text-xs font-extrabold px-6 py-1 rounded-full border border-[#fef9c3] shadow-[0_4px_15px_rgba(202,138,4,0.55),inset_0_1px_0_rgba(255,255,255,0.85)] z-10 whitespace-nowrap flex items-center gap-2">
                                <span>♦</span>
                                <span>Hand {currentRound}{gameMode === 'rounds' ? ` of ${totalRounds}` : ''}{gameMode === 'targetAmount' ? ` · Target: $${Number(targetAmount).toLocaleString()}` : ''} · {currentHandFormatBadge}</span>
                                <span>♦</span>
                            </div>
                            
                            <div className="relative flex flex-col items-center justify-center py-3 sm:py-4"> 
                                {/* Top-right utility actions */}
                                <div className="flex gap-2 mb-2 sm:mb-0 sm:absolute sm:top-0 sm:right-2 z-20">
                                    <button 
                                      onClick={handleCopySentence}
                                      className="text-amber-900 dark:text-amber-200/80 hover:text-amber-700 dark:hover:text-[#fef08a] transition-all flex items-center gap-1.5 bg-amber-100/70 dark:bg-black/45 border border-[#d4af37]/40 hover:border-[#d4af37] px-2.5 py-1 rounded-full shadow-sm text-xs cursor-pointer"
                                      title="Copy sentence to clipboard"
                                    >
                                      <span>{isCopied ? '✓' : '📋'}</span>
                                      <span className="text-[10px] font-serif font-bold uppercase tracking-wider">{isCopied ? 'Copied' : 'Copy'}</span>
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
                                      className={`text-amber-900 dark:text-amber-200/80 hover:text-amber-700 dark:hover:text-[#fef08a] transition-all flex items-center gap-1.5 bg-amber-100/70 dark:bg-black/45 border border-[#d4af37]/40 hover:border-[#d4af37] px-2.5 py-1 rounded-full shadow-sm text-xs cursor-pointer ${isSpeaking ? 'opacity-50 cursor-not-allowed' : ''}`}
                                      title="Read sentence aloud"
                                    >
                                      <span>🔊</span>
                                      <span className="text-[10px] font-serif font-bold uppercase tracking-wider">{isSpeaking ? 'Speaking...' : 'Listen'}</span>
                                    </button>
                                </div>

                                {currentQuestionType === 'keyWordTransformation' && currentSentence.leadInSentence && (
                                  <div className="w-full max-w-3xl mx-auto mb-3 px-4 py-2.5 rounded-xl bg-amber-500/10 dark:bg-black/40 border border-[#d4af37]/45 text-center space-y-2">
                                    <div className="text-[10px] sm:text-xs font-serif font-bold uppercase tracking-[0.2em] text-amber-800 dark:text-amber-300/85">
                                      Lead-In Sentence (Keep Similar Meaning)
                                    </div>
                                    <p className="text-base sm:text-xl md:text-2xl font-editorial text-slate-800 dark:text-amber-100">
                                      &ldquo;{currentSentence.leadInSentence}&rdquo;
                                    </p>
                                    {currentSentence.baseWord && (
                                      <div className="pt-1 flex items-center justify-center gap-2 flex-wrap">
                                        <span className="px-3.5 py-1 rounded-lg bg-gradient-to-b from-[#fef08a] via-[#eab308] to-[#a16207] text-[#1c0a04] font-mono-casino font-black text-sm sm:text-base tracking-[0.2em] uppercase shadow-md border border-[#fef9c3]">
                                          🔑 KEY WORD: {currentSentence.baseWord.toUpperCase()}
                                        </span>
                                        <span className="text-[11px] font-serif font-semibold text-amber-900 dark:text-amber-200/80">
                                          (Use 2–6 words including this exact word · 1 Mark = 1× · 2 Marks = 2×)
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                )}

                                <p 
                                  className={`${sentenceTextClass} text-slate-900 dark:text-amber-50 font-editorial italic text-center px-3 sm:px-12 md:px-16 pt-2 sm:pt-4 drop-shadow-sm`}
                                  dangerouslySetInnerHTML={{ __html: `&ldquo;${sentenceHtml}&rdquo;` }}
                                />
                            </div> 
                            
                            {/* Collapsible Topic, Level, Theme, Format & Deck Bar */}
                            <div className="flex flex-col items-center w-full mt-2 pt-2 border-t border-[#d4af37]/20"> 
                                {/* Compact Summary Bar & Expansion Toggle */}
                                <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={handleToggleSettingsDeckExpanded}
                                    className="group px-4 py-1.5 felt-well hover:border-[#d4af37] rounded-full text-xs font-serif text-slate-800 dark:text-amber-100 flex items-center gap-2.5 transition-all duration-200 cursor-pointer select-none"
                                    title={isSettingsDeckExpanded ? "Click to collapse Round Settings & Deck" : "Click to expand Round Settings & Deck"}
                                    aria-expanded={isSettingsDeckExpanded}
                                  >
                                    <span className="flex items-center gap-2 flex-wrap font-medium text-[11px] sm:text-xs">
                                      <span className="inline-flex items-center gap-1">
                                        <span>📚</span>
                                        <span className="font-bold">{settings.topic}</span>
                                        {nextRoundSettings && nextRoundSettings.topic !== settings.topic && (
                                          <span className="text-[9px] bg-amber-500 text-black px-1.5 rounded-full font-mono-casino font-bold">Next: {nextRoundSettings.topic}</span>
                                        )}
                                        {currentSentence?.bankTopic && (
                                          <span
                                            className="text-[9px] bg-sky-200 text-sky-950 px-1.5 rounded-full font-mono-casino font-bold"
                                            title={`The offline bank has no unused ${settings.level} items for ${settings.topic}, so this hand uses ${currentSentence.bankTopic} at the same level.`}
                                          >
                                            This hand: {currentSentence.bankTopic}
                                          </span>
                                        )}
                                      </span>
                                      <span className="text-[#d4af37] select-none">•</span>
                                      <span className="inline-flex items-center gap-1">
                                        <span>📊</span>
                                        <span className="font-bold">{settings.level}</span>
                                        {nextRoundSettings && nextRoundSettings.level !== settings.level && (
                                          <span className="text-[9px] bg-amber-500 text-black px-1.5 rounded-full font-mono-casino font-bold">Next: {nextRoundSettings.level}</span>
                                        )}
                                      </span>
                                      <span className="text-[#d4af37] select-none">•</span>
                                      <span className="inline-flex items-center gap-1">
                                        <span>🎭</span>
                                        <span className="font-bold">{settings.theme}</span>
                                        {nextRoundSettings && nextRoundSettings.theme !== settings.theme && (
                                          <span className="text-[9px] bg-amber-500 text-black px-1.5 rounded-full font-mono-casino font-bold">Next: {nextRoundSettings.theme}</span>
                                        )}
                                      </span>
                                      <span className="text-[#d4af37] select-none">•</span>
                                      <span className="inline-flex items-center gap-1 text-emerald-800 dark:text-emerald-300 font-bold">
                                        <span>{activeFormatConfig.icon}</span>
                                        <span>
                                          {activeFormatConfig.shortLabel}
                                          {activeFormatConfig.id === 'mixed' && (
                                            <span className="ml-0.5 text-[10px] opacity-90">
                                              ({getEffectiveMixedFormats(settings.mixedFormats).map(q => CHALLENGE_FORMATS.find(f => f.id === q)?.icon).filter(Boolean).join('')})
                                            </span>
                                          )}
                                        </span>
                                        {nextFormatConfig && (
                                          nextFormatConfig.id !== activeFormatConfig.id ||
                                          (nextFormatConfig.id === 'mixed' &&
                                            getEffectiveMixedFormats(nextRoundSettings?.mixedFormats).join(',') !==
                                              getEffectiveMixedFormats(settings.mixedFormats).join(','))
                                        ) && (
                                          <span className="text-[9px] bg-amber-500 text-black px-1.5 rounded-full font-mono-casino font-bold">
                                            Next: {nextFormatConfig.shortLabel}
                                            {nextFormatConfig.id === 'mixed' && ` (${getEffectiveMixedFormats(nextRoundSettings?.mixedFormats).map(q => CHALLENGE_FORMATS.find(f => f.id === q)?.icon).filter(Boolean).join('')})`}
                                          </span>
                                        )}
                                      </span>
                                      <span className="text-[#d4af37] select-none">•</span>
                                      <span className="inline-flex items-center gap-1 text-purple-700 dark:text-purple-300 font-mono-casino font-bold">
                                        <span>🃏</span>
                                        <span>{selectedPowerUps.length}/{(Object.keys(POWER_UPS) as PowerUpKey[]).length}</span>
                                      </span>
                                      <span className="text-[#d4af37] select-none">•</span>
                                      <span className="inline-flex items-center gap-1 text-amber-800 dark:text-[#fef08a] font-mono-casino font-bold">
                                        <span>⏱️</span>
                                        <span>{turnTimerSeconds === 0 ? 'Off' : `${turnTimerSeconds}s`}</span>
                                      </span>
                                      <span className="text-[#d4af37] select-none">•</span>
                                      <span className="inline-flex items-center gap-1 font-mono-casino text-[10px] font-bold text-amber-800 dark:text-[#fef08a]">
                                        <span>{desktopStatus.decryptionFailed ? '🔑' : desktopStatus.hasKey && desktopStatus.isOnline ? '⚡' : '💾'}</span>
                                        <span>{desktopStatus.decryptionFailed ? 'Re-enter Key' : desktopStatus.hasKey && desktopStatus.isOnline ? 'AI' : 'Offline Bank'}</span>
                                        {desktopStatus.isPortable && <span className="opacity-75" title="Portable Edition">🎒</span>}
                                        {desktopStatus.isReadOnly && <span className="text-red-500" title="Read-Only Media">🔒</span>}
                                      </span>
                                    </span>
                                    <span className="text-[10px] font-mono-casino font-bold text-amber-900 dark:text-[#fef08a] bg-[#d4af37]/20 border border-[#d4af37]/40 px-2.5 py-0.5 rounded-full flex items-center gap-1 group-hover:scale-105 transition-transform">
                                      <span>{isSettingsDeckExpanded ? '▲ Hide Charter' : '▼ Table Charter'}</span>
                                    </span>
                                  </button>
                                </div>

                                {/* Expanded Area: Full interactive Topic/Level/Theme/Format pills + Full Deck bar */}
                                {isSettingsDeckExpanded && (
                                  <div className="w-full mt-3 pt-3 border-t border-[#d4af37]/25 flex flex-col items-center gap-2.5 animate-fade-in">
                                    {/* Interactive Topic, Level, Theme, Format, & Turn Timer Pills */}
                                    <div className="flex flex-wrap gap-2 justify-center items-center">
                                      {/* Topic Pill */}
                                      <button
                                        type="button"
                                        onClick={() => handleOpenSettingsModal('topic')}
                                        className="group relative px-3.5 py-1 felt-well hover:border-[#d4af37] rounded-full text-xs font-serif text-slate-800 dark:text-white flex items-center gap-1.5 font-medium transition-all duration-200 hover:scale-105 cursor-pointer"
                                        title="Click to change Topic for next round"
                                      >
                                        <span className="flex items-center gap-1">
                                          <span>📚</span>
                                          <span className="font-bold">{settings.topic}</span>
                                          {currentSentence?.bankTopic && (
                                            <span
                                              className="text-[9px] bg-sky-200 text-sky-950 px-1.5 rounded-full font-mono-casino font-bold"
                                              title={`The offline bank has no unused ${settings.level} items for ${settings.topic}, so this hand uses ${currentSentence.bankTopic} at the same level.`}
                                            >
                                              This hand: {currentSentence.bankTopic}
                                            </span>
                                          )}
                                        </span>
                                        {nextRoundSettings && nextRoundSettings.topic !== settings.topic && (
                                          <span className="bg-amber-500 text-black text-[9px] font-mono-casino font-black px-1.5 py-0.2 rounded-full shadow-sm animate-pulse flex items-center gap-0.5">
                                            <span>Next:</span>
                                            <span className="truncate max-w-[100px]">{nextRoundSettings.topic}</span>
                                          </span>
                                        )}
                                        <span className="text-[10px] text-amber-600 dark:text-amber-400 opacity-60 group-hover:opacity-100 transition-opacity">✏️</span>
                                      </button>

                                      {/* Level Pill */}
                                      <button
                                        type="button"
                                        onClick={() => handleOpenSettingsModal('level')}
                                        className="group relative px-3.5 py-1 felt-well hover:border-[#d4af37] rounded-full text-xs font-serif text-slate-800 dark:text-white flex items-center gap-1.5 font-medium transition-all duration-200 hover:scale-105 cursor-pointer"
                                        title="Click to change CEFR Level for next round"
                                      >
                                        <span className="flex items-center gap-1">
                                          <span>📊</span>
                                          <span className="font-bold">{settings.level}</span>
                                        </span>
                                        {nextRoundSettings && nextRoundSettings.level !== settings.level && (
                                          <span className="bg-amber-500 text-black text-[9px] font-mono-casino font-black px-1.5 py-0.2 rounded-full shadow-sm animate-pulse flex items-center gap-0.5">
                                            <span>Next:</span>
                                            <span>{nextRoundSettings.level}</span>
                                          </span>
                                        )}
                                        <span className="text-[10px] text-amber-600 dark:text-amber-400 opacity-60 group-hover:opacity-100 transition-opacity">✏️</span>
                                      </button>

                                      {/* Theme Pill */}
                                      <button
                                        type="button"
                                        onClick={() => handleOpenSettingsModal('theme')}
                                        className="group relative px-3.5 py-1 felt-well hover:border-[#d4af37] rounded-full text-xs font-serif text-slate-800 dark:text-white flex items-center gap-1.5 font-medium transition-all duration-200 hover:scale-105 cursor-pointer"
                                        title="Click to change Theme for next round"
                                      >
                                        <span className="flex items-center gap-1">
                                          <span>🎭</span>
                                          <span className="font-bold">{settings.theme}</span>
                                        </span>
                                        {nextRoundSettings && nextRoundSettings.theme !== settings.theme && (
                                          <span className="bg-amber-500 text-black text-[9px] font-mono-casino font-black px-1.5 py-0.2 rounded-full shadow-sm animate-pulse flex items-center gap-0.5">
                                            <span>Next:</span>
                                            <span className="truncate max-w-[100px]">{nextRoundSettings.theme}</span>
                                          </span>
                                        )}
                                        <span className="text-[10px] text-amber-600 dark:text-amber-400 opacity-60 group-hover:opacity-100 transition-opacity">✏️</span>
                                      </button>

                                      {/* Challenge Format Pill */}
                                      <button
                                        type="button"
                                        onClick={() => handleOpenSettingsModal('format')}
                                        className="group relative px-3.5 py-1 felt-well hover:border-[#d4af37] rounded-full text-xs font-serif text-slate-800 dark:text-white flex items-center gap-1.5 font-medium transition-all duration-200 hover:scale-105 cursor-pointer"
                                        title="Click to change Challenge Format (Valid/Flawed, Multiple-Choice Cloze, Open Cloze, Word Formation, Mixed Shoe)"
                                      >
                                        <span className="flex items-center gap-1">
                                          <span>{activeFormatConfig.icon}</span>
                                          <span className="font-bold">
                                            {activeFormatConfig.shortLabel}
                                            {activeFormatConfig.id === 'mixed' && (
                                              <span className="ml-1 text-[10px] opacity-90">
                                                ({getEffectiveMixedFormats(settings.mixedFormats).map(q => CHALLENGE_FORMATS.find(f => f.id === q)?.icon).filter(Boolean).join('')})
                                              </span>
                                            )}
                                          </span>
                                        </span>
                                        {nextFormatConfig && (
                                          nextFormatConfig.id !== activeFormatConfig.id ||
                                          (nextFormatConfig.id === 'mixed' &&
                                            getEffectiveMixedFormats(nextRoundSettings?.mixedFormats).join(',') !==
                                              getEffectiveMixedFormats(settings.mixedFormats).join(','))
                                        ) && (
                                          <span className="bg-amber-500 text-black text-[9px] font-mono-casino font-black px-1.5 py-0.2 rounded-full shadow-sm animate-pulse flex items-center gap-0.5">
                                            <span>Next:</span>
                                            <span>
                                              {nextFormatConfig.shortLabel}
                                              {nextFormatConfig.id === 'mixed' && ` (${getEffectiveMixedFormats(nextRoundSettings?.mixedFormats).map(q => CHALLENGE_FORMATS.find(f => f.id === q)?.icon).filter(Boolean).join('')})`}
                                            </span>
                                          </span>
                                        )}
                                        <span className="text-[10px] text-amber-600 dark:text-amber-400 opacity-60 group-hover:opacity-100 transition-opacity">✏️</span>
                                      </button>

                                                                            {/* AI & Offline Pill */}
                                      <button
                                        type="button"
                                        onClick={() => handleOpenSettingsModal('ai')}
                                        className="group relative px-3.5 py-1 felt-well hover:border-[#d4af37] rounded-full text-xs font-serif text-slate-800 dark:text-white flex items-center gap-1.5 font-medium transition-all duration-200 hover:scale-105 cursor-pointer"
                                        title="Click to view AI & Offline Settings"
                                      >
                                        <span className="flex items-center gap-1">
                                          <span>{desktopStatus.decryptionFailed ? '🔑' : desktopStatus.hasKey && desktopStatus.isOnline ? '⚡' : '💾'}</span>
                                          <span className="font-bold">{desktopStatus.decryptionFailed ? 'Key Re-entry Needed' : desktopStatus.hasKey && desktopStatus.isOnline ? 'Gemini AI' : 'Offline Bank'}</span>
                                          {desktopStatus.isPortable && <span className="text-purple-600 dark:text-purple-300 font-mono-casino font-bold text-[10px]">🎒 Portable</span>}
                                          {desktopStatus.isReadOnly && <span className="text-red-500 font-mono-casino font-bold text-[10px]">🔒 Read-Only</span>}
                                        </span>
                                        <span className="text-[10px] text-amber-600 dark:text-amber-400 opacity-60 group-hover:opacity-100 transition-opacity">⚙️</span>
                                      </button>

{/* Turn / Round Clock Quick Selector Pill */}
                                      <div className="px-3 py-1 felt-well rounded-full text-xs font-serif text-slate-800 dark:text-amber-100 flex items-center gap-1.5">
                                        <span>⏱️ {mpRoomCode ? 'Round Clock:' : 'Turn Clock:'}</span>
                                        {TURN_TIMER_OPTIONS.map(secs => (
                                          <button
                                            key={secs}
                                            type="button"
                                            onClick={() => {
                                              playSound('click');
                                              setTurnTimerSeconds(secs);
                                              setTurnTimers({});
                                              setMpRoundTimer({ status: 'idle', remainingMs: secs * 1000 });
                                              mpAutoStartedRoundRef.current = 0;
                                            }}
                                            className={`px-2 py-0.5 rounded-full font-mono-casino text-[10px] font-bold transition-all cursor-pointer ${
                                              turnTimerSeconds === secs
                                                ? 'bg-[#d4af37] text-black shadow-sm'
                                                : 'hover:bg-amber-500/20 text-slate-700 dark:text-amber-200/80'
                                            }`}
                                          >
                                            {secs === 0 ? 'Off' : `${secs}s`}
                                          </button>
                                        ))}
                                      </div>
                                    </div>

                                    {/* Interactive Deck Power-ups Bar */}
                                    <div className="px-4 py-1.5 felt-well border-purple-400/40 rounded-full text-xs font-serif text-purple-900 dark:text-purple-200 flex flex-wrap items-center gap-2 max-w-full justify-center">
                                      <button 
                                        type="button"
                                        onClick={() => {
                                          playSound('click');
                                          setShowDeckConfigModal(true);
                                        }}
                                        className="flex items-center gap-1.5 font-bold select-none hover:text-purple-600 dark:hover:text-purple-300 transition-colors cursor-pointer group"
                                        title="Configure Power-Up Deck"
                                      >
                                        <span>🃏 Shoe:</span>
                                        <span className="text-[10px] font-mono-casino px-1.5 py-0.5 rounded bg-purple-500/20 font-semibold" title={`${selectedPowerUps.length} of ${(Object.keys(POWER_UPS) as PowerUpKey[]).length} power-ups active`}>
                                          {selectedPowerUps.length}/{(Object.keys(POWER_UPS) as PowerUpKey[]).length}
                                        </span>
                                        <span className="text-[10px] opacity-40 group-hover:opacity-100 transition-opacity">✏️</span>
                                      </button>

                                      <div className="flex flex-wrap items-center gap-1 justify-center">
                                        {(Object.keys(POWER_UPS) as PowerUpKey[]).map(key => {
                                          const isActive = selectedPowerUps.includes(key);
                                          const isDisabledInCloze = isClozeRound && CLOZE_DISABLED_POWER_UPS.includes(key);
                                          const isDisabledInBinary = !isClozeRound && BINARY_DISABLED_POWER_UPS.includes(key);
                                          const isDisabledInSolo = !mpRoomCode && MP_ONLY_POWER_UPS.includes(key);
                                          const isFormatDisabled = isDisabledInCloze || isDisabledInBinary || isDisabledInSolo;
                                          const powerUp = POWER_UPS[key];
                                          
                                          return (
                                            <PowerUpTooltip 
                                              key={key} 
                                              powerUpKey={key} 
                                              placement="bottom"
                                              statusBadge={
                                                isDisabledInCloze ? (
                                                  <div className="flex items-center gap-1 font-semibold text-amber-300">
                                                    <span>🚫 Disabled on Cloze Hands</span>
                                                  </div>
                                                ) : isDisabledInBinary ? (
                                                  <div className="flex items-center gap-1 font-semibold text-amber-300">
                                                    <span>🚫 Cloze Hands Only (MC / Open Cloze)</span>
                                                  </div>
                                                ) : isDisabledInSolo ? (
                                                  <div className="flex items-center gap-1 font-semibold text-amber-300">
                                                    <span>🚫 Live Multiplayer Only</span>
                                                  </div>
                                                ) : (
                                                  <div className={`flex items-center gap-1 font-semibold ${isActive ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                    <span>{isActive ? '🟢 Active in Deck' : '🔴 Deactivated'}</span>
                                                    <span className="text-slate-400 text-[9px]">• Click to {isActive ? 'deactivate' : 'activate'}</span>
                                                  </div>
                                                )
                                              }
                                            >
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleTogglePowerUpInDeck(key);
                                                }}
                                                className={`relative p-0.5 rounded transition-all duration-150 cursor-pointer select-none group focus:outline-none ${
                                                  isFormatDisabled
                                                    ? 'opacity-25 grayscale cursor-not-allowed'
                                                    : isActive 
                                                      ? 'opacity-100 hover:scale-130 filter drop-shadow-sm' 
                                                      : 'opacity-30 grayscale hover:opacity-75 hover:scale-110'
                                                }`}
                                                title={
                                                  isDisabledInCloze
                                                    ? `${powerUp.name} - Disabled on Cloze hands`
                                                    : isDisabledInBinary
                                                      ? `${powerUp.name} - Multiple-Choice & Open Cloze hands only`
                                                      : isDisabledInSolo
                                                        ? `${powerUp.name} - Live QR Multiplayer only`
                                                        : `${powerUp.name} - ${isActive ? 'Active (Click to Deactivate)' : 'Deactivated (Click to Activate)'}`
                                                }
                                                aria-label={`${powerUp.name} (${isFormatDisabled ? 'disabled for current mode' : isActive ? 'active' : 'deactivated'})`}
                                              >
                                                <span className="text-sm md:text-base inline-block">
                                                  {powerUp.icon}
                                                </span>
                                                {(!isActive || isFormatDisabled) && (
                                                  <span className="absolute inset-0 flex items-center justify-center text-rose-500 font-bold text-xs pointer-events-none drop-shadow">
                                                    ✕
                                                  </span>
                                                )}
                                              </button>
                                            </PowerUpTooltip>
                                          );
                                        })}
                                      </div>

                                       {/* Deck Quick Mass Actions */}
                                      <div className="flex items-center gap-1 border-l border-purple-400/30 pl-2 text-[10px] select-none">
                                        <button
                                          type="button"
                                          onClick={() => handleToggleAllPowerUps(true)}
                                          className="px-1.5 py-0.5 rounded hover:bg-purple-500/20 text-purple-700 dark:text-purple-300 font-bold hover:underline transition-colors cursor-pointer"
                                          title={`Activate all ${Object.keys(POWER_UPS).length} power-ups in the deck`}
                                        >
                                          All
                                        </button>
                                        <span className="opacity-40">|</span>
                                        <button
                                          type="button"
                                          onClick={() => handleToggleAllPowerUps(false)}
                                          className="px-1.5 py-0.5 rounded hover:bg-purple-500/20 text-purple-700 dark:text-purple-300 font-bold hover:underline transition-colors cursor-pointer"
                                          title="Deactivate all power-ups in the deck"
                                        >
                                          None
                                        </button>
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
                    aiStatusLabel={desktopStatus.hasKey && desktopStatus.isOnline ? '⚡ Gemini AI' : '💾 Offline Bank'}
                    playSound={playSound}
                  />
                )}

                {/* Croupier's Sequential Turn Bar when Turn Timer is enabled (Single-screen / Hot-Seat mode only) */}
                {isTurnTimerEnabled && !mpRoomCode && (
                  <div className="mb-5 p-3.5 sm:px-5 rounded-2xl glass-panel flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-xs font-serif font-extrabold uppercase tracking-[0.2em] text-amber-900 dark:text-[#fef08a] flex items-center gap-1.5">
                        <span>⏱️</span>
                        <span>Turn Sequence ({turnTimerSeconds}s):</span>
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {activePlayers.map((p, idx) => {
                          const frozen = isPlayerFrozen(p.id);
                          const st = turnTimers[p.id]?.status ?? 'idle';
                          const badgeClass = frozen
                            ? 'bg-cyan-500/15 border-cyan-400/50 text-cyan-800 dark:text-cyan-200'
                            : st === 'running'
                              ? 'bg-emerald-500/25 border-emerald-400 text-emerald-950 dark:text-emerald-200 font-extrabold shadow-[0_0_12px_rgba(16,185,129,0.35)]'
                              : st === 'paused'
                                ? 'bg-sky-500/20 border-sky-400 text-sky-900 dark:text-sky-200'
                                : st === 'locked'
                                  ? 'bg-slate-500/20 border-slate-400/40 text-slate-600 dark:text-slate-300'
                                  : 'felt-well text-slate-700 dark:text-amber-100/80';
                          return (
                            <React.Fragment key={p.id}>
                              {idx > 0 && <span className="text-[#d4af37]/50 text-xs select-none">&rarr;</span>}
                              <span className={`px-2.5 py-1 rounded-full text-xs font-serif border flex items-center gap-1.5 ${badgeClass}`}>
                                <span>{p.avatar}</span>
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
                          className="px-3.5 py-1.5 rounded-xl text-xs font-serif font-extrabold uppercase tracking-wider bg-gradient-to-b from-emerald-500 to-emerald-700 text-white border border-emerald-300/80 shadow-[0_2px_0_#064e3b] hover:brightness-110 active:scale-95 transition-all cursor-pointer"
                        >
                          ▶ Start {nextIdlePlayer.name}'s Turn
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => { playSound('click'); setAutoStartNextTimer(v => !v); }}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-serif font-bold uppercase tracking-wider border transition-all cursor-pointer ${
                          autoStartNextTimer
                            ? 'bg-amber-500/20 border-[#d4af37] text-amber-900 dark:text-[#fef08a]'
                            : 'felt-well text-slate-600 dark:text-slate-300 border-slate-400/40'
                        }`}
                        title="Automatically start the next player's timer when the current player's timer finishes or locks"
                      >
                        Auto-Next: {autoStartNextTimer ? 'ON' : 'OFF'}
                      </button>
                                          <button
                        type="button"
                        onClick={() => handleOpenSettingsModal('ai')}
                        className="px-3.5 py-1 bg-white/80 dark:bg-[#051c10] border border-[#d4af37]/50 hover:border-[#d4af37] rounded-full text-xs font-serif text-slate-800 dark:text-amber-50 flex items-center gap-1.5 shadow-sm font-medium cursor-pointer transition-all hover:scale-105"
                        title="Click to view AI & Offline Settings"
                      >
                        <span>{desktopStatus.hasKey && desktopStatus.isOnline ? '⚡ Gemini AI' : '💾 Offline Bank'}</span>
                        <span className="text-[10px] text-amber-600 dark:text-amber-400">⚙️</span>
                      </button>
                    </div>
                  </div>
                )}
                {/* Live Classroom Multiplayer Projector Bar */}
                {mpRoomCode && (
                  <div className="mb-5 p-3.5 sm:px-5 rounded-2xl glass-panel flex flex-wrap items-center justify-between gap-3 border border-[#d4af37]/50">
                    <div className="flex items-center gap-3 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          playSound('click');
                          setShowMpLobbyModal(true);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-gradient-to-b from-[#fef08a] via-[#eab308] to-[#a16207] text-[#1c0a04] font-mono-casino font-extrabold text-xs uppercase tracking-widest border border-[#fef9c3] shadow cursor-pointer hover:brightness-105 transition-all flex items-center gap-1.5"
                      >
                        <span>📱 Room {mpRoomCode}</span>
                        <span className="text-[10px]">QR</span>
                      </button>

                      <div className="text-xs font-serif text-slate-800 dark:text-amber-100 flex items-center gap-2">
                        <span>🔒 Wagers Locked:</span>
                        <span className="px-2.5 py-0.5 rounded-full felt-well font-mono-casino font-extrabold text-amber-800 dark:text-[#fef08a]">
                          {mpLockedCount} / {unfrozenActivePlayers.length}
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
                        className={`px-3 py-1.5 rounded-xl text-xs font-serif font-bold uppercase tracking-wider border transition-all cursor-pointer flex items-center gap-1.5 ${
                          mpHideProjectorBets
                            ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-900 dark:text-emerald-200'
                            : 'felt-well border-[#d4af37]/50 text-slate-700 dark:text-amber-100'
                        }`}
                        title="Toggle between hiding student bets on the projector (recommended for mobile play) or showing full interactive betting cards"
                      >
                        <span>{mpHideProjectorBets ? '🙈' : '👁️'}</span>
                        <span>{mpHideProjectorBets ? 'Projector Privacy: ON' : 'Full Cards View'}</span>
                      </button>
                    </div>
                  </div>
                )}

                {mpRoomCode && mpHideProjectorBets ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {players.map((player, idx) => {
                      const allActive = Object.values(activePowerUps).flat() as ActivePowerUp[];
                      const playerActive = (activePowerUps[player.id] || []) as ActivePowerUp[];
                      const isFrozen = allActive.some(pu => pu.type === 'SUB_ZERO' && pu.target === player.id) || player.effects.some(e => e.type === 'SUB_ZERO');
                      const mpSeat = mpSeats[player.id];
                      const hasSplit = playerActive.some(pu => pu.type === 'SPLIT_BET');
                      const isBetReady = mpSeat
                        ? mpSeat.lockedIn
                        : isBetCompleteForQuestionType(bets[player.id], currentQuestionType, hasSplit, currentSentence?.baseWord);
                      const isBankrupt = player.money <= 0;

                      return (
                        <div
                          key={player.id}
                          className={`glass-panel rounded-2xl p-4 border-2 transition-all flex flex-col justify-between gap-3 ${
                            isBankrupt
                              ? 'opacity-55 border-slate-500/30'
                              : isFrozen
                                ? 'border-cyan-400/60 bg-cyan-950/20'
                                : isBetReady
                                  ? 'border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.2)]'
                                  : 'border-[#d4af37]/40'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-12 h-12 rounded-full border-2 border-[#d4af37] bg-black/30 flex items-center justify-center text-2xl relative shrink-0">
                                {player.avatar}
                                {mpSeat && (
                                  <span
                                    className={`w-3 h-3 rounded-full border-2 border-[#04150c] absolute -bottom-0.5 -right-0.5 ${
                                      mpSeat.connected ? 'bg-emerald-500' : 'bg-amber-500'
                                    }`}
                                    title={mpSeat.connected ? 'Online on Mobile' : 'Disconnected'}
                                  />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="text-[10px] font-mono-casino uppercase tracking-widest text-amber-800/75 dark:text-[#d4af37]/80">
                                  Seat #{idx + 1} {mpSeat ? '· 📱 Mobile' : '· 🖥️ Table'}
                                </div>
                                <div className="font-serif font-extrabold uppercase tracking-wider text-base text-slate-900 dark:text-amber-50 truncate">
                                  {player.name}
                                </div>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <div className="text-[9px] font-serif uppercase tracking-widest text-slate-500 dark:text-amber-200/60">
                                Bankroll
                              </div>
                              <div className="font-mono-casino font-black text-base text-emerald-700 dark:text-[#fef08a]">
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
                                  className="px-2 py-0.5 rounded-full text-[10px] font-serif font-bold bg-amber-500/15 border border-[#d4af37]/40 text-amber-900 dark:text-[#fef08a]"
                                >
                                  {POWER_UPS[pu.type]?.icon} {POWER_UPS[pu.type]?.name}
                                </span>
                              ))}
                              {player.effects.map((ef, i) => (
                                <span
                                  key={`ef-${i}`}
                                  className="px-2 py-0.5 rounded-full text-[10px] font-serif font-bold bg-purple-500/15 border border-purple-400/40 text-purple-900 dark:text-purple-200"
                                >
                                  {POWER_UPS[ef.type as PowerUpKey]?.icon || '✨'} {ef.type}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Status Pill */}
                          <div className="flex items-center gap-2">
                            <div
                              className={`flex-1 py-2.5 px-3 rounded-xl font-serif font-extrabold uppercase tracking-wider text-xs text-center border flex items-center justify-center gap-2 ${
                                isBankrupt
                                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
                                  : isFrozen
                                    ? 'bg-cyan-500/15 border-cyan-400/50 text-cyan-800 dark:text-cyan-200'
                                    : isBetReady
                                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-900 dark:text-emerald-200'
                                      : 'felt-well border-[#d4af37]/30 text-amber-900/80 dark:text-amber-200/80 animate-pulse'
                              }`}
                            >
                              {isBankrupt ? (
                                <>
                                  <span>💸</span>
                                  <span>{gameMode === 'lastPlayer' ? 'Eliminated (Bankrupt)' : 'Awaiting Next-Round Bailout'}</span>
                                </>
                              ) : isFrozen ? (
                                <>
                                  <span>❄️</span>
                                  <span>Frozen This Hand</span>
                                </>
                              ) : isBetReady ? (
                                <>
                                  <span>🔒</span>
                                  <span>Wager Locked In (Hidden)</span>
                                </>
                              ) : (
                                <>
                                  <span>🤔</span>
                                  <span>Deciding on Device...</span>
                                </>
                              )}
                            </div>
                            {mpSeat?.lockedIn && !isBankrupt && !isFrozen && (
                              <button
                                type="button"
                                onClick={() => handleMpUnlockPlayer(player.id)}
                                title="Teacher Only: Unlock this player's wager so they can change their bet"
                                className="px-3 py-2.5 rounded-xl font-serif font-extrabold uppercase tracking-wider text-xs border border-[#d4af37]/60 hover:border-[#d4af37] bg-black/15 dark:bg-black/50 text-amber-900 dark:text-[#fef08a] transition-all hover:scale-[1.02] active:scale-95 cursor-pointer shrink-0 flex items-center gap-1"
                              >
                                <span>🔓</span>
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
                      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                        <div className="text-sm font-serif text-slate-700 dark:text-amber-100/90">
                          {effectiveTableLayout === 'grid'
                            ? 'Tap a player to open their betting card. Picks stay hidden until the reveal.'
                            : 'All betting cards are open. Everyone can see each pick.'}
                        </div>
                        <div className="inline-flex rounded-xl border border-[#d4af37]/60 overflow-hidden" role="group" aria-label="Table layout">
                          {(['grid', 'cards'] as const).map(layout => (
                            <button
                              key={layout}
                              type="button"
                              onClick={() => { playSound('click'); setTableLayoutPref(layout); }}
                              aria-pressed={effectiveTableLayout === layout}
                              className={`px-3.5 py-1.5 text-xs font-serif font-bold uppercase tracking-wider transition-all cursor-pointer ${
                                effectiveTableLayout === layout
                                  ? 'bg-gradient-to-b from-[#fef08a] via-[#eab308] to-[#a16207] text-[#1c0a04]'
                                  : 'felt-well text-slate-800 dark:text-amber-100'
                              }`}
                            >
                              {layout === 'grid' ? '▦ Compact grid' : '▤ Full cards'}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {!mpRoomCode && effectiveTableLayout === 'grid' ? (
                      <>
                        <PlayerTileGrid
                          tiles={playerTiles}
                          openPlayerId={openSeatPlayer ? openSeatPlayer.id : null}
                          onOpen={(id) => { playSound('click'); setOpenSeatPlayerId(prev => (prev === id ? null : id)); }}
                          outLabel="Eliminated"
                        />
                        {openSeatPlayer && (
                          <div ref={openSeatRef} className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                              <div className="text-sm font-serif font-bold uppercase tracking-wider text-amber-900 dark:text-[#fef08a]">
                                {openSeatPlayer.avatar} {openSeatPlayer.name}'s betting card
                              </div>
                              <div className="flex items-center gap-2">
                                {nextSeatPlayer && (
                                  <button
                                    type="button"
                                    onClick={() => { playSound('click'); setOpenSeatPlayerId(nextSeatPlayer.id); }}
                                    className="px-3.5 py-1.5 rounded-xl text-xs font-serif font-bold uppercase tracking-wider border border-[#d4af37]/60 felt-well text-slate-800 dark:text-amber-100 hover:border-[#d4af37] cursor-pointer"
                                  >
                                    Next: {nextSeatPlayer.name} →
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => { playSound('click'); setOpenSeatPlayerId(null); }}
                                  className="px-3.5 py-1.5 rounded-xl text-xs font-serif font-bold uppercase tracking-wider bg-gradient-to-b from-[#fef08a] via-[#eab308] to-[#a16207] text-[#1c0a04] border border-[#fef9c3] cursor-pointer"
                                >
                                  Done · hide card
                                </button>
                              </div>
                            </div>
                            {renderPlayerSeat(openSeatPlayer)}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="grid grid-cols-1 gap-5 sm:gap-6">
                        {players.map(renderPlayerSeat)}
                      </div>
                    )}
                  </div>
                )}
                <div className="mt-10 text-center pb-20 flex flex-col items-center gap-3">
                  <ActionButton 
                    onClick={handleRevealResults} 
                    playSound={playSound} 
                    variant={canRevealResults ? 'gold' : 'outline-gold'}
                    className="w-full md:w-auto text-lg sm:text-xl py-4 px-16 tracking-[0.18em]" 
                    disabled={isProcessing || !canRevealResults}
                  >
                    {isProcessing ? processingStatus || 'Croupier is Settling Bets...' : 'CALL THE HAND & REVEAL 🎲'}
                  </ActionButton>

                  {(mpRoomCode ? !allMpPlayersLocked : (isTurnTimerEnabled && !allActivePlayersLocked)) && (
                    <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-serif text-slate-600 dark:text-amber-200/75">
                      <span>
                        🔒 Locked Players: <strong className="font-mono-casino">{mpRoomCode ? mpLockedCount : lockedCount}/{unfrozenActivePlayers.length}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          playSound('click');
                          setTeacherRevealOverride(v => !v);
                        }}
                        className={`px-3 py-1 rounded-full border font-bold uppercase tracking-wider transition-all cursor-pointer ${
                          teacherRevealOverride
                            ? 'bg-rose-500/20 border-rose-400 text-rose-800 dark:text-rose-200'
                            : 'felt-well border-[#d4af37]/50 text-amber-900 dark:text-[#fef08a] hover:border-[#d4af37]'
                        }`}
                        title="Teacher Override: unlock Reveal Results before every player has locked in"
                      >
                        {teacherRevealOverride ? '⚡ Teacher Override Active (Click to Disable)' : '🔓 Teacher Override: Unlock Reveal'}
                      </button>
                    </div>
                  )}
                </div> 
              </div> 
            ); 
        }
        case 'RESULTS': {
            const numTotalRounds = typeof totalRounds === 'string' ? parseInt(totalRounds,10) : totalRounds;
            const numTargetAmount = typeof targetAmount === 'string' ? parseInt(targetAmount, 10) : targetAmount;
            const isBailoutEnabled = Boolean(mpRoomCode) && gameMode !== 'lastPlayer';
            const isRoundLimitReached = gameMode === 'rounds' && currentRound >= numTotalRounds;
            const hasTargetWinner = gameMode === 'targetAmount' && players.some(p => p.money >= numTargetAmount);
            const isEliminationVictory = !isBailoutEnabled && players.length > 1 && activePlayers.length <= 1;
            const isAllBankrupt = !isBailoutEnabled && activePlayers.length === 0;
            const isGameOver = isRoundLimitReached || hasTargetWinner || isEliminationVictory || isAllBankrupt;
            const resultQuestionType: QuestionType = currentSentence?.questionType || 'binary';
            const isResultCloze = resultQuestionType === 'multipleChoice' || resultQuestionType === 'openCloze' || resultQuestionType === 'wordFormation' || resultQuestionType === 'keyWordTransformation';
            // Flawed Valid/Flawed sentences: underline the mistake and highlight the fix.
            const revealHighlight = (() => {
              if (!currentSentence || isResultCloze || currentSentence.isCorrect || !currentSentence.correction) return null;
              const diff = diffWords(currentSentence.text, currentSentence.correction);
              const fromPhrase = markErrorPhrase(currentSentence.text, currentSentence.errorPhrase);
              const sentence = fromPhrase || diff.original;
              return { sentence, correction: diff.corrected };
            })();
            const nextFormatObj = CHALLENGE_FORMATS.find(f => f.id === (nextRoundSettings?.challengeFormat || settings.challengeFormat || 'binary')) || CHALLENGE_FORMATS[0];

            return ( 
            <div className="w-full max-w-5xl animate-fade-in p-4">
                <div className="flex flex-wrap justify-between items-end gap-4 mb-6 border-b border-[#d4af37]/35 pb-4"> 
                  <div>
                    <div className="text-xs font-serif uppercase tracking-[0.25em] text-amber-800 dark:text-[#d4af37] font-bold">
                      Croupier's Settlement
                    </div>
                    <h2 className="text-3xl sm:text-4xl font-black text-gold uppercase tracking-wider font-display">
                      Round {currentRound} Payouts
                    </h2> 
                  </div>
                  <div className="flex items-center gap-3">
                    {gameMode === 'rounds' && (
                      <div className="px-3.5 py-1.5 rounded-full felt-well text-xs sm:text-sm font-serif text-slate-700 dark:text-amber-200 font-bold">
                        Hand {currentRound} of {totalRounds}
                      </div>
                    )} 
                    {gameMode === 'targetAmount' && (
                      <div className="px-3.5 py-1.5 rounded-full felt-well text-xs sm:text-sm font-serif text-emerald-700 dark:text-emerald-300 font-bold flex items-center gap-1.5">
                        <span>🎯 Target:</span>
                        <span className="font-mono-casino">${numTargetAmount.toLocaleString()}</span>
                      </div>
                    )}
                    <ActionButton onClick={handleSaveGameClick} playSound={playSound} variant="outline-gold" className="text-sm py-2 px-4 flex items-center gap-1.5" title="Save Table State">
                      <span>💾</span>
                      <span className="hidden sm:inline text-xs">Save</span>
                    </ActionButton>
                  </div>
                </div>

                {hasTargetWinner && (
                  <div className="mb-6 p-4 rounded-xl bg-gradient-to-r from-emerald-500/20 via-emerald-500/30 to-emerald-500/20 border-2 border-emerald-400 text-emerald-950 dark:text-emerald-100 text-center font-serif text-lg font-extrabold shadow-lg flex items-center justify-center gap-2 animate-bounce">
                    <span className="text-2xl">🎯</span>
                    <span>Target Bankroll of ${numTargetAmount.toLocaleString()} Reached! Champion Crowned!</span>
                  </div>
                )}
                
                {/* House Ruling Card */}
                <div className="glass-panel p-6 sm:p-8 rounded-2xl mb-8 relative overflow-hidden">
                    <div className={`absolute top-0 left-0 w-2 h-full ${currentSentence?.isCorrect ? 'bg-gradient-to-b from-emerald-400 to-emerald-700' : 'bg-gradient-to-b from-rose-500 to-red-800'}`}></div>
                    <div className="pl-3 sm:pl-5">
                      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
                          <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full border bg-black/5 dark:bg-black/40 border-[#d4af37]/50 flex-wrap">
                            <span className="text-xs font-serif uppercase tracking-[0.2em] text-slate-600 dark:text-amber-200/80 font-bold">
                              The House Ruling:
                            </span>
                            {isResultCloze ? (
                              <span className="text-sm sm:text-base font-serif font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                                ✓ OFFICIAL ANSWER: &ldquo;{currentSentence?.correctAnswer}&rdquo;
                              </span>
                            ) : (
                              <span className={`text-sm sm:text-base font-serif font-black uppercase tracking-widest ${currentSentence?.isCorrect ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                {currentSentence?.isCorrect ? '✓ VALID SENTENCE' : '✕ FLAWED SENTENCE'}
                              </span>
                            )}
                          </div>
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
                              className={`px-3 py-1 rounded-full felt-well hover:border-[#d4af37] text-amber-900 dark:text-amber-200 transition-all text-xs font-serif uppercase tracking-wider font-bold cursor-pointer ${isSpeaking ? 'opacity-50 cursor-not-allowed' : ''}`}
                              title="Read full completed sentence and analysis"
                          >
                              {isSpeaking ? '🔊 Speaking...' : '🔊 Listen to Ruling'}
                          </button>
                      </div>

                      {resultQuestionType === 'keyWordTransformation' && currentSentence?.leadInSentence && (
                        <div className="mb-3 p-3 rounded-xl bg-amber-500/10 border border-[#d4af37]/40">
                          <div className="text-[10px] font-serif font-bold uppercase tracking-widest text-amber-800 dark:text-amber-300/80 mb-0.5">
                            Lead-In Sentence {currentSentence.baseWord ? `· 🔑 Key Word: ${currentSentence.baseWord.toUpperCase()}` : ''}
                          </div>
                          <div className="text-base sm:text-lg font-editorial text-slate-800 dark:text-amber-100">
                            &ldquo;{currentSentence.leadInSentence}&rdquo;
                          </div>
                        </div>
                      )}

                      <p className="text-2xl sm:text-3xl font-editorial text-slate-900 dark:text-amber-50 italic leading-relaxed mb-6">
                        &ldquo;{revealHighlight
                          ? renderTextSegments(revealHighlight.sentence, 'bg-transparent text-rose-700 dark:text-rose-300 underline decoration-wavy decoration-rose-500 decoration-2 underline-offset-[6px]')
                          : currentSentence?.text}&rdquo;
                        {resultQuestionType === 'wordFormation' && currentSentence?.baseWord && (
                          <span className="inline-block ml-2 px-2.5 py-0.5 rounded-md bg-amber-500/20 border border-[#d4af37]/60 text-amber-950 dark:text-[#fef08a] font-mono-casino font-black not-italic tracking-wider text-base sm:text-lg align-middle">
                            ({currentSentence.baseWord.toUpperCase()})
                          </span>
                        )}
                      </p>
                      
                      {isResultCloze && currentSentence?.correction && (
                          <div className="felt-well p-4 sm:p-5 rounded-xl border-l-4 !border-l-emerald-500 mb-4">
                              <div className="flex flex-wrap items-center justify-between gap-2 text-amber-900 dark:text-[#fef08a] font-serif font-bold uppercase text-xs tracking-widest mb-1.5">
                                  <span>✦ Completed Sentence</span>
                                  {(resultQuestionType === 'openCloze' || resultQuestionType === 'wordFormation' || resultQuestionType === 'keyWordTransformation') && currentSentence.acceptedAnswers && currentSentence.acceptedAnswers.length > 0 && (
                                      <span className="font-mono-casino text-emerald-800 dark:text-emerald-300 font-semibold normal-case bg-emerald-500/15 px-2.5 py-0.5 rounded-full border border-emerald-500/30 text-xs">
                                          Accepted {resultQuestionType === 'wordFormation' ? 'Forms' : resultQuestionType === 'keyWordTransformation' ? 'Phrases' : 'Words'}: {currentSentence.acceptedAnswers.map(a => `"${a}"`).join(', ')}
                                      </span>
                                  )}
                              </div>
                              <div className="text-lg sm:text-xl text-emerald-900 dark:text-emerald-300 font-editorial font-medium">
                                &ldquo;{currentSentence.correction}&rdquo;
                              </div>
                          </div>
                      )}

                      {!isResultCloze && !currentSentence?.isCorrect && (
                          <div className="felt-well p-4 sm:p-5 rounded-xl border-l-4 !border-l-[#d4af37] mb-4">
                              <div className="flex flex-wrap items-center justify-between gap-2 text-amber-900 dark:text-[#fef08a] font-serif font-bold uppercase text-xs tracking-widest mb-1.5">
                                  <span>✦ Official House Revision</span>
                                  {currentSentence?.errorPhrase && (
                                      <span className="font-mono-casino text-rose-700 dark:text-rose-300 font-semibold normal-case bg-rose-500/15 px-2.5 py-0.5 rounded-full border border-rose-500/30 text-xs">
                                          Flaw: &ldquo;{currentSentence.errorPhrase}&rdquo; {currentSentence.mistakeType ? `· ${currentSentence.mistakeType}` : ''}
                                      </span>
                                  )}
                              </div>
                              <div className="text-lg sm:text-xl text-emerald-900 dark:text-emerald-300 font-editorial font-medium">
                                &ldquo;{revealHighlight
                                  ? renderTextSegments(revealHighlight.correction, 'bg-emerald-500/20 text-emerald-950 dark:text-emerald-100 font-bold rounded px-1')
                                  : currentSentence?.correction}&rdquo;
                              </div>
                          </div>
                      )}
                      
                      <div className="flex flex-col sm:flex-row gap-3.5 items-start felt-well p-4 rounded-xl">
                          <span className="text-2xl select-none">🎓</span>
                          <div className="text-slate-700 dark:text-slate-200 text-sm sm:text-base leading-relaxed flex-1">
                            {currentSentence?.explanation}
                          </div>
                          {currentSentence?.explanation && (
                            <button 
                                onClick={handleSimplifyExplanation} 
                                disabled={simplifiedExplanation.loading || !!simplifiedExplanation.text} 
                                className="shrink-0 text-xs text-amber-900 dark:text-[#fef08a] font-serif font-bold uppercase tracking-wider border border-[#d4af37]/50 px-3 py-1.5 rounded-lg hover:bg-amber-500/20 transition-colors cursor-pointer disabled:opacity-50"
                            >
                                {simplifiedExplanation.loading ? 'Loading Details...' : simplifiedExplanation.text ? 'Detailed ✓' : 'Detailed Explanation'}
                            </button>
                          )}
                      </div>
                      {simplifiedExplanation.text && (
                          <div className="mt-2.5 p-3 rounded-lg bg-sky-500/10 border border-sky-500/30 text-xs sm:text-sm text-sky-900 dark:text-sky-200 font-sans">
                              <strong>Detailed Grammar Breakdown:</strong> {simplifiedExplanation.text}
                          </div>
                      )}
                    </div>
                </div>

                {/* High-Roller Payout Ledger Table */}
                <div className="glass-panel rounded-2xl overflow-hidden shadow-2xl">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-amber-100/80 dark:bg-black/50 text-amber-950 dark:text-[#d4af37] uppercase text-xs font-serif tracking-[0.2em] font-bold border-b border-[#d4af37]/30">
                        <tr>
                            <th className="p-4 sm:p-5">Rank</th>
                            <th className="p-4 sm:p-5">High-Roller</th>
                            <th className="p-4 sm:p-5">Hand Outcome</th>
                            <th className="p-4 sm:p-5 text-right">Net Delta</th>
                            <th className="p-4 sm:p-5 text-right">Vault Balance</th>
                        </tr>
                        </thead>
                        <tbody className="text-slate-800 dark:text-slate-200 divide-y divide-[#d4af37]/15">
                        {[...roundResults].sort((a, b) => b.newTotal - a.newTotal).map((result, index) => {
                            const player = players.find(p => p.name === result.name);
                            const isWinner = result.outcomeText.includes('Win') || result.outcomeText.includes('Hit') || (result.marksAwarded !== undefined && result.marksAwarded >= 1);
                            return (
                            <tr key={result.name} className={`hover:bg-amber-500/10 transition-colors ${isWinner ? 'bg-emerald-500/10' : ''}`}>
                              <td className="p-4 sm:p-5 font-mono-casino text-xs sm:text-sm text-amber-800/70 dark:text-[#d4af37]/80 font-bold">
                                #{index + 1}
                              </td>
                              <td className="p-4 sm:p-5 font-bold flex items-center gap-3">
                                  {player ? (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenAvatarModal(player.id)}
                                      className="w-10 h-10 rounded-full border border-[#d4af37] bg-amber-50 dark:bg-[#082415] flex items-center justify-center text-xl shadow hover:scale-110 transition-transform cursor-pointer"
                                      title={`Click to change ${player.name}'s avatar`}
                                    >
                                      {player.avatar}
                                    </button>
                                  ) : (
                                    <span className="text-2xl filter drop-shadow-md">{player?.avatar || '👤'}</span>
                                  )}
                                  <span className="text-base sm:text-lg font-serif uppercase tracking-wider text-slate-900 dark:text-amber-50 font-extrabold">
                                    {result.name}
                                  </span>
                              </td>
                              <td className="p-4 sm:p-5">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className={`font-serif text-sm font-bold uppercase tracking-wide ${isWinner ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                      {result.outcomeText}
                                    </div>
                                    {result.marksAwarded !== undefined && (
                                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono-casino font-black uppercase tracking-wider border ${
                                        result.marksAwarded === 2
                                          ? 'bg-emerald-500/20 border-emerald-400 text-emerald-800 dark:text-emerald-200'
                                          : result.marksAwarded === 1
                                            ? 'bg-amber-500/20 border-amber-400 text-amber-800 dark:text-amber-200'
                                            : 'bg-rose-500/20 border-rose-400 text-rose-800 dark:text-rose-200'
                                      }`}>
                                        {result.marksAwarded}/2 Marks
                                      </span>
                                    )}
                                  </div>
                                  {result.playerAnswerDisplay && result.playerAnswerDisplay !== result.outcomeText && (
                                    <div className="text-xs font-mono-casino text-slate-600 dark:text-amber-100/80 mt-0.5">
                                      Pick: <strong>{result.playerAnswerDisplay}</strong> {result.bet > 0 ? `(Wager: $${result.bet.toLocaleString()})` : ''}
                                    </div>
                                  )}
                                  {result.correctionFeedback && (
                                    <div className="text-xs text-slate-500 dark:text-amber-200/60 mt-1 italic max-w-xs">
                                      {result.correctionFeedback}
                                    </div>
                                  )}
                              </td>
                              <td className={`p-4 sm:p-5 text-right font-mono-casino font-extrabold text-base sm:text-lg ${result.amountChanged > 0 ? 'text-emerald-600 dark:text-emerald-400' : result.amountChanged < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-slate-500'}`}>
                                  {result.amountChanged > 0 ? `+$${result.amountChanged.toLocaleString()}` : result.amountChanged < 0 ? `-$${Math.abs(result.amountChanged).toLocaleString()}` : '$0'}
                              </td>
                              <td className="p-4 sm:p-5 text-right font-mono-casino font-extrabold text-lg sm:text-xl text-gold-flat">
                                  ${result.newTotal.toLocaleString()}
                              </td>
                            </tr>
                        )})}
                        </tbody>
                    </table>
                  </div>
                </div>

                {!isGameOver && (
                  <div className="mt-6 p-4 felt-well rounded-xl flex flex-wrap items-center justify-between gap-3 select-none">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-serif font-bold text-amber-900 dark:text-[#fef08a] uppercase tracking-widest">
                        ✦ Next Hand Charter:
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-amber-200/60">
                        (Click any badge to adjust before dealing)
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenSettingsModal('topic')}
                        className="px-3.5 py-1 bg-white/80 dark:bg-[#051c10] border border-[#d4af37]/50 hover:border-[#d4af37] rounded-full text-xs font-serif text-slate-800 dark:text-amber-50 flex items-center gap-1.5 shadow-sm font-medium cursor-pointer transition-all hover:scale-105"
                        title="Click to change Topic for next round"
                      >
                        <span>📚 {nextRoundSettings?.topic || settings.topic}</span>
                        <span className="text-[10px] text-amber-600 dark:text-amber-400">✏️</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenSettingsModal('level')}
                        className="px-3.5 py-1 bg-white/80 dark:bg-[#051c10] border border-[#d4af37]/50 hover:border-[#d4af37] rounded-full text-xs font-serif text-slate-800 dark:text-amber-50 flex items-center gap-1.5 shadow-sm font-medium cursor-pointer transition-all hover:scale-105"
                        title="Click to change CEFR Level for next round"
                      >
                        <span>📊 {nextRoundSettings?.level || settings.level}</span>
                        <span className="text-[10px] text-amber-600 dark:text-amber-400">✏️</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenSettingsModal('theme')}
                        className="px-3.5 py-1 bg-white/80 dark:bg-[#051c10] border border-[#d4af37]/50 hover:border-[#d4af37] rounded-full text-xs font-serif text-slate-800 dark:text-amber-50 flex items-center gap-1.5 shadow-sm font-medium cursor-pointer transition-all hover:scale-105"
                        title="Click to change Theme for next round"
                      >
                        <span>🎭 {nextRoundSettings?.theme || settings.theme}</span>
                        <span className="text-[10px] text-amber-600 dark:text-amber-400">✏️</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenSettingsModal('format')}
                        className="px-3.5 py-1 bg-white/80 dark:bg-[#051c10] border border-[#d4af37]/50 hover:border-[#d4af37] rounded-full text-xs font-serif text-slate-800 dark:text-amber-50 flex items-center gap-1.5 shadow-sm font-medium cursor-pointer transition-all hover:scale-105"
                        title="Click to switch Challenge Format before dealing next hand"
                      >
                        <span>{nextFormatObj.icon} {nextFormatObj.shortLabel}</span>
                        <span className="text-[10px] text-amber-600 dark:text-amber-400">✏️</span>
                      </button>
                    </div>
                  </div>
                )}
                
                <div className="mt-8 flex flex-wrap justify-between items-center gap-4 pb-10 relative w-full">
                  <div className="flex-1 flex justify-start gap-2 flex-wrap">
                    {roundHistory.length > 0 && (
                      <ActionButton
                        onClick={() => { playSound('click'); setShowReportCardModal(true); }}
                        variant="outline-gold"
                        className="text-xs py-2.5 px-4 flex items-center gap-2"
                        title="View Cumulative Grammar Report Card"
                      >
                        <span>📜</span>
                        <span>Ledger ({roundHistory.length})</span>
                      </ActionButton>
                    )}
                    <ActionButton
                      onClick={() => handleOpenCloudModal('reports')}
                      variant="outline-gold"
                      className="text-xs py-2.5 px-4 flex items-center gap-2"
                      title="Save or Load Session Report & Table State in Cloud"
                    >
                      <span>☁️</span>
                      <span>Cloud Save</span>
                    </ActionButton>
                  </div>
                  <ActionButton onClick={handleNextRound} playSound={playSound} variant="gold" className="text-lg sm:text-xl py-4 px-12 tracking-[0.15em]">
                      {isGameOver ? 'SETTLE ACCOUNTS & FINISH 🏁' : 'DEAL NEXT HAND ➡️'}
                  </ActionButton>
                  <div className="flex-1 flex justify-end">
                    {!isGameOver && (
                      <ActionButton 
                        onClick={handleEndGameEarly} 
                        variant="outline-red"
                        className="text-xs py-2.5 px-4"
                        title="Cash out and end game early"
                      >
                        Cash Out Early
                      </ActionButton>
                    )}
                  </div>
                </div>
            </div>
            ); 
        }
        case 'GAME_OVER': return (
          <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in p-4 w-full max-w-4xl mx-auto">
            <div className="text-xs font-serif uppercase tracking-[0.35em] text-amber-800 dark:text-[#d4af37] mb-2 font-bold">
              Salon Privé · Final Settlement
            </div>
            <h1 className="text-5xl sm:text-7xl font-black text-gold mb-3 tracking-wider font-display title-glow">
              TABLE CLOSED
            </h1>
            <div className="h-[1px] w-48 bg-gradient-to-r from-transparent via-[#d4af37] to-transparent mb-12"></div>
            
            {winner ? (
              <div className="relative group w-full max-w-lg mb-8">
                <div className="absolute inset-0 bg-gradient-to-b from-amber-400 to-amber-700 blur-2xl opacity-25 group-hover:opacity-40 transition-opacity duration-1000 rounded-full"></div>
                <div className="luxury-card rounded-2xl p-8 sm:p-10 text-center relative border-2 border-[#d4af37] shadow-[0_0_50px_rgba(212,175,55,0.3)]">
                    <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 text-6xl filter drop-shadow-lg animate-bounce">👑</div>
                    
                    <div className="mt-6 mb-4">
                        <div className="w-28 h-28 mx-auto mb-4 rounded-full border-4 border-[#d4af37] bg-gradient-to-b from-amber-50 to-amber-100 dark:from-[#0d3520] dark:to-[#04150c] flex items-center justify-center text-7xl shadow-2xl">
                          {winner.avatar}
                        </div>
                        <h2 className="text-4xl sm:text-5xl font-serif font-extrabold text-slate-900 dark:text-amber-50 mb-2 uppercase tracking-wider">
                          {winner.name}
                        </h2>
                        <div className="text-amber-800 dark:text-[#fef08a] text-xs uppercase tracking-[0.3em] font-bold">
                          {gameMode === 'targetAmount' ? 'Target Bankroll Champion' : gameMode === 'rounds' ? 'Highest Bankroll Champion' : 'Grand Salon Champion'}
                        </div>
                        {gameMode === 'targetAmount' && (
                          <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mt-1.5 font-mono-casino">
                            🎯 Surpassed the ${Number(targetAmount).toLocaleString()} Vault Goal!
                          </div>
                        )}
                    </div>
                    
                    <div className="felt-well rounded-xl p-6 mt-6">
                        <div className="text-slate-600 dark:text-amber-200/70 text-xs font-serif uppercase tracking-[0.25em] mb-1 font-bold">
                          Final Vault Balance
                        </div>
                        <div className="text-5xl sm:text-6xl font-mono-casino font-black text-gold-flat mb-4">
                          ${winner.money.toLocaleString()}
                        </div>
                        <div className="flex justify-center pt-3 border-t border-[#d4af37]/20">
                          <ChipRack amount={winner.money} size="sm" />
                        </div>
                    </div>
                </div>
              </div>
            ) : (
               <div className="luxury-card rounded-2xl p-12 text-center border-2 border-[#d4af37]/40 max-w-lg shadow-2xl mb-8">
                 <div className="text-7xl mb-5 opacity-70">🏛️</div>
                 <h2 className="text-3xl sm:text-4xl font-serif font-extrabold text-slate-800 dark:text-amber-100 mb-2 uppercase tracking-wider">
                   The House Prevails
                 </h2>
                 <p className="text-slate-600 dark:text-amber-200/60 font-editorial italic text-lg">
                   Every challenger at the table has gone bust.
                 </p>
               </div>
            )}

            {/* End-of-Game Grammar Report Card */}
            <div className="w-full mt-4">
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

            <div className="mt-10 flex flex-wrap justify-center items-center gap-4">
                <ActionButton onClick={handleRestartGame} playSound={playSound} variant="gold" className="text-lg py-4 px-12 tracking-[0.15em]">
                    🔄 Open New Table
                </ActionButton>
                <ActionButton onClick={() => handleOpenCloudModal('reports')} playSound={playSound} variant="outline-gold" className="text-sm py-4 px-6 flex items-center gap-2">
                    <span>☁️</span>
                    <span>Save Session / Roster to Cloud</span>
                </ActionButton>
            </div>
          </div>
        );
        default: return <div className="p-20 text-center text-gold font-serif text-2xl animate-pulse">Initializing Table...</div>;
    }
  };

  if (isStudentControllerMode) {
    const initialUrlRoom = typeof window !== 'undefined'
      ? (new URLSearchParams(window.location.search).get('room') || '')
      : '';
    return (
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
          GeminiService.clearSavedTeacherPin();
          setIsTeacherAiUnlocked(false);
          setIsStudentControllerMode(false);
        }}
      />
    );
  }

  return (
    <>
      <div className="game-container felt-noise min-h-screen text-slate-800 dark:text-slate-100 flex flex-col justify-start items-center p-2 md:p-4 selection:bg-amber-500 selection:text-black font-sans transition-colors duration-300">
        {step !== 'PLAYER_SETUP' && ( 
          <div className="fixed top-4 left-4 z-50">
             <ActionButton 
                onClick={handleRestartGame} 
                playSound={playSound} 
                variant="outline-gold"
                className="text-xs py-2 px-4 flex items-center gap-1.5 backdrop-blur-md"
                title="Leave Table & Return to Lobby"
             > 
                <span>&larr;</span>
                <span>Lobby</span>
             </ActionButton> 
          </div>
        )}
        
        {/* Top Controls: Multiplayer Room Badge, Teacher AI / Offline Mode Gate, Theme Toggle & Audio */}
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2.5">
          {mpRoomCode && (
            <button
              type="button"
              onClick={() => {
                playSound('click');
                setShowMpLobbyModal(true);
              }}
              className="h-11 px-3.5 flex items-center gap-2 rounded-full bg-amber-50/95 dark:bg-[#051c10]/95 border border-[#d4af37]/80 hover:border-[#fef08a] text-amber-900 dark:text-[#fef08a] transition-all shadow-[0_4px_15px_rgba(0,0,0,0.4)] hover:scale-105 backdrop-blur-md cursor-pointer font-mono-casino text-xs font-extrabold uppercase tracking-wider"
              title="Open Live Classroom Multiplayer Room Manager & QR Code"
            >
              <span className={`w-2 h-2 rounded-full ${mpHostConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <span>📱 {mpRoomCode}</span>
              <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[10px]">
                {Object.values(mpSeats).filter((s: MultiplayerSeat) => s.connected).length}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handleOpenCloudModal(step === 'PLAYER_SETUP' ? 'rosters' : 'reports')}
            className="h-11 px-3.5 flex items-center gap-2 rounded-full bg-amber-50/95 dark:bg-[#051c10]/95 border border-[#d4af37]/60 hover:border-[#fef08a] text-amber-900 dark:text-[#fef08a] transition-all shadow-[0_4px_15px_rgba(0,0,0,0.4)] hover:scale-105 backdrop-blur-md cursor-pointer font-serif text-xs font-extrabold uppercase tracking-wider"
            title="Open Teacher Cloud Vault (Class Rosters, Session Reports & Cloud Sentence Bank)"
          >
            <span>☁️</span>
            <span className="hidden sm:inline">Cloud</span>
          </button>

          {!desktopStatus.isDesktop && (
            <button
              type="button"
              onClick={handleOpenTeacherPinModal}
              className={`h-11 px-3.5 flex items-center gap-2 rounded-full border transition-all shadow-[0_4px_15px_rgba(0,0,0,0.4)] hover:scale-105 backdrop-blur-md cursor-pointer font-serif text-xs font-extrabold uppercase tracking-wider ${
                isTeacherAiUnlocked
                  ? 'bg-emerald-950/90 border-emerald-400/70 hover:border-emerald-300 text-emerald-200'
                  : 'bg-amber-50/95 dark:bg-[#051c10]/95 border-[#d4af37]/60 hover:border-[#fef08a] text-amber-900 dark:text-[#fef08a]'
              }`}
              title={
                isTeacherAiUnlocked
                  ? 'Live Gemini AI Unlocked (Teacher Mode) — Click to lock or manage Teacher PIN'
                  : 'Offline Curated Bank Mode (0 API usage) — Click to enter Teacher PIN or Sign In with Google for Live AI'
              }
            >
              <span className={`w-2 h-2 rounded-full ${isTeacherAiUnlocked ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span>{isTeacherAiUnlocked ? '✨ Live AI' : '📚 Offline Bank'}</span>
              <span className="text-[11px] opacity-80">{isTeacherAiUnlocked ? '🔓' : '🔒'}</span>
            </button>
          )}

          <button 
            onClick={toggleTheme}
            className="text-lg w-11 h-11 flex items-center justify-center rounded-full bg-amber-50/90 dark:bg-[#051c10]/90 border border-[#d4af37]/60 hover:border-[#fef08a] text-amber-900 dark:text-[#fef08a] transition-all shadow-[0_4px_15px_rgba(0,0,0,0.4)] hover:scale-105 backdrop-blur-md cursor-pointer" 
            aria-label={isDarkMode ? "Switch to Ivory Day Salon" : "Switch to Emerald Night Salon"}
            title={isDarkMode ? "Switch to Ivory Day Salon" : "Switch to Emerald Night Salon"}
          > 
            {isDarkMode ? '☀️' : '🌙'}
          </button>

          <button
            type="button"
            onClick={() => {
              playSound('click');
              setIsProjectorMode(prev => !prev);
            }}
            className={`hidden sm:flex text-lg w-11 h-11 items-center justify-center rounded-full border transition-all shadow-[0_4px_15px_rgba(0,0,0,0.4)] hover:scale-105 backdrop-blur-md cursor-pointer ${
              isProjectorMode
                ? 'bg-amber-400 border-amber-200 text-slate-950 ring-2 ring-amber-300/70'
                : 'bg-amber-50/90 dark:bg-[#051c10]/90 border-[#d4af37]/60 hover:border-[#fef08a] text-amber-900 dark:text-[#fef08a]'
            }`}
            aria-pressed={isProjectorMode}
            aria-label="Projector mode: larger, solid text for the back of the room"
            title={isProjectorMode ? 'Projector mode is on: click for normal text' : 'Projector mode: larger, solid text for the back of the room'}
          >
            📽️
          </button>

          {audioReady && (
            <button 
              onClick={() => { 
                const newMutedState = !isMuted; 
                setIsMuted(newMutedState); 
                if (newMutedState && 'speechSynthesis' in window) { 
                  window.speechSynthesis.cancel(); 
                } 
                playSound('click'); 
              }} 
              className="text-lg w-11 h-11 flex items-center justify-center rounded-full bg-amber-50/90 dark:bg-[#051c10]/90 border border-[#d4af37]/60 hover:border-[#fef08a] text-amber-900 dark:text-[#fef08a] transition-all shadow-[0_4px_15px_rgba(0,0,0,0.4)] hover:scale-105 backdrop-blur-md cursor-pointer" 
              aria-label={isMuted ? "Unmute" : "Mute"}
              title={isMuted ? "Unmute Casino Audio" : "Mute Casino Audio"}
            > 
              {isMuted ? '🔇' : '🔊'} 
            </button>
          )}
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
      {error && (<Modal title={error.title} onClose={() => setError(null)} playSound={playSound}><p className="text-lg text-slate-700 dark:text-slate-300 leading-relaxed">{error.message}</p></Modal>)}
      {historyPlayer && ( 
        <Modal title={`${historyPlayer.name}'s History`} onClose={() => setHistoryPlayer(null)} playSound={playSound}> 
          <div className="space-y-4 text-left max-h-[60vh] overflow-y-auto pr-2 modal-content-scroll"> 
            {historyPlayer.history.length > 0 ? ( 
              historyPlayer.history.map((item, index) => ( 
                <div key={index} className="bg-amber-50/70 dark:bg-slate-900/50 border border-amber-200 dark:border-slate-700 p-4 rounded-lg shadow-sm"> 
                  <div className="flex justify-between mb-2">
                    <span className="font-bold text-amber-700 dark:text-amber-500 text-sm uppercase tracking-wide">Round {item.round}</span> 
                    <span className={`font-mono font-bold ${item.amount >= 0 ? 'text-emerald-600 dark:text-green-400' : 'text-rose-600 dark:text-red-400'}`}> 
                        {item.amount >= 0 ? '+' : ''}{item.amount}
                    </span> 
                  </div>
                  <p className="text-sm text-slate-700 dark:text-slate-400 italic mb-3 font-serif">"{item.sentence}"</p> 
                  <div className="flex justify-between text-xs text-slate-500 border-t border-amber-200/60 dark:border-slate-800 pt-2">
                    <span>Spent: ${item.spent}</span>
                    <span className="text-slate-700 dark:text-slate-300 font-bold">Total: ${item.endTotal}</span>
                  </div>
                </div> 
              )) 
            ) : ( <p className="text-center py-10 text-slate-500 italic">No history recorded yet.</p> )} 
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
                <p className="text-xl text-slate-800 dark:text-slate-200 font-medium leading-relaxed whitespace-pre-line">{showPowerUpModal.message}</p> 
            </div> 
        </Modal>
      }
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
                  <p className="text-center mb-4 text-lg text-slate-600 dark:text-slate-400 font-serif italic border-b border-slate-200 dark:border-slate-700 pb-3">
                    "{powerUpInfo.description}"
                  </p> 

                  {isSwap && buyerPlayer && (
                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/50 text-center text-xs font-serif text-amber-900 dark:text-amber-200 shadow-sm">
                      <div className="flex items-center justify-center gap-1.5 font-sans mb-1">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">Your Current Vault:</span>
                        <span className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-100/70 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
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
                      const hasShield = !ignoresShield && targetActivePowerUps.some(pu => pu.type === 'SHIELD' || pu.type === 'GUARDIAN_ANGEL');
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
                              <span className="text-2xl select-none">{p.avatar}</span>
                              <div className="text-left truncate">
                                <span className="font-bold text-lg tracking-wide block truncate">{p.name}</span>
                                {isShielded && (
                                  <span className="text-[10px] text-amber-300 font-bold uppercase tracking-wider block">
                                    🛡️ {alreadyAttacked ? 'Already Targeted This Hand' : 'Shield Active'}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 font-mono font-bold text-emerald-400 dark:text-emerald-300 bg-black/40 px-3 py-1 rounded-lg border border-emerald-500/30 text-base shadow-inner shrink-0">
                              <span className="text-xs opacity-75">💰</span>
                              <span>${p.money.toLocaleString()}</span>
                            </div>
                          </div>
                      </ActionButton>
                  )})) : <p className="text-center text-slate-500 py-4">No available targets.</p>}
                  </div>

                  {!isSwap && (
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
            title={modalPlayer ? `Pick Avatar for ${modalPlayer.name}` : "Select Avatar"} 
            onClose={() => setShowAvatarModal(null)} 
            playSound={playSound}
          >
            <div className="space-y-4">
              {modalPlayer && (
                <div className="flex items-center justify-between px-3 py-2 bg-amber-50 dark:bg-[#0a1f14] border border-amber-200 dark:border-amber-800/60 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Current:</span>
                    <span className="text-2xl">{modalPlayer.avatar || '👤'}</span>
                    <span className="font-serif font-bold text-slate-900 dark:text-white uppercase">{modalPlayer.name}</span>
                  </div>
                  <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">Choose below:</span>
                </div>
              )}
              <div className="grid grid-cols-5 sm:grid-cols-6 gap-3 max-h-[55vh] overflow-y-auto p-2 modal-content-scroll">
                {AVATARS.map(avatar => {
                  const isCurrent = modalPlayer?.avatar === avatar;
                  return (
                    <button 
                      key={avatar}
                      type="button"
                      onClick={() => handleUpdateAvatar(showAvatarModal.playerId, avatar)}
                      className={`text-3xl p-3 rounded-lg transition-all shadow-sm hover:shadow-lg hover:scale-110 transform duration-100 cursor-pointer relative ${
                        isCurrent
                          ? 'bg-amber-100 dark:bg-amber-950/80 border-2 border-amber-500 ring-2 ring-amber-400/40'
                          : 'bg-slate-100 dark:bg-slate-800 hover:bg-amber-500 dark:hover:bg-amber-600 border border-slate-200 dark:border-transparent'
                      }`}
                      title={isCurrent ? 'Current avatar' : `Select ${avatar}`}
                    >
                      {avatar}
                      {isCurrent && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-black rounded-full text-[9px] font-bold flex items-center justify-center shadow">
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
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
        <Modal title="Load Game" onClose={() => setPendingLoadGame(null)} playSound={playSound} hideOkButton>
          <div className="space-y-6">
            <div className="bg-amber-50/70 dark:bg-slate-900/50 p-4 rounded-lg border border-amber-200 dark:border-slate-700">
              <h3 className="text-amber-800 dark:text-amber-400 font-bold uppercase tracking-widest text-sm mb-4">Game Info</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-slate-500">Mode:</span> <span className="text-slate-800 dark:text-white capitalize font-semibold">{pendingLoadGame.gameMode === 'lastPlayer' ? 'Last Survivor' : pendingLoadGame.gameMode === 'rounds' ? 'Fixed Rounds' : 'Target Bankroll'}</span></div>
                <div>
                  <span className="text-slate-500">{pendingLoadGame.gameMode === 'targetAmount' ? 'Goal:' : 'Round:'}</span>{" "}
                  <span className="text-slate-800 dark:text-white font-semibold">
                    {pendingLoadGame.gameMode === 'targetAmount' ? `$${(pendingLoadGame.targetAmount || 2000).toLocaleString()}` : `${pendingLoadGame.currentRound} / ${pendingLoadGame.totalRounds}`}
                  </span>
                </div>
                <div><span className="text-slate-500">Topic:</span> <span className="text-slate-800 dark:text-white font-semibold">{pendingLoadGame.settings?.topic}</span></div>
                <div><span className="text-slate-500">Level:</span> <span className="text-slate-800 dark:text-white font-semibold">{pendingLoadGame.settings?.level}</span></div>
              </div>
            </div>
            <div className="bg-amber-50/70 dark:bg-slate-900/50 p-4 rounded-lg border border-amber-200 dark:border-slate-700">
              <h3 className="text-amber-800 dark:text-amber-400 font-bold uppercase tracking-widest text-sm mb-4">Players ({pendingLoadGame.players?.length || 0})</h3>
              <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 modal-content-scroll">
                {pendingLoadGame.players?.map((p: any) => (
                  <div key={p.id} className="flex justify-between items-center bg-white/80 dark:bg-black/30 p-2 rounded border border-amber-200/50 dark:border-transparent">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{p.avatar || '👤'}</span>
                      <span className="text-slate-800 dark:text-white font-bold">{p.name}</span>
                    </div>
                    <span className="text-emerald-600 dark:text-emerald-400 font-mono font-bold">${p.money}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-4 pt-4">
              <ActionButton onClick={() => setPendingLoadGame(null)} playSound={playSound} variant="outline-gold" className="flex-1 py-3">Cancel</ActionButton>
              <ActionButton onClick={handleConfirmLoadGame} playSound={playSound} variant="gold" className="flex-1 py-3">Load Game</ActionButton>
            </div>
          </div>
        </Modal>
      )}
      {showReportCardModal && (
        <Modal 
          title="Grammar Casino - Report Card" 
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
          playSound={playSound}
        />
      )}
      {mpRoomCode && mpTakeoverRequests.length > 0 && (() => {
        const request = mpTakeoverRequests[0];
        return (
          <div
            role="alertdialog"
            aria-live="assertive"
            aria-label={`New phone wants to play as ${request.name}`}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] w-[min(92vw,30rem)] rounded-2xl border-2 border-[#d4af37] bg-amber-50 dark:bg-[#051c10] text-amber-950 dark:text-amber-50 shadow-[0_10px_40px_rgba(0,0,0,0.55)] p-4"
          >
            <div className="flex items-start gap-3">
              <span className="text-3xl leading-none" aria-hidden="true">{request.avatar || '📱'}</span>
              <div className="flex-1 min-w-0">
                <p className="font-serif font-extrabold text-base">
                  A new phone wants to play as {request.name}.
                </p>
                <p className="text-sm mt-1 text-amber-900 dark:text-amber-100">
                  {request.name}'s seat is already on another phone. Only say yes if {request.name} really changed phones: the new phone sees and controls their bet, and the old one is signed out.
                </p>
                {mpTakeoverRequests.length > 1 && (
                  <p className="text-sm mt-1 font-semibold">+{mpTakeoverRequests.length - 1} more waiting</p>
                )}
                <div className="flex flex-wrap gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => {
                      playSound('click');
                      mpControllerRef.current?.answerSeatTakeover(request.clientId, true);
                      setMpTakeoverRequests(prev => prev.filter(r => r.clientId !== request.clientId));
                    }}
                    className="px-4 py-2 rounded-full bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-sm"
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
                    className="px-4 py-2 rounded-full bg-rose-700 hover:bg-rose-600 text-white font-bold text-sm"
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
          onToggleLockRoom={handleToggleLockMpRoom}
          onKickPlayer={handleKickMpPlayer}
          onCloseRoom={handleCloseMpRoom}
          onBailoutBankruptPlayers={handleBailoutBankruptPlayers}
          playSound={playSound}
        />
      )}
      {showTeacherPinModal && (
        <Modal
          title={isTeacherAiUnlocked ? 'Teacher Live AI Unlocked' : 'Offline Curated Mode · Teacher Unlock'}
          onClose={() => setShowTeacherPinModal(false)}
          playSound={playSound}
          hideOkButton
        >
          <div className="space-y-4 text-left">
            <div
              className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                isTeacherAiUnlocked
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-950 dark:text-emerald-100'
                  : 'bg-amber-500/10 border-[#d4af37]/40 text-amber-950 dark:text-amber-100'
              }`}
            >
              <span className="text-2xl select-none mt-0.5">{isTeacherAiUnlocked ? '✨' : '📚'}</span>
              <div className="text-xs sm:text-sm leading-relaxed">
                {isTeacherAiUnlocked ? (
                  <>
                    <strong className="font-serif uppercase tracking-wider block text-emerald-800 dark:text-emerald-300 mb-0.5">
                      Live Gemini AI &amp; Live Room Hosting Active (Current Game Only)
                    </strong>
                    This session is authorized to host a Live Classroom Room (QR) and generate dynamic AI sentences, AI Judge verifications, AI hints, and neural speech. For security, Live Mode is never saved in browser storage and automatically locks when the game finishes, when you return to the lobby, or if the URL is edited/reloaded.
                  </>
                ) : (
                  <>
                    <strong className="font-serif uppercase tracking-wider block text-amber-900 dark:text-[#fef08a] mb-0.5">
                      Playing in Free Offline Curated Mode (0 API Usage)
                    </strong>
                    Students and visitors without the Teacher PIN play in 100% free Offline Curated Mode (0 Gemini API calls) and cannot host a Live Classroom Room. Enter your Teacher PIN below to unlock Live Gemini AI and Live Room Hosting for the current game session.
                  </>
                )}
              </div>
            </div>

            {teacherPinNotice && (
              <div
                className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
                  teacherPinNotice.type === 'success'
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-800 dark:text-emerald-200'
                    : 'bg-rose-500/15 border-rose-500/40 text-rose-800 dark:text-rose-200'
                }`}
              >
                <span>{teacherPinNotice.type === 'success' ? '✓' : '⚠️'}</span>
                <span>{teacherPinNotice.text}</span>
              </div>
            )}

            {!isTeacherAiUnlocked ? (
              <div className="space-y-4 pt-1">
                {/* Option 1: Google Sign-In */}
                <div className="p-3.5 rounded-xl felt-well border border-[#d4af37]/40 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-serif font-bold uppercase tracking-wider text-slate-800 dark:text-[#fef08a]">
                      Option 1 · Verified Teacher Google Account
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-amber-200/70">
                      Sign in with your Google Teacher account to unlock Live AI &amp; Cloud Vault
                    </div>
                  </div>
                  <ActionButton
                    type="button"
                    onClick={handleSignInWithGoogle}
                    playSound={playSound}
                    variant="gold"
                    disabled={isSigningInGoogle || isVerifyingTeacherPin}
                    className="py-2 px-4 text-xs"
                  >
                    {isSigningInGoogle ? 'Signing In...' : '🔐 Sign In with Google'}
                  </ActionButton>
                </div>

                {/* Option 2: Teacher PIN */}
                <form onSubmit={handleUnlockTeacherPin} className="space-y-3 pt-1">
                  <div>
                    <label className="block text-xs font-serif font-bold uppercase tracking-wider text-slate-700 dark:text-amber-200 mb-1.5">
                      Option 2 · Enter Teacher PIN to Unlock Live AI
                    </label>
                    <input
                      type="password"
                      value={teacherPinInput}
                      onChange={(e) => setTeacherPinInput(e.target.value)}
                      placeholder="Enter Teacher PIN..."
                      autoFocus
                      className="w-full px-3.5 py-2.5 rounded-xl felt-well border border-[#d4af37]/60 focus:border-[#fef08a] focus:outline-none text-slate-900 dark:text-white font-mono-casino text-base tracking-widest"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2.5 pt-2">
                    <ActionButton
                      type="button"
                      onClick={() => setShowTeacherPinModal(false)}
                      playSound={playSound}
                      variant="outline-gold"
                      className="py-2.5 px-4 text-xs"
                    >
                      Stay in Offline Mode
                    </ActionButton>
                    <ActionButton
                      type="submit"
                      playSound={playSound}
                      variant="gold"
                      disabled={!teacherPinInput.trim() || isVerifyingTeacherPin}
                      className="py-2.5 px-6 text-xs"
                    >
                      {isVerifyingTeacherPin ? 'Verifying...' : '🔑 Unlock with PIN'}
                    </ActionButton>
                  </div>
                </form>
              </div>
            ) : (
              <div className="space-y-4 pt-1">
                {teacherGoogleEmail && (
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-900 dark:text-emerald-200 flex items-center justify-between">
                    <span>Signed in as <strong>{teacherGoogleEmail}</strong></span>
                    <span className="text-[10px] uppercase tracking-wider font-mono-casino px-2 py-0.5 rounded bg-emerald-500/20">Google Verified</span>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <ActionButton
                    type="button"
                    onClick={handleLockTeacherPin}
                    playSound={playSound}
                    variant="outline-red"
                    className="py-2.5 px-4 text-xs"
                  >
                    🔒 Lock &amp; Switch to Offline Mode
                  </ActionButton>

                  <div className="flex items-center gap-2">
                    <ActionButton
                      type="button"
                      onClick={() => {
                        setShowTeacherPinModal(false);
                        setShowCloudModal(true);
                      }}
                      playSound={playSound}
                      variant="outline-gold"
                      className="py-2 px-3.5 text-xs"
                    >
                      ☁️ Open Cloud Vault
                    </ActionButton>
                    <button
                      type="button"
                      onClick={() => {
                        playSound('click');
                        setShowChangePinForm((prev) => !prev);
                        setTeacherPinNotice(null);
                      }}
                      className="text-xs font-serif font-bold uppercase tracking-wider text-amber-800 dark:text-[#fef08a] hover:underline cursor-pointer px-2 py-1"
                    >
                      {showChangePinForm ? 'Cancel PIN Change' : '⚙️ Change PIN'}
                    </button>
                  </div>
                </div>

                {showChangePinForm && (
                  <form
                    onSubmit={handleChangeTeacherPin}
                    className="p-3.5 rounded-xl felt-well border border-[#d4af37]/40 space-y-3"
                  >
                    <div className="text-xs font-serif font-bold uppercase tracking-wider text-amber-900 dark:text-[#fef08a]">
                      Update Server Teacher PIN
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-600 dark:text-amber-200/75 mb-1">
                        New Teacher PIN (4–32 characters)
                      </label>
                      <input
                        type="password"
                        value={newTeacherPinInput}
                        onChange={(e) => setNewTeacherPinInput(e.target.value)}
                        placeholder="Enter new PIN..."
                        className="w-full px-3 py-2 rounded-lg bg-white/80 dark:bg-black/50 border border-[#d4af37]/50 text-slate-900 dark:text-white font-mono-casino text-sm focus:outline-none"
                      />
                    </div>
                    <div className="flex justify-end">
                      <ActionButton
                        type="submit"
                        variant="gold"
                        disabled={newTeacherPinInput.trim().length < 4 || isVerifyingTeacherPin}
                        className="py-2 px-4 text-xs"
                      >
                        {isVerifyingTeacherPin ? 'Saving...' : 'Save New PIN'}
                      </ActionButton>
                    </div>
                  </form>
                )}

                <div className="flex justify-end pt-1 border-t border-[#d4af37]/20">
                  <ActionButton
                    onClick={() => setShowTeacherPinModal(false)}
                    playSound={playSound}
                    variant="outline-gold"
                    className="py-2 px-5 text-xs"
                  >
                    Done
                  </ActionButton>
                </div>
              </div>
            )}
          </div>
        </Modal>
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
          onLoadRoster={handleLoadCloudRoster}
          onLoadFullGameState={handleApplyCloudFullGameState}
          onActiveRosterUpdated={(roster: CloudRoster) => setActiveCloudRoster({ id: roster.id, className: roster.name })}
          playSound={playSound}
          teacherEmail={teacherGoogleEmail}
          isDesktopApp={desktopStatus.isDesktop}
        />
      )}
    </>
  );
}
