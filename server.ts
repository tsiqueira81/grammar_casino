import fs from 'fs';
import path from 'path';
import http from 'http';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import express, { Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Type, Modality, ThinkingLevel } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '10mb' }));

// --- Teacher PIN Gate for Live Gemini AI (Offline-Only Fallback for Students) ---
const TEACHER_PIN_FILE = path.resolve(__dirname, '.teacher-pin.json');
// No default PIN: if TEACHER_PIN is not set (and no saved PIN file exists), Live AI stays locked
// and the game runs on the free Offline Curated Bank.
let activeTeacherPin = (process.env.TEACHER_PIN || '').trim();

try {
  if (fs.existsSync(TEACHER_PIN_FILE)) {
    const saved = JSON.parse(fs.readFileSync(TEACHER_PIN_FILE, 'utf-8'));
    if (saved && typeof saved.pin === 'string' && saved.pin.trim().length >= 4) {
      activeTeacherPin = saved.pin.trim();
    }
  }
} catch (err) {
  console.warn('Could not read .teacher-pin.json, using env TEACHER_PIN (if set).');
}

// Cryptographic session token issued when teacher.siqueira@gmail.com signs in via Google OAuth
const googleVerifiedSessionToken = `gauth_${crypto.randomBytes(24).toString("hex")}`;

function isPinConfigured(): boolean {
  return activeTeacherPin.length > 0;
}

const PIN_NOT_CONFIGURED_ERROR =
  'No Teacher PIN is set on this server. Sign in with the teacher Google account or add TEACHER_PIN to the server environment (.env).';

function safeTimingEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function verifyPinMatch(candidate: string): boolean {
  const cleanCandidate = String(candidate || '').trim();
  if (!cleanCandidate) return false;
  if (safeTimingEqual(cleanCandidate, googleVerifiedSessionToken)) return true;
  if (activeTeacherPin && safeTimingEqual(cleanCandidate, activeTeacherPin)) return true;
  return false;
}

// Strict PIN Brute-Force Lockout (5 failed attempts per 15 minutes per IP)
interface PinAttemptState {
  failedCount: number;
  firstFailedAt: number;
  lockedUntil: number;
}

const PIN_MAX_FAILED_ATTEMPTS = 5;
const PIN_WINDOW_MS = 15 * 60 * 1000;
const PIN_LOCKOUT_MS = 15 * 60 * 1000;
const pinAttemptsByIp = new Map<string, PinAttemptState>();

function getClientIp(req: Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket.remoteAddress || '127.0.0.1';
}

function checkPinLockout(ip: string): { locked: boolean; retryAfterSec?: number } {
  const state = pinAttemptsByIp.get(ip);
  if (!state) return { locked: false };
  const now = Date.now();
  if (state.lockedUntil > now) {
    return {
      locked: true,
      retryAfterSec: Math.ceil((state.lockedUntil - now) / 1000),
    };
  }
  if (now - state.firstFailedAt > PIN_WINDOW_MS) {
    pinAttemptsByIp.delete(ip);
  }
  return { locked: false };
}

function recordPinOutcome(ip: string, success: boolean): { locked: boolean; retryAfterSec?: number } {
  if (success) {
    pinAttemptsByIp.delete(ip);
    return { locked: false };
  }
  const now = Date.now();
  let state = pinAttemptsByIp.get(ip);
  if (!state || now - state.firstFailedAt > PIN_WINDOW_MS) {
    state = { failedCount: 1, firstFailedAt: now, lockedUntil: 0 };
  } else {
    state.failedCount += 1;
  }
  if (state.failedCount >= PIN_MAX_FAILED_ATTEMPTS) {
    state.lockedUntil = now + PIN_LOCKOUT_MS;
  }
  pinAttemptsByIp.set(ip, state);
  if (state.lockedUntil > now) {
    return {
      locked: true,
      retryAfterSec: Math.ceil((state.lockedUntil - now) / 1000),
    };
  }
  return { locked: false };
}

function isTeacherAuthorized(req: Request, payload?: any): boolean {
  const ip = getClientIp(req);
  if (checkPinLockout(ip).locked) return false;
  const headerPin = req.headers['x-teacher-pin'];
  const rawPin = Array.isArray(headerPin) ? headerPin[0] : headerPin || payload?.teacherPin || '';
  const candidate = String(rawPin).trim();
  if (!candidate) return false;
  const matched = verifyPinMatch(candidate);
  recordPinOutcome(ip, matched);
  return matched;
}

// --- Rate Limiting & Abuse Protection ---
interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
}

const RATE_LIMIT_CAPACITY = 40;
const REFILL_RATE_PER_MS = RATE_LIMIT_CAPACITY / 60000;
const ipBuckets = new Map<string, RateLimitBucket>();

let activeRequests = 0;
const MAX_CONCURRENT_REQUESTS = 10;

interface CacheEntry {
  data: any;
  expiresAt: number;
}
const responseCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15 * 60 * 1000;

function cleanupCache() {
  const now = Date.now();
  for (const [key, entry] of responseCache.entries()) {
    if (entry.expiresAt < now) {
      responseCache.delete(key);
    }
  }
  if (responseCache.size > 200) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey) responseCache.delete(oldestKey);
  }
}

function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  let bucket = ipBuckets.get(ip);
  if (!bucket) {
    bucket = { tokens: RATE_LIMIT_CAPACITY, lastRefill: now };
    ipBuckets.set(ip, bucket);
  } else {
    const elapsed = now - bucket.lastRefill;
    bucket.tokens = Math.min(RATE_LIMIT_CAPACITY, bucket.tokens + elapsed * REFILL_RATE_PER_MS);
    bucket.lastRefill = now;
  }

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { allowed: true };
  }

  const waitMs = Math.ceil((1 - bucket.tokens) / REFILL_RATE_PER_MS);
  return { allowed: false, retryAfter: Math.ceil(waitMs / 1000) };
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of ipBuckets.entries()) {
    if (now - bucket.lastRefill > 120000 && bucket.tokens >= RATE_LIMIT_CAPACITY - 1) {
      ipBuckets.delete(ip);
    }
  }
}, 60000);

// --- Gemini Client Setup ---
let aiClient: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
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

const TEXT_MODELS = ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"];
const TTS_MODELS = ["gemini-3.8-flash-lite-tts", "gemini-3.8-flash-tts"];

// Track per-model cooldown timestamps when a model hits 429 quota or 404
const modelCooldownUntil = new Map<string, number>();

function getFastThinkingConfig(model: string) {
  if (model === "gemini-3.8-flash") {
    return { thinkingLevel: ThinkingLevel.LOW };
  }
  return undefined;
}

function isModelNotFound(e: any): boolean {
  if (!e) return false;
  const status = e.status || e.statusCode;
  if (status === 404) return true;
  const msg = String(e.message || "").toLowerCase();
  return msg.includes("404") || msg.includes("not found") || msg.includes("is not supported") || msg.includes("no longer available");
}

function isQuotaExhausted(e: any): boolean {
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

function isHighTrafficOrOverload(e: any): boolean {
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

function extractRetryDelayMs(e: any): number {
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

async function callWithModelRotation<T>(
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

// --- CEFR Linguistic Profiles ---
interface CefrProfile {
  syntax: string;
  lexis: string;
  mistakeIdentification: string;
  targetLength: string;
}

const CEFR_PROFILES: Record<string, CefrProfile> = {
  A1: {
    syntax:
      'Elementary, basic SVO clauses only (6-10 words). Present simple of be/have/common action verbs or past simple of be. Only basic coordinating conjunctions ("and", "or"). Strictly NO subordinate clauses, NO relative clauses, NO passive voice.',
    lexis:
      "Beginner, high-frequency everyday vocabulary (family, numbers, colors, basic food, daily routines). Avoid abstract, specialized, or idiomatic vocabulary.",
    mistakeIdentification:
      'Glaring, obvious, and immediate to identify (e.g., "She have two cats", "I no like tea", "more big"). No subtle traps.',
    targetLength: "6-10 words",
  },
  A2: {
    syntax:
      'Simple compound and basic complex sentences (8-14 words). Basic time clauses ("when", "before", "after") and elementary cause-and-effect connectors ("because", "so").',
    lexis:
      "Everyday vocabulary for familiar topics (routine, shopping, travel, basic professions, weather). Simple, transparent collocations only.",
    mistakeIdentification:
      'Clear, direct, and easily detectable (e.g., "She buyed a car", "in Monday", "I didn\'t see nobody").',
    targetLength: "8-14 words",
  },
  B1: {
    syntax:
      'Intermediate multi-clause sentences (12-18 words). Standard relative clauses ("who", "which", "that"), first/second conditionals, modal auxiliaries, present perfect vs past simple.',
    lexis:
      'Practical, functional vocabulary for everyday communication, hobbies, opinions, and work. Common phrasal verbs ("give up", "look for") and fixed prepositional expressions.',
    mistakeIdentification:
      'Moderately distinguishable (e.g., "I have arrived yesterday", "interested on", "we must to go").',
    targetLength: "12-18 words",
  },
  B2: {
    syntax:
      "Upper-intermediate multi-clause sentences (16-24 words). Varied clause openers, passive voice constructions, third conditionals, concession clauses, reported speech backshifts, gerund vs infinitive patterns.",
    lexis:
      "Rich, diverse vocabulary covering abstract nouns, workplace and societal themes, nuanced phrasal verbs, and dependent prepositions.",
    mistakeIdentification:
      'Challenging and nuanced (e.g., "despite" + full clause without "the fact that", state verbs in progressive, "insisted in going").',
    targetLength: "16-24 words",
  },
  C1: {
    syntax:
      'Sophisticated, dense syntactic architecture (20-30 words). Negative inversion ("Seldom have we seen..."), cleft sentences, mixed conditionals, participle clauses, nominalizations, modal perfects.',
    lexis:
      "Advanced academic, literary, and professional vocabulary. Low-frequency adjectives and verbs, sophisticated collocations, nuanced register, precise discourse markers.",
    mistakeIdentification:
      'Subtle and deceptive (e.g., "Rarely she had observed...", subjunctive mood violations, dangling participle modifiers, "indifferent at").',
    targetLength: "20-30 words",
  },
  C2: {
    syntax:
      'Masterful, intricate native-level syntax (22-35 words). Stylistic inversion, fronting of prepositional phrases, conditional inversion without "if", balanced rhetorical parallelism, embedded parentheticals.',
    lexis:
      "Erudite, nuanced, mastery-level vocabulary. Rare and subtle collocations, refined idioms, precise connotations, sophisticated figurative expressions.",
    mistakeIdentification:
      'Extremely subtle and elusive (e.g., delicate case agreement like "between you and I", subtle faux-subjunctive, delicate agreement mismatches separated by parentheticals).',
    targetLength: "22-35 words",
  },
};

const binarySentenceSchema = {
  type: Type.OBJECT,
  properties: {
    text: { type: Type.STRING, description: "The generated sentence." },
    isCorrect: { type: Type.BOOLEAN, description: "Whether the sentence is grammatically correct." },
    correction: { type: Type.STRING, description: "The full corrected version of the sentence (or original if correct)." },
    explanation: {
      type: Type.STRING,
      description: "A clear, plain-English 1-2 sentence explanation (easy for students to understand without heavy technical jargon).",
    },
    grammarPhrase: { type: Type.STRING, description: "Key part of the sentence (3-5 words) testing the rule." },
    errorPhrase: { type: Type.STRING, description: "If incorrect, the exact erroneous phrase. If correct, empty string." },
    mistakeType: { type: Type.STRING, description: "If incorrect, 2-4 word descriptor of error mechanism. If correct, empty string." },
  },
  required: ["text", "isCorrect", "correction", "explanation", "grammarPhrase", "errorPhrase", "mistakeType"],
};

const multipleChoiceSentenceSchema = {
  type: Type.OBJECT,
  properties: {
    correction: {
      type: Type.STRING,
      description: "Step 1: Write the FULL, 100% grammatically complete sentence first (with NO blanks and NO missing prepositions or particles).",
    },
    correctAnswer: {
      type: Type.STRING,
      description: "Step 2: Choose ONLY the exact target word (or exact target verb form) from 'correction' to be the gap. NEVER include surrounding words from the sentence.",
    },
    text: {
      type: Type.STRING,
      description: "Step 3: Copy 'correction' word-for-word and replace ONLY 'correctAnswer' with '_____'. Replacing '_____' with 'correctAnswer' MUST produce 'correction' word-for-word without duplicating any word.",
    },
    options: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Step 4: 4 distinct options (1 'correctAnswer' + 3 plausible grammatical distractors) containing ONLY the word(s) for '_____', NEVER words already present in 'text'.",
    },
    explanation: {
      type: Type.STRING,
      description: "A clear, plain-English 1-2 sentence explanation (easy for students to understand without heavy technical jargon) of why the correct option fits.",
    },
    grammarPhrase: { type: Type.STRING, description: "The 3-5 word phrase from 'correction' containing the target gap." },
  },
  required: ["correction", "correctAnswer", "text", "options", "explanation", "grammarPhrase"],
};

const openClozeSentenceSchema = {
  type: Type.OBJECT,
  properties: {
    correction: {
      type: Type.STRING,
      description: "Step 1: Write the FULL, 100% grammatically complete sentence first (with NO blanks and NO missing prepositions or particles).",
    },
    correctAnswer: {
      type: Type.STRING,
      description: "Step 2: Choose ONE single word from 'correction' to be the missing word.",
    },
    text: {
      type: Type.STRING,
      description: "Step 3: Copy 'correction' word-for-word and replace ONLY that single 'correctAnswer' word with '_____'. Every other word (such as 'to', 'with', 'of', 'for') MUST remain in 'text'.",
    },
    explanation: {
      type: Type.STRING,
      description: "A clear, plain-English 1-2 sentence explanation (easy for students to understand without heavy technical jargon) of why this word is needed.",
    },
    grammarPhrase: { type: Type.STRING, description: "The 3-5 word phrase from the completed sentence around the gap." },
    acceptedAnswers: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Array of all valid single-word answers (primary word + valid single-word synonyms).",
    },
  },
  required: ["correction", "correctAnswer", "text", "explanation", "grammarPhrase", "acceptedAnswers"],
};

const wordFormationSentenceSchema = {
  type: Type.OBJECT,
  properties: {
    correction: {
      type: Type.STRING,
      description: "Step 1: Write the FULL, 100% grammatically complete sentence first (with NO blanks).",
    },
    baseWord: {
      type: Type.STRING,
      description: "Step 2: The root/stem word in UPPERCASE (e.g. 'DECIDE', 'FORTUNATE', 'FRIEND', 'RELY') from which 'correctAnswer' is morphologically derived. MUST NOT be identical to 'correctAnswer'.",
    },
    correctAnswer: {
      type: Type.STRING,
      description: "Step 3: Choose ONE single derived word from 'correction' (e.g. 'decision', 'unfortunately', 'friendship', 'unreliable') formed from 'baseWord'.",
    },
    text: {
      type: Type.STRING,
      description: "Step 4: Copy 'correction' word-for-word and replace ONLY 'correctAnswer' with '_____'. Do NOT write '(BASEWORD)' inside 'text' (the UI renders the baseWord badge automatically).",
    },
    explanation: {
      type: Type.STRING,
      description: "A clear, plain-English 1-2 sentence explanation of how the base word is transformed (e.g. which prefix/suffix or part of speech is needed and why).",
    },
    grammarPhrase: { type: Type.STRING, description: "The 3-5 word phrase from the completed sentence around the gap." },
    acceptedAnswers: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Array of all valid single-word derivations of 'baseWord' that fit the gap (including US/UK spelling variants like -ize/-ise).",
    },
  },
  required: ["correction", "baseWord", "correctAnswer", "text", "explanation", "grammarPhrase", "acceptedAnswers"],
};

const keyWordTransformationSentenceSchema = {
  type: Type.OBJECT,
  properties: {
    leadInSentence: {
      type: Type.STRING,
      description: "Step 1: The original complete lead-in sentence whose meaning must be preserved.",
    },
    baseWord: {
      type: Type.STRING,
      description: "Step 2: The single given KEY WORD in UPPERCASE (e.g. 'SEEN', 'UNLESS', 'RATHER', 'SPITE', 'HAD') that students MUST include WITHOUT changing its form.",
    },
    correction: {
      type: Type.STRING,
      description: "Step 3: The FULL, 100% grammatically complete second sentence (with NO blanks) that has the same meaning as 'leadInSentence' and contains 'baseWord'.",
    },
    correctAnswer: {
      type: Type.STRING,
      description: "Step 4: The exact 2-to-6 word phrase from 'correction' (containing 'baseWord' unchanged) that fills the blank '_____'.",
    },
    text: {
      type: Type.STRING,
      description: "Step 5: Copy 'correction' word-for-word and replace ONLY 'correctAnswer' with '_____'. Must have words before and/or after '_____' to frame the transformation.",
    },
    mark1Parts: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Step 6: The first scoring half of the target phrase (1 mark in Cambridge Part 4), including contraction variants (e.g. ['have not seen', \"haven't seen\"]).",
    },
    mark2Parts: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Step 7: The second scoring half of the target phrase (1 mark in Cambridge Part 4), such as ['since'] or ['to consult']. Combining a mark1Part + mark2Part equals a full 2-mark answer.",
    },
    acceptedAnswers: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Array of all valid 2-to-6 word phrases (containing 'baseWord' unchanged, including contraction variants) that earn the full 2/2 marks.",
    },
    explanation: {
      type: Type.STRING,
      description: "A clear, plain-English 1-2 sentence explanation of the two grammatical components required around the key word.",
    },
    grammarPhrase: { type: Type.STRING, description: "The 3-6 word phrase from 'correction' containing the transformation." },
  },
  required: [
    "leadInSentence",
    "baseWord",
    "correction",
    "correctAnswer",
    "text",
    "mark1Parts",
    "mark2Parts",
    "acceptedAnswers",
    "explanation",
    "grammarPhrase",
  ],
};

