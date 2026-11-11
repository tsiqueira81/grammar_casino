import {
  MultiplayerSeat,
  PlayerViewPayload,
  StudentIntent,
  splitPlayerViews,
} from '../utils/multiplayerProtocol';
import {
  writeFirestoreRoom,
  deleteFirestoreRoom,
  isFirestoreRoomCodeFree,
  listenToFirestoreRoomIntents,
  sendFirestoreStudentIntent,
  listenToFirestoreSeat,
  ensureFirebaseUser,
  subscribeToAuthChanges,
  FirestoreJoinResponseItem,
  FirestoreSeatListener,
  FirestoreSeatUpdate,
  FirestoreSeatWrite,
} from './firebaseService';
import { isE2eMode } from '../utils/e2eContent';
import { cleanName as cleanPlayerName, generateFriendlyName, isBlockedName } from '../utils/nameFilter';

/** Package R6: at most this many seats in one room. */
export const MAX_ROOM_SEATS = 40;

// How phones and the teacher's screen talk:
// - Local server (npm run dev, AI Studio): WebSocket /ws plus HTTP /api/mp/*. The server sends
//   each phone only its own view, after checking the phone's reconnect token.
// - Anywhere else (Netlify): Firestore. The room document holds only the shared table; each
//   phone's own bet, hints and power-ups go to a private seat record only that phone can read
//   (see services/firebaseService.ts and firestore.rules).
// Earlier versions also relayed rooms over free public MQTT brokers. Anyone who knew the room
// code could listen in there and see every bet, so that relay has been removed.

/** A phone asked to play as a name that is already seated, from a different device. */
export interface SeatTakeoverRequest {
  clientId: string;
  playerId: number;
  name: string;
  avatar: string;
}

export interface HostEventPayload {
  id: string;
  type:
    | 'STUDENT_JOINED'
    | 'STUDENT_RECONNECTED'
    | 'STUDENT_DISCONNECTED'
    | 'STUDENT_INTENT'
    | 'SEAT_TAKEOVER_REQUEST'
    | 'SEAT_TAKEOVER_CLOSED';
  seat?: MultiplayerSeat;
  playerId?: number;
  intent?: StudentIntent;
  takeover?: SeatTakeoverRequest;
  timestamp: number;
}

/** How many of a phone's latest intents ride along in its intent document. */
const MAX_RECENT_INTENTS = 20;

/** How long the teacher has to answer "Let this phone take Ana's seat?" before it is refused. */
export const SEAT_TAKEOVER_TIMEOUT_MS = 2 * 60 * 1000;

const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)];
  }
  return code;
}

