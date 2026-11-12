import { describe, expect, it } from 'vitest';
import { generateGrammarReportPDF } from '../utils/pdfGenerator';
import type { Player, RoundHistoryRecord } from '../types';

const player = { id: 1, name: 'Ana', money: 1100, avatar: 'a', history: [], winStreak: 0, effects: [] } as unknown as Player;
const hand = (round: number, extra: Partial<RoundHistoryRecord>): RoundHistoryRecord =>
  ({
    round,
    topic: 'Tenses',
    level: 'B1',
    theme: 't',
    timestamp: 100_000 + round * 60_000,
    dealtAt: 100_000 + round * 60_000 - 45_000,
    sentence: { text: `She go to school ${round}.`, isCorrect: false, correction: `She goes to school ${round}.`, explanation: 'Third person -s.', grammarPhrase: 'goes' },
    playerResults: [{ playerId: 1, playerName: 'Ana', playerAvatar: 'a', bet: 100, opinion: 'incorrect', isWin: true, amountChanged: 100, newTotal: 1100 }],
    ...extra,
  }) as RoundHistoryRecord;

describe('the PDF report (package L7)', () => {
  it('lists the hands the class was still confused about, and the pace', () => {
    const doc = generateGrammarReportPDF({
      history: [hand(1, { feedback: { gotIt: 3, confused: 4 } } as Partial<RoundHistoryRecord>), hand(2, {})],
      players: [player],
      winner: player,
    });
    const text = doc.output();
    expect(text).toContain('WHAT THE CLASS FOUND HARD, AND THE PACE');
    expect(text).toContain('4 still confused, 3 got it');
    expect(text).toContain('45 s on average');
  });
});
