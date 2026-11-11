import { describe, expect, it } from 'vitest';
import {
  DECK_MAX_LINES,
  addSavedDeck,
  changedWords,
  deckFromFile,
  deckSummary,
  deckToFile,
  nextDeckItem,
  parseDeckText,
  parseSavedDecks,
  sentenceRecordOf,
} from '../game/teacherDeck';

// Package L4: the teacher's own sentences.
const TEXT = `# Unit 6
She goes to school every day.
She go to school every day. -> She goes to school every day.
I have lived here _____ 2010. [since]
She is good ___ maths. [at / in]
I have lived here _____ two years. [for | since, during, while]
The children laughed _____. (HAPPY) [happily]
`;

describe('reading pasted sentences', () => {
  const { items, problems } = parseDeckText(TEXT);
  it('reads every kind of line', () => {
    expect(problems).toEqual([]);
    expect(items.map((i) => i.questionType)).toEqual(['binary', 'binary', 'openCloze', 'openCloze', 'multipleChoice', 'wordFormation']);
  });
  it('a correct sentence and a sentence with a mistake', () => {
    expect(items[0]).toMatchObject({ isCorrect: true, correction: 'She goes to school every day.' });
    expect(items[1]).toMatchObject({ isCorrect: false, errorPhrase: 'go', grammarPhrase: 'goes', explanation: '"go" should be "goes".' });
  });
  it('gaps keep their answers', () => {
    expect(items[2]).toMatchObject({ text: 'I have lived here _____ 2010.', correctAnswer: 'since', correction: 'I have lived here since 2010.' });
    expect(items[3]).toMatchObject({ text: 'She is good _____ maths.', acceptedAnswers: ['at', 'in'] });
    expect(items[4].options?.slice().sort()).toEqual(['during', 'for', 'since', 'while']);
    expect(items[4].correctAnswer).toBe('for');
    expect(items[5]).toMatchObject({ baseWord: 'HAPPY', correctAnswer: 'happily', text: 'The children laughed _____.' });
  });
  it('options are shuffled the same way every time', () => {
    expect(parseDeckText(TEXT).items[4].options).toEqual(items[4].options);
  });
  it('summarises in one line', () => {
    expect(deckSummary(items)).toBe('6 sentences: 1 correct, 1 with a mistake, 4 with a gap');
  });
});

describe('lines with a problem are listed, not dealt', () => {
  it('names each problem', () => {
    const { items, problems } = parseDeckText('I like _____ tea.\nShe go. -> She go.\nI have lived here _____ 2010. [since | for]\nA fine sentence.\nA fine sentence.');
    expect(items.length).toBe(1);
    expect(problems.map((p) => p.line)).toEqual([1, 2, 3, 5]);
    expect(problems[0].problem).toMatch(/brackets/);
    expect(problems[3].problem).toMatch(/already/);
  });
  it('keeps at most the limit', () => {
    const many = Array.from({ length: DECK_MAX_LINES + 5 }, (_, i) => `Sentence number ${i} is here.`).join('\n');
    const { items, problems } = parseDeckText(many);
    expect(items.length).toBe(DECK_MAX_LINES);
    expect(problems.length).toBe(5);
  });
});

describe('dealing the deck', () => {
  const { items } = parseDeckText(TEXT);
  it('deals in order and skips what was dealt', () => {
    expect(nextDeckItem(items, [])?.text).toBe(items[0].text);
    const history = [sentenceRecordOf(items[0]), sentenceRecordOf(items[1])];
    expect(nextDeckItem(items, history)?.text).toBe(items[2].text);
    expect(nextDeckItem(items, items.map(sentenceRecordOf))).toBeNull();
  });
  it('a saved deck replays identically', () => {
    const file = deckToFile({ name: 'Unit 6', text: TEXT, savedAt: 1 });
    const back = deckFromFile(file);
    expect(back?.name).toBe('Unit 6');
    expect(parseDeckText(back!.text).items).toEqual(items);
  });
  it('refuses a file that is not a deck', () => {
    expect(deckFromFile('{"hello":1}')).toBeNull();
    expect(deckFromFile('not json')).toBeNull();
  });
});

describe('saved decks', () => {
  it('one per name, newest first', () => {
    let list = addSavedDeck([], { name: 'A', text: '1', savedAt: 1 });
    list = addSavedDeck(list, { name: 'B', text: '2', savedAt: 2 });
    list = addSavedDeck(list, { name: 'a', text: '3', savedAt: 3 });
    expect(list.map((d) => [d.name, d.text])).toEqual([['a', '3'], ['B', '2']]);
    expect(parseSavedDecks(JSON.stringify(list))).toEqual(list);
    expect(parseSavedDecks('oops')).toEqual([]);
  });
  it('finds the changed words', () => {
    expect(changedWords('He have two cats.', 'He has two cats.')).toEqual({ wrong: 'have', right: 'has' });
  });
});

describe('Spot the error and Word order lines (L8)', () => {
  const deck = parseDeckText(
    [
      "spot: He don't like coffee in the morning. -> He doesn't like coffee in the morning.",
      'order: We have never been to Paris.',
      'spot: She goes to school.',
      'order: Go to bed.',
    ].join('\n')
  );

  it('makes a Spot the error item from a mistake line', () => {
    const spot = deck.items[0];
    expect(spot.questionType).toBe('spotError');
    expect(spot.options).toHaveLength(4);
    expect(spot.options?.some((o) => o.includes("don't"))).toBe(true);
  });

  it('makes a Word order item, shuffled the same way every time', () => {
    const order = deck.items[1];
    expect(order.questionType).toBe('wordOrder');
    expect(order.correctAnswer).toBe('we have never been to Paris');
    const again = parseDeckText('order: We have never been to Paris.').items[0];
    expect(again.text).toBe(order.text);
  });

  it('names the problem when a line does not fit the type', () => {
    expect(deck.problems.map((p) => p.line)).toEqual([3, 4]);
    expect(deck.problems[0].problem).toMatch(/^spot: needs a sentence with a mistake/);
    expect(deck.problems[1].problem).toMatch(/^order: needs a correct sentence/);
  });

  it('counts them in the summary', () => {
    expect(deckSummary(deck.items)).toBe('2 sentences: 1 spot the error, 1 word order');
  });
});