// Reconnect tokens double as the phone's private seat id, so make them unguessable.
function generateToken(prefix = 'tok'): string {
  try {
    const bytes = new Uint8Array(12);
    globalThis.crypto.getRandomValues(bytes);
    return `${prefix}_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
  } catch {
    return `${prefix}_${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
  }
}

function getLocalWsUrl(): string | null {
  if (typeof window === 'undefined') return null;
  if (window.location.protocol !== 'http:' && window.location.protocol !== 'https:') return null;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

/**
 * Safely performs a fetch and parses JSON only if the response is actually JSON.
 * Prevents "Unexpected token '<', '<!DOCTYPE '... is not valid JSON" on static hosts like Netlify.
 */
async function safeFetchJson<T = any>(
  url: string,
  options?: RequestInit
): Promise<{ ok: boolean; status: number; data: T | null; isJson: boolean }> {
  try {
    const res = await fetch(url, options);
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      return { ok: false, status: res.status, data: null, isJson: false };
    }
    const data = (await res.json()) as T;
    return { ok: res.ok, status: res.status, data, isJson: true };
  } catch {
    return { ok: false, status: 0, data: null, isJson: false };
  }
}

function publicSeat(seat: MultiplayerSeat): NonNullable<FirestoreJoinResponseItem['seat']> {
  return {
    seatId: seat.seatId,
    playerId: seat.playerId,
    name: seat.name,
    avatar: seat.avatar,
    connected: seat.connected,
    lockedIn: seat.lockedIn,
    lastSeen: seat.lastSeen,
  };
}

/** Where the teacher's tab keeps its open room, so a reload or a crash does not end the lesson. */
export const HOST_ROOM_STORAGE_KEY = 'grammar_casino_host_room_v1';
/** A saved room older than this is not reopened (Firestore lets a new host take it over then). */
export const HOST_ROOM_RESUME_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/** Everything the host needs to carry on the same room after the page reloads. */
export interface SavedHostRoom {
  version: 1;
  code: string;
  hostToken: string;
  localServerAvailable: boolean;
  locked: boolean;
  nextPlayerId: number;
  rev: number;
  seats: MultiplayerSeat[];
  clientUids: [string, string][];
  /** Newest intent handled per phone, so intents re-read after the reload are not applied twice. */
  lastIntentSeq: [string, number][];
  joinResponses: Record<string, FirestoreJoinResponseItem>;
  kickedPlayerIds: number[];
  kickedClientIds: string[];
  /** Phones the teacher removed: they may not join this room again (package R6). */
  bannedClientIds?: string[];
  intentClientIds: string[];
  writtenSeatIds: string[];
  savedAt: number;
}

function getLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** The room this browser was hosting, if it is recent enough to reopen. */
export function loadSavedHostRoom(now = Date.now()): SavedHostRoom | null {
  try {
    const raw = getLocalStorage()?.getItem(HOST_ROOM_STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedHostRoom;
    const valid =
      saved &&
      saved.version === 1 &&
      typeof saved.code === 'string' &&
      /^[A-Z0-9]{3,12}$/.test(saved.code) &&
      typeof saved.hostToken === 'string' &&
      saved.hostToken.length > 0 &&
      typeof saved.savedAt === 'number' &&
      Array.isArray(saved.seats) &&
      Array.isArray(saved.lastIntentSeq);
    if (!valid || now - saved.savedAt > HOST_ROOM_RESUME_MAX_AGE_MS || saved.savedAt > now + 60_000) {
      clearSavedHostRoom();
      return null;
    }
    return saved;
  } catch {
    clearSavedHostRoom();
    return null;
  }
}

export function clearSavedHostRoom() {
  try {
    getLocalStorage()?.removeItem(HOST_ROOM_STORAGE_KEY);
  } catch {}
}

// ============================================================================
// Teacher Host Room Controller (Firestore + Local Server)
// ============================================================================
export class HostRoomController {
  public code: string;
  public hostToken: string;
  private localServerAvailable: boolean;
  private ws: WebSocket | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private firestoreFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private firestoreRetryMs = 0;
  private firestoreUnsubscribe: (() => void) | null = null;
  private authUnsubscribe: (() => void) | null = null;
  private firestoreConnected = false;
  private kickedPlayerIds: number[] = [];
  private destroyed = false;
  private seenEventIds = new Set<string>();
  private latestViews: Record<number, PlayerViewPayload> = {};
  private onEventCallback: (event: HostEventPayload) => void;
  private onConnectionChange?: (connected: boolean) => void;
  private localWsConnected = false;

  // Firestore relay bookkeeping
  /** Each phone's Firebase id, taken from its intent documents (the rules make it trustworthy). */
  private clientUids = new Map<string, string>();
  /** The answer to each phone's latest join request, by client id. */
  private joinResponses: Record<string, FirestoreJoinResponseItem> = {};
  /** Phones that lost their seat (kicked, or the seat moved to another phone). */
  private kickedClientIds = new Set<string>();
  /** Phones the teacher removed; they cannot take a seat in this room again (package R6). */
  private bannedClientIds = new Set<string>();
  private intentClientIds = new Set<string>();
  /** Newest intent sequence number handled per phone, so re-read intents are not applied twice. */
  private lastIntentSeq = new Map<string, number>();
  private writtenSeatJson = new Map<string, string>();
  private writtenSeatIds = new Set<string>();
  private lastRoomJson = '';
  private forceRoomWrite = true;
  private rev = 0;
  private seatRevs: Record<number, number> = {};
  private pendingTakeovers = new Map<
    string,
    { playerId: number; name: string; avatar: string; requestId: string; timer: ReturnType<typeof setTimeout> }
  >();

  // Authoritative Host Seat Registry (Firestore + Local Server)
  private roomLocked = false;
  private nextPlayerId = 101;
  private seatsByPlayerId = new Map<number, MultiplayerSeat>();

  constructor(
    code: string,
    hostToken: string,
    localServerAvailable: boolean,
    onEvent: (event: HostEventPayload) => void,
    onConnectionChange?: (connected: boolean) => void,
    restore?: SavedHostRoom
  ) {
    this.code = code;
    this.hostToken = hostToken;
    this.localServerAvailable = localServerAvailable;
    this.onEventCallback = onEvent;
    this.onConnectionChange = onConnectionChange;
    if (restore) this.restoreFrom(restore);

    // Initialize Firestore room state. Student intents are read once the room doc exists,
    // because the Firestore rules only let the room's recorded host read them.
    this.scheduleFirestoreFlush(0);
    // If the teacher signs in or out of Google mid-class, this device's Firebase id changes:
    // rewrite the room under the new id so the intent listener can start again.
    this.authUnsubscribe = subscribeToAuthChanges(() => {
      this.forceRoomWrite = true;
      this.scheduleFirestoreFlush(200);
    });

    if (this.localServerAvailable) {
      this.connectLocalWs();
      this.startFallbackPolling();
    }
  }

  private scheduleFirestoreFlush(delayMs = 100) {
    if (this.destroyed) return;
    this.saveRoom();
    if (this.firestoreFlushTimer) {
      clearTimeout(this.firestoreFlushTimer);
    }
    this.firestoreFlushTimer = setTimeout(() => {
      this.firestoreFlushTimer = null;
      void this.flushFirestore();
    }, delayMs);
  }

  /**
   * Writes the shared table and every seat record that changed, in one batch.
   * Seat records are addressed to the phone's Firebase id, so a phone we have not heard
   * from over Firestore yet (no id) gets nothing there; the local server still serves it.
   */
  private async flushFirestore() {
    if (this.destroyed) return;
    const { table, privateByPlayer } = splitPlayerViews(this.latestViews);
    const rev = this.rev + 1;
    const seatRevs: Record<number, number> = {};
    const seatWrites: FirestoreSeatWrite[] = [];
    const seatJsonUpdates = new Map<string, string>();
    const handled = new Set<string>();

    const queue = (write: Omit<FirestoreSeatWrite, 'uid'>) => {
      handled.add(write.clientId);
      const uid = this.clientUids.get(write.clientId);
      if (!uid) return;
      const full: FirestoreSeatWrite = { ...write, uid };
      const json = JSON.stringify(full);
      if (this.writtenSeatJson.get(write.clientId) === json) return;
      seatWrites.push(full);
      seatJsonUpdates.set(write.clientId, json);
    };

    for (const seat of this.seatsByPlayerId.values()) {
      const clientId = seat.reconnectToken;
      if (!clientId) continue;
      const before = seatWrites.length;
      queue({
        clientId,
        playerId: seat.playerId,
        view: privateByPlayer[seat.playerId] || null,
        join: this.joinResponses[clientId] || null,
        kicked: false,
      });
      if (seatWrites.length > before) {
        seatRevs[seat.playerId] = rev;
      } else if (this.seatRevs[seat.playerId] !== undefined) {
        seatRevs[seat.playerId] = this.seatRevs[seat.playerId];
      }
    }
    for (const clientId of this.kickedClientIds) {
      if (handled.has(clientId)) continue;
      queue({ clientId, playerId: null, view: null, join: null, kicked: true });
    }
    for (const [clientId, join] of Object.entries(this.joinResponses)) {
      if (handled.has(clientId)) continue;
      queue({ clientId, playerId: null, view: null, join, kicked: false });
    }

    const roomJson = JSON.stringify({
      locked: this.roomLocked,
      table,
      seatRevs,
      kicked: this.kickedPlayerIds,
    });
    if (!this.forceRoomWrite && seatWrites.length === 0 && roomJson === this.lastRoomJson) return;

    // Record what we are about to write before awaiting, so an overlapping flush only sends
    // newer changes. If the write fails, forget it all and rewrite everything on the retry.
    this.rev = rev;
    this.seatRevs = seatRevs;
    this.lastRoomJson = roomJson;
    this.forceRoomWrite = false;
    seatJsonUpdates.forEach((json, clientId) => {
      this.writtenSeatJson.set(clientId, json);
      this.writtenSeatIds.add(clientId);
    });

    const ok = await writeFirestoreRoom({
      code: this.code,
      locked: this.roomLocked,
      rev,
      // The teacher's clock at send time, so phones can match their countdown to it (R3).
      table: { ...table, serverNow: Date.now() },
      seatRevs,
      kickedPlayerIds: this.kickedPlayerIds,
      seats: seatWrites,
    });
    if (this.destroyed) return;

    if (ok) {
      this.firestoreRetryMs = 0;
      this.ensureFirestoreIntentListener();
      if (!this.firestoreConnected) {
        this.firestoreConnected = true;
        this.updateOverallConnectionStatus();
      }
      return;
    }

    this.writtenSeatJson.clear();
    this.lastRoomJson = '';
    this.forceRoomWrite = true;
    if (this.firestoreConnected) {
      this.firestoreConnected = false;
      this.updateOverallConnectionStatus();
    }
    this.firestoreRetryMs = Math.min(60_000, Math.max(5_000, this.firestoreRetryMs * 2));
    this.scheduleFirestoreFlush(this.firestoreRetryMs);
  }

  private ensureFirestoreIntentListener() {
    if (this.destroyed || this.firestoreUnsubscribe) return;
    this.firestoreUnsubscribe = listenToFirestoreRoomIntents(
      this.code,
      (clientId, msg, uid) => this.handleFirestoreIntent(clientId, msg, uid),
      (connected) => {
        this.firestoreConnected = connected;
        if (!connected && this.firestoreUnsubscribe) {
          // The listener stops after an error; the next successful room write attaches a new one.
          this.firestoreUnsubscribe();
          this.firestoreUnsubscribe = null;
        }
        this.updateOverallConnectionStatus();
      }
    );
  }

  private updateOverallConnectionStatus() {
    const isOnline = this.localWsConnected || this.firestoreConnected;
    this.onConnectionChange?.(isOnline);
  }

  public static async createRoom(
    onEvent: (event: HostEventPayload) => void,
    onConnectionChange?: (connected: boolean) => void
  ): Promise<HostRoomController> {
    // Live rooms are open to everyone (decision D3), so no PIN is asked for.
    // Browser tests (?e2e=1 on the dev server) use the local relay; everything else uses Firestore.
    if ((import.meta as any).env.DEV && isE2eMode()) {
      const res = await safeFetchJson<{ code: string; hostToken: string; error?: string }>('/api/mp/room/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });

      if (res.ok && res.isJson && res.data?.code && res.data?.hostToken) {
        return new HostRoomController(
          res.data.code,
          res.data.hostToken,
          true,
          onEvent,
          onConnectionChange
        );
      }
    }

    // Static host (Netlify / Electron / Google-verified without local server) -> generate room code directly
    // A code another teacher is still using would be refused by the Firestore rules, so draw again.
    let generatedCode = generateRoomCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      if (await isFirestoreRoomCodeFree(generatedCode)) break;
      generatedCode = generateRoomCode();
    }
    const generatedToken = generateToken('host');
    return new HostRoomController(
      generatedCode,
      generatedToken,
      false,
      onEvent,
      onConnectionChange
    );
  }

  private handleFirestoreIntent(clientId: string, msg: any, uid: string | null) {
    if (this.destroyed || !clientId || !msg || typeof msg.type !== 'string') return;
    this.intentClientIds.add(clientId);
    if (uid) this.clientUids.set(clientId, uid);

    if (msg.type === 'CLOUD_JOIN_REQUEST') {
      this.handleJoinRequest(clientId, uid, msg);
    } else if (msg.type === 'CLOUD_STUDENT_INTENTS' && Array.isArray(msg.intents)) {
      // Each phone keeps one intent document holding its recent intents, so quick
      // successive writes (opinion, then wager, then lock in) can't swallow each other.
      const lastSeq = this.lastIntentSeq.get(clientId) ?? 0;
      const fresh = msg.intents
        .filter((entry: any) => entry && typeof entry.seq === 'number' && entry.seq > lastSeq)
        .sort((a: any, b: any) => a.seq - b.seq);
      if (fresh.length === 0) return;
      this.lastIntentSeq.set(clientId, fresh[fresh.length - 1].seq);
      // Save before applying, so a reload never applies these intents twice.
      this.saveRoom();
      fresh.forEach((entry: any) => this.applyStudentIntent(clientId, entry));
    } else if (msg.type === 'CLOUD_STUDENT_INTENT') {
      this.applyStudentIntent(clientId, msg);
    }
  }

  private applyStudentIntent(clientId: string, entry: { intentId?: string; playerId?: number; intent?: StudentIntent }) {
    const playerId = Number(entry.playerId);
    const intent = entry.intent;
    if (!playerId || !intent || typeof intent.type !== 'string') return;

    // The intent document's id is the phone's reconnect token, and only that phone can
    // write it, so a phone can only act for the seat it holds.
    const seat = this.seatsByPlayerId.get(playerId);
    if (!seat || seat.reconnectToken !== clientId) return;
    seat.connected = true;
    seat.lastSeen = Date.now();
    if (intent.type === 'LOCK_IN') {
      seat.lockedIn = Boolean(intent.locked);
    }

    this.handleIncomingEvent({
      id: typeof entry.intentId === 'string' && entry.intentId ? entry.intentId : generateToken('ev'),
      type: 'STUDENT_INTENT',
      playerId,
      intent,
      timestamp: Date.now(),
    });
  }

  private handleJoinRequest(clientId: string, uid: string | null, msg: any) {
    const typedName = cleanPlayerName(msg.name);
    const avatar = String(msg.avatar || '🦊');
    const requestId = String(msg.requestId || Date.now());
    if (!typedName) return;
    if (this.bannedClientIds.has(clientId) || (uid && this.bannedClientIds.has(`uid:${uid}`))) {
      this.joinResponses[clientId] = { ok: false, code: this.code, requestId, error: 'The teacher removed you from this room.' };
      this.scheduleFirestoreFlush(30);
      return;
    }
    // A rude name is replaced by a friendly one (package R6); the host makes names unique.
    const cleanName = isBlockedName(typedName)
      ? generateFriendlyName(Array.from(this.seatsByPlayerId.values(), (s) => s.name))
      : typedName;
    // A phone asking to join again is no longer "removed"; its record now carries the answer.
    this.kickedClientIds.delete(clientId);

    // 1. The same phone coming back (its reconnect token is its client id).
    for (const seat of this.seatsByPlayerId.values()) {
      if (seat.reconnectToken === clientId) {
        this.giveSeat(seat, clientId, requestId, avatar, 'reconnect');
        return;
      }
    }

    // 2. The name is already at the table, from another phone or browser.
    const lowerName = cleanName.toLowerCase();
    for (const seat of this.seatsByPlayerId.values()) {
      if (seat.name.toLowerCase() !== lowerName) continue;
      const ownerUid = this.clientUids.get(seat.reconnectToken);
      if (uid && ownerUid && uid === ownerUid) {
        // Same browser (same Firebase id), e.g. the student lost the tab: hand the seat back.
        this.giveSeat(seat, clientId, requestId, avatar, 'move');
      } else {
        // Someone else typing a classmate's name would see and change their bet, so the
        // teacher decides.
        this.requestSeatTakeover(seat, clientId, requestId, cleanName, avatar);
      }
      return;
    }

    if (this.seatsByPlayerId.size >= MAX_ROOM_SEATS) {
      this.joinResponses[clientId] = { ok: false, code: this.code, requestId, error: `This room is full (${MAX_ROOM_SEATS} players).` };
      this.scheduleFirestoreFlush(30);
      return;
    }

    if (this.roomLocked) {
      this.joinResponses[clientId] = {
        ok: false,
        code: this.code,
        requestId,
        error: 'This room is locked by the teacher.',
      };
      this.scheduleFirestoreFlush(30);
      return;
    }

    const playerId = this.nextPlayerId++;
    const newSeat: MultiplayerSeat = {
      seatId: `seat_${playerId}`,
      playerId,
      name: cleanName,
      avatar,
      reconnectToken: clientId,
      connected: true,
      lockedIn: false,
      lastSeen: Date.now(),
    };
    this.seatsByPlayerId.set(playerId, newSeat);
    this.kickedClientIds.delete(clientId);
    this.joinResponses[clientId] = { ok: true, code: this.code, requestId, seat: publicSeat(newSeat) };

    this.handleIncomingEvent({
      id: `cloud_join_${playerId}_${requestId}`,
      type: 'STUDENT_JOINED',
      seat: { ...newSeat },
      playerId,
      timestamp: Date.now(),
    });
    this.scheduleFirestoreFlush(30);
  }

  /** Seat a phone in an existing seat: the same phone reconnecting, or the seat moving to it. */
  private giveSeat(
    seat: MultiplayerSeat,
    clientId: string,
    requestId: string,
    avatar: string,
    mode: 'reconnect' | 'move'
  ) {
    const previousClientId = seat.reconnectToken;
    if (mode === 'move' && previousClientId && previousClientId !== clientId) {
      // The old phone loses the seat and is told so.
      this.kickedClientIds.add(previousClientId);
      delete this.joinResponses[previousClientId];
    }
    seat.reconnectToken = clientId;
    seat.connected = true;
    seat.lastSeen = Date.now();
    if (avatar) seat.avatar = avatar;
    this.kickedClientIds.delete(clientId);
    this.kickedPlayerIds = this.kickedPlayerIds.filter((id) => id !== seat.playerId);
    this.joinResponses[clientId] = { ok: true, code: this.code, requestId, seat: publicSeat(seat) };

    this.handleIncomingEvent({
      id: `cloud_reconn_${seat.playerId}_${clientId}_${requestId}`,
      type: 'STUDENT_RECONNECTED',
      seat: { ...seat },
      playerId: seat.playerId,
      timestamp: Date.now(),
    });
    this.scheduleFirestoreFlush(30);
  }

  private requestSeatTakeover(
    seat: MultiplayerSeat,
    clientId: string,
    requestId: string,
    name: string,
    avatar: string
  ) {
    this.joinResponses[clientId] = { ok: false, pending: true, code: this.code, requestId };
    const existing = this.pendingTakeovers.get(clientId);
    if (existing && existing.playerId === seat.playerId) {
      existing.requestId = requestId;
      this.scheduleFirestoreFlush(30);
      return;
    }
    if (existing) clearTimeout(existing.timer);
    const timer = setTimeout(() => this.answerSeatTakeover(clientId, false, 'timeout'), SEAT_TAKEOVER_TIMEOUT_MS);
    this.pendingTakeovers.set(clientId, { playerId: seat.playerId, name, avatar, requestId, timer });

    this.handleIncomingEvent({
      id: `takeover_${clientId}_${seat.playerId}_${requestId}`,
      type: 'SEAT_TAKEOVER_REQUEST',
      playerId: seat.playerId,
      takeover: { clientId, playerId: seat.playerId, name: seat.name, avatar: seat.avatar },
      timestamp: Date.now(),
    });
    this.scheduleFirestoreFlush(30);
  }

  /** The teacher's answer to "Let this phone take <name>'s seat?". */
  public answerSeatTakeover(clientId: string, allow: boolean, reason: 'teacher' | 'timeout' = 'teacher') {
    const pending = this.pendingTakeovers.get(clientId);
    if (!pending || this.destroyed) return;
    clearTimeout(pending.timer);
    this.pendingTakeovers.delete(clientId);

    this.handleIncomingEvent({
      id: `takeover_closed_${clientId}_${pending.requestId}_${Date.now()}`,
      type: 'SEAT_TAKEOVER_CLOSED',
      playerId: pending.playerId,
      takeover: { clientId, playerId: pending.playerId, name: pending.name, avatar: pending.avatar },
      timestamp: Date.now(),
    });

    const seat = this.seatsByPlayerId.get(pending.playerId);
    if (allow && seat) {
      // Keep the seat's avatar so the class still recognises the player.
      this.giveSeat(seat, clientId, pending.requestId, '', 'move');
      return;
    }
    this.joinResponses[clientId] = {
      ok: false,
      code: this.code,
      requestId: pending.requestId,
      error:
        reason === 'timeout'
          ? "Your teacher didn't answer in time. Try joining again."
          : `${pending.name} is already playing on another phone. Join with your own name.`,
    };
    this.scheduleFirestoreFlush(30);
  }

  private handleIncomingEvent(ev: HostEventPayload) {
    if (!ev || !ev.id || this.seenEventIds.has(ev.id)) return;
    this.seenEventIds.add(ev.id);
    if (this.seenEventIds.size > 1000) {
      const first = this.seenEventIds.values().next().value;
      if (first) this.seenEventIds.delete(first);
    }
    if ((ev.type === 'STUDENT_JOINED' || ev.type === 'STUDENT_RECONNECTED') && ev.seat) {
      this.seatsByPlayerId.set(ev.seat.playerId, { ...ev.seat });
      if (ev.seat.playerId >= this.nextPlayerId) {
        this.nextPlayerId = ev.seat.playerId + 1;
      }
      this.saveRoom();
    }
    this.onEventCallback(ev);
  }

  private connectLocalWs() {
    if (this.destroyed || !this.localServerAvailable) return;
    const wsUrl = getLocalWsUrl();
    if (!wsUrl) return;

    try {
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        if (this.destroyed) {
          ws.close();
          return;
        }
        this.localWsConnected = true;
        this.updateOverallConnectionStatus();
        ws.send(
          JSON.stringify({
            type: 'REGISTER_HOST',
            code: this.code,
            hostToken: this.hostToken,
          })
        );
        if (Object.keys(this.latestViews).length > 0) {
          ws.send(
            JSON.stringify({
              type: 'HOST_PUSH_VIEWS',
              views: this.latestViews,
            })
          );
        }
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'HOST_REGISTERED' && Array.isArray(msg.events)) {
            msg.events.forEach((ev: HostEventPayload) => this.handleIncomingEvent(ev));
          } else if (msg.type === 'HOST_EVENT' && msg.event) {
            this.handleIncomingEvent(msg.event);
          }
        } catch (err) {
          console.error('Host WS message parse error:', err);
        }
      };

      ws.onclose = () => {
        this.localWsConnected = false;
        this.updateOverallConnectionStatus();
        if (!this.destroyed && this.localServerAvailable) {
          this.reconnectTimer = setTimeout(() => this.connectLocalWs(), 2500);
        }
      };

      ws.onerror = () => {
        // Handled by onclose + HTTP/Firestore fallback
      };
    } catch {
      if (!this.destroyed && this.localServerAvailable) {
        this.reconnectTimer = setTimeout(() => this.connectLocalWs(), 3000);
      }
    }
  }

  private startFallbackPolling() {
    this.pollTimer = setInterval(async () => {
      if (this.destroyed || !this.localServerAvailable) return;
      const wsOpen = this.ws && this.ws.readyState === WebSocket.OPEN;
      if (wsOpen) return;
      await this.syncHttp({});
    }, 1500);
  }

  public async pushViews(views: Record<number, PlayerViewPayload>) {
    this.latestViews = views;

    // 1. Coalesce into one Firestore batch: the shared table plus the seat records that changed
    this.scheduleFirestoreFlush(80);

    // 2. Also push to local server if available (it sends each phone only its own view)
    if (!this.localServerAvailable) return;
    const sentAt = Date.now();
    views = Object.fromEntries(Object.entries(views).map(([id, v]) => [id, { ...v, serverNow: sentAt }]));

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(
          JSON.stringify({
            type: 'HOST_PUSH_VIEWS',
            views,
          })
        );
        return;
      } catch {
        // Fall through to HTTP sync
      }
    }
    await this.syncHttp({ views });
  }

  public async setRoomLocked(locked: boolean) {
    this.roomLocked = locked;
    this.scheduleFirestoreFlush(30);
    if (this.localServerAvailable) {
      await this.syncHttp({ locked });
    }
  }

  public async kickPlayer(playerId: number) {
    const seat = this.seatsByPlayerId.get(playerId);
    if (seat?.reconnectToken) {
      this.kickedClientIds.add(seat.reconnectToken);
      this.bannedClientIds.add(seat.reconnectToken);
      // The same browser keeps its Firebase id even after clearing its saved seat.
      const uid = this.clientUids.get(seat.reconnectToken);
      if (uid) this.bannedClientIds.add(`uid:${uid}`);
      delete this.joinResponses[seat.reconnectToken];
    }
    this.seatsByPlayerId.delete(playerId);
    delete this.latestViews[playerId];
    if (!this.kickedPlayerIds.includes(playerId)) {
      this.kickedPlayerIds.push(playerId);
    }
    for (const [clientId, pending] of this.pendingTakeovers) {
      if (pending.playerId === playerId) this.answerSeatTakeover(clientId, false);
    }
    this.scheduleFirestoreFlush(20);
    if (this.localServerAvailable) {
      await this.syncHttp({ kickPlayerId: playerId });
    }
  }

  public async resetAllLocks() {
    for (const seat of this.seatsByPlayerId.values()) {
      seat.lockedIn = false;
    }
    this.scheduleFirestoreFlush(50);
    if (this.localServerAvailable) {
      await this.syncHttp({ resetLocks: true });
    }
  }

  private async syncHttp(payload: {
    locked?: boolean;
    kickPlayerId?: number;
    resetLocks?: boolean;
    views?: Record<number, PlayerViewPayload>;
  }) {
    if (this.destroyed || !this.localServerAvailable) return;
    const res = await safeFetchJson<{ events?: HostEventPayload[] }>(
      `/api/mp/room/${this.code}/host-sync`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostToken: this.hostToken,
          ...payload,
        }),
      }
    );
    if (!res.isJson) {
      this.localServerAvailable = false;
      return;
    }
    if (res.ok && Array.isArray(res.data?.events)) {
      res.data!.events.forEach((ev: HostEventPayload) => this.handleIncomingEvent(ev));
    }
  }

  /** Reopens the room this browser was hosting before the page reloaded. */
  public static resumeRoom(
    saved: SavedHostRoom,
    onEvent: (event: HostEventPayload) => void,
    onConnectionChange?: (connected: boolean) => void
  ): HostRoomController {
    return new HostRoomController(
      saved.code,
      saved.hostToken,
      Boolean(saved.localServerAvailable),
      onEvent,
      onConnectionChange,
      saved
    );
  }

  /** The seats as they were saved, for the host screen to show straight after a reload. */
  public getSeats(): MultiplayerSeat[] {
    return Array.from(this.seatsByPlayerId.values()).map((seat) => ({ ...seat }));
  }

  public isLocked(): boolean {
    return this.roomLocked;
  }

  public exportState(): SavedHostRoom {
    const seats = this.getSeats();
    return {
      version: 1,
      code: this.code,
      hostToken: this.hostToken,
      localServerAvailable: this.localServerAvailable,
      locked: this.roomLocked,
      nextPlayerId: this.nextPlayerId,
      rev: this.rev,
      seats,
      clientUids: Array.from(this.clientUids.entries()),
      lastIntentSeq: Array.from(this.lastIntentSeq.entries()),
      joinResponses: { ...this.joinResponses },
      kickedPlayerIds: [...this.kickedPlayerIds],
      kickedClientIds: Array.from(this.kickedClientIds),
      bannedClientIds: Array.from(this.bannedClientIds),
      intentClientIds: Array.from(this.intentClientIds),
      writtenSeatIds: Array.from(this.writtenSeatIds),
      savedAt: Date.now(),
    };
  }

  private restoreFrom(saved: SavedHostRoom) {
    this.roomLocked = Boolean(saved.locked);
    this.rev = Number.isFinite(saved.rev) ? saved.rev : 0;
    let maxPlayerId = 100;
    for (const seat of saved.seats || []) {
      if (!seat || typeof seat.playerId !== 'number') continue;
      this.seatsByPlayerId.set(seat.playerId, { ...seat });
      maxPlayerId = Math.max(maxPlayerId, seat.playerId);
    }
    this.nextPlayerId = Math.max(Number(saved.nextPlayerId) || 101, maxPlayerId + 1);
    (saved.clientUids || []).forEach(([clientId, uid]) => this.clientUids.set(clientId, uid));
    (saved.lastIntentSeq || []).forEach(([clientId, seq]) => this.lastIntentSeq.set(clientId, seq));
    this.joinResponses = { ...(saved.joinResponses || {}) };
    this.kickedPlayerIds = [...(saved.kickedPlayerIds || [])];
    (saved.kickedClientIds || []).forEach((id) => this.kickedClientIds.add(id));
    (saved.bannedClientIds || []).forEach((id) => this.bannedClientIds.add(id));
    (saved.intentClientIds || []).forEach((id) => this.intentClientIds.add(id));
    (saved.writtenSeatIds || []).forEach((id) => this.writtenSeatIds.add(id));
  }

  private saveRoom() {
    if (this.destroyed) return;
    try {
      getLocalStorage()?.setItem(HOST_ROOM_STORAGE_KEY, JSON.stringify(this.exportState()));
    } catch {
      // Storage full or blocked: the room still works, it just cannot survive a reload.
    }
  }

  /**
   * Stops listening without closing the room, e.g. when the host screen unmounts during
   * development. The saved room stays, so it can be reopened.
   */
  public detach() {
    this.stop();
  }

  /** Closes the room for good: phones are told it ended and the saved copy is removed. */
  public destroy() {
    this.stop();
    clearSavedHostRoom();
    void deleteFirestoreRoom(this.code, {
      seatClientIds: Array.from(this.writtenSeatIds),
      intentClientIds: Array.from(this.intentClientIds),
    });
  }

  private stop() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.authUnsubscribe) {
      this.authUnsubscribe();
      this.authUnsubscribe = null;
    }
    if (this.firestoreFlushTimer) {
      clearTimeout(this.firestoreFlushTimer);
      this.firestoreFlushTimer = null;
    }
    for (const pending of this.pendingTakeovers.values()) clearTimeout(pending.timer);
    this.pendingTakeovers.clear();
    if (this.firestoreUnsubscribe) {
      try {
        this.firestoreUnsubscribe();
      } catch {}
      this.firestoreUnsubscribe = null;
    }
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
    }
  }
}

