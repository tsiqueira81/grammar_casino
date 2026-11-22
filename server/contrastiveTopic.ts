// Pure parser and prompt helper for contrastive single-word language topics
// (e.g. "can or must", "for vs since", "in, on, or at", "make / do", "Modals: can vs must").
// Keeps topic-level disambiguation strictly testable without React or network calls.
import type { ServerQuestionType } from './sentencePrompt';

/** Grammar/category meta-terms that name broad domains rather than literal gap-fill words. */
const META_TOPIC_WORDS = new Set([
  'grammar', 'vocabulary', 'vocab', 'lexis', 'syntax', 'english', 'language',
  'tense', 'tenses', 'verb', 'verbs', 'noun', 'nouns', 'adjective', 'adjectives',
  'adverb', 'adverbs', 'pronoun', 'pronouns', 'preposition', 'prepositions',
  'article', 'articles', 'modal', 'modals', 'conditional', 'conditionals',
  'passive', 'active', 'clause', 'clauses', 'relative', 'gerund', 'gerunds',
  'infinitive', 'infinitives', 'comparative', 'comparatives', 'superlative', 'superlatives',
  'continuous', 'progressive', 'simple', 'perfect', 'future', 'past', 'present',
  'singular', 'plural', 'countable', 'uncountable', 'formal', 'informal',
  'british', 'american', 'collocation', 'collocations', 'phrasal', 'idiom', 'idioms',
  'reported', 'speech', 'direct', 'indirect', 'positive', 'negative', 'affirmative',
  'interrogative', 'question', 'questions', 'subject', 'object', 'voice', 'spelling',
  'punctuation', 'connector', 'connectors', 'conjunction', 'conjunctions',
  'determiner', 'determiners', 'quantifier', 'quantifiers', 'causative', 'causatives',
  'inversion', 'participle', 'participles', 'wish', 'wishes', 'regret', 'regrets',
  'mixed', 'general', 'everyday', 'business', 'travel', 'science', 'history',
  'food', 'cooking', 'work', 'career', 'education', 'school', 'sports', 'health',
  'music', 'movies', 'film', 'technology', 'nature', 'animals', 'family', 'home',
  'shopping', 'weather', 'hobbies', 'culture', 'media', 'news', 'politics', 'law',
]);

