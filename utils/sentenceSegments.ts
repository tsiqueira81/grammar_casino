/**
 * Splits a sentence into plain text, highlighted phrases and cloze gaps so it can
 * be rendered as React nodes. Sentence text comes from AI providers and teacher
 * input, so it must never be injected as HTML (F4 fix 5).
 */
export type SentenceSegment =
  | { kind: 'text'; text: string }
  | { kind: 'highlight'; text: string }
  | { kind: 'gap'; trailing: string };

const GAP_PATTERN = /_{3,}([,.;:!?)]*)/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitHighlight(text: string, phrase: string | null | undefined): SentenceSegment[] {
  if (!text) return [];
  const clean = (phrase || '').trim() ? phrase! : '';
  if (!clean) return [{ kind: 'text', text }];
  const parts = text.split(new RegExp(`(${escapeRegExp(clean)})`, 'gi'));
  const lower = clean.toLowerCase();
  return parts
    .filter(part => part !== '')
    .map(part => (part.toLowerCase() === lower ? { kind: 'highlight', text: part } : { kind: 'text', text: part }));
}

export function buildSentenceSegments(
  text: string | null | undefined,
  options: { highlight?: string | null; showGaps?: boolean } = {},
): SentenceSegment[] {
  const source = text || '';
  if (!source) return [];
  if (!options.showGaps) return splitHighlight(source, options.highlight);

  const segments: SentenceSegment[] = [];
  let last = 0;
  for (const match of source.matchAll(GAP_PATTERN)) {
    const start = match.index ?? 0;
    segments.push(...splitHighlight(source.slice(last, start), options.highlight));
    segments.push({ kind: 'gap', trailing: match[1] || '' });
    last = start + match[0].length;
  }
  segments.push(...splitHighlight(source.slice(last), options.highlight));
  return segments;
}
