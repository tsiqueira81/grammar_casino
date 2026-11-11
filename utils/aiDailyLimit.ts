/**
 * Daily AI limit per device (package R7, decision D3).
 *
 * AI sentences and live rooms are open to everyone, so one browser must not be able to use up the
 * shared AI quota. Each device may ask for a set number of AI sentences and other AI calls (answer
 * checks, hints, explanations, read-aloud) per calendar day. Past the limit the game quietly uses the
 * offline bank and the local answer checks, exactly as it does when the network is down.
 *
 * This is a guard against accidental or casual over-use, not a lock: the server keeps its own
 * per-address limits as well.
 */

export const AI_DAILY_LIMIT_STORAGE_KEY = 'grammar_casino_ai_daily_v1';

/** About five 40-hand lessons a day. */
export const AI_DAILY_SENTENCE_LIMIT = 200;
/** Answer checks (one per different answer), hints, explanations and read-aloud. */
export const AI_DAILY_OTHER_LIMIT = 1500;

export type AiCallKind = 'sentence' | 'other';

export interface AiDailyUsage {
  day: string;
  sentence: number;
  other: number;
}

type DailyStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** The device's local calendar day, as YYYY-MM-DD. */
export function localDay(now: Date): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

export function readAiDailyUsage(storage: DailyStorage | null, now: Date): AiDailyUsage {
  const today = localDay(now);
  const empty: AiDailyUsage = { day: today, sentence: 0, other: 0 };
  if (!storage) return empty;
  try {
    const raw = storage.getItem(AI_DAILY_LIMIT_STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.day !== today) return empty;
    const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
    return { day: today, sentence: count(parsed.sentence), other: count(parsed.other) };
  } catch {
    return empty;
  }
}

export function getAiCallKind(action: string): AiCallKind {
  return action === 'generateSentence' ? 'sentence' : 'other';
}

/**
 * Counts one AI call and says whether it may go ahead. When the browser cannot store anything
 * (private mode, blocked storage) the call is allowed, so a lesson never loses its AI because of it.
 */
export function tryUseAiCall(
  storage: DailyStorage | null,
  kind: AiCallKind,
  now: Date = new Date(),
  limits: Record<AiCallKind, number> = { sentence: AI_DAILY_SENTENCE_LIMIT, other: AI_DAILY_OTHER_LIMIT }
): boolean {
  const usage = readAiDailyUsage(storage, now);
  if (usage[kind] >= limits[kind]) return false;
  usage[kind] += 1;
  if (storage) {
    try {
      storage.setItem(AI_DAILY_LIMIT_STORAGE_KEY, JSON.stringify(usage));
    } catch {
      // Storage full or blocked: allow the call anyway.
    }
  }
  return true;
}

/** localStorage when the browser allows it, otherwise null. */
export function getBrowserDailyStorage(): DailyStorage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}
