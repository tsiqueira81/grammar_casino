import React, { useMemo } from 'react';
import { SoundEffect } from '../types';

export type ChipDenomination = 10 | 25 | 50 | 100 | 500;

export interface ChipConfig {
  value: ChipDenomination;
  label: string;
  bgGradient: string;
  borderColor: string;
  stripeColor: string;
  innerBg: string;
  textColor: string;
  ringColor: string;
  glowColor: string;
  baseHex: string;
  darkHex: string;
  spotHex: string;
  inlayBgHex: string;
  inlayTextHex: string;
  rimHex: string;
}

export const CHIP_CONFIGS: Record<ChipDenomination, ChipConfig> = {
  10: {
    value: 10,
    label: '$10',
    bgGradient: 'from-sky-500 via-blue-600 to-blue-900',
    borderColor: 'border-sky-300',
    stripeColor: 'bg-white',
    innerBg: 'bg-blue-950',
    textColor: 'text-sky-100',
    ringColor: 'border-sky-400',
    glowColor: 'rgba(59, 130, 246, 0.45)',
    baseHex: '#1d4ed8',
    darkHex: '#1e3a8a',
    spotHex: '#f8fafc',
    inlayBgHex: '#0f172a',
    inlayTextHex: '#e0f2fe',
    rimHex: '#7dd3fc',
  },
  25: {
    value: 25,
    label: '$25',
    bgGradient: 'from-emerald-500 via-emerald-600 to-emerald-900',
    borderColor: 'border-emerald-300',
    stripeColor: 'bg-amber-300',
    innerBg: 'bg-emerald-950',
    textColor: 'text-emerald-100',
    ringColor: 'border-amber-400/80',
    glowColor: 'rgba(16, 185, 129, 0.45)',
    baseHex: '#047857',
    darkHex: '#064e3b',
    spotHex: '#fcd34d',
    inlayBgHex: '#022c22',
    inlayTextHex: '#fef3c7',
    rimHex: '#6ee7b7',
  },
  50: {
    value: 50,
    label: '$50',
    bgGradient: 'from-rose-500 via-red-600 to-red-950',
    borderColor: 'border-rose-300',
    stripeColor: 'bg-white',
    innerBg: 'bg-rose-950',
    textColor: 'text-rose-100',
    ringColor: 'border-rose-300',
    glowColor: 'rgba(244, 63, 94, 0.45)',
    baseHex: '#be123c',
    darkHex: '#881337',
    spotHex: '#fff1f2',
    inlayBgHex: '#2e0510',
    inlayTextHex: '#ffe4e6',
    rimHex: '#fda4af',
  },
  100: {
    value: 100,
    label: '$100',
    bgGradient: 'from-zinc-800 via-neutral-900 to-black',
    borderColor: 'border-amber-400',
    stripeColor: 'bg-amber-400',
    innerBg: 'bg-black',
    textColor: 'text-amber-300',
    ringColor: 'border-amber-500',
    glowColor: 'rgba(245, 158, 11, 0.5)',
    baseHex: '#18181b',
    darkHex: '#09090b',
    spotHex: '#eab308',
    inlayBgHex: '#09090b',
    inlayTextHex: '#fef08a',
    rimHex: '#facc15',
  },
  500: {
    value: 500,
    label: '$500',
    bgGradient: 'from-purple-700 via-purple-800 to-indigo-950',
    borderColor: 'border-amber-300',
    stripeColor: 'bg-amber-300',
    innerBg: 'bg-purple-950',
    textColor: 'text-amber-200',
    ringColor: 'border-amber-400',
    glowColor: 'rgba(168, 85, 247, 0.55)',
    baseHex: '#6b21a8',
    darkHex: '#3b0764',
    spotHex: '#fde047',
    inlayBgHex: '#1e0538',
    inlayTextHex: '#fef08a',
    rimHex: '#fde047',
  },
};

export const DENOMINATIONS: ChipDenomination[] = [500, 100, 50, 25, 10];

/**
 * Break down an amount into chip counts by denomination
 */
