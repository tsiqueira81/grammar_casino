import { describe, it, expect, vi } from 'vitest';
import {
  resolvePendingPowerUp,
  drawWheelItem,
  resolveWheelResult,
  canSubmitBetWithLock,
  canCancelPowerUpTarget,
  refundHint,
  sanitizePlayerName,
  isKnownAvatar,
  createReentryGuard,
  runAlwaysClearing,
  MAX_PLAYER_NAME_LENGTH,
} from '../game/intents';
import { HINT_COST, WHEEL_ITEMS, AVATARS } from '../constants';
import { CHARACTER_AVATARS } from '../utils/characterAvatars';
import { buildSentenceSegments } from '../utils/sentenceSegments';

describe('F4 fix 1: the host decides the wheel prize', () => {
  it('draws a real wheel item from the random source', () => {
    expect(drawWheelItem(() => 0)).toBe(WHEEL_ITEMS[0]);
    expect(drawWheelItem(() => 0.9999)).toBe(WHEEL_ITEMS[WHEEL_ITEMS.length - 1]);
    expect(drawWheelItem(() => 1)).toBe(WHEEL_ITEMS[WHEEL_ITEMS.length - 1]);
  });

  it('applies only the prize the host drew', () => {
    const drawn = WHEEL_ITEMS[3];
    expect(resolveWheelResult(drawn.id)).toBe(drawn);
  });

  it('gives no prize when no spin is pending, whatever the phone claims', () => {
    expect(resolveWheelResult(undefined)).toBeNull();
    expect(resolveWheelResult(null)).toBeNull();
    expect(resolveWheelResult('')).toBeNull();
  });
});

describe('F4 fixes 2 and 3: power-ups need a recorded purchase', () => {
  it('uses the pending purchase', () => {
    expect(resolvePendingPowerUp('PICKPOCKET')).toBe('PICKPOCKET');
  });

  it('rejects target choices and refunds with no pending purchase', () => {
    expect(resolvePendingPowerUp(undefined)).toBeNull();
    expect(resolvePendingPowerUp(null)).toBeNull();
  });
});

describe('F4 fix 4: bets cannot change after lock-in', () => {
  const open = { isLockingIntent: true, seatLocked: false, timeUp: false, frozen: false };

  it('accepts the bet carried by the intent that locks the seat', () => {
    expect(canSubmitBetWithLock(open)).toBe(true);
  });

  it('rejects a bet when the intent does not lock the seat', () => {
    expect(canSubmitBetWithLock({ ...open, isLockingIntent: false })).toBe(false);
  });

  it('rejects a bet after the seat is already locked', () => {
    expect(canSubmitBetWithLock({ ...open, seatLocked: true })).toBe(false);
  });

  it('rejects a bet after time is up', () => {
    expect(canSubmitBetWithLock({ ...open, timeUp: true })).toBe(false);
  });

  it('rejects a bet from a frozen player', () => {
    expect(canSubmitBetWithLock({ ...open, frozen: true })).toBe(false);
  });
});

describe('F4 fix 6: a failed hint is refunded against current money', () => {
  it('adds the hint cost to the current balance, not a stale one', () => {
    // The player had 500, paid 25 for the hint, then won 100 elsewhere before the hint failed.
    const current = 500 - HINT_COST + 100;
    expect(refundHint(current)).toBe(600);
  });
});

describe('F4 fix 7: renames and avatars are limited', () => {
  it('trims, collapses whitespace and caps the length', () => {
    expect(sanitizePlayerName('   Ana    Maria  ')).toBe('Ana Maria');
    const long = 'x'.repeat(500);
    expect(sanitizePlayerName(long)).toHaveLength(MAX_PLAYER_NAME_LENGTH);
    expect(sanitizePlayerName('\n\t ')).toBe('');
    expect(sanitizePlayerName(42)).toBe('');
  });

  it('does not leave a trailing space after cutting', () => {
    expect(sanitizePlayerName('abcdefghijklmnopqrs tuvwxyz')).toBe('abcdefghijklmnopqrs');
  });

  it('accepts avatars the picker can produce', () => {
    const ch = CHARACTER_AVATARS[0];
    expect(isKnownAvatar(`char:${ch.id}`)).toBe(true);
    expect(isKnownAvatar(`char:${ch.id}|gold|none`)).toBe(true);
    expect(isKnownAvatar(AVATARS[0])).toBe(true);
    expect(isKnownAvatar(`emoji:${AVATARS[0]}|neon|none`)).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isKnownAvatar('char:not_a_real_character')).toBe(false);
    expect(isKnownAvatar(`char:${CHARACTER_AVATARS[0].id}|hacked|none`)).toBe(false);
    expect(isKnownAvatar('<img src=x onerror=alert(1)>')).toBe(false);
    expect(isKnownAvatar('A very long nickname pretending to be an avatar')).toBe(false);
    expect(isKnownAvatar(undefined)).toBe(false);
    expect(isKnownAvatar(`emoji:${AVATARS[0]}|gold|none|extra`)).toBe(false);
  });
});

describe('F4 fix 8: the reveal never hangs', () => {
  it('clears the busy state when grading throws, and reports the error', async () => {
    const clear = vi.fn();
    const failure = await runAlwaysClearing(async () => {
      throw new Error('AI judge down');
    }, clear);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(failure).toBeInstanceOf(Error);
  });

  it('clears the busy state on success and reports nothing', async () => {
    const clear = vi.fn();
    const failure = await runAlwaysClearing(async () => {}, clear);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(failure).toBeNull();
  });
});

describe('F4 fix 9: a double click cannot deal two hands', () => {
  it('lets only the first call through until released', () => {
    const guard = createReentryGuard();
    expect(guard.tryEnter()).toBe(true);
    expect(guard.tryEnter()).toBe(false);
    guard.release();
    expect(guard.tryEnter()).toBe(true);
  });
});

describe('F4 fix 11: the target dialog always has an exit', () => {
  it('lets ordinary targeted power-ups be cancelled', () => {
    expect(canCancelPowerUpTarget('PICKPOCKET', true)).toBe(true);
  });

  it('keeps Swap non-refundable while a target is available', () => {
    expect(canCancelPowerUpTarget('SWAP', true)).toBe(false);
  });

  it('lets Swap be cancelled when nobody can be targeted', () => {
    expect(canCancelPowerUpTarget('SWAP', false)).toBe(true);
  });
});

describe('F4 fix 5: sentences are split into safe segments', () => {
  it('keeps markup in the sentence as plain text', () => {
    const segs = buildSentenceSegments('Hi <img src=x onerror=alert(1)> there', {});
    expect(segs).toEqual([{ kind: 'text', text: 'Hi <img src=x onerror=alert(1)> there' }]);
  });

  it('highlights the phrase case-insensitively', () => {
    const segs = buildSentenceSegments('She has been working. HAS BEEN again.', { highlight: 'has been' });
    expect(segs.filter(s => s.kind === 'highlight').map(s => (s as any).text)).toEqual(['has been', 'HAS BEEN']);
  });

  it('turns gaps into gap segments with trailing punctuation', () => {
    const segs = buildSentenceSegments('I ____ here, and you ___.', { showGaps: true });
    expect(segs).toEqual([
      { kind: 'text', text: 'I ' },
      { kind: 'gap', trailing: '' },
      { kind: 'text', text: ' here, and you ' },
      { kind: 'gap', trailing: '.' },
    ]);
  });

  it('leaves underscores alone when gaps are off', () => {
    expect(buildSentenceSegments('a ___ b', {})).toEqual([{ kind: 'text', text: 'a ___ b' }]);
  });
});
