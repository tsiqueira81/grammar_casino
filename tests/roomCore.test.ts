import { describe, expect, it } from 'vitest';
import {
  MAX_STUDENT_SOCKETS,
  RoomCore,
  ROOM_CLAIM_IDLE_MS,
  SOCKET_BURST,
  attachmentFromQuery,
  isHosted,
  mayClaim,
  sha256Hex,
  type RoomAttachment,
  type RoomSocket,
} from '../room-worker/roomCore';
import { chosenHostTransport, reconnectDelay } from '../services/roomBackend';

class FakeSocket implements RoomSocket {
  sent: any[] = [];
  closed: { code?: number; reason?: string } | null = null;
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close(code?: number, reason?: string) {
    this.closed = { code, reason };
  }
  last(t: string) {
    return [...this.sent].reverse().find((m) => m.t === t);
  }
}

function makeRoom() {
  const sockets: Array<{ socket: FakeSocket; att: RoomAttachment }> = [];
  let now = 1_000_000;
  const core = new RoomCore({ sockets: () => sockets, now: () => now });
  const join = (att: RoomAttachment) => {
    const socket = new FakeSocket();
    sockets.push({ socket, att });
    core.open(socket, att);
    return socket;
  };
  return { core, join, tick: (ms: number) => (now += ms), sockets };
}

const write = (seats: any[] = [], rev = 1) =>
  JSON.stringify({
    t: 'write',
    room: { code: 'ABCD', locked: false, rev, tableJson: '{"step":"IN_GAME"}', seatRevs: { 101: rev }, kickedPlayerIds: [] },
    seats,
  });

describe('room relay rules (package R4)', () => {
  it('a phone gets the room record and only its own seat record', () => {
    const { core, join } = makeRoom();
    const host = join({ role: 'host' });
    const ana = join({ role: 'student', clientId: 'stu_ana123' });
    const ben = join({ role: 'student', clientId: 'stu_ben123' });
    core.message(host, { role: 'host' }, write([{ clientId: 'stu_ana123', uid: 'd:x', playerId: 101, viewJson: '{"me":1}', joinJson: '' }]));
    expect(ana.last('seat').seat.viewJson).toBe('{"me":1}');
    expect(ana.last('room').room.tableJson).toBe('{"step":"IN_GAME"}');
    expect(ben.sent.filter((m) => m.t === 'seat' && m.seat)).toHaveLength(0);
    expect(ben.last('room').room.rev).toBe(1);
  });

  it("a phone's intents reach only the host, under the identity it opened with", () => {
    const { core, join } = makeRoom();
    const host = join({ role: 'host' });
    const ana = join({ role: 'student', clientId: 'stu_ana123', deviceId: 'dev_phone1' });
    const ben = join({ role: 'student', clientId: 'stu_ben123' });
    core.message(ana, { role: 'student', clientId: 'stu_ana123', deviceId: 'dev_phone1' }, JSON.stringify({ t: 'intent', type: 'STUDENT_INTENT', payloadJson: '{"x":1}', clientId: 'stu_ben123' }));
    const got = host.last('intent');
    expect(got.clientId).toBe('stu_ana123');
    expect(got.uid).toBe('d:dev_phone1');
    expect(ben.sent.some((m) => m.t === 'intent')).toBe(false);
  });

  it('a host that reconnects gets every intent the room holds', () => {
    const { core, join } = makeRoom();
    const ana = join({ role: 'student', clientId: 'stu_ana123' });
    core.message(ana, { role: 'student', clientId: 'stu_ana123' }, JSON.stringify({ t: 'intent', type: 'JOIN_REQUEST', payloadJson: '{"j":1}' }));
    const host = join({ role: 'host' });
    expect(host.last('intent').payloadJson).toBe('{"j":1}');
  });

  it('an empty room (after sleeping) asks the host to send everything again', () => {
    const { join } = makeRoom();
    const host = join({ role: 'host' });
    expect(host.last('resync')).toBeTruthy();
  });

  it('a newer teacher screen replaces the older one', () => {
    const { join } = makeRoom();
    const first = join({ role: 'host' });
    join({ role: 'host' });
    expect(first.closed?.code).toBe(4001);
  });

  it('a full room refuses more phones', () => {
    const { join } = makeRoom();
    for (let i = 0; i < MAX_STUDENT_SOCKETS; i++) join({ role: 'student', clientId: `stu_${String(i).padStart(6, '0')}` });
    const extra = join({ role: 'student', clientId: 'stu_toomany' });
    expect(extra.closed?.code).toBe(4002);
  });

  it('a phone that floods the room is slowed down', () => {
    const { core, join } = makeRoom();
    const att: RoomAttachment = { role: 'student', clientId: 'stu_ana123' };
    const ana = join(att);
    const msg = JSON.stringify({ t: 'intent', type: 'STUDENT_INTENT', payloadJson: '{}' });
    const results = Array.from({ length: SOCKET_BURST + 5 }, () => core.message(ana, att, msg));
    expect(results.filter(Boolean)).toHaveLength(SOCKET_BURST);
  });

  it('closing the room clears it and tells the phones', () => {
    const { core, join } = makeRoom();
    const host = join({ role: 'host' });
    const ana = join({ role: 'student', clientId: 'stu_ana123' });
    core.message(host, { role: 'host' }, write());
    core.message(host, { role: 'host' }, JSON.stringify({ t: 'close' }));
    expect(ana.last('room').room).toBeNull();
    expect(core.room).toBeNull();
  });

  it('refuses bad messages and oversized records', () => {
    const { core, join } = makeRoom();
    const host = join({ role: 'host' });
    expect(core.message(host, { role: 'host' }, 'not json')).toBe(false);
    const big = JSON.stringify({ t: 'write', room: { code: 'ABCD', tableJson: 'x'.repeat(700_000) } });
    expect(core.message(host, { role: 'host' }, big)).toBe(false);
  });
});