export function decomposeAmountToChips(amount: number, maxChipsPerStack = 10): { denom: ChipDenomination; count: number }[] {
  if (amount <= 0) return [];
  let remaining = Math.floor(amount);
  const result: { denom: ChipDenomination; count: number }[] = [];

  for (const denom of DENOMINATIONS) {
    if (remaining >= denom) {
      const count = Math.floor(remaining / denom);
      result.push({ denom, count });
      remaining %= denom;
    }
  }

  return result;
}

/**
 * Single authentic clay-composite poker chip with 6-spot edge inserts & foil inlay
 */
export interface PokerChipProps {
  denomination: ChipDenomination;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  showShadow?: boolean;
}

export const PokerChip: React.FC<PokerChipProps> = ({
  denomination,
  size = 'md',
  onClick,
  disabled = false,
  className = '',
  showShadow = true,
}) => {
  const config = CHIP_CONFIGS[denomination];

  const dimensions = {
    xs: { outer: 'w-6 h-6', inner: 'w-4 h-4', text: 'text-[8px]', lip: '2px' },
    sm: { outer: 'w-9 h-9', inner: 'w-6 h-6', text: 'text-[10px]', lip: '2.5px' },
    md: { outer: 'w-11 h-11', inner: 'w-7 h-7', text: 'text-xs', lip: '3px' },
    lg: { outer: 'w-14 h-14', inner: 'w-9 h-9', text: 'text-sm', lip: '3.5px' },
  }[size];

  // Realistic 6-spot casino chip edge pattern using conic-gradient
  const conicPattern = `conic-gradient(
    from 15deg,
    ${config.baseHex} 0deg 42deg,
    ${config.spotHex} 42deg 60deg,
    ${config.baseHex} 60deg 102deg,
    ${config.spotHex} 102deg 120deg,
    ${config.baseHex} 120deg 162deg,
    ${config.spotHex} 162deg 180deg,
    ${config.baseHex} 180deg 222deg,
    ${config.spotHex} 222deg 240deg,
    ${config.baseHex} 240deg 282deg,
    ${config.spotHex} 282deg 300deg,
    ${config.baseHex} 300deg 342deg,
    ${config.spotHex} 342deg 360deg
  )`;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      title={`${config.label} Casino Chip`}
      style={{
        background: conicPattern,
        boxShadow: showShadow
          ? `0 ${dimensions.lip} 0 ${config.darkHex}, 0 6px 12px rgba(0, 0, 0, 0.55), inset 0 1px 1px rgba(255, 255, 255, 0.45)`
          : `0 1.5px 0 ${config.darkHex}, inset 0 1px 1px rgba(255, 255, 255, 0.35)`,
      }}
      className={`relative rounded-full flex items-center justify-center p-0.5 border border-white/25 select-none transition-all duration-150 ${dimensions.outer} ${
        onClick && !disabled
          ? 'cursor-pointer hover:-translate-y-1 hover:scale-110 active:translate-y-0 active:scale-95 hover:brightness-110'
          : disabled
          ? 'opacity-35 cursor-not-allowed grayscale'
          : 'cursor-default'
      } ${className}`}
    >
      {/* Subtle recessed mold ring */}
      <div
        className="absolute inset-[2px] rounded-full pointer-events-none border border-dashed opacity-70"
        style={{ borderColor: config.rimHex }}
      />

      {/* Inner metallic-rimmed center inlay */}
      <div
        style={{
          backgroundColor: config.inlayBgHex,
          borderColor: config.rimHex,
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,0,0,0.4)',
        }}
        className={`relative z-10 rounded-full flex items-center justify-center border ${dimensions.inner}`}
      >
        <span
          style={{ color: config.inlayTextHex }}
          className={`font-mono-casino font-extrabold tracking-tighter leading-none ${dimensions.text} drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]`}
        >
          {denomination >= 1000 ? `${denomination / 1000}k` : denomination}
        </span>
      </div>
    </button>
  );
};

/**
 * Vertical 3D Stack of poker chips of the same denomination
 */
