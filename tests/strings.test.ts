import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { EN, t, wordCount } from '../strings/en';

describe('phone wording (package S3)', () => {
  it.each(Object.entries(EN))('%s is 12 words or fewer', (_key, message) => {
    expect(wordCount(message)).toBeLessThanOrEqual(12);
  });

  it('uses plain words, not casino jargon', () => {
    Object.values(EN).forEach((message) => {
      expect(message).not.toMatch(/\b(wager|bankroll|stake)\b/i);
    });
  });

  it('fills placeholders and leaves unknown ones visible', () => {
    expect(t('lock.highRollerMin', { amount: '$500' })).toBe('High Roller: you must bet at least $500 this hand.');
    expect(t('results.toPass', { amount: '$10' })).toBe('$10 more to pass {name}.');
  });

  it('keeps one dictionary only: English (decision D7)', () => {
    expect(readdirSync(join(__dirname, '..', 'strings'))).toEqual(['en.ts']);
  });
});
