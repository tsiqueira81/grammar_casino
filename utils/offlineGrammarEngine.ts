import { WORD_FAMILY_LEXICON, diagnoseWordFormationAttempt } from './wordFamilyLexicon';

const COMMON_PAST_PARTICIPLES = new Set([
  'been', 'gone', 'seen', 'done', 'made', 'taken', 'known', 'come', 'left',
  'written', 'eaten', 'bought', 'brought', 'thought', 'taught', 'caught',
  'fought', 'sought', 'found', 'given', 'told', 'said', 'paid', 'laid',
  'heard', 'felt', 'kept', 'slept', 'wept', 'swept', 'left', 'meant',
  'sent', 'spent', 'lent', 'built', 'lost', 'won', 'held', 'sold',
  'understood', 'stood', 'sat', 'met', 'read', 'led', 'fed', 'fled',
  'bled', 'sped', 'shot', 'got', 'gotten', 'forgotten', 'spoken', 'broken',
  'chosen', 'frozen', 'stolen', 'woken', 'woven', 'driven', 'ridden',
  'risen', 'written', 'bitten', 'hidden', 'forbidden', 'forgiven', 'fallen',
  'beaten', 'drunk', 'sunk', 'shrunk', 'sung', 'rung', 'swum', 'begun',
  'run', 'spun', 'hung', 'stung', 'swung', 'clung', 'flung', 'wrung',
  'dug', 'stuck', 'struck', 'worn', 'torn', 'sworn', 'borne', 'born',
  'grown', 'known', 'thrown', 'blown', 'flown', 'shown', 'drawn', 'withdrawn',
]);

function isLikelyPastParticiple(word: string): boolean {
  const clean = (word || '').toLowerCase().replace(/[^a-z]/g, '');
  if (!clean) return false;
  if (COMMON_PAST_PARTICIPLES.has(clean)) return true;
  if (clean.length > 3 && clean.endsWith('ed') && !['need', 'speed', 'feed', 'bleed', 'breed', 'seed', 'weed', 'deed', 'steed', 'exceed', 'proceed', 'succeed'].includes(clean)) {
    return true;
  }
  return false;
}

/**
 * Normalizes UK and US English spelling differences to a single canonical form
 * so students are never penalized for British vs. American spelling.
 */
export function normalizeUkUsSpelling(input: string): string {
  return (input || '')
    .replace(/\b([a-z]{3,})ization(s)?\b/gi, '$1isation$2')
    .replace(/\b([a-z]{3,})ize(d|s|r|rs)?\b/gi, '$1ise$2')
    .replace(/\b([a-z]{3,})izing\b/gi, '$1ising')
    .replace(/\b(anal|catal|paral)yze(d|s)?\b/gi, '$1yse$2')
    .replace(/\b([a-z]*?(?:col|fav|flav|hum|lab|neighb|od|parl|rum|sav|vap|harb|hon|behavi))our(s|ed|ing|ite|ites|able|ably|less)?\b/gi, '$1or$2')
    .replace(/\b([a-z]*?(?:travel|cancel|model|label|signal|dial|fuel|quarrel|counsel|marvel))led\b/gi, '$1ed')
    .replace(/\b([a-z]*?(?:travel|cancel|model|label|signal|dial|fuel|quarrel|counsel|marvel))ling\b/gi, '$1ing')
    .replace(/\b([a-z]*?(?:travel|cancel|model|label|signal|dial|fuel|quarrel|counsel|marvel))ler(s)?\b/gi, '$1er$2')
    .replace(/\b(learn|spoil|dream|burn|leap|spell|smell|kneel)t\b/gi, '$1ed')
    .replace(/\bgotten\b/gi, 'got')
    .replace(/\bpractise(d|s|ing)?\b/gi, 'practice$1')
    .replace(/\blicence(d|s)?\b/gi, 'license$1')
    .replace(/\b(cent|met|theat|lit|fib)re(s)?\b/gi, '$1er$2')
    .replace(/\bdefenc(e|es|eless)\b/gi, 'defens$1')
    .replace(/\boffenc(e|es)\b/gi, 'offens$1')
    .replace(/\bpretenc(e|es)\b/gi, 'pretens$1')
    .replace(/\bgrey\b/gi, 'gray');
}

