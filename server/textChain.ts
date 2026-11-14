// The AI chain for text (2026-11-14, chosen by the teacher). Writers are tried in this order:
//   1. CoArena  deepseek-v4-1-flash-1017   (key COARENA_WRITER_API_KEY)
//   2. NVIDIA   nemotron 3 ultra           (key NVIDIA_API_KEY)
//   3. Groq     openai/gpt-oss-120b        (key GROQ_API_KEY)
//   4. Gemini   gemini-3.5-flash-lite      (key GEMINI_API_KEY)
// and the offline bank after that (in the game). A different model checks every item blind: on
// CoArena, glm-5-3-flash on a second account (key COARENA_CHECKER_API_KEY); see checkerOrder.
// Keys live only in the server's secrets (Cloudflare Pages > Settings > Variables and Secrets).
import { resolveGroqApiKey, callGroqChatCompletion, convertToStrictJsonSchema, extractJsonFromText, toStrictGroqResponseFormat } from '../utils/groqUtils';
import { AI_CHAIN_BUDGET_MS, AI_TIMEOUT_MS, REASONING_HEADROOM_TOKENS, aiBreaker, aiModels, failureReason, isReasoningModel, parseRetryAfter, withTimeout, type AiCallKind, type AiMeta, type AiProvider, type BreakerKey } from './providers';

export const COARENA_BASE_URL = 'https://coarena.ai/api/v1';
export const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';

const env = (name: string): string => String((typeof process !== 'undefined' ? process.env?.[name] : '') || '').trim();
const usableKey = (k: string) => k.length > 5;

export function coarenaWriterKey(): string {
  return env('COARENA_WRITER_API_KEY');
}
export function coarenaCheckerKey(): string {
  return env('COARENA_CHECKER_API_KEY');
}
export function nvidiaKey(): string {
  return env('NVIDIA_API_KEY');
}
export function geminiKey(): string {
  const k = env('GEMINI_API_KEY') || env('API_KEY');
  return k && !k.startsWith('gsk_') ? k : '';
}

/** One request to an AI, the same shape for every provider. */
export interface TextRequest {
  prompt: string;
  responseSchema?: any;
  schemaName?: string;
  maxCompletionTokens?: number;
  temperature?: number;
}

/** One model on one account. `call` makes the request; the chain adds time limits and the breaker. */
export interface ChainModel {
  provider: AiProvider;
  breaker: BreakerKey;
  /** The model name (or, for Groq and Gemini, the first of the list it rotates through). */
  model: string;
  call: (req: TextRequest, timeoutMs: number) => Promise<{ text: string; model: string; tokens?: number }>;
}

/** Removes a model's thinking (<think>...</think>) and finds the JSON when JSON was asked for. */
export function cleanModelText(raw: string, wantJson: boolean): string {
  const text = String(raw || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*?<\/think>/i, '').trim();
  return wantJson ? extractJsonFromText(text) : text;
}

/**
 * The JSON shape, written into the prompt. A provider without a strict JSON-schema mode (NVIDIA,
 * CoArena's json_object) never sees the schema otherwise, and then invents its own field names:
 * the 2026-11-14 bug where every NVIDIA item came back without "text".
 */
export function schemaInstruction(schema: any): string {
  return `\n\n=== REPLY FORMAT ===\nReply with ONE JSON object that matches this JSON Schema exactly: use these field names, fill every required field, add no other text.\n${JSON.stringify(convertToStrictJsonSchema(schema))}`;
}

/** The required top-level fields the answer lacks (an empty list when it has them all). */
export function missingFields(schema: any, parsed: unknown): string[] {
  const required: string[] = Array.isArray(schema?.required) ? schema.required : Object.keys(schema?.properties || {});
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return ['(not an object)'];
  return required.filter((k) => (parsed as Record<string, unknown>)[k] === undefined);
}

export interface OpenAiCallOptions extends TextRequest {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** 'schema': strict JSON schema; 'object': any JSON; 'prompt': JSON is asked for in words only. */
  jsonMode: 'schema' | 'object' | 'prompt';
  extraBody?: Record<string, unknown>;
}

/**
 * Any OpenAI-compatible chat API (CoArena, NVIDIA). When the provider refuses the JSON setting
 * (HTTP 400), the same request is sent once more with JSON asked for in words, and the answer is
 * cleaned up here.
 */
