import { GoogleGenAI, Modality, ThinkingLevel } from '@google/genai';
import { resolveGroqApiKey, callGroqChatCompletion, callGroqOrpheusTts } from '../utils/groqUtils';

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

export const TEXT_MODELS = ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"];
export const TTS_MODELS = [
  "gemini-3.8-flash-lite-tts",
  "gemini-3.8-flash-tts",
  "gemini-3.1-flash-tts-preview",
  "gemini-2.5-flash-preview-tts",
];

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

export async function generateAiText(options: {
  prompt: string;
  responseSchema?: any;
  schemaName?: string;
  maxCompletionTokens?: number;
}): Promise<{ text: string }> {
  const groqKey = resolveGroqApiKey();
  if (groqKey) {
    try {
      return await callGroqChatCompletion({
        apiKey: groqKey,
        prompt: options.prompt,
        responseSchema: options.responseSchema,
        schemaName: options.schemaName,
        maxCompletionTokens: options.maxCompletionTokens,
      });
    } catch (groqErr: any) {
      const geminiKey = String(process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim();
      if (!geminiKey || geminiKey.startsWith('gsk_')) {
        throw groqErr;
      }
      console.warn('[AI Router] Groq text generation failed, falling back to Gemini:', groqErr?.message);
    }
  }

  return await callWithModelRotation(TEXT_MODELS, async (ai, model) => {
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
      return await callGroqOrpheusTts(groqKey, safeText, targetVoice);
    } catch (groqErr: any) {
      const geminiKey = String(process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim();
      if (!geminiKey || geminiKey.startsWith('gsk_')) {
        throw groqErr;
      }
      console.warn('[AI Router] Groq Orpheus TTS failed, falling back to Gemini Flash-Lite TTS:', groqErr?.message);
    }
  }

  const geminiVoiceName = mapOrpheusToGeminiVoice(targetVoice);
  return await callWithModelRotation(TTS_MODELS, async (ai, model) => {
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
