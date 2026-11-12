// The Firestore room document is readable by anyone with the room code, so only data every
// student already sees may go there. These tests pin down that bets, hints and other private
// fields always stay in each student's own seat record.
import { describe, it, expect } from 'vitest';
import {
  PlayerViewPayload,
  SHARED_VIEW_KEYS,
  splitPlayerViews,
  mergePlayerView,
  isPlayerUnderdog,
  buildAllPlayerViews,
} from '../utils/multiplayerProtocol';
import { Player } from '../types';

const peers = [
  { id: 101, name: 'Ana', avatar: '🦊', money: 500, lockedIn: true, hasDraftBet: true },
  { id: 102, name: 'Bo', avatar: '🐼', money: 450, lockedIn: false, hasDraftBet: false },
];

function view(playerId: number, overrides: Partial<PlayerViewPayload> = {}): PlayerViewPayload {
  return {
    roomCode: 'ABCD',
    roomLocked: false,
    step: 'IN_GAME',
    round: 3,
    gameMode: 'classic',
    totalRounds: 10,
    targetAmount: 2000,
    settings: { topic: 'Travel', level: 'C1', theme: 'Classic' },
    isLoadingSentence: false,
    isProcessingResults: false,
    me: { id: playerId, name: playerId === 101 ? 'Ana' : 'Bo', money: 500, history: [], avatar: '🦊', winStreak: 0, effects: [] },
    myBet: playerId === 101 ? { bet: 120, opinion: 'incorrect' } : {},
    myHint: playerId === 101 ? ({ text: 'Look at the verb tense.' } as any) : undefined,
    myActivePowerUps: [],
    myUsedPowerUps: [],
    canBuyPowerUp: true,
    availablePowerUpsCount: 3,
    isBetCapped: false,
    betCapAmount: 100,
    isHighRoller: false,
    minBetAmount: 0,
    scalpelHint: null,
    isFrozen: false,
    lockedIn: playerId === 101,
    lastNotification: null,
    sentence: { text: 'She have lived here since 2010.', questionType: 'binary' } as any,
    peers: peers as any,
    myRoundResult: null,
    allRoundResults: [],
    winner: null,
    roundTimer: { status: 'running', endsAt: 1_700_000_000_000 },
    turnDurationMs: 60_000,
    ...overrides,
  } as PlayerViewPayload;
}

const PRIVATE_KEYS = ['me', 'myBet', 'myHint', 'myActivePowerUps', 'myUsedPowerUps', 'lockedIn', 'scalpelHint', 'lastNotification', 'myRoundResult'];

describe('splitPlayerViews', () => {
  it('never puts bets, hints or other private fields in the shared table', () => {
    const { table } = splitPlayerViews({ 101: view(101), 102: view(102) });
    for (const key of PRIVATE_KEYS) expect(table).not.toHaveProperty(key);
    expect(JSON.stringify(table)).not.toContain('Look at the verb tense');
  });

  it('keeps private fields private even when only one student is in the room', () => {
    const { table, privateByPlayer } = splitPlayerViews({ 101: view(101) });
    for (const key of PRIVATE_KEYS) expect(table).not.toHaveProperty(key);
    expect(privateByPlayer[101].myBet).toEqual({ bet: 120, opinion: 'incorrect' });
    for (const key of Object.keys(table)) expect(SHARED_VIEW_KEYS).toContain(key);
  });

  it('shares the table everyone sees: round, sentence, names and money', () => {
    const { table, privateByPlayer } = splitPlayerViews({ 101: view(101), 102: view(102) });
    expect(table.round).toBe(3);
    expect(table.sentence?.text).toBe('She have lived here since 2010.');
    expect(table.peers).toEqual(peers);
    expect(privateByPlayer[102]).not.toHaveProperty('peers');
  });

  it('keeps a shared field private for everyone when one student sees something extra', () => {
    const goggles = view(101, {
      sentence: { text: 'She have lived here since 2010.', questionType: 'binary', grammarPhrase: 'have lived' } as any,
    });
    const { table, privateByPlayer } = splitPlayerViews({ 101: goggles, 102: view(102) });
    expect(table).not.toHaveProperty('sentence');
    expect((privateByPlayer[101].sentence as any).grammarPhrase).toBe('have lived');
    expect(privateByPlayer[102].sentence).not.toHaveProperty('grammarPhrase');
  });

  it('rebuilds each student view exactly from the table and their own record', () => {
    const views = {
      101: view(101),
      102: view(102, { sentence: { text: 'Other text', questionType: 'binary' } as any }),
    };
    const { table, privateByPlayer } = splitPlayerViews(views);
    for (const id of [101, 102]) {
      const merged = mergePlayerView(table, privateByPlayer[id]);
      expect(JSON.parse(JSON.stringify(merged))).toEqual(JSON.parse(JSON.stringify(views[id as 101 | 102])));
    }
  });

  it('handles a room with no players yet', () => {
    expect(splitPlayerViews({})).toEqual({ table: {}, privateByPlayer: {} });
  });
});

