import { MultiplayerSeat, PlayerViewPayload, StudentIntent } from '../utils/multiplayerProtocol';

export interface HostEventPayload {
  id: string;
  type: 'STUDENT_JOINED' | 'STUDENT_RECONNECTED' | 'STUDENT_DISCONNECTED' | 'STUDENT_INTENT';
  seat?: MultiplayerSeat;
  playerId?: number;
  intent?: StudentIntent;
  timestamp: number;
}

const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)];
  }
  return code;
}

function generateToken(prefix = 'tok'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
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

// ============================================================================
// Lightweight Zero-Dependency MQTT 3.1.1 over WSS + BroadcastChannel Relay
// Enables real-time multiplayer on static hosts (Netlify, GitHub Pages, Electron)
// and cross-domain between Host and Student devices over port 443 WSS.
// ============================================================================
const PUBLIC_WSS_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
];

const TOPIC_PREFIX = 'grammar-casino/v1/room';

function encodeMqttString(str: string): Uint8Array {
  const bytes = new TextEncoder().encode(str);
  const out = new Uint8Array(2 + bytes.length);
  out[0] = (bytes.length >> 8) & 0xff;
  out[1] = bytes.length & 0xff;
  out.set(bytes, 2);
  return out;
}

function encodeRemainingLength(len: number): number[] {
  const out: number[] = [];
  do {
    let digit = len % 128;
    len = Math.floor(len / 128);
    if (len > 0) digit |= 0x80;
    out.push(digit);
  } while (len > 0);
  return out;
}

function buildMqttConnectPacket(clientId: string): Uint8Array {
  const varHeader = new Uint8Array([
    0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, // "MQTT"
    0x04, // Protocol Level 4 (v3.1.1)
    0x02, // Clean Session
    0x00, 0x3c, // Keep Alive = 60s
  ]);
  const payload = encodeMqttString(clientId);
  const remLen = encodeRemainingLength(varHeader.length + payload.length);
  const packet = new Uint8Array(1 + remLen.length + varHeader.length + payload.length);
  packet[0] = 0x10;
  packet.set(remLen, 1);
  packet.set(varHeader, 1 + remLen.length);
  packet.set(payload, 1 + remLen.length + varHeader.length);
  return packet;
}

function buildMqttSubscribePacket(topic: string, packetId: number): Uint8Array {
  const varHeader = new Uint8Array([(packetId >> 8) & 0xff, packetId & 0xff]);
  const topicBytes = encodeMqttString(topic);
  const payload = new Uint8Array(topicBytes.length + 1);
  payload.set(topicBytes, 0);
  payload[topicBytes.length] = 0x00; // QoS 0
  const remLen = encodeRemainingLength(varHeader.length + payload.length);
  const packet = new Uint8Array(1 + remLen.length + varHeader.length + payload.length);
  packet[0] = 0x82;
  packet.set(remLen, 1);
  packet.set(varHeader, 1 + remLen.length);
  packet.set(payload, 1 + remLen.length + varHeader.length);
  return packet;
}

function buildMqttPublishPacket(topic: string, message: string): Uint8Array {
  const topicBytes = encodeMqttString(topic);
  const msgBytes = new TextEncoder().encode(message);
  const remLen = encodeRemainingLength(topicBytes.length + msgBytes.length);
  const packet = new Uint8Array(1 + remLen.length + topicBytes.length + msgBytes.length);
  packet[0] = 0x30; // PUBLISH, QoS 0
  packet.set(remLen, 1);
  packet.set(topicBytes, 1 + remLen.length);
  packet.set(msgBytes, 1 + remLen.length + topicBytes.length);
  return packet;
}

const MQTT_PINGREQ = new Uint8Array([0xc0, 0x00]);

class SingleMqttBrokerConnection {
  private url: string;
  private clientId: string;
  private ws: WebSocket | null = null;
  private isConnected = false;
  private destroyed = false;
  private rxBuffer = new Uint8Array(0);
  private subscriptions = new Set<string>();
  private outboundQueue: { topic: string; payload: string }[] = [];
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private nextPacketId = 1;
  private onMessage: (topic: string, payload: string) => void;
  private onStatusChange: (connected: boolean) => void;

