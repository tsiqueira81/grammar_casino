import { GoogleGenAI, Modality, ThinkingLevel } from '@google/genai';
import { resolveGroqApiKey, callGroqChatCompletion, callGroqOrpheusTts } from '../utils/groqUtils';
import { verifierSchema } from './verifyItem';
import { AI_TIMEOUT_MS, DEFAULT_MODELS, aiBreaker, aiModels, failureReason, withTimeout, type AiCallKind, type AiMeta, type AiProvider } from './providers';

// --- Groq & Gemini Client Setup ---
export let aiClient: GoogleGenAI | null = null;

export function hasConfiguredAiKey(): boolean {
  if (resolveGroqApiKey()) return true;
  const geminiKey = String(process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim();
  return geminiKey.length > 5;
}

export function getAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey || apiKey.trim().startsWith('gsk_')) {
    throw new Error("GEMINI_API_KEY environment variable is not configured.");
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } },
    });
  }
  return aiClient;
}

// Package A2: model names live in server/providers.ts and can be changed with environment variables.
export const TEXT_MODELS = DEFAULT_MODELS.geminiText;
export const TTS_MODELS = DEFAULT_MODELS.geminiTts;

export function mapOrpheusToGeminiVoice(orpheusVoice?: string): string {
  const clean = String(orpheusVoice || "troy").trim().toLowerCase();
  switch (clean) {
    case "troy":
      return "Puck";
    case "austin":
      return "Charon";
    case "daniel":
      return "Fenrir";
    case "autumn":
      return "Kore";
    case "diana":
      return "Aoede";
    case "hannah":
      return "Leda";
    default:
      return "Puck";
  }
}

// Track per-model cooldown timestamps when a model hits 429 quota or 404
export const modelCooldownUntil = new Map<string, number>();

export function getFastThinkingConfig(model: string) {
  if (model === "gemini-3.8-flash") {
    return { thinkingLevel: ThinkingLevel.LOW };
  }
  return undefined;
}

export function isModelNotFound(e: any): boolean {
  if (!e) return false;
  const status = e.status || e.statusCode;
  if (status === 404) return true;
  const msg = String(e.message || "").toLowerCase();
  return msg.includes("404") || msg.includes("not found") || msg.includes("is not supported") || msg.includes("no longer available");
}

export function isQuotaExhausted(e: any): boolean {
  if (!e) return false;
  const status = e.status || e.statusCode;
  if (status === 429) return true;
  const msg = String(e.message || "").toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("resource_exhausted") ||
    msg.includes("quota") ||
    msg.includes("rate limit") ||
    msg.includes("exceeded your current quota")
  );
}

export function isHighTrafficOrOverload(e: any): boolean {
  if (!e) return false;
  if (isQuotaExhausted(e)) return true;
  const status = e.status || e.statusCode;
  if (status === 503 || status === 500) return true;
  const msg = String(e.message || "").toLowerCase();
  return (
    msg.includes("503") ||
    msg.includes("500") ||
    msg.includes("overloaded") ||
    msg.includes("high traffic") ||
    msg.includes("try again") ||
    msg.includes("deadline exceeded")
  );
}

export function extractRetryDelayMs(e: any): number {
  const msg = String(e?.message || "");
  const retryMatch = msg.match(/retry in\s+([0-9.]+)s/i) || msg.match(/"retryDelay"\s*:\s*"([0-9.]+)s"/i);
  if (retryMatch && retryMatch[1]) {
    const parsedSeconds = parseFloat(retryMatch[1]);
    if (!isNaN(parsedSeconds) && parsedSeconds > 0) {
      return Math.min(Math.ceil(parsedSeconds * 1000) + 1500, 5 * 60_000);
    }
  }
  return 60_000; // Default 60s cooldown for 429 RPM quota limits
}