describe('isPlayerUnderdog (bottom-half qualification)', () => {
  const mkPlayer = (id: number, money: number): Player => ({
    id,
    name: `P${id}`,
    money,
    history: [],
    avatar: '🦊',
    winStreak: 0,
    effects: [],
  });

  it('returns false for everyone when all active players are tied at the top (e.g. Round 1)', () => {
    const tied = [mkPlayer(1, 1000), mkPlayer(2, 1000), mkPlayer(3, 1000), mkPlayer(4, 1000)];
    for (const p of tied) {
      expect(isPlayerUnderdog(p.id, tied)).toBe(false);
    }
  });

  it('in a 2-player game, only the trailing player qualifies', () => {
    const two = [mkPlayer(1, 1200), mkPlayer(2, 800)];
    expect(isPlayerUnderdog(1, two)).toBe(false);
    expect(isPlayerUnderdog(2, two)).toBe(true);
  });

  it('in a 5-player game [200, 400, 900, 1200, 1500], only the bottom 2 players qualify', () => {
    const five = [
      mkPlayer(1, 200),
      mkPlayer(2, 400),
      mkPlayer(3, 900),
      mkPlayer(4, 1200),
      mkPlayer(5, 1500),
    ];
    expect(isPlayerUnderdog(1, five)).toBe(true);
    expect(isPlayerUnderdog(2, five)).toBe(true);
    expect(isPlayerUnderdog(3, five)).toBe(false);
    expect(isPlayerUnderdog(4, five)).toBe(false);
    expect(isPlayerUnderdog(5, five)).toBe(false);
  });

  it('excludes GENEROUS when player cannot afford gifts and UNDERDOG when in top half', () => {
    const players = [mkPlayer(1, 80), mkPlayer(2, 1200), mkPlayer(3, 1500)];
    const built = buildAllPlayerViews({
      roomCode: 'TEST',
      roomLocked: false,
      step: 'IN_GAME',
      currentRound: 2,
      gameMode: 'rounds',
      totalRounds: 10,
      targetAmount: 2000,
      settings: { topic: 'Tenses', level: 'B2', theme: 'General', challengeFormat: 'binary' },
      customTopic: '',
      customTheme: '',
      isLoading: false,
      isProcessing: false,
      players,
      seats: {},
      bets: {},
      hints: {},
      activePowerUps: {},
      powerUpsUsedThisRound: {},
      availablePowerUps: ['GENEROUS', 'UNDERDOG'],
      currentSentence: {
        text: 'She has lived here for ten years.',
        isCorrect: true,
        correction: 'She has lived here for ten years.',
        explanation: 'Correct.',
        grammarPhrase: 'has lived',
        questionType: 'binary',
      },
      roundResults: [],
      winner: null,
      studentPendingTarget: {},
      studentPendingWheel: {},
      studentNotifications: {},
    });

    // Player 1 ($80) is in bottom half (so UNDERDOG is eligible), but cannot afford GENEROUS ($50 + 2*$50 = $150) -> 1 card eligible
    expect(built[1].availablePowerUpsCount).toBe(1);
    expect(built[1].canBuyPowerUp).toBe(true);

    // Player 2 ($1200) is NOT in bottom half (so UNDERDOG is excluded), but CAN afford GENEROUS ($150) -> 1 card eligible
    expect(built[2].availablePowerUpsCount).toBe(1);
    expect(built[2].canBuyPowerUp).toBe(true);
  });
});

describe('pause (package R8)', () => {
  const params = (step: 'IN_GAME' | 'RESULTS', paused: boolean) => ({
    roomCode: 'TEST', roomLocked: false, step, currentRound: 1, gameMode: 'rounds' as const, totalRounds: 10,
    targetAmount: 2000, settings: { topic: 'Tenses', level: 'B2', theme: 'General', challengeFormat: 'binary' } as any,
    customTopic: '', customTheme: '', isLoading: false, isProcessing: false, players: [{ id: 1, name: 'Ana', money: 500, history: [], avatar: '🦊', winStreak: 0, effects: [] } as Player], seats: {},
    bets: {}, hints: {}, activePowerUps: {}, powerUpsUsedThisRound: {}, availablePowerUps: [], currentSentence: null,
    roundResults: [], winner: null, studentPendingTarget: {}, studentPendingWheel: {}, studentNotifications: {}, paused,
  });

  it('tells every phone the hand is paused, on the shared table', () => {
    const views = buildAllPlayerViews(params('IN_GAME', true));
    expect(views[1].paused).toBe(true);
    expect(splitPlayerViews(views).table.paused).toBe(true);
    expect(buildAllPlayerViews(params('IN_GAME', false))[1].paused).toBe(false);
  });

  it('only pauses a hand in play', () => {
    expect(buildAllPlayerViews(params('RESULTS', true))[1].paused).toBe(false);
  });
});

describe('special hands on phones (package G6)', () => {
  const banner = { title: 'Final Table', rule: 'Last hand. Every win pays double.', icon: '🏆' };
  const params = (step: 'IN_GAME' | 'GAME_OVER') => ({
    roomCode: 'TEST', roomLocked: false, step, currentRound: 10, gameMode: 'rounds' as const, totalRounds: 10,
    targetAmount: 2000, settings: { topic: 'Tenses', level: 'B2', theme: 'General', challengeFormat: 'binary' } as any,
    customTopic: '', customTheme: '', isLoading: false, isProcessing: false, players: [{ id: 1, name: 'Ana', money: 500, history: [], avatar: '🦊', winStreak: 0, effects: [] } as Player], seats: {},
    bets: {}, hints: {}, activePowerUps: {}, powerUpsUsedThisRound: {}, availablePowerUps: [], currentSentence: null,
    roundResults: [], winner: null, studentPendingTarget: {}, studentPendingWheel: {}, studentNotifications: {}, specialHand: banner,
  });

  it('puts the special hand on the shared table while the hand is played', () => {
    const views = buildAllPlayerViews(params('IN_GAME'));
    expect(views[1].specialHand).toEqual(banner);
    expect(splitPlayerViews(views).table.specialHand).toEqual(banner);
  });

  it('drops it once the game is over', () => {
    expect(buildAllPlayerViews(params('GAME_OVER'))[1].specialHand).toBeNull();
  });
});
