import { describe, expect, it } from 'vitest';
import { sentenceStatus } from '../game/aiStatus';

describe('where the sentences come from (package T6)', () => {
  const ai = { hasKey: true, isOnline: true };

  it('says AI ready, or that the AI was busy for this hand', () => {
    expect(sentenceStatus(ai).label).toBe('AI ready');
    expect(sentenceStatus(ai, { source: 'ai' }).label).toBe('AI ready');
    expect(sentenceStatus(ai, { source: 'bank' }).label).toBe('AI busy, using the built-in deck');
  });

  it('says built-in deck without a key, and offline when offline', () => {
    expect(sentenceStatus({ hasKey: false, isOnline: true }).label).toBe('Built-in deck');
    expect(sentenceStatus({ hasKey: true, isOnline: false }, { source: 'bank' }).label).toBe('Offline: built-in deck');
  });

  it('names the teacher’s own sentences, and a broken key first', () => {
    expect(sentenceStatus(ai, { source: 'own' }).label).toBe('Your own sentences');
    expect(sentenceStatus({ ...ai, decryptionFailed: true }, { source: 'own' })).toMatchObject({ label: 'Re-enter the AI key', tone: 'warn' });
  });
});
