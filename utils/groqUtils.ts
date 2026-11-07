import fs from 'fs';
import path from 'path';

export const GROQ_CHAT_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions';
export const GROQ_AUDIO_SPEECH_URL = 'https://api.groq.com/openai/v1/audio/speech';

export const GROQ_TEXT_MODEL = 'openai/gpt-oss-120b';
export const GROQ_TEXT_FALLBACK_MODELS = ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile'];
export const GROQ_TTS_MODEL = 'canopylabs/orpheus-v1-english';

export const VALID_ORPHEUS_VOICES = ['troy', 'autumn', 'diana', 'hannah', 'austin', 'daniel'] as const;
export type OrpheusVoice = (typeof VALID_ORPHEUS_VOICES)[number];

export const ORPHEUS_MAX_INPUT_CHARS = 190; // Orpheus hard limit is 200 chars; 190 gives a safe margin

export function resolveOrpheusVoice(envVoice?: string): OrpheusVoice {
  const cleaned = String(envVoice || process.env.GROQ_TTS_VOICE || 'troy')
    .trim()
    .toLowerCase();
  if ((VALID_ORPHEUS_VOICES as readonly string[]).includes(cleaned)) {
    return cleaned as OrpheusVoice;
  }
  return 'troy';
}

/**
 * Resolves the active Groq API key from GROQ_API_KEY, or from GEMINI_API_KEY / API_KEY / customKey
 * if the user dropped a `gsk_...` key into their existing key slot.
 */
export function resolveGroqApiKey(customKey?: string | null): string | null {
  const candidates = [
    customKey,
    process.env.GROQ_API_KEY,
    process.env.GEMINI_API_KEY,
    process.env.API_KEY,
  ];
  for (const raw of candidates) {
    const trimmed = String(raw || '').trim();
    if (trimmed && trimmed.startsWith('gsk_')) {
      return trimmed;
    }
  }
  const explicitGroq = String(process.env.GROQ_API_KEY || '').trim();
  if (explicitGroq.length > 5) {
    return explicitGroq;
  }
  return null;
}

/**
 * Splits any text into natural sentence/clause/word chunks where every chunk is
 * strictly <= maxChars (default 190 chars, safely below Orpheus's 200-char limit).
 */
export function chunkTextForOrpheusTts(text: string, maxChars: number = ORPHEUS_MAX_INPUT_CHARS): string[] {
  const normalized = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  // 1. Split on sentence boundaries (. ! ?)
  const sentences = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  const pushOrSplitSub = (segment: string) => {
    const seg = segment.trim();
    if (!seg) return;

    if (seg.length <= maxChars) {
      if (!current) {
        current = seg;
      } else if (current.length + 1 + seg.length <= maxChars) {
        current = `${current} ${seg}`;
      } else {
        chunks.push(current);
        current = seg;
      }
      return;
    }

    // Flush current before breaking down oversized segment
    if (current) {
      chunks.push(current);
      current = '';
    }

    // 2. Split oversized sentence on clause punctuation (, ; : — -)
    const clauses = seg.split(/(?<=[,;:\u2014-])\s+/).filter(Boolean);
    if (clauses.length > 1) {
      for (const clause of clauses) {
        if (clause.length <= maxChars) {
          if (!current) {
            current = clause;
          } else if (current.length + 1 + clause.length <= maxChars) {
            current = `${current} ${clause}`;
          } else {
            chunks.push(current);
            current = clause;
          }
        } else {
          if (current) {
            chunks.push(current);
            current = '';
          }
          splitByWords(clause);
        }
      }
      return;
    }

    // 3. Split by words
    splitByWords(seg);
  };

  const splitByWords = (textSegment: string) => {
    const words = textSegment.split(/\s+/).filter(Boolean);
    for (const word of words) {
      if (word.length > maxChars) {
        if (current) {
          chunks.push(current);
          current = '';
        }
        for (let i = 0; i < word.length; i += maxChars) {
          chunks.push(word.slice(i, i + maxChars));
        }
      } else if (!current) {
        current = word;
      } else if (current.length + 1 + word.length <= maxChars) {
        current = `${current} ${word}`;
      } else {
        chunks.push(current);
        current = word;
      }
    }
  };

  for (const sentence of sentences) {
    pushOrSplitSub(sentence);
  }
  if (current) {
    chunks.push(current);
  }

  return chunks;
}