export interface ChipStackProps {
  denomination: ChipDenomination;
  count: number;
  maxDisplay?: number;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  onClick?: () => void;
  disabled?: boolean;
}

export const ChipStack: React.FC<ChipStackProps> = ({
  denomination,
  count,
  maxDisplay = 7,
  size = 'md',
  onClick,
  disabled,
}) => {
  const displayCount = Math.min(count, maxDisplay);
  const config = CHIP_CONFIGS[denomination];

  const chipHeight = {
    xs: 22,
    sm: 30,
    md: 38,
    lg: 48,
  }[size];

  const offsetPx = {
    xs: 3,
    sm: 4,
    md: 5,
    lg: 6,
  }[size];

  const totalHeight = chipHeight + (displayCount - 1) * offsetPx;

  return (
    <div
      onClick={onClick}
      className={`flex flex-col items-center group relative select-none ${
        onClick && !disabled ? 'cursor-pointer hover:scale-105 transition-transform' : ''
      }`}
      title={`${count}× ${config.label} chip${count > 1 ? 's' : ''} = $${(count * denomination).toLocaleString()}`}
    >
      <div
        className="relative flex items-center justify-center"
        style={{
          width: chipHeight + 8,
          height: totalHeight + 4,
        }}
      >
        {/* Chips stacked from bottom to top */}
        {Array.from({ length: displayCount }).map((_, idx) => {
          const bottomOffset = idx * offsetPx;
          const isTop = idx === displayCount - 1;

          return (
            <div
              key={idx}
              className="absolute left-1/2 -translate-x-1/2 transition-transform"
              style={{
                bottom: bottomOffset,
                zIndex: idx + 1,
              }}
            >
              <PokerChip
                denomination={denomination}
                size={size}
                showShadow={isTop}
                disabled={disabled}
              />
            </div>
          );
        })}
      </div>

      {/* Chip count badge */}
      <div className="mt-1.5 flex items-center gap-1 bg-black/80 px-2 py-0.5 rounded-full border border-[#d4af37]/50 text-[10px] font-mono-casino text-amber-300 shadow-md">
        <span className="opacity-80">{count}×</span>
        <span className="font-bold text-white">${(count * denomination).toLocaleString()}</span>
      </div>
    </div>
  );
};

/**
 * Visual Rack of Chip Stacks representing a total dollar amount
 */
export interface ChipRackProps {
  amount: number;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
  emptyPlaceholder?: string;
}

