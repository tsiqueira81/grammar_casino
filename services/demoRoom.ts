// Package T7: "Demo with bots". A live room that never leaves this computer: twelve simulated
// students join, bet on every hand and answer "Got it" after the reveal, so a teacher can try a
// room alone before class. Nothing goes to Firestore or the dev server, and the room is not saved.
import type { MultiplayerSeat, PlayerViewPayload, StudentIntent } from '../utils/multiplayerProtocol';
import type { HostEventPayload } from './multiplayerService';
import { DEMO_BOT_COUNT, botHandKey, demoBotSeats, randomBotBet, shouldBotBet, type Rand } from '../game/demoBots';

/** What the teacher's screen needs from a room, live or demo. */
export interface HostRoomLike {
  code: string;
  pushViews(views: Record<number, PlayerViewPayload>): void | Promise<void>;
  setRoomLocked(locked: boolean): void | Promise<void>;
  kickPlayer(playerId: number): void | Promise<void>;
  answerSeatTakeover(clientId: string, allow: boolean): void;
  detach(): void;
  destroy(): void;
}

export const DEMO_ROOM_CODE = 'DEMO';
/** Bots join one by one, this far apart, so the lobby fills visibly. */
export const DEMO_JOIN_GAP_MS = 300;
/** A bot "thinks" for this long before it bets. */
export const DEMO_THINK_MS = { min: 1500, spread: 6000 };
const HEARTBEAT_MS = 15_000;

export class DemoRoomController implements HostRoomLike {
  public code = DEMO_ROOM_CODE;
  private seats = new Map<number, MultiplayerSeat>();
  private betFor = new Map<number, string>();
  private feedbackFor = new Map<number, number>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private seq = 0;
  private destroyed = false;

  constructor(
    private onEvent: (event: HostEventPayload) => void,
    count = DEMO_BOT_COUNT,
    private rand: Rand = Math.random,
  ) {
    demoBotSeats(count).forEach((seat, i) => {
      this.later(200 + i * DEMO_JOIN_GAP_MS, () => {
        this.seats.set(seat.playerId, seat);
        this.emit({ type: 'STUDENT_JOINED', seat, playerId: seat.playerId });
      });
    });
    // Real phones say "still here" every 20 s (package R2); bots do too, so none shows as away.
    this.heartbeat = setInterval(() => {
      for (const id of this.seats.keys()) this.intent(id, { type: 'HEARTBEAT' });
    }, HEARTBEAT_MS);
  }

  /** Every bot reads its view: it bets once a hand, and answers the feedback question once a reveal. */
  pushViews(views: Record<number, PlayerViewPayload>): void {
    if (this.destroyed) return;
    for (const [key, view] of Object.entries(views)) {
      const id = Number(key);
      if (!this.seats.has(id) || !view) continue;
      const hand = botHandKey(view);
      if (shouldBotBet(view) && this.betFor.get(id) !== hand) {
        this.betFor.set(id, hand);
        const bet = randomBotBet(view, this.rand);
        this.later(DEMO_THINK_MS.min + this.rand() * DEMO_THINK_MS.spread, () => {
          this.intent(id, { type: 'SET_FULL_BET', bet });
          this.intent(id, { type: 'LOCK_IN', locked: true, bet });
        });
      }
      if (view.step === 'RESULTS' && view.round > 0 && this.feedbackFor.get(id) !== view.round) {
        this.feedbackFor.set(id, view.round);
        const round = view.round;
        const value = this.rand() < 0.7 ? 'gotIt' : 'confused';
        this.later(2500 + this.rand() * 4000, () => this.intent(id, { type: 'FEEDBACK_REACTION', round, value }));
      }
    }
  }

  setRoomLocked(): void {
    // Bots are already seated; nobody else can join a demo room.
  }

  kickPlayer(playerId: number): void {
    this.seats.delete(playerId);
  }

  answerSeatTakeover(): void {
    // No phone can ask for a bot's seat.
  }

  detach(): void {
    this.destroy();
  }

  destroy(): void {
    this.destroyed = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  private later(ms: number, fn: () => void) {
    if (this.destroyed) return;
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (!this.destroyed) fn();
    }, ms);
    this.timers.add(t);
  }

  private intent(playerId: number, intent: StudentIntent) {
    if (!this.seats.has(playerId)) return;
    this.emit({ type: 'STUDENT_INTENT', playerId, intent });
  }

  private emit(event: Omit<HostEventPayload, 'id' | 'timestamp'>) {
    if (this.destroyed) return;
    this.onEvent({ ...event, id: `demo-${++this.seq}`, timestamp: Date.now() });
  }
}
