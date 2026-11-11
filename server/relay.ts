import crypto from 'crypto';
import { WebSocket } from 'ws';
import { isServerlessRuntime } from './runtime';

// ============================================================================
// --- Multiplayer Room Relay (WebSocket + HTTP Fallback) ---
// ============================================================================
export interface RelaySeat {
  seatId: string;
  playerId: number;
  name: string;
  avatar: string;
  reconnectToken: string;
  connected: boolean;
  lockedIn: boolean;
  lastSeen: number;
  ws?: WebSocket | null;
}

export interface RelayHostEvent {
  id: string;
  type: 'STUDENT_JOINED' | 'STUDENT_RECONNECTED' | 'STUDENT_DISCONNECTED' | 'STUDENT_INTENT';
  seat?: Omit<RelaySeat, 'ws'>;
  playerId?: number;
  intent?: any;
  timestamp: number;
}

export interface RelayRoom {
  code: string;
  hostToken: string;
  locked: boolean;
  createdAt: number;
  lastActivity: number;
  hostWs: WebSocket | null;
  seats: Map<number, RelaySeat>; // playerId -> RelaySeat
  playerViews: Map<number, any>; // playerId -> latest filtered PlayerViewPayload
  pendingHostEvents: RelayHostEvent[];
}

export const ROOM_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const rooms = new Map<string, RelayRoom>();

export function generateRoomCode(): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = "";
    for (let i = 0; i < 4; i++) {
      code += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return crypto.randomBytes(2).toString("hex").toUpperCase();
}

export function serializeSeat(seat: RelaySeat): Omit<RelaySeat, 'ws'> {
  return {
    seatId: seat.seatId,
    playerId: seat.playerId,
    name: seat.name,
    avatar: seat.avatar,
    reconnectToken: seat.reconnectToken,
    connected: seat.connected,
    lockedIn: seat.lockedIn,
    lastSeen: seat.lastSeen,
  };
}

export function pushEventToHost(room: RelayRoom, event: RelayHostEvent) {
  room.lastActivity = Date.now();
  if (room.hostWs && room.hostWs.readyState === WebSocket.OPEN) {
    try {
      room.hostWs.send(JSON.stringify({ type: "HOST_EVENT", event }));
      return;
    } catch {
      // Fall through to queue
    }
  }
  room.pendingHostEvents.push(event);
  if (room.pendingHostEvents.length > 300) {
    room.pendingHostEvents.shift();
  }
}

export function relayIntentId(intentId: unknown): string {
  return typeof intentId === "string" && /^[A-Za-z0-9_-]{4,80}$/.test(intentId) ? intentId : crypto.randomUUID();
}

export function sendViewToStudent(room: RelayRoom, playerId: number, view: any) {
  room.playerViews.set(playerId, view);
  const seat = room.seats.get(playerId);
  if (seat?.ws && seat.ws.readyState === WebSocket.OPEN) {
    try {
      seat.ws.send(JSON.stringify({ type: "PLAYER_VIEW", view }));
    } catch {
      // Student will pick up via HTTP poll fallback
    }
  }
}

// Clean up stale rooms older than 6 hours
if (!isServerlessRuntime) {
  setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms.entries()) {
      if (now - room.lastActivity > 6 * 60 * 60 * 1000) {
        rooms.delete(code);
      }
    }
  }, 10 * 60 * 1000).unref?.();
}

