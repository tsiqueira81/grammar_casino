import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { GoogleGenAI, Type, Modality } from "@google/genai";

// --- Rate Limiting & Abuse Protection ---
interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
}

// 40 requests per minute per IP, with a burst capacity of 10
const RATE_LIMIT_CAPACITY = 40;
const REFILL_RATE_PER_MS = RATE_LIMIT_CAPACITY / 60000;
const ipBuckets = new Map<string, RateLimitBucket>();

// In-flight concurrency guard: prevent thundering herd exhaustion
let activeRequests = 0;
const MAX_CONCURRENT_REQUESTS = 10;

// Simple in-memory response cache for idempotent queries (TTL: 15 minutes)
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
  // Keep cache size bounded
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

// Clean up old IP buckets periodically to avoid memory growth
setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of ipBuckets.entries()) {
    if (now - bucket.lastRefill > 120000 && bucket.tokens >= RATE_LIMIT_CAPACITY - 1) {
      ipBuckets.delete(ip);
    }
  }
}, 60000);

// --- Gemini Client & Rotation Setup ---
let aiClient: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not configured in Netlify.");
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { "User-Agent": "grammar-casino-netlify-function" } },
    });
  }
  return aiClient;
}

const TEXT_MODELS = ["gemini-2.5-flash", "gemini-flash-latest"];
const TTS_MODELS = ["gemini-2.5-flash-preview-tts", "gemini-3.1-flash-tts-preview"];

function isHighTrafficOrOverload(e: any): boolean {
  if (!e) return false;
  const status = e.status || e.statusCode;
  if (status === 429 || status === 503 || status === 500) return true;
  const msg = String(e.message || "").toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("503") ||
    msg.includes("500") ||
    msg.includes("resource_exhausted") ||
    msg.includes("quota") ||
    msg.includes("overloaded") ||
    msg.includes("high traffic") ||
    msg.includes("rate limit") ||
    msg.includes("try again") ||
    msg.includes("deadline exceeded")
  );
}

async function callWithModelRotation<T>(
  models: string[],
  runner: (ai: GoogleGenAI, model: string) => Promise<T>
): Promise<T> {
  const ai = getAIClient();
  let lastError: any = null;

  for (const model of models) {
    let attempts = 2;
    let delay = 600;

    while (attempts > 0) {
      try {
        return await runner(ai, model);
      } catch (e: any) {
        lastError = e;
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

const sentenceSchema = {
  type: Type.OBJECT,
  properties: {
    text: { type: Type.STRING, description: "The generated sentence (with '_____' if Cloze mode)." },
    isCorrect: { type: Type.BOOLEAN, description: "Whether the sentence is grammatically correct." },
    correction: { type: Type.STRING, description: "The full completed or corrected version of the sentence." },
    explanation: { type: Type.STRING, description: "A brief explanation of the grammar rule." },
    grammarPhrase: { type: Type.STRING, description: "Key part of the sentence (3-5 words) testing the rule." },
    errorPhrase: { type: Type.STRING, description: "If incorrect, the exact erroneous phrase. If correct, empty string." },
    mistakeType: { type: Type.STRING, description: "If incorrect, 2-4 word descriptor of error mechanism." },
    options: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "For multipleChoice mode: 4 distinct options (1 correct, 3 distractors).",
    },
    correctAnswer: {
      type: Type.STRING,
      description: "For Cloze modes: the exact primary word or option that fills '_____'.",
    },
    acceptedAnswers: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "For openCloze mode: array of all valid single-word answers (primary word + valid single-word synonyms).",
    },
  },
  required: ["text", "isCorrect", "correction", "explanation", "grammarPhrase"],
};

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

// Response helper
function jsonResponse(status: number, data: any, headers: Record<string, string> = {}) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      ...headers,
    },
    body: JSON.stringify(data),
  };
}

