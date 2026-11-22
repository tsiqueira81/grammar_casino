import { describe, expect, it } from 'vitest';
import { answerSplit, reactionCounts, recordReaction, rightWrongCounts, roomSplitLine, type AnswerSplitInput } from '../game/answerSplit';
import { normalizeGapAnswer } from '../utils/roundSettlement';

describe('normalizeGapAnswer (package L5)', () => {
  it('ignores case, spaces and curly apostrophes, but keeps contractions', () => {
    expect(normalizeGapAnswer('  Couldn’t   Have ')).toBe("couldn't have");
    expect(normalizeGapAnswer("couldn't")).not.toBe(normalizeGapAnswer('could not'));
    expect(normalizeGapAnswer(undefined)).toBe('');
  });
});

describe('answerSplit (package L5)', () => {
  it('counts multiple-choice picks with letters, most popular first, split bets once per pick', () => {
    const rows = answerSplit({
      qType: 'multipleChoice',
      options: ['have', 'had', 'has'],
      playerIds: [1, 2, 3, 4],
      bets: {
        1: { selectedOption: 'had' },
        2: { selectedOption: 'have' },
        3: { splitOptions: ['had', 'has'] },
        4: undefined,
      },
      isRightAnswer: (a) => a === 'had',
    });
    expect(rows).toEqual([
      { label: 'B: had', count: 2, isRight: true },
      { label: 'A: have', count: 1, isRight: false },
      { label: 'C: has', count: 1, isRight: false },
    ]);
  });

  it('groups typed answers that differ only in case or spaces', () => {
    const rows = answerSplit({
      qType: 'openCloze',
      playerIds: [1, 2, 3],
      bets: { 1: { clozeAnswer: 'Since' }, 2: { clozeAnswer: ' since ' }, 3: { clozeAnswer: 'for' } },
      isRightAnswer: (a) => normalizeGapAnswer(a) === 'since',
    });
    expect(rows).toEqual([
      { label: 'Since', count: 2, isRight: true },
      { label: 'for', count: 1, isRight: false },
    ]);
  });

  it('labels valid-or-flawed votes', () => {
    const rows = answerSplit({
      qType: 'binary',
      sentenceIsCorrect: false,
      playerIds: [1, 2],
      bets: { 1: { opinion: 'incorrect' }, 2: { opinion: 'correct' } },
      isRightAnswer: () => false,
    });
    expect(rows).toEqual([
      { label: 'Flawed', count: 1, isRight: true },
      { label: 'Valid', count: 1, isRight: false },
    ]);
  });
});

describe('hand reactions (package L5)', () => {
  it('keeps one reaction per player per hand, the latest wins', () => {
    let s = recordReaction({}, 3, 1, 'confused');
    s = recordReaction(s, 3, 2, 'gotIt');
    s = recordReaction(s, 3, 1, 'gotIt');
    s = recordReaction(s, 4, 1, 'confused');
    expect(reactionCounts(s, 3)).toEqual({ gotIt: 2, confused: 0 });
    expect(reactionCounts(s, 4)).toEqual({ gotIt: 0, confused: 1 });
    expect(recordReaction(s, 4, 1, 'confused')).toBe(s);
  });
});

describe("the room's split once bets close (S4)", () => {
  const rows = [
    { label: 'Valid', count: 5, isRight: true },
    { label: 'Flawed', count: 3, isRight: false },
  ];
  it('gives percentages without saying which is right', () => {
    expect(roomSplitLine('binary', rows)).toBe('63% Valid · 38% Flawed');
  });
  it('is only for picked answers, and needs two bets', () => {
    expect(roomSplitLine('openCloze', rows)).toBeNull();
    expect(roomSplitLine('multipleChoice', [{ label: 'A: had', count: 1, isRight: true }])).toBeNull();
    expect(roomSplitLine('multipleChoice', [{ label: 'A: had', count: 2, isRight: true }, { label: 'B: have', count: 1, isRight: false }])).toBe('67% A: had · 33% B: have');
  });
});

describe('right answer and right/wrong counts (results panel)', () => {
  const base: AnswerSplitInput = {
    qType: 'wordFormation',
    playerIds: [1, 2, 3, 4],
    bets: {
      1: { clozeAnswer: 'success' },
      2: { clozeAnswer: 'successful' },
      3: { clozeAnswer: 'quickly' },
      4: { splitClozeAnswers: ['success', 'quickly'] as [string, string] },
    },
    isRightAnswer: (a: string) => normalizeGapAnswer(a) === 'unsuccessful',
    correctAnswer: 'unsuccessful',
  };

  it('adds the right answer with 0 after the reveal when nobody picked it', () => {
    const rows = answerSplit({ ...base, showUnpickedRight: true });
    expect(rows[rows.length - 1]).toEqual({ label: 'unsuccessful', count: 0, isRight: true });
  });

  it('never adds it before the reveal', () => {
    expect(answerSplit(base).some((r) => r.isRight)).toBe(false);
    const binary = answerSplit({
      qType: 'binary', sentenceIsCorrect: false, playerIds: [1], bets: { 1: { opinion: 'correct' } }, isRightAnswer: () => false,
    });
    expect(binary).toEqual([{ label: 'Valid', count: 1, isRight: false }]);
  });

  it('adds Flawed with 0 when every vote was Valid on a flawed sentence', () => {
    const rows = answerSplit({
      qType: 'binary', sentenceIsCorrect: false, playerIds: [1], bets: { 1: { opinion: 'correct' } }, isRightAnswer: () => false, showUnpickedRight: true,
    });
    expect(rows).toEqual([{ label: 'Valid', count: 1, isRight: false }, { label: 'Flawed', count: 0, isRight: true }]);
  });

  it('counts players, not picks: everyone wrong is 0 right, 4 wrong', () => {
    expect(rightWrongCounts(base)).toEqual({ right: 0, answered: 4 });
    const oneRight = { ...base, bets: { ...base.bets, 4: { splitClozeAnswers: ['Unsuccessful', 'quickly'] as [string, string] } } };
    expect(rightWrongCounts(oneRight)).toEqual({ right: 1, answered: 4 });
  });
});
