import { describe, expect, it } from 'vitest';
import { shuffleTiles, tilesLeft, toSpotError, toWordOrder, wordOrderHint } from '../game/newFormats';
import { isGapType, isOptionType, isTypedAnswerType, isWordAnswerType, questionTypeLabel } from '../game/questionTypes';
import { buildAcceptedAnswerSet } from '../utils/roundSettlement';
import { checkBet } from '../game/betValidity';
import { E2E_SENTENCES, getE2eSentence } from '../utils/e2eContent';
import { getEffectiveMixedFormats, DEFAULT_MIXED_FORMATS, ALL_QUESTION_TYPES, CHALLENGE_FORMATS } from '../constants';
import { sentenceRecordOf } from '../game/teacherDeck';
import { randomBotBet } from '../game/demoBots';
import type { GeneratedSentence } from '../types';

const flawed: GeneratedSentence = {
  text: 'He have finished his homework already.',
  isCorrect: false,
  correction: 'He has finished his homework already.',
  explanation: 'Third person singular takes "has".',
  grammarPhrase: 'have finished',
  errorPhrase: 'have finished',
  questionType: 'binary',
};

describe('question type rules (L8)', () => {
  it('sorts each type by how it is answered', () => {
    expect(isOptionType('spotError')).toBe(true);
    expect(isOptionType('wordOrder')).toBe(false);
    expect(isTypedAnswerType('wordOrder')).toBe(true);
    expect(isWordAnswerType('wordOrder')).toBe(true);
    expect(isGapType('spotError')).toBe(true);
    expect(isGapType('binary')).toBe(false);
    expect(questionTypeLabel('spotError')).toBe('Spot the error');
    expect(questionTypeLabel('wordOrder')).toBe('Word order');
  });

  it('offers both in setup, but a mixed game starts with the classic five', () => {
    expect(CHALLENGE_FORMATS.map((f) => f.id)).toEqual(expect.arrayContaining(['spotError', 'wordOrder']));
    expect(ALL_QUESTION_TYPES).toHaveLength(7);
    expect(getEffectiveMixedFormats(undefined)).toEqual(DEFAULT_MIXED_FORMATS);
    expect(getEffectiveMixedFormats(['wordOrder', 'binary'])).toEqual(['binary', 'wordOrder']);
  });
});

describe('Spot the error', () => {
  it('cuts a flawed sentence into four parts, one of them the mistake', () => {
    const item = toSpotError(flawed)!;
    expect(item.questionType).toBe('spotError');
    expect(item.options).toEqual(['He', 'have finished', 'his homework', 'already']);
    expect(item.correctAnswer).toBe('have finished');
    expect(item.correction).toBe('He has finished his homework already.');
  });

  it('matches the item the browser tests use', () => {
    const made = toSpotError(E2E_SENTENCES.binaryFlawed as GeneratedSentence)!;
    expect(made.options).toEqual(E2E_SENTENCES.spotError.options);
    expect(made.correctAnswer).toBe(E2E_SENTENCES.spotError.correctAnswer);
    expect(getE2eSentence('spotError', null).questionType).toBe('spotError');
  });

  it('works when the mistake is at the start or the end', () => {
    const start = toSpotError({ ...flawed, text: 'Does she likes coffee in the morning?', errorPhrase: 'Does she likes', correction: 'Does she like coffee in the morning?' })!;
    expect(start.options![0]).toBe('Does she likes');
    expect(start.options).toHaveLength(4);
    const end = toSpotError({ ...flawed, text: 'Yesterday we all go to the cinema.', errorPhrase: 'go to the cinema', correction: 'Yesterday we all went to the cinema.' })!;
    expect(end.options).toEqual(['Yesterday', 'we', 'all', 'go to the cinema']);
    expect(end.correctAnswer).toBe('go to the cinema');
  });

  it('refuses items it cannot cut fairly', () => {
    expect(toSpotError({ ...flawed, isCorrect: true })).toBeNull();
    expect(toSpotError({ ...flawed, errorPhrase: 'not in the sentence' })).toBeNull();
    expect(toSpotError({ ...flawed, text: 'He have gone.', errorPhrase: 'have' })).toBeNull();
  });

  it('checks a bet like multiple choice', () => {
    expect(checkBet({ bet: 100, selectedOption: 'have finished' }, 'spotError', false, undefined)).toBeNull();
    expect(checkBet({ bet: 100 }, 'spotError', false, undefined)).toBe('answer');
  });
});

