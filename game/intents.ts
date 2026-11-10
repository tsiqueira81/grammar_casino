/**
 * Pure rules for checking what a student's phone asks the host to do.
 *
 * The host browser tab is the game authority. Anything a phone sends can be
 * forged with browser dev tools, so the host only trusts what it recorded
 * itself (pending purchases, the wheel prize it drew, the seat's lock state).
 */
import { AVATARS, HINT_COST, WHEEL_ITEMS } from '../constants';
import {
  AVATAR_AURAS,
  AVATAR_FLAIRS,
  getCharacterById,
} from '../utils/characterAvatars';
import type { PowerUpKey, WheelItem } from '../types';

export const MAX_PLAYER_NAME_LENGTH = 20;

/**
 * Fix 2 and 3: a target choice or a cancel is only valid while the host holds
 * a pending purchase for that player. The key named by the phone is ignored.
 */
export function resolvePendingPowerUp(
  pending: PowerUpKey | null | undefined,
): PowerUpKey | null {
  return pending || null;
}

/**
 * Fix 11: a target dialog must always have a way out. Swap normally cannot be
 * refunded (it shows everyone's vaults), so it gets a refund only when there is
 * no player it could legally target.
 */
export function canCancelPowerUpTarget(powerUp: PowerUpKey, hasSelectableTarget: boolean): boolean {
  return powerUp !== 'SWAP' || !hasSelectableTarget;
}

/** Fix 1: the host draws the wheel prize when the wheel power-up is bought. */
export function drawWheelItem(random: () => number = Math.random): WheelItem {
  const idx = Math.min(WHEEL_ITEMS.length - 1, Math.floor(random() * WHEEL_ITEMS.length));
  return WHEEL_ITEMS[Math.max(0, idx)];
}

/**
 * Fix 1: when the phone reports its spin has finished, apply the prize the host
 * drew. Whatever item id the phone sends is ignored. No pending spin, no prize.
 */
export function resolveWheelResult(pendingItemId: string | null | undefined): WheelItem | null {
  if (!pendingItemId) return null;
  return WHEEL_ITEMS.find(w => w.id === pendingItemId) ?? null;
}

export interface LockInBetCheck {
  /** The seat is already locked in on the host. */
  seatLocked: boolean;
  /** The shared round timer has run out (or the round is locked by the timer). */
  timeUp: boolean;
  /** The player is frozen by Sub-Zero. */
  frozen: boolean;
  /** The intent is the one that locks the seat (LOCK_IN with locked: true). */
  isLockingIntent: boolean;
}

/**
 * Fix 4: a phone may only push a full bet past the normal lock check when this
 * very intent is the one locking the seat, and only while the round is open.
 */
export function canSubmitBetWithLock(check: LockInBetCheck): boolean {
  return check.isLockingIntent && !check.seatLocked && !check.timeUp && !check.frozen;
}

/** Fix 6: refund a failed hint against the player's current money, not a stale copy. */
export function refundHint(currentMoney: number): number {
  return currentMoney + HINT_COST;
}

/** Fix 7: trim, collapse inner whitespace and cap the length of a player name. */
export function sanitizePlayerName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_PLAYER_NAME_LENGTH).trim();
}

const AURA_IDS = new Set<string>(AVATAR_AURAS.map(a => a.id));
const FLAIR_IDS = new Set<string>(AVATAR_FLAIRS.map(f => f.id));
const EMOJI_SET = new Set<string>(AVATARS);

/**
 * Fix 7: accept only avatars the character picker can produce:
 * `char:<id>[|aura|flair]`, `emoji:<emoji>|aura|flair` or a plain listed emoji.
 */
export function isKnownAvatar(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  const value = raw.trim();
  if (!value || value.length > 80) return false;
  const optionalStyle = (aura?: string, flair?: string, extra?: string) =>
    extra === undefined &&
    (aura === undefined || AURA_IDS.has(aura)) &&
    (flair === undefined || FLAIR_IDS.has(flair));
  if (value.startsWith('char:')) {
    const [id, aura, flair, extra] = value.slice(5).split('|');
    return Boolean(getCharacterById(id)) && optionalStyle(aura, flair, extra);
  }
  if (value.startsWith('emoji:')) {
    const [emoji, aura, flair, extra] = value.slice(6).split('|');
    return EMOJI_SET.has(emoji) && optionalStyle(aura, flair, extra);
  }
  return EMOJI_SET.has(value);
}

/**
 * Fix 9: a guard against running an action twice before React re-renders
 * (for example a double click on "Deal the next hand").
 */
export function createReentryGuard() {
  let busy = false;
  return {
    tryEnter(): boolean {
      if (busy) return false;
      busy = true;
      return true;
    },
    release(): void {
      busy = false;
    },
    get isBusy(): boolean {
      return busy;
    },
  };
}

/**
 * Fix 8: run an async step and always clear the busy state afterwards, even
 * when the step throws. Returns the error (if any) so the caller can tell the
 * teacher, instead of leaving the reveal spinner up for ever.
 */
export async function runAlwaysClearing(
  step: () => Promise<void>,
  clear: () => void,
): Promise<unknown | null> {
  try {
    await step();
    return null;
  } catch (err) {
    return err ?? new Error('Unknown error');
  } finally {
    clear();
  }
}
