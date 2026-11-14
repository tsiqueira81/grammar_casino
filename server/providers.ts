// One provider interface, measured (package A2). Model names live here and can be changed with
// environment variables, so retiring a model is a dashboard change, not a code change. Every
// provider call has a time limit, and a provider that keeps failing is skipped for a while.

export type AiProvider = 'nvidia' | 'groq' | 'gemini';
export type AiCallKind = 'generate' | 'verify' | 'speech' | 'other' | 'batch';
/**
 * What the circuit breaker rests: a provider, or one NVIDIA model. The writer (glm) and the checker
 * (minimax) are on two NVIDIA accounts; Nemotron, the backup writer, shares the writer's key.
 */
export type BreakerKey = AiProvider | 'nvidia-writer' | 'nvidia-checker' | 'nemotron';

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
  // The sentence chain (2026-11-14, CoArena dropped): on NVIDIA, glm writes on one account and
  // minimax checks blind on another; then Nemotron, Groq, Gemini. See server/textChain.ts.
  // Change with NVIDIA_WRITER_MODELS, NVIDIA_CHECKER_MODELS and NVIDIA_TEXT_MODELS.
  nvidiaWriter: ['z-ai/glm-5.3-flash'],
  nvidiaChecker: ['minimaxai/minimax-m3.1-flash'],
  nvidiaText: ['nvidia/nemotron-3-ultra-550b-a55b', 'nvidia/nemotron-3-ultra'],
  // llama-3.3-70b-versatile was retired for free Groq accounts in 2026 (it answered 404).
  groqText: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'],
  /** Checks what another model wrote, on Groq (2026-11-14). Change with GROQ_CHECKER_MODELS. */
  groqChecker: ['openai/gpt-oss-20b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-120b'],
  geminiText: ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'],
  /** Checks what Gemini wrote: a different Gemini model. */
  geminiChecker: ['gemini-3.8-flash', 'gemini-4-argon'],
  geminiTts: ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts', 'gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts'],
};

/** Models in the order they are tried. Read on each call so a changed setting applies at once. */
export function aiModels() {
  return {
    nvidiaWriter: listFromEnv('NVIDIA_WRITER_MODELS', DEFAULT_MODELS.nvidiaWriter),
    nvidiaChecker: listFromEnv('NVIDIA_CHECKER_MODELS', DEFAULT_MODELS.nvidiaChecker),
    nvidiaText: listFromEnv('NVIDIA_TEXT_MODELS', DEFAULT_MODELS.nvidiaText),
    groqText: listFromEnv('GROQ_TEXT_MODELS', DEFAULT_MODELS.groqText),
    groqChecker: listFromEnv('GROQ_CHECKER_MODELS', DEFAULT_MODELS.groqChecker),
    geminiChecker: listFromEnv('GEMINI_CHECKER_MODELS', DEFAULT_MODELS.geminiChecker),
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
  // A batch of up to 15 items is made ahead of time, never while the class waits.
  batch: 45_000,
};

/**
 * The most a whole chain may take, all providers together. A provider that fails fast (no credit,
 * 429, 500) leaves the rest of this time to the next one.
 */
export const AI_CHAIN_BUDGET_MS: Record<AiCallKind, number> = {
  generate: 7_000,
  verify: 8_000,
  speech: 10_000,
  other: 15_000,
  batch: 100_000,
};

/**
 * The blind check of a single sentence (2026-11-14). The game waits 8 s for its sentence, so the
 * check gets what is left of 7.6 s, never less than 2.5 s and never more than 6 s (it was 4 s, and
 * glm-5-3-flash often took longer). When the first checker is still busy after 1.2 s, the next one
 * starts as well and the first answer counts. For a single sentence the fastest checker goes first
 * (Groq gpt-oss-20b, usually about a second); the NVIDIA checker comes second (2026-11-14:
 * after a slow NVIDIA writer only 2.5 s were left and a slow checker alone could not answer in time).
 */
export const SINGLE_CHECK_DEADLINE_MS = 7_600;
export const SINGLE_CHECK_MIN_MS = 2_500;
export const SINGLE_CHECK_MAX_MS = 6_000;
export const CHECK_HEDGE_AFTER_MS = 1_200;
/** A batch check (up to 15 items, 45 s in all): the next checker joins after 20 s. */
export const BATCH_CHECK_HEDGE_AFTER_MS = 20_000;

/** How long the check of a single sentence may take, from when its writing started. */
export function singleCheckMs(elapsedMs: number): number {
  return Math.max(SINGLE_CHECK_MIN_MS, Math.min(SINGLE_CHECK_MAX_MS, SINGLE_CHECK_DEADLINE_MS - elapsedMs));
}

/**
 * Extra tokens a thinking model gets for its hidden reasoning, on top of the answer: gpt-oss, and
 * minimax (its thinking cannot be turned off on NVIDIA, only set to low).
 */
export const REASONING_HEADROOM_TOKENS = 2_048;
export function isReasoningModel(model: string): boolean {
  return /gpt-oss|minimax/i.test(model || '');
}

export class AiTimeoutError extends Error {
  constructor(public provider: AiProvider | BreakerKey, ms: number) {
    super(`${provider} took longer than ${ms / 1000} s`);
    this.name = 'AiTimeoutError';
  }
}

/** Resolves like `work`, or rejects after `ms`. */
export function withTimeout<T>(work: Promise<T>, ms: number, provider: AiProvider | BreakerKey): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AiTimeoutError(provider, ms)), ms);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

