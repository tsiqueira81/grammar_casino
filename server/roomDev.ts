// Package R4 stage A: the Cloudflare room's local stand-in for `npm run dev` and the browser
// tests. Same rules (room-worker/roomCore.ts), kept in memory instead of a Durable Object.
import type http from 'http';
import type { Duplex } from 'stream';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  ROOM_CODE_PATTERN,
  RoomCore,
  attachmentFromQuery,
  isHosted,
  mayClaim,
  sha256Hex,
  type RoomAttachment,
  type RoomClaim,
} from '../room-worker/roomCore';

interface DevRoom {
  claim: RoomClaim | null;
  sockets: Map<WebSocket, RoomAttachment>;
  core: RoomCore;
}

const devRooms = new Map<string, DevRoom>();

function roomFor(code: string): DevRoom {
  let room = devRooms.get(code);
  if (!room) {
    const sockets = new Map<WebSocket, RoomAttachment>();
    room = {
      claim: null,
      sockets,
      core: new RoomCore({
        sockets: () => Array.from(sockets.entries()).map(([socket, att]) => ({ socket, att })),
        now: () => Date.now(),
      }),
    };
    devRooms.set(code, room);
  }
  return room;
}

const ROUTE = /^\/api\/room\/([A-Za-z0-9]{4,8})\/(claim|status|ws)$/;

export function registerDevRoomRoutes(app: any) {
  app.get('/api/room/:code/status', (req: any, res: any) => {
    const code = String(req.params.code || '').toUpperCase();
    if (!ROOM_CODE_PATTERN.test(code)) return res.status(400).json({ error: 'bad-code' });
    res.set('cache-control', 'no-store').json({ hosted: isHosted(devRooms.get(code)?.claim ?? null, Date.now()) });
  });
  app.post('/api/room/:code/claim', async (req: any, res: any) => {
    const code = String(req.params.code || '').toUpperCase();
    if (!ROOM_CODE_PATTERN.test(code)) return res.status(400).json({ error: 'bad-code' });
    const token = String(req.body?.hostToken || '');
    if (token.length < 8 || token.length > 200) return res.status(400).json({ error: 'bad-token' });
    const room = roomFor(code);
    const hash = await sha256Hex(token);
    if (!mayClaim(room.claim, hash, Date.now())) return res.status(409).json({ error: 'taken' });
    room.claim = { tokenHash: hash, lastActive: Date.now() };
    res.json({ ok: true });
  });
}

const roomWss = new WebSocketServer({ noServer: true });

/** Handles an upgrade for /api/room/<CODE>/ws. Returns false when the path is not a room's. */
export function handleDevRoomUpgrade(req: http.IncomingMessage, socket: Duplex, head: Buffer): boolean {
  const url = new URL(req.url || '/', 'http://localhost');
  const match = url.pathname.match(ROUTE);
  if (!match || match[2] !== 'ws') return false;
  const code = match[1].toUpperCase();
  const door = attachmentFromQuery(url.searchParams);
  const refuse = (status: number) => {
    socket.write(`HTTP/1.1 ${status} Refused\r\nConnection: close\r\n\r\n`);
    socket.destroy();
  };
  if (!door) {
    refuse(400);
    return true;
  }
  void (async () => {
    const room = roomFor(code);
    const now = Date.now();
    if (door.att.role === 'host') {
      const hash = await sha256Hex(door.hostToken || '');
      if (!mayClaim(room.claim, hash, now)) return refuse(409);
      room.claim = { tokenHash: hash, lastActive: now };
    } else if (!isHosted(room.claim, now)) {
      return refuse(404);
    }
    roomWss.handleUpgrade(req, socket, head, (ws) => {
      room.sockets.set(ws, door.att);
      room.core.open(ws, door.att);
      ws.on('message', (data) => {
        if (door.att.role === 'host' && room.claim) room.claim.lastActive = Date.now();
        room.core.message(ws, door.att, data.toString());
      });
      ws.on('close', () => room.sockets.delete(ws));
      ws.on('error', () => room.sockets.delete(ws));
    });
  })();
  return true;
}
