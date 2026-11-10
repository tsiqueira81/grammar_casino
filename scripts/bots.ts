/**
 * Simulated students for load checks and demos (package F3).
 *
 * Joins N bots to a room on the local dev server's relay and has each one bet
 * at random and lock in on every hand. It talks to /api/mp/* only, so it works
 * against `npm run dev`, never against the live site's Firestore rooms.
 *
 * Usage:
 *   npx tsx scripts/bots.ts <ROOM> [count=10] [baseUrl=http://localhost:3000]
 *
 * Open a room on the teacher screen first (with ?e2e=1 in the address on the
 * dev server, or with a teacher PIN), then run the script with its code.
 */

type Seat = { playerId: number; reconnectToken: string; name: string };
type View = {
  step?: string;
  lockedIn?: boolean;
  me?: { money: number };
  sentence?: { text?: string; questionType?: string; options?: string[]; baseWord?: string } | null;
  roundNumber?: number;
  currentRound?: number;
};

const [, , rawCode, rawCount, rawBase] = process.argv;
if (!rawCode) {
  console.error('Usage: npx tsx scripts/bots.ts <ROOM> [count=10] [baseUrl=http://localhost:3000]');
  process.exit(1);
}
const CODE = rawCode.trim().toUpperCase();
const COUNT = Math.max(1, Math.min(60, Number(rawCount) || 10));
const BASE = (rawBase || 'http://localhost:3000').replace(/\/$/, '');
const POLL_MS = 1000;

const pick = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)];
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status} on ${path}`);
  return data as T;
}

async function getView(seat: Seat): Promise<View | null> {
  const url = `${BASE}/api/mp/room/${CODE}/view?playerId=${seat.playerId}&token=${encodeURIComponent(seat.reconnectToken)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} reading the view`);
  const data = (await res.json()) as { view: View | null };
  return data.view;
}

/** A random but valid bet for the hand's question type. */
function randomBet(view: View): Record<string, unknown> {
  const money = view.me?.money ?? 0;
  const amount = Math.max(1, Math.min(money, 10 * (1 + Math.floor(Math.random() * 20))));
  const s = view.sentence || {};
  switch (s.questionType) {
    case 'multipleChoice':
      return { bet: amount, selectedOption: pick(s.options?.length ? s.options : ['A']) };
    case 'openCloze':
      return { bet: amount, clozeAnswer: pick(['in', 'on', 'at', 'the', 'have', 'been']) };
    case 'wordFormation':
      return { bet: amount, clozeAnswer: pick(['success', 'successful', 'happiness', 'quickly']) };
    case 'keyWordTransformation': {
      const key = (s.baseWord || 'for').toLowerCase();
      return { bet: amount, clozeAnswer: pick([`have been here ${key}`, `had ${key} a while`]) };
    }
    default:
      return { bet: amount, opinion: Math.random() < 0.5 ? 'correct' : 'incorrect' };
  }
}

async function runBot(index: number) {
  const name = `Bot ${String(index + 1).padStart(2, '0')}`;
  const joined = await post<{ seat: Seat }>('/api/mp/room/join', { code: CODE, name, avatar: '🤖' });
  const seat = joined.seat;
  console.log(`${name} joined as player ${seat.playerId}`);

  let lastHandKey = '';
  let intentSeq = 0;
  const send = (intent: Record<string, unknown>) =>
    post(`/api/mp/room/${CODE}/intent`, {
      playerId: seat.playerId,
      reconnectToken: seat.reconnectToken,
      intent,
      intentId: `bot-${seat.playerId}-${++intentSeq}-${Date.now()}`,
    });

  for (;;) {
    try {
      const view = await getView(seat);
      const handKey = `${view?.currentRound ?? view?.roundNumber ?? ''}|${view?.sentence?.text ?? ''}`;
      if (view?.step === 'IN_GAME' && view.sentence?.text && !view.lockedIn && handKey !== lastHandKey && (view.me?.money ?? 0) > 0) {
        lastHandKey = handKey;
        // Think for a moment, like a student would.
        await sleep(500 + Math.random() * 4000);
        const bet = randomBet(view);
        await send({ type: 'SET_FULL_BET', bet });
        await send({ type: 'LOCK_IN', locked: true, bet });
        console.log(`${name} locked in ${JSON.stringify(bet)}`);
      }
    } catch (err) {
      console.warn(`${name}: ${(err as Error).message}`);
    }
    await sleep(POLL_MS);
  }
}

console.log(`Joining ${COUNT} bots to room ${CODE} on ${BASE}. Press Ctrl+C to stop.`);
for (let i = 0; i < COUNT; i++) {
  void runBot(i).catch(err => console.error(`Bot ${i + 1} could not join: ${(err as Error).message}`));
}
