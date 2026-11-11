// Package A3: an estimate of Firestore reads and writes on this device today, so a busy week
// does not run into the free daily quota by surprise. The free tier allows 50,000 reads and
// 20,000 writes (deletes counted with writes here) per day for the whole project; this device
// sees only its own share, so the numbers are a floor, not the total.
import { logEvent } from './debugLog';
import { safeLocalStorage } from './safeStorage';

export const FIRESTORE_USAGE_KEY = 'grammar_casino_firestore_usage_v1';
export const FREE_DAILY_READS = 50_000;
export const FREE_DAILY_WRITES = 20_000;
export const WARN_SHARE = 0.6;

export interface FirestoreUsage {
  day: string;
  reads: number;
  writes: number;
  warned?: boolean;
}

const today = (now: number) => new Date(now).toISOString().slice(0, 10);

export function emptyUsage(now: number = Date.now()): FirestoreUsage {
  return { day: today(now), reads: 0, writes: 0 };
}

/** Adds to today's counts (a new day starts again from zero). Pure, for tests. */
export function addUsage(prev: FirestoreUsage, reads: number, writes: number, now: number = Date.now()): FirestoreUsage {
  const base = prev.day === today(now) ? prev : emptyUsage(now);
  return { ...base, reads: base.reads + Math.max(0, reads), writes: base.writes + Math.max(0, writes) };
}

/** True once either count passes 60% of the free daily quota. */
export function nearQuota(u: FirestoreUsage): boolean {
  return u.reads >= FREE_DAILY_READS * WARN_SHARE || u.writes >= FREE_DAILY_WRITES * WARN_SHARE;
}

function load(now: number): FirestoreUsage {
  try {
    const raw = safeLocalStorage.getItem(FIRESTORE_USAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed.day === 'string' && typeof parsed.reads === 'number' && typeof parsed.writes === 'number') return parsed;
  } catch {
    // start fresh
  }
  return emptyUsage(now);
}

let current: FirestoreUsage | null = null;
let gameReads = 0;
let gameWrites = 0;

/** Counts Firestore operations made by this device. */
export function countFirestore(reads: number, writes: number, now: number = Date.now()): void {
  if (!reads && !writes) return;
  gameReads += reads;
  gameWrites += writes;
  const next = addUsage(current || load(now), reads, writes, now);
  if (nearQuota(next) && !next.warned) {
    next.warned = true;
    logEvent('perf', `Firestore use today on this device: ${next.reads} reads, ${next.writes} writes, past 60% of the free daily quota`);
  }
  current = next;
  try {
    safeLocalStorage.setItem(FIRESTORE_USAGE_KEY, JSON.stringify(next));
  } catch {
    // counting is best effort
  }
}

/** Reads and writes since the last call, for the debug log at the end of a game. */
export function takeGameUsage(): { reads: number; writes: number } {
  const out = { reads: gameReads, writes: gameWrites };
  gameReads = 0;
  gameWrites = 0;
  return out;
}

export function firestoreUsageToday(now: number = Date.now()): FirestoreUsage {
  const u = current || load(now);
  return u.day === today(now) ? u : emptyUsage(now);
}