// ============================================================================
// Student Device Room Controller (Firestore + Local Server)
// ============================================================================
export class StudentRoomController {
  public code: string;
  public seat: MultiplayerSeat;
  private clientId: string;
  private localServerAvailable: boolean;
  private ws: WebSocket | null = null;
  private seatListener: FirestoreSeatListener;
  private firestoreConnected = false;
  private firestoreBetDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private intentSeq = 0;
  private recentIntents: { intentId: string; seq: number; playerId: number; intent: StudentIntent }[] = [];
  private lastDeliveredViewJson = '';
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private localWsConnected = false;
  private onViewUpdate: (view: PlayerViewPayload) => void;
  private onKicked: (reason?: 'removed' | 'closed') => void;
  private onConnectionChange?: (connected: boolean) => void;

  constructor(
    code: string,
    seat: MultiplayerSeat,
    clientId: string,
    initialView: PlayerViewPayload | null,
    localServerAvailable: boolean,
    seatListener: FirestoreSeatListener | null,
    onViewUpdate: (view: PlayerViewPayload) => void,
    onKicked: (reason?: 'removed' | 'closed') => void,
    onConnectionChange?: (connected: boolean) => void
  ) {
    this.code = code;
    this.seat = seat;
    this.clientId = clientId;
    this.localServerAvailable = localServerAvailable;
    this.onViewUpdate = onViewUpdate;
    this.onKicked = onKicked;
    this.onConnectionChange = onConnectionChange;

    // This phone's private seat record plus the shared table, kept in step by the host.
    this.seatListener = seatListener || listenToFirestoreSeat(this.code, this.clientId);
    this.seatListener.setHandlers(
      (update) => this.handleSeatUpdate(update),
      (connected) => {
        this.firestoreConnected = connected;
        this.updateOverallConnectionStatus();
      }
    );

    if (initialView) {
      setTimeout(() => this.deliverViewUpdate(initialView), 0);
    }

    if (this.localServerAvailable) {
      this.connectLocalWs();
      this.startFallbackPolling();
    }
    setTimeout(() => this.updateOverallConnectionStatus(), 50);
  }

