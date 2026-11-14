import { Request, Response } from 'express';
import { resolveGroqApiKey } from '../utils/groqUtils';
import { formatCefrPromptDirective } from '../utils/cefrGrammarMatrix';
import { CACHE_TTL_MS, checkDailyIpLimit, checkRateLimit, cleanupCache, persistentAiCache, responseCache } from './limits';
import { AI_TIMEOUT_MS, BATCH_CHECK_HEDGE_AFTER_MS, formatAiMeta, singleCheckMs } from './providers';
import { batchVerifierSchema, makeBatch } from './sentenceBatch';
import { checkWithSecondModel } from './aiProviders';
import { verifyItem } from './verifyItem';
import { buildSentencePrompt } from './sentencePrompt';
import { generateAiSpeechBase64, generateAiText, hasConfiguredAiKey, isHighTrafficOrOverload } from './aiProviders';
import { CEFR_PROFILES, batchClozeVerificationSchema, getSentenceSchema, verificationSchema } from './sentenceSchemas';
import { enforceKeyWordTransformationIntegrity, enforceMultipleChoiceIntegrity, enforceOpenClozeIntegrity, enforceWordFormationIntegrity } from './sentenceIntegrity';

export let activeRequests = 0;
export const MAX_CONCURRENT_REQUESTS = 10;

