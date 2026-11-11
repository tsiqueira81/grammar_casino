// AI content that is checked before students see it (package L3). Every AI sentence goes through
// quick checks (the L1 schema, the CEFR level, a school-safety word list) and then a second model,
// different from the one that wrote it, answers the item cold without seeing the key. The item is
// dealt only if the two agree. A rejected item is replaced from the built-in bank by the game.
import { Type } from '@google/genai';
import { validateItem } from '../content/schema';
import { NEAR_DUPLICATE, similarity } from '../content/audit';
import { checkCefrLevelViolation } from '../utils/cefrGrammarMatrix';
import type { CEFRLevel, GeneratedSentence, QuestionType } from '../types';

/** Topics a school game stays away from. Whole words only, so "class" never matches "ass". */
const SENSITIVE: RegExp[] = [
  /\b(kill(s|ed|ing)?|murder\w*|stab(s|bed|bing)?|shot dead|gun(s)?|bomb(s|ing)?|terroris\w*|weapon(s)?|suicide|rape(s|d)?|raping|torture\w*)\b/i,
  /\b(sex\w*|porn\w*|naked|nude|condom\w*|erotic\w*)\b/i,
  // Not "drunk": it is also the past participle of drink, a grammar point in its own right.
  /\b(drugs|cocaine|heroin|marijuana|cannabis|vodka|whisky|whiskey|beer(s)?|cigarette(s)?|vape|vaping)\b/i,
  /\b(trump|biden|bolsonaro|lula|putin|hitler|obama|election(s)?|politician(s)?|democrat\w*|republican\w*|left-wing|right-wing)\b/i,
  /\b(god|allah|jesus|bible|quran|koran|church(es)?|mosque(s)?|religio\w*|pray(s|ed|ing)?|atheis\w*)\b/i,
];

export function sensitivityProblems(text: string): string[] {
  const found = SENSITIVE.map((re) => (text.match(re) || [])[0]).filter((m): m is string => Boolean(m));
  return found.map((w) => `not for school: "${w.toLowerCase()}"`);
}