function getSentenceSchema(
  questionType: "binary" | "multipleChoice" | "openCloze" | "wordFormation" | "keyWordTransformation"
) {
  if (questionType === "multipleChoice") return multipleChoiceSentenceSchema;
  if (questionType === "openCloze") return openClozeSentenceSchema;
  if (questionType === "wordFormation") return wordFormationSentenceSchema;
  if (questionType === "keyWordTransformation") return keyWordTransformationSentenceSchema;
  return binarySentenceSchema;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Guarantees that a Multiple-Choice Cloze challenge has options and `correctAnswer`
 * that ONLY represent the missing gap `_____` in `text`, never duplicating words
 * that already appear in the given sentence around the gap.
 */
function enforceMultipleChoiceIntegrity(data: any) {
  let corr = String(data.correction || "").replace(/\s+/g, " ").trim();
  let txt = String(data.text || "").replace(/\s+/g, " ").trim();
  let answer = String(data.correctAnswer || "").replace(/\s+/g, " ").trim();
  let opts: string[] = Array.isArray(data.options)
    ? data.options.map((o: any) => String(o || "").replace(/\s+/g, " ").trim()).filter(Boolean)
    : [];

  if (/_{2,}/.test(txt)) {
    txt = txt.replace(/_{2,}/, "_____");
  }

  // 1. Repair common 3-part phrasal-prepositional verb omissions in `correction`
  const phrasalRepairs: Array<[RegExp, string]> = [
    [/\b(look(?:s|ed|ing)?\s+forward)\s+(?!to\b)([a-z]+ing)\b/gi, "$1 to $2"],
    [/\b(put(?:s|ting)?\s+up)\s+(?!with\b)([a-z]+ing)\b/gi, "$1 with $2"],
    [/\b(came|come(?:s|ing)?)\s+up\s+(?!with\b)(a|an|the|some|this|that|an?\s+idea|a\s+plan)\b/gi, "$1 up with $2"],
    [/\b(ran|run(?:s|ning)?)\s+out\s+(?!of\b)([a-z]+)\b/gi, "$1 out of $2"],
  ];
  for (const [pattern, replacement] of phrasalRepairs) {
    corr = corr.replace(pattern, replacement);
  }

  // 2. If all options (and correctAnswer) share an identical leading word or trailing word,
  // strip that constant word from all options and correctAnswer so unchanging sentence words aren't in the choices.
  const allChoices = answer ? [answer, ...opts] : [...opts];
  if (allChoices.length >= 2) {
    while (allChoices.every((c) => c.split(/\s+/).length > 1)) {
      const firstWord = allChoices[0].split(/\s+/)[0].toLowerCase();
      if (allChoices.every((c) => c.split(/\s+/)[0].toLowerCase() === firstWord)) {
        const stripLeading = (s: string) => s.replace(/^\S+\s+/, "").trim();
        answer = stripLeading(answer);
        opts = opts.map(stripLeading);
        for (let i = 0; i < allChoices.length; i++) allChoices[i] = stripLeading(allChoices[i]);
      } else {
        break;
      }
    }
    while (allChoices.every((c) => c.split(/\s+/).length > 1)) {
      const words0 = allChoices[0].split(/\s+/);
      const lastWord = words0[words0.length - 1].toLowerCase();
      if (
        allChoices.every((c) => {
          const w = c.split(/\s+/);
          return w[w.length - 1].toLowerCase() === lastWord;
        })
      ) {
        const stripTrailing = (s: string) => s.replace(/\s+\S+$/, "").trim();
        answer = stripTrailing(answer);
        opts = opts.map(stripTrailing);
        for (let i = 0; i < allChoices.length; i++) allChoices[i] = stripTrailing(allChoices[i]);
      } else {
        break;
      }
    }
  }

  // 3. Check for overlap between `answer` / `opts` and the words immediately before/after `_____` in `txt`
  if (txt.includes("_____") && corr) {
    const [beforeRaw, afterRaw] = txt.split("_____");
    const beforeWords = beforeRaw.trim().split(/\s+/).filter(Boolean);
    const afterWords = (afterRaw || "").trim().split(/\s+/).filter(Boolean);
    const prevWord = beforeWords.length > 0 ? beforeWords[beforeWords.length - 1].replace(/^[^a-zA-Z0-9']+|[^a-zA-Z0-9']+$/g, "") : "";
    const nextWord = afterWords.length > 0 ? afterWords[0].replace(/^[^a-zA-Z0-9']+|[^a-zA-Z0-9']+$/g, "") : "";

    if (prevWord) {
      const prevPrefixRe = new RegExp(`^${escapeRegExp(prevWord)}\\s+`, "i");
      if (prevPrefixRe.test(answer)) {
        const strippedAnswer = answer.replace(prevPrefixRe, "").trim();
        const strippedOpts = opts.map((o) => o.replace(prevPrefixRe, "").trim());
        const uniqueStripped = new Set(strippedOpts.map((o) => o.toLowerCase()));
        const testFilled = txt.replace("_____", strippedAnswer).replace(/\s+/g, " ").trim();
        if (strippedAnswer && testFilled.toLowerCase() === corr.toLowerCase() && uniqueStripped.size === opts.length) {
          answer = strippedAnswer;
          opts = strippedOpts;
        } else {
          txt = txt.replace(new RegExp(`\\b${escapeRegExp(prevWord)}\\s+_____`, "i"), "_____");
        }
      } else if (opts.some((o) => o.toLowerCase() === `${prevWord.toLowerCase()} ${answer.toLowerCase()}`)) {
        // E.g. txt = "He decided to _____ the offer", answer = "accept", opts = ["accept", "to accept", "accepting", "accepted"]
        const expandedAnswer = `${prevWord} ${answer}`;
        const expandedTxt = txt.replace(new RegExp(`\\b${escapeRegExp(prevWord)}\\s+_____`, "i"), "_____");
        if (expandedTxt.replace("_____", expandedAnswer).replace(/\s+/g, " ").trim().toLowerCase() === corr.toLowerCase()) {
          txt = expandedTxt;
          answer = expandedAnswer;
        }
      }
    }

    const [, afterRaw2] = txt.split("_____");
    const afterWords2 = (afterRaw2 || "").trim().split(/\s+/).filter(Boolean);
    const nextWord2 = afterWords2.length > 0 ? afterWords2[0].replace(/^[^a-zA-Z0-9']+|[^a-zA-Z0-9']+$/g, "") : "";

    if (nextWord2) {
      const nextSuffixRe = new RegExp(`\\s+${escapeRegExp(nextWord2)}$`, "i");
      if (nextSuffixRe.test(answer)) {
        const strippedAnswer = answer.replace(nextSuffixRe, "").trim();
        const strippedOpts = opts.map((o) => o.replace(nextSuffixRe, "").trim());
        const uniqueStripped = new Set(strippedOpts.map((o) => o.toLowerCase()));
        const testFilled = txt.replace("_____", strippedAnswer).replace(/\s+/g, " ").trim();
        if (strippedAnswer && testFilled.toLowerCase() === corr.toLowerCase() && uniqueStripped.size === opts.length) {
          answer = strippedAnswer;
          opts = strippedOpts;
        } else {
          txt = txt.replace(new RegExp(`_____\\s+${escapeRegExp(nextWord2)}\\b`, "i"), "_____");
        }
      }
    }
  }

  // 4. Ensure `txt` with `answer` substituted in place of `_____` matches `corr` word-for-word
  if (answer && corr) {
    const filled = txt.replace(/_{2,}/, answer).replace(/\s+/g, " ").trim();
    if (filled.toLowerCase() !== corr.toLowerCase()) {
      const targetRegex = new RegExp(`\\b${escapeRegExp(answer)}\\b`, "i");
      const phrase = String(data.grammarPhrase || "").trim();
      let rebuilt = "";

      if (phrase && corr.toLowerCase().includes(phrase.toLowerCase()) && targetRegex.test(phrase)) {
        const phraseMatch = corr.match(new RegExp(escapeRegExp(phrase), "i"));
        if (phraseMatch && phraseMatch.index !== undefined) {
          const before = corr.slice(0, phraseMatch.index);
          const matchedPhrase = phraseMatch[0];
          const after = corr.slice(phraseMatch.index + matchedPhrase.length);
          const blankedPhrase = matchedPhrase.replace(targetRegex, (m) => {
            answer = m;
            return "_____";
          });
          rebuilt = `${before}${blankedPhrase}${after}`;
        }
      }

      if (!rebuilt && targetRegex.test(corr)) {
        rebuilt = corr.replace(targetRegex, (m) => {
          answer = m;
          return "_____";
        });
      }

      if (rebuilt && /_{2,}/.test(rebuilt)) {
        txt = rebuilt;
      } else if (/_{2,}/.test(txt)) {
        let repairedFilled = filled;
        for (const [pattern, replacement] of phrasalRepairs) {
          repairedFilled = repairedFilled.replace(pattern, replacement);
        }
        corr = repairedFilled;
        if (repairedFilled.toLowerCase() !== filled.toLowerCase() && targetRegex.test(corr)) {
          txt = corr.replace(targetRegex, "_____");
        }
      }
    }
  }

  // 5. Strip adjacent `prevWord` or `nextWord` from any individual distractor option that still includes it
  if (txt.includes("_____")) {
    const [beforeFinal, afterFinal] = txt.split("_____");
    const bw = beforeFinal.trim().split(/\s+/).filter(Boolean);
    const aw = (afterFinal || "").trim().split(/\s+/).filter(Boolean);
    const finalPrev = bw.length > 0 ? bw[bw.length - 1].replace(/^[^a-zA-Z0-9']+|[^a-zA-Z0-9']+$/g, "") : "";
    const finalNext = aw.length > 0 ? aw[0].replace(/^[^a-zA-Z0-9']+|[^a-zA-Z0-9']+$/g, "") : "";

    const prevRe = finalPrev ? new RegExp(`^${escapeRegExp(finalPrev)}\\s+`, "i") : null;
    const nextRe = finalNext ? new RegExp(`\\s+${escapeRegExp(finalNext)}$`, "i") : null;

    opts = opts.map((opt) => {
      if (opt.toLowerCase() === answer.toLowerCase()) return answer;
      let cleaned = opt;
      if (prevRe && prevRe.test(cleaned)) {
        const candidate = cleaned.replace(prevRe, "").trim();
        if (candidate && candidate.toLowerCase() !== answer.toLowerCase()) {
          cleaned = candidate;
        }
      }
      if (nextRe && nextRe.test(cleaned)) {
        const candidate = cleaned.replace(nextRe, "").trim();
        if (candidate && candidate.toLowerCase() !== answer.toLowerCase()) {
          cleaned = candidate;
        }
      }
      return cleaned;
    });
  }

  // 6. Deduplicate options and ensure `answer` is present
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const o of opts) {
    const key = o.trim().toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      deduped.push(o.trim());
    }
  }
  if (answer && !seen.has(answer.toLowerCase())) {
    if (deduped.length >= 4) {
      deduped[0] = answer;
    } else {
      deduped.unshift(answer);
    }
    seen.add(answer.toLowerCase());
  }

  data.correction = corr;
  data.text = txt;
  data.correctAnswer = answer;
  data.options = deduped;
  data.acceptedAnswers = answer ? [answer] : [];
}

