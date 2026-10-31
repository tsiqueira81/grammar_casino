// Helpers for showing the mistake inside a flawed sentence on the reveal screen.

export interface TextSegment {
  text: string;
  /** true when this part of the sentence should be highlighted */
  mark: boolean;
}

// Apostrophes and quotes come in straight and curly forms; compare them as one.
const canonical = (s: string) => s.replace(/[’‘`]/g, "'").replace(/[“”]/g, '"').toLowerCase();

/**
 * Finds the error phrase inside the sentence and returns it as marked segments.
 * Accepts split phrases written with "..." (e.g. "have seen ... two days ago").
 * Returns null when any part cannot be found, so the caller can fall back
 * instead of underlining the wrong words.
 */
export function markErrorPhrase(text: string, errorPhrase?: string): TextSegment[] | null {
  const phrase = (errorPhrase || '').trim();
  if (!text || !phrase) return null;
  const parts = phrase
    .split(/\s*(?:\.\.\.|…)\s*/)
    .map(p => p.trim().replace(/^[.,;:!?"“”]+|[.,;:!?"“”]+$/g, ''))
    .filter(Boolean);
  if (parts.length === 0) return null;

  const haystack = canonical(text);
  const ranges: [number, number][] = [];
  let from = 0;
  for (const part of parts) {
    const idx = findWholeWords(haystack, canonical(part), from);
    if (idx < 0) return null;
    ranges.push([idx, idx + part.length]);
    from = idx + part.length;
  }
  return toSegments(text, ranges);
}

function findWholeWords(haystack: string, needle: string, from: number): number {
  let idx = haystack.indexOf(needle, from);
  while (idx >= 0) {
    const before = idx === 0 ? '' : haystack[idx - 1];
    const after = haystack[idx + needle.length] || '';
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return idx;
    idx = haystack.indexOf(needle, idx + 1);
  }
  return -1;
}

function toSegments(text: string, ranges: [number, number][]): TextSegment[] {
  const segments: TextSegment[] = [];
  let pos = 0;
  for (const [start, end] of ranges) {
    if (start > pos) segments.push({ text: text.slice(pos, start), mark: false });
    segments.push({ text: text.slice(start, end), mark: true });
    pos = end;
  }
  if (pos < text.length) segments.push({ text: text.slice(pos), mark: false });
  return segments;
}

/**
 * Word-level comparison of the flawed sentence and its correction.
 * `original` marks words that were removed or replaced, `corrected` marks words
 * that were added or replaced. Used to highlight the fix, and as a fallback
 * when the error phrase cannot be found in the sentence.
 */
export function diffWords(originalText: string, correctedText: string): { original: TextSegment[]; corrected: TextSegment[] } {
  const a = tokenize(originalText);
  const b = tokenize(correctedText);
  const key = (t: string) => canonical(t).replace(/[^a-z0-9']/g, '');
  const wordsA = a.filter(t => t.trim()).map(key);
  const wordsB = b.filter(t => t.trim()).map(key);

  // Longest common subsequence over words.
  const n = wordsA.length;
  const m = wordsB.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = wordsA[i] === wordsB[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const keepA = new Array(n).fill(false);
  const keepB = new Array(m).fill(false);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (wordsA[i] === wordsB[j]) {
      keepA[i] = true;
      keepB[j] = true;
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return { original: segmentsFromTokens(a, keepA), corrected: segmentsFromTokens(b, keepB) };
}

function tokenize(text: string): string[] {
  return (text || '').split(/(\s+)/).filter(t => t.length > 0);
}

function segmentsFromTokens(tokens: string[], keep: boolean[]): TextSegment[] {
  const segments: TextSegment[] = [];
  let wordIdx = 0;
  const push = (text: string, mark: boolean) => {
    const last = segments[segments.length - 1];
    if (last && last.mark === mark) last.text += text;
    else segments.push({ text, mark });
  };
  tokens.forEach((tok, k) => {
    if (!tok.trim()) {
      // Whitespace joins a highlight only when the words on both sides are highlighted.
      const prevMarked = wordIdx > 0 && !keep[wordIdx - 1];
      const nextMarked = wordIdx < keep.length && !keep[wordIdx];
      push(tok, prevMarked && nextMarked && k > 0);
      return;
    }
    push(tok, !keep[wordIdx]);
    wordIdx++;
  });
  return segments;
}
