// Package L6: "Practice these" on the phone at game over. The hands a student missed come back as
// a short solo quiz, untimed, with no money and no room: answer, see if it was right, read the rule.
import type { GeneratedSentence, QuestionType } from '../types';
import { isOptionType } from './questionTypes';

const norm = (s: string | undefined) =>
  (s || '')
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** How a practice item is answered: two buttons, A to D, or typed. */
export function practiceMode(s: Pick<GeneratedSentence, 'questionType'>): 'validOrFlawed' | 'choice' | 'typed' {
  const t = (s.questionType || 'binary') as QuestionType;
  if (t === 'binary') return 'validOrFlawed';
  return isOptionType(t) ? 'choice' : 'typed';
}

/** Is this practice answer right? Valid-or-flawed takes 'correct' or 'incorrect'. */
export function isPracticeAnswerRight(s: GeneratedSentence, answer: string): boolean {
  const mode = practiceMode(s);
  if (mode === 'validOrFlawed') return (answer === 'correct') === Boolean(s.isCorrect);
  const given = norm(answer);
  if (!given) return false;
  if (mode === 'choice') return given === norm(s.correctAnswer);
  const accepted = [s.correctAnswer, ...(s.acceptedAnswers || [])].map(norm).filter(Boolean);
  const bare = given.replace(/[.!?]+$/, '');
  return accepted.some((a) => a === given || a.replace(/[.!?]+$/, '') === bare);
}
