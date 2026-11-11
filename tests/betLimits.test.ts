import { describe, expect, it } from 'vitest';
import {
  clampBetInput,
  getBetCap,
  getBetLimits,
  getDisplayedMinBet,
  getHighRoller,
} from '../game/betLimits';
import { BET_CAP_AMOUNT } from '../constants';
import type { ActivePowerUp, Player } from '../types';

const player = (id: number, money: number, effects: Player['effects'] = []) => ({ id, money, effects });
const pu = (type: string, extra: Partial<ActivePowerUp> = {}) => ({ type, ...extra }) as ActivePowerUp;

describe('getBetCap', () => {
  it('is off with no Bet Cap anywhere', () => {
    expect(getBetCap(player(1, 500), {})).toEqual({ isCapped: false, capAmount: BET_CAP_AMOUNT });
  });

  it('applies a Bet Cap aimed at the player, from anyone\'s list', () => {
    const active = { 2: [pu('BET_CAP', { target: 1, amount: 50 })] };
    expect(getBetCap(player(1, 500), active)).toEqual({ isCapped: true, capAmount: 50 });
    expect(getBetCap(player(2, 500), active).isCapped).toBe(false);
  });

  it('applies an untargeted Bet Cap only from the player\'s own list', () => {
    expect(getBetCap(player(1, 500), { 1: [pu('BET_CAP')] }).isCapped).toBe(true);
    expect(getBetCap(player(1, 500), { 2: [pu('BET_CAP')] }).isCapped).toBe(false);
  });

  it('takes the lowest cap, but never above BET_CAP_AMOUNT', () => {
    const active = { 2: [pu('BET_CAP', { target: 1, amount: 30 })], 3: [pu('BET_CAP', { target: 1, amount: 400 })] };
    expect(getBetCap(player(1, 500), active).capAmount).toBe(30);
    expect(getBetCap(player(1, 500), { 2: [pu('BET_CAP', { target: 1, amount: 400 })] }).capAmount).toBe(BET_CAP_AMOUNT);
  });

  it('caps at 50 when only the Bet Cap effect (the wheel prize) is on the player', () => {
    const p = player(1, 500, [{ type: 'BET_CAP', roundsLeft: 1 } as Player['effects'][number]]);
    expect(getBetCap(p, {})).toEqual({ isCapped: true, capAmount: 50 });
  });
});

describe('getHighRoller', () => {
  it('demands half the bankroll, rounded up, and at least 1', () => {
    const active = { 2: [pu('HIGH_ROLLER', { target: 1 })] };
    expect(getHighRoller(player(1, 301), active)).toEqual({ isHighRoller: true, floor: 151 });
    expect(getHighRoller(player(1, 0), active)).toEqual({ isHighRoller: true, floor: 1 });
  });

  it('uses the cast amount when it is higher than half', () => {
    const active = { 2: [pu('HIGH_ROLLER', { target: 1, amount: 400 })] };
    expect(getHighRoller(player(1, 500), active).floor).toBe(400);
    const lower = { 2: [pu('HIGH_ROLLER', { target: 1, amount: 100 })] };
    expect(getHighRoller(player(1, 500), lower).floor).toBe(250);
  });

  it('only counts High Roller aimed at the player', () => {
    expect(getHighRoller(player(1, 500), { 1: [pu('HIGH_ROLLER')] }).isHighRoller).toBe(false);
  });
});

describe('getBetLimits', () => {
  it('lets a free player bet anything up to their money', () => {
    expect(getBetLimits(player(1, 800), {})).toMatchObject({ min: 0, max: 800, isCapped: false, isHighRoller: false });
  });

  it('never gives a negative maximum', () => {
    expect(getBetLimits(player(1, -20), {}).max).toBe(0);
  });

  it('limits the maximum by the cap or the money, whichever is lower', () => {
    const active = { 2: [pu('BET_CAP', { target: 1, amount: 50 })] };
    expect(getBetLimits(player(1, 800), active).max).toBe(50);
    expect(getBetLimits(player(1, 20), active).max).toBe(20);
  });

  it('keeps the High Roller minimum inside the maximum, and drops it at $0', () => {
    const roller = { 2: [pu('HIGH_ROLLER', { target: 1 })] };
    expect(getBetLimits(player(1, 800), roller)).toMatchObject({ min: 400, max: 800 });
    expect(getBetLimits(player(1, 0), roller).min).toBe(0);
    // Both on one player (the cast rules normally prevent this): the cap wins.
    const both = { 2: [pu('HIGH_ROLLER', { target: 1 }), pu('BET_CAP', { target: 1, amount: 50 })] };
    expect(getBetLimits(player(1, 800), both)).toMatchObject({ min: 50, max: 50 });
  });
});

describe('getDisplayedMinBet', () => {
  it('shows the High Roller minimum limited by money only, as the screens did before F5', () => {
    const roller = { 2: [pu('HIGH_ROLLER', { target: 1 })] };
    expect(getDisplayedMinBet(player(1, 800), roller)).toBe(400);
    expect(getDisplayedMinBet(player(1, 800), {})).toBe(0);
    // Oddity kept on purpose: with a Bet Cap too, the screen shows a minimum above the cap.
    const both = { 2: [pu('HIGH_ROLLER', { target: 1 }), pu('BET_CAP', { target: 1, amount: 50 })] };
    expect(getDisplayedMinBet(player(1, 800), both)).toBe(400);
    // And a player at $0 shows $0, not the floor of 1.
    expect(getDisplayedMinBet(player(1, 0), roller)).toBe(0);
  });
});

describe('clampBetInput', () => {
  it('keeps an empty field empty and turns junk into empty', () => {
    expect(clampBetInput('', 100)).toBe('');
    expect(clampBetInput('abc', 100)).toBe('');
  });

  it('clamps into 0..max and drops decimals', () => {
    expect(clampBetInput('250', 100)).toBe(100);
    expect(clampBetInput(-5, 100)).toBe(0);
    expect(clampBetInput('42.9', 100)).toBe(42);
    expect(clampBetInput('12abc', 100)).toBe(12);
  });
});
