const { GoogleGenAI, Type, Modality, ThinkingLevel } = require('@google/genai');
const { app, safeStorage, net } = require('electron');
const path = require('path');
const fs = require('fs');

let storageInfo = {
  isPortable: false,
  isReadOnly: false,
  dataPath: '',
};

function setStorageInfo(info) {
  storageInfo = { ...storageInfo, ...info };
}

// Track whether stored DPAPI credentials failed to decrypt due to machine/account change
let decryptionFailedFlag = false;

// --- Key Management with OS-Backed DPAPI Encryption ---
function getKeyFilePath() {
  const userDataDir = app.getPath('userData');
  return path.join(userDataDir, 'gemini_api_key.enc');
}

function getStoredApiKey() {
  try {
    const keyPath = getKeyFilePath();
    if (!fs.existsSync(keyPath)) {
      decryptionFailedFlag = false;
      return null;
    }
    const encryptedData = fs.readFileSync(keyPath);
    if (!encryptedData || encryptedData.length === 0) {
      decryptionFailedFlag = false;
      return null;
    }
    if (safeStorage.isEncryptionAvailable()) {
      try {
        const decrypted = safeStorage.decryptString(encryptedData);
        decryptionFailedFlag = false;
        return (decrypted || '').trim() || null;
      } catch (decryptErr) {
        console.warn(
          '[GeminiHandler] Stored key cannot be decrypted on this Windows account or computer (DPAPI credentials are machine/account-bound):',
          decryptErr.message
        );
        decryptionFailedFlag = true;
        return null;
      }
    } else {
      decryptionFailedFlag = false;
      const plain = encryptedData.toString('utf8');
      return (plain || '').trim() || null;
    }
  } catch (err) {
    console.error('[GeminiHandler] Failed to read stored API key:', err);
    return null;
  }
}

function saveApiKey(apiKey) {
  try {
    if (storageInfo.isReadOnly) {
      return { success: false, error: 'Storage location is read-only. Cannot save API key.' };
    }
    const keyPath = getKeyFilePath();
    const trimmed = (apiKey || '').trim();
    if (!trimmed) {
      if (fs.existsSync(keyPath)) {
        fs.unlinkSync(keyPath);
      }
      decryptionFailedFlag = false;
      return { success: true, hasKey: false };
    }

    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(trimmed);
      fs.writeFileSync(keyPath, encrypted);
    } else {
      fs.writeFileSync(keyPath, Buffer.from(trimmed, 'utf8'));
    }
    decryptionFailedFlag = false;
    return { success: true, hasKey: true };
  } catch (err) {
    console.error('[GeminiHandler] Failed to encrypt and save API key:', err);
    return { success: false, error: err.message };
  }
}