/**
 * Guarantees that an Open Cloze challenge has a single-word gap and that
 * replacing "_____" with `correctAnswer` in `text` produces `correction` word-for-word,
 * without ever dropping prepositions or particles (e.g., "look forward to visiting").
 */
function enforceOpenClozeIntegrity(data: any) {
  let corr = String(data.correction || "").replace(/\s+/g, " ").trim();
  let txt = String(data.text || "").replace(/\s+/g, " ").trim();
  const rawAnswer = String(data.correctAnswer || "").trim();
  const answerWords = rawAnswer.split(/\s+/).filter(Boolean);
  let primary = answerWords[0] || "";

  // 1. If the model put multiple words in correctAnswer (e.g. "forward to"), restore trailing words into `text`
  if (answerWords.length > 1 && /_{2,}/.test(txt)) {
    const trailing = answerWords.slice(1).join(" ");
    const afterBlankRegex = new RegExp(`_{2,}\\s+${escapeRegExp(trailing)}\\b`, "i");
    if (!afterBlankRegex.test(txt)) {
      txt = txt.replace(/_{2,}/, `_____ ${trailing}`);
    }
  }

  // 2. Repair common 3-part phrasal-prepositional verb omissions in `correction` (e.g., "look forward visiting" -> "look forward to visiting")
  const phrasalRepairs: Array<[RegExp, string]> = [
    [/\b(look(?:s|ed|ing)?\s+forward)\s+(?!to\b)([a-z]+ing)\b/gi, "$1 to $2"],
    [/\b(put(?:s|ting)?\s+up)\s+(?!with\b)([a-z]+ing)\b/gi, "$1 with $2"],
    [/\b(came|come(?:s|ing)?)\s+up\s+(?!with\b)(a|an|the|some|this|that|an?\s+idea|a\s+plan)\b/gi, "$1 up with $2"],
    [/\b(ran|run(?:s|ning)?)\s+out\s+(?!of\b)([a-z]+)\b/gi, "$1 out of $2"],
  ];
  for (const [pattern, replacement] of phrasalRepairs) {
    corr = corr.replace(pattern, replacement);
  }

  // 3. Ensure `text` with `primary` substituted in place of `_____` matches `correction` word-for-word
  if (primary && corr) {
    const filled = txt.replace(/_{2,}/, primary).replace(/\s+/g, " ").trim();
    if (filled.toLowerCase() !== corr.toLowerCase()) {
      const wordRegex = new RegExp(`\\b${escapeRegExp(primary)}\\b`, "i");
      const phrase = String(data.grammarPhrase || "").trim();
      let rebuilt = "";

      // Prefer blanking the target word inside `grammarPhrase` if `grammarPhrase` appears in `correction`
      if (phrase && corr.toLowerCase().includes(phrase.toLowerCase()) && wordRegex.test(phrase)) {
        const phraseMatch = corr.match(new RegExp(escapeRegExp(phrase), "i"));
        if (phraseMatch && phraseMatch.index !== undefined) {
          const before = corr.slice(0, phraseMatch.index);
          const matchedPhrase = phraseMatch[0];
          const after = corr.slice(phraseMatch.index + matchedPhrase.length);
          const blankedPhrase = matchedPhrase.replace(wordRegex, (m) => {
            primary = m;
            return "_____";
          });
          rebuilt = `${before}${blankedPhrase}${after}`;
        }
      }

      if (!rebuilt && wordRegex.test(corr)) {
        rebuilt = corr.replace(wordRegex, (m) => {
          primary = m;
          return "_____";
        });
      }

      if (rebuilt && /_{2,}/.test(rebuilt)) {
        txt = rebuilt;
      } else if (/_{2,}/.test(txt)) {
        // Fallback: if `primary` wasn't found in `corr`, make `corr` match `filled` (with phrasal repairs applied)
        let repairedFilled = filled;
        for (const [pattern, replacement] of phrasalRepairs) {
          repairedFilled = repairedFilled.replace(pattern, replacement);
        }
        corr = repairedFilled;
        if (repairedFilled.toLowerCase() !== filled.toLowerCase() && wordRegex.test(corr)) {
          txt = corr.replace(wordRegex, "_____");
        }
      }
    }
  }

  data.correction = corr;
  data.text = txt;
  data.correctAnswer = primary;

  const rawAccepted = Array.isArray(data.acceptedAnswers) ? data.acceptedAnswers : [];
  const normalizedSet = new Set<string>();
  if (primary) normalizedSet.add(primary.toLowerCase());
  rawAccepted.forEach((ans: any) => {
    const clean = String(ans || "").trim().toLowerCase();
    if (clean && !clean.includes(" ")) {
      normalizedSet.add(clean);
    }
  });
  data.acceptedAnswers = Array.from(normalizedSet);
}

/**
 * Guarantees that a Word Formation challenge has a clean uppercase `baseWord`,
 * a single-word `correctAnswer` that is NOT identical to `baseWord`, no duplicate
 * `(BASEWORD)` baked into `text`, and US/UK spelling variants in `acceptedAnswers`.
 */
