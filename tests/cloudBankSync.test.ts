import { beforeEach, describe, expect, it, vi } from 'vitest';

// The shared sentence bank: a device's saved copy must lose sentences that an owner deleted.
const serverDocs: { id: string; data: Record<string, unknown> }[] = [];
const queries: string[] = [];

vi.mock('firebase/firestore', async (importOriginal) => {
  const real = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...real,
    collection: vi.fn(() => ({})),
    where: vi.fn(() => 'where'),
    orderBy: vi.fn(() => 'orderBy'),
    limit: vi.fn(() => 'limit'),
    query: vi.fn((_c: unknown, ...parts: string[]) => {
      queries.push(parts.includes('where') ? 'delta' : 'full');
      return parts.includes('where') ? 'delta' : 'full';
    }),
    getDocs: vi.fn(async (q: string) => {
      const docs = q === 'delta' ? [] : serverDocs;
      return {
        empty: docs.length === 0,
        forEach: (fn: (d: { id: string; data: () => Record<string, unknown> }) => void) =>
          docs.forEach((d) => fn({ id: d.id, data: () => d.data })),
      };
    }),
  };
});

const store = new Map<string, string>();
vi.stubGlobal('window', globalThis);
vi.stubGlobal('localStorage', {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

const { syncCloudSentenceBank, loadCachedCloudSentences, isCloudSentenceFullSyncDue, CLOUD_SENTENCE_FULL_SYNC_EVERY_MS } =
  await import('../services/firebaseService');

const row = (id: string, createdAt: number) => ({ id, data: { text: `Sentence ${id}.`, createdAt } });

describe('cloud sentence bank sync', () => {
  beforeEach(() => {
    store.clear();
    queries.length = 0;
    serverDocs.length = 0;
  });

  it('drops sentences deleted on the server at the next full sync', async () => {
    serverDocs.push(row('a', 1), row('b', 2), row('c', 3));
    expect((await syncCloudSentenceBank()).map((s) => s.id).sort()).toEqual(['a', 'b', 'c']);
    expect(queries).toEqual(['full']);

    // An owner deletes "b". Within the day the quick sync is used, which cannot see deletions.
    serverDocs.splice(1, 1);
    await syncCloudSentenceBank();
    expect(queries.at(-1)).toBe('delta');
    expect(loadCachedCloudSentences().map((s) => s.id).sort()).toEqual(['a', 'b', 'c']);

    // A forced full sync (opening the Cloud window) removes it straight away.
    expect((await syncCloudSentenceBank({ forceFullSync: true })).map((s) => s.id).sort()).toEqual(['a', 'c']);
  });

  it('asks for a full sync once a day', () => {
    const now = Date.now();
    expect(isCloudSentenceFullSyncDue(now)).toBe(true);
    store.set('grammar_casino_cloud_sentences_full_sync_at', String(now));
    expect(isCloudSentenceFullSyncDue(now + 1000)).toBe(false);
    expect(isCloudSentenceFullSyncDue(now + CLOUD_SENTENCE_FULL_SYNC_EVERY_MS)).toBe(true);
  });
});