function clearApiKey() {
  try {
    if (storageInfo.isReadOnly) {
      return { success: false, error: 'Storage location is read-only.' };
    }
    const keyPath = getKeyFilePath();
    if (fs.existsSync(keyPath)) {
      fs.unlinkSync(keyPath);
    }
    decryptionFailedFlag = false;
    return { success: true, hasKey: false };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function hasApiKey() {
  const key = getStoredApiKey();
  return Boolean(key && key.length > 5);
}

function getStatus() {
  const isOnline = typeof net.isOnline === 'function' ? net.isOnline() : true;
  const key = getStoredApiKey();
  const hasKey = Boolean(key && key.length > 5);
  const isEncrypted = typeof safeStorage.isEncryptionAvailable === 'function' ? safeStorage.isEncryptionAvailable() : false;

  return {
    isDesktop: true,
    isPortable: storageInfo.isPortable,
    isReadOnly: storageInfo.isReadOnly,
    dataPath: storageInfo.dataPath || app.getPath('userData'),
    isOnline,
    hasKey,
    isEncrypted,
    decryptionFailed: decryptionFailedFlag,
    maskedKey: hasKey ? `${key.slice(0, 4)}...${key.slice(-4)}` : '',
  };
}

// --- Gemini Client & Rotation Setup ---
const TEXT_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-3.8-flash'];
const TTS_MODELS = ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts'];
const modelCooldownUntil = new Map();

function getFastThinkingConfig(model) {
  if (model === 'gemini-3.8-flash') {
    return { thinkingLevel: ThinkingLevel ? ThinkingLevel.LOW : 'LOW' };
  }
  return undefined;
}

function isModelNotFound(e) {
  if (!e) return false;
  const status = e.status || e.statusCode;
  if (status === 404) return true;
  const msg = String(e.message || '').toLowerCase();
  return msg.includes('404') || msg.includes('not found') || msg.includes('is not supported') || msg.includes('no longer available');
}

function isQuotaExhausted(e) {
  if (!e) return false;
  const status = e.status || e.statusCode;
  if (status === 429) return true;
  const msg = String(e.message || '').toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('exceeded your current quota')
  );
}

function extractRetryDelayMs(e) {
  const msg = String((e && e.message) || '');
  const retryMatch = msg.match(/retry in\s+([0-9.]+)s/i) || msg.match(/"retryDelay"\s*:\s*"([0-9.]+)s"/i);
  if (retryMatch && retryMatch[1]) {
    const parsedSeconds = parseFloat(retryMatch[1]);
    if (!isNaN(parsedSeconds) && parsedSeconds > 0) {
      return Math.min(Math.ceil(parsedSeconds * 1000) + 1500, 5 * 60000);
    }
  }
  return 60000;
}

function getAIClient(customKey) {
  const apiKey = (customKey || getStoredApiKey() || '').trim();
  if (!apiKey) {
    const err = new Error('NO_API_KEY: No Gemini API key configured in desktop settings.');
    err.code = 'NO_API_KEY';
    throw err;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });
}

function isHighTrafficOrOverload(e) {
  if (!e) return false;
  if (isQuotaExhausted(e)) return true;
  const status = e.status || e.statusCode;
  if (status === 503 || status === 500) return true;
  const msg = String(e.message || '').toLowerCase();
  return (
    msg.includes('503') ||
    msg.includes('500') ||
    msg.includes('overloaded') ||
    msg.includes('high traffic') ||
    msg.includes('try again') ||
    msg.includes('deadline exceeded')
  );
}

function assertNetworkOnline() {
  if (typeof net.isOnline === 'function' && !net.isOnline()) {
    const err = new Error('OFFLINE: Internet connection is not available.');
    err.code = 'OFFLINE';
    throw err;
  }
}