function enforceWordFormationIntegrity(data: any) {
  let rawBase = String(data.baseWord || "")
    .replace(/[()[\]{}'"]/g, "")
    .trim()
    .split(/\s+/)[0] || "FORM";
  rawBase = rawBase.toUpperCase();

  // Strip any inline `(BASEWORD)` that the model might have accidentally placed inside `text`
  if (typeof data.text === "string" && rawBase) {
    const inlineParenRe = new RegExp(`(_{2,})\\s*\\(\\s*${escapeRegExp(rawBase)}\\s*\\)`, "i");
    data.text = data.text.replace(inlineParenRe, "$1");
  }

  enforceOpenClozeIntegrity(data);

  const primaryLower = String(data.correctAnswer || "").trim().toLowerCase();
  if (primaryLower && rawBase.toLowerCase() === primaryLower) {
    // Derive a clean stem if the model accidentally set baseWord === correctAnswer
    const stripSuffixes = ["fully", "lessly", "ingly", "edly", "ment", "tion", "sion", "ness", "able", "ible", "less", "ful", "ive", "ous", "al", "ly", "er", "or", "ed", "ing"];
    for (const suf of stripSuffixes) {
      if (primaryLower.length > suf.length + 2 && primaryLower.endsWith(suf)) {
        rawBase = primaryLower.slice(0, -suf.length).toUpperCase();
        break;
      }
    }
  }
  data.baseWord = rawBase;

  // Expand US/UK spelling variants in acceptedAnswers and ensure baseWord itself is excluded
  const expanded = new Set<string>();
  const currentList: string[] = Array.isArray(data.acceptedAnswers) ? data.acceptedAnswers : [];
  if (primaryLower) currentList.unshift(primaryLower);

  const addWithVariants = (word: string) => {
    const w = word.trim().toLowerCase();
    if (!w || w.includes(" ") || w === rawBase.toLowerCase()) return;
    expanded.add(w);
    if (w.includes("ize")) expanded.add(w.replace(/ize/g, "ise"));
    if (w.includes("ise")) expanded.add(w.replace(/ise/g, "ize"));
    if (w.includes("ization")) expanded.add(w.replace(/ization/g, "isation"));
    if (w.includes("isation")) expanded.add(w.replace(/isation/g, "ization"));
    if (w.includes("yze")) expanded.add(w.replace(/yze/g, "yse"));
    if (w.includes("yse")) expanded.add(w.replace(/yse/g, "yze"));
    if (w.includes("our")) expanded.add(w.replace(/our/g, "or"));
    if (w.endsWith("ourite")) expanded.add(w.replace(/ourite$/, "orite"));
    if (w.endsWith("orite")) expanded.add(w.replace(/orite$/, "ourite"));
    if (w.endsWith("elled")) expanded.add(w.replace(/elled$/, "eled"));
    if (w.endsWith("eled")) expanded.add(w.replace(/eled$/, "elled"));
    if (w.endsWith("elling")) expanded.add(w.replace(/elling$/, "eling"));
    if (w.endsWith("eling")) expanded.add(w.replace(/eling$/, "elling"));
    if (w.endsWith("eller")) expanded.add(w.replace(/eller$/, "eler"));
    if (w.endsWith("eler")) expanded.add(w.replace(/eler$/, "eller"));
  };

  currentList.forEach(addWithVariants);
  data.acceptedAnswers = Array.from(expanded);
}

/**
 * Guarantees that a Key Word Transformation (Cambridge Part 4) challenge has:
 * - A clean `leadInSentence`
 * - An uppercase single-word `baseWord` (the unchangeable KEY WORD)
 * - A 2-to-6 word `correctAnswer` that contains `baseWord` as a whole word
 * - A gapped `text` where replacing `_____` with `correctAnswer` produces `correction`
 * - Populated `mark1Parts`, `mark2Parts`, and `acceptedAnswers`
 */
function enforceKeyWordTransformationIntegrity(data: any) {
  const leadIn = String(data.leadInSentence || "").replace(/\s+/g, " ").trim();
  let rawBase = String(data.baseWord || "")
    .replace(/[()[\]{}'"]/g, "")
    .trim()
    .split(/\s+/)[0] || "KEY";
  rawBase = rawBase.toUpperCase();

  let corr = String(data.correction || "").replace(/\s+/g, " ").trim();
  let txt = String(data.text || "").replace(/\s+/g, " ").trim();
  let answer = String(data.correctAnswer || "").replace(/\s+/g, " ").trim();

  if (/_{2,}/.test(txt)) {
    txt = txt.replace(/_{2,}/, "_____");
  }

  // Strip any accidental `(BASEWORD)` from `txt`
  if (txt && rawBase) {
    const inlineParenRe = new RegExp(`(_{2,})\\s*\\(\\s*${escapeRegExp(rawBase)}\\s*\\)`, "i");
    txt = txt.replace(inlineParenRe, "$1");
  }

  // Ensure `txt` with `answer` replacing `_____` matches `corr`
  if (answer && corr) {
    const filled = txt.replace(/_{2,}/, answer).replace(/\s+/g, " ").trim();
    if (filled.toLowerCase() !== corr.toLowerCase()) {
      const phraseRe = new RegExp(escapeRegExp(answer), "i");
      if (phraseRe.test(corr)) {
        txt = corr.replace(phraseRe, (m) => {
          answer = m;
          return "_____";
        });
      } else if (/_{2,}/.test(txt)) {
        corr = filled;
      }
    }
  }

  // Ensure `baseWord` actually appears in `answer`; if not, pick a key word from `answer`
  const keyRe = new RegExp(`(^|[^a-zA-Z])${escapeRegExp(rawBase)}([^a-zA-Z]|$)`, "i");
  const answerWords = answer.split(/\s+/).filter(Boolean);
  if (!keyRe.test(answer) && answerWords.length >= 2) {
    const candidateKey = answerWords.find((w) => w.replace(/[^a-zA-Z]/g, "").length >= 3) || answerWords[0];
    rawBase = candidateKey.replace(/[^a-zA-Z]/g, "").toUpperCase() || rawBase;
  }

  // Populate mark1Parts & mark2Parts if missing or if any part is just the bare baseWord alone (when 3+ words)
  let mark1Parts: string[] = Array.isArray(data.mark1Parts)
    ? data.mark1Parts.map((s: any) => String(s || "").trim()).filter(Boolean)
    : [];
  let mark2Parts: string[] = Array.isArray(data.mark2Parts)
    ? data.mark2Parts.map((s: any) => String(s || "").trim()).filter(Boolean)
    : [];

  const hasBareBasePart =
    answerWords.length >= 3 &&
    (mark1Parts.some((p) => p.toLowerCase() === rawBase.toLowerCase()) ||
      mark2Parts.some((p) => p.toLowerCase() === rawBase.toLowerCase()));

  if ((mark1Parts.length === 0 || mark2Parts.length === 0 || hasBareBasePart) && answerWords.length >= 2) {
    const mid = Math.ceil(answerWords.length / 2);
    mark1Parts = [answerWords.slice(0, mid).join(" ")];
    mark2Parts = [answerWords.slice(mid).join(" ")];
  }

  const rawAccepted: string[] = Array.isArray(data.acceptedAnswers)
    ? data.acceptedAnswers.map((s: any) => String(s || "").replace(/\s+/g, " ").trim()).filter(Boolean)
    : [];
  const acceptedSet = new Set<string>();
  if (answer) acceptedSet.add(answer);
  rawAccepted.forEach((a) => acceptedSet.add(a));

  data.leadInSentence = leadIn;
  data.baseWord = rawBase;
  data.correction = corr;
  data.text = txt;
  data.correctAnswer = answer;
  data.mark1Parts = mark1Parts;
  data.mark2Parts = mark2Parts;
  data.acceptedAnswers = Array.from(acceptedSet);
}

const verificationSchema = {
  type: Type.OBJECT,
  properties: {
    isCorrect: { type: Type.BOOLEAN, description: "Whether the user's correction is valid." },
    feedback: { type: Type.STRING, description: "Brief one-sentence explanation of why it was accepted or rejected." },
  },
  required: ["isCorrect", "feedback"],
};

const batchClozeVerificationSchema = {
  type: Type.OBJECT,
  properties: {
    evaluations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          word: { type: Type.STRING, description: "The candidate word or phrase being evaluated." },
          mark1Correct: {
            type: Type.BOOLEAN,
            description: "For Key Word Transformation: true ONLY if the 1st structural half (mark1Parts) has 100% accurate tense, subject-verb agreement, grammar, and spelling.",
          },
          mark2Correct: {
            type: Type.BOOLEAN,
            description: "For Key Word Transformation: true ONLY if the 2nd structural half (mark2Parts) has 100% accurate grammar, collocation, and spelling.",
          },
          isCorrect: { type: Type.BOOLEAN, description: "True if marks >= 1 (for Key Word Transformation) or if the single word fits the gap." },
          marks: {
            type: Type.INTEGER,
            description: "For Key Word Transformation: (mark1Correct ? 1 : 0) + (mark2Correct ? 1 : 0) -> 2, 1, or 0. For single-word Cloze: 1 if correct, 0 if incorrect.",
          },
          feedback: { type: Type.STRING, description: "Brief one-sentence explanation of why the submission earned 2, 1, or 0 marks." },
        },
        required: ["word", "isCorrect", "marks", "feedback"],
      },
    },
  },
  required: ["evaluations"],
};

// --- Gemini Handler for Express ---
async function handleGeminiRequest(req: Request, res: Response) {
  // Enforce Teacher PIN: Any visitor without the Teacher PIN plays in 100% free Offline Curated Mode
  if (!isTeacherAuthorized(req, req.body)) {
    return res.status(200).json({
      fallback: true,
      offlineMode: true,
      error: "Offline Curated Mode active (Teacher PIN required for live Gemini AI).",
    });
  }

  const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() || req.socket.remoteAddress || "127.0.0.1";

  const rateCheck = checkRateLimit(clientIp);
  if (!rateCheck.allowed) {
    res.setHeader("Retry-After", String(rateCheck.retryAfter || 30));
    return res.status(429).json({
      error: "Too many requests. Please wait a moment before trying again.",
      retryAfter: rateCheck.retryAfter,
    });
  }

  if (activeRequests >= MAX_CONCURRENT_REQUESTS) {
    res.setHeader("Retry-After", "5");
    return res.status(429).json({
      error: "The casino table is experiencing high traffic. Please try again shortly.",
      retryAfter: 5,
    });
  }

  activeRequests++;
  cleanupCache();

  try {
    const payload = req.body || {};
    const { action } = payload;
    if (!action || typeof action !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'action' parameter." });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      return res.status(503).json({
        error: "GEMINI_API_KEY is not configured.",
        code: "MISSING_API_KEY",
      });
    }

    switch (action) {
      case "generateSentence": {
        const {
          settings,
          pastSentences = [],
          forceCorrect = null,
          subtype = null,
          pastMistakes = [],
          questionType: requestedQuestionType,
        } = payload;
        if (!settings || typeof settings.topic !== "string" || typeof settings.level !== "string") {
          return res.status(400).json({ error: "Invalid settings provided for sentence generation." });
        }

        const topic = String(settings.topic).slice(0, 100);
        const level = String(settings.level).slice(0, 5);
        const theme = String(settings.theme || "Everyday Life").slice(0, 80);
        const profile = CEFR_PROFILES[level] || CEFR_PROFILES.B1;

        const STANDARD_GRAMMAR_SET = new Set([
          "tenses",
          "prepositions",
          "articles",
          "conditionals",
          "modals",
          "phrasal verbs",
          "reported speech",
          "comparatives and superlatives",
          "passive voice",
          "relative clauses",
          "gerunds and infinitives",
          "subject-verb agreement",
          "inversion",
          "causatives",
          "wish and unreal past",
          "participle clauses",
          "mixed grammar",
        ]);
        const normalizedTopicLower = topic.trim().toLowerCase();
        const isKnownGrammarKeyword =
          normalizedTopicLower.includes("passive") ||
          normalizedTopicLower.includes("relative") ||
          normalizedTopicLower.includes("gerund") ||
          normalizedTopicLower.includes("infinitive") ||
          normalizedTopicLower.includes("comparative") ||
          normalizedTopicLower.includes("superlative") ||
          normalizedTopicLower.includes("agreement") ||
          normalizedTopicLower.includes("inversion") ||
          normalizedTopicLower.includes("causative") ||
          normalizedTopicLower.includes("wish") ||
          normalizedTopicLower.includes("unreal past") ||
          normalizedTopicLower.includes("participle") ||
          normalizedTopicLower.includes("conditional") ||
          normalizedTopicLower.includes("modal") ||
          normalizedTopicLower.includes("tense") ||
          normalizedTopicLower.includes("reported") ||
          normalizedTopicLower.includes("phrasal");
        const isCollocationDomain =
          normalizedTopicLower === "collocations" || normalizedTopicLower.includes("collocation");
        const isCustomDomain =
          !STANDARD_GRAMMAR_SET.has(normalizedTopicLower) && !isKnownGrammarKeyword && !isCollocationDomain;

        const formatSetting = requestedQuestionType || settings.challengeFormat || "binary";
        const resolvedQuestionType:
          | "binary"
          | "multipleChoice"
          | "openCloze"
          | "wordFormation"
          | "keyWordTransformation" =
          formatSetting === "multipleChoice" ||
          formatSetting === "openCloze" ||
          formatSetting === "wordFormation" ||
          formatSetting === "keyWordTransformation" ||
          formatSetting === "binary"
            ? formatSetting
            : (
                [
                  "binary",
                  "multipleChoice",
                  "openCloze",
                  "wordFormation",
                  "keyWordTransformation",
                ] as const
              )[Math.floor(Math.random() * 5)];

        const recentSentences = Array.isArray(pastSentences) ? pastSentences.slice(-25).map((s) => String(s).slice(0, 280)) : [];
        const recentMistakes = Array.isArray(pastMistakes) ? pastMistakes.slice(-25).map((m) => String(m).slice(0, 160)) : [];
        const roundIdx = recentSentences.length;

        const THEME_SCENARIO_POOLS: Record<string, string[]> = {
          "pop culture": [
            "streaming television series, cliffhanger finales, or binge-watching culture",
            "video games, esports tournaments, indie game design, or virtual worlds",
            "viral social media trends, internet memes, or content creator collaborations",
            "comic books, graphic novels, anime, or superhero cinematic adaptations",
            "film directing, visual effects studios, screenwriting, or cinematography",
            "music studio recording, songwriting royalties, sampling, or vinyl collecting",
            "fashion runway collaborations, streetwear drops, or iconic red-carpet styling",
            "podcast hosting, investigative audio series, or candid celebrity interviews",
            "reality competition shows, talent judging, or unscripted television editing",
            "nostalgic 90s/2000s reboots, cult classic sequels, or fan conventions",
            "celebrity memoirs, unauthorized biographies, or entertainment journalism",
            "animation studios, voice acting, or motion-capture choreography",
          ],
          fantasy: [
            "ancient alchemy, potion brewing, and forbidden herbalism",
            "enchanted artifacts, cursed heirlooms, and dwarven runesmithing",
            "skyships, floating archipelagos, and astral cartography",
            "magical academies, apprentice trials, and arcane libraries",
            "mythical beasts, dragon sanctuaries, and shapeshifting guardians",
            "royal succession, elven diplomacy, and ancient treaties",
            "shadow guilds, enchanted disguises, and subterranean labyrinths",
            "elemental storms, ley-line restoration, and prophetic tapestries",
            "bardic legends, tavern folklore, and wandering minstrels",
            "siege defenses, crystal citadels, and clockwork golems",
          ],
          "sci-fi": [
            "terraforming distant exoplanets and atmospheric engineering",
            "cybernetic neural implants, synthetic memories, and bio-enhancements",
            "deep-space salvage crews, derelict starships, and asteroid mining",
            "first-contact linguistics and decoding alien transmissions",
            "orbital space elevators, lunar colonies, and zero-gravity habitats",
            "rogue artificial intelligence, android ethics, and sentient algorithms",
            "faster-than-light propulsion, wormhole navigation, and time dilation",
            "cryogenic sleep chambers and multi-generational ark ships",
            "quantum teleportation, parallel dimensions, and timeline paradoxes",
            "hydroponic biodomes, synthetic cuisine, and Martian agriculture",
          ],
          history: [
            "archaeological excavations, newly deciphered scrolls, and lost cities",
            "maritime exploration, celestial navigation, and spice trade routes",
            "Renaissance workshops, fresco restoration, and artistic patronage",
            "Industrial Revolution inventions, steam locomotives, and printing presses",
            "ancient architectural wonders, aqueduct engineering, and stone masonry",
            "diplomatic treaties, royal correspondence, and coded espionage",
            "historical culinary traditions, ancient marketplaces, and silk textiles",
            "observatories, early cartographers, and scientific revolutions",
            "medieval manuscripts, illuminated scripts, and monastic libraries",
            "historic preservation, museum curation, and sunken shipwrecks",
          ],
          "everyday life": [
            "home renovation, DIY furniture assembly, and interior decorating",
            "cooking experiments, farmers' markets, and family recipes",
            "public transit commutes, cycling lanes, and delayed trains",
            "neighborhood community gardens, pet adoption, and local parks",
            "fitness routines, marathon training, and amateur sports leagues",
            "household budgeting, thrift shopping, and vintage flea markets",
            "apartment hunting, quirky roommates, and moving day chaos",
            "local cafés, book clubs, and weekend hobby workshops",
            "travel packing, airport layovers, and boutique guesthouses",
            "appliance repairs, smart-home glitches, and neighborhood power outages",
          ],
          business: [
            "startup pitch decks, venture capital negotiations, and seed funding",
            "supply chain logistics, warehouse automation, and global shipping",
            "brand rebranding campaigns, consumer psychology, and market research",
            "remote work policies, cross-time-zone collaboration, and hybrid offices",
            "corporate sustainability, carbon-neutral packaging, and green audits",
            "mergers, acquisitions, and boardroom restructuring",
            "product launches, beta testing feedback, and customer retention",
            "talent recruitment, executive headhunting, and workplace mentorship",
            "intellectual property patents, trademark disputes, and licensing deals",
            "quarterly earnings reports, financial forecasting, and crisis PR",
          ],
          technology: [
            "cybersecurity encryption, ethical hacking, and two-factor authentication",
            "autonomous electric vehicles, lidar sensors, and smart traffic grids",
            "renewable microgrids, solid-state batteries, and solar architecture",
            "open-source software development, code reviews, and cloud deployment",
            "wearable health trackers, biometric diagnostics, and telemedicine",
            "quantum computing processors, superconducting qubits, and cryptography",
            "robotics engineering, automated assembly arms, and drone delivery",
            "augmented reality glasses, spatial audio, and haptic gloves",
            "semiconductor fabrication, microchip design, and data center cooling",
            "3D bioprinting, sustainable e-waste recycling, and smart materials",
          ],
        };

        const GENERIC_THEME_ANGLES = [
          "behind-the-scenes preparation, craftsmanship, or technical design",
          "an unexpected discovery, breakthrough, or surprising turning point",
          "historical evolution, origins, or how practices have changed over time",
          "public reception, critical debate, or contrasting opinions",
          "training, mentorship, or mastering a difficult skill",
          "equipment innovation, specialized tools, or creative problem-solving",
          "financial trade-offs, resource management, or high-stakes negotiation",
          "collaboration between specialists, teamwork, or creative partnerships",
          "restoration, preservation, or fixing a complex malfunction",
          "record-breaking achievements, rare milestones, or ambitious projects",
        ];

        const cleanThemeKey = theme
          .replace(/[^\w\s-]/g, "")
          .trim()
          .toLowerCase();
        const matchedThemePool =
          THEME_SCENARIO_POOLS[cleanThemeKey] ||
          Object.entries(THEME_SCENARIO_POOLS).find(([k]) => cleanThemeKey.includes(k))?.[1] ||
          GENERIC_THEME_ANGLES.map((angle) => `${theme} (${angle})`);
        const currentThemeFacet = matchedThemePool[roundIdx % matchedThemePool.length];

        const PASSIVE_SUBTYPE_ROTATION = [
          "Present Continuous Passive (is/are being + past participle)",
          "Present Perfect Passive (has/have been + past participle)",
          "Past Continuous Passive (was/were being + past participle)",
          "Past Perfect Passive (had been + past participle)",
          "Modal Passive or Modal Perfect Passive (must/should/could/might be or have been + past participle)",
          "Impersonal Reporting Passive (is/was said, believed, thought, rumoured, or expected + to-infinitive / to have + past participle)",
          "Causative Passive (have/get something done across varied tenses)",
          "Passive Infinitive or Gerund (to be + past participle / being + past participle / having been + past participle)",
          "Future or Future Perfect Passive (will be / is going to be / will have been + past participle)",
          "Ditransitive or Prepositional Passive (was awarded to / was spoken about / was relied upon / was taken care of)",
          "Present Simple Passive with high-register verbs (is regarded as / is attributed to / is composed of)",
          "Past Simple Passive with narrative/historical focus (was commissioned / was broadcast / was unveiled)",
        ];

        let effectiveSubtype = subtype ? String(subtype).slice(0, 140) : "";
        if (!effectiveSubtype && normalizedTopicLower.includes("passive")) {
          effectiveSubtype = PASSIVE_SUBTYPE_ROTATION[roundIdx % PASSIVE_SUBTYPE_ROTATION.length];
        }

        const subtypeClause = effectiveSubtype
          ? `\n- REQUIRED GRAMMATICAL STRUCTURE / TENSE FOCUS FOR THIS ROUND: "${effectiveSubtype}" (You MUST test this exact structure/tense within "${topic}"!).`
          : "";
        const avoidSentencesClause =
          recentSentences.length > 0
            ? `\n=== PREVIOUS SENTENCES IN THIS GAME (DO NOT REPEAT IDEAS, SCENARIOS, OR VERBS) ===\n${JSON.stringify(recentSentences)}`
            : "";
        const avoidMistakesClause =
          recentMistakes.length > 0
            ? `\n=== STRICT RULE: NEVER REPEAT PREVIOUSLY USED KEY WORDS, VERBS, OR GAP TARGETS ===\nThe following targets, key words, phrases, and grammatical focuses have ALREADY been used in earlier rounds:\n${JSON.stringify(recentMistakes)}\nYou MUST choose a completely different main verb, key word ("baseWord"), vocabulary target, and grammatical structure within "${topic}".`
            : "";

        const varietyDirective = `
=== MANDATORY VARIETY OF TENSES, VOCABULARY & IDEAS (ANTI-REPETITION) ===
1. TENSE & STRUCTURE DIVERSITY:
   - Do NOT default repeatedly to Simple Present or Simple Past!
   - For CEFR ${level}, actively use the full range of tenses, aspects, and structures appropriate to the level${effectiveSubtype ? ` — specifically "${effectiveSubtype}" for this round` : " (e.g., Present Perfect, Past Perfect, Present/Past Continuous, Modal & Modal Perfect constructions, Impersonal Reporting Passives like 'is said/rumoured/expected to...', Causatives 'have/get something done', Future Continuous/Perfect, or Passive Gerunds/Infinitives)"}.
2. LEXICAL & VERB DIVERSITY (NO OVERUSED CLICHÉS):
   - NEVER reuse any main verb, key word ("baseWord"), or target phrase that appears in the previous sentences or previous targets above.
   - BANNED OVERUSED CLICHÉ VERBS: Avoid defaulting to generic event verbs like "held", "postponed", "cancelled", or "called off" (e.g., do NOT write another sentence about an event/concert/meeting being held or postponed). Choose fresh, vivid, varied verbs and vocabulary suited to CEFR ${level}.
3. FRESH THEME SUB-SCENARIO FOR THIS ROUND:
   - Within the theme "${theme}", anchor this sentence specifically in: **${currentThemeFacet}**.
   - Ensure the scenario, subject, and idea feel completely fresh compared to any previous rounds.`;

        const domainGuidanceMultipleChoice = isCollocationDomain
          ? `\n=== COLLOCATIONS DOMAIN FOCUS ===\n- Design the sentence so that "correctAnswer" is the collocating word in a natural English collocation (e.g., verb + noun like "make a mistake" / "do homework" / "take a risk", adjective + noun like "heavy rain" / "thick fog", or adverb + adjective like "bitterly disappointed" / "fully aware") calibrated to CEFR ${level}.\n- The 3 distractors in "options" MUST be competing near-synonym verbs/adjectives/adverbs that learners commonly confuse in that collocation (e.g., ["make", "do", "take", "have"] or ["heavy", "strong", "big", "hard"]).`
          : isCustomDomain
          ? `\n=== CUSTOM LANGUAGE / LEXICAL DOMAIN FOCUS ("${topic}") ===\n- Determine whether "${topic}" is a lexical/vocabulary category (such as "school subjects", "places in town", "food and cooking", "jobs", etc.) or a specific grammar structure.\n- If "${topic}" is a lexical/vocabulary topic: write a rich, context-clue sentence where "correctAnswer" is a specific vocabulary item belonging to "${topic}" (e.g., "chemistry" or "geography" for "school subjects"; "library", "bakery", or "pharmacy" for "places in town"), and the 3 distractors in "options" are 3 OTHER vocabulary items from the exact same category "${topic}" that do NOT fit the contextual clue in the sentence!\n- If "${topic}" is a grammar rule: test that exact grammar rule in the blank with 3 plausible grammatical distractors.`
          : "";

        const domainGuidanceOpenCloze = isCollocationDomain
          ? `\n=== COLLOCATIONS DOMAIN FOCUS ===\n- Design the sentence so that the single missing word ("correctAnswer") completes a classic English collocation (e.g., "make", "do", "take", "pay", "heavy", "deep", "aware", "favor", "attention") appropriate for CEFR ${level}.`
          : isCustomDomain
          ? `\n=== CUSTOM LANGUAGE / LEXICAL DOMAIN FOCUS ("${topic}") ===\n- Determine whether "${topic}" is a lexical/vocabulary category (such as "school subjects", "places in town", "animals", "professions") or a specific grammar structure.\n- If "${topic}" is a lexical/vocabulary topic: write a clear, context-rich sentence that unmistakably points to ONE single-word vocabulary item from "${topic}" as "correctAnswer" (for example, for "places in town": "We went to the _____ to borrow three novels for the weekend" -> "library"; for "school subjects": "In _____ class today, we used microscopes to study plant cells" -> "biology"), and list any valid single-word synonyms in "acceptedAnswers".`
          : "";

        const domainGuidanceBinary = isCollocationDomain
          ? `\n=== COLLOCATIONS DOMAIN FOCUS ===\n- If generating an INCORRECT sentence: include a classic collocation error where a learner uses the wrong collocating verb, adjective, adverb, or preposition (e.g., "do a mistake" instead of "make a mistake", "strong rain" instead of "heavy rain", "make homework" instead of "do homework", "inflict havoc" instead of "wreak havoc") calibrated to CEFR ${level}.\n- If generating a CORRECT sentence: showcase a natural, authentic collocation used accurately.`
          : isCustomDomain
          ? `\n=== CUSTOM LANGUAGE / LEXICAL DOMAIN FOCUS ("${topic}") ===\n- Determine whether "${topic}" is a lexical/vocabulary category (such as "school subjects", "places in town", etc.) or a specific grammar rule.\n- If "${topic}" is a lexical/vocabulary topic:\n  * For an INCORRECT sentence: use a vocabulary item from "${topic}" that clearly contradicts the action/definition in the sentence OR use a broken lexical collocation (e.g., for "places in town": "She went to the butcher's to mail a parcel and buy stamps", corrected to "post office"; for "school subjects": "In history class, we mixed acids in test tubes to observe chemical reactions", corrected to "chemistry"). Set "errorPhrase" to the wrong vocabulary word/phrase and "mistakeType" to "wrong lexical choice (${topic})".\n  * For a CORRECT sentence: use a vocabulary item from "${topic}" accurately and naturally in context.`
          : "";

        const domainGuidanceWordFormation = isCollocationDomain
          ? `\n=== COLLOCATIONS DOMAIN FOCUS (WORD FORMATION) ===\n- Design the sentence so that "correctAnswer" is a derived noun, adjective, adverb, or verb that completes a natural English collocation (e.g., "make a big _____ (DIFFERENT)" -> "difference", "raise public _____ (AWARE)" -> "awareness", "_____ (BITTER) disappointed" -> "bitterly", "a strong _____ (BELIEVE)" -> "belief") calibrated to CEFR ${level}.`
          : isCustomDomain
          ? `\n=== CUSTOM LANGUAGE / LEXICAL DOMAIN FOCUS ("${topic}") ===\n- Connect the sentence and the derived word in the gap to the topic "${topic}" (for example, deriving a profession, specialist noun, adjective, or adverb related to "${topic}", such as "HISTORIAN" from "HISTORY", "SCIENTIFIC" from "SCIENCE", "BAKERY" from "BAKE", "MEDICAL" from "MEDICINE").`
          : "";

        let prompt = "";

        if (resolvedQuestionType === "multipleChoice") {
          prompt = `You are a master English teacher designing a 4-option Multiple-Choice Cloze challenge for a Grammar Casino game.
Settings:
- Language Domain: "${topic}"
- CEFR Level: "${level}"
- Theme: "${theme}" (${currentThemeFacet})${subtypeClause}${domainGuidanceMultipleChoice}
${varietyDirective}

=== CEFR LEVEL REQUIREMENTS (${level}) ===
- SYNTAX (${profile.targetLength}): ${profile.syntax}
- LEXIS & VOCABULARY: ${profile.lexis}
${avoidSentencesClause}
${avoidMistakesClause}

=== MULTIPLE-CHOICE CLOZE STRICT RULES ===
1. STEP 1 ("correction"): First, write a FULL, 100% grammatically and lexically complete sentence with NO blanks.
2. STEP 2 ("correctAnswer"): Pick ONLY the exact missing word (prefer a SINGLE word whenever possible) from "correction" that tests "${topic}". NEVER include surrounding words from the sentence in "correctAnswer".
3. STEP 3 ("text"): Copy "correction" word-for-word and replace ONLY "correctAnswer" with an exact 5-underscore blank: "_____".
   - CRITICAL VERIFICATION: Replacing "_____" in "text" with "correctAnswer" MUST produce "correction" word-for-word!
   - NEVER leave any word from "correctAnswer" or "options" visible in "text" immediately before or after "_____".
     * WRONG: text = "She has _____ in Madrid", options = ["has lived", "have lived", "lived", "living"] ("has" is already in the sentence!).
     * RIGHT: text = "She has _____ in Madrid", options = ["lived", "live", "living", "lives"] (OR text = "She _____ in Madrid", options = ["has lived", "have lived", "lived", "is living"]).
     * WRONG: text = "He is good _____ playing chess", options = ["good at", "good in", "good on", "good for"] ("good" is already in the sentence!).
     * RIGHT: text = "He is good _____ playing chess", options = ["at", "in", "on", "for"].
4. STEP 4 ("options"): Set "options" to an array of 4 distinct strings (1 "correctAnswer" + 3 plausible distractors testing "${topic}" at CEFR ${level}), in randomized order.
   - Every option MUST contain ONLY the word(s) that fill "_____", NEVER words that already appear in the given sentence.
   - NEVER pick random words from elsewhere in the sentence as distractors.
5. STEP 5 ("explanation"): Set "explanation" to a clear, plain-English 1-2 sentence explanation (easy for students to understand without heavy technical jargon) of why the correct option fits.
6. STEP 6 ("grammarPhrase"): Set "grammarPhrase" to the 3-5 word phrase from "correction" that contains the target gap.

Respond ONLY with valid JSON matching the schema.`;
        } else if (resolvedQuestionType === "openCloze") {
          prompt = `You are a master Cambridge English examiner designing an Open Cloze (Use of English Part 2) challenge for a Grammar Casino game.
Settings:
- Language Domain: "${topic}"
- CEFR Level: "${level}"
- Theme: "${theme}" (${currentThemeFacet})${subtypeClause}${domainGuidanceOpenCloze}
${varietyDirective}

=== CEFR LEVEL REQUIREMENTS (${level}) ===
- SYNTAX (${profile.targetLength}): ${profile.syntax}
- LEXIS & VOCABULARY: ${profile.lexis}
${avoidSentencesClause}
${avoidMistakesClause}

=== CAMBRIDGE OPEN CLOZE STRICT RULES ===
1. STEP 1 ("correction"): First, write a FULL, 100% grammatically and lexically complete sentence with NO blanks. Double-check multi-word phrasal verbs, collocations, and dependent prepositions (e.g., "look forward to visiting", "come up with", "put up with", "run out of", "insist on going") to ensure NO preposition or particle is missing in "correction".
2. STEP 2 ("correctAnswer"): Pick ONE SINGLE WORD from "correction" that tests "${topic}" (lowercase, unless it is at the start of the sentence or "I"). Never put two or more words in "correctAnswer".
3. STEP 3 ("text"): Copy "correction" word-for-word and replace ONLY that single "correctAnswer" word with an exact 5-underscore blank: "_____".
   - CRITICAL VERIFICATION: Replacing "_____" in "text" with "correctAnswer" MUST produce "correction" word-for-word!
   - NEVER replace a two-word phrase (like "forward to" or "up with") with a single "_____". For example, if testing "look forward to visiting", "text" MUST be either "I look _____ to visiting" (answer: "forward") OR "I look forward _____ visiting" (answer: "to") — NEVER "I look _____ visiting".
4. Set "acceptedAnswers" to an array of strings containing the primary single word PLUS all other grammatically and contextually valid single-word alternatives that fit the blank (all lowercase, trimmed, single words only).
5. Set "explanation" to a clear, plain-English 1-2 sentence explanation (easy for students to understand without heavy technical jargon) of why this word is needed.
6. Set "grammarPhrase" to the 3-5 word phrase from "correction" around the gap.

Respond ONLY with valid JSON matching the schema.`;
        } else if (resolvedQuestionType === "wordFormation") {
          prompt = `You are a master Cambridge English examiner designing a Word Formation (Use of English Part 3) challenge for a Grammar Casino game.
Settings:
- Language Domain: "${topic}"
- CEFR Level: "${level}"
- Theme: "${theme}" (${currentThemeFacet})${subtypeClause}${domainGuidanceWordFormation}
${varietyDirective}

=== CEFR LEVEL REQUIREMENTS (${level}) ===
- SYNTAX (${profile.targetLength}): ${profile.syntax}
- LEXIS & VOCABULARY: ${profile.lexis}
- MORPHOLOGICAL COMPLEXITY BY LEVEL:
  * A1–A2: Clear, high-frequency suffixes or prefixes (e.g., TEACH -> teacher, CARE -> carefully, FRIEND -> friendly, DECIDE -> decision, POSSIBLE -> impossible, HAPPY -> happiness).
  * B1–B2: Multi-step derivations, negative prefixes + suffixes, or internal vowel/consonant shifts (e.g., COMFORT -> uncomfortable, AMAZE -> amazement, MAINTAIN -> maintenance, TIRE -> tirelessly, LONG -> length, BELIEVE -> belief).
  * C1–C2: Sophisticated academic/idiomatic derivations, double affixes, or compound stems (e.g., RECONCILE -> irreconcilably, SUBSTANCE -> unsubstantiated, PRECEDENT -> unprecedented, APPEAR -> disappearance, OUTRAGE -> outrageously).
${avoidSentencesClause}
${avoidMistakesClause}

=== CAMBRIDGE WORD FORMATION STRICT RULES ===
1. STEP 1 ("correction"): First, write a FULL, 100% grammatically and lexically complete sentence with NO blanks.
2. STEP 2 ("baseWord"): Provide the single root/base word in UPPERCASE (e.g., "DECIDE", "COMFORT", "RECONCILE").
3. STEP 3 ("correctAnswer"): Pick the single derived word from "correction" that is morphologically formed from "baseWord".
   - CRITICAL: "correctAnswer" MUST be a single word and MUST NOT be identical to "baseWord" (students must always transform the base word's form!).
4. STEP 4 ("text"): Copy "correction" word-for-word and replace ONLY "correctAnswer" with an exact 5-underscore blank: "_____".
   - Do NOT put "(BASEWORD)" inside "text" — the UI displays "(BASEWORD)" automatically!
   - Replacing "_____" in "text" with "correctAnswer" MUST produce "correction" word-for-word!
5. STEP 5 ("acceptedAnswers"): List all valid single-word derivations of "baseWord" that fit the gap (including US/UK spelling variants like "-ize"/"-ise" or "-our"/"-or"). Never include the unchanged "baseWord".
6. STEP 6 ("explanation"): Write a clear, plain-English 1-2 sentence explanation showing how "baseWord" is transformed into "correctAnswer" (which prefix/suffix or part-of-speech change is required and why).
7. STEP 7 ("grammarPhrase"): Set "grammarPhrase" to the 3-5 word phrase from "correction" around the gap.

Respond ONLY with valid JSON matching the schema.`;
        } else if (resolvedQuestionType === "keyWordTransformation") {
          prompt = `You are a master Cambridge English examiner designing a Key Word Transformation (Use of English Part 4) challenge for a Grammar Casino game.
Settings:
- Language Domain: "${topic}"
- CEFR Level: "${level}"
- Theme: "${theme}" (${currentThemeFacet})${subtypeClause}
${varietyDirective}

=== CEFR LEVEL REQUIREMENTS (${level}) ===
- SYNTAX (${profile.targetLength}): ${profile.syntax}
- LEXIS & VOCABULARY: ${profile.lexis}
${avoidSentencesClause}
${avoidMistakesClause}

=== CAMBRIDGE KEY WORD TRANSFORMATION (PART 4) STRICT RULES ===
1. STEP 1 ("leadInSentence"): Write a complete, natural lead-in sentence anchored in "${currentThemeFacet}".
2. STEP 2 ("baseWord"): Provide ONE given KEY WORD in UPPERCASE (e.g. "BEING", "SAID", "HAD", "RUMOURED", "UNLESS", "SPITE", "RATHER", "DENIED", "SOONER"). Students MUST NOT change this key word in any way, and it MUST NOT be a key word already used in previous rounds.
3. STEP 3 ("correction"): Write the FULL, 100% grammatically complete second sentence (with NO blanks) that expresses the exact same meaning and tense/aspect frame as "leadInSentence" and includes "baseWord" unchanged${effectiveSubtype ? `, specifically demonstrating: ${effectiveSubtype}` : ""}.
4. STEP 4 ("correctAnswer"): Extract the exact 2-to-6 word target phrase from "correction" that contains "baseWord" and tests "${topic}".
   - CRITICAL: "correctAnswer" MUST be between 2 and 6 words long and MUST contain "baseWord" as an unaltered whole word!
5. STEP 5 ("text"): Copy "correction" word-for-word and replace ONLY "correctAnswer" with an exact 5-underscore blank: "_____".
   - Replacing "_____" in "text" with "correctAnswer" MUST produce "correction" word-for-word!
6. STEP 6 ("mark1Parts" & "mark2Parts"): Split "correctAnswer" into the two distinct grammatical halves that each earn 1 mark in Cambridge grading:
   - "mark1Parts": Array of valid strings for the 1st mark (first structural half of the answer, e.g. ["have not seen", "haven't seen"]).
   - "mark2Parts": Array of valid strings for the 2nd mark (second structural half of the answer, e.g. ["Marcus since", "since"]).
7. STEP 7 ("acceptedAnswers"): List all valid 2-to-6 word phrases (including contraction variants) that earn the full 2/2 marks.
8. STEP 8 ("explanation"): Write a clear, plain-English 1-2 sentence explanation of both grammatical components required for the 2 marks.
9. STEP 9 ("grammarPhrase"): Set "grammarPhrase" to the 3-6 word phrase from "correction" around the transformation.

Respond ONLY with valid JSON matching the schema.`;
        } else {
          const correctnessInstruction =
            forceCorrect === null
              ? "Generate an incorrect sentence 60% of the time and a correct one 40% of the time."
              : forceCorrect
              ? "The sentence MUST be 100% correct (both grammatically and lexically)."
              : "The sentence MUST contain an error testing the selected Language Domain.";

          prompt = `You are a master English teacher and linguistics expert designing a challenge for a Grammar Casino game.
Settings:
- Language Domain: "${topic}"
- CEFR Level: "${level}"
- Theme: "${theme}" (${currentThemeFacet})

${correctnessInstruction}${subtypeClause}${domainGuidanceBinary}
${varietyDirective}

=== CEFR LEVEL REQUIREMENTS (${level}) ===
The sentence MUST strictly conform to the linguistic, syntactic, and pedagogical profile of CEFR Level ${level}:
- SYNTAX (${profile.targetLength}): ${profile.syntax}
- LEXIS & VOCABULARY: ${profile.lexis}
- MISTAKE IDENTIFICATION: ${profile.mistakeIdentification}
${avoidSentencesClause}
${avoidMistakesClause}

grammarPhrase MUST be an exact substring of the generated sentence (3-6 words) representing the core grammatical, collocation, or lexical feature being tested.
errorPhrase MUST be the exact erroneous snippet if the sentence is incorrect, or empty string if correct.
mistakeType MUST be a short descriptor (2-4 words) of the error type if incorrect, or empty string if correct.
explanation MUST be a clear, plain-English 1-2 sentence explanation of why the sentence is right or wrong (easy for students to understand without heavy linguistic jargon).

Respond ONLY with valid JSON matching the schema.`;
        }

        const activeSchema = getSentenceSchema(resolvedQuestionType);
        const response = await callWithModelRotation(TEXT_MODELS, async (ai, model) => {
          return await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: activeSchema,
              thinkingConfig: getFastThinkingConfig(model),
            },
          });
        });

        const jsonText = response.text ? response.text.trim() : "";
        const generatedData = JSON.parse(jsonText);
        generatedData.questionType = resolvedQuestionType;

        if (resolvedQuestionType === "binary") {
          if (!generatedData.isCorrect && !generatedData.errorPhrase) {
            generatedData.errorPhrase = generatedData.grammarPhrase;
          }
        } else if (resolvedQuestionType === "multipleChoice") {
          generatedData.isCorrect = true;
          enforceMultipleChoiceIntegrity(generatedData);
        } else if (resolvedQuestionType === "openCloze") {
          generatedData.isCorrect = true;
          enforceOpenClozeIntegrity(generatedData);
        } else if (resolvedQuestionType === "wordFormation") {
          generatedData.isCorrect = true;
          enforceWordFormationIntegrity(generatedData);
        } else if (resolvedQuestionType === "keyWordTransformation") {
          generatedData.isCorrect = true;
          enforceKeyWordTransformationIntegrity(generatedData);
        }

        return res.status(200).json(generatedData);
      }

      case "getHint": {
        const { sentence, topic, level, questionType, baseWord } = payload;
        if (!sentence || typeof sentence !== "string" || !topic || typeof topic !== "string") {
          return res.status(400).json({ error: "Missing required 'sentence' or 'topic' parameters." });
        }

        const safeSentence = sentence.slice(0, 500);
        const safeTopic = topic.slice(0, 100);
        const safeBaseWord = baseWord ? String(baseWord).slice(0, 40).toUpperCase() : "";
        const levelContext = level ? `The student's CEFR level is ${String(level).slice(0, 5)}. Adapt the hint subtlety to this level.` : "";
        const isCloze =
          questionType === "multipleChoice" ||
          questionType === "openCloze" ||
          questionType === "wordFormation" ||
          questionType === "keyWordTransformation" ||
          safeSentence.includes("_____");

        const prompt =
          questionType === "keyWordTransformation"
            ? `A player in a language game is solving this Cambridge Key Word Transformation (Part 4) sentence: "${safeSentence}" using the unchangeable key word "${safeBaseWord || "KEY"}".
The language domain is "${safeTopic}".
${levelContext}
Give a very short, subtle, one-sentence clue about the grammatical structure or collocation needed with "${safeBaseWord || "the key word"}" to complete "_____" in 2 to 6 words. NEVER reveal the exact full answer phrase.
Respond ONLY with the hint text.`
            : questionType === "wordFormation"
            ? `A player in a language game is solving this Cambridge Word Formation sentence: "${safeSentence}" with base word (${safeBaseWord || "ROOT"}).
The language domain is "${safeTopic}".
${levelContext}
Give a very short, subtle, one-sentence clue about what part of speech (noun, verb, adjective, adverb) or prefix/suffix transformation (e.g. negative prefix, person noun, plural noun) is needed for "${safeBaseWord || "the base word"}" to fit "_____". NEVER reveal the exact derived answer word itself.
Respond ONLY with the hint text.`
            : isCloze
            ? `A player in a language game is looking at this cloze sentence with a blank: "${safeSentence}".
The language domain being tested is "${safeTopic}".
${levelContext}
Give a very short, subtle, one-sentence clue about the grammatical rule, collocation partner, or lexical meaning that governs the missing word in "_____". NEVER reveal the exact missing word itself.
Respond ONLY with the hint text.`
            : `A player in a language game is looking at this sentence: "${safeSentence}".
The language domain being tested is "${safeTopic}".
${levelContext}
Give a very short, cryptic, one-sentence hint about what might be wrong (whether grammatical, a collocation mismatch, or a wrong lexical choice). Don't give away the answer.
If the sentence is actually correct, your hint could be "Sometimes, things are just as they seem."
Respond ONLY with the hint text.`;

        const response = await callWithModelRotation(TEXT_MODELS, async (ai, model) => {
          return await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              thinkingConfig: getFastThinkingConfig(model),
            },
          });
        });

        const hint = (response.text || "").trim();
        return res.status(200).json({ hint });
      }

      case "verifyCorrection": {
        const { originalSentence, userCorrection, intendedCorrection } = payload;
        if (
          !originalSentence ||
          typeof originalSentence !== "string" ||
          !userCorrection ||
          typeof userCorrection !== "string" ||
          !intendedCorrection ||
          typeof intendedCorrection !== "string"
        ) {
          return res.status(400).json({ error: "Missing sentence verification parameters." });
        }

        const prompt = `You are a fair but strict judge in an English language and grammar game.
The original, flawed sentence was: "${originalSentence.slice(0, 500)}"
The intended correct version is: "${intendedCorrection.slice(0, 500)}"
A player submitted this correction: "${userCorrection.slice(0, 500)}"

Your task is to evaluate if the player's correction is a valid fix.
A "valid fix" means it is grammatically and lexically natural and fixes the main error (whether a grammatical mistake, a collocation error, or an inaccurate vocabulary word), even if it uses a different valid synonym or phrasing than the intended correction.
However, if the player's correction introduces a *new* grammatical or lexical error, it is NOT a valid fix.
Respond ONLY with the JSON object matching the provided schema.`;

        const response = await callWithModelRotation(TEXT_MODELS, async (ai, model) => {
          return await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: verificationSchema,
              thinkingConfig: getFastThinkingConfig(model),
            },
          });
        });

        const jsonText = response.text ? response.text.trim() : "";
        const result = JSON.parse(jsonText);
        return res.status(200).json(result);
      }

      case "verifyOpenClozeBatch": {
        const {
          sentenceWithBlank,
          intendedAnswer,
          acceptedAnswers = [],
          candidateWords = [],
          questionType: batchQuestionType,
          baseWord: batchBaseWord,
          leadInSentence = "",
          mark1Parts = [],
          mark2Parts = [],
        } = payload;
        if (!sentenceWithBlank || typeof sentenceWithBlank !== "string" || !Array.isArray(candidateWords)) {
          return res.status(400).json({ error: "Missing parameters for verifyOpenClozeBatch." });
        }

        const uniqueWords = Array.from(
          new Set(
            candidateWords
              .map((w: any) => String(w || "").trim().replace(/\s+/g, " "))
              .filter((w: string) => w.length > 0)
          )
        ).slice(0, 30);

        if (uniqueWords.length === 0) {
          return res.status(200).json({ results: {} });
        }

        const safeBase = batchBaseWord ? String(batchBaseWord).trim().toUpperCase().slice(0, 50) : "";
        const isKeyWordTransformation = batchQuestionType === "keyWordTransformation";
        const isWordFormation = !isKeyWordTransformation && (batchQuestionType === "wordFormation" || Boolean(safeBase));

        const prompt = isKeyWordTransformation
          ? `You are a strict Cambridge English Use of English Part 4 (Key Word Transformation) examiner grading student submissions on a 0, 1, or 2 mark scale.
Lead-in sentence: "${String(leadInSentence || "").slice(0, 400)}"
Given KEY WORD (MUST NOT be changed): "${safeBase}"
Second sentence with blank: "${sentenceWithBlank.slice(0, 500)}"
Primary 2-mark target phrase: "${String(intendedAnswer || "").slice(0, 120)}"
Known 2-mark accepted phrases: ${JSON.stringify(acceptedAnswers.slice(0, 20))}
1st Mark structural half (mark1Parts): ${JSON.stringify((Array.isArray(mark1Parts) ? mark1Parts : []).slice(0, 10))}
2nd Mark structural half (mark2Parts): ${JSON.stringify((Array.isArray(mark2Parts) ? mark2Parts : []).slice(0, 10))}

Evaluate each of the following student-submitted candidate phrases:
${JSON.stringify(uniqueWords)}

STRICT OFFICIAL CAMBRIDGE PART 4 (0 / 1 / 2 MARKS) MARKING SCHEME:
The target answer is divided into TWO independent 1-mark halves:
- HALF 1 (mark1Correct): the opening grammatical structure (${JSON.stringify((Array.isArray(mark1Parts) ? mark1Parts : []).slice(0, 5))})
- HALF 2 (mark2Correct): the closing grammatical structure (${JSON.stringify((Array.isArray(mark2Parts) ? mark2Parts : []).slice(0, 5))})

Grade each candidate by checking HALF 1 and HALF 2 independently:
1. MANDATORY GATE: The submission MUST contain the exact unaltered KEY WORD "${safeBase}" (case-insensitive) and be between 2 and 6 words long. If it omits or alters "${safeBase}" or is outside 2–6 words, set mark1Correct: false, mark2Correct: false, marks: 0, isCorrect: false.
2. NO FREE MARK FOR THE KEY WORD: Simply writing "${safeBase}" or pairing it with the wrong verb tense/auxiliary NEVER earns a mark!
3. STRICT TENSE & AGREEMENT CHECK (CRITICAL):
   - Compare the verb tense in the student's phrase against the Lead-in sentence ("${String(leadInSentence || "").slice(0, 200)}") and the target phrase ("${String(intendedAnswer || "").slice(0, 120)}").
   - If the Lead-in sentence and target phrase are in the PRESENT tense (e.g., "expects" -> "is expected", "has", "do/does"), using a PAST tense form (e.g., "was expected", "were expected", "had", "did") is GRAMMATICALLY WRONG and scores 0 for that half!
   - If the Lead-in sentence and target phrase are in the PAST tense, using a PRESENT tense form is GRAMMATICALLY WRONG and scores 0 for that half!
   - Wrong subject-verb agreement (e.g., plural "are/were/have" with a singular subject, or singular "is/was/has" with a plural subject) scores 0 for that half!
4. STRICT SPELLING CHECK (CRITICAL):
   - Every word in a half MUST be spelled 100% correctly (standard British or American English) to earn that half's 1 mark.
   - Any spelling error in a half (for example, "fullfilled" instead of "fulfilled", "recieved", "definately", "occured") automatically scores 0 for that half!
5. TOTAL MARKS CALCULATION:
   - marks = (mark1Correct ? 1 : 0) + (mark2Correct ? 1 : 0).
   - Award marks: 2, isCorrect: true ONLY if BOTH Half 1 and Half 2 are 100% grammatically, semantically, and orthographically accurate.
   - Award marks: 1, isCorrect: true ONLY if ONE half is 100% accurate (correct tense, agreement, and exact spelling) and the error is confined strictly to the OTHER half.
   - Award marks: 0, isCorrect: false if BOTH halves contain an error (for example: wrong verb tense "was expected" in Half 1 AND misspelled "fullfilled" in Half 2 MUST score 0 marks!).

Respond ONLY with valid JSON matching the schema.`
          : isWordFormation
          ? `You are a Cambridge English Use of English Part 3 (Word Formation) examiner grading student submissions.
Sentence with blank: "${sentenceWithBlank.slice(0, 500)}"
Base/root word in parentheses: "${safeBase}"
Primary intended derived word: "${String(intendedAnswer || "").slice(0, 60)}"
Known accepted derived words: ${JSON.stringify(acceptedAnswers.slice(0, 20))}

Evaluate each of the following student-submitted candidate words:
${JSON.stringify(uniqueWords)}

STRICT WORD FORMATION RULES:
1. Gaps require a SINGLE WORD only. If a candidate contains spaces, mark isCorrect: false, marks: 0.
2. The candidate word MUST be a valid morphological derivation (inflection, prefix, suffix, or compound) of the base word "${safeBase}". A synonym from a different word family is NOT allowed in Word Formation.
3. The candidate word MUST NOT be identical to the unchanged base word "${safeBase}".
4. Accept both British and American English spelling variants (e.g. -ise/-ize, -our/-or, -ll-/-l-) if the word is correctly derived from "${safeBase}" and fits the sentence grammatically and semantically (set marks: 1 when isCorrect is true, 0 when false).
5. Provide a brief 1-sentence feedback for each word.

Respond ONLY with valid JSON matching the schema.`
          : `You are a Cambridge English Use of English examiner grading an Open Cloze single-word gap-fill exercise.
Sentence with blank: "${sentenceWithBlank.slice(0, 500)}"
Primary intended single word: "${String(intendedAnswer || "").slice(0, 60)}"
Known accepted single words: ${JSON.stringify(acceptedAnswers.slice(0, 20))}

Evaluate each of the following student-submitted candidate words:
${JSON.stringify(uniqueWords)}

STRICT RULES:
1. Open Cloze gaps require a SINGLE WORD only. If a candidate contains multiple words (spaces), mark isCorrect: false, marks: 0.
2. Mark isCorrect: true, marks: 1 ONLY if inserting the single word into "_____" produces a 100% grammatically accurate, natural, and contextually coherent English sentence.
3. Provide a brief 1-sentence feedback for each word.

Respond ONLY with valid JSON matching the schema.`;

        const response = await callWithModelRotation(TEXT_MODELS, async (ai, model) => {
          return await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: batchClozeVerificationSchema,
              thinkingConfig: getFastThinkingConfig(model),
            },
          });
        });

        const jsonText = response.text ? response.text.trim() : "";
        const parsed = JSON.parse(jsonText);
        const results: Record<string, { isCorrect: boolean; marks: 0 | 1 | 2; feedback: string }> = {};
        if (Array.isArray(parsed?.evaluations)) {
          parsed.evaluations.forEach((ev: any) => {
            if (ev && typeof ev.word === "string") {
              let rawMarks: number;
              if (
                isKeyWordTransformation &&
                typeof ev.mark1Correct === "boolean" &&
                typeof ev.mark2Correct === "boolean"
              ) {
                rawMarks = (ev.mark1Correct ? 1 : 0) + (ev.mark2Correct ? 1 : 0);
                if (typeof ev.marks === "number") {
                  rawMarks = Math.min(rawMarks, ev.marks);
                }
              } else {
                rawMarks = typeof ev.marks === "number" ? ev.marks : ev.isCorrect ? (isKeyWordTransformation ? 2 : 1) : 0;
              }
              const clampedMarks = (rawMarks >= 2 ? 2 : rawMarks === 1 ? 1 : 0) as 0 | 1 | 2;
              results[ev.word.trim().replace(/\s+/g, " ").toLowerCase()] = {
                isCorrect: isKeyWordTransformation ? clampedMarks >= 1 : Boolean(ev.isCorrect),
                marks: clampedMarks,
                feedback: String(ev.feedback || ""),
              };
            }
          });
        }
        return res.status(200).json({ results });
      }

      case "detailExplanation":
      case "simplifyExplanation": {
        const { originalExplanation, topic, sentence, correction } = payload;
        if (!originalExplanation || typeof originalExplanation !== "string") {
          return res.status(400).json({ error: "Missing 'originalExplanation' parameter." });
        }

        const safeExpl = originalExplanation.slice(0, 1000);
        const safeTopic = String(topic || "Grammar").slice(0, 100);
        const safeSentence = sentence ? String(sentence).slice(0, 400) : "";
        const safeCorrection = correction ? String(correction).slice(0, 400) : "";
        const cacheKey = `detail:${safeTopic}:${safeSentence}:${safeExpl}`;

        const cached = responseCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
          return res.status(200).json({ simplified: cached.data, detailed: cached.data });
        }

        const prompt = `You are a senior English linguistics professor. Expand the following plain-English grammar note into a precise, detailed grammatical explanation (2-3 sentences). Name the exact grammatical rule, syntactic structure, or part-of-speech mechanism involved and briefly explain why other forms fail.
- Topic: ${safeTopic}${safeSentence ? `\n- Sentence: "${safeSentence}"` : ""}${safeCorrection ? `\n- Correct Form: "${safeCorrection}"` : ""}
- Plain-English Summary: "${safeExpl}"
- Detailed Grammatical Explanation:`;

        const response = await callWithModelRotation(TEXT_MODELS, async (ai, model) => {
          return await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              thinkingConfig: getFastThinkingConfig(model),
            },
          });
        });

        const detailed = (response.text || "").trim();
        responseCache.set(cacheKey, { data: detailed, expiresAt: Date.now() + CACHE_TTL_MS });
        return res.status(200).json({ simplified: detailed, detailed });
      }

      case "generateSpeech": {
        const { text } = payload;
        if (!text || typeof text !== "string") {
          return res.status(400).json({ error: "Missing 'text' parameter for speech generation." });
        }

        const safeText = text.slice(0, 600).trim();
        const cacheKey = `tts_v3:${safeText}`;

        const cached = responseCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
          return res.status(200).json({ base64Audio: cached.data });
        }

        const base64Audio = await callWithModelRotation(TTS_MODELS, async (ai, model) => {
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
                  prebuiltVoiceConfig: { voiceName: "Kore" },
                },
              },
            },
          });

          const audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          if (!audio) throw new Error("No audio data returned by TTS model.");
          return audio;
        });

        responseCache.set(cacheKey, { data: base64Audio, expiresAt: Date.now() + CACHE_TTL_MS });
        return res.status(200).json({ base64Audio });
      }

      default:
        return res.status(400).json({ error: `Unsupported action: '${action}'.` });
    }
  } catch (err: any) {
    const overload = isHighTrafficOrOverload(err);
    const shortReason = overload
      ? "Upstream Gemini rate limit or quota reached; activating curated local fallback."
      : err?.message || "Gemini request failed; activating local fallback.";
    console.warn(`[Gemini Route] ${shortReason}`);
    return res.status(200).json({
      fallback: true,
      isOverload: overload,
      error: shortReason,
    });
  } finally {
    activeRequests = Math.max(0, activeRequests - 1);
  }
}

