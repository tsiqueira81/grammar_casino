/**
 * Browser storage that never throws (package F8).
 *
 * localStorage and sessionStorage can throw: in some private windows, when site data is blocked,
 * when the storage is full, or on a phone with storage turned off. A throw in the wrong place used to
 * stop a lesson (for example, a phone that had joined a room showed "Could not connect" because the
 * seat could not be saved). These wrappers keep the same three methods, fall back to memory for the
 * rest of the tab's life when the browser refuses, and report failure instead of throwing.
 */

export interface SafeStorage {
  getItem(key: string): string | null;
  /** Returns false when the browser refused; the value is then kept in memory for this tab. */
  setItem(key: string, value: string): boolean;
  removeItem(key: string): void;
}

type StorageGetter = () => Storage | null | undefined;

export function createSafeStorage(getStorage: StorageGetter): SafeStorage {
  const memory = new Map<string, string>();

  const storage = (): Storage | null => {
    try {
      return getStorage() ?? null;
    } catch {
      return null;
    }
  };

  return {
    getItem(key) {
      const s = storage();
      if (s) {
        try {
          const value = s.getItem(key);
          if (value !== null) return value;
        } catch {
          // fall through to memory
        }
      }
      return memory.has(key) ? memory.get(key)! : null;
    },
    setItem(key, value) {
      const s = storage();
      if (s) {
        try {
          s.setItem(key, value);
          memory.delete(key);
          return true;
        } catch {
          // fall through to memory
        }
      }
      memory.set(key, value);
      return false;
    },
    removeItem(key) {
      memory.delete(key);
      const s = storage();
      if (!s) return;
      try {
        s.removeItem(key);
      } catch {
        // nothing more to do
      }
    },
  };
}

export const safeLocalStorage: SafeStorage = createSafeStorage(() =>
  typeof window === 'undefined' ? null : window.localStorage
);

export const safeSessionStorage: SafeStorage = createSafeStorage(() =>
  typeof window === 'undefined' ? null : window.sessionStorage
);
