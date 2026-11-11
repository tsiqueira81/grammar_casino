// Package R5: the teacher's screen writes the room to Firestore at most twice a second, and
// soon after the first change of a burst (never starved by a stream of small changes).

/** At most one room write per this many milliseconds. */
export const MIN_ROOM_WRITE_GAP_MS = 500;

/**
 * When the next write should happen.
 * @param now the time of the new change
 * @param delayMs how soon this change would like to be written
 * @param lastWriteAt when the room was last written (0 if never)
 * @param pendingAt when an already planned write will happen (null if none)
 */
export function nextFlushAt(now: number, delayMs: number, lastWriteAt: number, pendingAt: number | null): number {
  const wanted = Math.max(now + delayMs, lastWriteAt > 0 ? lastWriteAt + MIN_ROOM_WRITE_GAP_MS : 0);
  // An earlier planned write already carries this change too.
  if (pendingAt !== null && pendingAt <= wanted) return pendingAt;
  return wanted;
}

/** Runs fn over items with at most `limit` running at once, keeping the order of results. */
export async function mapWithLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}
