// Quality checks for the offline curated question banks.
// These run over every item, so a new or edited item that breaks an exam rule
// (or gives the answer away) fails the test suite instead of reaching a class.
import { describe, it, expect } from 'vitest';
import {
  getCuratedSentence,
  CURATED_SENTENCE_BANK,
  CURATED_CLOZE_BANK,
  CURATED_WORD_FORMATION_BANK,
  CURATED_KEY_WORD_TRANSFORMATION_BANK,
} from '../services/fallbackSentences';
import { evaluateKeyWordTransformationDeterministic } from '../services/geminiService';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const GAP = '_____';

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const label = (e: { level: string; text: string }) => `[${e.level}] ${e.text}`;

// Capitalised words in the middle of a flawed sentence that are missing from its
// correction. Proper nouns survive the correction, so anything left is a giveaway,
// such as "remained Utterly aware" (fixed to "acutely aware").
function strayCapitals(text: string, reference: string): string[] {
  const clean = (w: string) => w.replace(/[^A-Za-z'’-]/g, '');
  const refWords = new Set(reference.split(/\s+/).map(clean));
  return text
    .split(/(?<=[^.!?:"“]) +/) // words not following sentence punctuation
    .slice(1)
    .map(clean)
    .filter(w => /^[A-Z][a-z]/.test(w) && !refWords.has(w));
}

describe('Valid / Flawed bank', () => {
  it.each(CURATED_SENTENCE_BANK.map(e => [label(e), e] as const))('%s', (_l, e) => {
    expect(LEVELS).toContain(e.level);
    if (e.isCorrect) {
      expect(norm(e.correction)).toBe(norm(e.text));
    } else {
      expect(norm(e.correction)).not.toBe(norm(e.text));
      if (e.errorPhrase) {
        // "have seen ... two days ago" marks a split error: each part must appear in the sentence.
        for (const part of e.errorPhrase.split(/\s*(?:\.\.\.|…)\s*/).filter(Boolean)) {
          expect(e.text.toLowerCase()).toContain(part.toLowerCase());
        }
      }
      expect(strayCapitals(e.text, e.correction)).toEqual([]);
    }
  });
});

describe('Cloze bank (multiple choice and open cloze)', () => {
  it.each(CURATED_CLOZE_BANK.map(e => [label(e), e] as const))('%s', (_l, e) => {
    expect(LEVELS).toContain(e.level);
    expect(e.text).toContain(GAP);
    const options = e.options.map(norm);
    expect(new Set(options).size).toBe(options.length);
    expect(options).toContain(norm(e.correctAnswer));
    expect(e.acceptedAnswers.map(norm)).toContain(norm(e.correctAnswer));
  });
});

describe('Word formation bank', () => {
  it.each(CURATED_WORD_FORMATION_BANK.map(e => [label(e), e] as const))('%s', (_l, e) => {
    expect(LEVELS).toContain(e.level);
    expect(e.text).toContain(GAP);
    expect(e.baseWord).toBe(e.baseWord.toUpperCase());
    expect(norm(e.correctAnswer)).not.toBe(norm(e.baseWord)); // the word must change
    expect(e.acceptedAnswers.map(norm)).toContain(norm(e.correctAnswer));
    expect(norm(e.correction)).toContain(norm(e.correctAnswer));
  });
});

// Current app rule for every level. Update together with the UI, prompts and marker
// if word limits become level-dependent (C1 Advanced: 3–6, B2 First: 2–5).
const KWT_MIN_WORDS = 2;
const KWT_MAX_WORDS = 6;

describe('Key word transformation bank', () => {
  it.each(CURATED_KEY_WORD_TRANSFORMATION_BANK.map(e => [label(e), e] as const))('%s', (_l, e) => {
    expect(LEVELS).toContain(e.level);
    expect(e.text).toContain(GAP);
    const key = e.baseWord.toUpperCase();
    const keyRe = new RegExp(`(^|[^a-z])${key.toLowerCase()}([^a-z]|$)`, 'i');

    // The first sentence must not already contain the key word, or there is nothing to transform.
    expect(keyRe.test(e.leadInSentence), `key word "${key}" appears in the first sentence`).toBe(false);

    for (const answer of [e.correctAnswer, ...e.acceptedAnswers]) {
      expect(keyRe.test(answer), `"${answer}" must contain ${key}`).toBe(true);
      const n = wordCount(answer);
      expect(n, `"${answer}" has ${n} words`).toBeGreaterThanOrEqual(KWT_MIN_WORDS);
      expect(n, `"${answer}" has ${n} words`).toBeLessThanOrEqual(KWT_MAX_WORDS);
    }

    // Filling the gap with the answer must give the model sentence.
    expect(norm(e.text.replace(GAP, e.correctAnswer))).toBe(norm(e.correction));

    // The offline marker must award full marks to every accepted answer.
    for (const answer of [e.correctAnswer, ...e.acceptedAnswers]) {
      const result = evaluateKeyWordTransformationDeterministic(
        answer, e.correctAnswer, e.acceptedAnswers, e.baseWord, e.mark1Parts, e.mark2Parts
      );
      expect(result.marks, `"${answer}" should score 2 marks`).toBe(2);
    }
  });
});

describe('Offline picker when the bank runs dry', () => {
  it('keeps the chosen level and switches topic', () => {
    const playedC1Tenses = CURATED_SENTENCE_BANK.filter(e => e.level === 'C1' && e.topic === 'Tenses').map(e => e.text);
    expect(playedC1Tenses.length).toBeGreaterThan(0);
    for (let i = 0; i < 50; i++) {
      const s = getCuratedSentence(
        { topic: 'Tenses', level: 'C1', theme: 'Business', challengeFormat: 'binary' },
        playedC1Tenses,
        i % 2 === 0
      );
      const entry = CURATED_SENTENCE_BANK.find(e => e.text === s.text)!;
      expect(entry.level).toBe('C1');
      expect(entry.topic).not.toBe('Tenses');
      expect(s.bankTopic).toBe(entry.topic);
    }
  });

  it('does not flag a topic switch when the topic still has items', () => {
    for (let i = 0; i < 20; i++) {
      const s = getCuratedSentence({ topic: 'Collocations', level: 'C1', theme: 'Business', challengeFormat: 'binary' });
      const entry = CURATED_SENTENCE_BANK.find(e => e.text === s.text)!;
      expect(entry.level).toBe('C1');
      expect(entry.topic).toBe('Collocations');
      expect(s.bankTopic).toBeUndefined();
    }
  });

  it.each(['multipleChoice', 'openCloze', 'wordFormation', 'keyWordTransformation'] as const)(
    'keeps the level for %s',
    format => {
      for (let i = 0; i < 30; i++) {
        const s = getCuratedSentence({ topic: 'Tenses', level: 'C1', theme: 'Business', challengeFormat: format });
        const banks = [...CURATED_CLOZE_BANK, ...CURATED_WORD_FORMATION_BANK, ...CURATED_KEY_WORD_TRANSFORMATION_BANK];
        expect(banks.find(e => e.text === s.text)!.level).toBe('C1');
      }
    }
  );
});
