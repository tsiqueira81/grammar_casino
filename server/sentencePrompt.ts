// The prompt that asks a model for one grammar item (moved out of aiHandler.ts so one item and a
// batch of items share the same rules).
import { resolveGroqApiKey } from '../utils/groqUtils';
import { formatCefrPromptDirective } from '../utils/cefrGrammarMatrix';
import { CEFR_PROFILES } from './sentenceSchemas';

export type ServerQuestionType = 'binary' | 'multipleChoice' | 'openCloze' | 'wordFormation' | 'keyWordTransformation';

export interface SentencePromptInput {
  settings: { topic: string; level: string; theme?: string; challengeFormat?: string };
  pastSentences?: unknown[];
  forceCorrect?: boolean | null;
  subtype?: string | null;
  pastMistakes?: unknown[];
  questionType?: string;
}

export function buildSentencePrompt(input: SentencePromptInput): { prompt: string; resolvedQuestionType: ServerQuestionType; level: string; topic: string } {
  const { settings, pastSentences = [], forceCorrect = null, subtype = null, pastMistakes = [], questionType: requestedQuestionType } = input;
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

  return { prompt, resolvedQuestionType, level, topic };
}