describe('Word order', () => {
  const correct: GeneratedSentence = { text: 'She has already finished her homework.', isCorrect: true, correction: '', explanation: '', grammarPhrase: '', questionType: 'binary' };
  const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };

  it('turns a correct sentence into shuffled tiles, never in the right order', () => {
    const item = toWordOrder(correct, seq(0.1, 0.9, 0.3, 0.7, 0.5))!;
    expect(item.questionType).toBe('wordOrder');
    expect(item.correctAnswer).toBe('she has already finished her homework');
    expect(item.correction).toBe('She has already finished her homework.');
    expect([...item.options!].sort()).toEqual(['already', 'finished', 'has', 'her', 'homework', 'she']);
    expect(item.options!.join(' ')).not.toBe(item.correctAnswer);
    expect(item.text).toBe(item.options!.join(' / '));
  });

  it('keeps the capital on I', () => {
    const item = toWordOrder({ ...correct, text: 'I have never been to Rome.' })!;
    expect(item.correctAnswer).toBe('I have never been to Rome');
  });

  it('refuses sentences that are too short, too long or have a gap', () => {
    expect(toWordOrder({ ...correct, text: 'I agree.' })).toBeNull();
    expect(toWordOrder({ ...correct, text: 'This is a very long sentence that has far too many words in it.' })).toBeNull();
    expect(toWordOrder({ ...correct, text: 'She _____ there.', questionType: 'binary' })).toBeNull();
  });

  it('shuffles away from the original order even with an unlucky random source', () => {
    expect(shuffleTiles(['a', 'b', 'c'], () => 0.99)).not.toEqual(['a', 'b', 'c']);
    expect(shuffleTiles(['a'])).toEqual(['a']);
  });

  it('tracks the tiles still to place, counting repeated words once each', () => {
    expect(tilesLeft(['the', 'cat', 'saw', 'the', 'dog'], 'the cat')).toEqual(['saw', 'the', 'dog']);
    expect(tilesLeft(['a', 'b'], '')).toEqual(['a', 'b']);
  });

  it('accepts the answer with or without the full stop, but not another order', () => {
    const item = E2E_SENTENCES.wordOrder as GeneratedSentence;
    const { acceptedSet } = buildAcceptedAnswerSet(item, 'wordOrder');
    expect(acceptedSet.has('she has already finished her homework')).toBe(true);
    expect(acceptedSet.has('she has already finished her homework.')).toBe(true);
    expect(acceptedSet.has('she already has finished her homework')).toBe(false);
  });

  it('keeps the words apart when checking a bet', () => {
    expect(checkBet({ bet: 10, clozeAnswer: 'she has already finished her homework' }, 'wordOrder', false, undefined)).toBeNull();
    expect(checkBet({ bet: 10, clozeAnswer: '' }, 'wordOrder', false, undefined)).toBe('answer');
  });

  it('remembers the sentence it came from, so it is not dealt again', () => {
    expect(sentenceRecordOf(E2E_SENTENCES.wordOrder as GeneratedSentence)).toBe('She has already finished her homework.');
  });

  it('gives a hint without the AI', () => {
    expect(wordOrderHint(E2E_SENTENCES.wordOrder)).toBe('The sentence starts with "she" and has 6 words. Find the verb next.');
  });

  it('lets demo bots answer both', () => {
    const tiles = E2E_SENTENCES.wordOrder.options;
    const bet = randomBotBet({ me: { money: 1000 }, sentence: { questionType: 'wordOrder', options: tiles } } as any, () => 0.3);
    expect(bet.clozeAnswer!.split(' ').sort()).toEqual([...tiles].sort());
    const pick = randomBotBet({ me: { money: 1000 }, sentence: { questionType: 'spotError', options: ['a', 'b', 'c', 'd'] } } as any, () => 0.3);
    expect(['a', 'b', 'c', 'd']).toContain(pick.selectedOption);
  });
});