export const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed. Use POST." });
  }

  // Rate Limiting by IP
  const clientIp =
    event.headers["x-nf-client-connection-ip"] ||
    event.headers["client-ip"] ||
    event.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    "127.0.0.1";

  const rateCheck = checkRateLimit(clientIp);
  if (!rateCheck.allowed) {
    return jsonResponse(
      429,
      { error: "Too many requests. Please wait a moment before trying again.", retryAfter: rateCheck.retryAfter },
      { "Retry-After": String(rateCheck.retryAfter || 30) }
    );
  }

  // In-flight concurrency guard
  if (activeRequests >= MAX_CONCURRENT_REQUESTS) {
    return jsonResponse(
      429,
      { error: "The casino table is experiencing high traffic. Please try again shortly.", retryAfter: 5 },
      { "Retry-After": "5" }
    );
  }

  activeRequests++;
  cleanupCache();

  try {
    let payload: any;
    try {
      payload = JSON.parse(event.body || "{}");
    } catch {
      return jsonResponse(400, { error: "Invalid JSON request body." });
    }

    const { action } = payload;
    if (!action || typeof action !== "string") {
      return jsonResponse(400, { error: "Missing or invalid 'action' parameter." });
    }

    // Check API Key
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      return jsonResponse(503, {
        error: "GEMINI_API_KEY is not configured in Netlify environment variables.",
        code: "MISSING_API_KEY",
      });
    }

    switch (action) {
      // 1. Generate Sentence
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
          return jsonResponse(400, { error: "Invalid settings provided for sentence generation." });
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

        const recentSentences = Array.isArray(pastSentences) ? pastSentences.slice(-50).map((s) => String(s).slice(0, 300)) : [];
        const recentMistakes = Array.isArray(pastMistakes) ? pastMistakes.slice(-40).map((m) => String(m).slice(0, 150)) : [];

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

=== MULTIPLE-CHOICE CLOZE RULES ===
1. Write a grammatically sound sentence and replace the key target word or short grammatical phrase (1-3 words testing "${topic}") with an exact 5-underscore blank: "_____".
2. Set "text" to the sentence containing "_____".
3. Set "correction" to the FULL completed sentence with the correct option inserted in place of "_____".
4. Set "correctAnswer" to the exact correct option string.
5. Set "options" to an array of 4 distinct strings (1 correct answer + 3 plausible grammatical distractors that test "${topic}" at CEFR ${level}), in randomized order.
6. Set "isCorrect" to true.
7. Set "explanation" to a clear explanation of why "${topic}" requires the correct option and why the distractors are incorrect.
8. Set "grammarPhrase" to the 3-5 word phrase from the completed sentence that contains the target gap.

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
1. Constrain the gap to a SINGLE WORD ONLY (Cambridge style). Never require two or more words in the gap.
2. The missing single word MUST test "${topic}" (e.g., an auxiliary verb, modal, preposition, article, conjunction, relative pronoun, phrasal verb particle, or verb form).
3. Replace that single word in the sentence with an exact 5-underscore blank: "_____".
4. Set "text" to the sentence containing "_____".
5. Set "correction" to the FULL completed sentence with the primary word filled in.
6. Set "correctAnswer" to the primary single word (lowercase, unless it's at the start of the sentence or "I").
7. Set "acceptedAnswers" to an array of strings containing the primary single word PLUS all other grammatically and contextually valid single-word synonyms/alternatives that fit the blank (all lowercase, trimmed, single words only).
8. Set "isCorrect" to true.
9. Set "explanation" to a clear explanation of the grammatical rule requiring this word.
10. Set "grammarPhrase" to the 3-5 word phrase from the completed sentence around the gap.

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

Respond ONLY with valid JSON matching the schema, no markdown wrappers:
{"text":"...","isCorrect":true,"correction":"...","explanation":"...","grammarPhrase":"...","errorPhrase":"...","mistakeType":"..."}`;
        }

        const response = await callWithModelRotation(TEXT_MODELS, async (ai, model) => {
          return await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: sentenceSchema,
              temperature: 1,
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
          if (Array.isArray(generatedData.options) && generatedData.correctAnswer) {
            const hasCorrect = generatedData.options.some(
              (o: string) => o.trim().toLowerCase() === String(generatedData.correctAnswer).trim().toLowerCase()
            );
            if (!hasCorrect) {
              generatedData.options[0] = generatedData.correctAnswer;
            }
          }
          generatedData.acceptedAnswers = generatedData.correctAnswer ? [String(generatedData.correctAnswer).trim()] : [];
        } else if (resolvedQuestionType === "openCloze") {
          generatedData.isCorrect = true;
          const primary = String(generatedData.correctAnswer || "").trim().split(/\s+/)[0] || "";
          generatedData.correctAnswer = primary;
          const rawAccepted = Array.isArray(generatedData.acceptedAnswers) ? generatedData.acceptedAnswers : [];
          const normalizedSet = new Set<string>();
          if (primary) normalizedSet.add(primary.toLowerCase());
          rawAccepted.forEach((ans: any) => {
            const clean = String(ans || "").trim().toLowerCase();
            if (clean && !clean.includes(" ")) {
              normalizedSet.add(clean);
            }
          });
          generatedData.acceptedAnswers = Array.from(normalizedSet);
        }

        return jsonResponse(200, generatedData);
      }

      // 2. Get Hint
      case "getHint": {
        const { sentence, topic, level, questionType } = payload;
        if (!sentence || typeof sentence !== "string" || !topic || typeof topic !== "string") {
          return jsonResponse(400, { error: "Missing required 'sentence' or 'topic' parameters." });
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
            config: { temperature: 0.8 },
          });
        });

        const hint = (response.text || "").trim();
        return jsonResponse(200, { hint });
      }

      // 3. Verify Correction
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
          return jsonResponse(400, { error: "Missing sentence verification parameters." });
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
            },
          });
        });

        const jsonText = response.text ? response.text.trim() : "";
        const result = JSON.parse(jsonText);
        return jsonResponse(200, result);
      }

      // 3b. Verify Open Cloze Unmatched Candidate Words in a Single Batched Call
      case "verifyOpenClozeBatch": {
        const { sentenceWithBlank, intendedAnswer, acceptedAnswers = [], candidateWords = [] } = payload;
        if (!sentenceWithBlank || typeof sentenceWithBlank !== "string" || !Array.isArray(candidateWords)) {
          return jsonResponse(400, { error: "Missing parameters for verifyOpenClozeBatch." });
        }

        const uniqueWords = Array.from(
          new Set(
            candidateWords
              .map((w: any) => String(w || "").trim())
              .filter((w: string) => w.length > 0)
          )
        ).slice(0, 30);

        if (uniqueWords.length === 0) {
          return jsonResponse(200, { results: {} });
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
        return jsonResponse(200, { results });
      }

      // 4. Simplify Explanation (Cached)
      case "simplifyExplanation": {
        const { originalExplanation, topic } = payload;
        if (!originalExplanation || typeof originalExplanation !== "string") {
          return jsonResponse(400, { error: "Missing 'originalExplanation' parameter." });
        }

        const safeExpl = originalExplanation.slice(0, 1000);
        const safeTopic = String(topic || "Grammar").slice(0, 100);
        const cacheKey = `simplify:${safeTopic}:${safeExpl}`;

        const cached = responseCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
          return jsonResponse(200, { simplified: cached.data });
        }

        const prompt = `Re-explain the following grammar concept in very simple terms, as if for a 10-year-old. Keep it to 1-2 sentences.
- Topic: ${safeTopic}
- Original Explanation: "${safeExpl}"
- Simplified Explanation:`;

        const response = await callWithModelRotation(TEXT_MODELS, async (ai, model) => {
          return await ai.models.generateContent({
            model,
            contents: prompt,
            config: { temperature: 0.7 },
          });
        });

        const simplified = (response.text || "").trim();
        responseCache.set(cacheKey, { data: simplified, expiresAt: Date.now() + CACHE_TTL_MS });
        return jsonResponse(200, { simplified });
      }

      // 5. Generate Speech (Cached)
      case "generateSpeech": {
        const { text } = payload;
        if (!text || typeof text !== "string") {
          return jsonResponse(400, { error: "Missing 'text' parameter for speech generation." });
        }

        const safeText = text.slice(0, 600);
        const cacheKey = `tts:${safeText}`;

        const cached = responseCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
          return jsonResponse(200, { base64Audio: cached.data });
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
        return jsonResponse(200, { base64Audio });
      }

      default:
        return jsonResponse(400, { error: `Unsupported action: '${action}'.` });
    }
  } catch (err: any) {
    console.error("Netlify Function [gemini] error:", err);
    const message = err?.message || "Internal server error";
    const status = isHighTrafficOrOverload(err) ? 429 : 500;
    return jsonResponse(status, {
      error: message,
      isOverload: isHighTrafficOrOverload(err),
    });
  } finally {
    activeRequests = Math.max(0, activeRequests - 1);
  }
};
