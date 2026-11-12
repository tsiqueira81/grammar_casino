// Package L8: two more question types, made from the items the game already has.
//   Spot the error: a flawed sentence cut into four parts (A to D); the right answer is the part
//                   with the mistake. Played like multiple choice.
//   Word order:     a correct sentence shuffled into word tiles; the student puts them back.
//                   Played like a typed answer and judged exactly (no AI check).
import type { GeneratedSentence } from '../types';

export type Rand = () => number;

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);
const stripEnd = (s: string) => s.replace(/[.!?…]+$/u, '').trim();
const clean = (w: string) => w.replace(/^[“"'(]+|[”"'),;:.!?…]+$/gu, '');

/** Where the error phrase sits in the sentence, as a range of word positions. */
function findPhrase(all: string[], phrase: string): [number, number] | null {
  const target = words(phrase).map((w) => clean(w).toLowerCase());
  if (target.length === 0) return null;
  const norm = all.map((w) => clean(w).toLowerCase());
  for (let i = 0; i + target.length <= norm.length; i++) {
    if (target.every((t, j) => norm[i + j] === t)) return [i, i + target.length];
  }
  return null;
}

/** Cuts `n` words into `parts` runs, as even as possible, in order. */
function cutInto(list: string[], parts: number): string[][] {
  const out: string[][] = [];
  let at = 0;
  for (let p = 0; p < parts; p++) {
    const size = Math.round((list.length - at) / (parts - p));
    out.push(list.slice(at, at + size));
    at += size;
  }
  return out;
}

/**
 * A flawed Valid-or-flawed item, made into Spot the error. Returns null when the item has no
 * mistake marked, or is too short to cut into four parts.
 */
export function toSpotError(item: GeneratedSentence): GeneratedSentence | null {
  if (item.isCorrect || !item.errorPhrase || !item.correction) return null;
  const all = words(item.text);
  const at = findPhrase(all, item.errorPhrase);
  if (!at) return null;
  const [from, to] = at;
  const before = all.slice(0, from);
  const after = all.slice(to);
  if (before.length + after.length < 3) return null;
  // Share the three other parts between the words before and after the mistake.
  let partsBefore = before.length === 0 ? 0 : after.length === 0 ? 3 : Math.round((3 * before.length) / (before.length + after.length));
  partsBefore = Math.min(before.length, Math.max(before.length > 0 ? 1 : 0, partsBefore));
  let partsAfter = 3 - partsBefore;
  if (partsAfter > after.length) {
    partsAfter = after.length;
    partsBefore = 3 - partsAfter;
  }
  if (partsAfter === 0 && after.length > 0) {
    partsAfter = 1;
    partsBefore = 2;
  }
  if (partsBefore > before.length) return null;
  const segs = [
    ...cutInto(before, partsBefore),
    all.slice(from, to),
    ...cutInto(after, partsAfter),
  ].map((ws) => stripEnd(ws.join(' ')).replace(/[,;:]+$/u, ''));
  if (segs.length !== 4 || segs.some((s) => !s)) return null;
  // Four different parts, or the student could not tell them apart.
  if (new Set(segs.map((s) => s.toLowerCase())).size !== 4) return null;
  const answer = segs[partsBefore];
  return {
    ...item,
    questionType: 'spotError',
    isCorrect: true,
    options: segs,
    correctAnswer: answer,
    acceptedAnswers: [answer],
    grammarPhrase: item.errorPhrase,
    // Shown after the reveal as the whole right sentence.
    correction: item.correction,
  };
}

/** Shuffles a list so it never comes out in the original order (when that is possible). */
export function shuffleTiles(list: string[], rand: Rand = Math.random): string[] {
  if (list.length < 2) return [...list];
  for (let tries = 0; tries < 8; tries++) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    if (out.some((w, i) => w !== list[i])) return out;
  }
  return [...list.slice(1), list[0]];
}

/** Longest sentence that makes a fair word-order puzzle. */
export const WORD_ORDER_MAX_WORDS = 10;

/**
 * A correct sentence, made into Word order. The tiles are the words without the final mark; the
 * first word keeps its capital only when it is "I" or a name, so the capital does not give it away.
 * Returns null when the sentence is too short, too long or has a gap.
 */
export function toWordOrder(item: GeneratedSentence, rand: Rand = Math.random): GeneratedSentence | null {
  const sentence = (item.questionType && item.questionType !== 'binary' ? item.correction : item.text) || '';
  if (!sentence || /_{2,}/.test(sentence)) return null;
  const body = stripEnd(sentence);
  const tiles = words(body);
  if (tiles.length < 4 || tiles.length > WORD_ORDER_MAX_WORDS) return null;
  // A capital on the first tile would show which word starts the sentence.
  const first = tiles[0];
  const keepCapital = first === 'I' || /^I'/.test(first);
  const shown = [...tiles];
  if (!keepCapital) shown[0] = first.charAt(0).toLowerCase() + first.slice(1);
  const answer = shown.join(' ');
  const shuffled = shuffleTiles(shown, rand);
  return {
    ...item,
    questionType: 'wordOrder',
    isCorrect: true,
    text: shuffled.join(' / '),
    options: shuffled,
    correctAnswer: answer,
    acceptedAnswers: [answer],
    correction: sentence,
    errorPhrase: undefined,
    leadInSentence: undefined,
    baseWord: undefined,
  };
}

/** The tiles a student has left to place, after the words already in their answer. */
export function tilesLeft(tiles: string[], answer: string): string[] {
  const used = words(answer).map((w) => w.toLowerCase());
  const left: string[] = [];
  for (const t of tiles) {
    const i = used.indexOf(t.toLowerCase());
    if (i >= 0) used.splice(i, 1);
    else left.push(t);
  }
  return left;
}

/** The hint for a word-order hand: the first word, without asking the AI (it would need the answer). */
export function wordOrderHint(item: Pick<GeneratedSentence, 'correctAnswer'>): string {
  const all = words(item.correctAnswer || '');
  if (all.length === 0) return 'Find the subject first, then the verb.';
  return `The sentence starts with "${all[0]}" and has ${all.length} words. Find the verb next.`;
}
