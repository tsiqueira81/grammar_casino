// Game setup in two steps: the questions, then the house rules (package F7: moved out of App.tsx without changes).

import { useGame } from '../state/gameStore';
import { APP_VERSION } from '../utils/debugLog';
import { type QualityChoice, type QualityTier } from '../show/quality';
import { deckSummary } from '../game/teacherDeck';
import React from 'react';
import { GeneratedSentence, PowerUpKey, SoundEffect, QuestionType } from '../types';
import { POWER_UPS, GRAMMAR_TOPICS, QUICK_LEXICAL_TOPICS, CEFR_LEVELS, CEFR_DIFFICULTY_PROFILES, THEMES, MIN_TARGET_AMOUNT, TURN_TIMER_OPTIONS, CHALLENGE_FORMATS, ALL_QUESTION_TYPES, getEffectiveMixedFormats } from '../constants';
import { ArrowLeft, ArrowRight, Check, AlertTriangle, Info } from 'lucide-react';
import ActionButton from '../components/ActionButton';
import TextInput from '../components/TextInput';
import { LENGTH_PRESETS, estimateMinutes } from '../game/gameLength';
import { getCefrTopicRuleSpec } from '../utils/cefrGrammarMatrix';
import type { StoredQuality } from '../show/quality';

export interface SetupScreenProps {
  customTopic: string;
  customTheme: string;
  settingsPart: 2 | 1;
  playSound: (sound: SoundEffect, ...args: any[]) => void;
  setSettingsPart: React.Dispatch<React.SetStateAction<2 | 1>>;
  handleAdvanceToSettingsPart2: () => void;
  setCustomTopic: React.Dispatch<any>;
  setCustomTheme: React.Dispatch<any>;
  setMixedFormatSetupWarning: React.Dispatch<React.SetStateAction<string>>;
  mixedFormatSetupWarning: string;
  ownDeckItems: GeneratedSentence[];
  ownDeck: { text: string; name: string; };
  setOwnDeck: React.Dispatch<React.SetStateAction<{ text: string; name: string; }>>;
  setShowOwnDeck: React.Dispatch<React.SetStateAction<boolean>>;
  mpAutoStartedRoundRef: React.RefObject<number>;
  specialHandsOn: boolean;
  setSpecialHandsOn: React.Dispatch<React.SetStateAction<boolean>>;
  adaptiveLevelOn: boolean;
  setAdaptiveLevelOn: React.Dispatch<React.SetStateAction<boolean>>;
  awardsOn: boolean;
  setAwardsOn: React.Dispatch<React.SetStateAction<boolean>>;
  sayItOn: boolean;
  setSayItOn: React.Dispatch<React.SetStateAction<boolean>>;
  setShowDeckConfigModal: React.Dispatch<React.SetStateAction<boolean>>;
  qualityStored: StoredQuality;
  chooseQuality: (choice: QualityChoice) => void;
  qualityTier: QualityTier;
  handleFinalizeSettings: () => void;
}

export function SetupScreen({
  customTopic,
  customTheme,
  settingsPart,
  playSound,
  setSettingsPart,
  handleAdvanceToSettingsPart2,
  setCustomTopic,
  setCustomTheme,
  setMixedFormatSetupWarning,
  mixedFormatSetupWarning,
  ownDeckItems,
  ownDeck,
  setOwnDeck,
  setShowOwnDeck,
  mpAutoStartedRoundRef,
  specialHandsOn,
  setSpecialHandsOn,
  adaptiveLevelOn,
  setAdaptiveLevelOn,
  awardsOn,
  setAwardsOn,
  sayItOn,
  setSayItOn,
  setShowDeckConfigModal,
  qualityStored,
  chooseQuality,
  qualityTier,
  handleFinalizeSettings,
}: SetupScreenProps) {
  // Package F6: the game in play comes from the store, not through props.
  const players = useGame(s => s.players);
  const setStep = useGame(s => s.setStep);
  const settings = useGame(s => s.settings);
  const gameMode = useGame(s => s.gameMode);
  const totalRounds = useGame(s => s.totalRounds);
  const targetAmount = useGame(s => s.targetAmount);
  const selectedPowerUps = useGame(s => s.selectedPowerUps);
  const setTurnTimers = useGame(s => s.setTurnTimers);
  const setSettings = useGame(s => s.setSettings);
  const setGameMode = useGame(s => s.setGameMode);
  const setTotalRounds = useGame(s => s.setTotalRounds);
  const setTargetAmount = useGame(s => s.setTargetAmount);
  const turnTimerSeconds = useGame(s => s.turnTimerSeconds);
  const autoStartNextTimer = useGame(s => s.autoStartNextTimer);
  const mpRoomCode = useGame(s => s.mpRoomCode);
  const setTurnTimerSeconds = useGame(s => s.setTurnTimerSeconds);
  const setAutoStartNextTimer = useGame(s => s.setAutoStartNextTimer);
  const setMpRoundTimer = useGame(s => s.setMpRoundTimer);
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