const SINGLE_WORD_RE = /^[a-z]+(?:'[a-z]+)?$/;

function cleanToken(raw: string): string {
  return raw
    .replace(/[’‘`]/g, "'")
    .replace(/^[\s"'([{]+|[\s"')\]}.!?;:]+$/g, '')
    .trim()
    .toLowerCase();
}

function parseCandidateList(segment: string, allowBareAnd: boolean): string[] {
  const s = segment.trim();
  if (!s) return [];

  let parts: string[] = [];
  if (/(?:\bvs\.|\bvs\b|\bversus\b)/i.test(s)) {
    parts = s.split(/\s*(?:\bvs\.|\bvs\b|\bversus\b)\s*/i);
  } else if (s.includes('/')) {
    parts = s.split(/\s*\/\s*/);
  } else if (s.includes(',')) {
    // Handles "in, on, or at", "in, on or at", "in, on, and at", "a, an, the"
    parts = s
      .split(/\s*,\s*/)
      .flatMap((chunk) =>
        chunk
          .replace(/^(?:or|and)\s+/i, '')
          .split(/\s+\b(?:or|and)\b\s+/i)
      );
  } else if (/\bor\b/i.test(s)) {
    parts = s.split(/\s+\bor\b\s+/i);
  } else if (allowBareAnd && /\band\b/i.test(s)) {
    parts = s.split(/\s+\band\b\s+/i);
  } else {
    return [];
  }

  const cleaned = parts.map(cleanToken).filter(Boolean);
  if (cleaned.length < 2 || cleaned.length > 6) return [];

  const unique: string[] = [];
  for (const w of cleaned) {
    if (!SINGLE_WORD_RE.test(w) || w.length > 16) return [];
    if (META_TOPIC_WORDS.has(w)) return [];
    if (!unique.includes(w)) unique.push(w);
  }
  return unique.length >= 2 ? unique : [];
}

/**
 * Extracts explicit single-word contrastive targets from a teacher's topic string.
 * Examples:
 * - "can or must" -> ["can", "must"]
 * - "for vs. since" -> ["for", "since"]
 * - "Modals: can / must / should" -> ["can", "must", "should"]
 * - "Prepositions (in, on, at)" -> ["in", "on", "at"]
 * - "Difference between make and do" -> ["make", "do"]
 * Broad topics ("Present Perfect vs Past Simple", "Comparatives and Superlatives",
 * "Active vs Passive", "Food and Cooking") return [].
 */
export function extractContrastiveTargets(topic: string | undefined | null): string[] {
  const raw = String(topic || '').trim();
  if (!raw || raw.length > 100) return [];

  // 1. Check parenthetical content first for forms like "Prepositions (in, on, at)"
  const parenMatch = raw.match(/\(([^)]+)\)/);
  if (parenMatch?.[1]) {
    const inside = parseCandidateList(parenMatch[1], false);
    if (inside.length >= 2) return inside;
  }

  // 2. Strip trailing parenthetical annotations like "can or must (A2 modals)"
  let core = raw.replace(/\s*\([^)]*\)\s*/g, ' ').trim();

  // 3. Strip leading category label before a colon or dash ("Modals: can or must")
  const colonIdx = core.indexOf(':');
  if (colonIdx >= 0 && colonIdx < core.length - 1) {
    const afterColon = core.slice(colonIdx + 1).trim();
    const fromAfter = parseCandidateList(afterColon, /\bbetween\b/i.test(core.slice(0, colonIdx)));
    if (fromAfter.length >= 2) return fromAfter;
  }

  // 4. Handle "difference between X and Y" / "choose between X and Y"
  const betweenMatch = core.match(/\bbetween\s+(.+)$/i);
  if (betweenMatch?.[1]) {
    const fromBetween = parseCandidateList(betweenMatch[1], true);
    if (fromBetween.length >= 2) return fromBetween;
  }

  // 5. Handle trailing descriptor after " - " or " – " (e.g. "for vs since - present perfect")
  const dashSplit = core.split(/\s+[–—-]\s+/);
  if (dashSplit.length >= 2) {
    const left = parseCandidateList(dashSplit[0], false);
    if (left.length >= 2) return left;
    const right = parseCandidateList(dashSplit.slice(1).join(' '), false);
    if (right.length >= 2) return right;
  }

  // 6. Standard direct contrast ("can or must", "for vs since", "in, on, or at", "make / do")
  return parseCandidateList(core, false);
}

/** Returns the rival contrasted words for a given chosen answer. */
export function contrastiveRivals(targets: string[], chosenAnswer: string | undefined): string[] {
  if (!targets.length) return [];
  const chosen = cleanToken(String(chosenAnswer || ''));
  return targets.filter((t) => t !== chosen);
}

/**
 * Formats writer-prompt instructions ensuring that a contrastive topic actually tests
 * the distinction between its target words instead of producing ambiguous gaps.
 */
export function formatContrastivePromptDirective(
  targets: string[],
  format: ServerQuestionType,
  assignedTarget?: string | null
): string {
  if (targets.length < 2) return '';
  const listStr = targets.map((t) => `"${t}"`).join(', ');
  const chosen = assignedTarget && targets.includes(assignedTarget.toLowerCase()) ? assignedTarget.toLowerCase() : null;
  const rivals = chosen ? contrastiveRivals(targets, chosen) : targets;
  const rivalStr = rivals.map((r) => `"${r}"`).join(', ');

  if (format === 'openCloze') {
    const targetRule = chosen
      ? `- REQUIRED GAP ANSWER FOR THIS ITEM: "correctAnswer" MUST be "${chosen}". The rival word(s) ${rivalStr} MUST NOT fit the blank!`
      : `- REQUIRED GAP ANSWER: "correctAnswer" MUST be ONE of [${listStr}]. Every other rival word in [${listStr}] MUST NOT fit the blank!`;
    const isModalContrast = targets.some((t) =>
      ['can', 'must', 'should', 'could', 'might', 'may', 'will', 'would', "can't", "mustn't", "shouldn't"].includes(t)
    );
    const hasShouldMust = targets.includes('should') && targets.includes('must');
    const modalAnchorNote = isModalContrast
      ? hasShouldMust
        ? `\n- HOW TO SEPARATE "should" vs "must" (CRITICAL — both express what to do, so ordinary rules/advice allow BOTH!):
  * To force "should" and make "must" CONTRADICTORY: explicitly state it is OPTIONAL, NOT mandatory, or personal advice (e.g., "You don't have to..., of course, but you _____ ...", "It isn't required at all, though you _____ ...", "Nobody is forcing you, yet you _____ ...").
  * To force "must" and make "should" TOO WEAK / CONTRADICTORY: explicitly contrast strict obligation against mere advice or state a binding law/consequence with no choice (e.g., "This is not optional advice — by law, everyone _____ ...", "It is strictly mandatory, not a suggestion: all ... _____ ...", "You have no choice: you _____ ..., or the gate stays locked").`
        : `\n- HOW TO ELIMINATE RIVAL MODALS (ESSENTIAL — modals share the same grammar slot, so plain sentences allow both!):
  * To force obligation ("must") and make "can" CONTRADICTORY: explicitly include a rule, law, lack of choice, or consequence (e.g., "... because it is the law", "... because it is a strict rule", "..., or you will pay a fine", "..., or the machine will stop").
  * To force optional permission or ability ("can") and make "must" CONTRADICTORY: explicitly include free choice/optionality (e.g., "... if you want", "... if you like", "... whenever they wish") OR a personal skill/capability (e.g., "Even at age six, ...", "... already ... without help", "... in three languages").`
      : '';
    return `
=== CONTRASTIVE WORD-CHOICE RULE (${targets.join(' vs ')}) ===
The teacher specifically wants to test whether students know the difference between ${listStr}.
${targetRule}
- UNMISTAKABLE CONTEXT CLUES (CRITICAL): Build an explicit grammatical, semantic, or logical anchor into the sentence so that ONLY your chosen answer makes sense, and substituting any rival (${rivalStr}) produces a clearly WRONG, ungrammatical, or logically contradictory sentence!
- MANDATORY SELF-TEST BEFORE WRITING EACH ITEM: Mentally replace "_____" with each rival (${rivalStr}). If the sentence STILL sounds natural and plausible in English, your clue is TOO WEAK — rewrite it with a stronger contradiction-forcing clue!
  * BAD (ambiguous — BOTH "can" and "must" sound natural): "The engineer _____ test the battery before it works." OR "Users _____ choose a strong password for safety."
  * GOOD (only "must" fits; "can" contradicts the consequence/rule): "Visitors _____ wear safety goggles inside the lab, or they are not allowed to enter."
  * GOOD (only "can" fits; "must" contradicts free choice/ability): "Users _____ switch to dark mode anytime if they like." OR "Even at age six, Maya _____ play three songs on the violin without help."${modalAnchorNote}
- NEVER include any rival from [${listStr}] in "acceptedAnswers". Set "acceptedAnswers" to ONLY your single target word.`;
  }

  if (format === 'multipleChoice') {
    const targetRule = chosen
      ? `- REQUIRED KEY FOR THIS ITEM: "correctAnswer" MUST be "${chosen}", and ${rivalStr} MUST appear among the distractor options.`
      : `- REQUIRED KEY & DISTRACTORS: "correctAnswer" MUST be one of [${listStr}], and the rival word(s) from [${listStr}] MUST appear among the 4 options as distractors.`;
    return `
=== CONTRASTIVE WORD-CHOICE RULE (${targets.join(' vs ')}) ===
The teacher specifically wants to test the difference between ${listStr}.
${targetRule}
- UNMISTAKABLE CONTEXT CLUES (CRITICAL): Craft the sentence context so that ONLY "correctAnswer" fits naturally and logically, and EVERY rival option in [${listStr}] is clearly wrong or contradictory in context!`;
  }

  if (format === 'binary') {
    return `
=== CONTRASTIVE WORD-CHOICE RULE (${targets.join(' vs ')}) ===
The teacher specifically wants to test the difference between ${listStr}.
- If generating an INCORRECT sentence: use the WRONG word from [${listStr}] in a context that clearly requires one of the other words in [${listStr}], so the error is unmistakable.
- If generating a CORRECT sentence: use one of [${listStr}] in a rich context where substituting any rival from [${listStr}] would clearly fail or contradict the sentence.`;
  }

  return '';
}

/** Concise per-slot hint placed directly on each batch item line so non-thinking models keep every item unambiguous. */
export function contrastiveSlotHint(target: string, rivals: string[]): string {
  const t = cleanToken(target);
  const rivalStr = rivals.map((r) => `"${r}"`).join(' / ');
  if (t === 'should' && rivals.includes('must')) {
    return `gap target MUST be "should" — explicitly state it is optional / not required / personal advice (e.g., "You don't have to..., but you _____", "It isn't mandatory, though you _____") so "must" directly contradicts the sentence`;
  }
  if (t === 'must' && rivals.includes('should')) {
    return `gap target MUST be "must" — explicitly state it is strictly mandatory and NOT optional advice (e.g., "It is not just a suggestion — by law, ... _____", "You have no choice: you _____ ..., or ...") so "should" is too weak / contradictory`;
  }
  if (t === 'can' && rivals.some((r) => ['must', 'should', "mustn't"].includes(r))) {
    return `gap target MUST be "can" — include an explicit free-choice or ability clue (e.g., "if they like", "anytime", "whenever you want", "without help") so ${rivalStr} is contradictory`;
  }
  if (t === 'must' && rivals.some((r) => ['can', 'could', 'may', 'might'].includes(r))) {
    return `gap target MUST be "must" — include an explicit law, strict rule, or consequence (e.g., "because it is the law", "strict rule", ", or you will be fined / locked out") so ${rivalStr} is contradictory`;
  }
  if (t === 'for' && rivals.includes('since')) {
    return `gap target MUST be "for" — pair with a duration (e.g., "three hours", "six months") so "since" is ungrammatical`;
  }
  if (t === 'since' && rivals.includes('for')) {
    return `gap target MUST be "since" — pair with a specific starting point (e.g., "2019", "Monday", "last week") so "for" is ungrammatical`;
  }
  return `gap target MUST be "${t}" — include an unmistakable clue so ${rivalStr} is clearly wrong`;
}
