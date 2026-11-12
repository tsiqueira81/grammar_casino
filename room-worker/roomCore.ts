// Package R4 stage A: the rules of one live room's relay, shared by the Cloudflare Durable Object
// (room-worker/index.ts) and the local development server (server.ts), so both behave the same.
//
// The room mirrors the Firestore documents the game already uses, as plain messages:
// - the teacher's screen ("host") writes the shared room record and one seat record per phone;
// - each phone ("student") receives the room record and only its own seat record;
// - each phone writes one intent record (its recent actions), which only the host receives.
// The host stays the referee: it decides who gets a seat, and checks every bet. This relay only
// keeps the latest records, replays them on reconnect, and keeps each phone to its own records.
//
// Nothing here touches Cloudflare or Node APIs. Memory can be lost when an idle Durable Object
// sleeps; the host is then asked to send everything again ("resync"), so only the host's claim on
// the room code has to be stored.

export type RoomRole = 'host' | 'student';

export interface RoomAttachment {
  role: RoomRole;
  /** Students: the phone's private client id (its reconnect token). */
  clientId?: string;
  /** Students: a per-browser id, used by the host to keep a removed phone out. */
  deviceId?: string;
}

export interface RoomSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface RoomClaim {
  /** SHA-256 of the host token, hex. The token itself is never stored. */
  tokenHash: string;
  /** Last time the host was heard from, ms. */
  lastActive: number;
}

export interface RoomRecord {
  code: string;
  locked: boolean;
  rev: number;
  tableJson: string;
  seatRevs: Record<string, number>;
  kickedPlayerIds: number[];
  updatedAt: number;
}

export interface SeatRecord {
  clientId: string;
  uid: string;
  playerId: number | null;
  viewJson: string;
  joinJson: string;
  kicked: boolean;
  rev: number;
  updatedAt: number;
}

export interface IntentRecord {
  clientId: string;
  uid: string;
  type: string;
  payloadJson: string;
  updatedAt: number;
}

/** A room code another teacher is not using any more can be taken after this long. */
export const ROOM_CLAIM_IDLE_MS = 6 * 60 * 60 * 1000;
/** Everything a room holds is deleted this long after the host was last heard from. */
export const ROOM_DELETE_AFTER_MS = 24 * 60 * 60 * 1000;
/** Package R6: phones per room, with room for phones reconnecting while the old socket lingers. */
export const MAX_STUDENT_SOCKETS = 60;
export const MAX_ROOM_JSON = 600_000;
export const MAX_SEAT_JSON = 200_000;
export const MAX_INTENT_JSON = 15_000;
/** Messages each socket may send: a burst, refilled at this rate per second. */
export const SOCKET_BURST = 20;
export const SOCKET_RATE_PER_S = 10;

export const ROOM_CODE_PATTERN = /^[A-Z0-9]{4,8}$/;
const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{6,80}$/;

export function isValidClientId(id: unknown): id is string {
  return typeof id === 'string' && CLIENT_ID_PATTERN.test(id);
}

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Whether a host with this token hash may take the code now. */
export function mayClaim(claim: RoomClaim | null, tokenHash: string, now: number): boolean {
  if (!claim) return true;
  if (claim.tokenHash === tokenHash) return true;
  return now - claim.lastActive > ROOM_CLAIM_IDLE_MS;
}

export function isHosted(claim: RoomClaim | null, now: number): boolean {
  return Boolean(claim) && now - (claim as RoomClaim).lastActive <= ROOM_CLAIM_IDLE_MS;
}

interface Bucket {
  tokens: number;
  at: number;
}

export interface RoomCoreEnv {
  /** Every open socket of this room, with what it is. */
  sockets(): Array<{ socket: RoomSocket; att: RoomAttachment }>;
  now(): number;
}

const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length <= max ? v : null);

/** The relay of one room. One instance per room; the caller routes socket events to it. */
export class RoomCore {
  room: RoomRecord | null = null;
  seats = new Map<string, SeatRecord>();
  intents = new Map<string, IntentRecord>();
  private buckets = new WeakMap<RoomSocket, Bucket>();
  private lastResyncAskAt = 0;

  constructor(private readonly env: RoomCoreEnv) {}

  /** A socket that has passed the door checks (host token, or a valid client id) is now open. */
  open(socket: RoomSocket, att: RoomAttachment): void {
    if (att.role === 'host') {
      // One teacher screen at a time: a newer tab replaces the older one.
      for (const other of this.env.sockets()) {
        if (other.att.role === 'host' && other.socket !== socket) {
          try {
            other.socket.close(4001, 'Another screen took over this room');
          } catch {}
        }
      }
      for (const intent of this.intents.values()) this.sendTo(socket, { t: 'intent', ...intent });
      if (!this.room) this.sendTo(socket, { t: 'resync' });
      return;
    }
    const students = this.env.sockets().filter((s) => s.att.role === 'student');
    if (students.length > MAX_STUDENT_SOCKETS) {
      try {
        socket.close(4002, 'This room is full');
      } catch {}
      return;
    }
    this.sendTo(socket, { t: 'room', room: this.room });
    this.sendTo(socket, { t: 'seat', seat: (att.clientId && this.seats.get(att.clientId)) || null });
    if (!this.room) this.askHostToResync();
  }

