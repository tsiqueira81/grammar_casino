import { useCallback, useEffect, useRef } from 'react';

/**
 * Package R8: one-off delays (a sound, a card flip, a "Copied" label) that are cleared when the
 * screen goes away, so nothing fires on a screen that no longer exists.
 */
export function useLaterTimers(): (fn: () => void, ms: number) => void {
  const ids = useRef(new Set<number>());
  useEffect(() => {
    const pending = ids.current;
    return () => {
      pending.forEach((id) => window.clearTimeout(id));
      pending.clear();
    };
  }, []);
  return useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      ids.current.delete(id);
      fn();
    }, ms);
    ids.current.add(id);
  }, []);
}
