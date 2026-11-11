import { describe, expect, it } from 'vitest';
import { hasPlainShield, hasShieldProtection, isFrozenBySubZero, isSilencedThisHand } from '../game/status';
import type { ActivePowerUp, Player } from '../types';

const pu = (type: string, target?: number) => ({ type, target }) as ActivePowerUp;
const effect = (type: string) => ({ type, roundsLeft: 1 }) as Player['effects'][number];

describe('shield checks', () => {
  it('counts Shield and Guardian Angel as protection against attacks', () => {
    expect(hasShieldProtection([pu('SHIELD')])).toBe(true);
    expect(hasShieldProtection([pu('GUARDIAN_ANGEL')])).toBe(true);
    expect(hasShieldProtection([pu('SPLIT_BET')])).toBe(false);
    expect(hasShieldProtection(undefined)).toBe(false);
  });

  it('keeps the plain Shield check separate (the wheel Bounty ignores Guardian Angel)', () => {
    expect(hasPlainShield([pu('SHIELD')])).toBe(true);
    expect(hasPlainShield([pu('GUARDIAN_ANGEL')])).toBe(false);
    expect(hasPlainShield(undefined)).toBe(false);
  });
});

describe('isFrozenBySubZero', () => {
  it('is true for a Sub-Zero aimed at the player, from anyone', () => {
    expect(isFrozenBySubZero({ id: 1, effects: [] }, [pu('SUB_ZERO', 1)])).toBe(true);
    expect(isFrozenBySubZero({ id: 2, effects: [] }, [pu('SUB_ZERO', 1)])).toBe(false);
  });

  it('is true for the Sub-Zero effect alone', () => {
    expect(isFrozenBySubZero({ id: 1, effects: [effect('SUB_ZERO')] }, [])).toBe(true);
    expect(isFrozenBySubZero({ id: 1, effects: [effect('SILENCED')] }, [])).toBe(false);
  });
});

describe('isSilencedThisHand', () => {
  it('follows the Silenced effect', () => {
    expect(isSilencedThisHand({ effects: [effect('SILENCED')] })).toBe(true);
    expect(isSilencedThisHand({ effects: [] })).toBe(false);
  });
});
