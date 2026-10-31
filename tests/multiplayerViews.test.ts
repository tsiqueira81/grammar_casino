// The Firestore room document is readable by anyone with the room code, so only data every
// student already sees may go there. These tests pin down that bets, hints and other private
// fields always stay in each student's own seat record.
import { describe, it, expect } from 'vitest';
import {
  PlayerViewPayload,
  SHARED_VIEW_KEYS,
  splitPlayerViews,
  mergePlayerView,
} from '../utils/multiplayerProtocol';

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
