// The sentence card of the hand: the dealt card, the sentence, its chips and settings drawer (moved out of HandScreen, F7).
import type { ChallengeFormatOption } from '../../constants';
import { nextThemeNote, themeLabel } from '../../game/randomTheme';
import { useGame } from '../../state/gameStore';
import React from 'react';
import { PowerUpKey, SoundEffect, PlayerTurnTimer, QuestionType } from '../../types';
import { POWER_UPS, TURN_TIMER_OPTIONS, CHALLENGE_FORMATS, getEffectiveMixedFormats, CLOZE_DISABLED_POWER_UPS, BINARY_DISABLED_POWER_UPS, MP_ONLY_POWER_UPS } from '../../constants';
import { Check, ChevronDown, Copy, Volume2, Pencil } from 'lucide-react';
import SentenceText from '../../components/SentenceText';
import PowerUpTooltip from '../../components/PowerUpTooltip';
import { SettingsModalTab } from '../../components/RoundSettingsModal';
import * as GeminiService from '../../services/geminiService';
import { sentenceStatus } from '../../game/aiStatus';
import { SpotErrorSentence, WordTiles, newFormatTask } from '../../components/NewFormatSentence';
import { STICKY_TOP_PX } from '../layout';

export interface HandSentenceCardProps {
  sentenceHeaderRef: React.RefObject<HTMLDivElement>;
  isSentenceHeaderStuck: boolean;
  currentHandFormatBadge: string;
  specialHandLabel: string;
  handsLeftLabel: string;
  currentQuestionType: QuestionType;
  handleCopySentence: () => void;
  isCopied: boolean;
  speakText: (text: string | null) => Promise<void>;
  isSpeaking: boolean;
  handleToggleSettingsDeckExpanded: () => void;
  isSettingsDeckExpanded: boolean;
  isProjectorMode: boolean;
  sentenceTextClass: "text-lg sm:text-xl lg:text-2xl leading-snug font-semibold" | "text-xl sm:text-2xl lg:text-[1.75rem] leading-snug font-semibold" | "text-base sm:text-lg lg:text-xl leading-snug" | "text-lg sm:text-xl lg:text-2xl leading-snug" | "text-2xl sm:text-3xl lg:text-4xl leading-[1.28] font-semibold" | "text-3xl sm:text-4xl lg:text-[2.85rem] leading-[1.24] font-semibold" | "text-4xl sm:text-5xl lg:text-[3.5rem] leading-[1.22] font-semibold" | "text-xl sm:text-2xl lg:text-3xl leading-[1.3]" | "text-2xl sm:text-3xl lg:text-4xl leading-[1.25]" | "text-3xl sm:text-4xl lg:text-[2.875rem] leading-[1.3]";
  isSentenceHiddenForListening: boolean;
  isClozeRound: boolean;
  metaChip: "inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-gc-line/[0.07] border border-gc-line/[0.12] text-gc-small font-medium text-gc-quiet whitespace-nowrap";
  nextTag: "inline-flex items-center h-5 px-1.5 rounded-full bg-gc-gold text-gc-on-gold text-gc-cap font-bold";
  activeFormatConfig: ChallengeFormatOption;
  nextFormatConfig: ChallengeFormatOption;
  desktopStatus: GeminiService.DesktopStatus;
  drawerRows: { tab: SettingsModalTab; icon: string; label: string; value: string; next?: string | null; note?: string; warn?: boolean; }[];
  handleOpenSettingsModal: (tab?: SettingsModalTab) => void;
  drawerCell: "px-3 py-2 rounded-gc bg-gc-line/[0.05] border border-gc-line/[0.12]";
  playSound: (sound: SoundEffect, ...args: any[]) => void;
  mpAutoStartedRoundRef: React.RefObject<number>;
  handleToggleAllPowerUps: (activateAll: boolean) => void;
  drawerLink: "h-8 px-2.5 rounded-full text-gc-small font-semibold text-gc-ink hover:bg-gc-line/[0.08] transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-turn";
  setShowDeckConfigModal: React.Dispatch<React.SetStateAction<boolean>>;
  handleTogglePowerUpInDeck: (key: PowerUpKey) => void;
}

export function HandSentenceCard({
  sentenceHeaderRef,
  isSentenceHeaderStuck,
  currentHandFormatBadge,
  specialHandLabel,
  handsLeftLabel,
  currentQuestionType,
  handleCopySentence,
  isCopied,
  speakText,
  isSpeaking,
  handleToggleSettingsDeckExpanded,
  isSettingsDeckExpanded,
  isProjectorMode,
  sentenceTextClass,
  isSentenceHiddenForListening,
  isClozeRound,
  metaChip,
  nextTag,
  activeFormatConfig,
  nextFormatConfig,
  desktopStatus,
  drawerRows,
  handleOpenSettingsModal,
  drawerCell,
  playSound,
  mpAutoStartedRoundRef,
  handleToggleAllPowerUps,
  drawerLink,
  setShowDeckConfigModal,
  handleTogglePowerUpInDeck,
}: HandSentenceCardProps) {
  const isSentenceRevealed = useGame(s => s.isSentenceRevealed);
  const isLoading = useGame(s => s.isLoading);
  const currentSentence = useGame(s => s.currentSentence);
  const currentRound = useGame(s => s.currentRound);
  const gameMode = useGame(s => s.gameMode);
  const totalRounds = useGame(s => s.totalRounds);
  const secondLookRound = useGame(s => s.secondLookRound);
  const settings = useGame(s => s.settings);
  const setListenShownRound = useGame(s => s.setListenShownRound);
  const highlightedPhrase = useGame(s => s.highlightedPhrase);
  const nextRoundSettings = useGame(s => s.nextRoundSettings);
  const targetAmount = useGame(s => s.targetAmount);
  const selectedPowerUps = useGame(s => s.selectedPowerUps);
  const turnTimerSeconds = useGame(s => s.turnTimerSeconds);
  const mpRoomCode = useGame(s => s.mpRoomCode);
  const setTurnTimerSeconds = useGame(s => s.setTurnTimerSeconds);
  const setTurnTimers = useGame(s => s.setTurnTimers);
  const setMpRoundTimer = useGame(s => s.setMpRoundTimer);
  return (
    <>
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
                          {themeLabel(settings)}
                          {nextThemeNote(settings, nextRoundSettings) && (
                            <span className={nextTag}>Next: {nextThemeNote(settings, nextRoundSettings)}</span>
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
    </>
  );
}