async function callWithModelRotation(models, runner, customKey) {
  assertNetworkOnline();
  const ai = getAIClient(customKey);
  let lastError = null;
  const now = Date.now();

  const availableModels = models.filter((m) => (modelCooldownUntil.get(m) || 0) <= now);
  if (availableModels.length === 0) {
    const cooldownErr = new Error('All upstream Gemini models are currently cooling down from free-tier quota limits.');
    cooldownErr.status = 429;
    cooldownErr.code = 'QUOTA_COOLDOWN';
    throw cooldownErr;
  }

  for (const model of availableModels) {
    let attempts = 2;
    let delay = 600;

    while (attempts > 0) {
      try {
        return await runner(ai, model);
      } catch (e) {
        lastError = e;
        if (isModelNotFound(e)) {
          modelCooldownUntil.set(model, Date.now() + 10 * 60000);
          break;
        }
        if (isQuotaExhausted(e)) {
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

  throw lastError || new Error('Gemini API request failed. Please check connection and quota.');
}

// --- CEFR Linguistic Profiles ---
const CEFR_PROFILES = {
  A1: {
    syntax:
      'Elementary, basic SVO clauses only (6-10 words). Present simple of be/have/common action verbs or past simple of be. Only basic coordinating conjunctions ("and", "or"). Strictly NO subordinate clauses, NO relative clauses, NO passive voice.',
    lexis:
      'Beginner, high-frequency everyday vocabulary (family, numbers, colors, basic food, daily routines). Avoid abstract, specialized, or idiomatic vocabulary.',
    mistakeIdentification:
      'Glaring, obvious, and immediate to identify (e.g., "She have two cats", "I no like tea", "more big"). No subtle traps.',
    targetLength: '6-10 words',
  },
  A2: {
    syntax:
      'Simple compound and basic complex sentences (8-14 words). Basic time clauses ("when", "before", "after") and elementary cause-and-effect connectors ("because", "so").',
    lexis:
      'Everyday vocabulary for familiar topics (routine, shopping, travel, basic professions, weather). Simple, transparent collocations only.',
    mistakeIdentification:
      'Clear, direct, and easily detectable (e.g., "She buyed a car", "in Monday", "I didn\'t see nobody").',
    targetLength: '8-14 words',
  },
  B1: {
    syntax:
      'Intermediate multi-clause sentences (12-18 words). Standard relative clauses ("who", "which", "that"), first/second conditionals, modal auxiliaries, present perfect vs past simple.',
    lexis:
      'Practical, functional vocabulary for everyday communication, hobbies, opinions, and work. Common phrasal verbs ("give up", "look for") and fixed prepositional expressions.',
    mistakeIdentification:
      'Moderately distinguishable (e.g., "I have arrived yesterday", "interested on", "we must to go").',
    targetLength: '12-18 words',
  },
  B2: {
    syntax:
      'Upper-intermediate multi-clause sentences (16-24 words). Varied clause openers, passive voice constructions, third conditionals, concession clauses, reported speech backshifts, gerund vs infinitive patterns.',
    lexis:
      'Rich, diverse vocabulary covering abstract nouns, workplace and societal themes, nuanced phrasal verbs, and dependent prepositions.',
    mistakeIdentification:
      'Challenging and nuanced (e.g., "despite" + full clause without "the fact that", state verbs in progressive, "insisted in going").',
    targetLength: '16-24 words',
  },
  C1: {
    syntax:
      'Sophisticated, dense syntactic architecture (20-30 words). Negative inversion ("Seldom have we seen..."), cleft sentences, mixed conditionals, participle clauses, nominalizations, modal perfects.',
    lexis:
      'Advanced academic, literary, and professional vocabulary. Low-frequency adjectives and verbs, sophisticated collocations, nuanced register, precise discourse markers.',
    mistakeIdentification:
      'Subtle and deceptive (e.g., "Rarely she had observed...", subjunctive mood violations, dangling participle modifiers, "indifferent at").',
    targetLength: '20-30 words',
  },
  C2: {
    syntax:
      'Masterful, intricate native-level syntax (22-35 words). Stylistic inversion, fronting of prepositional phrases, conditional inversion without "if", balanced rhetorical parallelism, embedded parentheticals.',
    lexis:
      'Erudite, nuanced, mastery-level vocabulary. Rare and subtle collocations, refined idioms, precise connotations, sophisticated figurative expressions.',
    mistakeIdentification:
      'Extremely subtle and elusive (e.g., delicate case agreement like "between you and I", subtle faux-subjunctive, delicate agreement mismatches separated by parentheticals).',
    targetLength: '22-35 words',
  },
};

const binarySentenceSchema = {
  type: Type.OBJECT,
  properties: {
    text: { type: Type.STRING, description: 'The generated sentence.' },
    isCorrect: { type: Type.BOOLEAN, description: 'Whether the sentence is grammatically correct.' },
    correction: { type: Type.STRING, description: 'The full corrected version of the sentence (or original if correct).' },
    explanation: {
      type: Type.STRING,
      description: 'A clear, plain-English 1-2 sentence explanation (easy for students to understand without heavy technical jargon).',
    },
    grammarPhrase: { type: Type.STRING, description: 'Key part of the sentence (3-5 words) testing the rule.' },
    errorPhrase: { type: Type.STRING, description: 'If incorrect, the exact erroneous phrase. If correct, empty string.' },
    mistakeType: { type: Type.STRING, description: 'If incorrect, 2-4 word descriptor of error mechanism. If correct, empty string.' },
  },
  required: ['text', 'isCorrect', 'correction', 'explanation', 'grammarPhrase', 'errorPhrase', 'mistakeType'],
};

const multipleChoiceSentenceSchema = {
  type: Type.OBJECT,
  properties: {
    correction: { type: Type.STRING, description: 'The full completed sentence with the correct option inserted.' },
    text: { type: Type.STRING, description: "The generated sentence containing '_____'." },
    explanation: {
      type: Type.STRING,
      description: 'A clear, plain-English 1-2 sentence explanation (easy for students to understand without heavy technical jargon) of why the correct option fits.',
    },
    grammarPhrase: { type: Type.STRING, description: 'The 3-5 word phrase from the completed sentence containing the target gap.' },
    options: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '4 distinct options (1 correct, 3 plausible distractors).',
    },
    correctAnswer: {
      type: Type.STRING,
      description: "The exact option string that fills '_____'.",
    },
  },
  required: ['correction', 'text', 'explanation', 'grammarPhrase', 'options', 'correctAnswer'],
};

const openClozeSentenceSchema = {
  type: Type.OBJECT,
  properties: {
    correction: {
      type: Type.STRING,
      description: 'Step 1: Write the FULL, 100% grammatically complete sentence first (with NO blanks and NO missing prepositions or particles).',
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
      description: 'A clear, plain-English 1-2 sentence explanation (easy for students to understand without heavy technical jargon) of why this word is needed.',
    },
    grammarPhrase: { type: Type.STRING, description: 'The 3-5 word phrase from the completed sentence around the gap.' },
    acceptedAnswers: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Array of all valid single-word answers (primary word + valid single-word synonyms).',
    },
  },
  required: ['correction', 'correctAnswer', 'text', 'explanation', 'grammarPhrase', 'acceptedAnswers'],
};

function getSentenceSchema(questionType) {
  if (questionType === 'multipleChoice') return multipleChoiceSentenceSchema;
  if (questionType === 'openCloze') return openClozeSentenceSchema;
  return binarySentenceSchema;
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function enforceOpenClozeIntegrity(data) {
  let corr = String(data.correction || '').replace(/\s+/g, ' ').trim();
  let txt = String(data.text || '').replace(/\s+/g, ' ').trim();
  const rawAnswer = String(data.correctAnswer || '').trim();
  const answerWords = rawAnswer.split(/\s+/).filter(Boolean);
  let primary = answerWords[0] || '';

  if (answerWords.length > 1 && /_{2,}/.test(txt)) {
    const trailing = answerWords.slice(1).join(' ');
    const afterBlankRegex = new RegExp(`_{2,}\\s+${escapeRegExp(trailing)}\\b`, 'i');
    if (!afterBlankRegex.test(txt)) {
      txt = txt.replace(/_{2,}/, `_____ ${trailing}`);
    }
  }

  const phrasalRepairs = [
    [/\b(look(?:s|ed|ing)?\s+forward)\s+(?!to\b)([a-z]+ing)\b/gi, '$1 to $2'],
    [/\b(put(?:s|ting)?\s+up)\s+(?!with\b)([a-z]+ing)\b/gi, '$1 with $2'],
    [/\b(came|come(?:s|ing)?)\s+up\s+(?!with\b)(a|an|the|some|this|that|an?\s+idea|a\s+plan)\b/gi, '$1 up with $2'],
    [/\b(ran|run(?:s|ning)?)\s+out\s+(?!of\b)([a-z]+)\b/gi, '$1 out of $2'],
  ];
  for (const [pattern, replacement] of phrasalRepairs) {
    corr = corr.replace(pattern, replacement);
  }

  if (primary && corr) {
    const filled = txt.replace(/_{2,}/, primary).replace(/\s+/g, ' ').trim();
    if (filled.toLowerCase() !== corr.toLowerCase()) {
      const wordRegex = new RegExp(`\\b${escapeRegExp(primary)}\\b`, 'i');
      const phrase = String(data.grammarPhrase || '').trim();
      let rebuilt = '';

      if (phrase && corr.toLowerCase().includes(phrase.toLowerCase()) && wordRegex.test(phrase)) {
        const phraseMatch = corr.match(new RegExp(escapeRegExp(phrase), 'i'));
        if (phraseMatch && phraseMatch.index !== undefined) {
          const before = corr.slice(0, phraseMatch.index);
          const matchedPhrase = phraseMatch[0];
          const after = corr.slice(phraseMatch.index + matchedPhrase.length);
          const blankedPhrase = matchedPhrase.replace(wordRegex, (m) => {
            primary = m;
            return '_____';
          });
          rebuilt = `${before}${blankedPhrase}${after}`;
        }
      }

      if (!rebuilt && wordRegex.test(corr)) {
        rebuilt = corr.replace(wordRegex, (m) => {
          primary = m;
          return '_____';
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
        if (repairedFilled.toLowerCase() !== filled.toLowerCase() && wordRegex.test(corr)) {
          txt = corr.replace(wordRegex, '_____');
        }
      }
    }
  }

  data.correction = corr;
  data.text = txt;
  data.correctAnswer = primary;

  const rawAccepted = Array.isArray(data.acceptedAnswers) ? data.acceptedAnswers : [];
  const normalizedSet = new Set();
  if (primary) normalizedSet.add(primary.toLowerCase());
  rawAccepted.forEach((ans) => {
    const clean = String(ans || '').trim().toLowerCase();
    if (clean && !clean.includes(' ')) {
      normalizedSet.add(clean);
    }
  });
  data.acceptedAnswers = Array.from(normalizedSet);
}

const verificationSchema = {
  type: Type.OBJECT,
  properties: {
    isCorrect: { type: Type.BOOLEAN, description: "Whether the user's correction is valid." },
    feedback: { type: Type.STRING, description: 'Brief one-sentence explanation of why it was accepted or rejected.' },
  },
  required: ['isCorrect', 'feedback'],
};

const batchClozeVerificationSchema = {
  type: Type.OBJECT,
  properties: {
    evaluations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          word: { type: Type.STRING },
          isCorrect: { type: Type.BOOLEAN },
          feedback: { type: Type.STRING },
        },
        required: ['word', 'isCorrect', 'feedback'],
      },
    },
  },
  required: ['evaluations'],
};

// --- IPC Implementations ---
async function generateSentence(payload) {
  const {
    settings,
    pastSentences = [],
    forceCorrect = null,
    subtype = null,
    pastMistakes = [],
    questionType: requestedQuestionType,
  } = payload || {};

  if (!settings || typeof settings.topic !== 'string' || typeof settings.level !== 'string') {
    throw new Error('Invalid settings provided for sentence generation.');
  }

  const topic = String(settings.topic).slice(0, 100);
  const level = String(settings.level).slice(0, 5);
  const theme = String(settings.theme || 'Everyday Life').slice(0, 80);
  const profile = CEFR_PROFILES[level] || CEFR_PROFILES.B1;

  const formatSetting = requestedQuestionType || settings.challengeFormat || 'binary';
  const resolvedQuestionType =
    formatSetting === 'multipleChoice' || formatSetting === 'openCloze' || formatSetting === 'binary'
      ? formatSetting
      : ['binary', 'multipleChoice', 'openCloze'][Math.floor(Math.random() * 3)];

  const recentSentences = Array.isArray(pastSentences)
    ? pastSentences.slice(-25).map((s) => String(s).slice(0, 250))
    : [];
  const recentMistakes = Array.isArray(pastMistakes)
    ? pastMistakes.slice(-25).map((m) => String(m).slice(0, 120))
    : [];

  const subtypeClause = subtype ? `\nThe grammatical focus MUST specifically be: ${String(subtype).slice(0, 100)}.` : '';
  const avoidSentencesClause =
    recentSentences.length > 0 ? `\nDO NOT repeat any of the following sentences: ${JSON.stringify(recentSentences)}` : '';
  const avoidMistakesClause =
    recentMistakes.length > 0
      ? `\n=== STRICT RULE: NEVER REPEAT THE SAME MISTAKE / GAP TARGET ===\nThe following specific mistakes or target phrases have ALREADY been tested in this game:\n${JSON.stringify(recentMistakes)}\nChoose a completely different grammatical sub-rule or mechanism within "${topic}".`
      : '';

  let prompt = '';

  if (resolvedQuestionType === 'multipleChoice') {
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
1. Write a grammatically sound sentence ("correction") and replace the key target word or short grammatical phrase (1-3 words testing "${topic}") with an exact 5-underscore blank: "_____" in "text".
2. Set "correction" to the FULL completed sentence with the correct option inserted in place of "_____".
3. Set "text" to the sentence containing "_____".
4. Set "correctAnswer" to the exact correct option string.
5. Set "options" to an array of 4 distinct strings (1 correct answer + 3 plausible grammatical distractors that test "${topic}" at CEFR ${level}), in randomized order.
6. Set "explanation" to a clear, plain-English 1-2 sentence explanation (easy for students to understand without heavy technical jargon) of why "${topic}" requires the correct option.
7. Set "grammarPhrase" to the 3-5 word phrase from the completed sentence that contains the target gap.

Respond ONLY with valid JSON matching the schema.`;
  } else if (resolvedQuestionType === 'openCloze') {
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
        ? 'Generate an incorrect sentence 60% of the time and a correct one 40% of the time.'
        : forceCorrect
        ? 'The sentence MUST be grammatically correct.'
        : 'The sentence MUST contain a grammatical error.';

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
        responseMimeType: 'application/json',
        responseSchema: activeSchema,
        temperature: 1,
        thinkingConfig: getFastThinkingConfig(model),
      },
    });
  });

  const jsonText = response.text ? response.text.trim() : '';
  const generatedData = JSON.parse(jsonText);
  generatedData.questionType = resolvedQuestionType;

  if (resolvedQuestionType === 'binary') {
    if (!generatedData.isCorrect && !generatedData.errorPhrase) {
      generatedData.errorPhrase = generatedData.grammarPhrase;
    }
  } else if (resolvedQuestionType === 'multipleChoice') {
    generatedData.isCorrect = true;
    if (Array.isArray(generatedData.options) && generatedData.correctAnswer) {
      const hasCorrect = generatedData.options.some(
        (o) => String(o).trim().toLowerCase() === String(generatedData.correctAnswer).trim().toLowerCase()
      );
      if (!hasCorrect) {
        generatedData.options[0] = generatedData.correctAnswer;
      }
    }
    generatedData.acceptedAnswers = generatedData.correctAnswer ? [String(generatedData.correctAnswer).trim()] : [];
  } else if (resolvedQuestionType === 'openCloze') {
    generatedData.isCorrect = true;
    enforceOpenClozeIntegrity(generatedData);
  }

  return generatedData;
}

async function getHint(payload) {
  const { sentence, topic, level, questionType } = payload || {};
  if (!sentence || typeof sentence !== 'string' || !topic || typeof topic !== 'string') {
    throw new Error("Missing required 'sentence' or 'topic' parameters.");
  }

  const safeSentence = sentence.slice(0, 500);
  const safeTopic = topic.slice(0, 100);
  const levelContext = level ? `The student's CEFR level is ${String(level).slice(0, 5)}. Adapt the hint subtlety to this level.` : '';
  const isCloze = questionType === 'multipleChoice' || questionType === 'openCloze' || safeSentence.includes('_____');

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

  const hint = (response.text || '').trim();
  return { hint };
}

async function verifyCorrection(payload) {
  const { originalSentence, userCorrection, intendedCorrection } = payload || {};
  if (!originalSentence || !userCorrection || !intendedCorrection) {
    throw new Error('Missing sentence verification parameters.');
  }

  const prompt = `You are a fair but strict judge in a grammar game.
The original, incorrect sentence was: "${String(originalSentence).slice(0, 500)}"
The intended correct version is: "${String(intendedCorrection).slice(0, 500)}"
A player submitted this correction: "${String(userCorrection).slice(0, 500)}"

Your task is to evaluate if the player's correction is a valid fix.
A "valid fix" means it's grammatically correct and fixes the main error, even if it's slightly different from the intended correction.
However, if the player's correction introduces a *new* grammatical error, it is NOT a valid fix.
Respond ONLY with the JSON object matching the provided schema.`;

  const response = await callWithModelRotation(TEXT_MODELS, async (ai, model) => {
    return await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: verificationSchema,
        thinkingConfig: getFastThinkingConfig(model),
      },
    });
  });

  const jsonText = response.text ? response.text.trim() : '';
  return JSON.parse(jsonText);
}

