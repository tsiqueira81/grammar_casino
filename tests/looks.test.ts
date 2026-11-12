import { describe, expect, it } from 'vitest';
import { THEMES } from '../constants';
import { CLASSIC_LOOK, STAGE_LOOKS, lookForTheme } from '../show/looks';
import { notesForBar } from '../utils/musicEngine';

describe('themes that change the room (package V8)', () => {
  it('gives every built-in theme its own look, and Custom the classic one', () => {
    const named = (THEMES as readonly string[]).filter((t) => !t.startsWith('Custom'));
    expect(named.length).toBe(7);
    for (const theme of named) expect(lookForTheme(theme)).not.toBe(CLASSIC_LOOK);
    expect(lookForTheme('Custom ✍️')).toBe(CLASSIC_LOOK);
    expect(lookForTheme(undefined)).toBe(CLASSIC_LOOK);
    expect(lookForTheme('Sci-Fi 🚀')).toBe(STAGE_LOOKS['Sci-Fi']);
  });

  it('moves the music to the theme key, but not the hi-hat', () => {
    const f = notesForBar(0, 'think');
    const up = notesForBar(0, 'think', 12);
    expect(up.length).toBe(f.length);
    up.forEach((n, i) => expect(n.hz).toBeCloseTo(n.instrument === 'hat' ? f[i].hz : f[i].hz * 2, 6));
  });
});
