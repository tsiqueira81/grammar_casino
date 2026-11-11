/**
 * Test-only content for the browser tests (package F3).
 *
 * When the page is opened with `?e2e=1` on the dev server, sentences come from
 * this fixed list and every AI call is skipped, so a test knows every answer.
 * In a production build `import.meta.env.DEV` is false and this never applies.
 */
import type { GeneratedSentence, QuestionType } from '../types';

export function isE2eMode(): boolean {
  try {
    const env = (import.meta as any).env;
    if (!env?.DEV) return false;
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('e2e') === '1';
  } catch {
    return false;
  }
}

/** Six known items: one per question type, plus a flawed binary sentence. */
export const E2E_SENTENCES = {
  binaryValid: {
    text: 'She has lived in Lisbon since 2019.',
    isCorrect: true,
    correction: '',
    explanation: 'Present perfect with "since" for a situation that continues now.',
    grammarPhrase: 'has lived',
    questionType: 'binary',
  },
  binaryFlawed: {
    text: 'He have finished his homework already.',
    isCorrect: false,
    correction: 'He has finished his homework already.',
    explanation: 'Third person singular takes "has", not "have".',
    grammarPhrase: 'have finished',
    errorPhrase: 'have finished',
    questionType: 'binary',
  },
  multipleChoice: {
    text: 'If I _____ more time, I would learn Japanese.',
    isCorrect: true,
    correction: 'had',
    correctAnswer: 'had',
    acceptedAnswers: ['had'],
    options: ['have', 'had', 'will have', 'would have'],
    explanation: 'Second conditional: if + past simple, would + base form.',
    grammarPhrase: 'had',
    questionType: 'multipleChoice',
  },
  openCloze: {
    text: 'She is interested _____ learning new languages.',
    isCorrect: true,
    correction: 'in',
    correctAnswer: 'in',
    acceptedAnswers: ['in'],
    explanation: '"Interested" is followed by "in".',
    grammarPhrase: 'interested in',
    questionType: 'openCloze',
  },
  wordFormation: {
    text: 'The concert was a huge _____ with the fans.',
    isCorrect: true,
    correction: 'success',
    correctAnswer: 'success',
    acceptedAnswers: ['success'],
    baseWord: 'succeed',
    explanation: 'A noun is needed after "a huge": succeed becomes success.',
    grammarPhrase: 'success',
    questionType: 'wordFormation',
  },
  keyWordTransformation: {
    leadInSentence: 'I started working here three years ago.',
    text: 'I _____ three years.',
    isCorrect: true,
    correction: 'have been working here for',
    correctAnswer: 'have been working here for',
    acceptedAnswers: ['have been working here for', 'have worked here for'],
    baseWord: 'for',
    mark1Parts: ['have been working', 'have worked'],
    mark2Parts: ['here for'],
    explanation: 'Present perfect (continuous) with "for" plus a period of time.',
    grammarPhrase: 'have been working here for',
    questionType: 'keyWordTransformation',
  },
  // Package L8: made from the flawed binary item by toSpotError, written out so tests know it.
  spotError: {
    text: 'He have finished his homework already.',
    isCorrect: true,
    correction: 'He has finished his homework already.',
    correctAnswer: 'have finished',
    acceptedAnswers: ['have finished'],
    options: ['He', 'have finished', 'his homework', 'already'],
    explanation: 'Third person singular takes "has", not "have".',
    grammarPhrase: 'have finished',
    errorPhrase: 'have finished',
    questionType: 'spotError',
  },
  wordOrder: {
    text: 'homework / she / her / finished / already / has',
    isCorrect: true,
    correction: 'She has already finished her homework.',
    correctAnswer: 'she has already finished her homework',
    acceptedAnswers: ['she has already finished her homework'],
    options: ['homework', 'she', 'her', 'finished', 'already', 'has'],
    explanation: '"Already" goes between "has" and the past participle.',
    grammarPhrase: 'has already finished',
    questionType: 'wordOrder',
  },
} satisfies Record<string, GeneratedSentence>;

/** The fixed item for a hand. Binary hands use the valid or flawed item the deck asked for. */
export function getE2eSentence(questionType: QuestionType | undefined, forceCorrect: boolean | null): GeneratedSentence {
  switch (questionType) {
    case 'multipleChoice':
      return { ...E2E_SENTENCES.multipleChoice };
    case 'openCloze':
      return { ...E2E_SENTENCES.openCloze };
    case 'wordFormation':
      return { ...E2E_SENTENCES.wordFormation };
    case 'keyWordTransformation':
      return { ...E2E_SENTENCES.keyWordTransformation };
    case 'spotError':
      return { ...E2E_SENTENCES.spotError };
    case 'wordOrder':
      return { ...E2E_SENTENCES.wordOrder };
    default:
      return forceCorrect === false ? { ...E2E_SENTENCES.binaryFlawed } : { ...E2E_SENTENCES.binaryValid };
  }
}