describe('room claims (package R4)', () => {
  it('a code is free, kept by its own host, and freed after six idle hours', async () => {
    const a = await sha256Hex('host_token_a');
    const b = await sha256Hex('host_token_b');
    expect(mayClaim(null, a, 0)).toBe(true);
    const claim = { tokenHash: a, lastActive: 0 };
    expect(mayClaim(claim, a, 10)).toBe(true);
    expect(mayClaim(claim, b, 10)).toBe(false);
    expect(mayClaim(claim, b, ROOM_CLAIM_IDLE_MS + 1)).toBe(true);
    expect(isHosted(claim, 10)).toBe(true);
    expect(isHosted(claim, ROOM_CLAIM_IDLE_MS + 1)).toBe(false);
  });

  it('only well-formed sockets get in', () => {
    expect(attachmentFromQuery(new URLSearchParams('role=host&token=short'))).toBeNull();
    expect(attachmentFromQuery(new URLSearchParams('role=host&token=host_abcdefgh'))?.att.role).toBe('host');
    expect(attachmentFromQuery(new URLSearchParams('role=student&client=bad id'))).toBeNull();
    expect(attachmentFromQuery(new URLSearchParams('role=student&client=stu_ana123&device=dev_1234567'))?.att.deviceId).toBe('dev_1234567');
    expect(attachmentFromQuery(new URLSearchParams('role=admin'))).toBeNull();
  });
});

describe('transport choice and reconnects (package R4)', () => {
  it('Firestore unless asked for the Cloudflare room', () => {
    expect(chosenHostTransport('')).toBe('firestore');
    expect(chosenHostTransport('?transport=do')).toBe('do');
    expect(chosenHostTransport('?transport=firestore')).toBe('firestore');
    expect(chosenHostTransport('?transport=other')).toBe('firestore');
  });

  it('reconnects back off from half a second to eight, with jitter', () => {
    expect(reconnectDelay(0, () => 0)).toBe(250);
    expect(reconnectDelay(0, () => 1)).toBe(500);
    expect(reconnectDelay(10, () => 1)).toBe(8000);
    expect(reconnectDelay(10, () => 0)).toBe(4000);
  });
});
