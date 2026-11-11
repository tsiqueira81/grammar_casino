import React from 'react';
import { motion } from 'motion/react';
import { twMerge } from '../utils/twMerge';
import { SoundEffect } from '../types';

interface ActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  playSound?: (sound: SoundEffect, ...args: any[]) => void;
  sound?: SoundEffect;
  /** 'primary' is style A's one main button per screen: navy (light theme) or gold (dark), sentence case, pill-shaped. */
  variant?: 'primary' | 'ghost' | 'gold' | 'red' | 'danger' | 'blue' | 'green' | 'purple' | 'outline-gold' | 'outline-green' | 'outline-red' | 'secondary';
}

const ActionButton: React.FC<ActionButtonProps> = ({ onClick, playSound, sound = 'click', children, className, variant = 'gold', ...rest }) => {
  const {
    onDrag: _onDrag,
    onDragStart: _onDragStart,
    onDragEnd: _onDragEnd,
    onAnimationStart: _onAnimationStart,
    ...motionSafeRest
  } = rest;

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (playSound) {
      playSound(sound);
    }
    if (onClick) {
      onClick(e);
    }
  };

  let gradientClasses = "";
  switch(variant) {
      case 'primary':
        gradientClasses = "gc-btn-primary border-0 rounded-full normal-case tracking-normal font-extrabold hover:brightness-105 disabled:opacity-100 disabled:grayscale-0";
        break;
      case 'ghost':
        gradientClasses = "bg-gc-line/[0.06] border border-gc-line/[0.16] text-gc-ink rounded-gc-sm normal-case tracking-normal hover:bg-gc-line/[0.1] hover:border-gc-line/30 disabled:grayscale-0";
        break;
      case 'gold': 
        gradientClasses = "bg-gradient-to-b from-[#fef08a] via-[#eab308] to-[#a16207] text-[#1c0a04] font-extrabold border border-[#fef9c3] shadow-[0_6px_20px_-3px_rgba(202,138,4,0.45),0_2px_4px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.85),inset_0_-2px_0_rgba(113,63,18,0.6)] hover:brightness-105 hover:shadow-[0_8px_28px_-2px_rgba(234,179,8,0.65),inset_0_1px_0_rgba(255,255,255,0.95)]";
        break;
      case 'outline-gold':
        gradientClasses = "bg-gradient-to-b from-amber-50/90 to-amber-100/70 dark:from-[#0c2e1b]/90 dark:to-[#061c10]/95 border border-[#ca8a04]/70 dark:border-[#d4af37]/60 text-amber-950 dark:text-[#fef08a] hover:border-[#ca8a04] dark:hover:border-[#fef08a] hover:bg-amber-100/80 dark:hover:bg-[#113d24] shadow-[0_3px_10px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.6)] dark:shadow-[0_4px_14px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(254,240,138,0.18)]";
        break;
      case 'outline-green':
        gradientClasses = "bg-gradient-to-b from-emerald-50/90 to-emerald-100/70 dark:from-[#09351e]/90 dark:to-[#052012]/95 border border-emerald-600/70 dark:border-emerald-400/60 text-emerald-900 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 hover:border-emerald-500 shadow-[0_3px_10px_rgba(16,185,129,0.12),inset_0_1px_0_rgba(255,255,255,0.5)] dark:shadow-[0_4px_14px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(52,211,153,0.2)]";
        break;
      case 'outline-red':
        gradientClasses = "bg-gradient-to-b from-red-50/90 to-red-100/70 dark:from-red-950/60 dark:to-red-950/90 border border-red-500/70 dark:border-red-400/60 text-red-800 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50 shadow-sm dark:shadow-[0_4px_14px_rgba(0,0,0,0.5)]";
        break;
      case 'red':
      case 'danger':
        gradientClasses = "bg-gradient-to-b from-rose-600 via-red-700 to-red-950 text-white border border-rose-400/80 shadow-[0_6px_18px_-3px_rgba(225,29,72,0.45),inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-2px_0_rgba(69,10,10,0.7)] hover:brightness-110";
        break;
      case 'green':
        gradientClasses = "bg-gradient-to-b from-emerald-500 via-emerald-700 to-emerald-950 text-white border border-emerald-300/80 shadow-[0_6px_18px_-3px_rgba(16,185,129,0.45),inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-2px_0_rgba(2,44,34,0.7)] hover:brightness-110";
        break;
      case 'blue':
        gradientClasses = "bg-gradient-to-b from-sky-500 via-blue-700 to-slate-900 text-white border border-sky-300/80 shadow-[0_6px_18px_-3px_rgba(14,165,233,0.4),inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-2px_0_rgba(15,23,42,0.7)] hover:brightness-110";
        break;
      case 'purple':
        gradientClasses = "bg-gradient-to-b from-purple-500 via-purple-700 to-indigo-950 text-white border border-purple-300/80 shadow-[0_6px_18px_-3px_rgba(168,85,247,0.45),inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-2px_0_rgba(46,16,101,0.7)] hover:brightness-110";
        break;
      case 'secondary':
      default:
        gradientClasses = "bg-gradient-to-b from-slate-600 via-slate-700 to-slate-900 text-white border border-slate-400/60 shadow-[0_4px_12px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.2)] hover:brightness-110";
  }

  // Override variant if class explicitly sets bg color (fallback for legacy props from App.tsx)
  if (className?.includes('bg-red')) gradientClasses = "bg-gradient-to-b from-rose-600 via-red-700 to-red-950 text-white border border-rose-400/80 shadow-md";
  if (className?.includes('bg-green')) gradientClasses = "bg-gradient-to-b from-emerald-500 via-emerald-700 to-emerald-950 text-white border border-emerald-300/80 shadow-md";
  if (className?.includes('bg-blue')) gradientClasses = "bg-gradient-to-b from-sky-500 via-blue-700 to-slate-900 text-white border border-sky-300/80 shadow-md";
  if (className?.includes('bg-purple')) gradientClasses = "bg-gradient-to-b from-purple-500 via-purple-700 to-indigo-950 text-white border border-purple-300/80 shadow-md";

  const baseClasses = `
    relative px-6 py-2.5 rounded-lg font-sans uppercase tracking-wider font-bold
    transition-all duration-gc-fast ease-gc-out cursor-pointer select-none
    disabled:opacity-45 disabled:cursor-not-allowed disabled:grayscale disabled:shadow-none
  `;
  
  return (
    <motion.button 
      whileHover={{ scale: rest.disabled ? 1 : 1.02, y: rest.disabled ? 0 : -1 }}
      whileTap={{ scale: rest.disabled ? 1 : 0.97, y: rest.disabled ? 0 : 1 }}
      onClick={handleClick} 
      className={twMerge(baseClasses, gradientClasses, className)} 
      {...motionSafeRest}
    >
      <span className={`block w-full ${(variant === 'primary' || variant === 'ghost') ? '' : variant === 'gold' ? 'drop-shadow-[0_1px_0_rgba(255,255,255,0.45)]' : 'drop-shadow-sm'}`}>{children}</span>
    </motion.button>
  );
};

export default ActionButton;