app.post("/api/gemini", handleGeminiRequest);

// Teacher PIN Auth & Status Endpoints
app.get("/api/teacher-auth/status", (req, res) => {
  res.json({
    unlocked: isTeacherAuthorized(req),
    pinRequired: true,
    pinConfigured: isPinConfigured(),
  });
});

app.post("/api/teacher-auth/verify", (req, res) => {
  if (!isPinConfigured()) {
    return res.status(503).json({ valid: false, pinConfigured: false, error: PIN_NOT_CONFIGURED_ERROR });
  }
  const clientIp = getClientIp(req);
  const lockout = checkPinLockout(clientIp);
  if (lockout.locked) {
    const mins = Math.ceil((lockout.retryAfterSec || 60) / 60);
    return res.status(429).json({
      valid: false,
      error: `Too many failed PIN attempts. Locked for ${mins} minute${mins === 1 ? "" : "s"}.`,
    });
  }
  const candidate = String(req.body?.pin || "").trim();
  const valid = verifyPinMatch(candidate);
  const outcome = recordPinOutcome(clientIp, valid);
  if (!valid) {
    if (outcome.locked) {
      return res.status(429).json({
        valid: false,
        error: "Too many failed PIN attempts. Locked for 15 minutes.",
      });
    }
    return res.status(401).json({ valid: false, error: "Incorrect Teacher PIN." });
  }
  return res.json({ valid: true });
});

