// Package T7: simulated students for "Demo with bots", so a teacher can try a live room alone
// before class. The same betting rule drives scripts/bots.ts on the dev server.
import type { MultiplayerSeat } from '../utils/multiplayerProtocol';
import type { Bet } from '../types';

export const DEMO_BOT_COUNT = 12;
export const DEMO_BOT_NAMES = [
  'Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Felipe', 'Gabi', 'Hugo', 'Isis', 'Joel', 'Lara', 'Mateus',
  'Nina', 'Otto', 'Paula', 'Rafa', 'Sara', 'Theo', 'Vera', 'Yuri',
];

/** What a bot reads from its phone view. */
export interface BotView {
  step?: string;
  round?: number;
  lockedIn?: boolean;
  isFrozen?: boolean;
  isLoadingSentence?: boolean;
  me?: { money: number };
  minBetAmount?: number;
  isBetCapped?: boolean;
  betCapAmount?: number;
  sentence?: { text?: string; questionType?: string; options?: string[]; baseWord?: string } | null;
}

export type Rand = () => number;

const pick = <T>(items: T[], rand: Rand): T => items[Math.min(items.length - 1, Math.floor(rand() * items.length))];

/** The seats of `count` bots, player ids from 101 as in a real room. */
export function demoBotSeats(count = DEMO_BOT_COUNT, now = Date.now()): MultiplayerSeat[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => ({
    seatId: `demo-seat-${i + 1}`,
    playerId: 101 + i,
    name: DEMO_BOT_NAMES[i % DEMO_BOT_NAMES.length] + (i >= DEMO_BOT_NAMES.length ? ` ${Math.floor(i / DEMO_BOT_NAMES.length) + 1}` : ''),
    avatar: '',
    reconnectToken: `demo-${i + 1}`,
    connected: true,
    lockedIn: false,
    lastSeen: now,
  }));
}

/** One key per hand, so a bot bets once a hand. */
export function botHandKey(view: BotView): string {
  return `${view.round ?? ''}|${view.sentence?.text ?? ''}`;
}

/** Whether a bot should bet now: a hand is open, it has not locked in, and it has money. */
export function shouldBotBet(view: BotView): boolean {
  return (
    view.step === 'IN_GAME' &&
    !view.isLoadingSentence &&
    !!view.sentence?.text &&
    !view.lockedIn &&
    !view.isFrozen &&
    (view.me?.money ?? 0) > 0
  );
}

/** A random but valid stake: steps of $10, between the table minimum and the cap. */
export function botStake(view: BotView, rand: Rand): number {
  const money = Math.max(0, Math.floor(view.me?.money ?? 0));
  const cap = view.isBetCapped && view.betCapAmount ? Math.min(money, view.betCapAmount) : money;
  const min = Math.min(cap, Math.max(1, view.minBetAmount ?? 1));
  const wish = 10 * (1 + Math.floor(rand() * 20));
  return Math.max(min, Math.min(cap, wish));
}

/** A random but valid bet for the hand's question type. */
export function randomBotBet(view: BotView, rand: Rand = Math.random): Partial<Bet> {
  const bet = botStake(view, rand);
  const s = view.sentence || {};
  switch (s.questionType) {
    case 'multipleChoice':
      return { bet, selectedOption: pick(s.options?.length ? s.options : ['A'], rand) };
    case 'openCloze':
      return { bet, clozeAnswer: pick(['in', 'on', 'at', 'the', 'have', 'been'], rand) };
    case 'wordFormation':
      return { bet, clozeAnswer: pick(['success', 'successful', 'happiness', 'quickly'], rand) };
    case 'keyWordTransformation': {
      const key = (s.baseWord || 'for').toLowerCase();
      return { bet, clozeAnswer: pick([`have been here ${key}`, `had ${key} a while`], rand) };
    }
    default:
      return { bet, opinion: rand() < 0.5 ? 'correct' : 'incorrect' };
  }
}