// --- Gemini Handler for Express ---
export async function handleGeminiRequest(req: Request, res: Response) {
  const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() || req.socket.remoteAddress || "127.0.0.1";

  const dailyCheck = checkDailyIpLimit(clientIp);
  if (!dailyCheck.allowed) {
    res.setHeader("Retry-After", String(dailyCheck.retryAfter || 3600));
    // fallback: true sends the game to its offline bank instead of showing an error.
    return res.status(429).json({ fallback: true, error: "Daily AI limit reached; using the offline bank." });
  }

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

    if (!hasConfiguredAiKey()) {
      return res.status(503).json({
        error: "GROQ_API_KEY or GEMINI_API_KEY is not configured.",
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

        const { prompt, resolvedQuestionType, level } = buildSentencePrompt({ settings, pastSentences, forceCorrect, subtype, pastMistakes, questionType: requestedQuestionType });

        const activeSchema = getSentenceSchema(resolvedQuestionType);
        const generationStarted = Date.now();
        const response = await generateAiText({
          prompt,
          responseSchema: activeSchema,
          schemaName: `sentence_${resolvedQuestionType}`,
          maxCompletionTokens: 900,
          kind: 'generate',
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

        // Package L3: a second model answers the item cold before any student sees it. The game
        // must have its sentence within 8 s, so the check gets what is left of 7.6 s (2.5 to 6 s,
        // singleCheckMs), and a second checker joins after 2 s if the first is slow.
        const checkMs = singleCheckMs(Date.now() - generationStarted);
        // The fastest checker first: the class is waiting (2026-11-14).
        const checker = checkWithSecondModel(response.meta, checkMs, undefined, undefined, 'fast');
        const pastTexts = Array.isArray(pastSentences) ? pastSentences.filter((t: unknown): t is string => typeof t === 'string').slice(-30) : [];
        const verdict = await verifyItem(generatedData, resolvedQuestionType, level, checker.ask, pastTexts);
        res.setHeader(
          'X-AI-Meta',
          formatAiMeta({
            ...response.meta,
            latencyMs: Date.now() - generationStarted,
            verifiedBy: checker.ask ? checker.model : 'rules only',
            verified: verdict.ok,
            // Keep why earlier providers were skipped, also when the item is rejected.
            fallbackReason:
              [response.meta.fallbackReason, checker.notes.length ? `check: ${checker.notes.join(', ')}` : '', verdict.ok ? '' : `rejected: ${verdict.reasons[0]}`]
                .filter(Boolean)
                .join('; ') || undefined,
          })
        );
        if (!verdict.ok) {
          console.warn('[L3] AI sentence rejected:', verdict.reasons.join('; '));
          // fallback: true sends the game to its built-in bank, without a word to the class.
          return res.status(422).json({ fallback: true, error: `Checked and replaced: ${verdict.reasons[0]}` });
        }
        if (verdict.extraAnswers.length) {
          generatedData.acceptedAnswers = Array.from(new Set([...(generatedData.acceptedAnswers || []), ...verdict.extraAnswers]));
        }
        generatedData.checkedBy = checker.ask ? 'two models' : 'rules';

        return res.status(200).json(generatedData);
      }

      case "generateSentenceBatch": {
        const { settings } = payload;
        if (!settings || typeof settings.topic !== "string" || typeof settings.level !== "string" || !Array.isArray(payload.slots) || payload.slots.length === 0) {
          return res.status(400).json({ error: "A batch needs settings and at least one slot." });
        }
        const started = Date.now();
        const result = await makeBatch(payload, {
          write: (req) => generateAiText(req),
          checker: (meta) => checkWithSecondModel(meta, AI_TIMEOUT_MS.batch, batchVerifierSchema, BATCH_CHECK_HEDGE_AFTER_MS),
        });
        res.setHeader(
          'X-AI-Meta',
          formatAiMeta({
            ...result.meta,
            latencyMs: Date.now() - started,
            verifiedBy: result.checkedBy,
            verified: result.items.length > 0,
            fallbackReason:
              [result.meta.fallbackReason, result.checkNotes.length ? `check: ${result.checkNotes.join(', ')}` : '', result.rejected ? `batch: ${result.items.length} kept, ${result.rejected} replaced (${result.reasons[0] || ''})` : '']
                .filter(Boolean)
                .join('; ') || undefined,
          })
        );
        if (result.reasons.length) console.warn('[L3] batch items left out:', result.reasons.join('; '));
        return res.status(200).json({ items: result.items, rejected: result.rejected });
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

        const response = await generateAiText({
          prompt,
          maxCompletionTokens: 200,
          kind: 'other',
        });
        res.setHeader('X-AI-Meta', formatAiMeta(response.meta));

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

        const response = await generateAiText({
          prompt,
          responseSchema: verificationSchema,
          schemaName: "verify_correction_schema",
          maxCompletionTokens: 350,
          kind: 'verify',
        });
        res.setHeader('X-AI-Meta', formatAiMeta(response.meta));

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

        const response = await generateAiText({
          prompt,
          responseSchema: batchClozeVerificationSchema,
          schemaName: "batch_cloze_verification_schema",
          maxCompletionTokens: 1200,
          kind: 'verify',
        });
        res.setHeader('X-AI-Meta', formatAiMeta(response.meta));

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
        const diskCached = persistentAiCache.get(cacheKey);
        if (diskCached) {
          responseCache.set(cacheKey, { data: diskCached, expiresAt: Date.now() + CACHE_TTL_MS });
          return res.status(200).json({ simplified: diskCached, detailed: diskCached });
        }

        const prompt = `You are a senior English linguistics professor. Expand the following plain-English grammar note into a precise, detailed grammatical explanation (2-3 sentences). Name the exact grammatical rule, syntactic structure, or part-of-speech mechanism involved and briefly explain why other forms fail.
- Topic: ${safeTopic}${safeSentence ? `\n- Sentence: "${safeSentence}"` : ""}${safeCorrection ? `\n- Correct Form: "${safeCorrection}"` : ""}
- Plain-English Summary: "${safeExpl}"
- Detailed Grammatical Explanation:`;

        const response = await generateAiText({
          prompt,
          maxCompletionTokens: 350,
          kind: 'other',
        });
        res.setHeader('X-AI-Meta', formatAiMeta(response.meta));

        const detailed = (response.text || "").trim();
        responseCache.set(cacheKey, { data: detailed, expiresAt: Date.now() + CACHE_TTL_MS });
        persistentAiCache.set(cacheKey, detailed, CACHE_TTL_MS);
        return res.status(200).json({ simplified: detailed, detailed });
      }

      case "generateSpeech": {
        const { text, voice } = payload;
        if (!text || typeof text !== "string") {
          return res.status(400).json({ error: "Missing 'text' parameter for speech generation." });
        }

        const safeText = text.slice(0, 600).trim();
        const activeProvider = resolveGroqApiKey() ? `orpheus_${voice || process.env.GROQ_TTS_VOICE || "troy"}` : "gemini_kore";
        const cacheKey = `tts_v4:${activeProvider}:${safeText}`;

        const cached = responseCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
          return res.status(200).json({ base64Audio: cached.data });
        }
        const diskCachedAudio = persistentAiCache.get(cacheKey);
        if (diskCachedAudio) {
          responseCache.set(cacheKey, { data: diskCachedAudio, expiresAt: Date.now() + CACHE_TTL_MS });
          return res.status(200).json({ base64Audio: diskCachedAudio });
        }

        const base64Audio = await generateAiSpeechBase64(safeText, voice || process.env.GROQ_TTS_VOICE);

        responseCache.set(cacheKey, { data: base64Audio, expiresAt: Date.now() + CACHE_TTL_MS });
        persistentAiCache.set(cacheKey, base64Audio, CACHE_TTL_MS);
        return res.status(200).json({ base64Audio });
      }

      default:
        return res.status(400).json({ error: `Unsupported action: '${action}'.` });
    }
  } catch (err: any) {
    const overload = isHighTrafficOrOverload(err);
    // Every step of the chain and why it failed, e.g. "nvidia-writer 401; nemotron timeout; gemini 429".
    const chainReasons: string[] = Array.isArray(err?.chainReasons) ? err.chainReasons : [];
    const shortReason = chainReasons.length
      ? `Every AI failed (${chainReasons.join('; ')}; writers with a key: ${err?.chainConfigured || 'none'}); using the built-in bank.`
      : err?.chainConfigured === ''
        ? 'No AI key is set on the server; using the built-in bank.'
        : overload
          ? "Upstream AI rate limit or quota reached; activating curated local fallback."
          : err?.message || "AI request failed; activating local fallback.";
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
