import { describe, expect, it } from 'vitest';
import { auditBank, coverageGrid, levenshtein, similarity } from '../content/audit';
import { bankAuditItems } from '../content/bankItems';

describe('bank audit (package L2)', () => {
  it('finds no problems in the built-in bank', () => {
    expect(auditBank(bankAuditItems())).toEqual([]);
  });

  it('measures how alike two texts are', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(similarity('She has lived here.', 'she HAS lived here')).toBe(1);
    expect(similarity('abc', 'xyz')).toBe(0);
  });

  it('catches near-duplicates, a distractor that is also right, and a backwards word formation', () => {
    const problems = auditBank([
      { type: 'binary', level: 'B1', topic: 'Tenses', text: 'She has lived in Lisbon since 2019.' },
      { type: 'binary', level: 'B1', topic: 'Tenses', text: 'She has lived in Lisbon since 2018.' },
      { type: 'multipleChoice', level: 'B1', topic: 'Tenses', text: 'I _____ here.', correctAnswer: 'live', acceptedAnswers: ['live', 'work'], options: ['live', 'work', 'lives', 'living'] },
      { type: 'wordFormation', level: 'A2', topic: 'Tenses', text: 'They were _____.', baseWord: 'HAPPINESS', correctAnswer: 'happy' },
      { type: 'wordFormation', level: 'A2', topic: 'Tenses', text: 'A strong _____.', baseWord: 'BELIEVE', correctAnswer: 'belief' },
    ]);
    expect(problems.map(p => p.problem)).toEqual([
      'near-duplicate of "She has lived in Lisbon since 2019."',
      'a distractor is also an accepted answer: work',
      'the answer "happy" looks like the root of "HAPPINESS", the wrong way round',
    ]);
  });

  it('counts items per type, level and topic', () => {
    const grid = coverageGrid(bankAuditItems(), ['Tenses'], ['binary']);
    expect(grid).toHaveLength(6);
    expect(grid.every(c => c.count >= 1)).toBe(true);
  });
});
