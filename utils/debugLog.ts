// See problems before a class does (package A4). A small in-memory log of what the host did
// (screen changes, rejected phone actions, connection drops, AI fallbacks), viewable with
// Shift+L and downloadable as a file. Nothing is sent anywhere: it stays in this tab.
// Student answers are never logged (package A5); log what happened, not what was typed.

declare const __APP_VERSION__: string | undefined;

/** Commit and build date, stamped by Vite (vite.config.ts). "dev" when not built. */
export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__ ? __APP_VERSION__ : 'dev';

export const LOG_LIMIT = 500;

export type LogKind = 'step' | 'intent' | 'room' | 'ai' | 'error' | 'perf' | 'info';

export interface LogEntry {
  at: number;
  kind: LogKind;
  message: string;
}

let entries: LogEntry[] = [];
const listeners = new Set<() => void>();

/** Adds one event. The oldest are dropped past LOG_LIMIT. */
export function logEvent(kind: LogKind, message: string, at: number = Date.now()): void {
  entries.push({ at, kind, message: String(message).slice(0, 300) });
  if (entries.length > LOG_LIMIT) entries = entries.slice(entries.length - LOG_LIMIT);
  listeners.forEach((l) => l());
}

/** The last `count` events (all of them by default), oldest first. */
export function getLog(count?: number): LogEntry[] {
  return count === undefined ? entries.slice() : entries.slice(Math.max(0, entries.length - count));
}

export function clearLog(): void {
  entries = [];
  listeners.forEach((l) => l());
}

export function onLogChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const pad = (n: number) => String(n).padStart(2, '0');
const clock = (at: number) => {
  const d = new Date(at);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

/** The log as plain text, one event per line, headed with the version. */
export function formatLog(list: LogEntry[] = getLog(), extra?: string): string {
  const head = [`Grammar Casino ${APP_VERSION}`, `Saved ${new Date().toISOString()}`];
  if (typeof navigator !== 'undefined' && navigator.userAgent) head.push(`Browser ${navigator.userAgent}`);
  if (extra) head.push(extra);
  return [...head, '', ...list.map((e) => `${clock(e.at)} [${e.kind}] ${e.message}`)].join('\n');
}

/** What "Copy details" puts on the clipboard after a crash. */
export function crashDetails(error: unknown, componentStack?: string | null): string {
  const err = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack || ''}` : String(error);
  return formatLog(getLog(50), `Error ${err.trim()}${componentStack ? `\nWhere${componentStack}` : ''}`);
}
