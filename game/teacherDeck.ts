// The teacher's own material (package L4). A teacher pastes sentences, one per line, and the game
// deals them first, in order, before any AI or bank sentence. A deck is kept as its text, so a
// saved deck replays exactly the same way.
//
//   She goes to school every day.                 a correct sentence
//   She go to school every day. -> She goes ...   a sentence with a mistake, then its correction
//   I have lived here _____ 2010. [since]         open cloze (more right answers: [since / from])
//   I have lived here _____ 2010. [since | for, during, while]
//                                                 multiple choice: the right answer, then the others
//   The children laughed _____. (HAPPY) [happily] word formation: the base word in capitals
//   # a line starting with # is a note and is skipped
import { validateItem } from '../content/schema';
import type { GeneratedSentence } from '../types';

export const DECK_MAX_LINES = 60;
export const SAVED_DECKS_KEY = 'grammar_casino_decks_v1';
export const SAVED_DECKS_LIMIT = 20;

export interface DeckLineProblem {
  line: number;
  text: string;
  problem: string;
}

export interface ParsedDeck {
  items: GeneratedSentence[];
  problems: DeckLineProblem[];
}

const GAP = '_____';
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/** A small stable hash, so the options of a line are always shuffled the same way. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function stableShuffle<T>(list: T[], seed: string): T[] {
  const out = list.slice();
  let h = hash(seed);
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The words that differ between a sentence and its correction (first to last change). */
export function changedWords(text: string, correction: string): { wrong: string; right: string } {
  const a = clean(text).split(' ');
  const b = clean(correction).split(' ');
  let start = 0;
  while (start < a.length && start < b.length && a[start].toLowerCase() === b[start].toLowerCase()) start++;
  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA].toLowerCase() === b[endB].toLowerCase()) {
    endA--;
    endB--;
  }
  const strip = (s: string) => s.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '');
  return { wrong: strip(a.slice(start, endA + 1).join(' ')), right: strip(b.slice(start, endB + 1).join(' ')) };
}

