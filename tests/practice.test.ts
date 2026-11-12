import { describe, expect, it } from 'vitest';
import { isPracticeAnswerRight, practiceMode } from '../game/practice';
import type { GeneratedSentence } from '../types';

const item = (over: Partial<GeneratedSentence>): GeneratedSentence => ({ text: 'x', isCorrect: true, correction: 'x', explanation: '', ...over }) as GeneratedSentence;

describe('Practice these (L6)', () => {
  it('knows how each type is answered', () => {
    expect(practiceMode(item({}))).toBe('validOrFlawed');
    expect(practiceMode(item({ questionType: 'spotError' }))).toBe('choice');
    expect(practiceMode(item({ questionType: 'wordOrder' }))).toBe('typed');
  });

  it('checks Valid or flawed', () => {
    expect(isPracticeAnswerRight(item({ isCorrect: false }), 'incorrect')).toBe(true);
    expect(isPracticeAnswerRight(item({ isCorrect: false }), 'correct')).toBe(false);
  });

  it('checks a choice and a typed answer, forgiving case, spaces and the final mark', () => {
    expect(isPracticeAnswerRight(item({ questionType: 'multipleChoice', correctAnswer: 'had' }), ' Had ')).toBe(true);
    expect(isPracticeAnswerRight(item({ questionType: 'openCloze', correctAnswer: 'since', acceptedAnswers: ['since', 'from'] }), 'from')).toBe(true);
    expect(isPracticeAnswerRight(item({ questionType: 'wordOrder', correctAnswer: 'we have never been to Paris' }), 'We have never been to Paris.')).toBe(true);
    expect(isPracticeAnswerRight(item({ questionType: 'openCloze', correctAnswer: 'since' }), '')).toBe(false);
  });
});
