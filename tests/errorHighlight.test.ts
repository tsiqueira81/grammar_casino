import { describe, it, expect } from 'vitest';
import { markErrorPhrase, diffWords } from '../utils/errorHighlight';
import { CURATED_SENTENCE_BANK } from '../services/fallbackSentences';

const marked = (segs: { text: string; mark: boolean }[] | null) => (segs || []).filter(s => s.mark).map(s => s.text);

describe('markErrorPhrase', () => {
  it('marks the phrase as whole words, ignoring case and curly apostrophes', () => {
    expect(marked(markErrorPhrase('He don’t like coffee.', "don't like"))).toEqual(['don’t like']);
    expect(marked(markErrorPhrase('The lead investigator remained utterly aware.', 'Utterly aware'))).toEqual(['utterly aware']);
  });

  it('marks each part of a split phrase', () => {
    expect(marked(markErrorPhrase('I have seen that movie two days ago.', 'have seen ... two days ago'))).toEqual([
      'have seen',
      'two days ago',
    ]);
  });

  it('returns null instead of guessing when the phrase is not in the sentence', () => {
    expect(markErrorPhrase('She works here.', 'worked')).toBeNull();
    expect(markErrorPhrase('She works here.', 'work')).toBeNull(); // no partial-word matches
    expect(markErrorPhrase('She works here.', '')).toBeNull();
  });

  it('keeps the full sentence text', () => {
    const text = 'Yesterday she buyed a brand new laptop.';
    expect((markErrorPhrase(text, 'buyed') || []).map(s => s.text).join('')).toBe(text);
  });

  it('finds the error phrase of every flawed item in the offline bank', () => {
    for (const e of CURATED_SENTENCE_BANK.filter(x => !x.isCorrect && x.errorPhrase)) {
      expect(markErrorPhrase(e.text, e.errorPhrase), e.text).not.toBeNull();
    }
  });
});

describe('diffWords', () => {
  it('marks the replaced words on both sides', () => {
    const d = diffWords('Yesterday she buyed a laptop.', 'Yesterday she bought a laptop.');
    expect(marked(d.original)).toEqual(['buyed']);
    expect(marked(d.corrected)).toEqual(['bought']);
  });

  it('marks an added word only on the corrected side', () => {
    const d = diffWords('She going home now.', 'She is going home now.');
    expect(marked(d.original)).toEqual([]);
    expect(marked(d.corrected)).toEqual(['is']);
  });

  it('groups neighbouring changed words into one highlight', () => {
    const d = diffWords('By then they waited for an hour.', 'By then they had been waiting for an hour.');
    expect(marked(d.original)).toEqual(['waited']);
    expect(marked(d.corrected)).toEqual(['had been waiting']);
  });

  it('keeps the full text on both sides', () => {
    const a = 'He don\'t like  coffee.';
    const b = 'He doesn\'t like coffee.';
    const d = diffWords(a, b);
    expect(d.original.map(s => s.text).join('')).toBe(a);
    expect(d.corrected.map(s => s.text).join('')).toBe(b);
  });
});
