// The hand in play: the sentence, the seats, bets and the controls (package F7: moved out of App.tsx without changes).

import { useGame } from '../state/gameStore';
import { getRevealGate } from '../game/revealGate';
import { presenceSummary } from '../game/presence';
import { isFrozenBySubZero } from '../game/status';
import React from 'react';
import { getBetCap, getDisplayedMinBet, getHighRoller } from '../game/betLimits';
import { Player, Settings, Bet, PowerUpKey, ActivePowerUp, SoundEffect, PlayerTurnTimer, QuestionType } from '../types';
import { POWER_UPS, TURN_TIMER_OPTIONS, CHALLENGE_FORMATS, getEffectiveMixedFormats, CLOZE_DISABLED_POWER_UPS, BINARY_DISABLED_POWER_UPS, MP_ONLY_POWER_UPS } from '../constants';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Lock, LockOpen, Smartphone, Volume2, Pencil, RotateCcw, Eye, Pause, WifiOff, Flag, Clock } from 'lucide-react';
import ActionButton from '../components/ActionButton';
import PlayerBettingCard from '../components/PlayerBettingCard';
import PlayerTileGrid, { PlayerTile, SeatStatus } from '../components/PlayerTileGrid';
import { PlayerAvatar } from '../components/PlayerAvatar';
import CountUp from '../components/CountUp';
import { MultiplayerRoundTimerFrame } from '../components/TurnTimer';
import SentenceText from '../components/SentenceText';
import PowerUpTooltip from '../components/PowerUpTooltip';
import { SettingsModalTab } from '../components/RoundSettingsModal';
import { isBetCompleteForQuestionType, buildAudiencePollSummary } from '../utils/multiplayerProtocol';
import * as GeminiService from '../services/geminiService';
import { sentenceStatus } from '../game/aiStatus';
import { type SpecialHand } from '../game/specialHands';
import { isGapType, isOptionType, questionTypeLabel } from '../game/questionTypes';
import { SpotErrorSentence, WordTiles, newFormatTask } from '../components/NewFormatSentence';
import { STICKY_TOP_PX } from './layout';

export interface HandScreenProps {
  activePlayers: Player[];
  isPlayerFrozen: (playerId: number) => boolean;
  isTurnTimerEnabled: boolean;
  hasPlayerPlacedBet: (playerId: number) => boolean;
  handleMpUnlockPlayer: (playerId: number) => void;
  handleBetChange: (playerId: number, field: keyof Bet, value: any, ignoreLock?: boolean) => void;
  handleGetHint: (playerId: number) => Promise<void>;
  playSound: (sound: SoundEffect, ...args: any[]) => void;
  handleBuyRandomPowerUp: (playerId: number) => void;
  handleUpdatePlayerMoney: (playerId: number, newAmount: number) => void;
  handleOpenAvatarModal: (playerId: number) => void;
  handleUpdatePlayerName: (playerId: number, newName: string) => void;
  turnDurationMs: number;
  canPlayerAct: (playerId: number) => boolean;
  handleTimerStart: (playerId: number) => void;
  handleTimerPause: (playerId: number) => void;
  handleTimerAddTime: (playerId: number) => void;
  handleTimerLockNow: (playerId: number) => void;
  handleTimerUnlock: (playerId: number) => void;
  openSeatPlayerId: number;
  isSentenceHeaderStuck: boolean;
  isProjectorMode: boolean;
  desktopStatus: GeminiService.DesktopStatus;
  sentenceHeaderRef: React.RefObject<HTMLDivElement>;
  specialHandLabel: string;
  handsLeftLabel: string;
  handleCopySentence: () => void;
  isCopied: boolean;
  speakText: (text: string | null) => Promise<void>;
  isSpeaking: boolean;
  handleToggleSettingsDeckExpanded: () => void;
  isSettingsDeckExpanded: boolean;
  isSentenceHiddenForListening: boolean;
  handleOpenSettingsModal: (tab?: SettingsModalTab) => void;
  mpAutoStartedRoundRef: React.RefObject<number>;
  handleToggleAllPowerUps: (activateAll: boolean) => void;
  setShowDeckConfigModal: React.Dispatch<React.SetStateAction<boolean>>;
  handleTogglePowerUpInDeck: (key: PowerUpKey) => void;
  handleMpRoundTimerStart: () => void;
  handleMpRoundTimerPause: () => void;
  handleMpRoundTimerAddTime: () => void;
  handleMpRoundTimerLockNow: () => void;
  handleMpRoundTimerReset: () => void;
  setShowMpLobbyModal: React.Dispatch<React.SetStateAction<boolean>>;
  effectiveTableLayout: "grid" | "cards";
  potNow: number;
  lastPotShown: React.RefObject<number>;
  setTableLayoutPref: React.Dispatch<React.SetStateAction<"grid" | "cards">>;
  openSeatRef: React.RefObject<HTMLDivElement>;
  setOpenSeatPlayerId: React.Dispatch<React.SetStateAction<number>>;
  setIsSentenceHeaderStuck: React.Dispatch<React.SetStateAction<boolean>>;
  isTableView: boolean;
  currentSpecialHand: SpecialHand;
  handleRevealResults: (force?: unknown) => Promise<void>;
  setConfirmAction: React.Dispatch<React.SetStateAction<{ title: string; message: string; confirmLabel: string; onConfirm: () => void; }>>;
  handleSwapSentence: () => void;
  gameClock: string;
}

