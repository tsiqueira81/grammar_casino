import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, CEFRLevel, SoundEffect, ChallengeFormat } from '../types';
import { GRAMMAR_TOPICS, THEMES, CEFR_LEVELS, CEFR_DIFFICULTY_PROFILES, CHALLENGE_FORMATS } from '../constants';
import ActionButton from './ActionButton';

export type SettingsModalTab = 'topic' | 'level' | 'theme' | 'format';

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
          <div className="flex border-b border-amber-200/60 dark:border-amber-900/40 bg-amber-100/30 dark:bg-black/20 p-2 gap-2 select-none">
            <button
              onClick={() => { playSound('click'); setActiveTab('topic'); }}
              className={`flex-1 py-2.5 px-3 rounded-lg text-xs md:text-sm font-serif font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
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
              className={`flex-1 py-2.5 px-3 rounded-lg text-xs md:text-sm font-serif font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                activeTab === 'level'
                  ? 'bg-amber-500 text-black shadow-md'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-amber-200/50 dark:hover:bg-amber-950/40'
              }`}
            >
              <span>📊</span>
              <span>CEFR Level</span>
              {selectedLevel !== currentSettings.level && (
                <span className="w-2 h-2 rounded-full bg-amber-900 dark:bg-amber-200"></span>
              )}
            </button>

            <button
              onClick={() => { playSound('click'); setActiveTab('theme'); }}
              className={`flex-1 py-2.5 px-3 rounded-lg text-xs md:text-sm font-serif font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
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
              className={`flex-1 py-2.5 px-3 rounded-lg text-xs md:text-sm font-serif font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
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
          </div>

          {/* Modal Body / Tab Content */}
          <div className="flex-1 overflow-y-auto p-5 text-slate-800 dark:text-slate-100 modal-content-scroll">
            {/* TOPIC TAB */}
            {activeTab === 'topic' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div className="text-xs uppercase font-bold text-amber-700 dark:text-amber-400 tracking-wider">
                    Select Target Grammar Concept
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    Current: <strong className="text-slate-700 dark:text-slate-200">{currentSettings.topic}</strong>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {EXTENDED_GRAMMAR_TOPICS.map(item => {
                    const isSelected = !isCustomTopicMode && selectedTopic === item.name;
                    return (
                      <button
                        key={item.name}
                        onClick={() => {
                          playSound('click');
                          setIsCustomTopicMode(false);
                          setSelectedTopic(item.name);
                        }}
                        className={`p-3 rounded-xl border text-left flex items-start gap-3 transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500/15 dark:bg-amber-500/20 border-amber-500 ring-2 ring-amber-400/50 shadow-sm'
                            : 'bg-white dark:bg-black/20 border-slate-200 dark:border-slate-800 hover:border-amber-400/60 hover:bg-amber-50/40 dark:hover:bg-amber-950/20'
                        }`}
                      >
                        <span className="text-2xl mt-0.5 select-none">{item.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className={`font-serif font-bold text-sm truncate ${isSelected ? 'text-amber-900 dark:text-amber-300' : 'text-slate-800 dark:text-slate-200'}`}>
                            {item.name}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 leading-snug">
                            {item.desc}
                          </div>
                        </div>
                        {isSelected && (
                          <span className="text-amber-500 font-bold text-xs select-none">✓</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Custom Topic Box */}
                <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800">
                  <div
                    onClick={() => {
                      playSound('click');
                      setIsCustomTopicMode(true);
                    }}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                      isCustomTopicMode
                        ? 'bg-amber-500/15 dark:bg-amber-500/20 border-amber-500 ring-2 ring-amber-400/50'
                        : 'bg-white dark:bg-black/20 border-slate-200 dark:border-slate-800 hover:border-amber-400/60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 font-serif font-bold text-sm text-slate-900 dark:text-slate-100">
                        <span>✍️</span>
                        <span>My Own Custom Topic</span>
                      </div>
                      {isCustomTopicMode && (
                        <span className="text-xs bg-amber-500 text-black px-2 py-0.5 rounded-full font-bold">Selected</span>
                      )}
                    </div>
                    <input
                      type="text"
                      value={customTopicInput}
                      onChange={(e) => {
                        setIsCustomTopicMode(true);
                        setCustomTopicInput(e.target.value);
                      }}
                      onFocus={() => setIsCustomTopicMode(true)}
                      placeholder="e.g. Mixed Conditionals in Business, Phrasal verbs with 'get'..."
                      className="w-full px-3.5 py-2 text-sm bg-white dark:bg-[#0a1f14] border border-amber-300 dark:border-amber-500/50 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* LEVEL TAB */}
            {activeTab === 'level' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div className="text-xs uppercase font-bold text-amber-700 dark:text-amber-400 tracking-wider">
                    Select Target CEFR Language Proficiency
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    Current: <strong className="text-slate-700 dark:text-slate-200">{currentSettings.level}</strong>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {CEFR_LEVELS.map(levelKey => {
                    const lvl = CEFR_DIFFICULTY_PROFILES[levelKey];
                    const isSelected = selectedLevel === lvl.level;
                    return (
                      <button
                        key={lvl.level}
                        onClick={() => {
                          playSound('click');
                          setSelectedLevel(lvl.level);
                        }}
                        className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'bg-amber-500/15 dark:bg-amber-500/20 border-amber-500 ring-2 ring-amber-400/50 shadow-md'
                            : 'bg-white dark:bg-black/20 border-slate-200 dark:border-slate-800 hover:border-amber-400/60 hover:bg-amber-50/40 dark:hover:bg-amber-950/20'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded font-mono font-black text-xs border ${lvl.badgeColor}`}>
                              {lvl.level}
                            </span>
                            <span className="font-serif font-bold text-sm text-slate-900 dark:text-white">
                              {lvl.title}
                            </span>
                          </div>
                          {isSelected && (
                            <span className="text-amber-500 font-bold text-base select-none">✓</span>
                          )}
                        </div>
                        <div className="space-y-1.5 text-[11px] leading-snug">
                          <div className="text-slate-600 dark:text-slate-300">
                            <strong className="text-slate-800 dark:text-slate-100">Syntax:</strong> {lvl.syntax}
                          </div>
                          <div className="text-slate-600 dark:text-slate-300">
                            <strong className="text-slate-800 dark:text-slate-100">Lexis:</strong> {lvl.lexis}
                          </div>
                          <div className="text-amber-700 dark:text-amber-400 font-medium">
                            <strong className="text-amber-800 dark:text-amber-300">Mistake Spotting:</strong> {lvl.mistakeIdentification}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* THEME TAB */}
            {activeTab === 'theme' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div className="text-xs uppercase font-bold text-amber-700 dark:text-amber-400 tracking-wider">
                    Select Sentence Narrative Theme
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    Current: <strong className="text-slate-700 dark:text-slate-200">{currentSettings.theme}</strong>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {THEMES.filter(t => t !== 'Custom ✍️').map(thm => {
                    const isSelected = !isCustomThemeMode && selectedTheme === thm;
                    return (
                      <button
                        key={thm}
                        onClick={() => {
                          playSound('click');
                          setIsCustomThemeMode(false);
                          setSelectedTheme(thm);
                        }}
                        className={`p-3 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 ${
                          isSelected
                            ? 'bg-amber-500/20 border-amber-500 ring-2 ring-amber-400/50 shadow-sm'
                            : 'bg-white dark:bg-black/20 border-slate-200 dark:border-slate-800 hover:border-amber-400/60 hover:bg-amber-50/40 dark:hover:bg-amber-950/20'
                        }`}
                      >
                        <span className="text-xl select-none">{thm.split(' ').slice(-1)[0]}</span>
                        <span className={`text-xs font-serif font-bold truncate max-w-full ${isSelected ? 'text-amber-900 dark:text-amber-300' : 'text-slate-800 dark:text-slate-200'}`}>
                          {thm.replace(/\s[^\s]+$/, '')}
                        </span>
                        {isSelected && (
                          <span className="text-[10px] text-amber-500 font-bold">Selected</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Custom Theme Box */}
                <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800">
                  <div
                    onClick={() => {
                      playSound('click');
                      setIsCustomThemeMode(true);
                    }}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                      isCustomThemeMode
                        ? 'bg-amber-500/15 dark:bg-amber-500/20 border-amber-500 ring-2 ring-amber-400/50'
                        : 'bg-white dark:bg-black/20 border-slate-200 dark:border-slate-800 hover:border-amber-400/60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 font-serif font-bold text-sm text-slate-900 dark:text-slate-100">
                        <span>✍️</span>
                        <span>Custom Theme / Topic Universe</span>
                      </div>
                      {isCustomThemeMode && (
                        <span className="text-xs bg-amber-500 text-black px-2 py-0.5 rounded-full font-bold">Selected</span>
                      )}
                    </div>
                    <input
                      type="text"
                      value={customThemeInput}
                      onChange={(e) => {
                        setIsCustomThemeMode(true);
                        setCustomThemeInput(e.target.value);
                      }}
                      onFocus={() => setIsCustomThemeMode(true)}
                      placeholder="e.g. Culinary Kitchen, Space Station, Victorian London..."
                      className="w-full px-3.5 py-2 text-sm bg-white dark:bg-[#0a1f14] border border-amber-300 dark:border-amber-500/50 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* CHALLENGE FORMAT TAB */}
            {activeTab === 'format' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div className="text-xs uppercase font-bold text-amber-700 dark:text-amber-400 tracking-wider">
                    Select Challenge Format
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    Current: <strong className="text-slate-700 dark:text-slate-200">{CHALLENGE_FORMATS.find(f => f.id === (currentSettings.challengeFormat || 'binary'))?.shortLabel || 'Valid / Flawed'}</strong>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {CHALLENGE_FORMATS.map(fmt => {
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
                Cancel
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
