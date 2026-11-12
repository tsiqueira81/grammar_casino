// The hand in play: the sentence, the seats, bets and the controls (package F7: moved out of App.tsx without changes).

import { HandSentenceCard } from './hand/HandSentenceCard';
import { HandTurnBar } from './hand/HandTurnBar';
import { HandRoomBar } from './hand/HandRoomBar';
import { HandTable } from './hand/HandTable';
import { HandControlBar } from './hand/HandControlBar';
import { useGame } from '../state/gameStore';
import { getRevealGate } from '../game/revealGate';
import { isFrozenBySubZero } from '../game/status';
import React from 'react';
import { getBetCap, getDisplayedMinBet, getHighRoller } from '../game/betLimits';
import { Player, Settings, Bet, PowerUpKey, ActivePowerUp, SoundEffect, QuestionType } from '../types';
import { POWER_UPS, CHALLENGE_FORMATS, getEffectiveMixedFormats } from '../constants';
import { Lock, LockOpen } from 'lucide-react';
import PlayerBettingCard from '../components/PlayerBettingCard';
import { PlayerTile, SeatStatus } from '../components/PlayerTileGrid';
import { SettingsModalTab } from '../components/RoundSettingsModal';
import { buildAudiencePollSummary } from '../utils/multiplayerProtocol';
import * as GeminiService from '../services/geminiService';
import { sentenceStatus } from '../game/aiStatus';
import { type SpecialHand } from '../game/specialHands';
import { isGapType, isOptionType, questionTypeLabel } from '../game/questionTypes';

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
        <HandSentenceCard
          sentenceHeaderRef={sentenceHeaderRef}
          isSentenceHeaderStuck={isSentenceHeaderStuck}
          currentHandFormatBadge={currentHandFormatBadge}
          specialHandLabel={specialHandLabel}
          handsLeftLabel={handsLeftLabel}
          currentQuestionType={currentQuestionType}
          handleCopySentence={handleCopySentence}
          isCopied={isCopied}
          speakText={speakText}
          isSpeaking={isSpeaking}
          handleToggleSettingsDeckExpanded={handleToggleSettingsDeckExpanded}
          isSettingsDeckExpanded={isSettingsDeckExpanded}
          isProjectorMode={isProjectorMode}
          sentenceTextClass={sentenceTextClass}
          isSentenceHiddenForListening={isSentenceHiddenForListening}
          isClozeRound={isClozeRound}
          metaChip={metaChip}
          nextTag={nextTag}
          activeFormatConfig={activeFormatConfig}
          nextFormatConfig={nextFormatConfig}
          desktopStatus={desktopStatus}
          drawerRows={drawerRows}
          handleOpenSettingsModal={handleOpenSettingsModal}
          drawerCell={drawerCell}
          playSound={playSound}
          mpAutoStartedRoundRef={mpAutoStartedRoundRef}
          handleToggleAllPowerUps={handleToggleAllPowerUps}
          drawerLink={drawerLink}
          setShowDeckConfigModal={setShowDeckConfigModal}
          handleTogglePowerUpInDeck={handleTogglePowerUpInDeck}
        />

        <HandTurnBar
          isTurnTimerEnabled={isTurnTimerEnabled}
          turnDurationMs={turnDurationMs}
          allMpPlayersLocked={allMpPlayersLocked}
          mpLockedCount={mpLockedCount}
          unfrozenActivePlayers={unfrozenActivePlayers}
          playSound={playSound}
          handleMpRoundTimerStart={handleMpRoundTimerStart}
          handleMpRoundTimerPause={handleMpRoundTimerPause}
          handleMpRoundTimerAddTime={handleMpRoundTimerAddTime}
          handleMpRoundTimerLockNow={handleMpRoundTimerLockNow}
          handleMpRoundTimerReset={handleMpRoundTimerReset}
          handleOpenSettingsModal={handleOpenSettingsModal}
          desktopStatus={desktopStatus}
          activePlayers={activePlayers}
          isPlayerFrozen={isPlayerFrozen}
          activeTurnPlayer={activeTurnPlayer}
          nextIdlePlayer={nextIdlePlayer}
          handleTimerStart={handleTimerStart}
        />
        <HandRoomBar
          playSound={playSound}
          setShowMpLobbyModal={setShowMpLobbyModal}
          mpLockedCount={mpLockedCount}
          unfrozenActivePlayers={unfrozenActivePlayers}
        />

        <HandTable
          currentQuestionType={currentQuestionType}
          handleMpUnlockPlayer={handleMpUnlockPlayer}
          effectiveTableLayout={effectiveTableLayout}
          potNow={potNow}
          lastPotShown={lastPotShown}
          betsReadyCount={betsReadyCount}
          unfrozenActivePlayers={unfrozenActivePlayers}
          betsReadyWord={betsReadyWord}
          playSound={playSound}
          setTableLayoutPref={setTableLayoutPref}
          openSeatPlayer={openSeatPlayer}
          openSeatRef={openSeatRef}
          playerTiles={playerTiles}
          setOpenSeatPlayerId={setOpenSeatPlayerId}
          setIsSentenceHeaderStuck={setIsSentenceHeaderStuck}
          nextSeatPlayer={nextSeatPlayer}
          renderPlayerSeat={renderPlayerSeat}
          isProjectorMode={isProjectorMode}
          currentSpecialHand={currentSpecialHand}
        />
        <HandControlBar
          canRevealResults={canRevealResults}
          handleRevealResults={handleRevealResults}
          playSound={playSound}
          revealNote={revealNote}
          allMpPlayersLocked={allMpPlayersLocked}
          isTurnTimerEnabled={isTurnTimerEnabled}
          allActivePlayersLocked={allActivePlayersLocked}
          allValidBetsFinalized={allValidBetsFinalized}
          setConfirmAction={setConfirmAction}
          handleSwapSentence={handleSwapSentence}
          gameClock={gameClock}
        />
      </div> 
    ); 
}