export function HandScreen({
  activePlayers,
  isPlayerFrozen,
  isTurnTimerEnabled,
  hasPlayerPlacedBet,
  handleMpUnlockPlayer,
  handleBetChange,
  handleGetHint,
  playSound,
  handleBuyRandomPowerUp,
  handleUpdatePlayerMoney,
  handleOpenAvatarModal,
  handleUpdatePlayerName,
  turnDurationMs,
  canPlayerAct,
  handleTimerStart,
  handleTimerPause,
  handleTimerAddTime,
  handleTimerLockNow,
  handleTimerUnlock,
  openSeatPlayerId,
  isSentenceHeaderStuck,
  isProjectorMode,
  desktopStatus,
  sentenceHeaderRef,
  specialHandLabel,
  handsLeftLabel,
  handleCopySentence,
  isCopied,
  speakText,
  isSpeaking,
  handleToggleSettingsDeckExpanded,
  isSettingsDeckExpanded,
  isSentenceHiddenForListening,
  handleOpenSettingsModal,
  mpAutoStartedRoundRef,
  handleToggleAllPowerUps,
  setShowDeckConfigModal,
  handleTogglePowerUpInDeck,
  handleMpRoundTimerStart,
  handleMpRoundTimerPause,
  handleMpRoundTimerAddTime,
  handleMpRoundTimerLockNow,
  handleMpRoundTimerReset,
  setShowMpLobbyModal,
  effectiveTableLayout,
  potNow,
  lastPotShown,
  setTableLayoutPref,
  openSeatRef,
  setOpenSeatPlayerId,
  setIsSentenceHeaderStuck,
  isTableView,
  currentSpecialHand,
  handleRevealResults,
  setConfirmAction,
  handleSwapSentence,
  gameClock,
}: HandScreenProps) {
  // Package F6: the game in play comes from the store, not through props.
  const players = useGame(s => s.players);
  const currentRound = useGame(s => s.currentRound);
  const currentSentence = useGame(s => s.currentSentence);
  const bets = useGame(s => s.bets);
  const hints = useGame(s => s.hints);
  const isSentenceRevealed = useGame(s => s.isSentenceRevealed);
  const highlightedPhrase = useGame(s => s.highlightedPhrase);
  const teacherRevealOverride = useGame(s => s.teacherRevealOverride);
  const turnTimers = useGame(s => s.turnTimers);
  const settings = useGame(s => s.settings);
  const gameMode = useGame(s => s.gameMode);
  const totalRounds = useGame(s => s.totalRounds);
  const targetAmount = useGame(s => s.targetAmount);
  const freeDraws = useGame(s => s.freeDraws);
  const powerUpsUsedThisRound = useGame(s => s.powerUpsUsedThisRound);
  const activePowerUps = useGame(s => s.activePowerUps);
  const selectedPowerUps = useGame(s => s.selectedPowerUps);
  const setTeacherRevealOverride = useGame(s => s.setTeacherRevealOverride);
  const setIsPaused = useGame(s => s.setIsPaused);
  const setTurnTimers = useGame(s => s.setTurnTimers);
  const setTotalRounds = useGame(s => s.setTotalRounds);
  const secondLookRound = useGame(s => s.secondLookRound);
  const turnTimerSeconds = useGame(s => s.turnTimerSeconds);
  const autoStartNextTimer = useGame(s => s.autoStartNextTimer);
  const isLoading = useGame(s => s.isLoading);
  const isProcessing = useGame(s => s.isProcessing);
  const processingStatus = useGame(s => s.processingStatus);
  const nextRoundSettings = useGame(s => s.nextRoundSettings);
  const mpRoomCode = useGame(s => s.mpRoomCode);
  const mpSeats = useGame(s => s.mpSeats);
  const mpAwayIds = useGame(s => s.mpAwayIds);
  const mpRoundTimer = useGame(s => s.mpRoundTimer);
  const mpHideProjectorBets = useGame(s => s.mpHideProjectorBets);
  const setListenShownRound = useGame(s => s.setListenShownRound);
  const setTurnTimerSeconds = useGame(s => s.setTurnTimerSeconds);
  const setAutoStartNextTimer = useGame(s => s.setAutoStartNextTimer);
  const setMpRoundTimer = useGame(s => s.setMpRoundTimer);
  const setMpHideProjectorBets = useGame(s => s.setMpHideProjectorBets);
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