  constructor(
    url: string,
    clientId: string,
    onMessage: (topic: string, payload: string) => void,
    onStatusChange: (connected: boolean) => void
  ) {
    this.url = url;
    this.clientId = clientId;
    this.onMessage = onMessage;
    this.onStatusChange = onStatusChange;
    this.connect();
  }

  private connect() {
    if (this.destroyed || typeof WebSocket === 'undefined') return;
    try {
      const ws = new WebSocket(this.url, 'mqtt');
      ws.binaryType = 'arraybuffer';
      this.ws = ws;

      ws.onopen = () => {
        if (this.destroyed) {
          ws.close();
          return;
        }
        try {
          ws.send(buildMqttConnectPacket(this.clientId));
        } catch {}
      };

      ws.onmessage = (ev) => {
        if (this.destroyed || !(ev.data instanceof ArrayBuffer)) return;
        const incoming = new Uint8Array(ev.data);
        const merged = new Uint8Array(this.rxBuffer.length + incoming.length);
        merged.set(this.rxBuffer, 0);
        merged.set(incoming, this.rxBuffer.length);
        this.rxBuffer = merged;
        this.parseFrames();
      };

      ws.onclose = () => {
        this.cleanupTimers();
        if (this.isConnected) {
          this.isConnected = false;
          this.onStatusChange(false);
        }
        if (!this.destroyed) {
          this.reconnectTimer = setTimeout(() => this.connect(), 2500);
        }
      };

      ws.onerror = () => {
        // Handled by onclose
      };
    } catch {
      if (!this.destroyed) {
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
      }
    }
  }

  private parseFrames() {
    while (this.rxBuffer.length >= 2) {
      let multiplier = 1;
      let remLen = 0;
      let idx = 1;
      let encodedByte = 0;

      do {
        if (idx >= this.rxBuffer.length) return; // Wait for more bytes
        encodedByte = this.rxBuffer[idx++];
        remLen += (encodedByte & 127) * multiplier;
        multiplier *= 128;
        if (multiplier > 128 * 128 * 128) {
          // Malformed frame, reset buffer
          this.rxBuffer = new Uint8Array(0);
          return;
        }
      } while ((encodedByte & 128) !== 0);

      const totalPacketLen = idx + remLen;
      if (this.rxBuffer.length < totalPacketLen) return; // Wait for complete packet

      const packet = this.rxBuffer.slice(0, totalPacketLen);
      this.rxBuffer = this.rxBuffer.slice(totalPacketLen);

      const packetType = packet[0] & 0xf0;
      if (packetType === 0x20) {
        // CONNACK
        this.isConnected = true;
        this.onStatusChange(true);
        this.subscriptions.forEach((topic) => {
          this.sendSubscribeFrame(topic);
        });
        while (this.outboundQueue.length > 0) {
          const item = this.outboundQueue.shift()!;
          this.sendPublishFrame(item.topic, item.payload);
        }
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN && this.isConnected) {
            try {
              this.ws.send(MQTT_PINGREQ);
            } catch {}
          }
        }, 25000);
      } else if (packetType === 0x30) {
        // PUBLISH
        const qos = (packet[0] >> 1) & 0x03;
        let pos = idx;
        if (pos + 2 > packet.length) continue;
        const topicLen = (packet[pos] << 8) | packet[pos + 1];
        pos += 2;
        if (pos + topicLen > packet.length) continue;
        const topic = new TextDecoder().decode(packet.subarray(pos, pos + topicLen));
        pos += topicLen;
        if (qos > 0) {
          pos += 2; // Skip packet ID
        }
        if (pos <= packet.length) {
          const payloadStr = new TextDecoder().decode(packet.subarray(pos));
          this.onMessage(topic, payloadStr);
        }
      }
    }
  }

  private sendSubscribeFrame(topic: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.isConnected) return;
    try {
      const pid = (this.nextPacketId++ % 65000) + 1;
      this.ws.send(buildMqttSubscribePacket(topic, pid));
    } catch {}
  }

  private sendPublishFrame(topic: string, payload: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.isConnected) return;
    try {
      this.ws.send(buildMqttPublishPacket(topic, payload));
    } catch {}
  }

  public subscribe(topic: string) {
    this.subscriptions.add(topic);
    if (this.isConnected) {
      this.sendSubscribeFrame(topic);
    }
  }

  public publish(topic: string, payload: string) {
    if (this.isConnected) {
      this.sendPublishFrame(topic, payload);
    } else {
      if (this.outboundQueue.length > 50) this.outboundQueue.shift();
      this.outboundQueue.push({ topic, payload });
    }
  }

  public get connected(): boolean {
    return this.isConnected;
  }

  private cleanupTimers() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  public destroy() {
    this.destroyed = true;
    this.cleanupTimers();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
  }
}

