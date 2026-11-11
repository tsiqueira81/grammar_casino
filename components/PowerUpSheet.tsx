import React, { useEffect, useRef } from 'react';
import { useFocusTrap } from '../utils/useFocusTrap';
import { X } from 'lucide-react';
import { POWER_UPS } from '../constants';
import { getPowerUpEntry, type PowerUpCategory } from '../game/powerUpCatalog';
import type { PowerUpKey } from '../types';

// Package S5: a power-up explained by touch. A bottom sheet with the card's icon, name, plain
// description, who it affects and when it ends. Opens from a tap on any power-up chip.

export interface PowerUpSheetInfo {
  key: PowerUpKey;
  /** Who used it on this player, when it was an attack. */
  fromName?: string;
  /** Hands left for an effect that lasts several hands (-1: until used). */
  handsLeft?: number;
}

const CATEGORY_LABEL: Record<PowerUpCategory, string> = {
  boost: 'Boost',
  shield: 'Shield',
  insight: 'Clue',
  mischief: 'Attack',
};

/** Who a card affects, in a few words. */
export function powerUpAffects(key: PowerUpKey): string {
  const entry = getPowerUpEntry(key);
  if (!entry) return '';
  if (entry.targeted) return 'One player you choose';
  if (['TAXMAN', 'GENEROUS', 'THE_TITHE', 'ROBIN_HOOD'].includes(key)) return 'Every other player';
  return 'You';
}

/** When an effect ends, in a few words. */
export function powerUpEnds(info: PowerUpSheetInfo): string {
  if (info.handsLeft === -1) return 'When it is used';
  if (typeof info.handsLeft === 'number' && info.handsLeft > 0) return info.handsLeft === 1 ? 'After this hand' : `In ${info.handsLeft} hands`;
  return 'At the end of this hand';
}

export const PowerUpSheetBody: React.FC<{ info: PowerUpSheetInfo }> = ({ info }) => {
  const entry = getPowerUpEntry(info.key);
  const card = POWER_UPS[info.key];
  if (!entry || !card) return null;
  return (
    <div className="space-y-3" data-testid={`power-up-sheet-${info.key}`}>
      <div className="flex items-center gap-3">
        <span className="text-[44px] leading-none" aria-hidden="true">{card.icon}</span>
        <div className="min-w-0">
          <h2 className="m-0 text-[22px] font-extrabold text-gc-ink">{entry.name}</h2>
          <span className="text-gc-cap font-bold text-gc-quiet uppercase tracking-wide">{CATEGORY_LABEL[entry.category]}</span>
        </div>
      </div>
      <p className="m-0 text-[18px] leading-snug text-gc-ink">{entry.plainDescription}</p>
      {info.fromName && <p className="m-0 text-[15px] font-semibold text-gc-loss">{info.fromName} used this on you.</p>}
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[15px]">
        <dt className="font-bold text-gc-quiet">Affects</dt>
        <dd className="m-0 text-gc-ink">{info.fromName ? 'You' : powerUpAffects(info.key)}</dd>
        <dt className="font-bold text-gc-quiet">Ends</dt>
        <dd className="m-0 text-gc-ink">{powerUpEnds(info)}</dd>
      </dl>
    </div>
  );
};

const PowerUpSheet: React.FC<{ info: PowerUpSheetInfo; onClose: () => void }> = ({ info, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  // Package S8: the keyboard stays in this sheet while it is open.
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef);
  const name = getPowerUpEntry(info.key)?.name ?? 'Power-up';
  return (
    <div ref={dialogRef} className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={name}>
      <button type="button" className="absolute inset-0 bg-black/40 cursor-default" aria-label="Close" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-t-[24px] gc-surface px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-gc-slide-up">
        <button type="button" onClick={onClose} className="absolute right-3 top-3 w-11 h-11 grid place-items-center rounded-full text-gc-quiet" aria-label="Close">
          <X className="w-5 h-5" aria-hidden="true" />
        </button>
        <PowerUpSheetBody info={info} />
      </div>
    </div>
  );
};

export default PowerUpSheet;