/**
 * Expands English contractions with context-sensitive disambiguation for:
 * - "'s" -> "has" (before past participles / "been" / "got" / adverbs + V3) vs. "is"
 * - "'d" -> "had" (before past participles / "better") vs. "would" (before bare infinitive / "rather" / "like" / "prefer")
 */
export function expandEnglishContractions(input: string): string {
  let s = (input || '')
    .trim()
    .replace(/[’‘`]/g, "'");

  // Unambiguous negative and modal contractions first
  s = s
    .replace(/\bwon't\b/gi, 'will not')
    .replace(/\bcan't\b/gi, 'cannot')
    .replace(/\bcannot\b/gi, 'cannot')
    .replace(/\bshan't\b/gi, 'shall not')
    .replace(/\bdon't\b/gi, 'do not')
    .replace(/\bdoesn't\b/gi, 'does not')
    .replace(/\bdidn't\b/gi, 'did not')
    .replace(/\bhaven't\b/gi, 'have not')
    .replace(/\bhasn't\b/gi, 'has not')
    .replace(/\bhadn't\b/gi, 'had not')
    .replace(/\bwouldn't\b/gi, 'would not')
    .replace(/\bcouldn't\b/gi, 'could not')
    .replace(/\bshouldn't\b/gi, 'should not')
    .replace(/\bmustn't\b/gi, 'must not')
    .replace(/\bneedn't\b/gi, 'need not')
    .replace(/\boughtn't\b/gi, 'ought not')
    .replace(/\bisn't\b/gi, 'is not')
    .replace(/\baren't\b/gi, 'are not')
    .replace(/\bwasn't\b/gi, 'was not')
    .replace(/\bweren't\b/gi, 'were not')
    .replace(/\bi'm\b/gi, 'i am')
    .replace(/\byou're\b/gi, 'you are')
    .replace(/\bwe're\b/gi, 'we are')
    .replace(/\bthey're\b/gi, 'they are')
    .replace(/\bi've\b/gi, 'i have')
    .replace(/\byou've\b/gi, 'you have')
    .replace(/\bwe've\b/gi, 'we have')
    .replace(/\bthey've\b/gi, 'they have')
    .replace(/\bcould've\b/gi, 'could have')
    .replace(/\bwould've\b/gi, 'would have')
    .replace(/\bshould've\b/gi, 'should have')
    .replace(/\bmust've\b/gi, 'must have')
    .replace(/\bmight've\b/gi, 'might have')
    .replace(/\bi'll\b/gi, 'i will')
    .replace(/\byou'll\b/gi, 'you will')
    .replace(/\bhe'll\b/gi, 'he will')
    .replace(/\bshe'll\b/gi, 'she will')
    .replace(/\bit'll\b/gi, 'it will')
    .replace(/\bwe'll\b/gi, 'we will')
    .replace(/\bthey'll\b/gi, 'they will')
    .replace(/\bthere'll\b/gi, 'there will')
    .replace(/\blet's\b/gi, 'let us');

  // Context-sensitive "'d" disambiguation (had vs. would)
  s = s.replace(
    /\b(i|you|he|she|it|we|they|there|who)'d\s+([a-z']+)(\s+[a-z']+)?/gi,
    (_match, subj, next1, next2Raw) => {
      const w1 = (next1 || '').toLowerCase();
      const w2 = (next2Raw || '').trim().toLowerCase();
      if (w1 === 'better') {
        return `${subj} had ${next1}${next2Raw || ''}`;
      }
      if (w1 === 'rather' || w1 === 'sooner' || w1 === 'like' || w1 === 'love' || w1 === 'prefer' || w1 === 'hate') {
        return `${subj} would ${next1}${next2Raw || ''}`;
      }
      if (isLikelyPastParticiple(w1)) {
        return `${subj} had ${next1}${next2Raw || ''}`;
      }
      // Check if w1 is an adverb/negation ("never", "already", "just", "always", "ever", "not") followed by a past participle in w2
      if (['never', 'already', 'just', 'always', 'ever', 'not', 'only', 'hardly', 'barely', 'scarcely'].includes(w1) && isLikelyPastParticiple(w2)) {
        return `${subj} had ${next1}${next2Raw || ''}`;
      }
      return `${subj} would ${next1}${next2Raw || ''}`;
    }
  );

  // Context-sensitive "'s" disambiguation on pronouns/interrogatives (has vs. is)
  s = s.replace(
    /\b(he|she|it|there|here|that|what|who|where|how|everything|nothing|something|everyone|someone|nobody)'s\s+([a-z']+)(\s+[a-z']+)?/gi,
    (_match, subj, next1, next2Raw) => {
      const w1 = (next1 || '').toLowerCase();
      const w2 = (next2Raw || '').trim().toLowerCase();
      if (isLikelyPastParticiple(w1)) {
        return `${subj} has ${next1}${next2Raw || ''}`;
      }
      if (['never', 'already', 'just', 'always', 'ever', 'not'].includes(w1) && isLikelyPastParticiple(w2)) {
        return `${subj} has ${next1}${next2Raw || ''}`;
      }
      return `${subj} is ${next1}${next2Raw || ''}`;
    }
  );

  return s;
}

const NUMBER_WORDS_MAP: Record<string, string> = {
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  eleven: '11',
  twelve: '12',
};

/**
 * Full canonical normalization of an English sentence for deterministic equivalence checks:
 * 1. Expands contractions with context-sensitive 's / 'd disambiguation
 * 2. Normalizes UK/US spelling variants
 * 3. Normalizes small number words (one..twelve -> 1..12)
 * 4. Strips punctuation and collapses whitespace
 */
export function normalizeEnglishSentence(input: string): string {
  const expanded = expandEnglishContractions(input);
  const ukUs = normalizeUkUsSpelling(expanded);
  const lower = ukUs
    .toLowerCase()
    .replace(/[.,!?;:"“”()[\]—–-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!lower) return '';
  return lower
    .split(' ')
    .map(tok => NUMBER_WORDS_MAP[tok] || tok)
    .join(' ');
}

/**
 * Normalizes movable sentence-initial vs. sentence-final adverbials/clauses
 * (e.g., "Yesterday I went to London" <-> "I went to London yesterday",
 * or "If it rains, we will stay home" <-> "We will stay home if it rains").
 */
export function getClauseOrderVariants(sentence: string): string[] {
  const base = normalizeEnglishSentence(sentence);
  const variants = new Set<string>([base]);

  // Comma-separated two-clause swap (e.g. "If ..., main clause" <-> "main clause if ...")
  if (sentence.includes(',')) {
    const parts = sentence.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length === 2) {
      const swapped = normalizeEnglishSentence(`${parts[1]} ${parts[0]}`);
      if (swapped) variants.add(swapped);
    }
  }

  // Trailing vs. leading single-word time markers ("yesterday", "today", "tomorrow", "now", "recently")
  const tokens = base.split(' ').filter(Boolean);
  const movableTimeMarkers = new Set(['yesterday', 'today', 'tomorrow', 'now', 'recently', 'lately']);
  if (tokens.length >= 4) {
    if (movableTimeMarkers.has(tokens[0])) {
      variants.add([...tokens.slice(1), tokens[0]].join(' '));
    }
    if (movableTimeMarkers.has(tokens[tokens.length - 1])) {
      variants.add([tokens[tokens.length - 1], ...tokens.slice(0, -1)].join(' '));
    }
  }

  return Array.from(variants);
}

/**
 * Known ungrammatical learner patterns (ERRANT high-frequency ESL error traps).
 * Used to ensure offline fallback never approves a sentence containing a glaring grammatical flaw.
 */
const UNGRAMMATICAL_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\b(can|could|must|should|would|might|may|will|shall)\s+to\s+[a-z]+\b/i, reason: 'modal verbs must be followed by a bare infinitive without "to"' },
  { pattern: /\bhad\s+better\s+to\s+[a-z]+\b/i, reason: '"had better" is followed by a bare infinitive without "to"' },
  { pattern: /\bwould\s+rather\s+to\s+[a-z]+\b/i, reason: '"would rather" is followed by a bare infinitive without "to"' },
  { pattern: /\b(do|does|did)\s+not\s+(went|saw|bought|made|took|gave|came|knew|ate|drank|wrote|spoke|broke|chose|fell|forgot|got|had|ran|said|told|thought|won|lost)\b/i, reason: 'auxiliary "do/does/did" must be followed by the base form of the verb, not the past tense' },
  { pattern: /\b(he|she|it)\s+(have|do\s+not|are|were\s+born\s+in\s+they)\b/i, reason: 'subject-verb agreement mismatch with singular subject' },
  { pattern: /\b(i|we|you|they)\s+(is|has|does\s+not)\b/i, reason: 'subject-verb agreement mismatch' },
  { pattern: /\b(we|you|they)\s+was\b/i, reason: 'plural subject requires "were", not "was"' },
  { pattern: /\b(advices|informations|furnitures|luggages|equipments|homeworks|knowledges|sceneries)\b/i, reason: 'uncountable noun cannot be pluralized with "-s"' },
  { pattern: /\ba\s+(advice|information|furniture|luggage|equipment|homework)\b/i, reason: 'uncountable noun cannot take the indefinite article "a"' },
  { pattern: /\ban\s+(university|uniform|european|one|union|unique|useful|user|unit)\b/i, reason: 'words starting with a /juː/ or /w/ consonant sound take "a", not "an"' },
  { pattern: /\ba\s+(hour|honest|heir|honour|honor)\b/i, reason: 'words starting with a silent "h" vowel sound take "an", not "a"' },
  { pattern: /\bdespite\s+of\b/i, reason: 'use either "despite" (without "of") or "in spite of"' },
  { pattern: /\b(discuss|enter|marry|reach|approach|resemble|await|emphasize|emphasise|stress)\s+about\b/i, reason: 'transitive verb does not take the preposition "about"' },
  { pattern: /\blook(s|ed|ing)?\s+forward\s+to\s+(meet|see|hear|go|work|visit|have|make|take|get|do|be)\b/i, reason: '"look forward to" must be followed by a gerund (-ing), not a bare infinitive' },
  { pattern: /\b(must|should|could|would|might)\s+of\s+[a-z]+\b/i, reason: 'use modal + "have", never "of"' },
  { pattern: /\b(buyed|maked|eated|goed|thinked|bringed|teached|catched|finded|leaved|keeped|sleeped|choosed|growed|knowed|throwed|drawed)\b/i, reason: 'irregular verb past form error' },
];

/**
 * Equivalent grammatical phrase repairs that learners legitimately use when fixing an error.
 */
const EQUIVALENT_REPAIR_GROUPS: string[][] = [
  ['should', 'ought to', 'had better'],
  ['must not', 'cannot'],
  ['have to', 'need to', 'must'],
  ['do not have to', 'do not need to', 'need not'],
  ['does not have to', 'does not need to', 'need not'],
  ['despite', 'in spite of'],
  ['although', 'even though', 'though'],
  ['because of', 'due to', 'owing to', 'on account of'],
  ['so that', 'in order that'],
  ['to', 'in order to', 'so as to'],
  ['used to', 'would'],
  ['was able to', 'managed to', 'succeeded in'],
  ['were able to', 'managed to', 'succeeded in'],
  ['who', 'that'],
  ['which', 'that'],
  ['if', 'whether'],
  ['on', 'upon'],
  ['toward', 'towards'],
  ['among', 'amongst'],
  ['while', 'whilst'],
  ['amid', 'amidst'],
];

function areEquivalentRepairSpans(studentSpan: string, intendedSpan: string): boolean {
  const s = studentSpan.trim().toLowerCase();
  const t = intendedSpan.trim().toLowerCase();
  if (s === t) return true;

  for (const group of EQUIVALENT_REPAIR_GROUPS) {
    if (group.includes(s) && group.includes(t)) {
      return true;
    }
  }

  // Relative pronoun omission when followed by a subject pronoun ("that I" <-> "I", "which we" <-> "we")
  if (t.startsWith('that ') && s === t.slice(5)) return true;
  if (t.startsWith('which ') && s === t.slice(6)) return true;
  if (t.startsWith('who ') && s === t.slice(4)) return true;
  if (s.startsWith('that ') && t === s.slice(5)) return true;

  return false;
}

export interface SpanDiffExtraction {
  prefixTokens: string[];
  suffixTokens: string[];
  errorSpanTokens: string[];
  intendedRepairTokens: string[];
  frameTokens: string[];
}

/**
 * Extracts the exact token-level difference between `originalSentence` and `intendedCorrection`.
 */
export function extractErrorAndRepairSpans(
  originalSentence: string,
  intendedCorrection: string
): SpanDiffExtraction {
  const origTokens = normalizeEnglishSentence(originalSentence).split(' ').filter(Boolean);
  const intTokens = normalizeEnglishSentence(intendedCorrection).split(' ').filter(Boolean);

  let prefixLen = 0;
  const minLen = Math.min(origTokens.length, intTokens.length);
  while (prefixLen < minLen && origTokens[prefixLen] === intTokens[prefixLen]) {
    prefixLen++;
  }

  let suffixLen = 0;
  while (
    suffixLen < minLen - prefixLen &&
    origTokens[origTokens.length - 1 - suffixLen] === intTokens[intTokens.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const prefixTokens = origTokens.slice(0, prefixLen);
  const suffixTokens = suffixLen > 0 ? origTokens.slice(origTokens.length - suffixLen) : [];
  const errorSpanTokens = origTokens.slice(prefixLen, origTokens.length - suffixLen);
  const intendedRepairTokens = intTokens.slice(prefixLen, intTokens.length - suffixLen);
  const frameTokens = [...prefixTokens, ...suffixTokens];

  return {
    prefixTokens,
    suffixTokens,
    errorSpanTokens,
    intendedRepairTokens,
    frameTokens,
  };
}

/**
 * 3-Gate Deterministic Offline Evaluator for Binary (Valid or Flawed) Sentence Corrections.
 * Fixes the 1-letter edit loophole while accepting contractions, UK/US spelling, movable adverbials,
 * and valid grammatical repair equivalents.
 */
export function evaluateBinaryCorrectionOffline(
  originalSentence: string,
  userCorrection: string,
  intendedCorrection: string,
  errorPhrase?: string,
  acceptedAnswers: string[] = []
): { isCorrect: boolean; feedback: string } {
  const rawUser = (userCorrection || '').trim();
  if (!rawUser) {
    return {
      isCorrect: false,
      feedback: 'No correction was provided.',
    };
  }

  const normUser = normalizeEnglishSentence(rawUser);
  const normOrig = normalizeEnglishSentence(originalSentence);
  const normIntended = normalizeEnglishSentence(intendedCorrection);

  // 1. Reject if identical to the original flawed sentence
  if (normUser === normOrig) {
    return {
      isCorrect: false,
      feedback: 'Your submitted sentence is identical to the original uncorrected sentence.',
    };
  }

  // 2. Check exact match (after contraction expansion, UK/US spelling normalization, and clause-order variants)
  const userVariants = getClauseOrderVariants(rawUser);
  const allTargetCandidates = [intendedCorrection, ...(acceptedAnswers || [])].filter(Boolean);
  for (const target of allTargetCandidates) {
    const targetVariants = getClauseOrderVariants(target);
    for (const uv of userVariants) {
      if (targetVariants.includes(uv)) {
        return {
          isCorrect: true,
          feedback: 'Excellent correction! Your fix matches the target grammar rule.',
        };
      }
    }
  }

  // 3. Check for any known glaring ungrammatical learner patterns in the student's rewrite
  for (const rule of UNGRAMMATICAL_PATTERNS) {
    if (rule.pattern.test(rawUser) && !rule.pattern.test(intendedCorrection)) {
      return {
        isCorrect: false,
        feedback: `Not quite: ${rule.reason} (expected "${intendedCorrection}").`,
      };
    }
  }

  // 4. Run the 3-Gate Error-Span Diff Validator
  const diff = extractErrorAndRepairSpans(originalSentence, intendedCorrection);
  const errPhraseNorm = normalizeEnglishSentence(errorPhrase || diff.errorSpanTokens.join(' '));
  const intendedRepairStr = diff.intendedRepairTokens.join(' ');

  // Gate A: Ensure the original error span was actually modified/removed!
  if (errPhraseNorm) {
    const paddedUser = ` ${normUser} `;
    const paddedErr = ` ${errPhraseNorm} `;
    // Only flag as "still present" if the intended correction doesn't also contain that exact substring
    const paddedIntended = ` ${normIntended} `;
    if (paddedUser.includes(paddedErr) && !paddedIntended.includes(paddedErr)) {
      return {
        isCorrect: false,
        feedback: `The grammatical error ("${errorPhrase || diff.errorSpanTokens.join(' ')}") is still uncorrected. Expected: "${intendedCorrection}".`,
      };
    }
  }

  // Gate B: Context Frame Preservation (>= 75% of non-erroneous context words must be kept)
  const userTokens = normUser.split(' ').filter(Boolean);
  const userTokenSet = new Set(userTokens);
  if (diff.frameTokens.length > 0) {
    const matchedFrameCount = diff.frameTokens.filter(t => userTokenSet.has(t)).length;
    const frameRatio = matchedFrameCount / diff.frameTokens.length;
    if (frameRatio < 0.75) {
      return {
        isCorrect: false,
        feedback: `Please preserve the original sentence's context while fixing the grammar mistake (expected: "${intendedCorrection}").`,
      };
    }
  }

  // Gate C: Inspect the student's replacement span at the error site
  const prefixStr = diff.prefixTokens.join(' ');
  const suffixStr = diff.suffixTokens.join(' ');
  const startsWithPrefix = !prefixStr || normUser === prefixStr || normUser.startsWith(prefixStr + ' ');
  const endsWithSuffix = !suffixStr || normUser === suffixStr || normUser.endsWith(' ' + suffixStr);

  if (startsWithPrefix && endsWithSuffix) {
    const startSlice = prefixStr ? prefixStr.length : 0;
    const endSlice = suffixStr ? normUser.length - suffixStr.length : normUser.length;
    if (endSlice >= startSlice) {
      const studentRepairSpan = normUser.slice(startSlice, endSlice).trim();
      if (areEquivalentRepairSpans(studentRepairSpan, intendedRepairStr)) {
        return {
          isCorrect: true,
          feedback: `Accepted! "${studentRepairSpan}" is a valid grammatical equivalent for "${intendedRepairStr}".`,
        };
      }
    }
  }

  // Gate C2: Check if substituting any equivalent repair phrase inside `normIntended` produces `normUser`
  // (Handles multi-word replacements like "Despite of" -> "Despite" vs "In spite of" where "despite" shared a prefix token)
  for (const group of EQUIVALENT_REPAIR_GROUPS) {
    for (const phraseA of group) {
      const paddedIntended = ` ${normIntended} `;
      if (!paddedIntended.includes(` ${phraseA} `)) continue;
      for (const phraseB of group) {
        if (phraseA === phraseB) continue;
        const substituted = paddedIntended.replace(` ${phraseA} `, ` ${phraseB} `).trim();
        if (substituted === normUser) {
          return {
            isCorrect: true,
            feedback: `Accepted! "${phraseB}" is a valid grammatical equivalent for "${phraseA}".`,
          };
        }
      }
    }
  }

  return {
    isCorrect: false,
    feedback: `Expected fix was: "${intendedCorrection}".`,
  };
}

