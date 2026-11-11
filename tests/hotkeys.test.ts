import { describe, expect, it } from 'vitest';
import { HOTKEY_HELP, hotkeyAction } from '../utils/hotkeys';

describe('hotkeyAction (package T2)', () => {
  it('maps the presenting keys', () => {
    expect(hotkeyAction({ key: ' ' })).toBe('primary');
    expect(hotkeyAction({ key: 'Enter', targetTag: 'body' })).toBe('primary');
    expect(hotkeyAction({ key: 'PageDown' })).toBe('primary');
    expect(hotkeyAction({ key: 'PageUp' })).toBe('undo-reveal');
    expect(hotkeyAction({ key: 'p' })).toBe('pause');
    expect(hotkeyAction({ key: 'P' })).toBe('pause');
    expect(hotkeyAction({ key: 's' })).toBe('swap');
    expect(hotkeyAction({ key: 'r' })).toBe('reveal-now');
    expect(hotkeyAction({ key: 'z' })).toBe('undo-reveal');
    expect(hotkeyAction({ key: 'l' })).toBe('read');
    expect(hotkeyAction({ key: 'm' })).toBe('mute');
    expect(hotkeyAction({ key: 'q' })).toBe('room');
    expect(hotkeyAction({ key: 'f' })).toBe('fullscreen');
    expect(hotkeyAction({ key: '?' })).toBe('help');
    expect(hotkeyAction({ key: 'x' })).toBeNull();
  });

  it('never takes keys while someone types', () => {
    for (const targetTag of ['INPUT', 'textarea', 'SELECT']) {
      expect(hotkeyAction({ key: 'p', targetTag })).toBeNull();
      expect(hotkeyAction({ key: ' ', targetTag })).toBeNull();
    }
    expect(hotkeyAction({ key: 'p', targetEditable: true })).toBeNull();
  });

  it('leaves Space and Enter to a focused button, and ignores browser shortcuts', () => {
    expect(hotkeyAction({ key: ' ', targetTag: 'BUTTON' })).toBeNull();
    expect(hotkeyAction({ key: 'Enter', targetTag: 'A' })).toBeNull();
    expect(hotkeyAction({ key: 'PageDown', targetTag: 'BUTTON' })).toBe('primary');
    expect(hotkeyAction({ key: 'r', ctrlKey: true })).toBeNull();
    expect(hotkeyAction({ key: 'f', metaKey: true })).toBeNull();
  });

  it('lists every shortcut in the help', () => {
    expect(HOTKEY_HELP.length).toBeGreaterThanOrEqual(10);
  });
});
