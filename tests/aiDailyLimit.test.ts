import { describe, expect, it } from 'vitest';
import {
  AI_DAILY_LIMIT_STORAGE_KEY,
  getAiCallKind,
  localDay,
  readAiDailyUsage,
  tryUseAiCall,
} from '../utils/aiDailyLimit';

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.has(k) ? this.data.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

const monday = new Date(2026, 10, 9, 9, 0);
const mondayLate = new Date(2026, 10, 9, 23, 59);
const tuesday = new Date(2026, 10, 10, 0, 1);
const limits = { sentence: 2, other: 3 };

describe('daily AI limit per device', () => {
  it('names the local calendar day', () => {
    expect(localDay(monday)).toBe('2026-11-09');
  });

  it('allows calls up to the limit, then refuses until the next day', () => {
    const store = new MemoryStorage();
    expect(tryUseAiCall(store, 'sentence', monday, limits)).toBe(true);
    expect(tryUseAiCall(store, 'sentence', monday, limits)).toBe(true);
    expect(tryUseAiCall(store, 'sentence', mondayLate, limits)).toBe(false);
    expect(tryUseAiCall(store, 'sentence', tuesday, limits)).toBe(true);
  });

  it('counts sentences and other calls separately', () => {
    const store = new MemoryStorage();
    tryUseAiCall(store, 'sentence', monday, limits);
    tryUseAiCall(store, 'sentence', monday, limits);
    expect(tryUseAiCall(store, 'other', monday, limits)).toBe(true);
    expect(readAiDailyUsage(store, monday)).toEqual({ day: '2026-11-09', sentence: 2, other: 1 });
  });

  it('only sentence writing counts as a sentence', () => {
    expect(getAiCallKind('generateSentence')).toBe('sentence');
    expect(getAiCallKind('verifyCorrection')).toBe('other');
    expect(getAiCallKind('generateSpeech')).toBe('other');
  });

  it('starts again from a damaged or old record', () => {
    const store = new MemoryStorage();
    store.setItem(AI_DAILY_LIMIT_STORAGE_KEY, '{not json');
    expect(readAiDailyUsage(store, monday)).toEqual({ day: '2026-11-09', sentence: 0, other: 0 });
    store.setItem(AI_DAILY_LIMIT_STORAGE_KEY, JSON.stringify({ day: '2026-11-08', sentence: 99, other: 99 }));
    expect(readAiDailyUsage(store, monday).sentence).toBe(0);
    store.setItem(AI_DAILY_LIMIT_STORAGE_KEY, JSON.stringify({ day: '2026-11-09', sentence: -4, other: 'x' }));
    expect(readAiDailyUsage(store, monday)).toEqual({ day: '2026-11-09', sentence: 0, other: 0 });
  });

  it('never blocks the lesson when the browser cannot store anything', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    for (let i = 0; i < 5; i++) expect(tryUseAiCall(broken, 'sentence', monday, limits)).toBe(true);
    expect(tryUseAiCall(null, 'sentence', monday, limits)).toBe(true);
  });
});