/**
 * Offline evaluator for Word Formation (Cambridge Use of English Part 3) single-word gaps.
 * Uses UK/US spelling normalization + WORD_FAMILY_LEXICON for morphological diagnostics.
 */
export function evaluateWordFormationOffline(
  candidateWord: string,
  intendedAnswer: string,
  acceptedAnswers: string[] = [],
  baseWord?: string
): { isCorrect: boolean; marks: 0 | 1; feedback: string } {
  const raw = (candidateWord || '').trim().replace(/\s+/g, ' ');
  const cleanLower = raw.toLowerCase();
  const cleanBase = (baseWord || '').trim().toLowerCase();

  if (!cleanLower) {
    return {
      isCorrect: false,
      marks: 0,
      feedback: 'No word provided.',
    };
  }

  if (cleanLower.includes(' ')) {
    return {
      isCorrect: false,
      marks: 0,
      feedback: 'Word Formation gaps require a single derived word only.',
    };
  }

  if (cleanBase && cleanLower === cleanBase) {
    return {
      isCorrect: false,
      marks: 0,
      feedback: `You must transform the base word (${baseWord?.toUpperCase()}) into a different grammatical form.`,
    };
  }

  const candCanonical = normalizeUkUsSpelling(cleanLower);
  const allAccepted = [intendedAnswer, ...(acceptedAnswers || [])]
    .map(a => (a || '').trim().toLowerCase())
    .filter(a => Boolean(a) && (!cleanBase || a !== cleanBase));

  for (const acc of allAccepted) {
    if (cleanLower === acc || candCanonical === normalizeUkUsSpelling(acc)) {
      return {
        isCorrect: true,
        marks: 1,
        feedback: `Accepted! "${raw}" is the correct derived form${baseWord ? ` of ${baseWord.toUpperCase()}` : ''}.`,
      };
    }
  }

  // Diagnostic morphological feedback using WORD_FAMILY_LEXICON
  const diagnostic = diagnoseWordFormationAttempt(raw, intendedAnswer, baseWord);
  return {
    isCorrect: false,
    marks: 0,
    feedback: diagnostic,
  };
}

