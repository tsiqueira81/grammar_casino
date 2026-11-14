// Sentences made ahead in batches (2026-11-14). While a hand is played, the game asks the server
// for up to 15 checked items for the hands still to come, in one request, and keeps them here. A
// hand takes a matching item at once; when none matches, the game makes that hand's sentence as
// before (one request, and the offline bank if that fails), so a batch never makes the class wait.
import type { GeneratedSentence, QuestionType } from '../types';
import type { UpcomingHand } from '../game/upcomingHands';
export type { UpcomingHand };

export const MAX_BATCH = 15;
export const POOL_LIMIT = 60;
/** A batch of fewer items is not worth a request; the hand is made on its own instead. */
export const MIN_BATCH = 2;

/** What the game knows about the rest of the game, so the batch fits it. */
export interface SentencePlan {
  /** The hands after this one, in order (at most 30 are used). */
  upcoming?: UpcomingHand[];
  /** Second look and Spotlight: only an item written for exactly this grammar point will do. */
  strictSubtype?: boolean;
  /**
   * Made ahead, while the class plays the hand before or the teacher is on the setup screen
   * (2026-11-14): nobody waits for it yet, so the server gives glm a longer head start and the
   * game waits longer for it (AI_AHEAD_SENTENCE_TIMEOUT_MS).
   */
  ahead?: boolean;
}

export type PooledItem = GeneratedSentence & { theme?: string };

interface Entry {
  key: string;
  theme: string;
  item: PooledItem;
}

export interface BatchSlotRequest {
  forceCorrect: boolean | null;
  subtype: string | null;
  theme: string;
}

/** Spot the error and Word order are made from Valid-or-flawed items. */
export function baseType(t: QuestionType | undefined): QuestionType {
  return !t || t === 'spotError' || t === 'wordOrder' ? 'binary' : t;
}

export function poolKey(settings: { topic: string; level: string }, type: QuestionType | undefined): string {
  return `${settings.topic}|${settings.level}|${baseType(type)}`;
}

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export class SentencePool {
  private entries: Entry[] = [];
  private inFlight = new Set<string>();

  size(key?: string): number {
    return key ? this.entries.filter((e) => e.key === key).length : this.entries.length;
  }

  clear(): void {
    this.entries = [];
    this.inFlight.clear();
  }

  add(key: string, items: PooledItem[]): void {
    for (const item of items) {
      if (!item?.text) continue;
      if (this.entries.some((e) => sameText(e.item.text, item.text))) continue;
      this.entries.push({ key, theme: String(item.theme || ''), item });
    }
    while (this.entries.length > POOL_LIMIT) this.entries.shift();
  }

  /**
   * The best waiting item for this hand, or null. Theme and type must match; a binary hand that
   * must be correct (or flawed) takes only such an item; an item already dealt is never used.
   * An item written for the hand's own grammar point comes first.
   */
  take(
    settings: { topic: string; level: string; theme: string },
    type: QuestionType | undefined,
    forceCorrect: boolean | null,
    subtype: string | null,
    strictSubtype: boolean,
    pastSentences: string[] = []
  ): PooledItem | null {
    const key = poolKey(settings, type);
    const fits = (e: Entry) =>
      e.key === key &&
      e.theme === settings.theme &&
      (baseType(type) !== 'binary' || forceCorrect === null || Boolean(e.item.isCorrect) === forceCorrect) &&
      (!strictSubtype || (e.item.writtenFor || null) === (subtype || null)) &&
      !pastSentences.some((p) => typeof p === 'string' && p.includes(e.item.text));
    let index = this.entries.findIndex((e) => fits(e) && subtype !== null && e.item.writtenFor === subtype);
    if (index < 0) index = this.entries.findIndex(fits);
    if (index < 0) return null;
    const [entry] = this.entries.splice(index, 1);
    return entry.item;
  }

  /** Marks a batch as asked for; false when one for this key is already on its way. */
  begin(key: string): boolean {
    if (this.inFlight.has(key)) return false;
    this.inFlight.add(key);
    return true;
  }

  end(key: string): void {
    this.inFlight.delete(key);
  }
}

/**
 * The slots of the next batch for this hand's type: one per upcoming hand of the same type, minus
 * the items already waiting. No plan, no batch. Binary slots are 40% correct (like the game's own mix), except that
 * Word order needs a correct sentence and Spot the error a flawed one. Grammar points take turns.
 */
export function planBatch(
  settings: { theme: string },
  type: QuestionType | undefined,
  plan: SentencePlan | undefined,
  waiting: number,
  subtypes: string[],
  random: () => number = Math.random
): BatchSlotRequest[] {
  const base = baseType(type);
  // Without a plan (a caller that does not know the game) no batch is made.
  if (!plan?.upcoming) return [];
  const upcoming = plan.upcoming.slice(0, 30).filter((h) => baseType(h.questionType) === base);
  const wanted = upcoming.slice(waiting, waiting + MAX_BATCH);
  if (wanted.length < MIN_BATCH) return [];
  const shuffled = subtypes.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const binaryPlain = wanted.filter((h) => h.questionType === 'binary' || !h.questionType).length;
  const correctCount = Math.round(binaryPlain * 0.4);
  const pattern = Array.from({ length: binaryPlain }, (_, i) => i < correctCount);
  for (let i = pattern.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pattern[i], pattern[j]] = [pattern[j], pattern[i]];
  }
  let p = 0;
  return wanted.map((hand, i) => ({
    theme: hand.theme || settings.theme,
    subtype: shuffled.length ? shuffled[i % shuffled.length] : null,
    forceCorrect:
      base !== 'binary' ? null : hand.questionType === 'wordOrder' ? true : hand.questionType === 'spotError' ? false : pattern[p++] ?? null,
  }));
}
