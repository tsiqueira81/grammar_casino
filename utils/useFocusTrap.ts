// Package S8: a window keeps the keyboard inside it. When it opens, focus moves onto it; Tab and
// Shift+Tab go round its own controls; when it closes, focus goes back where it was.
import { useEffect, type RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** The controls Tab can reach inside `root`, in order. */
export function focusableIn(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('inert') && el.getAttribute('aria-hidden') !== 'true' && (el.offsetParent !== null || el.getClientRects().length > 0),
  );
}

/** Where Tab goes next: round from the last control to the first, and back with Shift. */
export function nextFocus(items: HTMLElement[], current: Element | null, backwards: boolean): HTMLElement | null {
  if (items.length === 0) return null;
  const i = current ? items.indexOf(current as HTMLElement) : -1;
  if (i === -1) return backwards ? items[items.length - 1] : items[0];
  if (backwards) return i === 0 ? items[items.length - 1] : null;
  return i === items.length - 1 ? items[0] : null;
}

/** Open windows, newest last: only the newest one keeps the keyboard. */
const openTraps: HTMLElement[] = [];

export function useFocusTrap(ref: RefObject<HTMLElement | null>, active = true): void {
  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root || typeof document === 'undefined') return;
    const before = document.activeElement as HTMLElement | null;
    openTraps.push(root);
    // Move in, unless something inside already has focus (an autofocus field). The window itself
    // takes focus, not its first field, so a phone keyboard never pops up on its own; Tab then
    // goes to the first control.
    if (!root.contains(document.activeElement)) {
      if (!root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1');
      root.focus({ preventScroll: true });
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || openTraps[openTraps.length - 1] !== root) return;
      const inside = root.contains(document.activeElement);
      const target = nextFocus(focusableIn(root), inside ? document.activeElement : null, e.shiftKey);
      if (target) {
        e.preventDefault();
        target.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      const at = openTraps.lastIndexOf(root);
      if (at !== -1) openTraps.splice(at, 1);
      if (before && typeof before.focus === 'function' && document.contains(before)) before.focus({ preventScroll: true });
    };
  }, [ref, active]);
}
