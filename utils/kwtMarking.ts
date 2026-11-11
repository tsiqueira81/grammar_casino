// Key word transformation marking (0, 1 or 2 marks) with no AI (moved out of services/geminiService.ts
// in package L1, so that results and reports do not pull in the AI service and the offline bank).
export function normalizeContractionsForKwt(input: string): string {
  return (input || '')
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.,!?;:"“”]/g, '')
    .replace(/\bwon't\b/g, 'will not')
    .replace(/\bcan't\b/g, 'cannot')
    .replace(/\bshan't\b/g, 'shall not')
    .replace(/\bdon't\b/g, 'do not')
    .replace(/\bdoesn't\b/g, 'does not')
    .replace(/\bdidn't\b/g, 'did not')
    .replace(/\bhaven't\b/g, 'have not')
    .replace(/\bhasn't\b/g, 'has not')
    .replace(/\bhadn't\b/g, 'had not')
    .replace(/\bwouldn't\b/g, 'would not')
    .replace(/\bcouldn't\b/g, 'could not')
    .replace(/\bshouldn't\b/g, 'should not')
    .replace(/\bmustn't\b/g, 'must not')
    .replace(/\bneedn't\b/g, 'need not')
    .replace(/\boughtn't\b/g, 'ought not')
    .replace(/\bisn't\b/g, 'is not')
    .replace(/\baren't\b/g, 'are not')
    .replace(/\bwasn't\b/g, 'was not')
    .replace(/\bweren't\b/g, 'were not')
    .replace(/\bi'm\b/g, 'i am')
    .replace(/\byou're\b/g, 'you are')
    .replace(/\bwe're\b/g, 'we are')
    .replace(/\bthey're\b/g, 'they are')
    .replace(/\bi've\b/g, 'i have')
    .replace(/\byou've\b/g, 'you have')
    .replace(/\bwe've\b/g, 'we have')
    .replace(/\bthey've\b/g, 'they have')
    .replace(/\bi'll\b/g, 'i will')
    .replace(/\byou'll\b/g, 'you will')
    .replace(/\bhe'll\b/g, 'he will')
    .replace(/\bshe'll\b/g, 'she will')
    .replace(/\bwe'll\b/g, 'we will')
    .replace(/\bthey'll\b/g, 'they will')
    .replace(/\s+/g, ' ')
    .trim();
}

const FINITE_AUX_GROUPS: Record<string, string> = {
  is: 'be_pres_sg',
  are: 'be_pres_pl',
  am: 'be_pres_1s',
  was: 'be_past_sg',
  were: 'be_past_pl',
  has: 'have_pres_sg',
  have: 'have_pres_pl',
  had: 'have_past',
  does: 'do_pres_sg',
  do: 'do_pres_pl',
  did: 'do_past',
  will: 'modal_will_pres',
  would: 'modal_will_past',
};

const IRREGULAR_TENSE_CONFLICT_PAIRS: Array<[string, string]> = [
  ['take', 'took'],
  ['takes', 'took'],
  ['make', 'made'],
  ['makes', 'made'],
  ['go', 'went'],
  ['goes', 'went'],
  ['come', 'came'],
  ['comes', 'came'],
  ['see', 'saw'],
  ['sees', 'saw'],
  ['know', 'knew'],
  ['knows', 'knew'],
  ['give', 'gave'],
  ['gives', 'gave'],
  ['tell', 'told'],
  ['tells', 'told'],
  ['say', 'said'],
  ['says', 'said'],
  ['think', 'thought'],
  ['thinks', 'thought'],
  ['buy', 'bought'],
  ['buys', 'bought'],
  ['bring', 'brought'],
  ['brings', 'brought'],
  ['keep', 'kept'],
  ['keeps', 'kept'],
  ['leave', 'left'],
  ['leaves', 'left'],
  ['feel', 'felt'],
  ['feels', 'felt'],
  ['find', 'found'],
  ['finds', 'found'],
  ['begin', 'began'],
  ['begins', 'began'],
];

function computeLevenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function areValidUkUsSpellingVariants(a: string, b: string): boolean {
  const w1 = a.toLowerCase();
  const w2 = b.toLowerCase();
  if (w1 === w2) return true;
  const normalizeUkUs = (w: string) =>
    w
      .replace(/ization\b/g, 'isation')
      .replace(/ize(d|s|r|rs)?\b/g, 'ise$1')
      .replace(/izing\b/g, 'ising')
      .replace(/yze(d|s)?\b/g, 'yse$1')
      .replace(/our(s|ed|ing|ite|ites)?\b/g, 'or$1')
      .replace(/\b(travel|cancel|model|label|signal|dial|fuel|quarrel|counsel|marvel)led\b/g, '$1ed')
      .replace(/\b(travel|cancel|model|label|signal|dial|fuel|quarrel|counsel|marvel)ling\b/g, '$1ing')
      .replace(/\b(travel|cancel|model|label|signal|dial|fuel|quarrel|counsel|marvel)ler(s)?\b/g, '$1er$2')
      .replace(/\b(learn|spoil|dream|burn|leap|spell|smell|kneel)t\b/g, '$1ed')
      .replace(/\bgotten\b/g, 'got')
      .replace(/\bpractise(d|s|ing)?\b/g, 'practice$1');
  return normalizeUkUs(w1) === normalizeUkUs(w2);
}

function detectHalfDisqualification(
  candHalf: string,
  refHalves: string[],
  knownValidWords: Set<string>
): string | null {
  const candWords = candHalf.split(/\s+/).filter(Boolean);
  if (candWords.length === 0 || refHalves.length === 0) return null;

  const refWordsList = refHalves.map(h => h.split(/\s+/).filter(Boolean));
  const allRefWords = new Set<string>(refWordsList.flat());

  // 1. Check for finite tense / agreement auxiliary conflict against reference halves
  const refAuxSet = new Set<string>();
  allRefWords.forEach(w => {
    if (FINITE_AUX_GROUPS[w]) refAuxSet.add(w);
  });

  if (refAuxSet.size > 0) {
    for (const cw of candWords) {
      if (FINITE_AUX_GROUPS[cw] && !refAuxSet.has(cw)) {
        const expectedAux = Array.from(refAuxSet)[0];
        return `wrong verb tense/agreement "${cw}" instead of "${expectedAux}"`;
      }
    }
  }

  // Check irregular lexical verb tense conflicts (e.g. "take" vs "took")
  for (const [pres, past] of IRREGULAR_TENSE_CONFLICT_PAIRS) {
    if (allRefWords.has(pres) && !allRefWords.has(past) && candWords.includes(past)) {
      return `wrong verb tense "${past}" instead of "${pres}"`;
    }
    if (allRefWords.has(past) && !allRefWords.has(pres) && candWords.includes(pres)) {
      return `wrong verb tense "${pres}" instead of "${past}"`;
    }
  }

  // 2. Check for spelling errors / typos of target words in this half
  for (const cw of candWords) {
    if (cw.length < 4 || allRefWords.has(cw) || knownValidWords.has(cw)) continue;
    for (const rw of allRefWords) {
      if (rw.length < 4 || cw === rw) continue;
      if (areValidUkUsSpellingVariants(cw, rw)) continue;
      const dist = computeLevenshteinDistance(cw, rw);
      const collapsedCand = cw.replace(/(.)\1+/g, '$1');
      const collapsedRef = rw.replace(/(.)\1+/g, '$1');
      const isDoubleLetterTypo = collapsedCand === collapsedRef;
      const isCloseTypo = dist === 1 || (dist === 2 && rw.length >= 7 && cw[0] === rw[0]);
      if (isDoubleLetterTypo || isCloseTypo) {
        return `spelling error "${cw}" (should be "${rw}")`;
      }
    }
  }

  return null;
}

export interface KwtDeterministicEvaluation {
  isCorrect: boolean;
  marks: 0 | 1 | 2;
  feedback: string;
  half1Matched?: boolean;
  half2Matched?: boolean;
  half1Disqualified?: boolean;
  half2Disqualified?: boolean;
  half1Reason?: string | null;
  half2Reason?: string | null;
}

export function evaluateKeyWordTransformationDeterministic(
  candidate: string,
  intendedAnswer: string,
  acceptedAnswers: string[] = [],
  baseWord?: string,
  mark1Parts: string[] = [],
  mark2Parts: string[] = []
): KwtDeterministicEvaluation {
  const rawTrimmed = (candidate || '').trim().replace(/\s+/g, ' ');
  const words = rawTrimmed.split(' ').filter(Boolean);
  const key = (baseWord || '').trim().toUpperCase();
  const keyNorm = key.toLowerCase();

  if (words.length < 2 || words.length > 6) {
    return {
      isCorrect: false,
      marks: 0,
      half1Disqualified: true,
      half2Disqualified: true,
      feedback: `Key Word Transformation answers must be between 2 and 6 words (you wrote ${words.length} word${words.length === 1 ? '' : 's'}).`,
    };
  }

  if (key) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const keyRegex = new RegExp(`(^|[^a-zA-Z])${escapedKey}([^a-zA-Z]|$)`, 'i');
    if (!keyRegex.test(rawTrimmed)) {
      return {
        isCorrect: false,
        marks: 0,
        half1Disqualified: true,
        half2Disqualified: true,
        feedback: `0/2 Marks: You must include the given KEY WORD "${key}" without changing its form.`,
      };
    }
  }

  const candNorm = normalizeContractionsForKwt(rawTrimmed);
  const candRawNorm = rawTrimmed.toLowerCase().replace(/[.,!?;:"“”]/g, '').replace(/\s+/g, ' ').trim();

  const allAccepted = [intendedAnswer, ...(acceptedAnswers || [])].filter(Boolean);
  for (const acc of allAccepted) {
    const accNorm = normalizeContractionsForKwt(acc);
    const accRawNorm = acc.trim().toLowerCase().replace(/[.,!?;:"“”]/g, '').replace(/\s+/g, ' ').trim();
    if (candNorm === accNorm || candRawNorm === accRawNorm) {
      return {
        isCorrect: true,
        marks: 2,
        half1Matched: true,
        half2Matched: true,
        half1Disqualified: false,
        half2Disqualified: false,
        feedback: `2/2 Marks! Full Cambridge Part 4 transformation ("${rawTrimmed}").`,
      };
    }
  }

  // Derive fallback mark1Parts / mark2Parts from intendedAnswer split around midpoint if not explicitly provided
  let m1List = Array.isArray(mark1Parts) && mark1Parts.length > 0 ? [...mark1Parts] : [];
  let m2List = Array.isArray(mark2Parts) && mark2Parts.length > 0 ? [...mark2Parts] : [];
  if (m1List.length === 0 && m2List.length === 0 && intendedAnswer) {
    const intWords = intendedAnswer.trim().split(/\s+/).filter(Boolean);
    if (intWords.length >= 2) {
      const mid = Math.ceil(intWords.length / 2);
      m1List = [intWords.slice(0, mid).join(' ')];
      m2List = [intWords.slice(mid).join(' ')];
    }
  }

  const normM1All = m1List.map(normalizeContractionsForKwt).filter(Boolean);
  const normM2All = m2List.map(normalizeContractionsForKwt).filter(Boolean);

  // If both halves match and their combined string equals candNorm, award 2 marks
  for (const p1 of normM1All) {
    for (const p2 of normM2All) {
      if (`${p1} ${p2}`.trim() === candNorm) {
        return {
          isCorrect: true,
          marks: 2,
          half1Matched: true,
          half2Matched: true,
          half1Disqualified: false,
          half2Disqualified: false,
          feedback: `2/2 Marks! Both halves of the target transformation are accurate ("${rawTrimmed}").`,
        };
      }
    }
  }

  // In Cambridge Part 4, a 1-mark partial half can NEVER be just the bare given KEY WORD alone,
  // and mark1Parts must match at the START of the phrase while mark2Parts must match at the END.
  const normM1Partial = normM1All.filter(p => p !== keyNorm);
  const normM2Partial = normM2All.filter(p => p !== keyNorm);

  const matchedM1 = normM1Partial.find(p => candNorm === p || candNorm.startsWith(p + ' '));
  const matchedM2 = normM2Partial.find(p => candNorm === p || candNorm.endsWith(' ' + p));

  // Split candidate into candHalf1 and candHalf2 to inspect non-matching halves for tense/spelling errors
  const candWords = candNorm.split(' ').filter(Boolean);
  let candHalf1 = '';
  let candHalf2 = '';
  if (matchedM1 && candNorm.startsWith(matchedM1 + ' ')) {
    candHalf1 = matchedM1;
    candHalf2 = candNorm.slice(matchedM1.length).trim();
  } else if (matchedM2 && candNorm.endsWith(' ' + matchedM2)) {
    candHalf2 = matchedM2;
    candHalf1 = candNorm.slice(0, candNorm.length - matchedM2.length).trim();
  } else {
    const m1SampleWords = (normM1All[0] || '').split(' ').filter(Boolean);
    const m2SampleWords = (normM2All[0] || '').split(' ').filter(Boolean);
    const keyIdxInCand = keyNorm ? candWords.indexOf(keyNorm) : -1;
    let splitIdx = Math.min(candWords.length - 1, Math.max(1, m1SampleWords.length || Math.ceil(candWords.length / 2)));
    if (keyIdxInCand >= 0 && keyNorm) {
      if (m1SampleWords.includes(keyNorm)) {
        const afterKey = m1SampleWords.length - 1 - m1SampleWords.lastIndexOf(keyNorm);
        splitIdx = Math.min(candWords.length - 1, Math.max(1, keyIdxInCand + 1 + afterKey));
      } else if (m2SampleWords.includes(keyNorm)) {
        const beforeKey = m2SampleWords.indexOf(keyNorm);
        splitIdx = Math.min(candWords.length - 1, Math.max(1, keyIdxInCand - beforeKey));
      }
    }
    candHalf1 = candWords.slice(0, splitIdx).join(' ');
    candHalf2 = candWords.slice(splitIdx).join(' ');
  }

  const knownValidWords = new Set<string>();
  [...allAccepted, ...normM1All, ...normM2All].forEach(phrase => {
    normalizeContractionsForKwt(phrase)
      .split(/\s+/)
      .filter(Boolean)
      .forEach(w => knownValidWords.add(w));
  });

  const half1Reason = matchedM1 ? null : detectHalfDisqualification(candHalf1, normM1All, knownValidWords);
  const half2Reason = matchedM2 ? null : detectHalfDisqualification(candHalf2, normM2All, knownValidWords);
  const half1Disqualified = Boolean(half1Reason);
  const half2Disqualified = Boolean(half2Reason);

  if (matchedM1 || matchedM2) {
    const earnedHalf = matchedM1 || matchedM2;
    const otherIssue = matchedM1 ? half2Reason : half1Reason;
    return {
      isCorrect: true,
      marks: 1,
      half1Matched: Boolean(matchedM1),
      half2Matched: Boolean(matchedM2),
      half1Disqualified,
      half2Disqualified,
      half1Reason,
      half2Reason,
      feedback: otherIssue
        ? `1/2 Mark (Partial Credit): "${earnedHalf}" earns 1 mark, but the other half has a ${otherIssue} (full answer: "${intendedAnswer}").`
        : `1/2 Mark (Partial Credit): Good structure with "${earnedHalf}", though the full 2-mark transformation is "${intendedAnswer}".`,
    };
  }

  const bothReasons = [half1Reason, half2Reason].filter(Boolean);
  const detailedZeroFeedback =
    bothReasons.length > 0
      ? `0/2 Marks: ${bothReasons.join(', and ')} (expected "${intendedAnswer}").`
      : `0/2 Marks: "${rawTrimmed}" does not match the target structure (expected "${intendedAnswer}").`;

  return {
    isCorrect: false,
    marks: 0,
    half1Matched: false,
    half2Matched: false,
    half1Disqualified,
    half2Disqualified,
    half1Reason,
    half2Reason,
    feedback: detailedZeroFeedback,
  };
}
