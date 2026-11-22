// Gemini Decision 1 server client & failover orchestrator.
// Uses a dedicated `@google/genai` client pinned to `apiVersion: "v1beta"` and keyed by the active
// API key so Cloudflare Pages per-request secrets never read a stale singleton.
import { GoogleGenAI } from '@google/genai';
import type { GeneratedSentence, QuestionType } from '../types';
import {
  AiTimeoutError,
  BUSY_REST_MAX_MS,
  aiBreaker,
  aiModels,
  failureReason,
  parseRetryAfter,
  withTimeout,
} from './providers';
import { geminiKey, restingNote } from './textChain';
import {
  buildBatchGradeRequest,
  buildBlindCheckRequest,
  buildCorrectionGradeRequest,
  evaluateBatchGrade,
  evaluateBlindCheckItem,
  evaluateCorrectionGrade,
  precheckKwtCandidate,
  precheckOpenClozeCandidate,
  precheckWordFormationCandidate,
  supportsDecisionBlindCheck,
  type BatchGradeParams,
  type BlindCheckEntry,
  type CorrectionGradeParams,
  type DecisionAnswersMap,
  type DecisionRequestPayload,
  type DecisionVerdict,
  type GradedCandidateResult,
} from './decisionRubrics';

export type DecisionRunner = (
  req: DecisionRequestPayload,
  model: string,
  timeoutMs: number
) => Promise<{ answers: DecisionAnswersMap; model: string }>;

let customDecisionRunner: DecisionRunner | null = null;
let cachedDecisionsClient: { apiKey: string; client: GoogleGenAI } | null = null;

/** Lets tests inject a deterministic mock Decision 1 runner without network calls. */
export function setDecisionRunner(runner: DecisionRunner | null): void {
  customDecisionRunner = runner;
}

/** True unless explicitly turned off via `AI_DECISION_ENABLED=false|0|off` or no Gemini key is set. */
export function isDecisionEnabled(): boolean {
  const flag = String((typeof process !== 'undefined' ? process.env?.AI_DECISION_ENABLED : '') || '').trim().toLowerCase();
  if (flag === 'false' || flag === '0' || flag === 'off') return false;
  if (customDecisionRunner) return true;
  return Boolean(geminiKey());
}

/** Dedicated `v1beta` GoogleGenAI client for `ai.decisions.create`, recreated whenever the API key changes. */
export function getDecisionsClient(): GoogleGenAI {
  const apiKey = geminiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not configured.');
  }
  if (!cachedDecisionsClient || cachedDecisionsClient.apiKey !== apiKey) {
    cachedDecisionsClient = {
      apiKey,
      client: new GoogleGenAI({
        apiKey,
        apiVersion: 'v1beta',
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      }),
    };
  }
  return cachedDecisionsClient.client;
}

function isSafetyBlockError(err: any): boolean {
  const status = err?.status || err?.statusCode;
  if (status !== 400) return false;
  const msg = String(err?.message || '').toLowerCase();
  return /safety|prohibited_content|blocklist|image_safety|content_blocked/.test(msg);
}

function isBusy429(err: any): boolean {
  const status = err?.status || err?.statusCode;
  if (status === 429) return true;
  const msg = String(err?.message || '').toLowerCase();
  return msg.includes('429') || msg.includes('resource_exhausted') || msg.includes('quota');
}

function extractRetryMs(err: any): number | undefined {
  if (typeof err?.retryAfterMs === 'number') return err.retryAfterMs;
  const header = err?.headers?.get?.('retry-after') ?? err?.response?.headers?.get?.('retry-after');
  const fromHeader = parseRetryAfter(header);
  if (fromHeader !== undefined) return fromHeader;
  const msg = String(err?.message || '');
  const match = msg.match(/retry in\s+([0-9.]+)s/i) || msg.match(/"retryDelay"\s*:\s*"([0-9.]+)s"/i);
  if (match?.[1]) {
    const secs = parseFloat(match[1]);
    if (Number.isFinite(secs) && secs > 0) return Math.ceil(secs * 1000);
  }
  return undefined;
}

function isInvalidApiKeyError(err: any): boolean {
  const status = err?.status || err?.statusCode;
  if (status === 401 || status === 403) return true;
  const msg = String(err?.message || '').toLowerCase();
  return msg.includes('api key not valid') || msg.includes('api_key_invalid') || msg.includes('invalid api key');
}

function isAbortOrTimeoutError(err: any): boolean {
  if (err instanceof AiTimeoutError) return true;
  const name = String(err?.name || '');
  if (name === 'AbortError' || name === 'TimeoutError') return true;
  const msg = String(err?.message || '').toLowerCase();
  return msg.includes('timed out') || msg.includes('timeout') || msg.includes('aborted');
}