export const ChipRack: React.FC<ChipRackProps> = ({
  amount,
  size = 'sm',
  className = '',
  emptyPlaceholder = 'No chips in rack',
}) => {
  const stacks = useMemo(() => decomposeAmountToChips(amount), [amount]);

  if (amount <= 0 || stacks.length === 0) {
    return (
      <div className={`text-xs text-slate-400 dark:text-slate-500 italic py-1 ${className}`}>
        {emptyPlaceholder}
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-end justify-center gap-3.5 p-3 felt-well rounded-xl ${className}`}>
      {stacks.map(({ denom, count }) => (
        <ChipStack
          key={denom}
          denomination={denom}
          count={count}
          size={size}
        />
      ))}
    </div>
  );
};

/**
 * Interactive Quick-Chip Tray for rapid betting in PlayerBettingCard
 */
export interface QuickChipTrayProps {
  currentBet: number;
  playerMoney: number;
  maxBet?: number;
  onAddAmount: (addAmount: number) => void;
  onClear: () => void;
  onAllIn: () => void;
  disabled?: boolean;
  playSound?: (sound: SoundEffect) => void;
  className?: string;
}

export const QuickChipTray: React.FC<QuickChipTrayProps> = ({
  currentBet,
  playerMoney,
  maxBet,
  onAddAmount,
  onClear,
  onAllIn,
  disabled = false,
  playSound,
  className = '',
}) => {
  const maxAllowed = maxBet !== undefined ? Math.min(playerMoney, maxBet) : playerMoney;

  const handleChipClick = (val: ChipDenomination) => {
    if (disabled) return;
    if (playerMoney <= 0) return;
    playSound?.('bet');
    onAddAmount(val);
  };

  return (
    <div className={`p-3 rounded-xl felt-well space-y-2 ${className}`}>
      <div className="flex items-center justify-between text-[11px] font-serif uppercase tracking-widest text-amber-900 dark:text-amber-200/90">
        <span className="flex items-center gap-1.5 font-bold">
          <span className="text-[#d4af37]">◈</span>
          <span>Chip Rack</span>
        </span>
        <div className="flex items-center gap-3">
          {currentBet > 0 && (
            <button
              type="button"
              onClick={() => {
                playSound?.('click');
                onClear();
              }}
              disabled={disabled}
              className="text-rose-600 dark:text-rose-400 hover:text-rose-500 font-bold uppercase tracking-wider text-[10px] px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/30 transition-colors cursor-pointer disabled:opacity-50"
            >
              Clear Table
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              playSound?.('bet');
              onAllIn();
            }}
            disabled={disabled || playerMoney === 0 || currentBet >= maxAllowed}
            className="text-amber-800 dark:text-[#fef08a] font-bold uppercase tracking-wider text-[10px] px-2 py-0.5 rounded bg-amber-500/15 border border-[#d4af37]/40 hover:bg-amber-500/25 transition-colors cursor-pointer disabled:opacity-40"
          >
            {maxBet !== undefined && maxBet < playerMoney ? `Max Cap ($${maxAllowed})` : `All-In ($${playerMoney.toLocaleString()})`}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between sm:justify-around gap-2 overflow-x-auto pt-1.5 pb-1 px-1">
        {DENOMINATIONS.slice().reverse().map((denom) => {
          const canAfford = maxAllowed >= currentBet + denom;
          return (
            <div key={denom} className="flex flex-col items-center group/chip">
              <PokerChip
                denomination={denom}
                size="sm"
                onClick={() => handleChipClick(denom)}
                disabled={disabled || !canAfford}
              />
              <span className="text-[10px] font-mono-casino font-semibold text-amber-900/70 dark:text-amber-200/70 mt-1 group-hover/chip:text-amber-600 dark:group-hover/chip:text-[#fef08a] transition-colors">
                +${denom}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * WagerChipsDisplay: Visual representation of chips physically placed in the betting circle
 */
export interface WagerChipsDisplayProps {
  amount: number;
  label?: string;
  className?: string;
}

export const WagerChipsDisplay: React.FC<WagerChipsDisplayProps> = ({
  amount,
  label = 'Wager on Felt',
  className = '',
}) => {
  const stacks = useMemo(() => decomposeAmountToChips(amount, 5), [amount]);

  if (amount <= 0) return null;

  return (
    <div
      className={`px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-amber-500/15 dark:from-[#082c19] dark:via-[#0d3b22] dark:to-[#082c19] border border-[#d4af37]/50 shadow-[inset_0_1px_0_rgba(254,240,138,0.2),0_4px_12px_rgba(0,0,0,0.2)] flex items-center justify-between gap-3 ${className}`}
    >
      <div className="flex items-center gap-2 text-xs font-serif font-bold text-amber-950 dark:text-amber-200">
        <span className="w-6 h-6 rounded-full bg-[#d4af37]/20 border border-[#d4af37]/60 flex items-center justify-center text-xs text-amber-700 dark:text-[#fef08a]">
          ♠
        </span>
        <div>
          <div className="text-[10px] uppercase tracking-widest opacity-75">{label}</div>
          <div className="font-mono-casino text-sm sm:text-base text-slate-900 dark:text-[#fef08a] font-extrabold">
            ${amount.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap justify-end">
        {stacks.slice(0, 4).map(({ denom, count }) => (
          <div key={denom} className="flex items-center bg-black/15 dark:bg-black/40 pl-1 pr-2 py-0.5 rounded-full border border-[#d4af37]/30">
            <PokerChip denomination={denom} size="xs" />
            {count > 1 && (
              <span className="text-[10px] font-mono-casino font-bold text-amber-900 dark:text-amber-300 ml-1">
                ×{count}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