/**
 * Multi-broker Cloud Relay + BroadcastChannel bridge.
 * Connects to multiple public WSS brokers in parallel and deduplicates messages by `msgId`.
 */
class CloudRoomRelay {
  private brokers: SingleMqttBrokerConnection[] = [];
  private bc: BroadcastChannel | null = null;
  private seenMsgIds = new Set<string>();
  private subscribedTopics = new Set<string>();
  private onMessageCallback: (topic: string, data: any) => void;
  private onConnectionChange?: (connected: boolean) => void;

  constructor(
    onMessage: (topic: string, data: any) => void,
    onConnectionChange?: (connected: boolean) => void
  ) {
    this.onMessageCallback = onMessage;
    this.onConnectionChange = onConnectionChange;

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.bc = new BroadcastChannel('grammar_casino_mp_relay_v1');
        this.bc.onmessage = (ev) => {
          if (ev.data && typeof ev.data.topic === 'string' && typeof ev.data.raw === 'string') {
            if (this.subscribedTopics.has(ev.data.topic)) {
              this.handleRawMessage(ev.data.topic, ev.data.raw);
            }
          }
        };
      } catch {}
    }

    const baseClientId = `gc_${Math.random().toString(36).slice(2, 10)}`;
    this.brokers = PUBLIC_WSS_BROKERS.map(
      (url, idx) =>
        new SingleMqttBrokerConnection(
          url,
          `${baseClientId}_${idx}`,
          (topic, raw) => this.handleRawMessage(topic, raw),
          () => this.emitConnectionStatus()
        )
    );
  }

  private emitConnectionStatus() {
    const anyConnected = this.brokers.some((b) => b.connected);
    this.onConnectionChange?.(anyConnected);
  }

  private handleRawMessage(topic: string, raw: string) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed._msgId) {
        if (this.seenMsgIds.has(parsed._msgId)) return;
        this.seenMsgIds.add(parsed._msgId);
        if (this.seenMsgIds.size > 2000) {
          const first = this.seenMsgIds.values().next().value;
          if (first) this.seenMsgIds.delete(first);
        }
      }
      this.onMessageCallback(topic, parsed);
    } catch {}
  }

  public subscribe(topic: string) {
    this.subscribedTopics.add(topic);
    this.brokers.forEach((b) => b.subscribe(topic));
  }

  public publish(topic: string, payload: Record<string, any>) {
    const msgWithId = {
      ...payload,
      _msgId: payload._msgId || generateToken('m'),
    };
    const raw = JSON.stringify(msgWithId);
    if (this.bc) {
      try {
        this.bc.postMessage({ topic, raw });
      } catch {}
    }
    this.brokers.forEach((b) => b.publish(topic, raw));
  }

  public get isConnected(): boolean {
    return this.brokers.some((b) => b.connected);
  }

  public destroy() {
    this.brokers.forEach((b) => b.destroy());
    this.brokers = [];
    if (this.bc) {
      try {
        this.bc.close();
      } catch {}
      this.bc = null;
    }
  }
}

// ============================================================================
// Teacher Host Room Controller (Cloud WSS Relay + Local Server Dual Engine)
// ============================================================================
export class HostRoomController {
  public code: string;
  public hostToken: string;
  private localServerAvailable: boolean;
  private ws: WebSocket | null = null;
  private cloudRelay: CloudRoomRelay;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private seenEventIds = new Set<string>();
  private latestViews: Record<number, PlayerViewPayload> = {};
  private onEventCallback: (event: HostEventPayload) => void;
  private onConnectionChange?: (connected: boolean) => void;
  private localWsConnected = false;

