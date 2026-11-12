import path from 'path';
import http from 'http';
import crypto from 'crypto';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { APP_ROOT_DIR, isCloudflareWorker, isServerlessRuntime } from './server/runtime';
import { handleGeminiRequest } from './server/aiHandler';
import { deepHealth, deepHealthAllowed, hasConfiguredAiKey } from './server/aiProviders';
import { pushEventToHost, registerRelayRoutes, relayIntentId, rooms, sendViewToStudent, serializeSeat } from './server/relay';
import { handleDevRoomUpgrade, registerDevRoomRoutes } from './server/roomDev';

/**
 * The dev server (npm run dev) and the serverless API (package A1 split the rest into server/).
 * The Cloudflare Pages Function imports dispatchServerlessApi from here.
 */
export { dispatchServerlessApi } from './server/serverless';
export { checkDailyIpLimit } from './server/limits';

const app = isCloudflareWorker
  ? ({
      use: () => {},
      get: () => {},
      post: () => {},
    } as any)
  : express();
if (!isCloudflareWorker) {
  app.use(express.json({ limit: '10mb' }));
}


app.post("/api/gemini", handleGeminiRequest);

// Health check endpoint
app.get("/api/health", async (req, res) => {
  if (req.query.deep === "1") {
    if (!deepHealthAllowed(req.headers.authorization)) return res.status(403).json({ error: "Deep health needs the health check token." });
    const providers = await deepHealth();
    const ok = Object.values(providers).some((p) => p.ok);
    return res.status(ok ? 200 : 503).json({ status: ok ? "ok" : "degraded", app: "grammar-casino", providers });
  }
  // Package T6: whether AI sentences are on (a yes or no, never the key).
  res.json({ status: "ok", app: "grammar-casino", aiConfigured: hasConfiguredAiKey() });
});

registerRelayRoutes(app);
// Package R4: the Cloudflare room's local stand-in (same rules), for development and tests.
if (!isCloudflareWorker) registerDevRoomRoutes(app);

// --- Vite Middleware (Dev) or Static Files (Prod) ---
async function startServer() {
  const isProduction = process.env.NODE_ENV === "production";

  if (!isProduction) {
    const vitePkg = "vite";
    const { createServer: createViteServer } = await import(/* @vite-ignore */ vitePkg);
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(APP_ROOT_DIR, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  }

  const httpServer = http.createServer(app);

  // Attach WebSocketServer at /ws on the same port 3000
  // Upgrades are routed by path: /ws is the dev relay, /api/room/<CODE>/ws the room stand-in (R4).
  const wss = new WebSocketServer({ noServer: true });
  httpServer.on("upgrade", (req, socket, head) => {
    const pathname = new URL(req.url || "/", "http://localhost").pathname;
    if (pathname === "/ws") {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
      return;
    }
    if (handleDevRoomUpgrade(req, socket, head)) return;
    socket.destroy();
  });

  wss.on("connection", (ws: WebSocket) => {
    let boundRoomCode: string | null = null;
    let boundRole: "host" | "student" | null = null;
    let boundPlayerId: number | null = null;

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (!msg || typeof msg.type !== "string") return;

        if (msg.type === "REGISTER_HOST") {
          const code = String(msg.code || "").toUpperCase();
          const room = rooms.get(code);
          if (!room || room.hostToken !== msg.hostToken) {
            ws.send(JSON.stringify({ type: "ERROR", message: "Invalid room or host token." }));
            return;
          }
          boundRoomCode = code;
          boundRole = "host";
          room.hostWs = ws;
          room.lastActivity = Date.now();

          // Flush any queued events to host immediately
          const queued = [...room.pendingHostEvents];
          room.pendingHostEvents = [];
          ws.send(
            JSON.stringify({
              type: "HOST_REGISTERED",
              code: room.code,
              locked: room.locked,
              seats: Array.from(room.seats.values()).map(serializeSeat),
              events: queued,
            })
          );
          return;
        }

        if (msg.type === "HOST_PUSH_VIEWS") {
          if (boundRole !== "host" || !boundRoomCode) return;
          const room = rooms.get(boundRoomCode);
          if (!room) return;
          room.lastActivity = Date.now();
          const views = msg.views || {};
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
          return;
        }

        if (msg.type === "REGISTER_STUDENT") {
          const code = String(msg.code || "").toUpperCase();
          const room = rooms.get(code);
          if (!room) {
            ws.send(JSON.stringify({ type: "ERROR", message: "Room not found." }));
            return;
          }
          const pid = Number(msg.playerId);
          const seat = room.seats.get(pid);
          if (!seat || seat.reconnectToken !== msg.reconnectToken) {
            ws.send(JSON.stringify({ type: "KICKED" }));
            return;
          }
          boundRoomCode = code;
          boundRole = "student";
          boundPlayerId = pid;
          seat.ws = ws;
          seat.connected = true;
          seat.lastSeen = Date.now();

          const currentView = room.playerViews.get(pid) || null;
          if (currentView) {
            ws.send(JSON.stringify({ type: "PLAYER_VIEW", view: currentView }));
          }
          return;
        }

        if (msg.type === "STUDENT_INTENT") {
          if (boundRole !== "student" || !boundRoomCode || !boundPlayerId) return;
          const room = rooms.get(boundRoomCode);
          if (!room) return;
          const seat = room.seats.get(boundPlayerId);
          if (!seat) return;
          seat.connected = true;
          seat.lastSeen = Date.now();
          if (msg.intent?.type === "LOCK_IN" && typeof msg.intent.locked === "boolean") {
            seat.lockedIn = msg.intent.locked;
          }
          pushEventToHost(room, {
            id: relayIntentId(msg.intentId),
            type: "STUDENT_INTENT",
            playerId: seat.playerId,
            seat: serializeSeat(seat),
            intent: msg.intent,
            timestamp: Date.now(),
          });
          return;
        }
      } catch (err) {
        console.error("WebSocket message error:", err);
      }
    });

    ws.on("close", () => {
      if (!boundRoomCode) return;
      const room = rooms.get(boundRoomCode);
      if (!room) return;
      if (boundRole === "host" && room.hostWs === ws) {
        room.hostWs = null;
      } else if (boundRole === "student" && boundPlayerId) {
        const seat = room.seats.get(boundPlayerId);
        if (seat && seat.ws === ws) {
          seat.ws = null;
          seat.connected = false;
          seat.lastSeen = Date.now();
          pushEventToHost(room, {
            id: crypto.randomUUID(),
            type: "STUDENT_DISCONNECTED",
            playerId: seat.playerId,
            seat: serializeSeat(seat),
            timestamp: Date.now(),
          });
        }
      }
    });
  });

  const PORT = 3000;
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

if (!isServerlessRuntime) {
  startServer().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
}
