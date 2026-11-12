// Package R4 stage A: how the room's records travel, behind one shape for both transports.
// - 'firestore': the Firestore documents the game has always used (still the default).
// - 'do': the Cloudflare room (room-worker/), one small server per room over WebSockets.
// The host (teacher's screen) and the phones keep exactly the same rules either way; only the
// delivery of the room record, the seat records and the intent records changes.
import {
  deleteFirestoreRoom,
  ensureFirebaseUser,
  isFirestoreRoomCodeFree,
  listenToFirestoreRoomIntents,
  listenToFirestoreSeat,
  sendFirestoreStudentIntent,
  subscribeToAuthChanges,
  writeFirestoreRoom,
  type FirestoreSeatListener,
  type FirestoreSeatUpdate,
  type FirestoreSeatWrite,
} from './firebaseService';
import type { PlayerViewPayload } from '../utils/multiplayerProtocol';
import { createSeatMerger } from './roomDocs';
import { safeLocalStorage } from '../utils/safeStorage';

export type RoomTransport = 'firestore' | 'do';

export interface RoomWrite {
  code: string;
  locked: boolean;
  rev: number;
  table: Partial<PlayerViewPayload>;
  seatRevs: Record<number, number>;
  kickedPlayerIds: number[];
  seats: FirestoreSeatWrite[];
}

export type IntentHandler = (clientId: string, payload: any, uid: string | null) => void;

/** The teacher screen's side of one room. */
export interface HostRoomLink {
  readonly transport: RoomTransport;
  write(params: RoomWrite): Promise<boolean>;
  /** Phones' intent records, the ones already there first. */
  listenToIntents(onIntent: IntentHandler, onConnection?: (connected: boolean) => void): () => void;
  /** This device's identity changed: everything must be written again. */
  onIdentityChange(cb: () => void): () => void;
  /** The room lost what it held (the Cloudflare room slept): everything must be written again. */
  onResync(cb: () => void): () => void;
  /** Closes the room for good. */
  remove(extra: { seatClientIds?: string[]; intentClientIds?: string[] }): Promise<void>;
  /** Stops listening; the room stays. */
  close(): void;
}

/** A phone's side of one room. */
export interface StudentRoomLink {
  readonly transport: RoomTransport;
  readonly seat: FirestoreSeatListener;
  sendIntent(type: 'JOIN_REQUEST' | 'STUDENT_INTENT', payload: Record<string, any>): Promise<boolean>;
}

// ---------------------------------------------------------------------------------------------
// Firestore

export function firestoreHostLink(code: string): HostRoomLink {
  return {
    transport: 'firestore',
    write: (params) => writeFirestoreRoom(params),
    listenToIntents: (onIntent, onConnection) => listenToFirestoreRoomIntents(code, onIntent, onConnection),
    onIdentityChange: (cb) => subscribeToAuthChanges(cb),
    onResync: () => () => {},
    remove: (extra) => deleteFirestoreRoom(code, extra),
    close: () => {},
  };
}

export async function firestoreStudentLink(code: string, clientId: string): Promise<StudentRoomLink | null> {
  // The phone needs a Firebase id first: the host addresses its private seat record to it.
  const user = await ensureFirebaseUser();
  if (!user) return null;
  return firestoreStudentLinkWith(code, clientId, listenToFirestoreSeat(code, clientId));
}

export function firestoreStudentLinkWith(code: string, clientId: string, seat: FirestoreSeatListener): StudentRoomLink {
  return {
    transport: 'firestore',
    seat,
    sendIntent: (type, payload) => sendFirestoreStudentIntent(code, clientId, type, payload),
  };
}

export const isFirestoreCodeFree = isFirestoreRoomCodeFree;

// ---------------------------------------------------------------------------------------------
// Which transport

/** How long a phone or the teacher screen waits for the Cloudflare room before using Firestore. */
export const DO_OPEN_TIMEOUT_MS = 4000;
const DO_STATUS_TIMEOUT_MS = 2500;
const DEVICE_ID_KEY = 'grammar_casino_device_v1';

/**
 * The transport a new room uses: ?transport=do|firestore wins (for trying it on real phones),
 * then the build's default (VITE_ROOM_TRANSPORT), then Firestore.
 */
export function chosenHostTransport(search = typeof location !== 'undefined' ? location.search : ''): RoomTransport {
  const param = new URLSearchParams(search).get('transport');
  if (param === 'do' || param === 'firestore') return param;
  const built = (import.meta as any).env?.VITE_ROOM_TRANSPORT;
  return built === 'do' ? 'do' : 'firestore';
}

function apiBase(): string {
  return typeof location !== 'undefined' ? location.origin : '';
}

function wsBase(): string {
  if (typeof location === 'undefined') return '';
  return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
}

