import { describe, expect, it } from 'vitest';
import { createSafeStorage } from '../utils/safeStorage';

class MemoryStorage {
  data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  key() {
    return null;
  }
  getItem(k: string) {
    return this.data.has(k) ? this.data.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

const throwing = {
  getItem() {
    throw new Error('SecurityError');
  },
  setItem() {
    throw new Error('QuotaExceededError');
  },
  removeItem() {
    throw new Error('SecurityError');
  },
} as unknown as Storage;

describe('safe browser storage', () => {
  it('passes straight through to working storage', () => {
    const real = new MemoryStorage();
    const s = createSafeStorage(() => real as unknown as Storage);
    expect(s.setItem('a', '1')).toBe(true);
    expect(real.getItem('a')).toBe('1');
    expect(s.getItem('a')).toBe('1');
    s.removeItem('a');
    expect(real.getItem('a')).toBeNull();
  });

  it('keeps values in memory for the tab when the browser refuses, and never throws', () => {
    const s = createSafeStorage(() => throwing);
    expect(s.setItem('theme', 'dark')).toBe(false);
    expect(s.getItem('theme')).toBe('dark');
    expect(() => s.removeItem('theme')).not.toThrow();
    expect(s.getItem('theme')).toBeNull();
  });

  it('copes with storage that cannot even be reached', () => {
    const s = createSafeStorage(() => {
      throw new Error('SecurityError');
    });
    expect(s.getItem('x')).toBeNull();
    expect(s.setItem('x', 'y')).toBe(false);
    expect(s.getItem('x')).toBe('y');
  });

  it('a value saved in memory gives way once the browser stores it again', () => {
    const real = new MemoryStorage();
    let broken = true;
    const s = createSafeStorage(() => (broken ? throwing : (real as unknown as Storage)));
    s.setItem('k', 'memory');
    broken = false;
    expect(s.setItem('k', 'disk')).toBe(true);
    broken = true;
    expect(s.getItem('k')).toBeNull();
  });
});