export async function callOpenAiCompatible(o: OpenAiCallOptions): Promise<{ text: string; model: string; tokens?: number }> {
  const wantJson = Boolean(o.responseSchema);
  let mode = wantJson ? o.jsonMode : 'prompt';
  // A thinking model (gpt-oss) spends tokens on hidden reasoning before it answers: give it room,
  // and ask it to think briefly.
  const thinks = isReasoningModel(o.model);
  let maxTokens = (o.maxCompletionTokens ?? 1024) + (thinks ? REASONING_HEADROOM_TOKENS : 0);
  let raisedTokens = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    const body: Record<string, any> = {
      model: o.model,
      messages: [
        {
          role: 'system',
          content:
            'You are an expert Cambridge English linguistics examiner. Follow all instructions with 100% precision.' +
            (wantJson ? ' Reply with one JSON object only, no other text.' : ''),
        },
        { role: 'user', content: wantJson && mode !== 'schema' ? o.prompt + schemaInstruction(o.responseSchema) : o.prompt },
      ],
      temperature: o.temperature ?? 0.6,
      max_tokens: maxTokens,
      ...(thinks ? { reasoning_effort: 'low' } : {}),
      ...(o.extraBody || {}),
    };
    if (wantJson && mode === 'schema') body.response_format = toStrictGroqResponseFormat(o.responseSchema, o.schemaName || 'grammar_casino_schema');
    if (wantJson && mode === 'object') body.response_format = { type: 'json_object' };
    const res = await fetch(`${o.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${o.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      if (res.status === 400 && wantJson && mode !== 'prompt' && attempt === 0) {
        mode = 'prompt';
        continue;
      }
      const err: any = new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
      err.status = res.status;
      err.retryAfterMs = parseRetryAfter(res.headers?.get?.('retry-after'));
      throw err;
    }
    const data: any = await res.json();
    const choice = data?.choices?.[0];
    const content = choice?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      // A thinking model can spend every token on its hidden reasoning and say nothing.
      const why = choice?.finish_reason === 'length' ? 'ran out of tokens while thinking' : choice?.message?.reasoning_content || choice?.message?.reasoning ? 'only thinking, no answer' : 'empty answer';
      // Once, the same request with twice the room (tokens cost only what is used).
      if (choice?.finish_reason === 'length' && !raisedTokens) {
        raisedTokens = true;
        maxTokens = Math.min(MAX_TOKENS_CEILING, maxTokens * 2);
        continue;
      }
      throw new Error(why);
    }
    const text = cleanModelText(content, wantJson);
    if (wantJson) {
      // A broken or incomplete answer counts as a failure, so the next provider is tried.
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error('answer was not JSON');
      }
      const missing = missingFields(o.responseSchema, parsed);
      if (missing.length) throw new Error(`answer missing ${missing.slice(0, 3).join(', ')}`);
    }
    return { text, model: String(data?.model || o.model), tokens: data?.usage?.total_tokens };
  }
  throw new Error('no answer');
}

/** The most tokens one answer may ask for, also after doubling. */
export const MAX_TOKENS_CEILING = 32_000;

/** Tries each model name in turn when a name is not found (404), so a renamed model still works. */
async function firstModelThatExists(models: string[], run: (model: string) => Promise<{ text: string; model: string; tokens?: number }>) {
  let last: unknown = null;
  for (const model of models) {
    try {
      return await run(model);
    } catch (e: any) {
      last = e;
      if (e?.status !== 404) throw e;
    }
  }
  throw last || new Error('no model');
}

function coarenaModel(role: 'writer' | 'checker'): ChainModel | null {
  const key = role === 'writer' ? coarenaWriterKey() : coarenaCheckerKey();
  if (!usableKey(key)) return null;
  const models = role === 'writer' ? aiModels().coarenaWriter : aiModels().coarenaChecker;
  return {
    provider: 'coarena',
    breaker: role === 'writer' ? 'coarena-writer' : 'coarena-checker',
    model: models[0],
    call: (req) =>
      firstModelThatExists(models, (model) =>
        callOpenAiCompatible({ ...req, baseUrl: env('COARENA_BASE_URL') || COARENA_BASE_URL, apiKey: key, model, jsonMode: 'object' })
      ),
  };
}

function nvidiaModel(): ChainModel | null {
  const key = nvidiaKey();
  if (!usableKey(key)) return null;
  const models = aiModels().nvidiaText;
  return {
    provider: 'nvidia',
    breaker: 'nvidia',
    model: models[0],
    // Nemotron 3 Ultra has no JSON mode; thinking is turned off so it answers quickly.
    call: (req) =>
      firstModelThatExists(models, (model) =>
        callOpenAiCompatible({
          ...req,
          baseUrl: env('NVIDIA_BASE_URL') || NVIDIA_BASE_URL,
          apiKey: key,
          model,
          jsonMode: 'prompt',
          extraBody: { chat_template_kwargs: { enable_thinking: false } },
        })
      ),
  };
}

function groqModel(models: string[]): ChainModel | null {
  const key = resolveGroqApiKey();
  if (!key || !models.length) return null;
  return {
    provider: 'groq',
    breaker: 'groq',
    model: models[0],
    call: (req) =>
      callGroqChatCompletion({
        apiKey: key,
        prompt: req.prompt,
        responseSchema: req.responseSchema,
        schemaName: req.schemaName,
        maxCompletionTokens: req.maxCompletionTokens,
        temperature: req.temperature,
        models,
      }),
  };
}

/** Gemini goes through the existing client with its model rotation (set by aiProviders.ts). */
export type GeminiRunner = (req: TextRequest, models: string[]) => Promise<{ text: string; model: string }>;
let geminiRunner: GeminiRunner | null = null;
export function setGeminiRunner(run: GeminiRunner): void {
  geminiRunner = run;
}

function geminiModel(models: string[]): ChainModel | null {
  if (!geminiKey() || !geminiRunner || !models.length) return null;
  const run = geminiRunner;
  return { provider: 'gemini', breaker: 'gemini', model: models[0], call: (req) => run(req, models) };
}

/** The writers, in the order they are tried. Only those with a key are listed. */
export function writerChain(): ChainModel[] {
  const m = aiModels();
  return [coarenaModel('writer'), nvidiaModel(), groqModel(m.groqText), geminiModel(m.geminiText)].filter((x): x is ChainModel => Boolean(x));
}

export function hasAnyTextKey(): boolean {
  return writerChain().length > 0;
}

/**
 * Who checks what a writer wrote, best first. Always a different model, and on another account
 * where there is one, so the checker cannot share the writer's blind spots or its daily allowance.
 */
export function checkerOrder(writer: AiProvider, writerModel?: string, speed: 'best' | 'fast' = 'best'): ChainModel[] {
  const m = aiModels();
  // Groq checks with its own checker list (gpt-oss-20b first), never the model that wrote the item.
  const groqCheckers = m.groqChecker.filter((x) => x !== writerModel);
  const geminiOther = m.geminiChecker.filter((x) => x !== writerModel);
  const coarenaChecker = coarenaModel('checker');
  const groqChecker = groqModel(groqCheckers);
  const gemini = geminiModel(geminiOther);
  const nvidia = nvidiaModel();
  const order: Record<AiProvider, Array<ChainModel | null>> = {
    coarena: [coarenaChecker, groqChecker, nvidia, gemini],
    nvidia: [coarenaChecker, groqChecker, gemini],
    groq: [groqChecker, coarenaChecker, nvidia, gemini],
    gemini: [gemini, coarenaChecker, groqChecker, nvidia],
  };
  const list = order[writer].filter((x): x is ChainModel => Boolean(x) && x!.model !== writerModel);
  // A sentence the class waits for: the fastest checker first (Groq), the others after it.
  if (speed === 'fast') return [...list.filter((c) => c.provider === 'groq'), ...list.filter((c) => c.provider !== 'groq')];
  return list;
}

/** The first checker that is not resting, or null (then only the rules check the item). */
export function pickChecker(writer: AiProvider, writerModel?: string, now: number = Date.now(), speed: 'best' | 'fast' = 'best'): ChainModel | null {
  return checkerOrder(writer, writerModel, speed).find((c) => !aiBreaker.isOpen(c.breaker, now)) || null;
}

/** "coarena-writer resting, 85 s left": a provider skipped because it is resting, for the log. */
export function restingNote(key: BreakerKey, now: number = Date.now()): string {
  const left = Math.max(0, Math.round((aiBreaker.restingUntil(key) - now) / 1000));
  return left ? `${key} resting, ${left} s left` : `${key} resting`;
}

/** "coarena-writer still busy after 6.3 s": another model answered first, for the log. */
export function stillBusyNote(key: BreakerKey, started: number, now: number = Date.now()): string {
  return `${key} still busy after ${((now - started) / 1000).toFixed(1)} s`;
}

/** Runs one model with its time limit and tells the breaker how it went. */
export async function runOnce(model: ChainModel, req: TextRequest, timeoutMs: number) {
  try {
    const out = await withTimeout(model.call(req, timeoutMs), timeoutMs, model.breaker);
    aiBreaker.recordSuccess(model.breaker);
    return out;
  } catch (err: any) {
    // A busy provider (429) rests at once, for as long as it asked, instead of being asked again.
    if (err?.status === 429) err.restedMs = aiBreaker.recordBusy(model.breaker, err.retryAfterMs);
    else aiBreaker.recordFailure(model.breaker);
    throw err;
  }
}

/**
 * The blind check (2026-11-14): the first checker that is not resting is asked; when it fails the
 * next one is asked at once, and when it is still busy after `hedgeAfterMs` the next one starts as
 * well. The first answer counts. `onModel` learns which checker answered, for the debug log.
 */
export function runCheckers(
  checkers: ChainModel[],
  req: TextRequest,
  opts: { timeoutMs: number; hedgeAfterMs?: number; onModel?: (model: string) => void; onNotes?: (notes: string[]) => void }
): Promise<string> {
  const started = Date.now();
  const deadline = started + opts.timeoutMs;
  const reasons: string[] = [];
  const usable = checkers.filter((c) => {
    if (!aiBreaker.isOpen(c.breaker)) return true;
    reasons.push(restingNote(c.breaker));
    return false;
  });
  const busy = new Set<ChainModel>();
  return new Promise((resolve, reject) => {
    let next = 0;
    let running = 0;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fail = () => {
      if (done || running > 0 || next < usable.length) return;
      done = true;
      clearTimeout(timer);
      opts.onNotes?.(reasons);
      reject(new Error(reasons.length ? reasons.join('; ') : 'no checker'));
    };
    const launch = () => {
      if (done) return;
      const left = deadline - Date.now();
      if (next >= usable.length || left < 500) {
        next = usable.length;
        return fail();
      }
      const model = usable[next++];
      running++;
      busy.add(model);
      clearTimeout(timer);
      if (opts.hedgeAfterMs && next < usable.length) timer = setTimeout(launch, opts.hedgeAfterMs);
      runOnce(model, req, left).then(
        (out) => {
          running--;
          busy.delete(model);
          if (done) return;
          done = true;
          clearTimeout(timer);
          busy.forEach((m) => reasons.push(stillBusyNote(m.breaker, started)));
          opts.onModel?.(out.model || model.model);
          opts.onNotes?.(reasons);
          resolve(out.text);
        },
        (err) => {
          running--;
          busy.delete(model);
          reasons.push(`${model.breaker} ${failureReason(err)}`);
          if (done) return;
          if (next < usable.length) launch();
          else fail();
        }
      );
    };
    launch();
  });
}

/**
 * Walks the writer chain until one answers. Every provider that is skipped or fails adds to the
 * reason in the debug log ("coarena-writer 429; nvidia timeout"). All of them failing throws, and
 * the game deals from its offline bank.
 */
export async function runWriterChain(req: TextRequest, kind: AiCallKind, chain: ChainModel[] = writerChain()): Promise<{ text: string; meta: AiMeta }> {
  if (kind === 'generate') return runHedgedChain(req, chain);
  const started = Date.now();
  const deadline = started + AI_CHAIN_BUDGET_MS[kind];
  const reasons: string[] = [];
  let lastError: unknown = null;
  for (const model of chain) {
    if (aiBreaker.isOpen(model.breaker)) {
      reasons.push(restingNote(model.breaker));
      continue;
    }
    const left = deadline - Date.now();
    if (left < 1_000) {
      reasons.push('out of time');
      break;
    }
    try {
      const out = await runOnce(model, req, Math.min(AI_TIMEOUT_MS[kind], left));
      return {
        text: out.text,
        meta: {
          provider: model.provider,
          model: out.model,
          tokens: out.tokens,
          latencyMs: Date.now() - started,
          fallbackReason: reasons.length ? reasons.join('; ') : undefined,
          chain: chain.map((m) => m.breaker).join(','),
        },
      };
    } catch (err) {
      lastError = err;
      reasons.push(`${model.breaker} ${failureReason(err)}`);
      console.warn(`[AI chain] ${model.breaker} failed, trying the next one:`, failureReason(err));
    }
  }
  const err: any =
    lastError instanceof Error
      ? lastError
      : new Error(chain.length ? 'The AI is resting after repeated failures.' : 'No AI provider could answer.');
  err.chainReasons = reasons;
  err.chainConfigured = chain.map((m) => m.breaker).join(',');
  if (!err.status) err.status = 503;
  throw err;
}

/** A new sentence: when a writer has not answered after this long, the next one starts as well. */
export const HEDGE_AFTER_MS = 1_500;

/**
 * For a sentence the class is waiting for (2026-11-14). The 7 s budget is too short to wait for a
 * slow writer and then try the next one in turn, so writers start one after another, 1.5 s apart
 * (or at once when the one before fails), and the first good answer wins. A slow CoArena then
 * costs the class nothing: NVIDIA is already on it.
 */
export function runHedgedChain(req: TextRequest, chain: ChainModel[] = writerChain()): Promise<{ text: string; meta: AiMeta }> {
  const started = Date.now();
  const deadline = started + AI_CHAIN_BUDGET_MS.generate;
  const reasons: string[] = [];
  const usable = chain.filter((m) => {
    if (!aiBreaker.isOpen(m.breaker)) return true;
    reasons.push(restingNote(m.breaker));
    return false;
  });
  const failure = (lastError: unknown) => {
    const err: any =
      lastError instanceof Error ? lastError : new Error(chain.length ? 'The AI is resting after repeated failures.' : 'No AI provider could answer.');
    err.chainReasons = reasons;
    err.chainConfigured = chain.map((m) => m.breaker).join(',');
    if (!err.status) err.status = 503;
    return err;
  };
  return new Promise((resolve, reject) => {
    let next = 0;
    let running = 0;
    const busy = new Set<ChainModel>();
    let done = false;
    let lastError: unknown = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settleIfOver = () => {
      if (!done && running === 0 && next >= usable.length) {
        done = true;
        clearTimeout(timer);
        reject(failure(lastError));
      }
    };
    const launch = () => {
      if (done || next >= usable.length) return settleIfOver();
      const left = deadline - Date.now();
      if (left < 1_000) {
        reasons.push('out of time');
        next = usable.length;
        return settleIfOver();
      }
      const model = usable[next++];
      running++;
      busy.add(model);
      clearTimeout(timer);
      timer = setTimeout(launch, HEDGE_AFTER_MS);
      runOnce(model, req, Math.min(AI_TIMEOUT_MS.generate, left)).then(
        (out) => {
          running--;
          busy.delete(model);
          if (done) return;
          done = true;
          clearTimeout(timer);
          // A writer that started earlier and has not answered yet is named, so the log shows why
          // it was not used (2026-11-14: CoArena was "skipped" with no reason).
          busy.forEach((m) => reasons.push(stillBusyNote(m.breaker, started)));
          resolve({
            text: out.text,
            meta: {
              provider: model.provider,
              model: out.model,
              tokens: out.tokens,
              latencyMs: Date.now() - started,
              fallbackReason: reasons.length ? reasons.join('; ') : undefined,
              chain: chain.map((m) => m.breaker).join(','),
            },
          });
        },
        (err) => {
          running--;
          busy.delete(model);
          lastError = err;
          reasons.push(`${model.breaker} ${failureReason(err)}`);
          if (done) return;
          if (next < usable.length) launch();
          else settleIfOver();
        }
      );
    };
    if (!usable.length) {
      done = true;
      reject(failure(null));
      return;
    }
    launch();
  });
}