interface ParsedWav {
  audioFormat: number;
  numChannels: number;
  sampleRate: number;
  byteRate: number;
  blockAlign: number;
  bitsPerSample: number;
  pcmData: Buffer;
}

/**
 * Extracts format metadata and the raw PCM `data` subchunk from a RIFF WAVE buffer.
 */
export function parseWavBuffer(buf: Buffer): ParsedWav {
  if (!buf || buf.length < 44) {
    throw new Error('Invalid WAV buffer: shorter than 44 bytes.');
  }
  const riff = buf.toString('ascii', 0, 4);
  const wave = buf.toString('ascii', 8, 12);
  if (riff !== 'RIFF' || wave !== 'WAVE') {
    throw new Error('Invalid WAV buffer: missing RIFF/WAVE header.');
  }

  let audioFormat = 1;
  let numChannels = 1;
  let sampleRate = 24000;
  let byteRate = 48000;
  let blockAlign = 2;
  let bitsPerSample = 16;
  let pcmData: Buffer | null = null;

  let offset = 12;
  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString('ascii', offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    const dataStart = offset + 8;

    if (chunkId === 'fmt ' && dataStart + 16 <= buf.length) {
      audioFormat = buf.readUInt16LE(dataStart);
      numChannels = buf.readUInt16LE(dataStart + 2);
      sampleRate = buf.readUInt32LE(dataStart + 4);
      byteRate = buf.readUInt32LE(dataStart + 8);
      blockAlign = buf.readUInt16LE(dataStart + 12);
      bitsPerSample = buf.readUInt16LE(dataStart + 14);
    } else if (chunkId === 'data') {
      const safeEnd = Math.min(buf.length, dataStart + chunkSize);
      pcmData = buf.subarray(dataStart, safeEnd);
      break;
    }

    // Word-aligned step
    const paddedSize = chunkSize + (chunkSize % 2);
    offset = dataStart + paddedSize;
  }

  if (!pcmData) {
    // Fallback to standard 44-byte offset if no explicit data chunk was matched
    pcmData = buf.subarray(44);
  }

  return {
    audioFormat,
    numChannels,
    sampleRate,
    byteRate,
    blockAlign,
    bitsPerSample,
    pcmData,
  };
}

/**
 * Stitches one or more RIFF WAVE buffers from Orpheus TTS into a single seamless RIFF WAVE buffer.
 */
export function stitchWavBuffers(wavBuffers: Buffer[]): Buffer {
  if (!wavBuffers || wavBuffers.length === 0) {
    throw new Error('No WAV buffers provided to stitch.');
  }
  if (wavBuffers.length === 1) {
    return wavBuffers[0];
  }

  const parsedList = wavBuffers.map(parseWavBuffer);
  const first = parsedList[0];
  const combinedPcm = Buffer.concat(parsedList.map((p) => p.pcmData));

  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 4, 'ascii');
  header.writeUInt32LE(36 + combinedPcm.length, 4);
  header.write('WAVE', 8, 4, 'ascii');
  header.write('fmt ', 12, 4, 'ascii');
  header.writeUInt32LE(16, 16); // PCM fmt chunk size
  header.writeUInt16LE(first.audioFormat, 20);
  header.writeUInt16LE(first.numChannels, 22);
  header.writeUInt32LE(first.sampleRate, 24);
  header.writeUInt32LE(first.byteRate, 28);
  header.writeUInt16LE(first.blockAlign, 32);
  header.writeUInt16LE(first.bitsPerSample, 34);
  header.write('data', 36, 4, 'ascii');
  header.writeUInt32LE(combinedPcm.length, 40);

  return Buffer.concat([header, combinedPcm]);
}

/**
 * Converts a @google/genai schema definition into a strict OpenAI / Groq JSON Schema
 * suitable for `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }`.
 * Ensures every object has `additionalProperties: false` and `required` contains all keys in `properties`.
 */
export function convertToStrictJsonSchema(node: any): any {
  if (!node || typeof node !== 'object') {
    return { type: 'string' };
  }

  const rawType = String(node.type || 'OBJECT').toLowerCase();
  const result: Record<string, any> = {
    type: rawType,
  };

  if (node.description) {
    result.description = node.description;
  }

  if (rawType === 'object') {
    const props = node.properties || {};
    const convertedProps: Record<string, any> = {};
    const allKeys = Object.keys(props);
    for (const key of allKeys) {
      convertedProps[key] = convertToStrictJsonSchema(props[key]);
    }
    result.properties = convertedProps;
    result.required = allKeys;
    result.additionalProperties = false;
  } else if (rawType === 'array') {
    result.items = convertToStrictJsonSchema(node.items || { type: 'string' });
  }

  return result;
}