/** Executes one `ai.decisions.create` call with timeout, no hidden SDK retries, and isolated `gemini-decision` circuit breaker. */
async function callDecisionApi(
  req: DecisionRequestPayload,
  timeoutMs: number
): Promise<{ answers: DecisionAnswersMap; model: string; latencyMs: number }> {
  const model = aiModels().geminiDecision;
  const started = Date.now();
  const controller = new AbortController();

  const run = async () => {
    if (customDecisionRunner) {
      return await customDecisionRunner(req, model, timeoutMs);
    }
    const client = getDecisionsClient();
    // Disable the SDK's default multi-second exponential-backoff retry loop so transient 429/5xx
    // or stalls fail fast and immediately hand off to our circuit breaker + Groq text-checker fallback.
    const result: any = await client.decisions.create(
      {
        model,
        input: req.input as any,
        questions: req.questions as any,
      },
      {
        timeout_ms: timeoutMs,
        retries: { strategy: 'none' },
        fetch_options: { signal: controller.signal },
      }
    );
    if (!result?.answers || typeof result.answers !== 'object') {
      const reason = result?.prompt_feedback?.block_reason || 'answers omitted';
      const err: any = new Error(`Decision 1 blocked or empty (${reason})`);
      err.status = 400;
      err.isSafetyBlock = Boolean(result?.prompt_feedback);
      throw err;
    }
    return { answers: result.answers as DecisionAnswersMap, model };
  };

  try {
    const out = await withTimeout(run(), timeoutMs, 'gemini-decision');
    aiBreaker.recordSuccess('gemini-decision');
    return { ...out, latencyMs: Date.now() - started };
  } catch (rawErr: any) {
    controller.abort();
    const err = isAbortOrTimeoutError(rawErr) && !(rawErr instanceof AiTimeoutError)
      ? new AiTimeoutError('gemini-decision', timeoutMs)
      : rawErr;

    if (isSafetyBlockError(err) || err?.isSafetyBlock) {
      err.isSafetyBlock = true;
      // Content-specific safety block: do not trip the provider circuit breaker.
    } else if (isInvalidApiKeyError(err)) {
      // Invalid key will fail every call: rest immediately for 10 min instead of retrying 3x.
      aiBreaker.recordBusy('gemini-decision', BUSY_REST_MAX_MS);
    } else if (isBusy429(err)) {
      err.status = 429;
      err.restedMs = aiBreaker.recordBusy('gemini-decision', extractRetryMs(err));
    } else {
      aiBreaker.recordFailure('gemini-decision');
    }

    const reason = failureReason(err);
    const isHardConfigError = isInvalidApiKeyError(err) || ((err?.status || err?.statusCode) === 400 && !err?.isSafetyBlock);
    if (isHardConfigError) {
      console.warn('[Decision 1] config error, falling back:', reason, String(err?.message || '').slice(0, 200));
    } else {
      console.info('[Decision 1] falling back to text checker:', reason);
    }
    throw err;
  }
}

function decisionErrorNote(err: any): string {
  const base = `gemini-decision ${failureReason(err)}`;
  const status = err?.status || err?.statusCode;
  if (status === 400 && err?.message) {
    // Extract concise error text without leaking keys or long payloads.
    let detail = String(err.message);
    const jsonStart = detail.indexOf('{');
    if (jsonStart >= 0) {
      try {
        const parsed = JSON.parse(detail.slice(jsonStart));
        detail = String(parsed?.error?.message || parsed?.message || detail);
      } catch {
        // Fallback regex if SDK appended trailing text after JSON
        const m = detail.match(/"message"\s*:\s*"([^"]+)"/);
        if (m?.[1]) detail = m[1];
      }
    }
    detail = detail.replace(/AIza[A-Za-z0-9_-]+/g, '[redacted]').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (detail) return `${base} (${detail})`;
  }
  return base;
}

export interface SingleDecisionCheckOutcome {
  used: boolean;
  verdict?: DecisionVerdict;
  model?: string;
  latencyMs?: number;
  note?: string;
  safetyBlocked?: boolean;
}

/**
 * Primary blind check for a single closed-ended item (`binary`, `multipleChoice`, `keyWordTransformation`).
 * Returns `{ used: false, note }` when disabled, unsupported, resting, or failing so the caller falls
 * back smoothly to the existing text checker chain.
 */
export async function checkSingleWithDecision(
  item: Partial<GeneratedSentence>,
  type: QuestionType,
  level: string,
  timeoutMs: number,
  contrastiveTargets?: string[],
  topic?: string
): Promise<SingleDecisionCheckOutcome> {
  if (!supportsDecisionBlindCheck(type, contrastiveTargets) || !isDecisionEnabled()) {
    return { used: false };
  }
  if (aiBreaker.isOpen('gemini-decision')) {
    return { used: false, note: restingNote('gemini-decision') };
  }
  const entry: BlindCheckEntry = { id: 0, item, type, level, topic, contrastiveTargets };
  try {
    const req = buildBlindCheckRequest([entry]);
    const out = await callDecisionApi(req, timeoutMs);
    const verdict = evaluateBlindCheckItem(entry, out.answers);
    return {
      used: true,
      verdict,
      model: out.model,
      latencyMs: out.latencyMs,
    };
  } catch (err: any) {
    if (err?.isSafetyBlock) {
      return {
        used: true,
        safetyBlocked: true,
        model: aiModels().geminiDecision,
        verdict: {
          ok: false,
          reasons: ['content blocked by safety check'],
          extraAnswers: [],
          diagnostics: 'safety_block',
        },
      };
    }
    return { used: false, note: decisionErrorNote(err) };
  }
}

