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
let activeTeacherPin = (process.env.TEACHER_PIN || '7777').trim();

try {
  if (fs.existsSync(TEACHER_PIN_FILE)) {
    const saved = JSON.parse(fs.readFileSync(TEACHER_PIN_FILE, 'utf-8'));
    if (saved && typeof saved.pin === 'string' && saved.pin.trim().length >= 4) {
      activeTeacherPin = saved.pin.trim();
    }
  }
} catch (err) {
  console.warn('Could not read .teacher-pin.json, using default/env TEACHER_PIN.');
}

function verifyPinMatch(candidate: string): boolean {
  const cleanCandidate = String(candidate || '').trim();
  if (!cleanCandidate || !activeTeacherPin) return false;
  return cleanCandidate === activeTeacherPin;
}

function isTeacherAuthorized(req: Request, payload?: any): boolean {
  const headerPin = req.headers['x-teacher-pin'];
  const rawPin = Array.isArray(headerPin) ? headerPin[0] : headerPin || payload?.teacherPin || '';
  return verifyPinMatch(String(rawPin));
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

const TEXT_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-3.8-flash"];
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

function getSentenceSchema(questionType: "binary" | "multipleChoice" | "openCloze") {
  if (questionType === "multipleChoice") return multipleChoiceSentenceSchema;
  if (questionType === "openCloze") return openClozeSentenceSchema;
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
          word: { type: Type.STRING, description: "The candidate single word being evaluated." },
          isCorrect: { type: Type.BOOLEAN, description: "Whether this single word is grammatically and contextually valid in the blank." },
          feedback: { type: Type.STRING, description: "Brief one-sentence explanation of why the word fits or does not fit." },
        },
        required: ["word", "isCorrect", "feedback"],
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

        const formatSetting = requestedQuestionType || settings.challengeFormat || "binary";
        const resolvedQuestionType: "binary" | "multipleChoice" | "openCloze" =
          formatSetting === "multipleChoice" || formatSetting === "openCloze" || formatSetting === "binary"
            ? formatSetting
            : (["binary", "multipleChoice", "openCloze"] as const)[Math.floor(Math.random() * 3)];

        const recentSentences = Array.isArray(pastSentences) ? pastSentences.slice(-25).map((s) => String(s).slice(0, 250)) : [];
        const recentMistakes = Array.isArray(pastMistakes) ? pastMistakes.slice(-25).map((m) => String(m).slice(0, 120)) : [];

        const subtypeClause = subtype ? `\nThe grammatical focus MUST specifically be: ${String(subtype).slice(0, 100)}.` : "";
        const avoidSentencesClause = recentSentences.length > 0 ? `\nDO NOT repeat any of the following sentences: ${JSON.stringify(recentSentences)}` : "";
        const avoidMistakesClause =
          recentMistakes.length > 0
            ? `\n=== STRICT RULE: NEVER REPEAT THE SAME MISTAKE / GAP TARGET ===\nThe following specific mistakes or target phrases have ALREADY been tested in this game:\n${JSON.stringify(recentMistakes)}\nChoose a completely different grammatical sub-rule or mechanism within "${topic}".`
            : "";

        let prompt = "";

        if (resolvedQuestionType === "multipleChoice") {
          prompt = `You are a master English teacher designing a 4-option Multiple-Choice Cloze challenge for a Grammar Casino game.
Settings:
- Grammar Topic: "${topic}"
- CEFR Level: "${level}"
- Theme: "${theme}"
${subtypeClause}

=== CEFR LEVEL REQUIREMENTS (${level}) ===
- SYNTAX (${profile.targetLength}): ${profile.syntax}
- LEXIS & VOCABULARY: ${profile.lexis}
${avoidSentencesClause}
${avoidMistakesClause}

=== MULTIPLE-CHOICE CLOZE STRICT RULES ===
1. STEP 1 ("correction"): First, write a FULL, 100% grammatically complete sentence with NO blanks.
2. STEP 2 ("correctAnswer"): Pick ONLY the exact missing word (prefer a SINGLE word whenever possible) from "correction" that tests "${topic}". NEVER include surrounding words from the sentence in "correctAnswer".
3. STEP 3 ("text"): Copy "correction" word-for-word and replace ONLY "correctAnswer" with an exact 5-underscore blank: "_____".
   - CRITICAL VERIFICATION: Replacing "_____" in "text" with "correctAnswer" MUST produce "correction" word-for-word!
   - NEVER leave any word from "correctAnswer" or "options" visible in "text" immediately before or after "_____".
     * WRONG: text = "She has _____ in Madrid", options = ["has lived", "have lived", "lived", "living"] ("has" is already in the sentence!).
     * RIGHT: text = "She has _____ in Madrid", options = ["lived", "live", "living", "lives"] (OR text = "She _____ in Madrid", options = ["has lived", "have lived", "lived", "is living"]).
     * WRONG: text = "He is good _____ playing chess", options = ["good at", "good in", "good on", "good for"] ("good" is already in the sentence!).
     * RIGHT: text = "He is good _____ playing chess", options = ["at", "in", "on", "for"].
4. STEP 4 ("options"): Set "options" to an array of 4 distinct strings (1 "correctAnswer" + 3 plausible grammatical distractors testing "${topic}" at CEFR ${level}), in randomized order.
   - Every option MUST contain ONLY the word(s) that fill "_____", NEVER words that already appear in the given sentence.
   - NEVER pick random words from elsewhere in the sentence as distractors.
5. STEP 5 ("explanation"): Set "explanation" to a clear, plain-English 1-2 sentence explanation (easy for students to understand without heavy technical jargon) of why the correct option fits.
6. STEP 6 ("grammarPhrase"): Set "grammarPhrase" to the 3-5 word phrase from "correction" that contains the target gap.

Respond ONLY with valid JSON matching the schema.`;
        } else if (resolvedQuestionType === "openCloze") {
          prompt = `You are a master Cambridge English examiner designing an Open Cloze (Use of English Part 2) challenge for a Grammar Casino game.
Settings:
- Grammar Topic: "${topic}"
- CEFR Level: "${level}"
- Theme: "${theme}"
${subtypeClause}

=== CEFR LEVEL REQUIREMENTS (${level}) ===
- SYNTAX (${profile.targetLength}): ${profile.syntax}
- LEXIS & VOCABULARY: ${profile.lexis}
${avoidSentencesClause}
${avoidMistakesClause}

=== CAMBRIDGE OPEN CLOZE STRICT RULES ===
1. STEP 1 ("correction"): First, write a FULL, 100% grammatically complete sentence with NO blanks. Double-check multi-word phrasal verbs and dependent prepositions (e.g., "look forward to visiting", "come up with", "put up with", "run out of", "insist on going") to ensure NO preposition or particle is missing in "correction".
2. STEP 2 ("correctAnswer"): Pick ONE SINGLE WORD from "correction" that tests "${topic}" (lowercase, unless it is at the start of the sentence or "I"). Never put two or more words in "correctAnswer".
3. STEP 3 ("text"): Copy "correction" word-for-word and replace ONLY that single "correctAnswer" word with an exact 5-underscore blank: "_____".
   - CRITICAL VERIFICATION: Replacing "_____" in "text" with "correctAnswer" MUST produce "correction" word-for-word!
   - NEVER replace a two-word phrase (like "forward to" or "up with") with a single "_____". For example, if testing "look forward to visiting", "text" MUST be either "I look _____ to visiting" (answer: "forward") OR "I look forward _____ visiting" (answer: "to") — NEVER "I look _____ visiting".
4. Set "acceptedAnswers" to an array of strings containing the primary single word PLUS all other grammatically and contextually valid single-word alternatives that fit the blank (all lowercase, trimmed, single words only).
5. Set "explanation" to a clear, plain-English 1-2 sentence explanation (easy for students to understand without heavy technical jargon) of why this word is needed.
6. Set "grammarPhrase" to the 3-5 word phrase from "correction" around the gap.

Respond ONLY with valid JSON matching the schema.`;
        } else {
          const correctnessInstruction =
            forceCorrect === null
              ? "Generate an incorrect sentence 60% of the time and a correct one 40% of the time."
              : forceCorrect
              ? "The sentence MUST be grammatically correct."
              : "The sentence MUST contain a grammatical error.";

          prompt = `You are a master English teacher and linguistics expert designing a grammar challenge for a Grammar Casino game.
Settings:
- Grammar Topic: "${topic}"
- CEFR Level: "${level}"
- Theme: "${theme}"

${correctnessInstruction}${subtypeClause}

=== CEFR LEVEL REQUIREMENTS (${level}) ===
The sentence MUST strictly conform to the linguistic, syntactic, and pedagogical profile of CEFR Level ${level}:
- SYNTAX (${profile.targetLength}): ${profile.syntax}
- LEXIS & VOCABULARY: ${profile.lexis}
- MISTAKE IDENTIFICATION: ${profile.mistakeIdentification}
${avoidSentencesClause}
${avoidMistakesClause}

grammarPhrase MUST be an exact substring of the generated sentence (3-6 words) representing the core grammatical feature.
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
              temperature: 1,
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
        }

        return res.status(200).json(generatedData);
      }

      case "getHint": {
        const { sentence, topic, level, questionType } = payload;
        if (!sentence || typeof sentence !== "string" || !topic || typeof topic !== "string") {
          return res.status(400).json({ error: "Missing required 'sentence' or 'topic' parameters." });
        }

        const safeSentence = sentence.slice(0, 500);
        const safeTopic = topic.slice(0, 100);
        const levelContext = level ? `The student's CEFR level is ${String(level).slice(0, 5)}. Adapt the hint subtlety to this level.` : "";
        const isCloze = questionType === "multipleChoice" || questionType === "openCloze" || safeSentence.includes("_____");

        const prompt = isCloze
          ? `A player in a grammar game is looking at this cloze sentence with a blank: "${safeSentence}".
The grammar topic being tested is "${safeTopic}".
${levelContext}
Give a very short, subtle, one-sentence grammatical clue about what part of speech, tense, or grammatical rule governs the missing word in "_____". NEVER reveal the exact missing word itself.
Respond ONLY with the hint text.`
          : `A player in a grammar game is looking at this sentence: "${safeSentence}".
The grammar topic being tested is "${safeTopic}".
${levelContext}
Give a very short, cryptic, one-sentence hint about what might be wrong. Don't give away the answer.
For example, if the error is a wrong tense, you could say "Think about when this action happened."
If the sentence is actually correct, your hint could be "Sometimes, things are just as they seem."
Respond ONLY with the hint text.`;

        const response = await callWithModelRotation(TEXT_MODELS, async (ai, model) => {
          return await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              temperature: 0.8,
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

        const prompt = `You are a fair but strict judge in a grammar game.
The original, incorrect sentence was: "${originalSentence.slice(0, 500)}"
The intended correct version is: "${intendedCorrection.slice(0, 500)}"
A player submitted this correction: "${userCorrection.slice(0, 500)}"

Your task is to evaluate if the player's correction is a valid fix.
A "valid fix" means it's grammatically correct and fixes the main error, even if it's slightly different from the intended correction.
However, if the player's correction introduces a *new* grammatical error, it is NOT a valid fix.
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
        const { sentenceWithBlank, intendedAnswer, acceptedAnswers = [], candidateWords = [] } = payload;
        if (!sentenceWithBlank || typeof sentenceWithBlank !== "string" || !Array.isArray(candidateWords)) {
          return res.status(400).json({ error: "Missing parameters for verifyOpenClozeBatch." });
        }

        const uniqueWords = Array.from(
          new Set(
            candidateWords
              .map((w: any) => String(w || "").trim())
              .filter((w: string) => w.length > 0)
          )
        ).slice(0, 30);

        if (uniqueWords.length === 0) {
          return res.status(200).json({ results: {} });
        }

        const prompt = `You are a Cambridge English Use of English examiner grading an Open Cloze single-word gap-fill exercise.
Sentence with blank: "${sentenceWithBlank.slice(0, 500)}"
Primary intended single word: "${String(intendedAnswer || "").slice(0, 60)}"
Known accepted single words: ${JSON.stringify(acceptedAnswers.slice(0, 20))}

Evaluate each of the following student-submitted candidate words:
${JSON.stringify(uniqueWords)}

STRICT RULES:
1. Open Cloze gaps require a SINGLE WORD only. If a candidate contains multiple words (spaces), mark isCorrect: false.
2. Mark isCorrect: true ONLY if inserting the single word into "_____" produces a 100% grammatically accurate, natural, and contextually coherent English sentence.
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
        const results: Record<string, { isCorrect: boolean; feedback: string }> = {};
        if (Array.isArray(parsed?.evaluations)) {
          parsed.evaluations.forEach((ev: any) => {
            if (ev && typeof ev.word === "string") {
              results[ev.word.trim().toLowerCase()] = {
                isCorrect: Boolean(ev.isCorrect),
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
              temperature: 0.6,
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

        const safeText = text.slice(0, 600);
        const cacheKey = `tts:${safeText}`;

        const cached = responseCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
          return res.status(200).json({ base64Audio: cached.data });
        }

        const base64Audio = await callWithModelRotation(TTS_MODELS, async (ai, model) => {
          const response = await ai.models.generateContent({
            model,
            contents: [{ parts: [{ text: safeText }] }],
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

// Support both endpoint paths used in web & Netlify legacy redirects
app.post("/api/gemini", handleGeminiRequest);
app.post("/.netlify/functions/gemini", handleGeminiRequest);

// Teacher PIN Auth & Status Endpoints
app.get("/api/teacher-auth/status", (req, res) => {
  res.json({
    unlocked: isTeacherAuthorized(req),
    pinRequired: true,
  });
});

app.post("/api/teacher-auth/verify", (req, res) => {
  const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() || req.socket.remoteAddress || "127.0.0.1";
  const rateCheck = checkRateLimit(clientIp);
  if (!rateCheck.allowed) {
    return res.status(429).json({ valid: false, error: "Too many attempts. Please wait a moment." });
  }
  const candidate = String(req.body?.pin || "").trim();
  const valid = verifyPinMatch(candidate);
  if (!valid) {
    return res.status(401).json({ valid: false, error: "Incorrect Teacher PIN." });
  }
  return res.json({ valid: true });
});

app.post("/api/teacher-auth/change-pin", (req, res) => {
  const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() || req.socket.remoteAddress || "127.0.0.1";
  const rateCheck = checkRateLimit(clientIp);
  if (!rateCheck.allowed) {
    return res.status(429).json({ ok: false, error: "Too many attempts. Please wait a moment." });
  }
  const currentPin = String(req.body?.currentPin || "").trim();
  const newPin = String(req.body?.newPin || "").trim();
  if (!verifyPinMatch(currentPin)) {
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

  const { playerId, reconnectToken, intent } = req.body || {};
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
    id: crypto.randomUUID(),
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
            id: crypto.randomUUID(),
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