export function toStrictGroqResponseFormat(geminiSchema: any, schemaName: string = 'grammar_casino_response') {
  return {
    type: 'json_schema' as const,
    json_schema: {
      name: schemaName,
      strict: true,
      schema: convertToStrictJsonSchema(geminiSchema),
    },
  };
}

/**
 * Strips optional markdown code fences or surrounding prose from a JSON response string.
 */
export function extractJsonFromText(raw: string): string {
  const trimmed = String(raw || '').trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1]) {
    return fenceMatch[1].trim();
  }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

/**
 * Parses Groq's rate-limit retry delay (e.g. "Please try again in 2.45s" or "150ms").
 */
export function extractGroqRetryDelayMs(errorMessage: string, retryAfterHeader?: string | null): number {
  if (retryAfterHeader) {
    const sec = parseFloat(retryAfterHeader);
    if (!isNaN(sec) && sec > 0) {
      return Math.min(Math.ceil(sec * 1000) + 350, 60_000);
    }
  }
  const msg = String(errorMessage || '');
  const msMatch = msg.match(/try again in\s+([0-9.]+)ms/i);
  if (msMatch && msMatch[1]) {
    return Math.min(Math.ceil(parseFloat(msMatch[1])) + 250, 60_000);
  }
  const secMatch = msg.match(/try again in\s+([0-9.]+)s/i);
  if (secMatch && secMatch[1]) {
    return Math.min(Math.ceil(parseFloat(secMatch[1]) * 1000) + 400, 60_000);
  }
  return 4_000;
}

export interface GroqChatOptions {
  apiKey: string;
  prompt: string;
  systemPrompt?: string;
  responseSchema?: any;
  schemaName?: string;
  maxCompletionTokens?: number;
  temperature?: number;
}

/**
 * Calls Groq's `openai/gpt-oss-120b` model with `reasoning_effort: "low"` (to protect the 8,000 TPM
 * free-tier limit) and strict JSON Schema enforcement when `responseSchema` is provided.
 */
export async function callGroqChatCompletion(options: GroqChatOptions): Promise<{ text: string }> {
  const {
    apiKey,
    prompt,
    systemPrompt = 'You are an expert Cambridge English linguistics examiner. Follow all instructions with 100% precision.',
    responseSchema,
    schemaName = 'grammar_casino_schema',
    maxCompletionTokens = 1024,
    temperature = 0.6,
  } = options;

  let lastError: any = null;

  for (const model of GROQ_TEXT_FALLBACK_MODELS) {
    let useStrictSchema = Boolean(responseSchema);
    let attempts = 2;

    while (attempts > 0) {
      attempts--;
      try {
        const body: Record<string, any> = {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          temperature,
          max_completion_tokens: maxCompletionTokens,
        };

        if (model.startsWith('openai/gpt-oss')) {
          body.reasoning_effort = 'low';
        }

        if (responseSchema) {
          if (useStrictSchema) {
            body.response_format = toStrictGroqResponseFormat(responseSchema, schemaName);
          } else {
            body.response_format = { type: 'json_object' };
          }
        }

        const res = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errText = await res.text();
          // If json_schema is not supported by a fallback model or fails validation, retry immediately with json_object
          if (res.status === 400 && useStrictSchema && responseSchema) {
            useStrictSchema = false;
            attempts++;
            continue;
          }
          if (res.status === 429 && attempts > 0) {
            const waitMs = extractGroqRetryDelayMs(errText, res.headers.get('retry-after'));
            if (waitMs <= 8000) {
              await new Promise((r) => setTimeout(r, waitMs));
              continue;
            }
          }
          const err: any = new Error(`Groq Chat API Error (${res.status}): ${errText.slice(0, 300)}`);
          err.status = res.status;
          throw err;
        }

        const data: any = await res.json();
        const rawContent = data?.choices?.[0]?.message?.content || '';
        const text = responseSchema ? extractJsonFromText(rawContent) : String(rawContent).trim();
        if (!text) {
          throw new Error('Empty response content returned by Groq model.');
        }
        return { text };
      } catch (e: any) {
        lastError = e;
        if (e?.status === 401 || e?.status === 403) {
          throw e;
        }
      }
    }
  }

  throw lastError || new Error('Groq text generation failed across all available models.');
}

