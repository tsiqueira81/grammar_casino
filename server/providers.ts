// One provider interface, measured (package A2). Model names live here and can be changed with
// environment variables, so retiring a model is a dashboard change, not a code change. Every
// provider call has a time limit, and a provider that keeps failing is skipped for a while.

export type AiProvider = 'groq' | 'gemini';
export type AiCallKind = 'generate' | 'verify' | 'speech' | 'other';

/** Comma-separated list from an environment variable, or the default. */
function listFromEnv(name: string, fallback: string[]): string[] {
  const raw = typeof process !== 'undefined' ? process.env?.[name] : undefined;
  const list = String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : fallback;
}

export const DEFAULT_MODELS = {
  groqText: ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile'],
  geminiText: ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'],
  geminiTts: ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts', 'gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts'],
};

/** Models in the order they are tried. Read on each call so a changed setting applies at once. */
export function aiModels() {
  return {
    groqText: listFromEnv('GROQ_TEXT_MODELS', DEFAULT_MODELS.groqText),
    geminiText: listFromEnv('GEMINI_TEXT_MODELS', DEFAULT_MODELS.geminiText),
    geminiTts: listFromEnv('GEMINI_TTS_MODELS', DEFAULT_MODELS.geminiTts),
  };
}

/**
 * How long one provider may take. The plan asked for 12 s on generation, but the game itself
 * gives up on a new sentence after 8 s (package R8) and deals one from the bank, so the server
 * stops waiting at 7 s and the answer still arrives in time.
 */
export const AI_TIMEOUT_MS: Record<AiCallKind, number> = {
  generate: 7_000,
  verify: 8_000,
  speech: 10_000,
  other: 12_000,
};

export class AiTimeoutError extends Error {
  constructor(public provider: AiProvider, ms: number) {
    super(`${provider} took longer than ${ms / 1000} s`);
    this.name = 'AiTimeoutError';
  }
}

/** Resolves like `work`, or rejects after `ms`. */
export function withTimeout<T>(work: Promise<T>, ms: number, provider: AiProvider): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AiTimeoutError(provider, ms)), ms);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

export const BREAKER_FAILURES = 3;
export const BREAKER_WINDOW_MS = 60_000;
export const BREAKER_OPEN_MS = 5 * 60_000;

/** Three failures within a minute skip that provider for five minutes. */
export class CircuitBreaker {
  private failures = new Map<AiProvider, number[]>();
  private openUntil = new Map<AiProvider, number>();

  isOpen(provider: AiProvider, now: number = Date.now()): boolean {
    return (this.openUntil.get(provider) || 0) > now;
  }

  recordFailure(provider: AiProvider, now: number = Date.now()): void {
    const recent = (this.failures.get(provider) || []).filter((t) => now - t < BREAKER_WINDOW_MS);
    recent.push(now);
    this.failures.set(provider, recent);
    if (recent.length >= BREAKER_FAILURES) {
      this.openUntil.set(provider, now + BREAKER_OPEN_MS);
      this.failures.set(provider, []);
    }
  }

  recordSuccess(provider: AiProvider): void {
    this.failures.set(provider, []);
    this.openUntil.delete(provider);
  }

  reset(): void {
    this.failures.clear();
    this.openUntil.clear();
  }
}

export const aiBreaker = new CircuitBreaker();

/** What every AI answer reports about itself (sent as the X-AI-Meta header). */
export interface AiMeta {
  provider: AiProvider | 'cache';
  model?: string;
  latencyMs: number;
  tokens?: number;
  /** Why the first choice was not used, when it was not. */
  fallbackReason?: string;
}

/** The header value: short and safe (no sentence text, no answers). */
export function formatAiMeta(meta: AiMeta): string {
  const clean = (s: string) => s.replace(/[^\w .:/()-]/g, '').slice(0, 80);
  const parts: Record<string, string | number> = { provider: meta.provider, latencyMs: Math.round(meta.latencyMs) };
  if (meta.model) parts.model = clean(meta.model);
  if (typeof meta.tokens === 'number') parts.tokens = meta.tokens;
  if (meta.fallbackReason) parts.fallbackReason = clean(meta.fallbackReason);
  return JSON.stringify(parts);
}

/** Short reason for the log: "timeout", "429", "breaker open" and so on. */
export function failureReason(err: unknown): string {
  if (err instanceof AiTimeoutError) return 'timeout';
  const e = err as { status?: number; message?: string } | null;
  if (e?.status) return String(e.status);
  return String(e?.message || err || 'error').slice(0, 60);
}