export interface BatchDecisionCheckOutcome {
  used: boolean;
  verdicts?: Map<number, DecisionVerdict>;
  model?: string;
  latencyMs?: number;
  note?: string;
}

/**
 * Primary blind check for up to 15 closed-ended batch items in ONE shared-input Decision 1 call.
 * On timeout, 429, or whole-batch 400 safety block, returns `{ used: false, note }` so `makeBatch`
 * falls back cleanly to the text checker chain.
 */
export async function checkBatchWithDecision(
  entries: BlindCheckEntry[],
  timeoutMs: number
): Promise<BatchDecisionCheckOutcome> {
  if (!entries.length || !supportsDecisionBlindCheck(entries[0].type, entries[0].contrastiveTargets) || !isDecisionEnabled()) {
    return { used: false };
  }
  if (aiBreaker.isOpen('gemini-decision')) {
    return { used: false, note: restingNote('gemini-decision') };
  }
  try {
    const req = buildBlindCheckRequest(entries);
    const out = await callDecisionApi(req, timeoutMs);
    const verdicts = new Map<number, DecisionVerdict>();
    for (const entry of entries) {
      verdicts.set(entry.id, evaluateBlindCheckItem(entry, out.answers));
    }
    return {
      used: true,
      verdicts,
      model: out.model,
      latencyMs: out.latencyMs,
    };
  } catch (err: any) {
    return { used: false, note: decisionErrorNote(err) };
  }
}

export interface CorrectionDecisionOutcome {
  used: boolean;
  result?: { isCorrect: boolean; feedback: string };
  model?: string;
  latencyMs?: number;
  diagnostics?: string;
  note?: string;
}

/** Primary zero-output-token grader for `verifyCorrection` with structured rubric feedback. */
export async function gradeCorrectionWithDecision(
  params: CorrectionGradeParams,
  timeoutMs: number
): Promise<CorrectionDecisionOutcome> {
  if (!isDecisionEnabled()) {
    return { used: false };
  }
  if (aiBreaker.isOpen('gemini-decision')) {
    return { used: false, note: restingNote('gemini-decision') };
  }
  try {
    const req = buildCorrectionGradeRequest(params);
    const out = await callDecisionApi(req, timeoutMs);
    const graded = evaluateCorrectionGrade(out.answers);
    return {
      used: true,
      result: { isCorrect: graded.isCorrect, feedback: graded.feedback },
      model: out.model,
      latencyMs: out.latencyMs,
      diagnostics: graded.diagnostics,
    };
  } catch (err: any) {
    return { used: false, note: decisionErrorNote(err) };
  }
}

export interface BatchGradeDecisionOutcome {
  used: boolean;
  results?: Record<string, GradedCandidateResult>;
  model?: string;
  latencyMs?: number;
  note?: string;
}

/**
 * Primary live-room batch grader for `verifyOpenClozeBatch` (KWT, Word Formation, Open Cloze).
 * Runs deterministic structural pre-gates locally first, then evaluates all remaining unique
 * candidates in one shared-input Decision 1 call.
 */
export async function gradeBatchWithDecision(
  params: BatchGradeParams,
  timeoutMs: number
): Promise<BatchGradeDecisionOutcome> {
  if (!isDecisionEnabled()) {
    return { used: false };
  }
  if (aiBreaker.isOpen('gemini-decision')) {
    return { used: false, note: restingNote('gemini-decision') };
  }

  const results: Record<string, GradedCandidateResult> = {};
  const toEvaluate: string[] = [];

  for (const candidate of params.candidates) {
    const key = candidate.trim().replace(/\s+/g, ' ').toLowerCase();
    const pre =
      params.mode === 'keyWordTransformation'
        ? precheckKwtCandidate(candidate, params.baseWord || '')
        : params.mode === 'wordFormation'
          ? precheckWordFormationCandidate(candidate, params.baseWord || '')
          : precheckOpenClozeCandidate(candidate);

    if (!pre.passed) {
      results[key] = {
        isCorrect: false,
        marks: 0,
        feedback: pre.feedback || 'Does not meet the format requirements.',
      };
    } else {
      toEvaluate.push(candidate);
    }
  }

  // If deterministic pre-gates resolved every candidate, return instantaneously with 0 API calls!
  if (toEvaluate.length === 0) {
    return {
      used: true,
      results,
      model: 'rules',
      latencyMs: 0,
    };
  }

  try {
    const filteredParams: BatchGradeParams = { ...params, candidates: toEvaluate };
    const req = buildBatchGradeRequest(filteredParams);
    const out = await callDecisionApi(req, timeoutMs);
    const graded = evaluateBatchGrade(filteredParams, out.answers);
    Object.assign(results, graded);
    return {
      used: true,
      results,
      model: out.model,
      latencyMs: out.latencyMs,
    };
  } catch (err: any) {
    return { used: false, note: decisionErrorNote(err) };
  }
}
