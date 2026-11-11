import { describe, expect, it } from 'vitest';
import { MAX_NAME_LENGTH, cleanName, generateFriendlyName, isBlockedName, makeUnique, safePlayerName } from '../utils/nameFilter';

describe('cleanName', () => {
  it('trims, collapses spaces and caps the length', () => {
    expect(cleanName('   Ana    Maria  ')).toBe('Ana Maria');
    expect(Array.from(cleanName('x'.repeat(40)))).toHaveLength(MAX_NAME_LENGTH);
    expect(cleanName(42)).toBe('');
  });

  it('drops control characters, invisible characters and flags', () => {
    expect(cleanName('Ana\u0000​‮')).toBe('Ana');
    expect(cleanName('Bo 🇧🇷')).toBe('Bo');
    expect(cleanName('Caio 🦊')).toBe('Caio 🦊');
  });
});

describe('isBlockedName', () => {
  it('blocks rude words, also with look-alike letters or stretched out', () => {
    for (const name of ['fuck', 'Sh1t head', 'B!TCH', 'fuuuuck', 'big ass', 'SEXY Sam', 'Hitler']) {
      expect(isBlockedName(name), name).toBe(true);
    }
  });

  it('lets ordinary names through, even when they hide a short word', () => {
    for (const name of ['Cassandra', 'Essex Ed', 'Grape', 'Dieter', 'Hello Kitty', 'Fukuda', 'Ana Maria', 'Sam Smith']) {
      expect(isBlockedName(name), name).toBe(false);
    }
  });
});

describe('unique and friendly names', () => {
  it('adds a number to a name already at the table', () => {
    expect(makeUnique('Ana', ['ana'])).toBe('Ana 2');
    expect(makeUnique('Ana', ['Ana', 'Ana 2'])).toBe('Ana 3');
    expect(makeUnique('Bo', ['Ana'])).toBe('Bo');
    const long = 'x'.repeat(MAX_NAME_LENGTH);
    expect(Array.from(makeUnique(long, [long])).length).toBeLessThanOrEqual(MAX_NAME_LENGTH);
  });

  it('makes friendly names nobody has', () => {
    const name = generateFriendlyName(['Lucky Fox'], () => 0);
    expect(name).not.toBe('Lucky Fox');
    expect(name).toMatch(/^\w+ \w+( \d+)?$/);
  });

  it('replaces a blocked or empty name with a friendly one', () => {
    expect(safePlayerName('fuck', [], () => 0)).toBe('Lucky Fox');
    expect(safePlayerName('   ', [], () => 0)).toBe('Lucky Fox');
    expect(safePlayerName('Ana', ['Ana'])).toBe('Ana 2');
  });
});