export const BREAKER_FAILURES = 3;
export const BREAKER_WINDOW_MS = 60_000;
export const BREAKER_OPEN_MS = 5 * 60_000;

/**
 * A "busy" answer (HTTP 429): the provider rests at once, for as long as it asked (Retry-After)
 * or, when it did not say, 30 s, then 60 s, 120 s ... up to 10 minutes while it stays busy. It is
 * not asked again in the meantime, so a busy provider is never hammered and the chain goes on.
 */
export const BUSY_REST_FIRST_MS = 30_000;
export const BUSY_REST_MIN_MS = 5_000;
export const BUSY_REST_MAX_MS = 10 * 60_000;

/** Reads a Retry-After header (seconds or a date), in milliseconds, or undefined. */
export function parseRetryAfter(value: string | null | undefined, now: number = Date.now()): number | undefined {
  if (!value) return undefined;
  const secs = Number(value);
  if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - now) : undefined;
}

/** Three failures within a minute skip that provider for five minutes; a 429 rests it at once. */
export class CircuitBreaker {
  private failures = new Map<BreakerKey, number[]>();
  private openUntil = new Map<BreakerKey, number>();
  private busyStreak = new Map<BreakerKey, number>();

  /** A 429: rests the provider and returns for how long. */
  recordBusy(provider: BreakerKey, retryAfterMs?: number, now: number = Date.now()): number {
    const streak = (this.busyStreak.get(provider) || 0) + 1;
    this.busyStreak.set(provider, streak);
    const backoff = BUSY_REST_FIRST_MS * 2 ** (streak - 1);
    const wanted = typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs) ? Math.max(retryAfterMs, streak > 1 ? backoff : 0) : backoff;
    const ms = Math.max(BUSY_REST_MIN_MS, Math.min(BUSY_REST_MAX_MS, wanted));
    this.openUntil.set(provider, Math.max(this.openUntil.get(provider) || 0, now + ms));
    return ms;
  }

  /** When a resting provider may be asked again (0 when it is not resting). */
  restingUntil(provider: BreakerKey): number {
    return this.openUntil.get(provider) || 0;
  }

  isOpen(provider: BreakerKey, now: number = Date.now()): boolean {
    return (this.openUntil.get(provider) || 0) > now;
  }

  recordFailure(provider: BreakerKey, now: number = Date.now()): void {
    const recent = (this.failures.get(provider) || []).filter((t) => now - t < BREAKER_WINDOW_MS);
    recent.push(now);
    this.failures.set(provider, recent);
    if (recent.length >= BREAKER_FAILURES) {
      this.openUntil.set(provider, now + BREAKER_OPEN_MS);
      this.failures.set(provider, []);
    }
  }

  recordSuccess(provider: BreakerKey): void {
    this.failures.set(provider, []);
    this.openUntil.delete(provider);
    this.busyStreak.delete(provider);
  }

  reset(): void {
    this.failures.clear();
    this.openUntil.clear();
    this.busyStreak.clear();
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
  /** Package L3: the model that checked the item cold, and whether it passed. */
  verifiedBy?: string;
  verified?: boolean;
  /** The writers that have a key, in order: a missing secret shows here. */
  chain?: string;
}

/** The header value: short and safe (no sentence text, no answers). */
export function formatAiMeta(meta: AiMeta): string {
  const clean = (s: string) => s.replace(/[^\w .:/(),;-]/g, '').slice(0, 160);
  const parts: Record<string, string | number> = { provider: meta.provider, latencyMs: Math.round(meta.latencyMs) };
  if (meta.model) parts.model = clean(meta.model);
  if (typeof meta.tokens === 'number') parts.tokens = meta.tokens;
  if (meta.fallbackReason) parts.fallbackReason = clean(meta.fallbackReason);
  if (meta.verifiedBy) parts.verifiedBy = clean(meta.verifiedBy);
  if (typeof meta.verified === 'boolean') parts.verified = meta.verified ? 'yes' : 'no';
  if (meta.chain !== undefined) parts.chain = clean(meta.chain) || 'none';
  return JSON.stringify(parts);
}

/** Short reason for the log: "timeout", "429", "breaker open" and so on. */
export function failureReason(err: unknown): string {
  if (err instanceof AiTimeoutError) return 'timeout';
  const e = err as { status?: number; message?: string; restedMs?: number } | null;
  if (e?.status === 429 && e.restedMs) return `429 busy, resting ${Math.round(e.restedMs / 1000)} s`;
  if (e?.status) return String(e.status);
  return String(e?.message || err || 'error').slice(0, 60);
}
