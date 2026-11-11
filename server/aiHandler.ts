import { Request, Response } from 'express';
import { resolveGroqApiKey } from '../utils/groqUtils';
import { formatCefrPromptDirective } from '../utils/cefrGrammarMatrix';
import { CACHE_TTL_MS, checkDailyIpLimit, checkRateLimit, cleanupCache, persistentAiCache, responseCache } from './limits';
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

        const isGroqActive = Boolean(resolveGroqApiKey());
        const maxPastSentences = isGroqActive ? 10 : 25;
        const maxSentenceLen = isGroqActive ? 180 : 280;
        const recentSentences = Array.isArray(pastSentences)
          ? pastSentences.slice(-maxPastSentences).map((s) => String(s).slice(0, maxSentenceLen))
          : [];
        const recentMistakes = Array.isArray(pastMistakes) ? pastMistakes.slice(-20).map((m) => String(m).slice(0, 140)) : [];
        const roundIdx = Array.isArray(pastSentences) ? pastSentences.length : 0;

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

        const cefrMatrixDirective = isCustomDomain ? "" : formatCefrPromptDirective(topic, level as any);

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
- LEXIS & VOCABULARY: ${profile.lexis}${cefrMatrixDirective}
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
- LEXIS & VOCABULARY: ${profile.lexis}${cefrMatrixDirective}
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
  * C1–C2: Sophisticated academic/idiomatic derivations, double affixes, or compound stems (e.g., RECONCILE -> irreconcilably, SUBSTANCE -> unsubstantiated, PRECEDENT -> unprecedented, APPEAR -> disappearance, OUTRAGE -> outrageously).${cefrMatrixDirective}
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
- LEXIS & VOCABULARY: ${profile.lexis}${cefrMatrixDirective}
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
- MISTAKE IDENTIFICATION: ${profile.mistakeIdentification}${cefrMatrixDirective}
${avoidSentencesClause}
${avoidMistakesClause}

grammarPhrase MUST be an exact substring of the generated sentence (3-6 words) representing the core grammatical, collocation, or lexical feature being tested.
errorPhrase MUST be the exact erroneous snippet if the sentence is incorrect, or empty string if correct.
mistakeType MUST be a short descriptor (2-4 words) of the error type if incorrect, or empty string if correct.
explanation MUST be a clear, plain-English 1-2 sentence explanation of why the sentence is right or wrong (easy for students to understand without heavy linguistic jargon).

Respond ONLY with valid JSON matching the schema.`;
        }

        const activeSchema = getSentenceSchema(resolvedQuestionType);
        const response = await generateAiText({
          prompt,
          responseSchema: activeSchema,
          schemaName: `sentence_${resolvedQuestionType}`,
          maxCompletionTokens: 900,
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

        const response = await generateAiText({
          prompt,
          maxCompletionTokens: 200,
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

        const response = await generateAiText({
          prompt,
          responseSchema: verificationSchema,
          schemaName: "verify_correction_schema",
          maxCompletionTokens: 350,
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

        const response = await generateAiText({
          prompt,
          responseSchema: batchClozeVerificationSchema,
          schemaName: "batch_cloze_verification_schema",
          maxCompletionTokens: 1200,
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
        });

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
