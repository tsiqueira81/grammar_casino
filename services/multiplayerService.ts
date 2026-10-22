import { MultiplayerSeat, PlayerViewPayload, StudentIntent } from '../utils/multiplayerProtocol';

export interface HostEventPayload {
  id: string;
  type: 'STUDENT_JOINED' | 'STUDENT_RECONNECTED' | 'STUDENT_DISCONNECTED' | 'STUDENT_INTENT';
  seat?: MultiplayerSeat;
  playerId?: number;
  intent?: StudentIntent;
  timestamp: number;
}

function getWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

// ============================================================================
// Teacher Host Room Controller (WebSocket + HTTP Sync Fallback)
// ============================================================================
export class HostRoomController {
  public code: string;
  public hostToken: string;
  private ws: WebSocket | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private seenEventIds = new Set<string>();
  private latestViews: Record<number, PlayerViewPayload> = {};
  private onEventCallback: (event: HostEventPayload) => void;
  private onConnectionChange?: (connected: boolean) => void;

  constructor(
    code: string,
    hostToken: string,
    onEvent: (event: HostEventPayload) => void,
    onConnectionChange?: (connected: boolean) => void
  ) {
    this.code = code;
    this.hostToken = hostToken;
    this.onEventCallback = onEvent;
    this.onConnectionChange = onConnectionChange;
    this.connectWs();
    this.startFallbackPolling();
  }

  public static async createRoom(
    onEvent: (event: HostEventPayload) => void,
    onConnectionChange?: (connected: boolean) => void
  ): Promise<HostRoomController> {
    const res = await fetch('/api/mp/room/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      throw new Error('Failed to create multiplayer room on server.');
    }
    const data = await res.json();
    return new HostRoomController(data.code, data.hostToken, onEvent, onConnectionChange);
  }

  private handleIncomingEvent(ev: HostEventPayload) {
    if (!ev || !ev.id || this.seenEventIds.has(ev.id)) return;
    this.seenEventIds.add(ev.id);
    if (this.seenEventIds.size > 1000) {
      const first = this.seenEventIds.values().next().value;
      if (first) this.seenEventIds.delete(first);
    }
    this.onEventCallback(ev);
  }

  private connectWs() {
    if (this.destroyed) return;
    try {
      const ws = new WebSocket(getWsUrl());
      this.ws = ws;

      ws.onopen = () => {
        if (this.destroyed) {
          ws.close();
          return;
        }
        this.onConnectionChange?.(true);
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
        this.onConnectionChange?.(false);
        if (!this.destroyed) {
          this.reconnectTimer = setTimeout(() => this.connectWs(), 2500);
        }
      };

      ws.onerror = () => {
        // Handled by onclose + HTTP fallback
      };
    } catch {
      if (!this.destroyed) {
        this.reconnectTimer = setTimeout(() => this.connectWs(), 3000);
      }
    }
  }

  private startFallbackPolling() {
    this.pollTimer = setInterval(async () => {
      if (this.destroyed) return;
      // Always sync periodically over HTTP if WS is not open, or every 3s as heartbeat
      const wsOpen = this.ws && this.ws.readyState === WebSocket.OPEN;
      if (wsOpen) return;
      await this.syncHttp({});
    }, 1500);
  }

  public async pushViews(views: Record<number, PlayerViewPayload>) {
    this.latestViews = views;
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
    await this.syncHttp({ locked });
  }

  public async kickPlayer(playerId: number) {
    await this.syncHttp({ kickPlayerId: playerId });
  }

  public async resetAllLocks() {
    await this.syncHttp({ resetLocks: true });
  }

