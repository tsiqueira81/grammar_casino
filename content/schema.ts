// One check for every sentence the game deals (package L1), whether it comes from the built-in
// bank, the cloud bank or the AI. An item with errors is never dealt: an AI item that fails is
// replaced by a bank item without a word to the class. Warnings are style problems that the bank
// must not have but that an AI item may still be dealt with.
import type { CEFRLevel, GeneratedSentence, QuestionType } from '../types';

export const LEVELS: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
export const GAP = '_____';
export const MAX_EXPLANATION_WORDS = 40;

export interface ItemCheck {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export type CheckedItem = Partial<GeneratedSentence> & { level?: string; topic?: string };

const norm = (s: string | undefined) => (s || '').replace(/[’‘`]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
const words = (s: string | undefined) => (s || '').split(/\s+/).filter(Boolean).length;
const stripEnd = (s: string | undefined) => norm(s).replace(/[.!?]+$/, '');

/** Checks one item of the given type. `level` and `topic` are checked when present. */
export function validateItem(item: CheckedItem, type: QuestionType): ItemCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const text = item.text || '';

  if (text.trim().length < 5 || text.length > 1000) errors.push('text must be 5 to 1000 characters');
  if (item.level !== undefined && !LEVELS.includes(item.level as CEFRLevel)) errors.push(`unknown level "${item.level}"`);
  if (item.topic !== undefined && (!item.topic.trim() || item.topic.length > 100)) errors.push('topic must be 1 to 100 characters');
  if (!item.explanation || !item.explanation.trim()) errors.push('explanation is missing');
  else if (words(item.explanation) > MAX_EXPLANATION_WORDS) warnings.push(`explanation is over ${MAX_EXPLANATION_WORDS} words`);

  const answers = [item.correctAnswer, ...(item.acceptedAnswers || [])].filter((a): a is string => Boolean(a && a.trim()));

  if (type === 'binary') {
    if (typeof item.isCorrect !== 'boolean') errors.push('isCorrect must be true or false');
    if (!item.correction || !item.correction.trim()) errors.push('correction is missing');
    else if (item.isCorrect === false && stripEnd(item.correction) === stripEnd(text)) errors.push('a flawed sentence needs a different correction');
    else if (item.isCorrect === true && stripEnd(item.correction) !== stripEnd(text)) warnings.push('a valid sentence should be its own correction');
    if (item.isCorrect === false && item.errorPhrase) {
      const missing = item.errorPhrase.split('...').map((p) => p.trim()).filter(Boolean).filter((p) => !norm(text).includes(norm(p)));
      if (missing.length) warnings.push('errorPhrase is not in the sentence');
    }
    return { ok: errors.length === 0, errors, warnings };
  }

  if (!text.includes(GAP)) errors.push(`text needs the gap ${GAP}`);
  if (!item.correctAnswer || !item.correctAnswer.trim()) errors.push('correctAnswer is missing');

  if (type === 'multipleChoice') {
    const options = item.options || [];
    if (options.length !== 4) errors.push('multiple choice needs exactly 4 options');
    if (new Set(options.map(norm)).size !== options.length) errors.push('options must all be different');
    if (item.correctAnswer && !options.map(norm).includes(norm(item.correctAnswer))) errors.push('options must include correctAnswer');
  }

  if (type === 'wordFormation') {
    const base = (item.baseWord || '').trim();
    if (!base) errors.push('word formation needs baseWord');
    else {
      if (base !== base.toUpperCase()) warnings.push('baseWord should be in capitals');
      if (answers.some((a) => norm(a) === norm(base))) errors.push('the answer cannot be the unchanged base word');
    }
  }

  if (type === 'keyWordTransformation') {
    const key = norm(item.baseWord);
    if (!key) errors.push('key word transformation needs the key word (baseWord)');
    if (!item.leadInSentence || !item.leadInSentence.trim()) errors.push('key word transformation needs leadInSentence');
    else if (key && new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(norm(item.leadInSentence))) warnings.push('the key word should not be in the lead-in sentence');
    answers.forEach((a) => {
      const n = words(a);
      if (n < 2 || n > 6) errors.push(`answer "${a}" must be 2 to 6 words`);
      if (key && !` ${norm(a)} `.includes(` ${key} `)) errors.push(`answer "${a}" must use the key word`);
    });
  }

  return { ok: errors.length === 0, errors, warnings };
}
