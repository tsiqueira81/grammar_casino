import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PowerUpKey, SoundEffect } from '../types';
import { POWER_UPS } from '../constants';
import PowerUpTooltip from './PowerUpTooltip';
import ActionButton from './ActionButton';
import TextInput from './TextInput';

interface DeckConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPowerUps: PowerUpKey[];
  onTogglePowerUp: (key: PowerUpKey) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  playSound?: (sound: SoundEffect) => void;
}

const allPowerUpKeys = Object.keys(POWER_UPS) as PowerUpKey[];

export const DeckConfigModal: React.FC<DeckConfigModalProps> = ({
  isOpen,
  onClose,
  selectedPowerUps,
  onTogglePowerUp,
  onSelectAll,
  onClearAll,
  playSound,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'targeted' | 'solo'>('all');

  const filteredKeys = useMemo(() => {
    return allPowerUpKeys.filter(key => {
      const p = POWER_UPS[key];
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      if (filterType === 'targeted') return p.requiresTarget;
      if (filterType === 'solo') return !p.requiresTarget;
      return true;
    });
  }, [searchQuery, filterType]);

  if (!isOpen) return null;

  const handleClose = () => {
    if (playSound) playSound('click');
    onClose();
  };

  const handleCardClick = (key: PowerUpKey) => {
    if (playSound) playSound('click');
    onTogglePowerUp(key);
  };

  const activeCount = selectedPowerUps.length;
  const totalCount = allPowerUpKeys.length;

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-3 sm:p-4 animate-fade-in"
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 15 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          className="bg-white dark:bg-[#052e16] border border-[#ca8a04] rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl dark:shadow-[0_0_35px_rgba(0,0,0,0.85)]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-amber-50/90 dark:bg-[#0a1f14] px-5 py-4 border-b border-[#ca8a04]/30 flex flex-wrap items-center justify-between gap-3 relative">
            <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-[#fef08a] to-transparent opacity-60"></div>
            <div className="flex items-center gap-3">
              <span className="text-3xl filter drop-shadow">🎴</span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl sm:text-2xl font-sans text-[#ca8a04] dark:text-[#fef08a] font-black uppercase tracking-wider">
                    Configure Deck
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-sans tabular-nums font-bold bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200 border border-purple-300 dark:border-purple-600">
                    {activeCount} / {totalCount} Active
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 font-sans">
                  Select which power-ups can be purchased in the in-game store
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="text-[#ca8a04]/70 hover:text-amber-800 dark:text-[#ca8a04]/60 dark:hover:text-[#fef08a] text-3xl font-light leading-none p-1 transition-colors cursor-pointer"
              title="Close"
              aria-label="Close"
            >
              &times;
            </button>
          </div>

          {/* Controls Bar: Search + Filter Tabs + Mass Actions */}
          <div className="p-3 sm:px-5 sm:py-3 bg-amber-50/40 dark:bg-black/20 border-b border-amber-200/50 dark:border-[#14532d]/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
            {/* Search */}
            <div className="w-full sm:w-64">
              <TextInput
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="🔍 Search power-ups..."
                className="w-full !py-1.5 !px-3 text-xs !bg-white dark:!bg-[#0a1f14]"
              />
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 self-center sm:self-auto">
              <button
                type="button"
                onClick={() => { if (playSound) playSound('click'); setFilterType('all'); }}
                className={`px-3 py-1 rounded-full font-sans font-bold transition-all ${
                  filterType === 'all'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-white dark:bg-[#0a1f14] text-slate-600 dark:text-slate-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 border border-slate-200 dark:border-slate-700'
                }`}
              >
                All ({allPowerUpKeys.length})
              </button>
              <button
                type="button"
                onClick={() => { if (playSound) playSound('click'); setFilterType('targeted'); }}
                className={`px-3 py-1 rounded-full font-sans font-bold transition-all ${
                  filterType === 'targeted'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-white dark:bg-[#0a1f14] text-slate-600 dark:text-slate-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 border border-slate-200 dark:border-slate-700'
                }`}
              >
                🎯 Targeted ({allPowerUpKeys.filter(k => POWER_UPS[k].requiresTarget).length})
              </button>
              <button
                type="button"
                onClick={() => { if (playSound) playSound('click'); setFilterType('solo'); }}
                className={`px-3 py-1 rounded-full font-sans font-bold transition-all ${
                  filterType === 'solo'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-white dark:bg-[#0a1f14] text-slate-600 dark:text-slate-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 border border-slate-200 dark:border-slate-700'
                }`}
              >
                ⚡ Self / Passive ({allPowerUpKeys.filter(k => !POWER_UPS[k].requiresTarget).length})
              </button>
            </div>

            {/* Quick Mass Actions */}
            <div className="flex items-center gap-2 justify-end font-sans">
              <button
                type="button"
                onClick={() => { if (playSound) playSound('click'); onSelectAll(); }}
                className="px-2.5 py-1 rounded text-[#ca8a04] hover:text-amber-700 dark:hover:text-[#fef08a] font-bold underline decoration-dotted transition-colors cursor-pointer"
              >
                Select All
              </button>
              <span className="opacity-30">|</span>
              <button
                type="button"
                onClick={() => { if (playSound) playSound('click'); onClearAll(); }}
                className="px-2.5 py-1 rounded text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 underline decoration-dotted transition-colors cursor-pointer"
              >
                Deselect All
              </button>
            </div>
          </div>

          {/* Cards Grid */}
          <div className="p-4 sm:p-5 overflow-y-auto flex-1 modal-content-scroll max-h-[62vh]">
            {filteredKeys.length === 0 ? (
              <div className="text-center py-12 text-slate-500 dark:text-slate-400 font-sans">
                <span className="text-3xl block mb-2">🔍</span>
                <p>No power-ups matching "{searchQuery}"</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                {filteredKeys.map(key => {
                  const p = POWER_UPS[key];
                  const isSelected = selectedPowerUps.includes(key);

                  return (
                    <div
                      key={key}
                      onClick={() => handleCardClick(key)}
                      className={`relative p-3 rounded-xl border text-left transition-all duration-150 cursor-pointer select-none group flex flex-col justify-between ${
                        isSelected
                          ? 'bg-gradient-to-br from-purple-50 to-amber-50/50 dark:from-[#1b1535] dark:to-[#0a1f14] border-purple-400 dark:border-purple-500/80 shadow-sm hover:shadow-md hover:border-purple-500'
                          : 'bg-white/60 dark:bg-[#071910]/60 border-slate-200 dark:border-[#14532d]/60 opacity-55 grayscale hover:opacity-85 hover:grayscale-0'
                      }`}
                    >
                      {/* Top row: Icon, Name, Checkmark */}
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <PowerUpTooltip powerUpKey={key} placement="top">
                              <span className="text-2xl filter drop-shadow hover:scale-115 transition-transform flex-shrink-0 cursor-help">
                                {p.icon}
                              </span>
                            </PowerUpTooltip>
                            <span className="font-sans font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                              {p.name}
                            </span>
                          </div>
                          
                          {/* Toggle Checkbox Badge */}
                          <div
                            className={`w-5 h-5 rounded-md flex items-center justify-center text-xs font-bold transition-all flex-shrink-0 ${
                              isSelected
                                ? 'bg-purple-600 text-white shadow-sm'
                                : 'border border-slate-300 dark:border-slate-600 text-transparent'
                            }`}
                          >
                            ✓
                          </div>
                        </div>

                        {/* Description */}
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 font-sans leading-snug line-clamp-2">
                          {p.description}
                        </p>
                      </div>

                      {/* Bottom status indicator */}
                      <div className="mt-2.5 pt-1.5 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-[10px]">
                        <span className={`font-sans tabular-nums font-semibold ${p.requiresTarget ? 'text-amber-700 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}>
                          {p.requiresTarget ? '🎯 Targeted' : '⚡ Self / Passive'}
                        </span>
                        <span className={`font-bold ${isSelected ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
                          {isSelected ? 'Active' : 'Excluded'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 bg-amber-50/70 dark:bg-[#0a1f14] border-t border-amber-200/60 dark:border-[#14532d] flex items-center justify-between gap-3">
            <div className="text-xs text-slate-600 dark:text-slate-300 font-sans">
              <span className="font-bold text-slate-900 dark:text-white">{activeCount}</span> of {totalCount} power-ups will appear in the store.
            </div>

            <ActionButton
              onClick={handleClose}
              playSound={playSound}
              variant="gold"
              className="px-8 py-2.5 text-sm font-semibold shadow-md"
            >
              Done
            </ActionButton>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default DeckConfigModal;