/**
 * Generates seamless WAV audio (returned as base64) using Groq's `canopylabs/orpheus-v1-english`.
 * Automatically chunks inputs longer than 190 chars to respect Orpheus's 200-char limit and
 * stitches the resulting WAV PCM buffers into a single RIFF WAVE file.
 */
export async function callGroqOrpheusTts(
  apiKey: string,
  text: string,
  voice?: string
): Promise<string> {
  const chunks = chunkTextForOrpheusTts(text, ORPHEUS_MAX_INPUT_CHARS);
  if (chunks.length === 0) {
    throw new Error('Cannot generate speech for empty text.');
  }

  const resolvedVoice = resolveOrpheusVoice(voice);
  const wavBuffers: Buffer[] = [];

  for (const chunk of chunks) {
    let attempts = 2;
    let chunkBuffer: Buffer | null = null;
    let lastErr: any = null;

    while (attempts > 0) {
      attempts--;
      try {
        const res = await fetch(GROQ_AUDIO_SPEECH_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: GROQ_TTS_MODEL,
            input: chunk,
            voice: resolvedVoice,
            response_format: 'wav',
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          if (res.status === 429 && attempts > 0) {
            const waitMs = extractGroqRetryDelayMs(errText, res.headers.get('retry-after'));
            if (waitMs <= 8000) {
              await new Promise((r) => setTimeout(r, waitMs));
              continue;
            }
          }
          const err: any = new Error(`Groq Orpheus TTS Error (${res.status}): ${errText.slice(0, 300)}`);
          err.status = res.status;
          throw err;
        }

        const arrayBuf = await res.arrayBuffer();
        chunkBuffer = Buffer.from(arrayBuf);
        break;
      } catch (e: any) {
        lastErr = e;
      }
    }

    if (!chunkBuffer) {
      throw lastErr || new Error('Failed to synthesize TTS chunk via Groq Orpheus.');
    }
    wavBuffers.push(chunkBuffer);
  }

  const stitchedWav = stitchWavBuffers(wavBuffers);
  return stitchedWav.toString('base64');
}

/**
 * Simple persistent disk cache helper so Orpheus TTS audio and detailed grammar explanations
 * survive server restarts and conserve the 100 RPD / 3,600 TPD free tier quota.
 */
export class PersistentAiCache {
  private filePath: string;
  private memory = new Map<string, { data: any; expiresAt: number }>();
  private maxEntries: number;
  private dirty = false;

  constructor(filePath: string, maxEntries = 300) {
    this.filePath = filePath;
    this.maxEntries = maxEntries;
    this.loadFromDisk();
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
        const now = Date.now();
        if (raw && typeof raw === 'object') {
          for (const [k, v] of Object.entries(raw)) {
            const entry = v as any;
            if (entry && typeof entry.expiresAt === 'number' && entry.expiresAt > now) {
              this.memory.set(k, { data: entry.data, expiresAt: entry.expiresAt });
            }
          }
        }
      }
    } catch {
      // Ignore corrupt or missing cache file
    }
  }

  public get(key: string): any | null {
    const entry = this.memory.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return entry.data;
  }

  public set(key: string, data: any, ttlMs: number = 24 * 60 * 60 * 1000) {
    const now = Date.now();
    this.memory.set(key, { data, expiresAt: now + ttlMs });
    if (this.memory.size > this.maxEntries) {
      const oldestKey = this.memory.keys().next().value;
      if (oldestKey) this.memory.delete(oldestKey);
    }
    this.dirty = true;
    this.flushToDiskAsync();
  }

  private flushToDiskAsync() {
    if (!this.dirty) return;
    this.dirty = false;
    try {
      const serialized: Record<string, { data: any; expiresAt: number }> = {};
      const now = Date.now();
      for (const [k, v] of this.memory.entries()) {
        if (v.expiresAt > now) {
          serialized[k] = v;
        }
      }
      fs.writeFile(this.filePath, JSON.stringify(serialized), 'utf-8', () => {});
    } catch {
      // Ignore read-only filesystem errors
    }
  }
}
