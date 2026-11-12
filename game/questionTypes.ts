// Package L8: how each question type is answered, so new types reuse the existing machinery.
//   Pick one option:  multipleChoice, spotError (the options are four parts of the sentence).
//   Type an answer:   openCloze, wordFormation, keyWordTransformation, wordOrder (tiles typed
//                     into one answer string).
import type { QuestionType } from '../types';

/** Every type except Valid or flawed has one right answer (a "gap" type). */
export function isGapType(t: QuestionType | undefined | null): boolean {
  return Boolean(t) && t !== 'binary';
}

/** Answered by picking one of the options (stored in `selectedOption`). */
export function isOptionType(t: QuestionType | undefined | null): boolean {
  return t === 'multipleChoice' || t === 'spotError';
}

/** Answered with text (stored in `clozeAnswer`). */
export function isTypedAnswerType(t: QuestionType | undefined | null): boolean {
  return t === 'openCloze' || t === 'wordFormation' || t === 'keyWordTransformation' || t === 'wordOrder';
}

/** Answered with one word or phrase checked against the accepted answers (no marks). */
export function isWordAnswerType(t: QuestionType | undefined | null): boolean {
  return t === 'openCloze' || t === 'wordFormation' || t === 'wordOrder';
}

/** Plain names for each type, the same on the projector, the phones and the report. */
export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  binary: 'Valid or flawed',
  multipleChoice: 'Multiple choice',
  openCloze: 'Open cloze',
  wordFormation: 'Word formation',
  keyWordTransformation: 'Key word transformation',
  spotError: 'Spot the error',
  wordOrder: 'Word order',
};

export function questionTypeLabel(t: QuestionType | string | undefined | null): string {
  return QUESTION_TYPE_LABEL[(t || 'binary') as QuestionType] || QUESTION_TYPE_LABEL.binary;
}