  private handleSeatUpdate(update: FirestoreSeatUpdate) {
    if (this.destroyed) return;
    if (update.kicked || update.kickedPlayerIds.includes(this.seat.playerId)) {
      this.onKicked(update.kickedPlayerIds.includes(this.seat.playerId) ? 'removed' : 'closed');
      this.destroy();
      return;
    }
    if (update.view && update.playerId === this.seat.playerId) {
      this.deliverViewUpdate(update.view);
    }
  }

  private deliverViewUpdate(view: PlayerViewPayload) {
    if (this.destroyed || !view) return;
    try {
      const serialized = JSON.stringify(view);
      if (serialized === this.lastDeliveredViewJson) return;
      this.lastDeliveredViewJson = serialized;
    } catch {}
    this.onViewUpdate(view);
  }

  private updateOverallConnectionStatus() {
    const isOnline = this.localWsConnected || this.firestoreConnected;
    this.onConnectionChange?.(isOnline);
  }

  public static async joinRoom(params: {
    code: string;
    name: string;
    avatar: string;
    reconnectToken?: string;
    onViewUpdate: (view: PlayerViewPayload) => void;
    /** 'removed': the teacher removed this phone (package R6). */
    onKicked: (reason?: 'removed' | 'closed') => void;
    onConnectionChange?: (connected: boolean) => void;
    /** The name is already seated on another phone: the teacher has been asked to approve. */
    onWaitingForTeacher?: (message: string) => void;
  }): Promise<StudentRoomController> {
    const cleanCode = params.code.trim().toUpperCase();
    const cleanName = params.name.trim();
    const avatar = params.avatar;

    // 1. Try local Express server first if we are on an Express-backed host
    const localRes = await safeFetchJson<{
      code: string;
      seat: MultiplayerSeat;
      view?: PlayerViewPayload;
      error?: string;
    }>('/api/mp/room/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: cleanCode,
        name: cleanName,
        avatar,
        reconnectToken: params.reconnectToken || '',
      }),
    });

    if (localRes.isJson && localRes.ok && localRes.data?.seat) {
      const seat = localRes.data.seat;
      return new StudentRoomController(
        localRes.data.code || cleanCode,
        seat,
        seat.reconnectToken,
        localRes.data.view || null,
        true,
        null,
        params.onViewUpdate,
        params.onKicked,
        params.onConnectionChange
      );
    }

    // If local server returned a specific JSON error other than 404 (e.g., 403 Room is locked), surface it immediately
    if (localRes.isJson && !localRes.ok && localRes.status !== 404 && localRes.data?.error) {
      throw new Error(localRes.data.error);
    }

    // 2. Otherwise (Netlify, or a phone on another network): ask the host through Firestore.
    // The phone needs a Firebase id first: the host addresses its private seat record to it.
    const user = await ensureFirebaseUser();
    if (!user) {
      throw new Error(
        "This phone couldn't connect to the game server. Check the Wi-Fi or mobile data, then try again."
      );
    }

    const clientId = params.reconnectToken?.trim() || generateToken('stu');
    const requestId = generateToken('req');
    const seatListener = listenToFirestoreSeat(cleanCode, clientId);
    const joinPayload = {
      type: 'CLOUD_JOIN_REQUEST',
      clientId,
      requestId,
      name: cleanName,
      avatar,
      reconnectToken: clientId,
    };

    let retryInterval: ReturnType<typeof setInterval> | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let waitingForTeacher = false;

    try {
      const result = await new Promise<{ seat: MultiplayerSeat; view: PlayerViewPayload | null }>(
        (resolve, reject) => {
          const notFound = () =>
            reject(
              new Error(
                `Room "${cleanCode}" was not found or the Host table is offline. Please verify the 4-letter code on the projector.`
              )
            );
          timeout = setTimeout(notFound, 10_000);

          seatListener.setHandlers((update) => {
            const resp = update.join;
            if (!resp || resp.requestId !== requestId) return;
            if (resp.ok && resp.seat) {
              resolve({
                seat: { ...resp.seat, reconnectToken: clientId },
                view: update.playerId === resp.seat.playerId ? update.view : null,
              });
            } else if (resp.pending) {
              if (waitingForTeacher) return;
              waitingForTeacher = true;
              // The host has the request; stop resending it and wait for the teacher.
              if (retryInterval) clearInterval(retryInterval);
              if (timeout) clearTimeout(timeout);
              timeout = setTimeout(
                () => reject(new Error("Your teacher didn't answer in time. Try joining again.")),
                SEAT_TAKEOVER_TIMEOUT_MS + 15_000
              );
              params.onWaitingForTeacher?.(
                `${cleanName} is already playing on another phone. Waiting for your teacher to let this phone take the seat…`
              );
            } else {
              reject(new Error(resp.error || 'Could not join room.'));
            }
          });

          const send = () => void sendFirestoreStudentIntent(cleanCode, clientId, 'JOIN_REQUEST', joinPayload);
          send();
          retryInterval = setInterval(send, 2000);
        }
      );

      return new StudentRoomController(
        cleanCode,
        result.seat,
        clientId,
        result.view,
        false,
        seatListener,
        params.onViewUpdate,
        params.onKicked,
        params.onConnectionChange
      );
    } catch (err) {
      seatListener.unsubscribe();
      throw err;
    } finally {
      if (retryInterval) clearInterval(retryInterval);
      if (timeout) clearTimeout(timeout);
    }
  }

  private connectLocalWs() {
    if (this.destroyed || !this.localServerAvailable) return;
    const wsUrl = getLocalWsUrl();
    if (!wsUrl) return;

    try {
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        if (this.destroyed) {
          ws.close();
          return;
        }
        this.localWsConnected = true;
        this.updateOverallConnectionStatus();
        ws.send(
          JSON.stringify({
            type: 'REGISTER_STUDENT',
            code: this.code,
            playerId: this.seat.playerId,
            reconnectToken: this.seat.reconnectToken,
          })
        );
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'PLAYER_VIEW' && msg.view) {
            this.deliverViewUpdate(msg.view);
          } else if (msg.type === 'KICKED') {
            this.onKicked('removed');
            this.destroy();
          }
        } catch (err) {
          console.error('Student WS parse error:', err);
        }
      };

      ws.onclose = () => {
        this.localWsConnected = false;
        this.updateOverallConnectionStatus();
        if (!this.destroyed && this.localServerAvailable) {
          this.reconnectTimer = setTimeout(() => this.connectLocalWs(), 2000);
        }
      };

      ws.onerror = () => {
        // Firestore + HTTP fallback handle continuity
      };
    } catch {
      if (!this.destroyed && this.localServerAvailable) {
        this.reconnectTimer = setTimeout(() => this.connectLocalWs(), 2500);
      }
    }
  }

  private startFallbackPolling() {
    this.pollTimer = setInterval(async () => {
      if (this.destroyed || !this.localServerAvailable) return;
      const wsOpen = this.ws && this.ws.readyState === WebSocket.OPEN;
      if (wsOpen) return;

      const res = await safeFetchJson<{ view?: PlayerViewPayload }>(
        `/api/mp/room/${this.code}/view?playerId=${this.seat.playerId}&token=${encodeURIComponent(
          this.seat.reconnectToken
        )}`
      );
      if (!res.isJson) {
        this.localServerAvailable = false;
        return;
      }
      if (res.status === 403 || res.status === 404) {
        this.onKicked();
        this.destroy();
        return;
      }
      if (res.ok && res.data?.view) {
        this.deliverViewUpdate(res.data.view);
      }
    }, 2500);
  }

  public async sendIntent(intent: StudentIntent) {
    if (this.destroyed) return;
    const intentId = generateToken('int');
    const seq = Math.max(Date.now(), this.intentSeq + 1);
    this.intentSeq = seq;

    // 1. Firestore: this phone's intent document holds its recent intents (newest last), so
    // the host still gets all of them when several writes land between two of its reads.
    if (intent.type === 'SET_BET') {
      // A newer value for the same field replaces the older one.
      this.recentIntents = this.recentIntents.filter(
        (entry) => !(entry.intent.type === 'SET_BET' && entry.intent.field === intent.field)
      );
    }
    this.recentIntents.push({ intentId, seq, playerId: this.seat.playerId, intent });
    while (
      this.recentIntents.length > 1 &&
      (this.recentIntents.length > MAX_RECENT_INTENTS || JSON.stringify(this.recentIntents).length > 15_000)
    ) {
      this.recentIntents.shift();
    }

    // Draft bets are debounced to conserve Spark free-tier writes; everything else goes now.
    if (this.firestoreBetDebounceTimer) {
      clearTimeout(this.firestoreBetDebounceTimer);
      this.firestoreBetDebounceTimer = null;
    }
    if (intent.type === 'SET_BET' || intent.type === 'SET_FULL_BET') {
      this.firestoreBetDebounceTimer = setTimeout(() => {
        this.firestoreBetDebounceTimer = null;
        this.writeIntentsToFirestore();
      }, 280);
    } else {
      this.writeIntentsToFirestore();
    }

    // 2. Also send via local server if available
    if (!this.localServerAvailable) return;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(
          JSON.stringify({
            type: 'STUDENT_INTENT',
            intentId,
            intent,
          })
        );
        return;
      } catch {
        // Fall through to HTTP
      }
    }

    await safeFetchJson<{ view?: PlayerViewPayload }>(`/api/mp/room/${this.code}/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: this.seat.playerId,
        reconnectToken: this.seat.reconnectToken,
        intentId,
        intent,
      }),
    });
  }

  private writeIntentsToFirestore() {
    if (this.destroyed) return;
    void sendFirestoreStudentIntent(this.code, this.clientId, 'STUDENT_INTENT', {
      type: 'CLOUD_STUDENT_INTENTS',
      clientId: this.clientId,
      intents: this.recentIntents,
    });
  }

  public destroy() {
    this.destroyed = true;
    if (this.firestoreBetDebounceTimer) {
      clearTimeout(this.firestoreBetDebounceTimer);
      this.firestoreBetDebounceTimer = null;
    }
    this.seatListener.unsubscribe();
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
    }
  }
}