function parseLine(raw: string): GeneratedSentence | string {
  const line = clean(raw);
  const arrow = line.match(/^(.*?)\s*(?:->|=>|→)\s*(.+)$/);
  if (arrow) {
    const text = clean(arrow[1]);
    const correction = clean(arrow[2]);
    if (!text || !correction) return 'write the sentence, then -> and its correction';
    const { wrong, right } = changedWords(text, correction);
    if (!wrong && !right) return 'the correction is the same as the sentence';
    return {
      text,
      isCorrect: false,
      correction,
      errorPhrase: wrong || undefined,
      grammarPhrase: right || undefined,
      explanation: wrong && right ? `"${wrong}" should be "${right}".` : `The right sentence is: ${correction}`,
      questionType: 'binary',
    } as GeneratedSentence;
  }

  const gapMatch = line.match(/_{2,}/);
  const bracket = line.match(/\[([^\]]+)\]\s*$/);
  if (gapMatch || bracket) {
    if (!gapMatch) return 'a line with [answers] needs a gap: _____';
    if (!bracket) return 'a gap line needs its answer in brackets at the end, for example [since]';
    const body = clean(line.slice(0, bracket.index).replace(/_{2,}/, GAP));
    const baseMatch = body.match(/\(([A-Z][A-Z'-]+)\)\s*$/);
    const text = baseMatch ? clean(body.slice(0, baseMatch.index)) : body;
    const inside = bracket[1];
    if (inside.includes('|')) {
      const [rightPart, othersPart] = inside.split('|');
      const right = clean(rightPart);
      const others = (othersPart || '').split(',').map(clean).filter(Boolean);
      if (!right || others.length !== 3) return 'multiple choice needs [right answer | three other options, separated by commas]';
      return {
        text,
        isCorrect: true,
        correction: text.replace(GAP, right),
        correctAnswer: right,
        options: stableShuffle([right, ...others], text),
        explanation: `The answer is "${right}".`,
        questionType: 'multipleChoice',
      } as GeneratedSentence;
    }
    const answers = inside.split('/').map(clean).filter(Boolean);
    if (!answers.length) return 'write the answer in the brackets';
    return {
      text,
      isCorrect: true,
      correction: text.replace(GAP, answers[0]),
      correctAnswer: answers[0],
      acceptedAnswers: answers,
      ...(baseMatch ? { baseWord: baseMatch[1].toUpperCase() } : {}),
      explanation: baseMatch ? `${baseMatch[1].toUpperCase()} becomes "${answers[0]}" here.` : `The answer is "${answers[0]}".`,
      questionType: baseMatch ? 'wordFormation' : 'openCloze',
    } as GeneratedSentence;
  }

  return {
    text: line,
    isCorrect: true,
    correction: line,
    explanation: 'This sentence is correct.',
    questionType: 'binary',
  } as GeneratedSentence;
}

/** Reads the teacher's text. Lines with a problem are left out and listed. */
export function parseDeckText(text: string): ParsedDeck {
  const items: GeneratedSentence[] = [];
  const problems: DeckLineProblem[] = [];
  const seen = new Set<string>();
  const lines = String(text || '').split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = clean(raw);
    if (!line || line.startsWith('#')) return;
    if (items.length >= DECK_MAX_LINES) {
      problems.push({ line: i + 1, text: line, problem: `a deck holds up to ${DECK_MAX_LINES} sentences` });
      return;
    }
    const parsed = parseLine(line);
    if (typeof parsed === 'string') {
      problems.push({ line: i + 1, text: line, problem: parsed });
      return;
    }
    const check = validateItem(parsed, parsed.questionType || 'binary');
    if (!check.ok) {
      problems.push({ line: i + 1, text: line, problem: check.errors[0] });
      return;
    }
    const key = parsed.text.toLowerCase();
    if (seen.has(key)) {
      problems.push({ line: i + 1, text: line, problem: 'the same sentence is already in the deck' });
      return;
    }
    seen.add(key);
    items.push(parsed);
  });
  return { items, problems };
}

/** How the game remembers a dealt sentence (the same text as App's history). */
export function sentenceRecordOf(s: Pick<GeneratedSentence, 'text' | 'correction' | 'leadInSentence'>): string {
  if (s.leadInSentence) return `${s.leadInSentence} -> ${s.correction || s.text}`;
  if (s.correction && s.text.includes(GAP)) return `${s.text} (${s.correction})`;
  return s.text;
}

/** The next deck sentence not dealt yet, in order. */
export function nextDeckItem(items: GeneratedSentence[], history: string[]): GeneratedSentence | null {
  const dealt = new Set(history);
  const next = items.find((i) => !dealt.has(sentenceRecordOf(i)));
  return next ? { ...next } : null;
}

/** One line for the teacher: "5 sentences: 3 correct, 2 with a mistake". */
export function deckSummary(items: GeneratedSentence[]): string {
  if (!items.length) return 'No sentences yet';
  const binary = items.filter((i) => (i.questionType || 'binary') === 'binary');
  const flawed = binary.filter((i) => !i.isCorrect).length;
  const gaps = items.length - binary.length;
  const parts = [
    binary.length - flawed ? `${binary.length - flawed} correct` : '',
    flawed ? `${flawed} with a mistake` : '',
    gaps ? `${gaps} with a gap` : '',
  ].filter(Boolean);
  return `${items.length} sentence${items.length === 1 ? '' : 's'}: ${parts.join(', ')}`;
}

export interface SavedDeck {
  name: string;
  text: string;
  savedAt: number;
}

/** The deck file a teacher can share: plain JSON with the text. */
export function deckToFile(deck: SavedDeck): string {
  return JSON.stringify({ grammarCasinoDeck: 1, name: deck.name, savedAt: deck.savedAt, text: deck.text }, null, 2);
}

export function deckFromFile(raw: string): SavedDeck | null {
  try {
    const data = JSON.parse(raw);
    if (!data || data.grammarCasinoDeck !== 1 || typeof data.text !== 'string') return null;
    return { name: clean(String(data.name || 'My deck')).slice(0, 60) || 'My deck', text: data.text.slice(0, 20_000), savedAt: Number(data.savedAt) || Date.now() };
  } catch {
    return null;
  }
}

/** The saved list, newest first, one deck per name. */
export function addSavedDeck(list: SavedDeck[], deck: SavedDeck): SavedDeck[] {
  const name = clean(deck.name).slice(0, 60) || 'My deck';
  return [{ ...deck, name }, ...list.filter((d) => d.name.toLowerCase() !== name.toLowerCase())].slice(0, SAVED_DECKS_LIMIT);
}

export function parseSavedDecks(raw: string | null): SavedDeck[] {
  try {
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data)
      ? data.filter((d) => d && typeof d.name === 'string' && typeof d.text === 'string').map((d) => ({ name: d.name, text: d.text, savedAt: Number(d.savedAt) || 0 }))
      : [];
  } catch {
    return [];
  }
}