app.post("/api/teacher-auth/change-pin", (req, res) => {
  if (!isPinConfigured()) {
    return res.status(503).json({ ok: false, pinConfigured: false, error: PIN_NOT_CONFIGURED_ERROR });
  }
  const clientIp = getClientIp(req);
  const lockout = checkPinLockout(clientIp);
  if (lockout.locked) {
    const mins = Math.ceil((lockout.retryAfterSec || 60) / 60);
    return res.status(429).json({
      ok: false,
      error: `Too many failed PIN attempts. Locked for ${mins} minute${mins === 1 ? "" : "s"}.`,
    });
  }
  const currentPin = String(req.body?.currentPin || "").trim();
  const newPin = String(req.body?.newPin || "").trim();
  const currentValid = verifyPinMatch(currentPin);
  const outcome = recordPinOutcome(clientIp, currentValid);
  if (!currentValid) {
    if (outcome.locked) {
      return res.status(429).json({
        ok: false,
        error: "Too many failed PIN attempts. Locked for 15 minutes.",
      });
    }
    return res.status(401).json({ ok: false, error: "Current Teacher PIN is incorrect." });
  }
  if (newPin.length < 4 || newPin.length > 32) {
    return res.status(400).json({ ok: false, error: "New PIN must be between 4 and 32 characters." });
  }
  activeTeacherPin = newPin;
  try {
    fs.writeFileSync(TEACHER_PIN_FILE, JSON.stringify({ pin: activeTeacherPin }, null, 2), "utf-8");
  } catch (err) {
    console.warn("Could not persist .teacher-pin.json to disk, updated in memory:", err);
  }
  return res.json({ ok: true });
});

