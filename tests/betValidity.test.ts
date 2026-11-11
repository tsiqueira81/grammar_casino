import { describe, expect, it } from 'vitest';
import { checkBet, isBetComplete, isValidKeyWordTransformationPhrase } from '../game/betValidity';
import type { Bet } from '../types';

const bet = (b: Partial<Bet>): Bet => ({ bet: 100, ...b }) as Bet;

describe('stake', () => {
  it('needs a numeric stake; $0 counts unless a positive amount is required', () => {
    expect(checkBet(undefined, 'binary', false, undefined)).toBe('amount');
    expect(checkBet(bet({ bet: '', opinion: 'correct' }), 'binary', false, undefined)).toBe('amount');
    expect(checkBet(bet({ bet: NaN, opinion: 'correct' }), 'binary', false, undefined)).toBe('amount');
    expect(checkBet(bet({ bet: -1, opinion: 'correct' }), 'binary', false, undefined)).toBe('amount');
    expect(isBetComplete(bet({ bet: 0, opinion: 'correct' }), 'binary', false)).toBe(true);
    expect(isBetComplete(bet({ bet: 0, opinion: 'correct' }), 'binary', false, undefined, { requirePositiveAmount: true })).toBe(false);
  });
});

describe('valid or flawed', () => {
  it('needs an opinion, unless Split Bet is on', () => {
    expect(checkBet(bet({}), 'binary', false, undefined)).toBe('answer');
    expect(isBetComplete(bet({ opinion: 'incorrect' }), 'binary', false)).toBe(true);
    expect(isBetComplete(bet({}), 'binary', true)).toBe(true);
  });

  it('accepts any opinion value by default, but only correct/incorrect when strict', () => {
    const odd = bet({ opinion: 'maybe' as any });
    expect(isBetComplete(odd, 'binary', false)).toBe(true);
    expect(isBetComplete(odd, 'binary', false, undefined, { strictOpinion: true })).toBe(false);
  });
});

describe('multiple choice', () => {
  it('needs an option, or at least one split option', () => {
    expect(checkBet(bet({ selectedOption: '  ' }), 'multipleChoice', false, undefined)).toBe('answer');
    expect(isBetComplete(bet({ selectedOption: 'had' }), 'multipleChoice', false)).toBe(true);
    expect(isBetComplete(bet({ splitOptions: [] }), 'multipleChoice', true)).toBe(false);
    expect(isBetComplete(bet({ splitOptions: ['had'] }), 'multipleChoice', true)).toBe(true);
  });
});

describe('open cloze and word formation', () => {
  it('needs a word', () => {
    expect(checkBet(bet({ clozeAnswer: ' ' }), 'openCloze', false, undefined)).toBe('answer');
    expect(isBetComplete(bet({ clozeAnswer: 'in' }), 'openCloze', false)).toBe(true);
  });

  it('refuses the unchanged base word in word formation, in any case', () => {
    expect(checkBet(bet({ clozeAnswer: 'Succeed ' }), 'wordFormation', false, 'succeed')).toBe('unchangedBaseWord');
    expect(isBetComplete(bet({ clozeAnswer: 'success' }), 'wordFormation', false, 'succeed')).toBe(true);
    // Open cloze has no base word rule even if one is passed.
    expect(isBetComplete(bet({ clozeAnswer: 'succeed' }), 'openCloze', false, 'succeed')).toBe(true);
  });

  it('with Split Bet: one real candidate is enough by default', () => {
    const b = bet({ splitClozeAnswers: ['succeed', 'success'] });
    expect(isBetComplete(b, 'wordFormation', true, 'succeed')).toBe(true);
    expect(checkBet(bet({ splitClozeAnswers: ['succeed', ''] }), 'wordFormation', true, 'succeed')).toBe('unchangedBaseWord');
    expect(checkBet(bet({ splitClozeAnswers: ['', ''] }), 'wordFormation', true, 'succeed')).toBe('answer');
  });

  it('with Split Bet on the host screens: any unchanged candidate blocks the bet', () => {
    const b = bet({ splitClozeAnswers: ['succeed', 'success'] });
    expect(checkBet(b, 'wordFormation', true, 'succeed', { strictSplitBaseWord: true })).toBe('unchangedBaseWord');
    expect(isBetComplete(bet({ splitClozeAnswers: ['', 'success'] }), 'wordFormation', true, 'succeed', { strictSplitBaseWord: true })).toBe(true);
  });
});

describe('key word transformation', () => {
  it('needs 2 to 6 words that include the key word', () => {
    expect(isValidKeyWordTransformationPhrase('have been working here for', 'for')).toBe(true);
    expect(isValidKeyWordTransformationPhrase('for', 'for')).toBe(false);
    expect(isValidKeyWordTransformationPhrase('one two three four five six seven', 'one')).toBe(false);
    expect(isValidKeyWordTransformationPhrase('have been working here since', 'for')).toBe(false);
    expect(isValidKeyWordTransformationPhrase('before the war', 'for')).toBe(false);
    expect(isValidKeyWordTransformationPhrase('any two words', '')).toBe(true);
  });

  it('reports an empty answer and a wrong phrase differently', () => {
    expect(checkBet(bet({ clozeAnswer: '' }), 'keyWordTransformation', false, 'for')).toBe('answer');
    expect(checkBet(bet({ clozeAnswer: 'since then' }), 'keyWordTransformation', false, 'for')).toBe('invalidKeyWord');
    expect(checkBet(bet({ clozeAnswer: 'waited for ages' }), 'keyWordTransformation', false, 'for')).toBe(null);
  });

  it('with Split Bet: every typed candidate must be valid', () => {
    expect(checkBet(bet({ splitClozeAnswers: ['', ''] }), 'keyWordTransformation', true, 'for')).toBe('answer');
    expect(checkBet(bet({ splitClozeAnswers: ['waited for ages', ''] }), 'keyWordTransformation', true, 'for')).toBe(null);
    expect(checkBet(bet({ splitClozeAnswers: ['waited for ages', 'nope'] }), 'keyWordTransformation', true, 'for')).toBe('invalidKeyWord');
  });
});