/**
 * Offline evaluator for Open Cloze (Cambridge Use of English Part 2) single-word gaps.
 */
export function evaluateOpenClozeOffline(
  candidateWord: string,
  intendedAnswer: string,
  acceptedAnswers: string[] = [],
  sentenceWithBlank?: string
): { isCorrect: boolean; marks: 0 | 1; feedback: string } {
  const raw = (candidateWord || '').trim().replace(/\s+/g, ' ');
  const cleanLower = raw.toLowerCase();

  if (!cleanLower) {
    return {
      isCorrect: false,
      marks: 0,
      feedback: 'No word provided.',
    };
  }

  if (cleanLower.includes(' ')) {
    return {
      isCorrect: false,
      marks: 0,
      feedback: 'Open Cloze gaps require one single word only.',
    };
  }

  const candCanonical = normalizeUkUsSpelling(cleanLower);
  const allAccepted = [intendedAnswer, ...(acceptedAnswers || [])]
    .map(a => (a || '').trim().toLowerCase())
    .filter(Boolean);

  for (const acc of allAccepted) {
    if (cleanLower === acc || candCanonical === normalizeUkUsSpelling(acc)) {
      return {
        isCorrect: true,
        marks: 1,
        feedback: `Accepted! "${raw}" fits the grammatical gap.`,
      };
    }
  }

  // Check single-word grammatical equivalents when context permits (e.g. relative pronouns "that" <-> "which" in non-comma defining clauses)
  const intendedLower = (intendedAnswer || '').trim().toLowerCase();
  const hasCommaBeforeBlank = Boolean(sentenceWithBlank && /,\s*_{3,}/.test(sentenceWithBlank));
  const hasPrepBeforeBlank = Boolean(sentenceWithBlank && /\b(in|on|at|to|for|with|from|by|of|under|through|about)\s+_{3,}/i.test(sentenceWithBlank));

  if (!hasCommaBeforeBlank && !hasPrepBeforeBlank) {
    if ((intendedLower === 'which' && cleanLower === 'that') || (intendedLower === 'that' && cleanLower === 'which')) {
      return {
        isCorrect: true,
        marks: 1,
        feedback: `Accepted! Both "${raw}" and "${intendedAnswer}" work in this defining relative clause.`,
      };
    }
  }

  if (
    (intendedLower === 'although' && cleanLower === 'though') ||
    (intendedLower === 'though' && cleanLower === 'although') ||
    (intendedLower === 'while' && cleanLower === 'whilst') ||
    (intendedLower === 'whilst' && cleanLower === 'while') ||
    (intendedLower === 'toward' && cleanLower === 'towards') ||
    (intendedLower === 'towards' && cleanLower === 'toward') ||
    (intendedLower === 'among' && cleanLower === 'amongst') ||
    (intendedLower === 'amongst' && cleanLower === 'among')
  ) {
    return {
      isCorrect: true,
      marks: 1,
      feedback: `Accepted! "${raw}" is a valid single-word equivalent for "${intendedAnswer}".`,
    };
  }

  return {
    isCorrect: false,
    marks: 0,
    feedback: `"${raw}" does not fit the grammatical context (expected "${intendedAnswer}").`,
  };
}

