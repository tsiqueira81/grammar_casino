import { describe, expect, it } from 'vitest';
import { RESEND_AGAIN_MS, isEmptyBet, sameBet, settlePendingBet, type PendingBet } from '../game/presence';

const pending = (over: Partial<PendingBet> = {}): PendingBet => ({ round: 3, sentence: 'S', bet: { selectedOption: 'went', bet: 100 }, resentAt: null, ...over });
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
    expect(settlePendingBet(p, view(), true, 10_000)).toEqual({ pending: p, action: 'none' });
  });

  it('sends it again while the hand is open, and again later if the table still does not hold it', () => {
    const first = settlePendingBet(pending(), view(), false, 10_000);
    expect(first.action).toBe('resend');
    expect(first.pending?.resentAt).toBe(10_000);
    expect(settlePendingBet(first.pending, view(), false, 10_000 + RESEND_AGAIN_MS - 1).action).toBe('none');
    const second = settlePendingBet(first.pending, view(), false, 10_000 + RESEND_AGAIN_MS);
    expect(second.action).toBe('resend');
    expect(second.pending?.resentAt).toBe(10_000 + RESEND_AGAIN_MS);
  });

  it('forgets it once the teacher holds it', () => {
    expect(settlePendingBet(pending(), view({ myBet: { selectedOption: 'went', bet: 100 } }), false, 10_000)).toEqual({ pending: null, action: 'none' });
  });

  it('says it did not arrive when the hand closed without it', () => {
    expect(settlePendingBet(pending(), view({ step: 'RESULTS' }), false, 10_000).action).toBe('lost');
    expect(settlePendingBet(pending({ resentAt: 1 }), view({ round: 4 }), false, 10_000).action).toBe('lost');
  });

  it('drops it quietly when the sentence was swapped, or when it was empty', () => {
    expect(settlePendingBet(pending(), view({ sentence: { text: 'Other' } }), false, 10_000)).toEqual({ pending: null, action: 'none' });
    expect(settlePendingBet(pending({ bet: {} }), view({ step: 'RESULTS' }), false, 10_000)).toEqual({ pending: null, action: 'none' });
  });
});
