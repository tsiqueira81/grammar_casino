/**
 * Settings for every field where a student types a grammar answer (package S2).
 * Phones otherwise capitalise "i'm" to "I'm" or "correct" a deliberate word form,
 * which silently changes the answer being marked.
 */
export const ANSWER_INPUT_PROPS = {
  autoCapitalize: 'none',
  autoCorrect: 'off',
  autoComplete: 'off',
  spellCheck: false,
  inputMode: 'text',
  enterKeyHint: 'done',
} as const;

/** Keeps a focused field in the middle of the screen once the phone keyboard has opened. */
export function keepFieldInView(el: HTMLElement | null) {
  if (!el) return;
  // The keyboard animates in; wait for the viewport to settle first.
  setTimeout(() => {
    try {
      const calm =
        document.documentElement.classList.contains('gc-calm') ||
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
    } catch {
      el.scrollIntoView();
    }
  }, 300);
}