  private async syncHttp(payload: {
    locked?: boolean;
    kickPlayerId?: number;
    resetLocks?: boolean;
    views?: Record<number, PlayerViewPayload>;
  }) {
    if (this.destroyed) return;
    try {
      const res = await fetch(`/api/mp/room/${this.code}/host-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostToken: this.hostToken,
          ...payload,
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.events)) {
        data.events.forEach((ev: HostEventPayload) => this.handleIncomingEvent(ev));
      }
    } catch {
      // Ignore transient network errors
    }
  }

  public destroy() {
    this.destroyed = true;
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
// Student Device Room Controller (WebSocket + HTTP Fallback)
// ============================================================================
export class StudentRoomController {
  public code: string;
  public seat: MultiplayerSeat;
  private ws: WebSocket | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private onViewUpdate: (view: PlayerViewPayload) => void;
  private onKicked: () => void;
  private onConnectionChange?: (connected: boolean) => void;

  constructor(
    code: string,
    seat: MultiplayerSeat,
    initialView: PlayerViewPayload | null,
    onViewUpdate: (view: PlayerViewPayload) => void,
    onKicked: () => void,
    onConnectionChange?: (connected: boolean) => void
  ) {
    this.code = code;
    this.seat = seat;
    this.onViewUpdate = onViewUpdate;
    this.onKicked = onKicked;
    this.onConnectionChange = onConnectionChange;

    if (initialView) {
      setTimeout(() => this.onViewUpdate(initialView), 0);
    }

    this.connectWs();
    this.startFallbackPolling();
  }

  public static async joinRoom(params: {
    code: string;
    name: string;
    avatar: string;
    reconnectToken?: string;
    onViewUpdate: (view: PlayerViewPayload) => void;
    onKicked: () => void;
    onConnectionChange?: (connected: boolean) => void;
  }): Promise<StudentRoomController> {
    const res = await fetch('/api/mp/room/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: params.code.trim().toUpperCase(),
        name: params.name.trim(),
        avatar: params.avatar,
        reconnectToken: params.reconnectToken || '',
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Could not join room.');
    }

    return new StudentRoomController(
      data.code,
      data.seat,
      data.view || null,
      params.onViewUpdate,
      params.onKicked,
      params.onConnectionChange
    );
  }

  private connectWs() {
    if (this.destroyed) return;
    try {
      const ws = new WebSocket(getWsUrl());
      this.ws = ws;

      ws.onopen = () => {
        if (this.destroyed) {
          ws.close();
          return;
        }
        this.onConnectionChange?.(true);
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
            this.onViewUpdate(msg.view);
          } else if (msg.type === 'KICKED') {
            this.onKicked();
            this.destroy();
          }
        } catch (err) {
          console.error('Student WS parse error:', err);
        }
      };

      ws.onclose = () => {
        this.onConnectionChange?.(false);
        if (!this.destroyed) {
          this.reconnectTimer = setTimeout(() => this.connectWs(), 2000);
        }
      };

      ws.onerror = () => {
        // Fallback polling handles continuity
      };
    } catch {
      if (!this.destroyed) {
        this.reconnectTimer = setTimeout(() => this.connectWs(), 2500);
      }
    }
  }

  private startFallbackPolling() {
    this.pollTimer = setInterval(async () => {
      if (this.destroyed) return;
      const wsOpen = this.ws && this.ws.readyState === WebSocket.OPEN;
      if (wsOpen) return;

      try {
        const res = await fetch(
          `/api/mp/room/${this.code}/view?playerId=${this.seat.playerId}&token=${encodeURIComponent(
            this.seat.reconnectToken
          )}`
        );
        if (res.status === 403 || res.status === 404) {
          this.onKicked();
          this.destroy();
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        if (data.view) {
          this.onViewUpdate(data.view);
        }
      } catch {
        // Ignore transient network errors
      }
    }, 1500);
  }

  public async sendIntent(intent: StudentIntent) {
    if (this.destroyed) return;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(
          JSON.stringify({
            type: 'STUDENT_INTENT',
            intent,
          })
        );
        return;
      } catch {
        // Fall through to HTTP
      }
    }

    try {
      const res = await fetch(`/api/mp/room/${this.code}/intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: this.seat.playerId,
          reconnectToken: this.seat.reconnectToken,
          intent,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.view) {
          this.onViewUpdate(data.view);
        }
      }
    } catch (err) {
      console.error('Failed to send student intent:', err);
    }
  }

  public destroy() {
    this.destroyed = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
    }
  }
}
