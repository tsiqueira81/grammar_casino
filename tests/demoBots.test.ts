import { afterEach, describe, expect, it, vi } from 'vitest';
import { botStake, demoBotSeats, randomBotBet, shouldBotBet, DEMO_BOT_COUNT } from '../game/demoBots';
import { DemoRoomController, DEMO_JOIN_GAP_MS } from '../services/demoRoom';
import { COACH_STEPS, shouldShowCoach } from '../game/coach';
import type { HostEventPayload } from '../services/multiplayerService';
import type { PlayerViewPayload } from '../utils/multiplayerProtocol';

const hand = (over: Partial<PlayerViewPayload> = {}) =>
  ({
    step: 'IN_GAME',
    round: 1,
    lockedIn: false,
    isFrozen: false,
    isLoadingSentence: false,
    me: { money: 1000 },
    minBetAmount: 10,
    isBetCapped: false,
    betCapAmount: 0,
    sentence: { text: 'If I _____ more time, I would learn Japanese.', questionType: 'multipleChoice', options: ['had', 'have'] },
    ...over,
  }) as unknown as PlayerViewPayload;

describe('demo bots (package T7)', () => {
  it('seats twelve bots with their own names and ids', () => {
    const seats = demoBotSeats();
    expect(seats).toHaveLength(DEMO_BOT_COUNT);
    expect(new Set(seats.map(s => s.name)).size).toBe(DEMO_BOT_COUNT);
    expect(seats[0].playerId).toBe(101);
  });

  it('bets only on an open hand it has not locked in, with money left', () => {
    expect(shouldBotBet(hand())).toBe(true);
    expect(shouldBotBet(hand({ lockedIn: true }))).toBe(false);
    expect(shouldBotBet(hand({ step: 'RESULTS' }))).toBe(false);
    expect(shouldBotBet(hand({ me: { money: 0 } as any }))).toBe(false);
    expect(shouldBotBet(hand({ isFrozen: true }))).toBe(false);
  });

  it('keeps the stake inside the minimum, the cap and the balance', () => {
    expect(botStake(hand(), () => 0.99)).toBe(200);
    expect(botStake(hand({ isBetCapped: true, betCapAmount: 50 }), () => 0.99)).toBe(50);
    expect(botStake(hand({ minBetAmount: 100 }), () => 0)).toBe(100);
    expect(botStake(hand({ me: { money: 30 } as any }), () => 0.99)).toBe(30);
  });

  it('answers in the shape of the question', () => {
    expect(randomBotBet(hand(), () => 0).selectedOption).toBe('had');
    const binary = randomBotBet(hand({ sentence: { text: 'x' } as any }), () => 0.9);
    expect(binary.opinion).toBe('incorrect');
  });
});

describe('demo room (package T7)', () => {
  afterEach(() => vi.useRealTimers());

  it('joins the bots one by one, then each bets and locks in once a hand', () => {
    vi.useFakeTimers();
    const events: HostEventPayload[] = [];
    const room = new DemoRoomController(e => events.push(e), 3, () => 0);
    vi.advanceTimersByTime(200 + 3 * DEMO_JOIN_GAP_MS);
    expect(events.filter(e => e.type === 'STUDENT_JOINED').map(e => e.playerId)).toEqual([101, 102, 103]);

    const views = { 101: hand(), 102: hand(), 103: hand({ lockedIn: true }) };
    room.pushViews(views);
    room.pushViews(views);
    vi.advanceTimersByTime(10_000);
    const locks = events.filter(e => e.type === 'STUDENT_INTENT' && e.intent?.type === 'LOCK_IN');
    expect(locks.map(e => e.playerId)).toEqual([101, 102]);
    room.destroy();
  });

  it('answers "Got it" or "Still confused" after a reveal, and goes quiet when ended', () => {
    vi.useFakeTimers();
    const events: HostEventPayload[] = [];
    const room = new DemoRoomController(e => events.push(e), 1, () => 0.1);
    vi.advanceTimersByTime(1000);
    room.pushViews({ 101: hand({ step: 'RESULTS' }) });
    vi.advanceTimersByTime(10_000);
    expect(events.some(e => e.intent?.type === 'FEEDBACK_REACTION')).toBe(true);
    room.destroy();
    const count = events.length;
    room.pushViews({ 101: hand({ round: 2 }) });
    vi.advanceTimersByTime(60_000);
    expect(events.length).toBe(count);
  });
});

describe('first-run coach (package T7)', () => {
  it('has four steps', () => expect(COACH_STEPS).toHaveLength(4));
  it('opens once, on the lobby, never on phones or in tests unless asked', () => {
    const base = { seen: null, step: 'PLAYER_SETUP', studentPhone: false, testMode: false, forced: false };
    expect(shouldShowCoach(base)).toBe(true);
    expect(shouldShowCoach({ ...base, seen: 'seen' })).toBe(false);
    expect(shouldShowCoach({ ...base, step: 'IN_GAME' })).toBe(false);
    expect(shouldShowCoach({ ...base, studentPhone: true })).toBe(false);
    expect(shouldShowCoach({ ...base, testMode: true })).toBe(false);
    expect(shouldShowCoach({ ...base, testMode: true, forced: true })).toBe(true);
  });
});
