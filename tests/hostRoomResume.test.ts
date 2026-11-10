import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The room controller talks to Firestore and the teacher PIN helpers; replace both with fakes
// so the test can feed it intent documents directly.
const firestore = vi.hoisted(() => ({
  intentHandler: null as null | ((clientId: string, msg: any, uid: string | null) => void),
  roomWrites: [] as any[],
  deletedRooms: [] as string[],
}));

vi.mock('../services/firebaseService', () => ({
  writeFirestoreRoom: vi.fn(async (params: any) => {
    firestore.roomWrites.push(params);
    return true;
  }),
  deleteFirestoreRoom: vi.fn(async (code: string) => {
    firestore.deletedRooms.push(code);
  }),
  isFirestoreRoomCodeFree: vi.fn(async () => true),
  listenToFirestoreRoomIntents: vi.fn((_code: string, onIntent: any) => {
    firestore.intentHandler = onIntent;
    return () => {
      firestore.intentHandler = null;
    };
  }),
  sendFirestoreStudentIntent: vi.fn(),
  listenToFirestoreSeat: vi.fn(),
  ensureFirebaseUser: vi.fn(async () => ({ uid: 'host-uid' })),
  subscribeToAuthChanges: vi.fn(() => () => {}),
}));

vi.mock('../services/geminiService', () => ({
  getSavedTeacherPin: () => '',
  isDesktopApp: () => true,
  isTeacherPinUnlocked: () => true,
}));

import {
  HOST_ROOM_RESUME_MAX_AGE_MS,
  HOST_ROOM_STORAGE_KEY,
  HostEventPayload,
  HostRoomController,
  SavedHostRoom,
  loadSavedHostRoom,
} from '../services/multiplayerService';

class MemoryStorage {
  private items = new Map<string, string>();
  getItem(key: string) {
    return this.items.has(key) ? this.items.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, String(value));
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
  clear() {
    this.items.clear();
  }
}

const flushTimers = async () => {
  await vi.advanceTimersByTimeAsync(500);
};

function savedRoom(overrides: Partial<SavedHostRoom> = {}): SavedHostRoom {
  return {
    version: 1,
    code: 'ABCD',
    hostToken: 'host_token',
    localServerAvailable: false,
    locked: false,
    nextPlayerId: 103,
    rev: 7,
    seats: [
      { seatId: 'seat_101', playerId: 101, name: 'Ana', avatar: '🦊', reconnectToken: 'phone-ana', connected: true, lockedIn: false, lastSeen: 1 },
      { seatId: 'seat_102', playerId: 102, name: 'Bruno', avatar: '🐼', reconnectToken: 'phone-bruno', connected: true, lockedIn: true, lastSeen: 1 },
    ],
    clientUids: [
      ['phone-ana', 'uid-ana'],
      ['phone-bruno', 'uid-bruno'],
    ],
    lastIntentSeq: [
      ['phone-ana', 3],
      ['phone-bruno', 5],
    ],
    joinResponses: {},
    kickedPlayerIds: [],
    kickedClientIds: [],
    intentClientIds: ['phone-ana', 'phone-bruno'],
    writtenSeatIds: ['phone-ana', 'phone-bruno'],
    savedAt: Date.now(),
    ...overrides,
  };
}

function intentDoc(seqs: number[], playerId: number) {
  return {
    type: 'CLOUD_STUDENT_INTENTS',
    intents: seqs.map((seq) => ({
      seq,
      intentId: `intent_${playerId}_${seq}`,
      playerId,
      intent: { type: 'SET_BET', field: 'amount', value: seq * 10 },
    })),
  };
}

