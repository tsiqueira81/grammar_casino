import { describe, expect, it } from 'vitest';
import { getRevealGate, isEveryRoomPlayerReady, type RevealGateInput } from '../game/revealGate';
import type { Bet } from '../types';

const ready = { bet: 100, opinion: 'correct' } as Bet;
const zeroStake = { bet: 0, opinion: 'correct' } as Bet;
const noAnswer = { bet: 100 } as Bet;

const gate = (extra: Partial<RevealGateInput>) =>
  getRevealGate({
    playerIds: [1, 2],
    bets: {},
    activePowerUps: {},
    questionType: 'binary',
    mode: 'free',
    teacherOverride: false,
    ...extra,
  });

describe('free play (one screen, no timers)', () => {
  it('reveals once every bet is complete; a $0 stake is complete but not "placed"', () => {
    const g = gate({ bets: { 1: ready, 2: zeroStake } });
    expect(g.canReveal).toBe(true);
    expect(g.readyCount).toBe(1);
    expect(g.waitingOn).toEqual([2]);
    expect(g.everyoneIn).toBe(false);
  });

  it('waits for a missing answer, unless the teacher overrides', () => {
    expect(gate({ bets: { 1: ready, 2: noAnswer } }).canReveal).toBe(false);
    expect(gate({ bets: { 1: ready, 2: noAnswer }, teacherOverride: true }).canReveal).toBe(true);
  });
});

describe('turn timers', () => {
  it('reveals when every timer is locked, whatever the bets', () => {
    const turnTimers = { 1: { status: 'locked' }, 2: { status: 'running' } };
    expect(gate({ mode: 'turnTimer', turnTimers }).canReveal).toBe(false);
    expect(gate({ mode: 'turnTimer', turnTimers }).timerLockedCount).toBe(1);
    expect(gate({ mode: 'turnTimer', turnTimers: { 1: { status: 'locked' }, 2: { status: 'locked' } } }).canReveal).toBe(true);
  });
});

describe('live room', () => {
  it('counts seated phones only when locked in, and unseated players by their bet', () => {
    const g = gate({
      mode: 'room',
      bets: { 1: ready, 2: ready, 3: noAnswer },
      playerIds: [1, 2, 3],
      seats: { 1: { lockedIn: false }, 2: { lockedIn: true } },
    });
    expect(g.roomLockedCount).toBe(1);
    expect(g.waitingOn).toEqual([1, 3]);
    expect(g.allRoomLocked).toBe(false);
    expect(g.canReveal).toBe(false);
  });

  it('also reveals when every bet is complete, even if a phone has not pressed lock in', () => {
    const g = gate({ mode: 'room', bets: { 1: ready, 2: ready }, seats: { 1: { lockedIn: false }, 2: { lockedIn: true } } });
    expect(g.allRoomLocked).toBe(false);
    expect(g.canReveal).toBe(true);
  });

  it('an empty table is never "all locked in"', () => {
    expect(gate({ mode: 'room', playerIds: [] }).allRoomLocked).toBe(false);
  });

  it('the Reveal press accepts a locked seat or a complete bet', () => {
    const base = { bets: { 1: noAnswer, 2: ready }, activePowerUps: {}, questionType: 'binary' as const };
    expect(isEveryRoomPlayerReady({ ...base, playerIds: [1, 2], seats: { 1: { lockedIn: true } } })).toBe(true);
    expect(isEveryRoomPlayerReady({ ...base, playerIds: [1, 2], seats: {} })).toBe(false);
  });
});