let cachedGoogleCerts: { certs: Record<string, string>; expiresAt: number } | null = null;

async function getGoogleSecureTokenCerts(): Promise<Record<string, string>> {
  if (cachedGoogleCerts && Date.now() < cachedGoogleCerts.expiresAt) {
    return cachedGoogleCerts.certs;
  }
  const resp = await fetch(
    "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
  );
  if (!resp.ok) {
    throw new Error("Failed to fetch Google public certificates.");
  }
  const certs = (await resp.json()) as Record<string, string>;
  cachedGoogleCerts = {
    certs,
    expiresAt: Date.now() + 60 * 60 * 1000, // cache 1 hour
  };
  return certs;
}

app.post("/api/teacher-auth/google-verify", async (req, res) => {
  try {
    const idToken = String(req.body?.idToken || "").trim();
    const parts = idToken.split(".");
    if (!idToken || parts.length !== 3) {
      return res.status(400).json({ valid: false, error: "Invalid Google ID token." });
    }
    const [headerB64, payloadB64, signatureB64] = parts;
    const header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf-8"));
    const claims = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));

    // 1. Verify cryptographic signature using Google's official public X.509 certs
    const certs = await getGoogleSecureTokenCerts();
    const cert = certs[header?.kid];
    if (!cert || header?.alg !== "RS256") {
      return res.status(401).json({ valid: false, error: "Unrecognized token signature key." });
    }
    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(`${headerB64}.${payloadB64}`);
    verifier.end();
    const signatureValid = verifier.verify(cert, Buffer.from(signatureB64, "base64url"));
    if (!signatureValid) {
      return res.status(401).json({ valid: false, error: "Invalid token signature." });
    }

    // 2. Verify Firebase project audience, issuer, expiration, and exact Teacher email
    const email = String(claims?.email || "").trim().toLowerCase();
    const emailVerified = Boolean(claims?.email_verified);
    const exp = Number(claims?.exp || 0) * 1000;
    const aud = String(claims?.aud || "");
    const iss = String(claims?.iss || "");

    if (
      !emailVerified ||
      email !== "teacher.siqueira@gmail.com" ||
      exp < Date.now() ||
      aud !== "cool-citadel-456408-k5" ||
      iss !== "https://securetoken.google.com/cool-citadel-456408-k5"
    ) {
      return res.status(403).json({
        valid: false,
        error: "Access denied: Only teacher.siqueira@gmail.com can unlock Live AI via Google Sign-In.",
      });
    }

    const clientIp = getClientIp(req);
    recordPinOutcome(clientIp, true);
    return res.json({ valid: true, sessionPin: activeTeacherPin || googleVerifiedSessionToken });
  } catch (err) {
    return res.status(400).json({ valid: false, error: "Could not verify Google ID token." });
  }
});

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", app: "grammar-casino" });
});

// ============================================================================
// --- Multiplayer Room Relay (WebSocket + HTTP Fallback) ---
// ============================================================================
interface RelaySeat {
  seatId: string;
  playerId: number;
  name: string;
  avatar: string;
  reconnectToken: string;
  connected: boolean;
  lockedIn: boolean;
  lastSeen: number;
  ws?: WebSocket | null;
}

interface RelayHostEvent {
  id: string;
  type: 'STUDENT_JOINED' | 'STUDENT_RECONNECTED' | 'STUDENT_DISCONNECTED' | 'STUDENT_INTENT';
  seat?: Omit<RelaySeat, 'ws'>;
  playerId?: number;
  intent?: any;
  timestamp: number;
}