async function fetchJsonWithTimeout(url: string, init: RequestInit, ms: number): Promise<{ status: number; data: any } | null> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: controller?.signal, cache: 'no-store' });
    const type = res.headers.get('content-type') || '';
    if (!type.includes('application/json')) return null;
    return { status: res.status, data: await res.json() };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Takes a room code on the Cloudflare room for this teacher screen. 'taken': another teacher has
 * it; 'unavailable': the Cloudflare room cannot be reached (use Firestore instead).
 */
export async function claimDoRoom(code: string, hostToken: string): Promise<'ok' | 'taken' | 'unavailable'> {
  const res = await fetchJsonWithTimeout(
    `${apiBase()}/api/room/${encodeURIComponent(code)}/claim`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hostToken }) },
    DO_OPEN_TIMEOUT_MS
  );
  if (!res) return 'unavailable';
  if (res.status === 200 && res.data?.ok) return 'ok';
  if (res.status === 409) return 'taken';
  return 'unavailable';
}

/** Whether a teacher screen is running this room on the Cloudflare room (a phone asks first). */
export async function isDoRoomHosted(code: string): Promise<boolean> {
  const res = await fetchJsonWithTimeout(`${apiBase()}/api/room/${encodeURIComponent(code)}/status`, { method: 'GET' }, DO_STATUS_TIMEOUT_MS);
  return Boolean(res && res.status === 200 && res.data?.hosted);
}

