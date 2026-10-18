import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, CEFRLevel, SoundEffect, ChallengeFormat } from '../types';
import { GRAMMAR_TOPICS, THEMES, CEFR_LEVELS, CEFR_DIFFICULTY_PROFILES, CHALLENGE_FORMATS } from '../constants';
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
  { name: 'Subject-Verb Agreement', icon: '🤝', desc: 'Singular/plural harmony, collective nouns, inverted' },
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

  if (!isOpen) return null;

  const resolvedTopic = isCustomTopicMode ? (customTopicInput.trim() || 'Custom Grammar') : selectedTopic;
  const resolvedTheme = isCustomThemeMode ? (customThemeInput.trim() ? `Custom: ${customThemeInput.trim()} ✍️` : 'Custom ✍️') : selectedTheme;

  const handleSaveForNext = () => {
    playSound('success');
    onSaveNextRound({
      topic: resolvedTopic,
      level: selectedLevel,
      theme: resolvedTheme,
      challengeFormat: selectedFormat,
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
      });
    }
  };

  const handleSaveKey = async () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      setKeyNotice({ type: 'error', text: 'Please enter a valid Gemini API key.' });
      return;
    }
    playSound('click');
    const res = await saveDesktopApiKey(trimmed);
    if (res.success) {
      playSound('success');
      setKeyNotice({
        type: 'success',
        text: 'API key encrypted and safely stored using OS-backed Windows DPAPI encryption!',
      });
      setApiKeyInput('');
      const updated = await getDesktopStatus();
      setDesktopStatus(updated);
    } else {
      setKeyNotice({ type: 'error', text: res.error || 'Failed to save key.' });
    }
  };

  const handleRemoveKey = async () => {
    playSound('click');
    const res = await removeDesktopApiKey();
    if (res.success) {
      playSound('click');
      setKeyNotice({
        type: 'info',
        text: 'Stored API key removed. Casino is running 100% in Curated Offline Bank mode.',
      });
      setApiKeyInput('');
      const updated = await getDesktopStatus();
      setDesktopStatus(updated);
    } else {
      setKeyNotice({ type: 'error', text: res.error || 'Failed to remove key.' });
    }
  };

  const handleTestConnection = async () => {
    playSound('click');
    setIsTesting(true);
    setKeyNotice({ type: 'info', text: 'Contacting Gemini API...' });
    const res = await testDesktopApiKey(apiKeyInput.trim() || undefined);
    setIsTesting(false);
    if (res.valid) {
      playSound('success');
      setKeyNotice({ type: 'success', text: 'Connection successful! Gemini API is active and responding.' });
    } else {
      setKeyNotice({ type: 'error', text: res.error || 'API connection failed. Check your key and internet connection.' });
    }
  };

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm flex justify-center items-center z-50 p-4"
        onClick={() => { playSound('click'); onClose(); }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 15 }}
          transition={{ type: 'spring', damping: 25, stiffness: 320 }}
          className="bg-white dark:bg-[#062414] border-2 border-[#ca8a04] rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-amber-50/80 dark:bg-[#0a1f14] p-5 border-b border-[#ca8a04]/30 relative flex justify-between items-center select-none">
            <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-[#fef08a] to-transparent"></div>
            <div>
              <div className="text-[11px] font-mono tracking-widest text-[#ca8a04] uppercase font-bold">
                Table Dealer Settings
              </div>
              <h2 className="text-2xl font-serif font-bold text-slate-900 dark:text-amber-100 flex items-center gap-2">
                <span>Configure Round Options</span>
                <span className="text-xs font-mono font-normal px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-900 dark:text-amber-300 border border-amber-500/30">
                  Target: Round {currentRound + 1}
                </span>
              </h2>
            </div>
            <button
              onClick={() => { playSound('click'); onClose(); }}
              className="text-[#ca8a04]/70 hover:text-amber-800 dark:text-[#ca8a04]/60 dark:hover:text-[#fef08a] text-3xl leading-none transition-colors p-1"
              aria-label="Close modal"
            >
              &times;
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-amber-200/60 dark:border-amber-900/40 bg-amber-100/30 dark:bg-black/20 p-2 gap-2 select-none overflow-x-auto">
            <button
              onClick={() => { playSound('click'); setActiveTab('topic'); }}
              className={`flex-1 min-w-[75px] py-2.5 px-3 rounded-lg text-xs md:text-sm font-serif font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'topic'
                  ? 'bg-amber-500 text-black shadow-md'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-amber-200/50 dark:hover:bg-amber-950/40'
              }`}
            >
              <span>📚</span>
              <span>Topic</span>
              {resolvedTopic !== currentSettings.topic && (
                <span className="w-2 h-2 rounded-full bg-amber-900 dark:bg-amber-200"></span>
              )}
            </button>

            <button
              onClick={() => { playSound('click'); setActiveTab('level'); }}
              className={`flex-1 min-w-[75px] py-2.5 px-3 rounded-lg text-xs md:text-sm font-serif font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'level'
                  ? 'bg-amber-500 text-black shadow-md'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-amber-200/50 dark:hover:bg-amber-950/40'
              }`}
            >
              <span>📊</span>
              <span>Level</span>
              {selectedLevel !== currentSettings.level && (
                <span className="w-2 h-2 rounded-full bg-amber-900 dark:bg-amber-200"></span>
              )}
            </button>

            <button
              onClick={() => { playSound('click'); setActiveTab('theme'); }}
              className={`flex-1 min-w-[75px] py-2.5 px-3 rounded-lg text-xs md:text-sm font-serif font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'theme'
                  ? 'bg-amber-500 text-black shadow-md'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-amber-200/50 dark:hover:bg-amber-950/40'
              }`}
            >
              <span>🎭</span>
              <span>Theme</span>
              {resolvedTheme !== currentSettings.theme && (
                <span className="w-2 h-2 rounded-full bg-amber-900 dark:bg-amber-200"></span>
              )}
            </button>

            <button
              onClick={() => { playSound('click'); setActiveTab('format'); }}
              className={`flex-1 min-w-[75px] py-2.5 px-3 rounded-lg text-xs md:text-sm font-serif font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'format'
                  ? 'bg-amber-500 text-black shadow-md'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-amber-200/50 dark:hover:bg-amber-950/40'
              }`}
            >
              <span>🎯</span>
              <span>Format</span>
              {selectedFormat !== (currentSettings.challengeFormat || 'binary') && (
                <span className="w-2 h-2 rounded-full bg-amber-900 dark:bg-amber-200"></span>
              )}
            </button>

            {/* AI & Offline Tab */}
            <button
              onClick={() => { playSound('click'); setActiveTab('ai'); }}
              className={`flex-1 min-w-[100px] py-2.5 px-3 rounded-lg text-xs md:text-sm font-serif font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'ai'
                  ? 'bg-amber-500 text-black shadow-md'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-amber-200/50 dark:hover:bg-amber-950/40'
              }`}
            >
              <span>🤖</span>
              <span>AI & Offline</span>
              <span
                className={`w-2 h-2 rounded-full ${
                  desktopStatus.hasKey && desktopStatus.isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
                title={desktopStatus.hasKey && desktopStatus.isOnline ? 'Live AI Active' : 'Curated Bank Active'}
              />
            </button>
          </div>

          {/* Modal Body / Tab Content */}
          <div className="flex-1 overflow-y-auto p-5 text-slate-800 dark:text-slate-100 modal-content-scroll">
            {/* TOPIC TAB */}
            {activeTab === 'topic' && (
              <div>
                <p className="text-xs text-slate-500 dark:text-amber-200/70 mb-3 font-serif">
                  Select a grammar focus for subsequent rounds, or enter your own custom rule:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[300px] overflow-y-auto pr-1">
                  {EXTENDED_GRAMMAR_TOPICS.map((top) => {
                    const isSelected = !isCustomTopicMode && selectedTopic === top.name;
                    return (
                      <button
                        key={top.name}
                        type="button"
                        onClick={() => {
                          playSound('click');
                          setIsCustomTopicMode(false);
                          setSelectedTopic(top.name);
                        }}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-2.5 ${
                          isSelected
                            ? 'bg-amber-500/15 dark:bg-amber-500/20 border-amber-500 ring-2 ring-amber-400/50 shadow-md'
                            : 'bg-white dark:bg-black/20 border-slate-200 dark:border-slate-800 hover:border-amber-400/60 hover:bg-amber-50/40 dark:hover:bg-amber-950/20'
                        }`}
                      >
                        <span className="text-xl mt-0.5 select-none">{top.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-serif font-bold text-xs text-slate-900 dark:text-white flex items-center justify-between">
                            <span className="truncate">{top.name}</span>
                            {isSelected && <span className="text-amber-500 font-bold text-sm">✓</span>}
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5 line-clamp-1">
                            {top.desc}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Custom Topic Input */}
                <div className="mt-4 pt-3 border-t border-amber-200/40 dark:border-amber-900/30">
                  <div
                    onClick={() => {
                      playSound('click');
                      setIsCustomTopicMode(true);
                    }}
                    className={`p-3 rounded-xl border transition-all cursor-pointer ${
                      isCustomTopicMode
                        ? 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-400/50'
                        : 'bg-white dark:bg-black/20 border-dashed border-amber-300 dark:border-amber-800/60 hover:border-amber-400'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-base">✍️</span>
                      <span className="text-xs font-serif font-bold text-slate-900 dark:text-amber-200">
                        Custom Grammar Target:
                      </span>
                    </div>
                    <input
                      type="text"
                      value={customTopicInput}
                      onChange={(e) => {
                        setCustomTopicInput(e.target.value);
                        if (!isCustomTopicMode) setIsCustomTopicMode(true);
                      }}
                      onFocus={() => setIsCustomTopicMode(true)}
                      placeholder="e.g. Inversion with Seldom / Hardly, Subjunctive Mood, Cleft Sentences..."
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50/30 dark:bg-black/40 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* LEVEL TAB */}
            {activeTab === 'level' && (
              <div>
                <p className="text-xs text-slate-500 dark:text-amber-200/70 mb-3 font-serif">
                  Select CEFR linguistic complexity profile:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {CEFR_LEVELS.map((lvl) => {
                    const isSelected = selectedLevel === lvl;
                    const profile = CEFR_DIFFICULTY_PROFILES[lvl];
                    return (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => {
                          playSound('click');
                          setSelectedLevel(lvl);
                        }}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                          isSelected
                            ? 'bg-amber-500/15 dark:bg-amber-500/20 border-amber-500 ring-2 ring-amber-400/50 shadow-md'
                            : 'bg-white dark:bg-black/20 border-slate-200 dark:border-slate-800 hover:border-amber-400/60 hover:bg-amber-50/40 dark:hover:bg-amber-950/20'
                        }`}
                      >
                        <span className="text-xl font-mono font-black text-amber-600 dark:text-amber-400 select-none">
                          {lvl}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="font-serif font-bold text-xs text-slate-900 dark:text-white">
                              {profile?.title || lvl}
                            </span>
                            {isSelected && <span className="text-amber-500 font-bold text-sm">✓</span>}
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                            {profile?.syntax || ''}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* THEME TAB */}
            {activeTab === 'theme' && (
              <div>
                <p className="text-xs text-slate-500 dark:text-amber-200/70 mb-3 font-serif">
                  Choose a contextual scenario or real-world theme:
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[300px] overflow-y-auto pr-1">
                  {THEMES.map((th) => {
                    const isSelected = !isCustomThemeMode && selectedTheme === th;
                    return (
                      <button
                        key={th}
                        type="button"
                        onClick={() => {
                          playSound('click');
                          setIsCustomThemeMode(false);
                          setSelectedTheme(th);
                        }}
                        className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                          isSelected
                            ? 'bg-amber-500/15 dark:bg-amber-500/20 border-amber-500 ring-2 ring-amber-400/50 shadow-md'
                            : 'bg-white dark:bg-black/20 border-slate-200 dark:border-slate-800 hover:border-amber-400/60 hover:bg-amber-50/40 dark:hover:bg-amber-950/20'
                        }`}
                      >
                        <span className="font-serif font-bold text-xs text-slate-900 dark:text-white">
                          {th}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Custom Theme Input */}
                <div className="mt-4 pt-3 border-t border-amber-200/40 dark:border-amber-900/30">
                  <div
                    onClick={() => {
                      playSound('click');
                      setIsCustomThemeMode(true);
                    }}
                    className={`p-3 rounded-xl border transition-all cursor-pointer ${
                      isCustomThemeMode
                        ? 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-400/50'
                        : 'bg-white dark:bg-black/20 border-dashed border-amber-300 dark:border-amber-800/60 hover:border-amber-400'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-base">✍️</span>
                      <span className="text-xs font-serif font-bold text-slate-900 dark:text-amber-200">
                        Custom Scenario Theme:
                      </span>
                    </div>
                    <input
                      type="text"
                      value={customThemeInput}
                      onChange={(e) => {
                        setCustomThemeInput(e.target.value);
                        if (!isCustomThemeMode) setIsCustomThemeMode(true);
                      }}
                      onFocus={() => setIsCustomThemeMode(true)}
                      placeholder="e.g. Victorian London Mystery, Space Station Operations, Film Noir..."
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50/30 dark:bg-black/40 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* FORMAT TAB */}
            {activeTab === 'format' && (
              <div>
                <p className="text-xs text-slate-500 dark:text-amber-200/70 mb-3 font-serif">
                  Choose challenge structure:
                </p>

                <div className="grid grid-cols-1 gap-2.5">
                  {CHALLENGE_FORMATS.map((fmt) => {
                    const isSelected = selectedFormat === fmt.id;
                    return (
                      <button
                        key={fmt.id}
                        type="button"
                        onClick={() => {
                          playSound('click');
                          setSelectedFormat(fmt.id);
                        }}
                        className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                          isSelected
                            ? 'bg-amber-500/15 dark:bg-amber-500/20 border-amber-500 ring-2 ring-amber-400/50 shadow-md'
                            : 'bg-white dark:bg-black/20 border-slate-200 dark:border-slate-800 hover:border-amber-400/60 hover:bg-amber-50/40 dark:hover:bg-amber-950/20'
                        }`}
                      >
                        <span className="text-2xl mt-0.5 select-none">{fmt.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`font-serif font-bold text-sm ${isSelected ? 'text-amber-900 dark:text-amber-300' : 'text-slate-900 dark:text-white'}`}>
                              {fmt.label}
                            </span>
                            {isSelected && (
                              <span className="text-amber-500 font-bold text-base select-none">✓</span>
                            )}
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-snug">
                            {fmt.subtitle}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* AI & OFFLINE TAB */}
            {activeTab === 'ai' && (
              <div className="space-y-4">
                {/* Status Hero Card */}
                <div className="p-4 rounded-xl border border-amber-300/60 dark:border-amber-800/60 bg-amber-50/50 dark:bg-black/30">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">⚡</span>
                      <div>
                        <h3 className="font-serif font-bold text-sm text-slate-900 dark:text-amber-100">
                          Casino Intelligence Engine
                        </h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                          {desktopStatus.isDesktop
                            ? 'Windows Desktop Edition (Self-Contained)'
                            : 'Web Edition (Serverless Backend)'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border ${
                          desktopStatus.isOnline
                            ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-500/40'
                            : 'bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-500/40'
                        }`}
                      >
                        {desktopStatus.isOnline ? '● Online' : '○ Offline Mode'}
                      </span>
                      {desktopStatus.isDesktop && (
                        <span className="text-[9px] font-mono text-slate-500 dark:text-slate-400">
                          {desktopStatus.isEncrypted ? '🛡️ Windows DPAPI Ready' : 'Key Protection'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Active Generator Badge */}
                  <div className="p-2.5 rounded-lg bg-amber-100/60 dark:bg-amber-950/40 border border-amber-300/40 dark:border-amber-800/40 flex items-center justify-between text-xs">
                    <span className="font-serif font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                      <span>{desktopStatus.hasKey && desktopStatus.isOnline ? '🚀' : '💾'}</span>
                      <span>Active Engine:</span>
                    </span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {desktopStatus.hasKey && desktopStatus.isOnline
                        ? 'Gemini Live Generative AI'
                        : 'Curated Sentence Bank (Offline)'}
                    </span>
                  </div>

                  {/* Portable Edition Badge */}
                  {desktopStatus.isPortable && (
                    <div className="mt-2.5 p-2 rounded-lg bg-purple-500/10 border border-purple-400/40 dark:border-purple-800/40 flex items-center justify-between text-xs">
                      <span className="font-serif font-bold text-purple-900 dark:text-purple-200 flex items-center gap-1.5">
                        <span>🎒</span>
                        <span>Portable Edition:</span>
                      </span>
                      <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300 truncate max-w-[280px]" title={desktopStatus.dataPath}>
                        📁 {desktopStatus.dataPath ? desktopStatus.dataPath.split(/[\\/]/).slice(-2).join('/') : 'Grammar Casino Data'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Read-Only Media Warning Banner */}
                {desktopStatus.isReadOnly && (
                  <div className="p-3.5 rounded-xl border-2 border-red-500/80 bg-red-500/15 text-red-950 dark:text-red-100 flex items-start gap-3 animate-fade-in shadow-md">
                    <span className="text-2xl mt-0.5 select-none">🔒</span>
                    <div className="flex-1 min-w-0">
                      <h5 className="font-serif font-bold text-xs uppercase tracking-wide text-red-700 dark:text-red-300">
                        Read-Only Location Detected
                      </h5>
                      <p className="text-xs mt-1 leading-relaxed">
                        Grammar Casino Portable is running from a write-protected drive or read-only directory. Settings, progress, and game saves will run in temporary session memory and cannot be saved to the drive.
                      </p>
                    </div>
                  </div>
                )}

                {/* DPAPI Machine Transfer Key Re-entry Alert Banner */}
                {desktopStatus.decryptionFailed && (
                  <div className="p-3.5 rounded-xl border-2 border-amber-500 bg-amber-500/15 text-amber-950 dark:text-amber-100 flex items-start gap-3 animate-fade-in shadow-md">
                    <span className="text-2xl mt-0.5 select-none">🔑</span>
                    <div className="flex-1 min-w-0">
                      <h5 className="font-serif font-bold text-xs uppercase tracking-wide text-amber-800 dark:text-amber-300">
                        Key Re-entry Needed (New PC or User Account)
                      </h5>
                      <p className="text-xs mt-1 leading-relaxed">
                        Your previously saved Gemini API key was encrypted with Windows DPAPI on a different computer or Windows account. Because Windows security credentials do not transfer between different user profiles or machines, please re-enter your Gemini API key below to re-encrypt and activate live AI on this computer.
                      </p>
                    </div>
                  </div>
                )}

                {/* Feature Availability Matrix */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-black/20">
                  <h4 className="font-serif font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-amber-200/90 mb-2.5">
                    Feature Availability (Offline vs Live AI)
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40">
                      <div className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                        <span>✅</span>
                        <span>Curated Challenge Bank (A1-C2)</span>
                      </div>
                      <p className="text-[10px] text-slate-600 dark:text-slate-400 mt-0.5">
                        Hand-crafted grammar challenges across all CEFR levels & formats. Fully offline.
                      </p>
                    </div>

                    <div className="p-2 rounded bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40">
                      <div className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                        <span>✅</span>
                        <span>Pedagogical Heuristics & Hints</span>
                      </div>
                      <p className="text-[10px] text-slate-600 dark:text-slate-400 mt-0.5">
                        Deterministic grammar clues, sentence verification, & offline audio synthesis.
                      </p>
                    </div>

                    <div className={`p-2 rounded border ${
                      desktopStatus.hasKey && desktopStatus.isOnline
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40'
                        : 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-300/50 dark:border-amber-800/40'
                    }`}>
                      <div className={`font-bold flex items-center gap-1 ${
                        desktopStatus.hasKey && desktopStatus.isOnline
                          ? 'text-emerald-800 dark:text-emerald-300'
                          : 'text-amber-800 dark:text-amber-300'
                      }`}>
                        <span>{desktopStatus.hasKey && desktopStatus.isOnline ? '✅' : '⚠️'}</span>
                        <span>Dynamic Sentence Synthesis</span>
                      </div>
                      <p className="text-[10px] text-slate-600 dark:text-slate-400 mt-0.5">
                        {desktopStatus.hasKey && desktopStatus.isOnline
                          ? 'Generates fresh, never-before-seen sentences matching custom rules.'
                          : 'Unavailable offline or without key (curated bank used instead).'}
                      </p>
                    </div>

                    <div className={`p-2 rounded border ${
                      desktopStatus.hasKey && desktopStatus.isOnline
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40'
                        : 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-300/50 dark:border-amber-800/40'
                    }`}>
                      <div className={`font-bold flex items-center gap-1 ${
                        desktopStatus.hasKey && desktopStatus.isOnline
                          ? 'text-emerald-800 dark:text-emerald-300'
                          : 'text-amber-800 dark:text-amber-300'
                      }`}>
                        <span>{desktopStatus.hasKey && desktopStatus.isOnline ? '✅' : '⚠️'}</span>
                        <span>Neural Voice (Gemini TTS)</span>
                      </div>
                      <p className="text-[10px] text-slate-600 dark:text-slate-400 mt-0.5">
                        {desktopStatus.hasKey && desktopStatus.isOnline
                          ? 'Studio-grade natural neural speech model.'
                          : 'Falls back to Windows system text-to-speech engine.'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Optional API Key Configuration */}
                <div className="p-4 rounded-xl border border-amber-300/60 dark:border-amber-800/60 bg-white dark:bg-black/20">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h4 className="font-serif font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-amber-200">
                      Custom Gemini API Key (Optional)
                    </h4>
                    {desktopStatus.hasKey && (
                      <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded font-bold border border-emerald-500/40">
                        Configured: {desktopStatus.maskedKey || 'Saved'}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-3">
                    Grammar Casino is 100% playable offline out of the box. An API key is entirely optional. If you want to enable live generative AI features, enter your own Google Gemini API key below.
                  </p>

                  <div className="space-y-2">
                    <div className="relative">
                      <input
                        type={showKeyText ? 'text' : 'password'}
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        placeholder={desktopStatus.hasKey ? 'Enter new key to replace existing...' : 'AIzaSy...'}
                        className="w-full px-3 py-2 pr-16 text-xs rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-black/50 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKeyText(!showKeyText)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-mono text-amber-700 dark:text-amber-300 hover:underline px-1 cursor-pointer"
                      >
                        {showKeyText ? 'Hide' : 'Show'}
                      </button>
                    </div>

                    {keyNotice && (
                      <div
                        className={`text-xs p-2 rounded-lg border flex items-center gap-1.5 ${
                          keyNotice.type === 'success'
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 text-emerald-800 dark:text-emerald-200'
                            : keyNotice.type === 'error'
                            ? 'bg-red-50 dark:bg-red-950/40 border-red-300 text-red-800 dark:text-red-200'
                            : 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 text-amber-800 dark:text-amber-200'
                        }`}
                      >
                        <span>{keyNotice.type === 'success' ? '✓' : keyNotice.type === 'error' ? '⚠️' : 'ℹ️'}</span>
                        <span>{keyNotice.text}</span>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleSaveKey}
                        className="px-3 py-1.5 rounded-lg text-xs font-serif font-bold bg-amber-500 hover:bg-amber-600 text-black shadow transition-all cursor-pointer flex items-center gap-1"
                      >
                        <span>💾</span>
                        <span>Save Encrypted Key (DPAPI)</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleTestConnection}
                        disabled={isTesting || (!apiKeyInput.trim() && !desktopStatus.hasKey)}
                        className="px-3 py-1.5 rounded-lg text-xs font-serif font-bold border border-amber-400 dark:border-amber-700 hover:bg-amber-100/50 dark:hover:bg-amber-950/30 text-amber-900 dark:text-amber-200 transition-all cursor-pointer disabled:opacity-40"
                      >
                        <span>{isTesting ? '⏳ Testing...' : '🔍 Test Connection'}</span>
                      </button>

                      {desktopStatus.hasKey && (
                        <button
                          type="button"
                          onClick={handleRemoveKey}
                          className="px-3 py-1.5 rounded-lg text-xs font-serif font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 border border-red-300/60 dark:border-red-900/40 transition-all cursor-pointer"
                        >
                          <span>🗑️ Remove Key</span>
                        </button>
                      )}
                    </div>

                    <p className="text-[10px] text-slate-500 dark:text-slate-400 italic pt-1">
                      🛡️ Security Guarantee: Your key is stored in your personal Windows app data folder using OS-backed Windows DPAPI encryption. It is never included in installers or shared with anyone.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Pending Configuration Summary Banner */}
          <div className="px-5 py-3 bg-amber-50/90 dark:bg-black/40 border-t border-amber-300/40 dark:border-amber-900/50 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 flex-wrap text-slate-600 dark:text-slate-400 font-serif">
              <span className="font-bold text-amber-800 dark:text-amber-400">Next Deal Summary:</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 font-semibold text-slate-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700/50 truncate max-w-[140px]" title={resolvedTopic}>
                📚 {resolvedTopic}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 font-semibold text-slate-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700/50">
                📊 {selectedLevel}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 font-semibold text-slate-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700/50 truncate max-w-[140px]" title={resolvedTheme}>
                🎭 {resolvedTheme}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 font-semibold text-slate-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700/50">
                {CHALLENGE_FORMATS.find(f => f.id === selectedFormat)?.icon || '🎯'} {CHALLENGE_FORMATS.find(f => f.id === selectedFormat)?.shortLabel || 'Valid / Flawed'}
              </span>
            </div>
            <div className="text-[11px] text-amber-700 dark:text-amber-400/80 italic">
              Takes effect starting Round {currentRound + 1}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="p-4 bg-amber-50/50 dark:bg-[#0a1f14]/50 border-t border-amber-200/50 dark:border-[#14532d] flex flex-wrap justify-between items-center gap-2 select-none">
            {onApplyCurrentRound ? (
              <button
                type="button"
                onClick={handleApplyNow}
                className="px-3.5 py-2 rounded-lg text-xs font-serif font-bold text-amber-800 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 border border-amber-400/50 hover:border-amber-500 hover:bg-amber-100/50 dark:hover:bg-amber-950/40 transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Immediately apply and deal a new card right now for the current round"
              >
                <span>🔄</span>
                <span>Apply & Deal New Card Now</span>
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { playSound('click'); onClose(); }}
                className="px-4 py-2 rounded-lg text-xs font-serif font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                Close
              </button>
              <ActionButton
                onClick={handleSaveForNext}
                playSound={playSound}
                variant="gold"
                className="py-2.5 px-6 text-sm shadow-md"
              >
                <span>Save for Next Round ➡️</span>
              </ActionButton>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default RoundSettingsModal;
