// Package T3: the teacher's phone as a remote. The phone joins the room like a student, but with
// a one-time key the teacher's screen made (sent as its "avatar", which only the host sees). The
// host then treats that seat as the remote: it is never a player, it gets its own private view
// (the answer, who has not locked in, who is away, "still confused"), and its buttons press the
// same buttons as the keyboard shortcuts (package T2), so it can do nothing the screen does not
// offer at that moment.
import type { GeneratedSentence } from '../types';
import type { HotkeyAction } from '../utils/hotkeys';
import { isOptionType } from './questionTypes';

export const REMOTE_AVATAR_PREFIX = 'remote:';
export const REMOTE_NAME = 'Teacher remote';
export const REMOTE_STORAGE_KEY = 'grammar_casino_remote_v1';

/** What the remote may ask for: the same actions as the keyboard shortcuts. */
export const REMOTE_ACTIONS = ['primary', 'pause', 'swap', 'reveal-now', 'undo-reveal', 'timer', 'add-time', 'read'] as const;
export type RemoteAction = (typeof REMOTE_ACTIONS)[number] & HotkeyAction;

export function isRemoteAction(a: unknown): a is RemoteAction {
  return typeof a === 'string' && (REMOTE_ACTIONS as readonly string[]).includes(a);
}

export function isRemoteAvatar(avatar: string | undefined | null): boolean {
  return typeof avatar === 'string' && avatar.startsWith(REMOTE_AVATAR_PREFIX);
}

export function remoteAvatar(key: string): string {
  return `${REMOTE_AVATAR_PREFIX}${key}`;
}

/** A new one-time key: 16 random hex characters. */
export function newRemoteKey(rand: (n: number) => Uint8Array = defaultRandom): string {
  return Array.from(rand(8), (b) => b.toString(16).padStart(2, '0')).join('');
}

function defaultRandom(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/** The link the remote phone opens. */
export function remoteLink(origin: string, code: string, key: string): string {
  const base = origin.replace(/\/+$/, '');
  return `${base}/?room=${encodeURIComponent(code)}&remote=${encodeURIComponent(key)}`;
}

/** The right answer in words, for the teacher only. */
export function answerForTeacher(s: GeneratedSentence | null | undefined): string | null {
  if (!s) return null;
  const type = s.questionType || 'binary';
  if (type === 'binary') return s.isCorrect ? 'Valid' : `Flawed. Correct: ${s.correction || ''}`.trim();
  if (isOptionType(type)) {
    const i = (s.options || []).findIndex((o) => o.trim().toLowerCase() === (s.correctAnswer || '').trim().toLowerCase());
    return i >= 0 ? `${'ABCD'[i]}: ${s.correctAnswer}` : s.correctAnswer || null;
  }
  const others = (s.acceptedAnswers || []).filter((a) => a.trim().toLowerCase() !== (s.correctAnswer || '').trim().toLowerCase());
  return others.length ? `${s.correctAnswer} (also: ${others.join(', ')})` : s.correctAnswer || null;
}

export interface TeacherRemoteView {
  /** The teacher unpaired this phone. */
  ended?: boolean;
  step: string;
  round: number;
  totalRounds: number | null;
  paused: boolean;
  sentence: string | null;
  answer: string | null;
  explanation: string | null;
  lockedIn: number;
  seated: number;
  waitingFor: string[];
  away: string[];
  reactions: { gotIt: number; confused: number } | null;
  /** What the big button does now. */
  primaryLabel: string;
  /** The answer to the last button press, when it could not be done. */
  notice: string | null;
}

export function primaryLabelFor(step: string): string {
  if (step === 'IN_GAME') return 'Reveal the answer';
  if (step === 'RESULTS') return 'Deal the next hand';
  if (step === 'GAME_OVER') return 'Nothing to do';
  return 'Next step';
}

export function buildRemoteView(input: {
  step: string;
  round: number;
  totalRounds: number | null;
  paused: boolean;
  sentence: GeneratedSentence | null | undefined;
  players: { id: number; name: string }[];
  lockedIds: number[];
  awayIds: number[];
  reactions: { gotIt: number; confused: number } | null;
  notice: string | null;
}): TeacherRemoteView {
  const inHand = input.step === 'IN_GAME' || input.step === 'RESULTS';
  const locked = new Set(input.lockedIds);
  const away = new Set(input.awayIds);
  return {
    step: input.step,
    round: input.round,
    totalRounds: input.totalRounds,
    paused: input.paused,
    sentence: inHand ? input.sentence?.text || null : null,
    answer: inHand ? answerForTeacher(input.sentence) : null,
    explanation: inHand ? input.sentence?.explanation || null : null,
    lockedIn: input.players.filter((p) => locked.has(p.id)).length,
    seated: input.players.length,
    waitingFor: input.step === 'IN_GAME' ? input.players.filter((p) => !locked.has(p.id)).map((p) => p.name) : [],
    away: input.players.filter((p) => away.has(p.id)).map((p) => p.name),
    reactions: input.step === 'RESULTS' ? input.reactions : null,
    primaryLabel: primaryLabelFor(input.step),
    notice: input.notice,
  };
}

/** The remote's name at the table. Unique per link, so a new link never asks to take an old seat. */
export function remoteName(key: string): string {
  return `${REMOTE_NAME} ${key.slice(0, 4).toUpperCase()}`;
}

/** What the remote phone keeps so it can come back after a reload. */
export const REMOTE_PHONE_STORAGE_KEY = 'grammar_casino_remote_phone_v1';

export interface SavedRemotePhone {
  code: string;
  key: string;
  token: string;
}

/** The saved reconnect token, only when it belongs to this room and this link. */
export function savedRemoteToken(raw: string | null, code: string, key: string): string | undefined {
  if (!raw) return undefined;
  try {
    const saved = JSON.parse(raw) as Partial<SavedRemotePhone>;
    if (saved && saved.code === code.trim().toUpperCase() && saved.key === key && typeof saved.token === 'string') return saved.token;
  } catch {
    // ignore a damaged record
  }
  return undefined;
}
