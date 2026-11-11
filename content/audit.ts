// Bank audit (package L2): checks that look across items, which validateItem cannot do alone,
// and the coverage grid (how many items each question type has per level and topic).
import type { QuestionType } from '../types';
import { LEVELS } from './schema';

export interface AuditItem {
  type: QuestionType;
  level: string;
  topic: string;
  text: string;
  correctAnswer?: string;
  acceptedAnswers?: string[];
  options?: string[];
  baseWord?: string;
  leadInSentence?: string;
}

export interface AuditProblem {
  type: QuestionType;
  text: string;
  problem: string;
}

const norm = (s: string | undefined) => (s || '').replace(/[’‘`]/g, "'").replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

/** Edit distance between two strings (letters inserted, removed or changed). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 1 for the same text, 0 for nothing in common (after normalising). */
export function similarity(a: string, b: string): number {
  const x = norm(a);
  const y = norm(b);
  const longest = Math.max(x.length, y.length);
  return longest === 0 ? 1 : 1 - levenshtein(x, y) / longest;
}

export const NEAR_DUPLICATE = 0.9;

/** The full text of an item, so two items with the same frame but different gaps are not duplicates. */
const fullText = (i: AuditItem) => `${i.leadInSentence || ''} ${i.text} ${i.correctAnswer || ''}`;

export function auditBank(items: AuditItem[]): AuditProblem[] {
  const problems: AuditProblem[] = [];
  const add = (i: AuditItem, problem: string) => problems.push({ type: i.type, text: i.text, problem });

  // Near-duplicates within a question type.
  const byType = new Map<QuestionType, AuditItem[]>();
  items.forEach((i) => byType.set(i.type, [...(byType.get(i.type) || []), i]));
  byType.forEach((list) => {
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        if (similarity(fullText(list[a]), fullText(list[b])) > NEAR_DUPLICATE) add(list[b], `near-duplicate of "${list[a].text}"`);
      }
    }
  });

  items.forEach((i) => {
    if (i.type === 'multipleChoice') {
      const accepted = new Set([i.correctAnswer, ...(i.acceptedAnswers || [])].map(norm).filter(Boolean));
      const wrong = (i.options || []).filter((o) => norm(o) !== norm(i.correctAnswer));
      const alsoRight = wrong.filter((o) => accepted.has(norm(o)));
      if (alsoRight.length) add(i, `a distractor is also an accepted answer: ${alsoRight.join(', ')}`);
    }
    if (i.type === 'wordFormation' && i.baseWord && i.correctAnswer) {
      const base = norm(i.baseWord);
      const answer = norm(i.correctAnswer);
      // The base word must not be a derived form of the answer (HAPPINESS -> happy is backwards).
      const derived = /(ness|ment|ity|tion|sion|ance|ence|ful|less|ly|ous|ive|able|ible|ist|ism|ship|hood)$/.test(base);
      if (derived && answer.length < base.length && base.startsWith(answer.replace(/[ye]$/, '').slice(0, Math.max(3, answer.length - 1)))) {
        add(i, `the answer "${i.correctAnswer}" looks like the root of "${i.baseWord}", the wrong way round`);
      }
    }
  });
  return problems;
}

export interface CoverageCell {
  type: QuestionType;
  level: string;
  topic: string;
  count: number;
}

/** How many items each type has per level and topic, for every topic a teacher can choose. */
export function coverageGrid(items: AuditItem[], topics: string[], types: QuestionType[]): CoverageCell[] {
  const cells: CoverageCell[] = [];
  const key = (t: string) => t.trim().toLowerCase();
  types.forEach((type) =>
    LEVELS.forEach((level) =>
      topics.forEach((topic) => {
        const count = items.filter((i) => i.type === type && i.level === level && key(i.topic) === key(topic)).length;
        cells.push({ type, level, topic, count });
      }),
    ),
  );
  return cells;
}
