import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';

export interface BroadcastCutInPayload {
  id: string;
  powerUpName: string;
  powerUpIcon: string;
  attackerName: string;
  attackerAvatar: string;
  targetName?: string;
  targetAvatar?: string;
  isBoomerang?: boolean;
  subtitle?: string;
  accent?: 'gold' | 'crimson' | 'cyan' | 'emerald' | 'purple';
}

interface BroadcastCutInProps {
  cutIn: BroadcastCutInPayload | null;
  onComplete: () => void;
  calmMode?: boolean;
}

const ACCENT_STYLES: Record<NonNullable<BroadcastCutInPayload['accent']>, {
  bg: string;
  border: string;
  badge: string;
  glow: string;
}> = {
  gold: {
    bg: 'from-[#1a1203]/95 via-[#3d2906]/95 to-[#1a1203]/95',
    border: 'border-[#fde047]',
    badge: 'bg-[#fde047] text-[#1c1202]',
    glow: 'shadow-[0_0_60px_rgba(253,224,71,0.45)]',
  },
  crimson: {
    bg: 'from-[#26050c]/95 via-[#590d1d]/95 to-[#26050c]/95',
    border: 'border-rose-400',
    badge: 'bg-rose-400 text-[#26050c]',
    glow: 'shadow-[0_0_60px_rgba(251,113,133,0.45)]',
  },
  cyan: {
    bg: 'from-[#041e2b]/95 via-[#0a3c54]/95 to-[#041e2b]/95',
    border: 'border-cyan-300',
    badge: 'bg-cyan-300 text-[#041e2b]',
    glow: 'shadow-[0_0_60px_rgba(103,232,249,0.45)]',
  },
  emerald: {
    bg: 'from-[#042418]/95 via-[#094a32]/95 to-[#042418]/95',
    border: 'border-emerald-300',
    badge: 'bg-emerald-300 text-[#042418]',
    glow: 'shadow-[0_0_60px_rgba(110,231,183,0.45)]',
  },
  purple: {
    bg: 'from-[#1d0733]/95 via-[#3b0f66]/95 to-[#1d0733]/95',
    border: 'border-purple-300',
    badge: 'bg-purple-300 text-[#1d0733]',
    glow: 'shadow-[0_0_60px_rgba(216,180,254,0.45)]',
  },
};

export const BroadcastCutIn: React.FC<BroadcastCutInProps> = ({
  cutIn,
  onComplete,
  calmMode = false,
}) => {
  useEffect(() => {
    if (!cutIn) return;
    const duration = calmMode ? 900 : 2100;
    const timer = setTimeout(() => {
      onComplete();
    }, duration);
    return () => clearTimeout(timer);
  }, [cutIn, calmMode, onComplete]);

  if (calmMode) return null;

  const accentKey = cutIn?.accent || (cutIn?.isBoomerang ? 'gold' : cutIn?.targetName ? 'crimson' : 'gold');
  const style = ACCENT_STYLES[accentKey];

  return (
    <AnimatePresence>
      {cutIn && (
        <motion.div
          key={cutIn.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onComplete}
          className="fixed inset-0 z-[70] pointer-events-auto flex items-center justify-center overflow-hidden bg-black/45 backdrop-blur-[2px] cursor-pointer select-none"
          role="status"
          aria-live="assertive"
        >
          {/* Diagonal Broadcast Action Strip */}
          <motion.div
            initial={{ x: '-110%', skewY: -3, scale: 0.94 }}
            animate={{ x: '0%', skewY: -3, scale: 1 }}
            exit={{ x: '110%', skewY: -3, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
            className={`w-[110vw] max-w-none py-5 sm:py-7 px-6 bg-gradient-to-r ${style.bg} border-y-4 ${style.border} ${style.glow} relative overflow-hidden`}
          >
            {/* Animated Specular Sweep */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: '220%' }}
              transition={{ duration: 1.1, ease: 'easeInOut' }}
              className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/15 to-transparent skew-x-[-25deg] pointer-events-none"
            />

            <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-center gap-4 sm:gap-8 text-white">
              {/* Attacker */}
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.08, type: 'spring', stiffness: 320 }}
                className="flex items-center gap-3"
              >
                <span className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/10 border-2 border-white/60 grid place-items-center text-4xl sm:text-5xl shadow-lg">
                  {cutIn.attackerAvatar}
                </span>
                <div className="text-left">
                  <div className="text-xs sm:text-sm uppercase tracking-widest text-white/75 font-bold">
                    {cutIn.isBoomerang ? 'Reflected By' : 'Caster'}
                  </div>
                  <div className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                    {cutIn.attackerName}
                  </div>
                </div>
              </motion.div>

              {/* Center Power-Up Emblem */}
              <motion.div
                initial={{ scale: 0.4, rotate: -15, opacity: 0 }}
                animate={{ scale: 1.06, rotate: 0, opacity: 1 }}
                transition={{ delay: 0.14, type: 'spring', stiffness: 340, damping: 16 }}
                className="flex flex-col items-center text-center px-4 py-2 rounded-2xl bg-black/40 border border-white/25 shadow-xl"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-4xl sm:text-5xl filter drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]">
                    {cutIn.isBoomerang ? '🪃' : cutIn.powerUpIcon}
                  </span>
                  <div className="text-left">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider ${style.badge}`}>
                      {cutIn.isBoomerang ? 'Boomerang Trap!' : 'Power-Up Play'}
                    </span>
                    <div className="text-xl sm:text-2xl font-black uppercase tracking-wide text-white mt-0.5">
                      {cutIn.powerUpName}
                    </div>
                  </div>
                </div>
                {cutIn.subtitle && (
                  <div className="mt-1.5 text-xs sm:text-sm font-semibold text-white/90 max-w-md">
                    {cutIn.subtitle}
                  </div>
                )}
              </motion.div>

              {/* Target (if targeted) */}
              {cutIn.targetName && (
                <motion.div
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.2, type: 'spring', stiffness: 320 }}
                  className="flex items-center gap-3"
                >
                  <div className="text-2xl sm:text-3xl font-black text-white/80" aria-hidden="true">
                    ➔
                  </div>
                  <span className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/10 border-2 border-rose-300/80 grid place-items-center text-4xl sm:text-5xl shadow-lg">
                    {cutIn.targetAvatar || '🎯'}
                  </span>
                  <div className="text-left">
                    <div className="text-xs sm:text-sm uppercase tracking-widest text-rose-200 font-bold">
                      {cutIn.isBoomerang ? 'Backfired On' : 'Target'}
                    </div>
                    <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                      {cutIn.targetName}
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default BroadcastCutIn;