export async function callWithModelRotation<T>(
  models: string[],
  runner: (ai: GoogleGenAI, model: string) => Promise<T>
): Promise<T> {
  const ai = getAIClient();
  let lastError: any = null;
  const now = Date.now();

  const availableModels = models.filter((m) => (modelCooldownUntil.get(m) || 0) <= now);
  if (availableModels.length === 0) {
    const cooldownErr: any = new Error("All upstream Gemini models are currently cooling down from free-tier quota limits.");
    cooldownErr.status = 429;
    cooldownErr.code = "QUOTA_COOLDOWN";
    throw cooldownErr;
  }

  for (const model of availableModels) {
    let attempts = 2;
    let delay = 600;

    while (attempts > 0) {
      try {
        return await runner(ai, model);
      } catch (e: any) {
        lastError = e;
        if (isModelNotFound(e)) {
          // Put unavailable model alias on a 10-minute cooldown and rotate immediately
          modelCooldownUntil.set(model, Date.now() + 10 * 60_000);
          break;
        }
        if (isQuotaExhausted(e)) {
          // Put rate-limited model on cooldown for its requested retryDelay and immediately try next model
          modelCooldownUntil.set(model, Date.now() + extractRetryDelayMs(e));
          break;
        }
        if (isHighTrafficOrOverload(e)) {
          attempts--;
          if (attempts > 0) {
            const jitter = Math.floor(Math.random() * 400);
            await new Promise((resolve) => setTimeout(resolve, delay + jitter));
            delay *= 2;
          }
        } else {
          break;
        }
      }
    }
  }

  throw lastError || new Error("Upstream Gemini API is currently experiencing high load. Please try again.");
}

function hasGeminiKey(): boolean {
  const geminiKey = String(process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim();
  return Boolean(geminiKey) && !geminiKey.startsWith('gsk_');
}

export async function generateAiText(options: {
  prompt: string;
  responseSchema?: any;
  schemaName?: string;
  maxCompletionTokens?: number;
  /** Which time limit applies (package A2). */
  kind?: AiCallKind;
}): Promise<{ text: string; meta: AiMeta }> {
  const kind = options.kind || 'other';
  const timeoutMs = AI_TIMEOUT_MS[kind];
  const started = Date.now();
  const models = aiModels();
  let fallbackReason: string | undefined;
  const groqKey = resolveGroqApiKey();
  if (groqKey && aiBreaker.isOpen('groq')) {
    fallbackReason = 'groq skipped after repeated failures';
  }
  if (groqKey && !fallbackReason) {
    try {
      const out = await withTimeout(
        callGroqChatCompletion({
          apiKey: groqKey,
          prompt: options.prompt,
          responseSchema: options.responseSchema,
          schemaName: options.schemaName,
          maxCompletionTokens: options.maxCompletionTokens,
          models: models.groqText,
        }),
        timeoutMs,
        'groq'
      );
      aiBreaker.recordSuccess('groq');
      return { text: out.text, meta: { provider: 'groq', model: out.model, tokens: out.tokens, latencyMs: Date.now() - started } };
    } catch (groqErr: any) {
      aiBreaker.recordFailure('groq');
      fallbackReason = `groq ${failureReason(groqErr)}`;
      if (!hasGeminiKey()) {
        throw groqErr;
      }
      console.warn('[AI Router] Groq text generation failed, falling back to Gemini:', groqErr?.message);
    }
  }
  if (groqKey && !hasGeminiKey()) {
    // Only Groq is set up and it is resting: let the game use its own bank.
    const err: any = new Error('The AI is resting after repeated failures.');
    err.status = 503;
    throw err;
  }

  let usedModel = '';
  try {
    const out = await withTimeout(geminiText(options, models.geminiText, (m) => (usedModel = m)), timeoutMs, 'gemini');
    aiBreaker.recordSuccess('gemini');
    return { text: out.text, meta: { provider: 'gemini', model: usedModel, latencyMs: Date.now() - started, fallbackReason } };
  } catch (err) {
    aiBreaker.recordFailure('gemini');
    throw err;
  }
}

function geminiText(
  options: { prompt: string; responseSchema?: any },
  models: string[],
  onModel: (model: string) => void
): Promise<{ text: string }> {
  return callWithModelRotation(models, async (ai, model) => {
    onModel(model);
    const config: Record<string, any> = {
      thinkingConfig: getFastThinkingConfig(model),
    };
    if (options.responseSchema) {
      config.responseMimeType = "application/json";
      config.responseSchema = options.responseSchema;
    }
    const resp = await ai.models.generateContent({
      model,
      contents: options.prompt,
      config,
    });
    return { text: resp.text ? resp.text.trim() : "" };
  });
}

export async function generateAiSpeechBase64(safeText: string, requestedVoice?: string): Promise<string> {
  const targetVoice = requestedVoice || process.env.GROQ_TTS_VOICE || "troy";
  const groqKey = resolveGroqApiKey();
  if (groqKey) {
    try {
      return await withTimeout(callGroqOrpheusTts(groqKey, safeText, targetVoice), AI_TIMEOUT_MS.speech, 'groq');
    } catch (groqErr: any) {
      const geminiKey = String(process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim();
      if (!geminiKey || geminiKey.startsWith('gsk_')) {
        throw groqErr;
      }
      console.warn('[AI Router] Groq Orpheus TTS failed, falling back to Gemini Flash-Lite TTS:', groqErr?.message);
    }
  }

  const geminiVoiceName = mapOrpheusToGeminiVoice(targetVoice);
  return await callWithModelRotation(aiModels().geminiTts, async (ai, model) => {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: safeText,
              speechMetadata: {
                style:
                  "Clear, warm, articulate English teacher. Read only the exact text naturally and stop cleanly in silence with no trailing breath or sound.",
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: geminiVoiceName },
          },
        },
      },
    });

    const audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audio) throw new Error("No audio data returned by TTS model.");
    return audio;
  });
}

