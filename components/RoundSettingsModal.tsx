import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Check, Eye, EyeOff, Info, KeyRound, Lock, Pencil, X } from 'lucide-react';
import { Settings, CEFRLevel, SoundEffect, ChallengeFormat, QuestionType } from '../types';
import { GRAMMAR_TOPICS, QUICK_LEXICAL_TOPICS, THEMES, CEFR_LEVELS, CEFR_DIFFICULTY_PROFILES, CHALLENGE_FORMATS, ALL_QUESTION_TYPES, getEffectiveMixedFormats } from '../constants';
import ActionButton from './ActionButton';
import {
  isDesktopApp,
  getDesktopStatus,
  saveDesktopApiKey,
  removeDesktopApiKey,
  testDesktopApiKey,
  DesktopStatus,
} from '../services/geminiService';

export type SettingsModalTab = 'topic' | 'level' | 'theme' | 'format' | 'ai';

interface RoundSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: SettingsModalTab;
  currentSettings: Settings;
  nextSettings: Settings;
  currentRound: number;
  playSound: (sound: SoundEffect) => void;
  onSaveNextRound: (newSettings: Settings) => void;
  onApplyCurrentRound?: (newSettings: Settings) => void;
}

const EXTENDED_GRAMMAR_TOPICS = [
  { name: 'Collocations', icon: '🤝', desc: 'Make vs do, verb+noun, adj+noun & idiomatic pairings' },
  { name: 'Comparatives and Superlatives', icon: '⚖️', desc: 'As...as, -er/-est, more/most, irregular forms' },
  { name: 'Conditionals', icon: '🔀', desc: 'Zero, First, Second, Third, and Mixed conditionals' },
  { name: 'Tenses', icon: '⏳', desc: 'Present, Past, Future, Perfect, and Continuous forms' },
  { name: 'Passive Voice', icon: '🔄', desc: 'Active to passive, by-agent, causative have/get' },
  { name: 'Modals', icon: '🔑', desc: 'Can, could, must, should, might, deduction & obligation' },
  { name: 'Prepositions', icon: '📍', desc: 'In, on, at, dependent prepositions, prepositional verbs' },
  { name: 'Articles', icon: '📰', desc: 'A, An, The, and Zero Article usage rules' },
  { name: 'Phrasal Verbs', icon: '🧩', desc: 'Separable, inseparable, and multi-word idioms' },
  { name: 'Reported Speech', icon: '💬', desc: 'Tense backshifting, reported questions & commands' },
  { name: 'Relative Clauses', icon: '🔗', desc: 'Defining vs non-defining, who, which, that, where' },
  { name: 'Gerunds and Infinitives', icon: '🎯', desc: 'Verb + -ing vs to-infinitive, meaning shifts' },
  { name: 'Subject-Verb Agreement', icon: '🏛️', desc: 'Singular/plural harmony, collective nouns, inverted' },
];

