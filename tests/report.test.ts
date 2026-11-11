import { describe, expect, it } from 'vitest';
import { buildReport, classResultLine, correctionAccepted, filterHistory, reportToCsv } from '../game/report';
import type { Player, RoundHistoryRecord, RoundPlayerResult } from '../types';

const player = (id: number, name: string, money: number): Player => ({ id, name, money, avatar: 'a', history: [], winStreak: 0, effects: [] } as unknown as Player);
const res = (playerId: number, isWin: boolean, extra: Partial<RoundPlayerResult> = {}): RoundPlayerResult =>
  ({ playerId, playerName: `P${playerId}`, playerAvatar: 'a', bet: 100, opinion: 'correct', isWin, amountChanged: isWin ? 100 : -100, newTotal: 0, ...extra } as RoundPlayerResult);
const hand = (round: number, topic: string, isCorrect: boolean, results: RoundPlayerResult[]): RoundHistoryRecord =>
  ({ round, topic, level: 'B1', theme: 't', sentence: { text: `Sentence ${round}`, isCorrect, correction: '', explanation: '', grammarPhrase: '' }, playerResults: results } as RoundHistoryRecord);

const players = [player(1, 'Ana', 1300), player(2, 'Bruno', 700), player(3, 'Caio', 1000)];
const history = [
  hand(1, 'Tenses', false, [res(1, true, { userCorrection: 'He goes', correctionFeedback: 'Accepted! Good.' }), res(2, false, { userCorrection: 'He go', correctionFeedback: 'Rejected for bonus. Not quite.' }), res(3, false)]),
  hand(2, 'Tenses', true, [res(1, true), res(2, false, { playerAnswerDisplay: 'Flawed' }), res(3, false, { playerAnswerDisplay: 'Flawed' })]),
  hand(3, 'Articles', true, [res(1, true), res(2, true), res(3, true)]),
];

describe('buildReport (package L7)', () => {
  const r = buildReport(history, players);

  it('counts the class totals', () => {
    expect([r.hands, r.bets, r.rightBets, r.accuracy]).toEqual([3, 9, 5, 56]);
    expect([r.flawedSentences, r.validSentences, r.handsWithAMiss]).toEqual([1, 2, 2]);
  });

  it('counts "Rejected for bonus" as rejected (the old PDF counted it as accepted)', () => {
    expect(correctionAccepted({ correctionFeedback: 'Rejected for bonus. x' })).toBe(false);
    expect(correctionAccepted({ correctionFeedback: 'Accepted! x' })).toBe(true);
    const bruno = r.players.find(p => p.name === 'Bruno')!;
    expect([bruno.correctionsTried, bruno.correctionsAccepted]).toEqual([1, 0]);
  });

  it('ranks players by money and gives the award only with enough bets', () => {
    expect(r.players.map(p => p.name)).toEqual(['Ana', 'Caio', 'Bruno']);
    expect(r.topPlayer?.name).toBe('Ana');
    const long = Array.from({ length: 6 }, (_, i) => hand(i + 1, 'T', true, i < 2 ? [res(1, true), res(2, false)] : [res(2, i > 2)]));
    expect(buildReport(long, players.slice(0, 2)).topPlayer?.name).toBe('Bruno');
  });

  it('finds the weakest topics, the most missed hands and the popular wrong answer', () => {
    expect(r.byTopic.map(a => [a.label, a.accuracy])).toEqual([['Tenses', 33], ['Articles', 100]]);
    expect(r.teachNext).toEqual(['Review: Tenses (33% right).']);
    expect(r.mostMissed.map(m => [m.round, m.missed, m.popularWrongAnswer])).toEqual([[1, 2, 'Valid'], [2, 2, 'Flawed']]);
  });

  it('filters hands the same way everywhere', () => {
    expect(filterHistory(history, 'errors').map(h => h.round)).toEqual([1]);
    expect(filterHistory(history, 'missed').map(h => h.round)).toEqual([1, 2]);
    expect(filterHistory(history, 'perfect').map(h => h.round)).toEqual([3]);
  });

  it('writes a CSV a spreadsheet cannot mistake for formulas', () => {
    const csv = reportToCsv(buildReport(history, [player(1, '=HACK()', 1300), player(2, 'Bruno, Jr', 700), player(3, 'Caio', 1000)]));
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('Rank,Student,Final money,Bets,Right,Percent right,Corrections tried,Corrections accepted');
    expect(lines[1]).toBe("1,'=HACK(),1300,3,3,100,1,1");
    expect(lines[3]).toBe('3,"Bruno, Jr",700,3,1,33,1,0');
  });
});

describe('classResultLine (package V9)', () => {
  it('hands the lesson back: overall, best topic, topic to review', () => {
    expect(classResultLine(buildReport(history, players))).toBe('Together you got 56% right. Best topic: Articles. To review: Tenses.');
  });
  it('says nothing for a game without bets, and no best topic when all topics tie', () => {
    expect(classResultLine(buildReport([], players))).toBe('');
    const even = [hand(1, 'A', true, [res(1, true), res(2, true)]), hand(2, 'B', true, [res(1, true), res(2, true)])];
    expect(classResultLine(buildReport(even, players))).toBe('Together you got 100% right.');
  });
});