async function verifyOpenClozeBatch(payload) {
  const { sentenceWithBlank, intendedAnswer, acceptedAnswers = [], candidateWords = [] } = payload || {};
  if (!sentenceWithBlank || !Array.isArray(candidateWords)) {
    throw new Error('Missing parameters for verifyOpenClozeBatch.');
  }

  const uniqueWords = Array.from(
    new Set(
      candidateWords
        .map((w) => String(w || '').trim())
        .filter((w) => w.length > 0)
    )
  ).slice(0, 30);

  if (uniqueWords.length === 0) {
    return { results: {} };
  }

  const prompt = `You are a Cambridge English Use of English examiner grading an Open Cloze single-word gap-fill exercise.
Sentence with blank: "${String(sentenceWithBlank).slice(0, 500)}"
Primary intended single word: "${String(intendedAnswer || '').slice(0, 60)}"
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
        responseMimeType: 'application/json',
        responseSchema: batchClozeVerificationSchema,
        thinkingConfig: getFastThinkingConfig(model),
      },
    });
  });

  const jsonText = response.text ? response.text.trim() : '';
  const parsed = JSON.parse(jsonText);
  const results = {};
  if (Array.isArray(parsed?.evaluations)) {
    parsed.evaluations.forEach((ev) => {
      if (ev && typeof ev.word === 'string') {
        results[ev.word.trim().toLowerCase()] = {
          isCorrect: Boolean(ev.isCorrect),
          feedback: String(ev.feedback || ''),
        };
      }
    });
  }
  return { results };
}

async function simplifyExplanation(payload) {
  const { originalExplanation, topic, sentence, correction } = payload || {};
  if (!originalExplanation || typeof originalExplanation !== 'string') {
    throw new Error("Missing 'originalExplanation' parameter.");
  }

  const safeExpl = originalExplanation.slice(0, 1000);
  const safeTopic = String(topic || 'Grammar').slice(0, 100);
  const safeSentence = sentence ? String(sentence).slice(0, 400) : '';
  const safeCorrection = correction ? String(correction).slice(0, 400) : '';

  const prompt = `You are a senior English linguistics professor. Expand the following plain-English grammar note into a precise, detailed grammatical explanation (2-3 sentences). Name the exact grammatical rule, syntactic structure, or part-of-speech mechanism involved and briefly explain why other forms fail.
- Topic: ${safeTopic}${safeSentence ? `\n- Sentence: "${safeSentence}"` : ''}${safeCorrection ? `\n- Correct Form: "${safeCorrection}"` : ''}
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

  const detailed = (response.text || '').trim();
  return { simplified: detailed, detailed };
}