/**
 * Package A2: is each provider reachable with its key? Lists models (costs no tokens) with a
 * 5-second limit. Answers only names and timings, never keys.
 */
export async function deepHealth(): Promise<Record<string, { ok: boolean; ms: number; detail?: string; resting?: boolean }>> {
  const out: Record<string, { ok: boolean; ms: number; detail?: string; resting?: boolean }> = {};
  const probe = async (name: AiProvider, url: string, headers: Record<string, string>) => {
    const started = Date.now();
    try {
      const res = await withTimeout(fetch(url, { headers }), 5_000, name);
      out[name] = { ok: res.ok, ms: Date.now() - started, detail: res.ok ? undefined : `HTTP ${res.status}`, resting: aiBreaker.isOpen(name) };
    } catch (e) {
      out[name] = { ok: false, ms: Date.now() - started, detail: failureReason(e), resting: aiBreaker.isOpen(name) };
    }
  };
  const groqKey = resolveGroqApiKey();
  const geminiKey = String(process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim();
  const jobs: Promise<void>[] = [];
  if (groqKey) jobs.push(probe('groq', 'https://api.groq.com/openai/v1/models', { Authorization: `Bearer ${groqKey}` }));
  if (hasGeminiKey()) jobs.push(probe('gemini', 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', { 'x-goog-api-key': geminiKey }));
  await Promise.all(jobs);
  return out;
}

/** Deep health needs HEALTH_CHECK_TOKEN set on the server and sent as a Bearer token. */
export function deepHealthAllowed(authorization: string | null | undefined): boolean {
  const token = String(process.env.HEALTH_CHECK_TOKEN || '').trim();
  if (!token) return false;
  return String(authorization || '') === `Bearer ${token}`;
}

/**
 * Package L3: the second model for the cold check. Groq writes with one of its models and checks
 * with the other (no new key). When Groq is down and Gemini wrote the item, only the rules check
 * it, because a second Gemini call would make the class wait.
 */
export function checkWithSecondModel(meta: AiMeta, timeoutMs: number): { model: string; ask: ((prompt: string) => Promise<string>) | null } {
  const groqKey = resolveGroqApiKey();
  if (meta.provider !== 'groq' || !groqKey) return { model: '', ask: null };
  const list = aiModels().groqText;
  const other = list.find((m) => m !== meta.model);
  if (!other) return { model: '', ask: null };
  return {
    model: other,
    ask: async (prompt: string) => {
      const out = await withTimeout(
        callGroqChatCompletion({ apiKey: groqKey, prompt, responseSchema: verifierSchema, schemaName: 'cold_check', maxCompletionTokens: 300, temperature: 0, models: [other] }),
        timeoutMs,
        'groq'
      );
      return out.text;
    },
  };
}
