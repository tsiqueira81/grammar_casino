import { describe, expect, it } from 'vitest';
import { isEmptyBet, sameBet, settlePendingBet, type PendingBet } from '../game/presence';

const pending = (over: Partial<PendingBet> = {}): PendingBet => ({ round: 3, sentence: 'S', bet: { selectedOption: 'went', bet: 100 }, resent: false, ...over });
const view = (over: Record<string, unknown> = {}) => ({ round: 3, step: 'IN_GAME', sentence: { text: 'S' }, myBet: {}, ...over });

describe('a bet made offline (R2)', () => {
  it('compares answers and stakes, not presentation', () => {
    expect(sameBet({ bet: '100' as unknown as number, clozeAnswer: ' Since ' }, { bet: 100, clozeAnswer: 'since' })).toBe(true);
    expect(sameBet({ bet: 100 }, { bet: 50 })).toBe(false);
    expect(sameBet({ splitOptions: ['a', 'b'] }, { splitOptions: ['b', 'a'] })).toBe(true);
    expect(sameBet({ opinion: 'correct' }, { opinion: 'incorrect' })).toBe(false);
    expect(isEmptyBet({ bet: '' })).toBe(true);
    expect(isEmptyBet({ opinion: 'correct' })).toBe(false);
  });

  it('waits while offline', () => {
    const p = pending();
    expect(settlePendingBet(p, view(), true)).toEqual({ pending: p, action: 'none' });
  });

  it('sends it again once while the hand is open', () => {
    const first = settlePendingBet(pending(), view(), false);
    expect(first.action).toBe('resend');
    expect(first.pending?.resent).toBe(true);
    expect(settlePendingBet(first.pending, view(), false).action).toBe('none');
  });

  it('forgets it once the teacher holds it', () => {
    expect(settlePendingBet(pending(), view({ myBet: { selectedOption: 'went', bet: 100 } }), false)).toEqual({ pending: null, action: 'none' });
  });

  it('says it did not arrive when the hand closed without it', () => {
    expect(settlePendingBet(pending(), view({ step: 'RESULTS' }), false).action).toBe('lost');
    expect(settlePendingBet(pending({ resent: true }), view({ round: 4 }), false).action).toBe('lost');
  });

  it('drops it quietly when the sentence was swapped, or when it was empty', () => {
    expect(settlePendingBet(pending(), view({ sentence: { text: 'Other' } }), false)).toEqual({ pending: null, action: 'none' });
    expect(settlePendingBet(pending({ bet: {} }), view({ step: 'RESULTS' }), false)).toEqual({ pending: null, action: 'none' });
  });
});