  /** A message from an open socket. Returns false when the message was refused. */
  message(socket: RoomSocket, att: RoomAttachment, raw: string): boolean {
    if (!this.allow(socket)) return false;
    if (typeof raw !== 'string' || raw.length > MAX_ROOM_JSON + 50 * MAX_SEAT_JSON) return false;
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return false;
    }
    if (!msg || typeof msg.t !== 'string') return false;
    if (msg.t === 'ping') {
      this.sendTo(socket, { t: 'pong', now: this.env.now() });
      if (att.role === 'host' && !this.room) this.sendTo(socket, { t: 'resync' });
      return true;
    }
    return att.role === 'host' ? this.fromHost(socket, msg) : this.fromStudent(att, msg);
  }

  private fromHost(socket: RoomSocket, msg: any): boolean {
    if (msg.t === 'close') {
      this.room = null;
      this.seats.clear();
      this.intents.clear();
      for (const s of this.env.sockets()) {
        if (s.att.role === 'student') this.sendTo(s.socket, { t: 'room', room: null });
      }
      return true;
    }
    if (msg.t !== 'write' || !msg.room || typeof msg.room !== 'object') return false;
    const now = this.env.now();
    const r = msg.room;
    const tableJson = str(r.tableJson, MAX_ROOM_JSON);
    if (tableJson === null || typeof r.code !== 'string') return false;
    const room: RoomRecord = {
      code: r.code,
      locked: Boolean(r.locked),
      rev: Number(r.rev) || 0,
      tableJson,
      seatRevs: r.seatRevs && typeof r.seatRevs === 'object' ? r.seatRevs : {},
      kickedPlayerIds: Array.isArray(r.kickedPlayerIds) ? r.kickedPlayerIds.filter((n: unknown) => typeof n === 'number') : [],
      updatedAt: now,
    };
    const changed: SeatRecord[] = [];
    for (const s of Array.isArray(msg.seats) ? msg.seats : []) {
      if (!s || !isValidClientId(s.clientId)) continue;
      const viewJson = str(s.viewJson ?? '', MAX_SEAT_JSON);
      const joinJson = str(s.joinJson ?? '', 5_000);
      if (viewJson === null || joinJson === null) continue;
      const seat: SeatRecord = {
        clientId: s.clientId,
        uid: typeof s.uid === 'string' ? s.uid : '',
        playerId: typeof s.playerId === 'number' ? s.playerId : null,
        viewJson,
        joinJson,
        kicked: Boolean(s.kicked),
        rev: room.rev,
        updatedAt: now,
      };
      this.seats.set(seat.clientId, seat);
      changed.push(seat);
    }
    this.room = room;
    // Like Firestore: each phone hears about the room record, and about its own seat record.
    const changedById = new Map(changed.map((s) => [s.clientId, s]));
    for (const s of this.env.sockets()) {
      if (s.att.role !== 'student') continue;
      const own = s.att.clientId ? changedById.get(s.att.clientId) : undefined;
      if (own) this.sendTo(s.socket, { t: 'seat', seat: own });
      this.sendTo(s.socket, { t: 'room', room });
    }
    this.sendTo(socket, { t: 'written', rev: room.rev });
    return true;
  }

  private fromStudent(att: RoomAttachment, msg: any): boolean {
    if (msg.t !== 'intent' || !att.clientId) return false;
    const payloadJson = str(msg.payloadJson, MAX_INTENT_JSON);
    const type = msg.type === 'JOIN_REQUEST' || msg.type === 'STUDENT_INTENT' ? msg.type : null;
    if (payloadJson === null || !type) return false;
    // The phone can only ever write its own record, under the identity it opened the socket with.
    const intent: IntentRecord = {
      clientId: att.clientId,
      uid: att.deviceId ? `d:${att.deviceId}` : `c:${att.clientId}`,
      type,
      payloadJson,
      updatedAt: this.env.now(),
    };
    this.intents.set(att.clientId, intent);
    let hostOpen = false;
    for (const s of this.env.sockets()) {
      if (s.att.role === 'host') {
        hostOpen = true;
        this.sendTo(s.socket, { t: 'intent', ...intent });
      }
    }
    if (hostOpen && !this.room) this.askHostToResync();
    return true;
  }

  private askHostToResync() {
    const now = this.env.now();
    if (now - this.lastResyncAskAt < 1000) return;
    this.lastResyncAskAt = now;
    for (const s of this.env.sockets()) if (s.att.role === 'host') this.sendTo(s.socket, { t: 'resync' });
  }

  private allow(socket: RoomSocket): boolean {
    const now = this.env.now();
    const b = this.buckets.get(socket) || { tokens: SOCKET_BURST, at: now };
    b.tokens = Math.min(SOCKET_BURST, b.tokens + ((now - b.at) / 1000) * SOCKET_RATE_PER_S);
    b.at = now;
    if (b.tokens < 1) {
      this.buckets.set(socket, b);
      return false;
    }
    b.tokens -= 1;
    this.buckets.set(socket, b);
    return true;
  }

  private sendTo(socket: RoomSocket, msg: unknown) {
    try {
      socket.send(JSON.stringify(msg));
    } catch {}
  }
}

/** Reads the door checks from a WebSocket request's query string. Null when it must be refused. */
export function attachmentFromQuery(params: URLSearchParams): { att: RoomAttachment; hostToken?: string } | null {
  const role = params.get('role');
  if (role === 'host') {
    const token = params.get('token') || '';
    if (token.length < 8 || token.length > 200) return null;
    return { att: { role: 'host' }, hostToken: token };
  }
  if (role === 'student') {
    const clientId = params.get('client');
    if (!isValidClientId(clientId)) return null;
    const device = params.get('device');
    return { att: { role: 'student', clientId, deviceId: isValidClientId(device) ? device : undefined } };
  }
  return null;
}
