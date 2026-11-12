// Package R4 stage A: the live-room Worker. One Durable Object (GameRoom) per room code, with
// WebSockets that can sleep while the room is quiet (the hibernation API), so an idle room costs
// nothing. The rules of the room are in roomCore.ts; this file is only the Cloudflare wiring.
//
// Routes (reached through the Pages site's /api/room/* function, same origin as the game):
//   POST /api/room/<CODE>/claim  {hostToken}   take the code for this teacher screen
//   GET  /api/room/<CODE>/status               {hosted}: is a teacher screen using it here?
//   GET  /api/room/<CODE>/ws?role=host&token=… or ?role=student&client=…&device=…   (WebSocket)
import {
  ROOM_CODE_PATTERN,
  ROOM_DELETE_AFTER_MS,
  RoomCore,
  attachmentFromQuery,
  isHosted,
  mayClaim,
  sha256Hex,
  type RoomAttachment,
  type RoomClaim,
} from './roomCore';

// The few Cloudflare types this file needs, so the project does not need the full type package.
interface DurableObjectStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  deleteAll(): Promise<void>;
  setAlarm(at: number): Promise<void>;
}
interface CfWebSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}
interface DurableObjectState {
  storage: DurableObjectStorage;
  acceptWebSocket(ws: CfWebSocket, tags?: string[]): void;
  getWebSockets(tag?: string): CfWebSocket[];
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}
interface DurableObjectNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}
declare const WebSocketPair: { new (): { 0: CfWebSocket; 1: CfWebSocket } };

export interface Env {
  ROOMS: DurableObjectNamespace;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

/** The host is "heard from" at most this often in storage, to keep writes (and cost) low. */
const ACTIVE_WRITE_EVERY_MS = 10 * 60 * 1000;

export class GameRoom {
  private claim: RoomClaim | null = null;
  private core: RoomCore;

  constructor(private readonly state: DurableObjectState) {
    this.core = new RoomCore({
      sockets: () =>
        this.state.getWebSockets().map((ws) => ({ socket: ws, att: (ws.deserializeAttachment() || { role: 'student' }) as RoomAttachment })),
      now: () => Date.now(),
    });
    void this.state.blockConcurrencyWhile(async () => {
      this.claim = (await this.state.storage.get<RoomClaim>('claim')) ?? null;
    });
  }

  private async saveClaim(claim: RoomClaim) {
    this.claim = claim;
    await this.state.storage.put('claim', claim);
    await this.state.storage.setAlarm(claim.lastActive + ROOM_DELETE_AFTER_MS);
  }

  private async touchHost() {
    if (!this.claim) return;
    const now = Date.now();
    if (now - this.claim.lastActive < ACTIVE_WRITE_EVERY_MS) return;
    await this.saveClaim({ ...this.claim, lastActive: now });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const action = url.pathname.split('/').pop();
    const now = Date.now();

    if (action === 'status' && request.method === 'GET') {
      return json({ hosted: isHosted(this.claim, now) });
    }

    if (action === 'claim' && request.method === 'POST') {
      let token = '';
      try {
        token = String(((await request.json()) as any)?.hostToken || '');
      } catch {}
      if (token.length < 8 || token.length > 200) return json({ error: 'bad-token' }, 400);
      const hash = await sha256Hex(token);
      if (!mayClaim(this.claim, hash, now)) return json({ error: 'taken' }, 409);
      await this.saveClaim({ tokenHash: hash, lastActive: now });
      return json({ ok: true });
    }

    if (action === 'ws') {
      if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'websocket-only' }, 426);
      const door = attachmentFromQuery(url.searchParams);
      if (!door) return json({ error: 'bad-request' }, 400);
      if (door.att.role === 'host') {
        const hash = await sha256Hex(door.hostToken || '');
        if (!mayClaim(this.claim, hash, now)) return json({ error: 'taken' }, 409);
        if (!this.claim || this.claim.tokenHash !== hash) await this.saveClaim({ tokenHash: hash, lastActive: now });
      } else if (!isHosted(this.claim, now)) {
        return json({ error: 'not-hosted' }, 404);
      }
      const pair = new WebSocketPair();
      const server = pair[1];
      server.serializeAttachment(door.att);
      this.state.acceptWebSocket(server, [door.att.role]);
      this.core.open(server, door.att);
      return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit & { webSocket: CfWebSocket });
    }

    return json({ error: 'not-found' }, 404);
  }

  async webSocketMessage(ws: CfWebSocket, message: string | ArrayBuffer) {
    const att = (ws.deserializeAttachment() || { role: 'student' }) as RoomAttachment;
    if (typeof message !== 'string') return;
    this.core.message(ws, att, message);
    if (att.role === 'host') await this.touchHost();
  }

  async webSocketClose(ws: CfWebSocket, code: number) {
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, 'closed');
    } catch {}
  }

  async webSocketError() {}

  /** 24 hours after the teacher was last heard from, nothing of the room is kept (package A5). */
  async alarm() {
    const claim = this.claim ?? (await this.state.storage.get<RoomClaim>('claim')) ?? null;
    if (claim && Date.now() - claim.lastActive < ROOM_DELETE_AFTER_MS) {
      await this.state.storage.setAlarm(claim.lastActive + ROOM_DELETE_AFTER_MS);
      return;
    }
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.close(4003, 'This room has closed');
      } catch {}
    }
    this.claim = null;
    await this.state.storage.deleteAll();
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/room\/([A-Za-z0-9]{4,8})\/(claim|status|ws)$/);
    if (!match) return json({ error: 'not-found' }, 404);
    const code = match[1].toUpperCase();
    if (!ROOM_CODE_PATTERN.test(code)) return json({ error: 'bad-code' }, 400);
    return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(request);
  },
};
