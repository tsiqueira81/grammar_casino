/**
 * Waits for `work`, but at most `ms`; after that `instead()` gives the answer (2026-11-14: the class
 * waits at most a few seconds for a sentence still being made ahead, then gets one from the bank).
 * When `work` fails before the time is up, the failure passes through.
 */
export function waitAtMost<T>(work: Promise<T>, ms: number, instead: () => Promise<T> | T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => {
      Promise.resolve()
        .then(instead)
        .then(resolve, reject);
    }, ms);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}