async function generateSpeech(payload) {
  const { text } = payload || {};
  if (!text || typeof text !== 'string') {
    throw new Error("Missing 'text' parameter for speech generation.");
  }

  const safeText = text.slice(0, 600);
  const base64Audio = await callWithModelRotation(TTS_MODELS, async (ai, model) => {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: safeText }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audio) throw new Error('No audio data returned by TTS model.');
    return audio;
  });

  return { base64Audio };
}

async function testApiKey(testKey) {
  assertNetworkOnline();
  const keyToTest = (testKey || getStoredApiKey() || '').trim();
  if (!keyToTest) {
    return { valid: false, error: 'No API key provided to test.' };
  }

  try {
    const response = await callWithModelRotation(
      TEXT_MODELS,
      async (ai, model) => {
        return await ai.models.generateContent({
          model,
          contents: 'Respond with the word OK.',
          config: {
            maxOutputTokens: 5,
            thinkingConfig: getFastThinkingConfig(model),
          },
        });
      },
      keyToTest
    );
    const text = (response.text || '').trim();
    return { valid: true, text };
  } catch (err) {
    return { valid: false, error: err.message || 'Verification failed.' };
  }
}

module.exports = {
  getStatus,
  setApiKey: saveApiKey,
  clearApiKey,
  hasApiKey,
  testApiKey,
  generateSentence,
  getHint,
  verifyCorrection,
  verifyOpenClozeBatch,
  simplifyExplanation,
  generateSpeech,
  setStorageInfo,
};