export const RoundSettingsModal: React.FC<RoundSettingsModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'topic',
  currentSettings,
  nextSettings,
  currentRound,
  playSound,
  onSaveNextRound,
  onApplyCurrentRound,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsModalTab>(initialTab);
  const [selectedTopic, setSelectedTopic] = useState(nextSettings.topic || currentSettings.topic);
  const [customTopicInput, setCustomTopicInput] = useState(
    !EXTENDED_GRAMMAR_TOPICS.some(t => t.name === nextSettings.topic) && !GRAMMAR_TOPICS.includes(nextSettings.topic as any)
      ? nextSettings.topic
      : ''
  );
  const [isCustomTopicMode, setIsCustomTopicMode] = useState(
    !EXTENDED_GRAMMAR_TOPICS.some(t => t.name === nextSettings.topic) && !GRAMMAR_TOPICS.includes(nextSettings.topic as any)
  );

  const [selectedLevel, setSelectedLevel] = useState<CEFRLevel>(nextSettings.level || currentSettings.level);
  const [selectedTheme, setSelectedTheme] = useState(nextSettings.theme || currentSettings.theme);
  const [selectedFormat, setSelectedFormat] = useState<ChallengeFormat>(
    nextSettings.challengeFormat || currentSettings.challengeFormat || 'binary'
  );
  const [selectedMixedFormats, setSelectedMixedFormats] = useState<QuestionType[]>(
    getEffectiveMixedFormats(nextSettings.mixedFormats || currentSettings.mixedFormats)
  );
  const [mixedFormatWarning, setMixedFormatWarning] = useState<string | null>(null);
  const [customThemeInput, setCustomThemeInput] = useState(
    !THEMES.includes(nextSettings.theme as any) ? nextSettings.theme : ''
  );
  const [isCustomThemeMode, setIsCustomThemeMode] = useState(
    !THEMES.includes(nextSettings.theme as any)
  );

  // Desktop AI & Offline states
  const [desktopStatus, setDesktopStatus] = useState<DesktopStatus>({
    isDesktop: false,
    isOnline: true,
    hasKey: false,
    isEncrypted: false,
  });
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKeyText, setShowKeyText] = useState(false);
  const [keyNotice, setKeyNotice] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setSelectedTopic(nextSettings.topic || currentSettings.topic);
      setSelectedLevel(nextSettings.level || currentSettings.level);
      setSelectedTheme(nextSettings.theme || currentSettings.theme);
      setSelectedFormat(nextSettings.challengeFormat || currentSettings.challengeFormat || 'binary');
      setSelectedMixedFormats(getEffectiveMixedFormats(nextSettings.mixedFormats || currentSettings.mixedFormats));
      setMixedFormatWarning(null);

      const isTopicCustom = !EXTENDED_GRAMMAR_TOPICS.some(t => t.name === nextSettings.topic) && !GRAMMAR_TOPICS.includes(nextSettings.topic as any);
      setIsCustomTopicMode(isTopicCustom);
      if (isTopicCustom) setCustomTopicInput(nextSettings.topic);

      const isThemeCustom = !THEMES.includes(nextSettings.theme as any) || nextSettings.theme.startsWith('Custom');
      setIsCustomThemeMode(isThemeCustom);
      if (isThemeCustom) {
        setCustomThemeInput(nextSettings.theme.replace('Custom ✍️', '').trim());
      }

      // Fetch desktop status
      getDesktopStatus().then((status) => {
        setDesktopStatus(status);
      });
      setKeyNotice(null);
      setApiKeyInput('');
    }
  }, [isOpen, initialTab, currentSettings, nextSettings]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { playSound('click'); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, playSound]);

  if (!isOpen) return null;

  const resolvedTopic = isCustomTopicMode ? (customTopicInput.trim() || 'Custom Grammar') : selectedTopic;
  const resolvedTheme = isCustomThemeMode ? (customThemeInput.trim() ? `Custom: ${customThemeInput.trim()} ✍️` : 'Custom ✍️') : selectedTheme;
  const effectiveMixedFormats = getEffectiveMixedFormats(selectedMixedFormats);

  const handleToggleMixedFormatItem = (qType: QuestionType) => {
    const isIncluded = effectiveMixedFormats.includes(qType);
    if (isIncluded) {
      if (effectiveMixedFormats.length <= 1) {
        playSound('error');
        setMixedFormatWarning('Keep at least one question type in the mix.');
        return;
      }
      playSound('click');
      setMixedFormatWarning(null);
      setSelectedMixedFormats(ALL_QUESTION_TYPES.filter(q => effectiveMixedFormats.includes(q) && q !== qType));
    } else {
      playSound('click');
      setMixedFormatWarning(null);
      setSelectedMixedFormats(ALL_QUESTION_TYPES.filter(q => effectiveMixedFormats.includes(q) || q === qType));
    }
  };

  const handleSaveForNext = () => {
    playSound('success');
    onSaveNextRound({
      topic: resolvedTopic,
      level: selectedLevel,
      theme: resolvedTheme,
      challengeFormat: selectedFormat,
      mixedFormats: effectiveMixedFormats,
    });
  };

  const handleApplyNow = () => {
    if (onApplyCurrentRound) {
      playSound('flip');
      onApplyCurrentRound({
        topic: resolvedTopic,
        level: selectedLevel,
        theme: resolvedTheme,
        challengeFormat: selectedFormat,
        mixedFormats: effectiveMixedFormats,
      });
    }
  };

  const handleSaveKey = async () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      setKeyNotice({ type: 'error', text: 'Type or paste a Gemini API key first.' });
      return;
    }
    playSound('click');
    const res = await saveDesktopApiKey(trimmed);
    if (res.success) {
      playSound('success');
      setKeyNotice({
        type: 'success',
        text: 'Key saved. It is encrypted on this computer.',
      });
      setApiKeyInput('');
      const updated = await getDesktopStatus();
      setDesktopStatus(updated);
    } else {
      setKeyNotice({ type: 'error', text: res.error || "The key wasn't saved. Try again." });
    }
  };

  const handleRemoveKey = async () => {
    playSound('click');
    const res = await removeDesktopApiKey();
    if (res.success) {
      playSound('click');
      setKeyNotice({
        type: 'info',
        text: 'Key removed. The game now uses the offline bank.',
      });
      setApiKeyInput('');
      const updated = await getDesktopStatus();
      setDesktopStatus(updated);
    } else {
      setKeyNotice({ type: 'error', text: res.error || "The key wasn't removed. Try again." });
    }
  };

  const handleTestConnection = async () => {
    playSound('click');
    setIsTesting(true);
    setKeyNotice({ type: 'info', text: 'Checking the key with Gemini…' });
    const res = await testDesktopApiKey(apiKeyInput.trim() || undefined);
    setIsTesting(false);
    if (res.valid) {
      playSound('success');
      setKeyNotice({ type: 'success', text: 'The key works. Gemini answered.' });
    } else {
      setKeyNotice({ type: 'error', text: res.error || "The key didn't work. Check the key and the internet connection." });
    }
  };

  const aiOn = desktopStatus.hasKey && desktopStatus.isOnline;
  const selectedFormatConfig = CHALLENGE_FORMATS.find(f => f.id === selectedFormat);
  const mixIcons = effectiveMixedFormats.map(q => CHALLENGE_FORMATS.find(f => f.id === q)?.icon).filter(Boolean).join('');

  // Style A building blocks (the same look as the table setup screen).
  const optionBase = 'rounded-gc border text-left transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-turn';
  const optionOn = 'bg-gc-gold/15 border-gc-gold text-gc-ink';
  const optionOff = 'bg-gc-line/[0.05] border-gc-line/[0.14] text-gc-ink hover:border-gc-line/30';
  const hint = 'text-gc-small text-gc-quiet';
  const card = 'p-4 rounded-gc bg-gc-line/[0.04] border border-gc-line/[0.12]';
  const cardTitle = 'text-gc-body font-bold text-gc-ink';
  const inputCls = 'w-full h-11 px-3 rounded-gc-sm border border-gc-line/[0.2] bg-gc-bg/60 text-gc-body text-gc-ink placeholder:text-gc-quiet/70 focus:outline-none focus:border-gc-gold focus:ring-2 focus:ring-gc-gold/30';
  const smallBtn = 'h-10 px-4 rounded-full text-gc-small font-bold border transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-turn disabled:opacity-40 disabled:cursor-not-allowed';
  const changedDot = <span className="w-2 h-2 rounded-full bg-gc-gold shrink-0" aria-label="changed" />;

  const tabs: { id: SettingsModalTab; label: string; icon: string; changed: boolean }[] = [
    { id: 'topic', label: 'Topic', icon: '📚', changed: resolvedTopic !== currentSettings.topic },
    { id: 'level', label: 'Level', icon: '📊', changed: selectedLevel !== currentSettings.level },
    { id: 'theme', label: 'Theme', icon: '🎭', changed: resolvedTheme !== currentSettings.theme },
    { id: 'format', label: 'Question type', icon: '🎯', changed: selectedFormat !== (currentSettings.challengeFormat || 'binary') },
    { id: 'ai', label: 'Sentences', icon: aiOn ? '⚡' : '💾', changed: false },
  ];

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 bg-black/60 dark:bg-black/75 backdrop-blur-sm flex justify-center items-center z-50 p-3 sm:p-4"
        onClick={() => { playSound('click'); onClose(); }}
      >
        <motion.div
          initial={{ scale: 0.96, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: 12 }}
          transition={{ type: 'spring', damping: 28, stiffness: 340 }}
          role="dialog"
          aria-modal="true"
          aria-label="Game settings"
          className="gc-panel rounded-gc-lg w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-5 sm:px-6 pt-5 pb-3 flex justify-between items-start gap-4">
            <div className="min-w-0">
              <p className="text-gc-cap font-semibold text-gc-quiet tabular-nums">For hand {currentRound + 1} onwards</p>
              <h2 className="font-logo text-gc-title font-bold text-gc-ink">Game settings</h2>
            </div>
            <button
              type="button"
              onClick={() => { playSound('click'); onClose(); }}
              aria-label="Close"
              className="w-10 h-10 shrink-0 rounded-full bg-gc-line/[0.06] hover:bg-gc-line/[0.12] text-gc-quiet hover:text-gc-ink grid place-items-center transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          {/* Tabs */}
          <div className="px-3 sm:px-5 pb-3 border-b border-gc-line/[0.12]">
            <div className="flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Settings">
              {tabs.map(tab => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => { playSound('click'); setActiveTab(tab.id); }}
                    className={`shrink-0 h-10 px-3.5 rounded-full border text-gc-small font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-turn ${
                      isActive ? 'bg-gc-gold/15 border-gc-gold text-gc-ink' : 'border-transparent text-gc-quiet hover:text-gc-ink hover:bg-gc-line/[0.06]'
                    }`}
                  >
                    <span aria-hidden="true">{tab.icon}</span>
                    <span className="whitespace-nowrap">{tab.label}</span>
                    {tab.changed && changedDot}
                    {tab.id === 'ai' && (
                      <span className={`w-2 h-2 rounded-full shrink-0 ${aiOn ? 'bg-gc-win' : 'bg-gc-quiet/50'}`} title={aiOn ? 'AI sentences are on' : 'Using the offline bank'} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 text-gc-ink modal-content-scroll">
            {/* TOPIC */}
            {activeTab === 'topic' && (
              <div>
                <p className={hint}>Pick the grammar or vocabulary for the sentences.</p>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {EXTENDED_GRAMMAR_TOPICS.map((top) => {
                    const isSelected = !isCustomTopicMode && selectedTopic === top.name;
                    return (
                      <button
                        key={top.name}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => {
                          playSound('click');
                          setIsCustomTopicMode(false);
                          setSelectedTopic(top.name);
                        }}
                        className={`p-3 flex items-start gap-3 ${optionBase} ${isSelected ? optionOn : optionOff}`}
                      >
                        <span className="text-[20px] leading-none mt-0.5" aria-hidden="true">{top.icon}</span>
                        <span className="flex-1 min-w-0">
                          <span className="flex items-center justify-between gap-2">
                            <span className="text-gc-small font-bold truncate">{top.name}</span>
                            {isSelected && <Check className="w-4 h-4 shrink-0 text-gc-gold" aria-hidden="true" />}
                          </span>
                          <span className="block text-gc-cap text-gc-quiet mt-0.5 line-clamp-2">{top.desc}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* My own topic */}
                <div
                  className={`mt-3 p-3.5 ${optionBase} ${isCustomTopicMode ? optionOn : 'bg-gc-line/[0.03] border-dashed border-gc-line/[0.24] hover:border-gc-line/40'}`}
                  onClick={() => { if (!isCustomTopicMode) { playSound('click'); setIsCustomTopicMode(true); } }}
                >
                  <label htmlFor="rsm-custom-topic" className="flex items-center gap-2 text-gc-small font-bold text-gc-ink">
                    <Pencil className="w-4 h-4 text-gc-quiet" aria-hidden="true" />
                    My own topic
                    <span className="font-normal text-gc-quiet">(grammar or vocabulary)</span>
                  </label>
                  <input
                    id="rsm-custom-topic"
                    type="text"
                    value={customTopicInput}
                    onChange={(e) => {
                      setCustomTopicInput(e.target.value);
                      if (!isCustomTopicMode) setIsCustomTopicMode(true);
                    }}
                    onFocus={() => setIsCustomTopicMode(true)}
                    placeholder="For example: places in town, food and cooking, inversion"
                    className={`mt-2 ${inputCls}`}
                  />
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-gc-cap font-semibold text-gc-quiet mr-1">Quick picks:</span>
                    {QUICK_LEXICAL_TOPICS.map((lex) => {
                      const isQuickActive = isCustomTopicMode && customTopicInput.trim().toLowerCase() === lex.toLowerCase();
                      return (
                        <button
                          key={lex}
                          type="button"
                          aria-pressed={isQuickActive}
                          onClick={(e) => {
                            e.stopPropagation();
                            playSound('click');
                            setIsCustomTopicMode(true);
                            setCustomTopicInput(lex);
                          }}
                          className={`h-8 px-3 rounded-full border text-gc-small font-semibold transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-turn ${
                            isQuickActive ? 'bg-gc-gold text-gc-on-gold border-transparent' : 'bg-gc-line/[0.05] border-gc-line/[0.14] text-gc-ink hover:border-gc-line/30'
                          }`}
                        >
                          {lex}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* LEVEL */}
            {activeTab === 'level' && (
              <div>
                <p className={hint}>How hard the sentences are, from beginner (A1) to proficient (C2).</p>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {CEFR_LEVELS.map((lvl) => {
                    const isSelected = selectedLevel === lvl;
                    const profile = CEFR_DIFFICULTY_PROFILES[lvl];
                    return (
                      <button
                        key={lvl}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => {
                          playSound('click');
                          setSelectedLevel(lvl);
                        }}
                        className={`p-3 flex items-start gap-3 ${optionBase} ${isSelected ? optionOn : optionOff}`}
                      >
                        <span className="w-11 h-11 shrink-0 rounded-full bg-gc-line/[0.07] grid place-items-center text-gc-body font-extrabold tabular-nums">{lvl}</span>
                        <span className="flex-1 min-w-0">
                          <span className="flex items-center justify-between gap-2">
                            <span className="text-gc-small font-bold">{profile?.title || lvl}</span>
                            {isSelected && <Check className="w-4 h-4 shrink-0 text-gc-gold" aria-hidden="true" />}
                          </span>
                          <span className="block text-gc-cap text-gc-quiet mt-0.5 leading-snug">{profile?.syntax || ''}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* THEME */}
            {activeTab === 'theme' && (
              <div>
                <p className={hint}>The setting for the sentences, such as fantasy or business.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {THEMES.map((th) => {
                    const isSelected = !isCustomThemeMode && selectedTheme === th;
                    return (
                      <button
                        key={th}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => {
                          playSound('click');
                          setIsCustomThemeMode(false);
                          setSelectedTheme(th);
                        }}
                        className={`h-10 px-4 rounded-full border text-gc-small font-semibold transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-turn ${isSelected ? optionOn : optionOff}`}
                      >
                        {th}
                      </button>
                    );
                  })}
                </div>

                {/* My own theme */}
                <div
                  className={`mt-3 p-3.5 ${optionBase} ${isCustomThemeMode ? optionOn : 'bg-gc-line/[0.03] border-dashed border-gc-line/[0.24] hover:border-gc-line/40'}`}
                  onClick={() => { if (!isCustomThemeMode) { playSound('click'); setIsCustomThemeMode(true); } }}
                >
                  <label htmlFor="rsm-custom-theme" className="flex items-center gap-2 text-gc-small font-bold text-gc-ink">
                    <Pencil className="w-4 h-4 text-gc-quiet" aria-hidden="true" />
                    My own theme
                  </label>
                  <input
                    id="rsm-custom-theme"
                    type="text"
                    value={customThemeInput}
                    onChange={(e) => {
                      setCustomThemeInput(e.target.value);
                      if (!isCustomThemeMode) setIsCustomThemeMode(true);
                    }}
                    onFocus={() => setIsCustomThemeMode(true)}
                    placeholder="For example: Victorian London, a space station, film noir"
                    className={`mt-2 ${inputCls}`}
                  />
                </div>
              </div>
            )}

            {/* QUESTION TYPE */}
            {activeTab === 'format' && (
              <div>
                <p className={hint}>What players do with each sentence.</p>
                <div className="mt-3 grid grid-cols-1 gap-2">
                  {CHALLENGE_FORMATS.map((fmt) => {
                    const isSelected = selectedFormat === fmt.id;
                    return (
                      <div key={fmt.id}>
                        <button
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => {
                            playSound('click');
                            setSelectedFormat(fmt.id);
                          }}
                          className={`w-full p-3.5 flex items-start gap-3 ${optionBase} ${isSelected ? optionOn : optionOff}`}
                        >
                          <span className="text-[24px] leading-none mt-0.5" aria-hidden="true">{fmt.icon}</span>
                          <span className="flex-1 min-w-0">
                            <span className="flex items-center justify-between gap-2">
                              <span className="text-gc-body font-bold">{fmt.label}</span>
                              {isSelected && <Check className="w-5 h-5 shrink-0 text-gc-gold" aria-hidden="true" />}
                            </span>
                            <span className="block text-gc-small text-gc-quiet mt-0.5 leading-snug">{fmt.subtitle}</span>
                          </span>
                        </button>

                        {/* Which question types go in the mix */}
                        {fmt.id === 'mixed' && isSelected && (
                          <div className="mt-2 p-3.5 rounded-gc border border-gc-gold/40 bg-gc-gold/[0.06] animate-gc-fade">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-gc-small font-bold text-gc-ink">
                                In the mix <span className="text-gc-quiet font-semibold tabular-nums">({effectiveMixedFormats.length} of 5)</span>
                              </p>
                              {effectiveMixedFormats.length < 5 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    playSound('click');
                                    setMixedFormatWarning(null);
                                    setSelectedMixedFormats(ALL_QUESTION_TYPES);
                                  }}
                                  className="h-8 px-3 rounded-full text-gc-small font-semibold text-gc-ink hover:bg-gc-line/[0.08] transition-colors cursor-pointer"
                                >
                                  Turn all on
                                </button>
                              )}
                            </div>
                            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              {CHALLENGE_FORMATS.filter((c): c is typeof CHALLENGE_FORMATS[number] & { id: QuestionType } => c.id !== 'mixed').map((subFmt) => {
                                const isChecked = effectiveMixedFormats.includes(subFmt.id);
                                return (
                                  <button
                                    key={subFmt.id}
                                    type="button"
                                    role="checkbox"
                                    aria-checked={isChecked}
                                    onClick={() => handleToggleMixedFormatItem(subFmt.id)}
                                    className={`h-11 px-3 flex items-center justify-between gap-2 ${optionBase} ${isChecked ? 'bg-gc-card border-gc-gold/60 text-gc-ink' : 'bg-transparent border-gc-line/[0.14] text-gc-quiet hover:border-gc-line/30'}`}
                                  >
                                    <span className="flex items-center gap-2 min-w-0">
                                      <span className="text-[18px] leading-none" aria-hidden="true">{subFmt.icon}</span>
                                      <span className="text-gc-small font-semibold truncate">{subFmt.shortLabel}</span>
                                    </span>
                                    <span className={`w-5 h-5 rounded-[6px] grid place-items-center shrink-0 border ${isChecked ? 'bg-gc-gold border-gc-gold text-gc-on-gold' : 'border-gc-line/40'}`}>
                                      {isChecked && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                            {mixedFormatWarning && (
                              <p className="mt-2 flex items-center gap-1.5 text-gc-small font-semibold text-gc-loss" role="alert">
                                <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                                {mixedFormatWarning}
                              </p>
                            )}
                            <p className="mt-2 text-gc-cap text-gc-quiet">
                              <span className="font-semibold">Order:</span>{' '}
                              {effectiveMixedFormats
                                .map(q => CHALLENGE_FORMATS.find(f => f.id === q)?.shortLabel || q)
                                .join(', then ')}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SENTENCES: AI or the offline bank */}
            {activeTab === 'ai' && (
              <div className="space-y-3">
                {/* Where the sentences come from */}
                <div className={card}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className={cardTitle}>Where the sentences come from</h3>
                      <p className={hint}>{desktopStatus.isDesktop ? 'Desktop app for Windows' : 'Web app'}</p>
                    </div>
                    <span className={`h-7 px-3 inline-flex items-center gap-1.5 rounded-full text-gc-cap font-bold ${desktopStatus.isOnline ? 'bg-gc-win/15 text-gc-win' : 'bg-gc-line/[0.08] text-gc-quiet'}`}>
                      <span className={`w-2 h-2 rounded-full ${desktopStatus.isOnline ? 'bg-gc-win' : 'bg-gc-quiet/60'}`} aria-hidden="true" />
                      {desktopStatus.isOnline ? 'Online' : 'Offline'}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-3 p-3 rounded-gc-sm bg-gc-line/[0.05]">
                    <span className="text-[22px] leading-none" aria-hidden="true">{aiOn ? '⚡' : '💾'}</span>
                    <div className="min-w-0">
                      <p className="text-gc-cap text-gc-quiet">Using now</p>
                      <p className="text-gc-body font-bold text-gc-ink">{aiOn ? 'AI sentences from Gemini' : 'The offline sentence bank'}</p>
                    </div>
                  </div>
                  {desktopStatus.isPortable && (
                    <p className="mt-2 text-gc-small text-gc-quiet truncate" title={desktopStatus.dataPath}>
                      Portable app. Data folder: {desktopStatus.dataPath ? desktopStatus.dataPath.split(/[\\/]/).slice(-2).join('/') : 'Grammar Casino Data'}
                    </p>
                  )}
                </div>

                {desktopStatus.isReadOnly && (
                  <div className="p-3.5 rounded-gc border border-gc-loss/50 bg-gc-loss/10 flex items-start gap-3" role="alert">
                    <Lock className="w-5 h-5 shrink-0 mt-0.5 text-gc-loss" aria-hidden="true" />
                    <div>
                      <p className="text-gc-small font-bold text-gc-ink">This drive is read-only</p>
                      <p className="text-gc-small text-gc-quiet mt-0.5">Settings, progress and saved games last only until you close the app.</p>
                    </div>
                  </div>
                )}

                {desktopStatus.decryptionFailed && (
                  <div className="p-3.5 rounded-gc border border-gc-gold/60 bg-gc-gold/10 flex items-start gap-3" role="alert">
                    <KeyRound className="w-5 h-5 shrink-0 mt-0.5 text-gc-gold" aria-hidden="true" />
                    <div>
                      <p className="text-gc-small font-bold text-gc-ink">Enter your AI key again</p>
                      <p className="text-gc-small text-gc-quiet mt-0.5">
                        The saved Gemini key was locked to another computer or Windows account, so it can't be read here. Enter it again below to use AI sentences on this computer.
                      </p>
                    </div>
                  </div>
                )}

                {/* What works without the AI key */}
                <div className={card}>
                  <h3 className={cardTitle}>What works without an AI key</h3>
                  <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { ok: true, title: 'Sentence bank, A1 to C2', text: 'Ready-made sentences for every level and question type. Works offline.' },
                      { ok: true, title: 'Hints and answer checks', text: 'Grammar clues and checks that work offline.' },
                      { ok: aiOn, title: 'New sentences', text: aiOn ? 'Fresh sentences for any topic you type.' : 'Needs the AI key and the internet. The bank is used instead.' },
                      { ok: aiOn, title: 'Natural voice', text: aiOn ? 'Gemini reads the sentences aloud.' : "Without the key, the computer's own voice reads aloud." },
                    ].map(item => (
                      <li key={item.title} className="p-2.5 rounded-gc-sm bg-gc-line/[0.04] flex items-start gap-2">
                        {item.ok
                          ? <Check className="w-4 h-4 shrink-0 mt-0.5 text-gc-win" aria-hidden="true" />
                          : <Info className="w-4 h-4 shrink-0 mt-0.5 text-gc-quiet" aria-hidden="true" />}
                        <span>
                          <span className="block text-gc-small font-bold text-gc-ink">{item.title}</span>
                          <span className="block text-gc-cap text-gc-quiet">{item.text}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Optional Gemini key */}
                <div className={card}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className={cardTitle}>Gemini API key <span className="font-normal text-gc-quiet">(optional)</span></h3>
                    {desktopStatus.hasKey && (
                      <span className="h-7 px-2.5 inline-flex items-center rounded-full bg-gc-win/15 text-gc-win text-gc-cap font-bold tabular-nums">
                        Saved: {desktopStatus.maskedKey || 'yes'}
                      </span>
                    )}
                  </div>
                  <p className={`mt-1 ${hint}`}>
                    The game works fully offline. Add your own Google Gemini key only if you want AI sentences and the natural voice.
                  </p>

                  <div className="mt-3 relative">
                    <label htmlFor="rsm-api-key" className="sr-only">Gemini API key</label>
                    <input
                      id="rsm-api-key"
                      type={showKeyText ? 'text' : 'password'}
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder={desktopStatus.hasKey ? 'Paste a new key to replace the saved one' : 'AIzaSy…'}
                      className={`${inputCls} pr-12 tabular-nums`}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKeyText(!showKeyText)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full grid place-items-center text-gc-quiet hover:text-gc-ink hover:bg-gc-line/[0.08] cursor-pointer"
                      aria-label={showKeyText ? 'Hide the key' : 'Show the key'}
                    >
                      {showKeyText ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                    </button>
                  </div>

                  {keyNotice && (
                    <p
                      className={`mt-2 flex items-start gap-1.5 text-gc-small font-semibold ${
                        keyNotice.type === 'success' ? 'text-gc-win' : keyNotice.type === 'error' ? 'text-gc-loss' : 'text-gc-info'
                      }`}
                      role="status"
                    >
                      {keyNotice.type === 'success'
                        ? <Check className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                        : keyNotice.type === 'error'
                          ? <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                          : <Info className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />}
                      {keyNotice.text}
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button type="button" onClick={handleSaveKey} className={`${smallBtn} gc-btn-primary border-transparent`}>
                      Save key
                    </button>
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={isTesting || (!apiKeyInput.trim() && !desktopStatus.hasKey)}
                      className={`${smallBtn} bg-gc-line/[0.06] border-gc-line/[0.16] text-gc-ink hover:border-gc-line/30`}
                    >
                      {isTesting ? 'Checking…' : 'Test the key'}
                    </button>
                    {desktopStatus.hasKey && (
                      <button
                        type="button"
                        onClick={handleRemoveKey}
                        className={`${smallBtn} border-gc-loss/40 text-gc-loss hover:bg-gc-loss/10`}
                      >
                        Remove key
                      </button>
                    )}
                  </div>
                  <p className="mt-3 text-gc-cap text-gc-quiet">
                    The key is encrypted with Windows' own protection (DPAPI) and kept in your app data folder. It is never put in the installer or shared.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* What the next hand will use */}
          <div className="hidden sm:flex px-5 sm:px-6 py-3 border-t border-gc-line/[0.12] flex-wrap items-center gap-1.5">
            <span className="text-gc-cap font-semibold text-gc-quiet mr-1">Next hand:</span>
            {[
              { key: 'topic', text: resolvedTopic },
              { key: 'level', text: selectedLevel },
              { key: 'theme', text: resolvedTheme },
              { key: 'format', text: `${selectedFormatConfig?.shortLabel || 'Valid or flawed'}${selectedFormat === 'mixed' ? ` ${mixIcons}` : ''}` },
            ].map(chip => (
              <span key={chip.key} className="h-7 px-2.5 inline-flex items-center rounded-full bg-gc-line/[0.06] border border-gc-line/[0.12] text-gc-cap font-semibold text-gc-ink max-w-[12rem] truncate" title={chip.text}>
                {chip.text}
              </span>
            ))}
          </div>

          {/* Actions */}
          <div className="px-5 sm:px-6 py-4 border-t border-gc-line/[0.12] flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
            {onApplyCurrentRound ? (
              <button
                type="button"
                onClick={handleApplyNow}
                className="h-11 px-4 rounded-gc-sm text-gc-small font-bold text-gc-ink border border-gc-line/[0.16] bg-gc-line/[0.04] hover:border-gc-line/30 transition-colors cursor-pointer"
                title="Use these settings now and deal a new sentence for this hand"
              >
                Use now and deal a new sentence
              </button>
            ) : <span className="hidden sm:block" />}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => { playSound('click'); onClose(); }}
                className="h-11 px-4 rounded-gc-sm text-gc-small font-bold text-gc-quiet hover:text-gc-ink transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <ActionButton
                onClick={handleSaveForNext}
                variant="primary"
                className="h-12 px-6 text-gc-body"
              >
                Save for the next hand
              </ActionButton>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default RoundSettingsModal;