interface RelayRoom {
  code: string;
  hostToken: string;
  locked: boolean;
  createdAt: number;
  lastActivity: number;
  hostWs: WebSocket | null;
  seats: Map<number, RelaySeat>; // playerId -> RelaySeat
  playerViews: Map<number, any>; // playerId -> latest filtered PlayerViewPayload
  pendingHostEvents: RelayHostEvent[];
}

const ROOM_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const rooms = new Map<string, RelayRoom>();

function generateRoomCode(): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = "";
    for (let i = 0; i < 4; i++) {
      code += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return crypto.randomBytes(2).toString("hex").toUpperCase();
}

function serializeSeat(seat: RelaySeat): Omit<RelaySeat, 'ws'> {
  return {
    seatId: seat.seatId,
    playerId: seat.playerId,
    name: seat.name,
    avatar: seat.avatar,
    reconnectToken: seat.reconnectToken,
    connected: seat.connected,
    lockedIn: seat.lockedIn,
    lastSeen: seat.lastSeen,
  };
}

function pushEventToHost(room: RelayRoom, event: RelayHostEvent) {
  room.lastActivity = Date.now();
  if (room.hostWs && room.hostWs.readyState === WebSocket.OPEN) {
    try {
      room.hostWs.send(JSON.stringify({ type: "HOST_EVENT", event }));
      return;
    } catch {
      // Fall through to queue
    }
  }
  room.pendingHostEvents.push(event);
  if (room.pendingHostEvents.length > 300) {
    room.pendingHostEvents.shift();
  }
}

function relayIntentId(intentId: unknown): string {
  return typeof intentId === "string" && /^[A-Za-z0-9_-]{4,80}$/.test(intentId) ? intentId : crypto.randomUUID();
}

function sendViewToStudent(room: RelayRoom, playerId: number, view: any) {
  room.playerViews.set(playerId, view);
  const seat = room.seats.get(playerId);
  if (seat?.ws && seat.ws.readyState === WebSocket.OPEN) {
    try {
      seat.ws.send(JSON.stringify({ type: "PLAYER_VIEW", view }));
    } catch {
      // Student will pick up via HTTP poll fallback
    }
  }
}

// Clean up stale rooms older than 6 hours
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (now - room.lastActivity > 6 * 60 * 60 * 1000) {
      rooms.delete(code);
    }
  }
}, 10 * 60 * 1000);

// 1. Create Room (Host — requires Teacher PIN)
app.post("/api/mp/room/create", (req, res) => {
  if (!isTeacherAuthorized(req, req.body)) {
    return res.status(403).json({
      error: "Teacher PIN required to host a Live Classroom Room.",
    });
  }
  const code = generateRoomCode();
  const hostToken = crypto.randomBytes(16).toString("hex");
  const now = Date.now();
  const room: RelayRoom = {
    code,
    hostToken,
    locked: false,
    createdAt: now,
    lastActivity: now,
    hostWs: null,
    seats: new Map(),
    playerViews: new Map(),
    pendingHostEvents: [],
  };
  rooms.set(code, room);
  res.json({ code, hostToken });
});

// 2. Join or Reconnect Room (Student)
app.post("/api/mp/room/join", (req, res) => {
  const rawCode = String(req.body?.code || "").trim().toUpperCase();
  const rawName = String(req.body?.name || "").trim().slice(0, 20);
  const rawAvatar = String(req.body?.avatar || "🦊").trim();
  const reconnectToken = String(req.body?.reconnectToken || "").trim();

  const room = rooms.get(rawCode);
  if (!room) {
    return res.status(404).json({ error: `Room "${rawCode}" not found. Check the 4-letter code on the projector.` });
  }

  room.lastActivity = Date.now();

  // Check reconnect by token first
  if (reconnectToken) {
    for (const seat of room.seats.values()) {
      if (seat.reconnectToken === reconnectToken) {
        seat.connected = true;
        seat.lastSeen = Date.now();
        if (rawName) seat.name = rawName;
        if (rawAvatar) seat.avatar = rawAvatar;
        pushEventToHost(room, {
          id: crypto.randomUUID(),
          type: "STUDENT_RECONNECTED",
          seat: serializeSeat(seat),
          playerId: seat.playerId,
          timestamp: Date.now(),
        });
        return res.json({
          code: room.code,
          seat: serializeSeat(seat),
          view: room.playerViews.get(seat.playerId) || null,
        });
      }
    }
  }

  // Also allow reconnecting if an existing seat has the exact same case-insensitive name and is currently disconnected
  if (rawName) {
    for (const seat of room.seats.values()) {
      if (seat.name.toLowerCase() === rawName.toLowerCase() && !seat.connected) {
        seat.connected = true;
        seat.lastSeen = Date.now();
        if (rawAvatar) seat.avatar = rawAvatar;
        pushEventToHost(room, {
          id: crypto.randomUUID(),
          type: "STUDENT_RECONNECTED",
          seat: serializeSeat(seat),
          playerId: seat.playerId,
          timestamp: Date.now(),
        });
        return res.json({
          code: room.code,
          seat: serializeSeat(seat),
          view: room.playerViews.get(seat.playerId) || null,
        });
      }
    }
  }

  if (room.locked) {
    return res.status(403).json({ error: "This table is currently locked by the teacher." });
  }

  if (!rawName) {
    return res.status(400).json({ error: "Please enter your display name to join." });
  }

  // Ensure unique display name
  let finalName = rawName;
  let suffix = 2;
  const existingNames = new Set(Array.from(room.seats.values()).map(s => s.name.toLowerCase()));
  while (existingNames.has(finalName.toLowerCase())) {
    finalName = `${rawName.slice(0, 16)} #${suffix++}`;
  }

  const playerId = Date.now() + Math.floor(Math.random() * 10000);
  const newSeat: RelaySeat = {
    seatId: crypto.randomUUID(),
    playerId,
    name: finalName,
    avatar: rawAvatar || "🦊",
    reconnectToken: crypto.randomBytes(16).toString("hex"),
    connected: true,
    lockedIn: false,
    lastSeen: Date.now(),
    ws: null,
  };

  room.seats.set(playerId, newSeat);

  pushEventToHost(room, {
    id: crypto.randomUUID(),
    type: "STUDENT_JOINED",
    seat: serializeSeat(newSeat),
    playerId,
    timestamp: Date.now(),
  });

  return res.json({
    code: room.code,
    seat: serializeSeat(newSeat),
    view: room.playerViews.get(playerId) || null,
  });
});

// 3. Host Sync Views & Room Control (Lock / Kick / Broadcast Views)
app.post("/api/mp/room/:code/host-sync", (req, res) => {
  const code = String(req.params.code || "").toUpperCase();
  const room = rooms.get(code);
  if (!room) return res.status(404).json({ error: "Room not found." });

  const { hostToken, locked, kickPlayerId, resetLocks, views } = req.body || {};
  if (hostToken !== room.hostToken) {
    return res.status(403).json({ error: "Unauthorized host token." });
  }

  room.lastActivity = Date.now();

  if (typeof locked === "boolean") {
    room.locked = locked;
  }

  if (typeof kickPlayerId === "number") {
    const kicked = room.seats.get(kickPlayerId);
    if (kicked?.ws && kicked.ws.readyState === WebSocket.OPEN) {
      try {
        kicked.ws.send(JSON.stringify({ type: "KICKED" }));
        kicked.ws.close();
      } catch {}
    }
    room.seats.delete(kickPlayerId);
    room.playerViews.delete(kickPlayerId);
  }

  if (resetLocks) {
    for (const seat of room.seats.values()) {
      seat.lockedIn = false;
    }
  }

  if (views && typeof views === "object") {
    for (const [pidStr, viewPayload] of Object.entries(views)) {
      const pid = Number(pidStr);
      if (!isNaN(pid)) {
        const seat = room.seats.get(pid);
        if (seat && typeof (viewPayload as any)?.lockedIn === "boolean") {
          seat.lockedIn = Boolean((viewPayload as any).lockedIn);
        }
        sendViewToStudent(room, pid, viewPayload);
      }
    }
  }

  const drainedEvents = [...room.pendingHostEvents];
  room.pendingHostEvents = [];

  return res.json({
    ok: true,
    locked: room.locked,
    seats: Array.from(room.seats.values()).map(serializeSeat),
    events: drainedEvents,
  });
});

// 4. Student Intent Endpoint (HTTP fallback when WS is not open)
app.post("/api/mp/room/:code/intent", (req, res) => {
  const code = String(req.params.code || "").toUpperCase();
  const room = rooms.get(code);
  if (!room) return res.status(404).json({ error: "Room not found." });

  const { playerId, reconnectToken, intent, intentId } = req.body || {};
  const seat = room.seats.get(Number(playerId));
  if (!seat || seat.reconnectToken !== reconnectToken) {
    return res.status(403).json({ error: "Invalid player session." });
  }

  seat.connected = true;
  seat.lastSeen = Date.now();
  if (intent?.type === "LOCK_IN" && typeof intent.locked === "boolean") {
    seat.lockedIn = intent.locked;
  }

  pushEventToHost(room, {
    // The phone's own intent id lets the host skip the copy that also arrives through Firestore.
    id: relayIntentId(intentId),
    type: "STUDENT_INTENT",
    playerId: seat.playerId,
    seat: serializeSeat(seat),
    intent,
    timestamp: Date.now(),
  });

  return res.json({
    ok: true,
    view: room.playerViews.get(seat.playerId) || null,
  });
});

// 5. Student Poll View Endpoint (HTTP fallback)
app.get("/api/mp/room/:code/view", (req, res) => {
  const code = String(req.params.code || "").toUpperCase();
  const room = rooms.get(code);
  if (!room) return res.status(404).json({ error: "Room not found." });

  const playerId = Number(req.query.playerId);
  const token = String(req.query.token || "");
  const seat = room.seats.get(playerId);
  if (!seat || seat.reconnectToken !== token) {
    return res.status(403).json({ error: "Session expired or removed from table." });
  }

  seat.connected = true;
  seat.lastSeen = Date.now();

  return res.json({
    ok: true,
    view: room.playerViews.get(playerId) || null,
  });
});

// --- Vite Middleware (Dev) or Static Files (Prod) ---
async function startServer() {
  const isProduction = process.env.NODE_ENV === "production";

  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  }

  const httpServer = http.createServer(app);

  // Attach WebSocketServer at /ws on the same port 3000
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws: WebSocket) => {
    let boundRoomCode: string | null = null;
    let boundRole: "host" | "student" | null = null;
    let boundPlayerId: number | null = null;

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (!msg || typeof msg.type !== "string") return;

        if (msg.type === "REGISTER_HOST") {
          const code = String(msg.code || "").toUpperCase();
          const room = rooms.get(code);
          if (!room || room.hostToken !== msg.hostToken) {
            ws.send(JSON.stringify({ type: "ERROR", message: "Invalid room or host token." }));
            return;
          }
          boundRoomCode = code;
          boundRole = "host";
          room.hostWs = ws;
          room.lastActivity = Date.now();

          // Flush any queued events to host immediately
          const queued = [...room.pendingHostEvents];
          room.pendingHostEvents = [];
          ws.send(
            JSON.stringify({
              type: "HOST_REGISTERED",
              code: room.code,
              locked: room.locked,
              seats: Array.from(room.seats.values()).map(serializeSeat),
              events: queued,
            })
          );
          return;
        }

        if (msg.type === "HOST_PUSH_VIEWS") {
          if (boundRole !== "host" || !boundRoomCode) return;
          const room = rooms.get(boundRoomCode);
          if (!room) return;
          room.lastActivity = Date.now();
          const views = msg.views || {};
          for (const [pidStr, viewPayload] of Object.entries(views)) {
            const pid = Number(pidStr);
            if (!isNaN(pid)) {
              const seat = room.seats.get(pid);
              if (seat && typeof (viewPayload as any)?.lockedIn === "boolean") {
                seat.lockedIn = Boolean((viewPayload as any).lockedIn);
              }
              sendViewToStudent(room, pid, viewPayload);
            }
          }
          return;
        }

        if (msg.type === "REGISTER_STUDENT") {
          const code = String(msg.code || "").toUpperCase();
          const room = rooms.get(code);
          if (!room) {
            ws.send(JSON.stringify({ type: "ERROR", message: "Room not found." }));
            return;
          }
          const pid = Number(msg.playerId);
          const seat = room.seats.get(pid);
          if (!seat || seat.reconnectToken !== msg.reconnectToken) {
            ws.send(JSON.stringify({ type: "KICKED" }));
            return;
          }
          boundRoomCode = code;
          boundRole = "student";
          boundPlayerId = pid;
          seat.ws = ws;
          seat.connected = true;
          seat.lastSeen = Date.now();

          const currentView = room.playerViews.get(pid) || null;
          if (currentView) {
            ws.send(JSON.stringify({ type: "PLAYER_VIEW", view: currentView }));
          }
          return;
        }

        if (msg.type === "STUDENT_INTENT") {
          if (boundRole !== "student" || !boundRoomCode || !boundPlayerId) return;
          const room = rooms.get(boundRoomCode);
          if (!room) return;
          const seat = room.seats.get(boundPlayerId);
          if (!seat) return;
          seat.connected = true;
          seat.lastSeen = Date.now();
          if (msg.intent?.type === "LOCK_IN" && typeof msg.intent.locked === "boolean") {
            seat.lockedIn = msg.intent.locked;
          }
          pushEventToHost(room, {
            id: relayIntentId(msg.intentId),
            type: "STUDENT_INTENT",
            playerId: seat.playerId,
            seat: serializeSeat(seat),
            intent: msg.intent,
            timestamp: Date.now(),
          });
          return;
        }
      } catch (err) {
        console.error("WebSocket message error:", err);
      }
    });

    ws.on("close", () => {
      if (!boundRoomCode) return;
      const room = rooms.get(boundRoomCode);
      if (!room) return;
      if (boundRole === "host" && room.hostWs === ws) {
        room.hostWs = null;
      } else if (boundRole === "student" && boundPlayerId) {
        const seat = room.seats.get(boundPlayerId);
        if (seat && seat.ws === ws) {
          seat.ws = null;
          seat.connected = false;
          seat.lastSeen = Date.now();
          pushEventToHost(room, {
            id: crypto.randomUUID(),
            type: "STUDENT_DISCONNECTED",
            playerId: seat.playerId,
            seat: serializeSeat(seat),
            timestamp: Date.now(),
          });
        }
      }
    });
  });

  const PORT = 3000;
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