/**
 * CLOTH-style Single-Axis Distractor Sanitizer for Multiple-Choice Cloze.
 * Ensures that:
 * 1. None of the 3 distractors in `options` are secretly listed in `acceptedAnswers` or equivalent to `correctAnswer`.
 * 2. If a distractor collides with an accepted synonym (e.g. "although" vs "though" or UK/US spelling), it is replaced with a true grammatical distractor from the same category.
 */
const FALLBACK_DISTRACTOR_POOLS: Record<string, string[]> = {
  prepositions: ['at', 'in', 'on', 'for', 'with', 'from', 'to', 'by', 'of', 'into'],
  articles: ['a', 'an', 'the', 'some', 'any', 'every', 'each'],
  conjunctions: ['despite', 'however', 'unless', 'because', 'during', 'whereas', 'until'],
  modals: ['must', 'should', 'could', 'might', 'would', 'ought', 'need'],
  auxiliaries: ['has', 'have', 'had', 'was', 'were', 'did', 'does', 'is'],
};

export function sanitizeMultipleChoiceDistractors(
  correctAnswer: string,
  options: string[],
  acceptedAnswers: string[] = []
): string[] {
  const primary = (correctAnswer || '').trim();
  if (!primary) return options;

  const primaryNorm = normalizeUkUsSpelling(primary.toLowerCase());
  const forbiddenSet = new Set<string>([
    primary.toLowerCase(),
    primaryNorm,
    ...(acceptedAnswers || []).map(a => (a || '').trim().toLowerCase()),
    ...(acceptedAnswers || []).map(a => normalizeUkUsSpelling((a || '').trim().toLowerCase())),
  ]);

  // Also forbid single-word interchangeable synonyms from appearing as "wrong" distractors alongside the correct answer
  const synonymPairs: Array<[string, string]> = [
    ['although', 'though'],
    ['while', 'whilst'],
    ['among', 'amongst'],
    ['toward', 'towards'],
    ['amid', 'amidst'],
    ['on', 'upon'],
  ];
  for (const [a, b] of synonymPairs) {
    if (primaryNorm === a) forbiddenSet.add(b);
    if (primaryNorm === b) forbiddenSet.add(a);
  }

  const cleanDistractors: string[] = [];
  const seenLower = new Set<string>([primary.toLowerCase()]);

  for (const opt of options) {
    const trimmed = (opt || '').trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    const norm = normalizeUkUsSpelling(lower);
    if (lower === primary.toLowerCase()) continue;
    if (forbiddenSet.has(lower) || forbiddenSet.has(norm) || seenLower.has(lower)) {
      continue;
    }
    seenLower.add(lower);
    cleanDistractors.push(trimmed);
  }

  // If any ambiguous distractor was filtered out, replenish to 3 distractors from the matching grammatical category
  if (cleanDistractors.length < 3) {
    let pool = FALLBACK_DISTRACTOR_POOLS.auxiliaries;
    if (FALLBACK_DISTRACTOR_POOLS.prepositions.includes(primaryNorm)) {
      pool = FALLBACK_DISTRACTOR_POOLS.prepositions;
    } else if (FALLBACK_DISTRACTOR_POOLS.articles.includes(primaryNorm)) {
      pool = FALLBACK_DISTRACTOR_POOLS.articles;
    } else if (FALLBACK_DISTRACTOR_POOLS.modals.includes(primaryNorm)) {
      pool = FALLBACK_DISTRACTOR_POOLS.modals;
    } else if (FALLBACK_DISTRACTOR_POOLS.conjunctions.includes(primaryNorm) || ['although', 'though', 'while', 'since'].includes(primaryNorm)) {
      pool = FALLBACK_DISTRACTOR_POOLS.conjunctions;
    }

    for (const candidate of pool) {
      if (cleanDistractors.length >= 3) break;
      if (!forbiddenSet.has(candidate) && !seenLower.has(candidate)) {
        seenLower.add(candidate);
        cleanDistractors.push(candidate);
      }
    }
  }

  // Preserve original position of `primary` if it was already in `options`, or place it deterministically
  const origPrimaryIdx = options.findIndex(o => (o || '').trim().toLowerCase() === primary.toLowerCase());
  const insertIdx = origPrimaryIdx >= 0 && origPrimaryIdx <= cleanDistractors.length ? origPrimaryIdx : 0;
  const finalOptions = [...cleanDistractors.slice(0, 3)];
  finalOptions.splice(insertIdx, 0, primary);
  return finalOptions;
}