  // Authoritative Host Seat Registry (supports Cloud/Netlify + Local Server seamlessly)
  private roomLocked = false;
  private nextPlayerId = 101;
  private seatsByPlayerId = new Map<number, MultiplayerSeat>();

  constructor(
    code: string,
    hostToken: string,
    localServerAvailable: boolean,
    onEvent: (event: HostEventPayload) => void,
    onConnectionChange?: (connected: boolean) => void
  ) {
    this.code = code;
    this.hostToken = hostToken;
    this.localServerAvailable = localServerAvailable;
    this.onEventCallback = onEvent;
    this.onConnectionChange = onConnectionChange;

    this.cloudRelay = new CloudRoomRelay(
      (topic, msg) => this.handleCloudMessage(topic, msg),
      () => this.updateOverallConnectionStatus()
    );
    this.cloudRelay.subscribe(`${TOPIC_PREFIX}/${this.code}/to-host`);

    if (this.localServerAvailable) {
      this.connectLocalWs();
      this.startFallbackPolling();
    }
  }

  private updateOverallConnectionStatus() {
    const isOnline = this.localWsConnected || this.cloudRelay.isConnected;
    this.onConnectionChange?.(isOnline);
  }

  public static async createRoom(
    onEvent: (event: HostEventPayload) => void,
    onConnectionChange?: (connected: boolean) => void
  ): Promise<HostRoomController> {
    // Try local Express server first; if hosted statically on Netlify/Electron, fall back to Cloud Relay
    const res = await safeFetchJson<{ code: string; hostToken: string }>('/api/mp/room/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

    // Static host (Netlify / Electron / GitHub Pages) -> generate room code directly in Host browser
    const generatedCode = generateRoomCode();
    const generatedToken = generateToken('host');
    return new HostRoomController(
      generatedCode,
      generatedToken,
      false,
      onEvent,
      onConnectionChange
    );
  }

  private handleCloudMessage(_topic: string, msg: any) {
    if (this.destroyed || !msg || typeof msg.type !== 'string') return;

    if (msg.type === 'CLOUD_JOIN_REQUEST') {
      const clientId = String(msg.clientId || '');
      const cleanName = String(msg.name || '').trim().slice(0, 20);
      const avatar = String(msg.avatar || '🦊');
      const reconnectToken = String(msg.reconnectToken || '').trim();
      const replyTopic = `${TOPIC_PREFIX}/${this.code}/to-client/${clientId}`;

      if (!clientId || !cleanName) return;

      // 1. Check reconnect by token or by existing seat name
      let existingSeat: MultiplayerSeat | undefined;
      if (reconnectToken) {
        for (const s of this.seatsByPlayerId.values()) {
          if (s.reconnectToken === reconnectToken) {
            existingSeat = s;
            break;
          }
        }
      }
      if (!existingSeat) {
        for (const s of this.seatsByPlayerId.values()) {
          if (s.name.toLowerCase() === cleanName.toLowerCase()) {
            existingSeat = s;
            break;
          }
        }
      }

      if (existingSeat) {
        existingSeat.connected = true;
        existingSeat.lastSeen = Date.now();
        if (cleanName) existingSeat.name = cleanName;
        if (avatar) existingSeat.avatar = avatar;

        this.handleIncomingEvent({
          id: `cloud_reconn_${existingSeat.playerId}_${msg.requestId || Date.now()}`,
          type: 'STUDENT_RECONNECTED',
          seat: { ...existingSeat },
          playerId: existingSeat.playerId,
          timestamp: Date.now(),
        });

        this.cloudRelay.publish(replyTopic, {
          type: 'CLOUD_JOIN_RESPONSE',
          ok: true,
          code: this.code,
          seat: existingSeat,
          view: this.latestViews[existingSeat.playerId] || null,
        });
        return;
      }

      if (this.roomLocked) {
        this.cloudRelay.publish(replyTopic, {
          type: 'CLOUD_JOIN_RESPONSE',
          ok: false,
          error: 'This room is locked by the teacher.',
        });
        return;
      }

      const playerId = this.nextPlayerId++;
      const newSeat: MultiplayerSeat = {
        seatId: `seat_${playerId}`,
        playerId,
        name: cleanName,
        avatar,
        reconnectToken: generateToken('seat'),
        connected: true,
        lockedIn: false,
        lastSeen: Date.now(),
      };
      this.seatsByPlayerId.set(playerId, newSeat);

      this.handleIncomingEvent({
        id: `cloud_join_${playerId}_${msg.requestId || Date.now()}`,
        type: 'STUDENT_JOINED',
        seat: { ...newSeat },
        playerId,
        timestamp: Date.now(),
      });

      this.cloudRelay.publish(replyTopic, {
        type: 'CLOUD_JOIN_RESPONSE',
        ok: true,
        code: this.code,
        seat: newSeat,
        view: this.latestViews[playerId] || null,
      });
    } else if (msg.type === 'CLOUD_STUDENT_INTENT') {
      const playerId = Number(msg.playerId);
      const token = String(msg.reconnectToken || '');
      const intent = msg.intent as StudentIntent;
      if (!playerId || !intent) return;

      const seat = this.seatsByPlayerId.get(playerId);
      if (seat && seat.reconnectToken !== token) return;
      if (seat) {
        seat.connected = true;
        seat.lastSeen = Date.now();
        if (intent.type === 'LOCK_IN') {
          seat.lockedIn = Boolean(intent.locked);
        }
      }

      this.handleIncomingEvent({
        id: msg.intentId || generateToken('ev'),
        type: 'STUDENT_INTENT',
        playerId,
        intent,
        timestamp: Date.now(),
      });
    } else if (msg.type === 'CLOUD_SYNC_VIEW_REQUEST') {
      const playerId = Number(msg.playerId);
      const token = String(msg.reconnectToken || '');
      const seat = this.seatsByPlayerId.get(playerId);
      if (seat && seat.reconnectToken && seat.reconnectToken !== token) {
        this.cloudRelay.publish(`${TOPIC_PREFIX}/${this.code}/view/${playerId}`, {
          type: 'KICKED',
          playerId,
        });
        return;
      }
      if (seat) {
        seat.connected = true;
        seat.lastSeen = Date.now();
      }
      const view = this.latestViews[playerId];
      if (view) {
        this.cloudRelay.publish(`${TOPIC_PREFIX}/${this.code}/view/${playerId}`, {
          type: 'PLAYER_VIEW',
          playerId,
          view,
        });
      }
    }
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
        // Handled by onclose + HTTP/Cloud fallback
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

    // 1. Always broadcast each player's view over the Cloud WSS Relay (supports Netlify & cross-domain phones)
    Object.entries(views).forEach(([pidStr, view]) => {
      const pid = Number(pidStr);
      this.cloudRelay.publish(`${TOPIC_PREFIX}/${this.code}/view/${pid}`, {
        type: 'PLAYER_VIEW',
        playerId: pid,
        view,
      });
    });

    // 2. Also push to local server if available
    if (!this.localServerAvailable) return;

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
    if (this.localServerAvailable) {
      await this.syncHttp({ locked });
    }
  }

  public async kickPlayer(playerId: number) {
    this.seatsByPlayerId.delete(playerId);
    delete this.latestViews[playerId];
    this.cloudRelay.publish(`${TOPIC_PREFIX}/${this.code}/view/${playerId}`, {
      type: 'KICKED',
      playerId,
    });
    if (this.localServerAvailable) {
      await this.syncHttp({ kickPlayerId: playerId });
    }
  }

  public async resetAllLocks() {
    for (const seat of this.seatsByPlayerId.values()) {
      seat.lockedIn = false;
    }
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

  public destroy() {
    this.destroyed = true;
    this.cloudRelay.destroy();
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
// Student Device Room Controller (Cloud WSS Relay + Local Server Fallback)
// ============================================================================
export class StudentRoomController {
  public code: string;
  public seat: MultiplayerSeat;
  private localServerAvailable: boolean;
  private ws: WebSocket | null = null;
  private cloudRelay: CloudRoomRelay;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private localWsConnected = false;
  private onViewUpdate: (view: PlayerViewPayload) => void;
  private onKicked: () => void;
  private onConnectionChange?: (connected: boolean) => void;

  constructor(
    code: string,
    seat: MultiplayerSeat,
    initialView: PlayerViewPayload | null,
    localServerAvailable: boolean,
    cloudRelay: CloudRoomRelay,
    onViewUpdate: (view: PlayerViewPayload) => void,
    onKicked: () => void,
    onConnectionChange?: (connected: boolean) => void
  ) {
    this.code = code;
    this.seat = seat;
    this.localServerAvailable = localServerAvailable;
    this.cloudRelay = cloudRelay;
    this.onViewUpdate = onViewUpdate;
    this.onKicked = onKicked;
    this.onConnectionChange = onConnectionChange;

    // Subscribe to per-seat Cloud Relay view updates
    this.cloudRelay.subscribe(`${TOPIC_PREFIX}/${this.code}/view/${this.seat.playerId}`);

    if (initialView) {
      setTimeout(() => this.onViewUpdate(initialView), 0);
    } else {
      // Request immediate view sync from Host over Cloud Relay
      this.requestCloudViewSync();
    }

    if (this.localServerAvailable) {
      this.connectLocalWs();
    }
    this.startFallbackPolling();
    setTimeout(() => this.updateOverallConnectionStatus(), 50);
  }

  private updateOverallConnectionStatus() {
    const isOnline = this.localWsConnected || this.cloudRelay.isConnected;
    this.onConnectionChange?.(isOnline);
  }

  private requestCloudViewSync() {
    if (this.destroyed) return;
    this.cloudRelay.publish(`${TOPIC_PREFIX}/${this.code}/to-host`, {
      type: 'CLOUD_SYNC_VIEW_REQUEST',
      playerId: this.seat.playerId,
      reconnectToken: this.seat.reconnectToken,
    });
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
    const cleanCode = params.code.trim().toUpperCase();
    const cleanName = params.name.trim();
    const avatar = params.avatar;
    const reconnectToken = params.reconnectToken || '';

    // Establish Cloud WSS Relay immediately so we can join either via local server or Cloud Relay (Netlify)
    let studentControllerRef: StudentRoomController | null = null;
    let joinResolved = false;

    const clientId = generateToken('stu');
    const requestId = generateToken('req');
    const replyTopic = `${TOPIC_PREFIX}/${cleanCode}/to-client/${clientId}`;

    let resolveCloudJoin: ((val: { seat: MultiplayerSeat; view: PlayerViewPayload | null }) => void) | null = null;
    let rejectCloudJoin: ((err: Error) => void) | null = null;

    const cloudJoinPromise = new Promise<{ seat: MultiplayerSeat; view: PlayerViewPayload | null }>(
      (resolve, reject) => {
        resolveCloudJoin = resolve;
        rejectCloudJoin = reject;
      }
    );

    const cloudRelay = new CloudRoomRelay(
      (topic, msg) => {
        if (!msg || typeof msg.type !== 'string') return;
        if (topic === replyTopic && msg.type === 'CLOUD_JOIN_RESPONSE' && !joinResolved) {
          if (msg.ok && msg.seat) {
            resolveCloudJoin?.({ seat: msg.seat, view: msg.view || null });
          } else {
            rejectCloudJoin?.(new Error(msg.error || 'Could not join room.'));
          }
          return;
        }
        if (studentControllerRef) {
          studentControllerRef.handleCloudMessage(msg);
        }
      },
      () => {
        studentControllerRef?.updateOverallConnectionStatus();
      }
    );

    cloudRelay.subscribe(replyTopic);

    const sendCloudJoinRequest = () => {
      if (joinResolved) return;
      cloudRelay.publish(`${TOPIC_PREFIX}/${cleanCode}/to-host`, {
        type: 'CLOUD_JOIN_REQUEST',
        clientId,
        requestId,
        name: cleanName,
        avatar,
        reconnectToken,
      });
    };

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
        reconnectToken,
      }),
    });

    if (localRes.isJson && localRes.ok && localRes.data?.seat) {
      joinResolved = true;
      studentControllerRef = new StudentRoomController(
        localRes.data.code || cleanCode,
        localRes.data.seat,
        localRes.data.view || null,
        true,
        cloudRelay,
        params.onViewUpdate,
        params.onKicked,
        params.onConnectionChange
      );
      return studentControllerRef;
    }

    // If local server returned a specific JSON error other than 404 (e.g., 403 Room is locked), surface it immediately
    if (localRes.isJson && !localRes.ok && localRes.status !== 404 && localRes.data?.error) {
      cloudRelay.destroy();
      throw new Error(localRes.data.error);
    }

    // 2. Otherwise (e.g., hosted on Netlify where /api/mp/room/join returns HTML, or cross-domain join),
    // join via the Cloud WSS Relay!
    sendCloudJoinRequest();
    const retryInterval = setInterval(sendCloudJoinRequest, 900);

    try {
      const cloudResult = await Promise.race([
        cloudJoinPromise,
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  `Room "${cleanCode}" was not found or the Host table is offline. Please verify the 4-letter code on the projector.`
                )
              ),
            7500
          )
        ),
      ]);

      clearInterval(retryInterval);
      joinResolved = true;

      studentControllerRef = new StudentRoomController(
        cleanCode,
        cloudResult.seat,
        cloudResult.view,
        false,
        cloudRelay,
        params.onViewUpdate,
        params.onKicked,
        params.onConnectionChange
      );
      return studentControllerRef;
    } catch (err) {
      clearInterval(retryInterval);
      joinResolved = true;
      cloudRelay.destroy();
      throw err;
    }
  }

  public handleCloudMessage(msg: any) {
    if (this.destroyed || !msg) return;
    if (msg.type === 'PLAYER_VIEW' && msg.view) {
      this.onViewUpdate(msg.view);
    } else if (msg.type === 'KICKED') {
      this.onKicked();
      this.destroy();
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
        this.localWsConnected = false;
        this.updateOverallConnectionStatus();
        if (!this.destroyed && this.localServerAvailable) {
          this.reconnectTimer = setTimeout(() => this.connectLocalWs(), 2000);
        }
      };

      ws.onerror = () => {
        // Cloud Relay + HTTP fallback handle continuity
      };
    } catch {
      if (!this.destroyed && this.localServerAvailable) {
        this.reconnectTimer = setTimeout(() => this.connectLocalWs(), 2500);
      }
    }
  }

  private startFallbackPolling() {
    this.pollTimer = setInterval(async () => {
      if (this.destroyed) return;

      // Always send a lightweight heartbeat / view sync over Cloud Relay if local WS is not open
      const wsOpen = this.ws && this.ws.readyState === WebSocket.OPEN;
      if (!wsOpen) {
        this.requestCloudViewSync();
      }

      if (!this.localServerAvailable || wsOpen) return;

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
        this.onViewUpdate(res.data.view);
      }
    }, 2500);
  }

  public async sendIntent(intent: StudentIntent) {
    if (this.destroyed) return;
    const intentId = generateToken('int');

    // 1. Always publish intent over Cloud WSS Relay (instant delivery on Netlify & cross-domain)
    this.cloudRelay.publish(`${TOPIC_PREFIX}/${this.code}/to-host`, {
      type: 'CLOUD_STUDENT_INTENT',
      intentId,
      playerId: this.seat.playerId,
      reconnectToken: this.seat.reconnectToken,
      intent,
    });

    // 2. Also send via local server if available
    if (!this.localServerAvailable) return;

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

    await safeFetchJson<{ view?: PlayerViewPayload }>(`/api/mp/room/${this.code}/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: this.seat.playerId,
        reconnectToken: this.seat.reconnectToken,
        intent,
      }),
    });
  }

  public destroy() {
    this.destroyed = true;
    this.cloudRelay.destroy();
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
    }
  }
}
