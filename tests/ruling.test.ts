// Package R8: undo a reveal, void a hand, and accept a further answer, all from the snapshot
// taken just before the bets were settled.
import { describe, expect, it } from 'vitest';
import { buildAcceptedAnswerSet, settleRound, type SettleRoundInput } from '../utils/roundSettlement';
import {
  UNDO_REVEAL_MS, canUndoReveal, listAnswersToAccept, resettleWithAcceptedAnswer, undoRevealSecondsLeft, voidHand,
  canAcceptOtherAnswers, playersBeforeSettlement, type RevealSnapshot,
} from '../game/ruling';
import type { Bet, GeneratedSentence, Player } from '../types';

const cloze: GeneratedSentence = {
  text: 'She has lived here _____ 2019.',
  isCorrect: true,
  correction: '',
  explanation: '',
  grammarPhrase: '',
  questionType: 'openCloze',
  correctAnswer: 'since',
  acceptedAnswers: ['since'],
};
const flawed: GeneratedSentence = {
  text: "He don't like coffee.",
  isCorrect: false,
  correction: "He doesn't like coffee.",
  explanation: '',
  grammarPhrase: "don't like",
  questionType: 'binary',
};

function player(id: number, money = 1000): Player {
  return { id, name: `P${id}`, money, history: [], avatar: '🦊', winStreak: 0, effects: [] };
}

function snapshotFor(sentence: GeneratedSentence, bets: Record<number, Bet>, verifications: SettleRoundInput['verifications'] = {}): RevealSnapshot {
  const players = [player(1), player(2), player(3)];
  const qType = sentence.questionType || 'binary';
  const { acceptedSet, baseWordNorm } = buildAcceptedAnswerSet(sentence, qType);
  const input: SettleRoundInput = {
    currentSentence: sentence, qType, players, activePlayers: players, validPlayers: players, bets,
    activePowerUps: {}, verifications, clozeWordVerifications: {}, baseWordNorm, acceptedSet,
    isTurnTimerEnabled: false, isMultiplayer: false, teacherRevealOverride: false,
    hasPlayerPlacedBet: (id) => Number(bets[id]?.bet) > 0, currentRound: 1, roundSpending: {},
  };
  return {
    input, output: settleRound(input), revealedAt: 1_000, round: 1,
    seatsBefore: {}, turnTimersBefore: {}, teacherRevealOverrideBefore: false, corrected: false,
  };
}

const clozeBets: Record<number, Bet> = {
  1: { clozeAnswer: 'since', bet: 100 },
  2: { clozeAnswer: 'From', bet: 200 },
  3: { clozeAnswer: 'from ', bet: 50 },
};
const moneyOf = (players: Player[], id: number) => players.find((p) => p.id === id)!.money;

describe('Undo reveal', () => {
  it('is offered for 10 seconds after the reveal, for the same hand only', () => {
    const snap = snapshotFor(cloze, clozeBets);
    expect(canUndoReveal(snap, snap.revealedAt + UNDO_REVEAL_MS - 1, 1)).toBe(true);
    expect(canUndoReveal(snap, snap.revealedAt + UNDO_REVEAL_MS, 1)).toBe(false);
    expect(canUndoReveal(snap, snap.revealedAt + 1, 2)).toBe(false);
    expect(canUndoReveal({ ...snap, corrected: true }, snap.revealedAt + 1, 1)).toBe(false);
    expect(canUndoReveal(null, 0, 1)).toBe(false);
    expect(undoRevealSecondsLeft(snap, snap.revealedAt + 2_500)).toBe(8);
  });

  it('gives back the bankrolls from before the reveal', () => {
    const snap = snapshotFor(cloze, clozeBets);
    expect(moneyOf(snap.output.updatedPlayers, 2)).toBe(800);
    expect(playersBeforeSettlement(snap).map((p) => p.money)).toEqual([1000, 1000, 1000]);
  });
});

describe('Void the hand', () => {
  it('returns every stake and shows no change on the results', () => {
    const snap = snapshotFor(cloze, clozeBets);
    const voided = voidHand(snap);
    expect(voided.updatedPlayers.map((p) => p.money)).toEqual([1000, 1000, 1000]);
    expect(voided.roundResults.every((r) => r.amountChanged === 0 && r.newTotal === 1000)).toBe(true);
    expect(voided.playerResults.every((r) => r.amountChanged === 0 && !r.isWin)).toBe(true);
    expect(voided.sounds).toEqual([]);
  });
});

describe('Accept this answer too', () => {
  it('lists each losing typed answer once, ignoring case and spaces', () => {
    const snap = snapshotFor(cloze, clozeBets);
    expect(listAnswersToAccept(snap)).toEqual([{ answer: 'From', players: 2 }]);
  });

  it('settles the hand again with the answer accepted', () => {
    const snap = snapshotFor(cloze, clozeBets);
    const fixed = resettleWithAcceptedAnswer(snap, 'from');
    expect(fixed.corrected).toBe(true);
    expect(moneyOf(fixed.output.updatedPlayers, 1)).toBe(moneyOf(snap.output.updatedPlayers, 1));
    expect(moneyOf(fixed.output.updatedPlayers, 2)).toBeGreaterThan(1000);
    expect(moneyOf(fixed.output.updatedPlayers, 3)).toBeGreaterThan(1000);
    expect(listAnswersToAccept(fixed)).toEqual([]);
  });

  it('accepts a rejected correction of a flawed sentence', () => {
    const bets: Record<number, Bet> = {
      1: { opinion: 'incorrect', bet: 100, userCorrection: 'He does not like coffee.' },
      2: { opinion: 'correct', bet: 100 },
      3: { opinion: 'incorrect', bet: 100 },
    };
    const snap = snapshotFor(flawed, bets, { 1: { isCorrect: false, feedback: 'no' } });
    expect(listAnswersToAccept(snap)).toEqual([{ answer: 'He does not like coffee.', players: 1 }]);
    const fixed = resettleWithAcceptedAnswer(snap, 'He does not like coffee.');
    expect(moneyOf(fixed.output.updatedPlayers, 1)).toBeGreaterThan(moneyOf(snap.output.updatedPlayers, 1));
    expect(moneyOf(fixed.output.updatedPlayers, 2)).toBe(moneyOf(snap.output.updatedPlayers, 2));
  });

  it('is not offered for multiple choice or a valid sentence', () => {
    expect(canAcceptOtherAnswers(snapshotFor({ ...cloze, questionType: 'multipleChoice', options: ['since', 'for'] }, {}).input)).toBe(false);
    expect(canAcceptOtherAnswers(snapshotFor({ ...flawed, isCorrect: true }, {}).input)).toBe(false);
  });
});
