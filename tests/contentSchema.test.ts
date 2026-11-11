import { describe, expect, it } from 'vitest';
import { validateItem } from '../content/schema';
import {
  CURATED_SENTENCE_BANK,
  CURATED_CLOZE_BANK,
  CURATED_WORD_FORMATION_BANK,
  CURATED_KEY_WORD_TRANSFORMATION_BANK,
} from '../services/fallbackSentences';

const label = (e: { level?: string; text?: string }) => `${e.level} ${String(e.text).slice(0, 50)}`;

describe('content schema (package L1): every built-in item passes, with no warnings', () => {
  it.each(CURATED_SENTENCE_BANK.map((e) => [label(e), e] as const))('valid or flawed: %s', (_l, e) => {
    expect(validateItem(e, 'binary')).toEqual({ ok: true, errors: [], warnings: [] });
  });
  it.each(CURATED_CLOZE_BANK.map((e) => [label(e), e] as const))('multiple choice and open cloze: %s', (_l, e) => {
    expect(validateItem(e, 'multipleChoice')).toEqual({ ok: true, errors: [], warnings: [] });
    expect(validateItem({ ...e, options: undefined }, 'openCloze')).toEqual({ ok: true, errors: [], warnings: [] });
  });
  it.each(CURATED_WORD_FORMATION_BANK.map((e) => [label(e), e] as const))('word formation: %s', (_l, e) => {
    expect(validateItem(e, 'wordFormation')).toEqual({ ok: true, errors: [], warnings: [] });
  });
  it.each(CURATED_KEY_WORD_TRANSFORMATION_BANK.map((e) => [label(e), e] as const))('key word: %s', (_l, e) => {
    expect(validateItem(e, 'keyWordTransformation')).toEqual({ ok: true, errors: [], warnings: [] });
  });
});

describe('content schema catches broken items', () => {
  const mc = { text: 'She _____ here since May.', correctAnswer: 'has lived', options: ['has lived', 'lives', 'lived', 'is living'], explanation: 'Since needs the present perfect.' };
  it('accepts a good multiple-choice item', () => {
    expect(validateItem(mc, 'multipleChoice').ok).toBe(true);
  });
  it('refuses missing gap, wrong option count, duplicate options and a missing answer', () => {
    expect(validateItem({ ...mc, text: 'She has lived here since May.' }, 'multipleChoice').errors).toContain('text needs the gap _____');
    expect(validateItem({ ...mc, options: ['has lived', 'lives', 'lived'] }, 'multipleChoice').errors).toContain('multiple choice needs exactly 4 options');
    expect(validateItem({ ...mc, options: ['has lived', 'Has lived', 'lived', 'x'] }, 'multipleChoice').errors).toContain('options must all be different');
    expect(validateItem({ ...mc, correctAnswer: 'had lived' }, 'multipleChoice').errors).toContain('options must include correctAnswer');
  });
  it('refuses a flawed sentence whose correction is unchanged, and an unknown level', () => {
    const r = validateItem({ text: 'He go home.', isCorrect: false, correction: 'He go home', explanation: 'x y', level: 'Z1' }, 'binary');
    expect(r.errors).toEqual(['unknown level "Z1"', 'a flawed sentence needs a different correction']);
  });
  it('refuses a word-formation answer that is the base word', () => {
    expect(validateItem({ text: 'An _____.', baseWord: 'ART', correctAnswer: 'art', explanation: 'x' }, 'wordFormation').errors).toContain('the answer cannot be the unchanged base word');
  });
  it('refuses key word answers without the key word or with too many words', () => {
    const kwt = { leadInSentence: 'The library is next to the post office.', baseWord: 'BESIDE', text: 'The library _____ the post office.', explanation: 'x' };
    expect(validateItem({ ...kwt, correctAnswer: 'is beside' }, 'keyWordTransformation').ok).toBe(true);
    expect(validateItem({ ...kwt, correctAnswer: 'is next to' }, 'keyWordTransformation').errors).toContain('answer "is next to" must use the key word');
    expect(validateItem({ ...kwt, correctAnswer: 'is located right over there beside it' }, 'keyWordTransformation').errors).toContain('answer "is located right over there beside it" must be 2 to 6 words');
  });
  it('only warns about a long explanation', () => {
    const r = validateItem({ ...mc, explanation: Array(41).fill('word').join(' ') }, 'multipleChoice');
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual(['explanation is over 40 words']);
  });
});