describe('the live room survives a teacher reload (R1)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', new MemoryStorage());
    firestore.intentHandler = null;
    firestore.roomWrites = [];
    firestore.deletedRooms = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('saves the open room as soon as it is created', async () => {
    const host = await HostRoomController.createRoom(() => {});
    const saved = loadSavedHostRoom();
    expect(saved?.code).toBe(host.code);
    expect(saved?.hostToken).toBe(host.hostToken);
    host.detach();
  });

  it('keeps the same code and seats after a reload', async () => {
    const host = HostRoomController.resumeRoom(savedRoom(), () => {});
    expect(host.code).toBe('ABCD');
    expect(host.getSeats().map((s) => s.name)).toEqual(['Ana', 'Bruno']);
    expect(host.getSeats().find((s) => s.playerId === 102)?.lockedIn).toBe(true);

    await flushTimers();
    // Every seat record is rewritten to the phone that owns it, with a revision past the saved one.
    const write = firestore.roomWrites.at(-1);
    expect(write.code).toBe('ABCD');
    expect(write.rev).toBeGreaterThan(7);
    expect(write.seats.map((s: any) => s.uid).sort()).toEqual(['uid-ana', 'uid-bruno']);
    host.detach();
  });

  it('never applies an intent twice when Firestore re-reads it after the reload', async () => {
    const events: HostEventPayload[] = [];
    const host = HostRoomController.resumeRoom(savedRoom(), (ev) => events.push(ev));
    await flushTimers();
    expect(firestore.intentHandler).toBeTypeOf('function');

    // The listener starts by reading every phone's latest intents again.
    firestore.intentHandler!('phone-ana', intentDoc([1, 2, 3, 4], 101), 'uid-ana');
    firestore.intentHandler!('phone-bruno', intentDoc([4, 5], 102), 'uid-bruno');

    const applied = events.filter((ev) => ev.type === 'STUDENT_INTENT').map((ev) => ev.id);
    expect(applied).toEqual(['intent_101_4']);

    // The newest handled intent is saved before it is applied.
    expect(new Map(loadSavedHostRoom()!.lastIntentSeq).get('phone-ana')).toBe(4);
    host.detach();
  });

  it('gives a new phone a player id after the saved ones', async () => {
    const events: HostEventPayload[] = [];
    const host = HostRoomController.resumeRoom(savedRoom({ nextPlayerId: 101 }), (ev) => events.push(ev));
    await flushTimers();
    firestore.intentHandler!('phone-caio', { type: 'CLOUD_JOIN_REQUEST', name: 'Caio', avatar: '🐯', requestId: 'r1' }, 'uid-caio');
    const joined = events.find((ev) => ev.type === 'STUDENT_JOINED');
    expect(joined?.seat?.playerId).toBe(103);
    host.detach();
  });

  it('keeps the room saved when the screen only detaches, and forgets it when the room is closed', async () => {
    const host = HostRoomController.resumeRoom(savedRoom(), () => {});
    host.detach();
    expect(loadSavedHostRoom()?.code).toBe('ABCD');
    expect(firestore.deletedRooms).toEqual([]);

    const again = HostRoomController.resumeRoom(loadSavedHostRoom()!, () => {});
    again.destroy();
    expect(loadSavedHostRoom()).toBeNull();
    expect(firestore.deletedRooms).toEqual(['ABCD']);
  });

  it('does not reopen a room saved more than six hours ago, or a damaged save', () => {
    localStorage.setItem(
      HOST_ROOM_STORAGE_KEY,
      JSON.stringify(savedRoom({ savedAt: Date.now() - HOST_ROOM_RESUME_MAX_AGE_MS - 1 }))
    );
    expect(loadSavedHostRoom()).toBeNull();
    expect(localStorage.getItem(HOST_ROOM_STORAGE_KEY)).toBeNull();

    localStorage.setItem(HOST_ROOM_STORAGE_KEY, '{not json');
    expect(loadSavedHostRoom()).toBeNull();

    localStorage.setItem(HOST_ROOM_STORAGE_KEY, JSON.stringify(savedRoom({ code: '<b>' })));
    expect(loadSavedHostRoom()).toBeNull();
  });
});