function deviceId(): string {
  try {
    const saved = safeLocalStorage.getItem(DEVICE_ID_KEY);
    if (saved && /^[A-Za-z0-9_-]{6,80}$/.test(saved)) return saved;
    const made = `dev_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    safeLocalStorage.setItem(DEVICE_ID_KEY, made);
    return made;
  } catch {
    return `dev_${Math.random().toString(36).slice(2)}`;
  }
}

// ---------------------------------------------------------------------------------------------
// The Cloudflare room: one WebSocket with reconnect, heartbeat and replay

const PING_EVERY_MS = 20_000;
const BACKOFF_MIN_MS = 500;
const BACKOFF_MAX_MS = 8000;

/** Reconnect delay: 0.5 s doubling to 8 s, with jitter so 35 phones do not return at once. */
export function reconnectDelay(attempt: number, random = Math.random): number {
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** Math.max(0, attempt));
  return Math.round(base / 2 + random() * (base / 2));
}

class RoomSocket {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private closed = false;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private openWaiters: Array<(ok: boolean) => void> = [];
  /** Refused at the door (room taken, not hosted): stop trying. */
  private refused = false;

  constructor(
    private readonly url: string,
    private readonly onMessage: (msg: any) => void,
    private readonly onState: (open: boolean) => void
  ) {
    this.connect();
  }

  get isOpen() {
    return Boolean(this.ws && this.ws.readyState === WebSocket.OPEN);
  }

  /** Resolves true once open, false after the timeout. */
  whenOpen(ms = DO_OPEN_TIMEOUT_MS): Promise<boolean> {
    if (this.isOpen) return Promise.resolve(true);
    if (this.closed || this.refused) return Promise.resolve(false);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.openWaiters = this.openWaiters.filter((w) => w !== done);
        resolve(false);
      }, ms);
      const done = (ok: boolean) => {
        clearTimeout(timer);
        resolve(ok);
      };
      this.openWaiters.push(done);
    });
  }

  send(msg: unknown): boolean {
    if (!this.isOpen) return false;
    try {
      this.ws!.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }

  close() {
    this.closed = true;
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.openWaiters.splice(0).forEach((w) => w(false));
    try {
      this.ws?.close(1000, 'bye');
    } catch {}
    this.ws = null;
  }

  private connect() {
    if (this.closed || this.refused) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.onState(true);
      this.openWaiters.splice(0).forEach((w) => w(true));
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.send({ t: 'ping' }), PING_EVERY_MS);
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return;
      try {
        this.onMessage(JSON.parse(ev.data));
      } catch {}
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.onState(false);
      // 4001: another teacher screen took the room; 4002: full; 4003: closed for good.
      if (ev.code === 4001 || ev.code === 4002 || ev.code === 4003) {
        this.refused = true;
        this.openWaiters.splice(0).forEach((w) => w(false));
        return;
      }
      this.scheduleRetry();
    };
    ws.onerror = () => {};
  }

  private scheduleRetry() {
    if (this.closed || this.refused) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, reconnectDelay(this.attempt++));
  }
}

export function doHostLink(code: string, hostToken: string): HostRoomLink {
  const intentHandlers = new Set<IntentHandler>();
  const connectionHandlers = new Set<(connected: boolean) => void>();
  const resyncHandlers = new Set<() => void>();
  let wasOpen = false;
  const socket = new RoomSocket(
    `${wsBase()}/api/room/${encodeURIComponent(code)}/ws?role=host&token=${encodeURIComponent(hostToken)}`,
    (msg) => {
      if (msg?.t === 'intent' && typeof msg.clientId === 'string' && typeof msg.payloadJson === 'string') {
        let payload: any;
        try {
          payload = JSON.parse(msg.payloadJson);
        } catch {
          return;
        }
        const uid = typeof msg.uid === 'string' && msg.uid ? msg.uid : null;
        intentHandlers.forEach((h) => h(msg.clientId, payload, uid));
      } else if (msg?.t === 'resync') {
        resyncHandlers.forEach((h) => h());
      }
    },
    (open) => {
      connectionHandlers.forEach((h) => h(open));
      // Back after a drop: the room may have lost what it held, so send it all again.
      if (open && wasOpen) resyncHandlers.forEach((h) => h());
      if (open) wasOpen = true;
    }
  );
  return {
    transport: 'do',
    async write(params) {
      if (!(await socket.whenOpen())) return false;
      const seatRevs: Record<string, number> = {};
      Object.entries(params.seatRevs || {}).forEach(([pid, rev]) => (seatRevs[String(pid)] = rev));
      return socket.send({
        t: 'write',
        room: {
          code: params.code,
          locked: params.locked,
          rev: params.rev,
          tableJson: JSON.stringify(params.table || {}),
          seatRevs,
          kickedPlayerIds: params.kickedPlayerIds || [],
        },
        seats: params.seats.map((s) => ({
          clientId: s.clientId,
          uid: s.uid,
          playerId: s.playerId ?? null,
          viewJson: s.view ? JSON.stringify(s.view) : '',
          joinJson: s.join ? JSON.stringify(s.join) : '',
          kicked: Boolean(s.kicked),
        })),
      });
    },
    listenToIntents(onIntent, onConnection) {
      intentHandlers.add(onIntent);
      if (onConnection) {
        connectionHandlers.add(onConnection);
        if (socket.isOpen) onConnection(true);
      }
      return () => {
        intentHandlers.delete(onIntent);
        if (onConnection) connectionHandlers.delete(onConnection);
      };
    },
    onIdentityChange: () => () => {},
    onResync(cb) {
      resyncHandlers.add(cb);
      return () => resyncHandlers.delete(cb);
    },
    async remove() {
      socket.send({ t: 'close' });
      // Give the message a moment to leave before the socket closes.
      await new Promise((r) => setTimeout(r, 50));
      socket.close();
    },
    close: () => socket.close(),
  };
}

/** A phone's link to the Cloudflare room. Null when the room cannot be reached in time. */
export async function doStudentLink(code: string, clientId: string): Promise<StudentRoomLink | null> {
  const merge = createSeatMerger();
  let room: any = null;
  let seat: any = null;
  let lastUpdate: FirestoreSeatUpdate | null = null;
  let lastConnected: boolean | null = null;
  let onUpdate: ((u: FirestoreSeatUpdate) => void) | null = null;
  let onConnection: ((c: boolean) => void) | null = null;
  /** The latest intent record, sent again when the socket comes back (like a Firestore document). */
  let pending: { type: string; payloadJson: string } | null = null;

  const emit = () => {
    lastUpdate = merge(room, seat);
    onUpdate?.(lastUpdate);
  };
  const socket = new RoomSocket(
    `${wsBase()}/api/room/${encodeURIComponent(code)}/ws?role=student&client=${encodeURIComponent(clientId)}&device=${encodeURIComponent(deviceId())}`,
    (msg) => {
      if (msg?.t === 'room') {
        room = msg.room || null;
        emit();
      } else if (msg?.t === 'seat') {
        seat = msg.seat || null;
        emit();
      }
    },
    (open) => {
      lastConnected = open;
      onConnection?.(open);
      if (open && pending) socket.send({ t: 'intent', ...pending });
    }
  );
  if (!(await socket.whenOpen())) {
    socket.close();
    return null;
  }
  const seatListener: FirestoreSeatListener = {
    setHandlers(nextOnUpdate, nextOnConnection) {
      onUpdate = nextOnUpdate;
      onConnection = nextOnConnection || null;
      if (lastConnected !== null) onConnection?.(lastConnected);
      if (lastUpdate) onUpdate(lastUpdate);
    },
    unsubscribe() {
      onUpdate = null;
      onConnection = null;
      socket.close();
    },
  };
  return {
    transport: 'do',
    seat: seatListener,
    async sendIntent(type, payload) {
      pending = { type, payloadJson: JSON.stringify(payload) };
      socket.send({ t: 'intent', ...pending });
      return true;
    },
  };
}