export function registerRelayRoutes(app: any) {
  // 1. Create Room (Host)
  app.post("/api/mp/room/create", (_req, res) => {
    const code = generateRoomCode();
    const hostToken = crypto.randomBytes(16).toString("hex");
    const now = Date.now();
    const room: RelayRoom = {
      code,
      hostToken,
      locked: false,
      createdAt: now,
      lastActivity: now,
      hostWs: null,
      seats: new Map(),
      playerViews: new Map(),
      pendingHostEvents: [],
    };
    rooms.set(code, room);
    res.json({ code, hostToken });
  });

  // 2. Join or Reconnect Room (Student)
  app.post("/api/mp/room/join", (req, res) => {
    const rawCode = String(req.body?.code || "").trim().toUpperCase();
    const rawName = String(req.body?.name || "").trim().slice(0, 20);
    const rawAvatar = String(req.body?.avatar || "🦊").trim();
    const reconnectToken = String(req.body?.reconnectToken || "").trim();

    const room = rooms.get(rawCode);
    if (!room) {
      return res.status(404).json({ error: `Room "${rawCode}" not found. Check the 4-letter code on the projector.` });
    }

    room.lastActivity = Date.now();

    // Check reconnect by token first
    if (reconnectToken) {
      for (const seat of room.seats.values()) {
        if (seat.reconnectToken === reconnectToken) {
          seat.connected = true;
          seat.lastSeen = Date.now();
          if (rawName) seat.name = rawName;
          if (rawAvatar) seat.avatar = rawAvatar;
          pushEventToHost(room, {
            id: crypto.randomUUID(),
            type: "STUDENT_RECONNECTED",
            seat: serializeSeat(seat),
            playerId: seat.playerId,
            timestamp: Date.now(),
          });
          return res.json({
            code: room.code,
            seat: serializeSeat(seat),
            view: room.playerViews.get(seat.playerId) || null,
          });
        }
      }
    }

    // Also allow reconnecting if an existing seat has the exact same case-insensitive name and is currently disconnected
    if (rawName) {
      for (const seat of room.seats.values()) {
        if (seat.name.toLowerCase() === rawName.toLowerCase() && !seat.connected) {
          seat.connected = true;
          seat.lastSeen = Date.now();
          if (rawAvatar) seat.avatar = rawAvatar;
          pushEventToHost(room, {
            id: crypto.randomUUID(),
            type: "STUDENT_RECONNECTED",
            seat: serializeSeat(seat),
            playerId: seat.playerId,
            timestamp: Date.now(),
          });
          return res.json({
            code: room.code,
            seat: serializeSeat(seat),
            view: room.playerViews.get(seat.playerId) || null,
          });
        }
      }
    }

    if (room.locked) {
      return res.status(403).json({ error: "This table is currently locked by the teacher." });
    }

    if (!rawName) {
      return res.status(400).json({ error: "Please enter your display name to join." });
    }

    // Ensure unique display name
    let finalName = rawName;
    let suffix = 2;
    const existingNames = new Set(Array.from(room.seats.values()).map(s => s.name.toLowerCase()));
    while (existingNames.has(finalName.toLowerCase())) {
      finalName = `${rawName.slice(0, 16)} #${suffix++}`;
    }

    const playerId = Date.now() + Math.floor(Math.random() * 10000);
    const newSeat: RelaySeat = {
      seatId: crypto.randomUUID(),
      playerId,
      name: finalName,
      avatar: rawAvatar || "🦊",
      reconnectToken: crypto.randomBytes(16).toString("hex"),
      connected: true,
      lockedIn: false,
      lastSeen: Date.now(),
      ws: null,
    };

    room.seats.set(playerId, newSeat);

    pushEventToHost(room, {
      id: crypto.randomUUID(),
      type: "STUDENT_JOINED",
      seat: serializeSeat(newSeat),
      playerId,
      timestamp: Date.now(),
    });

    return res.json({
      code: room.code,
      seat: serializeSeat(newSeat),
      view: room.playerViews.get(playerId) || null,
    });
  });

  // 3. Host Sync Views & Room Control (Lock / Kick / Broadcast Views)
  app.post("/api/mp/room/:code/host-sync", (req, res) => {
    const code = String(req.params.code || "").toUpperCase();
    const room = rooms.get(code);
    if (!room) return res.status(404).json({ error: "Room not found." });

    const { hostToken, locked, kickPlayerId, resetLocks, views } = req.body || {};
    if (hostToken !== room.hostToken) {
      return res.status(403).json({ error: "Unauthorized host token." });
    }

    room.lastActivity = Date.now();

    if (typeof locked === "boolean") {
      room.locked = locked;
    }

    if (typeof kickPlayerId === "number") {
      const kicked = room.seats.get(kickPlayerId);
      if (kicked?.ws && kicked.ws.readyState === WebSocket.OPEN) {
        try {
          kicked.ws.send(JSON.stringify({ type: "KICKED" }));
          kicked.ws.close();
        } catch {}
      }
      room.seats.delete(kickPlayerId);
      room.playerViews.delete(kickPlayerId);
    }

    if (resetLocks) {
      for (const seat of room.seats.values()) {
        seat.lockedIn = false;
      }
    }

    if (views && typeof views === "object") {
      for (const [pidStr, viewPayload] of Object.entries(views)) {
        const pid = Number(pidStr);
        if (!isNaN(pid)) {
          const seat = room.seats.get(pid);
          if (seat && typeof (viewPayload as any)?.lockedIn === "boolean") {
            seat.lockedIn = Boolean((viewPayload as any).lockedIn);
          }
          sendViewToStudent(room, pid, viewPayload);
        }
      }
    }

    const drainedEvents = [...room.pendingHostEvents];
    room.pendingHostEvents = [];

    return res.json({
      ok: true,
      locked: room.locked,
      seats: Array.from(room.seats.values()).map(serializeSeat),
      events: drainedEvents,
    });
  });

  // 4. Student Intent Endpoint (HTTP fallback when WS is not open)
  app.post("/api/mp/room/:code/intent", (req, res) => {
    const code = String(req.params.code || "").toUpperCase();
    const room = rooms.get(code);
    if (!room) return res.status(404).json({ error: "Room not found." });

    const { playerId, reconnectToken, intent, intentId } = req.body || {};
    const seat = room.seats.get(Number(playerId));
    if (!seat || seat.reconnectToken !== reconnectToken) {
      return res.status(403).json({ error: "Invalid player session." });
    }

    seat.connected = true;
    seat.lastSeen = Date.now();
    if (intent?.type === "LOCK_IN" && typeof intent.locked === "boolean") {
      seat.lockedIn = intent.locked;
    }

    pushEventToHost(room, {
      // The phone's own intent id lets the host skip the copy that also arrives through Firestore.
      id: relayIntentId(intentId),
      type: "STUDENT_INTENT",
      playerId: seat.playerId,
      seat: serializeSeat(seat),
      intent,
      timestamp: Date.now(),
    });

    return res.json({
      ok: true,
      view: room.playerViews.get(seat.playerId) || null,
    });
  });

  // 5. Student Poll View Endpoint (HTTP fallback)
  app.get("/api/mp/room/:code/view", (req, res) => {
    const code = String(req.params.code || "").toUpperCase();
    const room = rooms.get(code);
    if (!room) return res.status(404).json({ error: "Room not found." });

    const playerId = Number(req.query.playerId);
    const token = String(req.query.token || "");
    const seat = room.seats.get(playerId);
    if (!seat || seat.reconnectToken !== token) {
      return res.status(403).json({ error: "Session expired or removed from table." });
    }

    seat.connected = true;
    seat.lastSeen = Date.now();

    return res.json({
      ok: true,
      view: room.playerViews.get(playerId) || null,
    });
  });
}
