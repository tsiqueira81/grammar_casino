// Keyboard shortcuts for presenting (package T2). A shortcut presses the same button the
// teacher would click: each such button carries data-hotkey="<action>", so a shortcut can
// never do something the screen does not offer at that moment.

export type HotkeyAction =
  | 'primary'
  | 'pause'
  | 'swap'
  | 'reveal-now'
  | 'undo-reveal'
  | 'read'
  | 'mute'
  | 'room'
  | 'fullscreen'
  | 'help'
  | 'debug-log'
  | 'timer'
  | 'add-time'
  | 'hide-bets';

/** The shortcut list, as shown in the help overlay. */
export const HOTKEY_HELP: { keys: string; action: string }[] = [
  { keys: 'Space, Enter or Page Down', action: 'Next step of the hand (reveal the answer, deal the next hand)' },
  { keys: 'P', action: 'Pause or resume the hand' },
  { keys: 'S', action: 'Swap this sentence' },
  { keys: 'R', action: 'Reveal now' },
  { keys: 'Z or Page Up', action: 'Undo reveal' },
  { keys: 'T', action: 'Start or resume the timer' },
  { keys: '+', action: 'Add time to the running timer' },
  { keys: 'H', action: 'Hide or show the bets on the projector (live room)' },
  { keys: 'L', action: 'Read the sentence aloud' },
  { keys: 'M', action: 'Sound on or off' },
  { keys: 'Q', action: 'Show the room and its join code' },
  { keys: 'F', action: 'Full screen (turns on projector mode)' },
  { keys: '?', action: 'Show or hide this list' },
  { keys: 'Shift+L', action: 'Show the debug log (to report a problem)' },
  { keys: 'Esc', action: 'Close the top window' },
];

export interface HotkeyEventLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  /** Tag name of the focused element (upper or lower case). */
  targetTag?: string;
  targetEditable?: boolean;
}

const LETTERS: Record<string, HotkeyAction> = {
  p: 'pause',
  s: 'swap',
  r: 'reveal-now',
  z: 'undo-reveal',
  l: 'read',
  m: 'mute',
  q: 'room',
  f: 'fullscreen',
  t: 'timer',
  '+': 'add-time',
  h: 'hide-bets',
};

/** Which action a key press asks for, or null when it should be left alone. */
export function hotkeyAction(e: HotkeyEventLike): HotkeyAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const tag = (e.targetTag || '').toUpperCase();
  // Never steal keys from typing.
  if (e.targetEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return null;
  if (e.key === '?') return 'help';
  if (e.shiftKey && e.key.toLowerCase() === 'l') return 'debug-log';
  if (e.key === 'PageDown') return 'primary';
  if (e.key === 'PageUp') return 'undo-reveal';
  if (e.key === ' ' || e.key === 'Enter') {
    // A focused button or link already answers Space and Enter itself.
    if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY') return null;
    return 'primary';
  }
  if (e.key.length === 1) return LETTERS[e.key.toLowerCase()] ?? null;
  return null;
}

/**
 * The button for an action on screen now. When a window is open, only its own buttons count,
 * so a shortcut never reaches behind it.
 */
export function findHotkeyButton(doc: Document, action: HotkeyAction): HTMLElement | null {
  const dialogs = Array.from(doc.querySelectorAll<HTMLElement>('[aria-modal="true"], [role="dialog"]'));
  const scope: ParentNode = dialogs.length ? dialogs[dialogs.length - 1] : doc;
  const candidates = Array.from(scope.querySelectorAll<HTMLElement>(`[data-hotkey="${action}"]`));
  return candidates.find((el) => !(el as HTMLButtonElement).disabled && el.getAttribute('aria-disabled') !== 'true' && el.offsetParent !== null) ?? null;
}
