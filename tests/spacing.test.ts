import { describe, expect, it } from 'vitest';
import { cancelSecondLook, scheduleSecondLook, secondLookFor } from '../game/spacing';

const hand = (round: number, misses: number, bets = 5, extra: Partial<Parameters<typeof scheduleSecondLook>[1]> = {}) =>
  ({ round, subtype: 'Present Perfect', bets, misses, handsLeft: 10, ...extra });

describe('second look (package L6)', () => {
  it('brings a grammar point back two hands later when 40% or more missed it', () => {
    const q = scheduleSecondLook([], hand(3, 2));
    expect(q).toEqual([{ dueRound: 5, subtype: 'Present Perfect', fromRound: 3 }]);
    expect(secondLookFor(q, 5)?.subtype).toBe('Present Perfect');
    expect(secondLookFor(q, 4)).toBeUndefined();
  });

  it('does nothing below 40%, for one bet, without a grammar point, or near the end', () => {
    expect(scheduleSecondLook([], hand(3, 1))).toEqual([]);
    expect(scheduleSecondLook([], hand(3, 1, 1))).toEqual([]);
    expect(scheduleSecondLook([], hand(3, 5, 5, { subtype: null }))).toEqual([]);
    expect(scheduleSecondLook([], hand(9, 5, 5, { handsLeft: 1 }))).toEqual([]);
    expect(scheduleSecondLook([], hand(3, 5, 5, { handsLeft: Infinity }))).toHaveLength(1);
  });

  it('never repeats a second look, and queues each point once', () => {
    let q = scheduleSecondLook([], hand(3, 4));
    q = scheduleSecondLook(q, hand(4, 4));
    expect(q).toHaveLength(1);
    q = scheduleSecondLook(q, hand(5, 4));
    expect(q).toHaveLength(1);
    q = scheduleSecondLook(q, hand(6, 4));
    expect(q.map(e => e.dueRound)).toEqual([5, 8]);
  });

  it('forgets the second look of an undone or voided hand', () => {
    const q = scheduleSecondLook([], hand(3, 4));
    expect(cancelSecondLook(q, 3)).toEqual([]);
    expect(cancelSecondLook(q, 2)).toEqual(q);
  });
});