const norm = (s: string | undefined) =>
  (s || '').replace(/[’‘`]/g, "'").replace(/[.!?,;:]+$/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Every visible text of the item, for the safety word list. */
function allText(item: Partial<GeneratedSentence>): string {
  return [item.leadInSentence, item.text, item.correction, item.explanation, ...(item.options || [])].filter(Boolean).join(' \n ');
}

/** The checks that need no AI: schema (L1), level, school safety. */
export function quickProblems(item: Partial<GeneratedSentence>, type: QuestionType, level: string): string[] {
  const problems = [...validateItem(item, type).errors];
  const levelCheck = checkCefrLevelViolation(type === 'binary' ? item.correction || item.text || '' : (item.text || '').replace(/_+/g, item.correctAnswer || ''), level as CEFRLevel);
  if (levelCheck.violated) problems.push(`above the level: ${levelCheck.reason || level}`);
  problems.push(...sensitivityProblems(allText(item)));
  return problems;
}

/** What the verifier is asked. It never sees the key. */
export function verifierPrompt(item: Partial<GeneratedSentence>, type: QuestionType): string | null {
  const head = 'You are a careful Cambridge English examiner. Answer only from the text below; reply in JSON.';
  if (type === 'binary') {
    return `${head}\nSentence: "${item.text}"\nIs this sentence grammatically correct standard English? If it is not, give the corrected sentence.`;
  }
  if (type === 'multipleChoice') {
    const options = (item.options || []).map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join('\n');
    return `${head}\nSentence: "${item.text}"\nOptions:\n${options}\nWhich options are grammatically acceptable in the gap? List every acceptable option, written exactly as shown.`;
  }
  if (type === 'openCloze') {
    return `${head}\nSentence: "${item.text}"\nWhich single words could fill the gap correctly? List all of them (at most 5), most natural first.`;
  }
  if (type === 'wordFormation') {
    return `${head}\nSentence: "${item.text}"\nBase word: ${String(item.baseWord || '').toUpperCase()}\nForm a word from the base word that fills the gap correctly. List every correct form (at most 3), most natural first.`;
  }
  return null; // Key word transformation: checked by the quick checks and the marking rules only.
}

export const verifierSchema = {
  type: Type.OBJECT,
  properties: {
    grammatical: { type: Type.BOOLEAN, description: 'Binary only: is the sentence correct?' },
    correction: { type: Type.STRING, description: 'Binary only: the corrected sentence, or the same sentence when correct.' },
    acceptable: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Gap items: every acceptable option or word.' },
  },
  required: ['grammatical', 'correction', 'acceptable'],
};

export interface VerifierAnswer {
  grammatical?: boolean;
  correction?: string;
  acceptable?: string[];
}

export interface Verdict {
  ok: boolean;
  reasons: string[];
  /** Cloze words the verifier also accepts; added to the item's accepted answers. */
  extraAnswers: string[];
}

/** Compares the cold answer with the item's key. */
export function judge(item: Partial<GeneratedSentence>, type: QuestionType, answer: VerifierAnswer): Verdict {
  const fail = (reason: string): Verdict => ({ ok: false, reasons: [reason], extraAnswers: [] });
  if (type === 'binary') {
    if (typeof answer.grammatical !== 'boolean') return fail('the checker gave no verdict');
    if (answer.grammatical !== Boolean(item.isCorrect)) {
      return fail(item.isCorrect ? 'the checker found a mistake in a "correct" sentence' : 'the checker found no mistake in a "flawed" sentence');
    }
    return { ok: true, reasons: [], extraAnswers: [] };
  }
  const listed = (answer.acceptable || []).map((a) => norm(String(a).replace(/^[A-D]\)\s*/, ''))).filter(Boolean);
  if (type === 'multipleChoice') {
    const options = (item.options || []).map(norm);
    const picked = Array.from(new Set(listed.filter((a) => options.includes(a))));
    if (picked.length === 0) return fail('the checker found no acceptable option');
    if (picked.length > 1) return fail(`the checker found ${picked.length} acceptable options`);
    if (picked[0] !== norm(item.correctAnswer)) return fail('the checker chose a different option');
    return { ok: true, reasons: [], extraAnswers: [] };
  }
  if (type === 'openCloze' || type === 'wordFormation') {
    const keys = new Set([item.correctAnswer, ...(item.acceptedAnswers || [])].map(norm).filter(Boolean));
    if (!listed.some((a) => keys.has(a))) return fail('the checker did not accept the key');
    // A second right word is added, not punished: single words only, so a sentence never slips in.
    const extraAnswers = Array.from(new Set(listed.filter((a) => !keys.has(a) && /^[a-z']+$/.test(a))));
    return { ok: true, reasons: [], extraAnswers };
  }
  return { ok: true, reasons: [], extraAnswers: [] };
}

/** Runs every check. `ask` sends the prompt to the second model and returns its JSON text. */
export async function verifyItem(
  item: Partial<GeneratedSentence>,
  type: QuestionType,
  level: string,
  ask: ((prompt: string) => Promise<string>) | null,
  /** Sentences already dealt this game: a near copy is rejected. */
  pastTexts: string[] = []
): Promise<Verdict> {
  const quick = quickProblems(item, type, level);
  const copy = pastTexts.find((t) => typeof t === 'string' && similarity(t, item.text || '') > NEAR_DUPLICATE);
  if (copy) quick.push(`a near copy of an earlier sentence ("${copy.slice(0, 40)}")`);
  if (quick.length) return { ok: false, reasons: quick, extraAnswers: [] };
  const prompt = verifierPrompt(item, type);
  if (!prompt || !ask) return { ok: true, reasons: [], extraAnswers: [] };
  let parsed: VerifierAnswer;
  try {
    parsed = JSON.parse(await ask(prompt));
  } catch (e) {
    return { ok: false, reasons: [`the checker did not answer (${e instanceof Error ? e.message.slice(0, 40) : 'error'})`], extraAnswers: [] };
  }
  return judge(item, type, parsed);
}
