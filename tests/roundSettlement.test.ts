// Characterisation tests for round settlement: they pin how payouts work today,
// so later changes to power-ups or game rules can't silently change them.
import { describe, it, expect } from 'vitest';
import { settleRound, buildAcceptedAnswerSet, SettleRoundInput } from '../utils/roundSettlement';
import { Player, Bet, ActivePowerUp, GeneratedSentence, PlayerEffect, QuestionType } from '../types';

const flawed: GeneratedSentence = {
  text: 'He don\'t like coffee.',
  isCorrect: false,
  correction: 'He doesn\'t like coffee.',
  explanation: '',
  grammarPhrase: 'don\'t like',
  questionType: 'binary',
};
const valid: GeneratedSentence = { ...flawed, text: 'He doesn\'t like coffee.', isCorrect: true };

const kwt: GeneratedSentence = {
  text: 'Sarah _____ three years.',
  leadInSentence: 'Sarah started playing the piano three years ago.',
  isCorrect: true,
  correction: 'Sarah has played the piano for three years.',
  explanation: '',
  grammarPhrase: '',
  questionType: 'keyWordTransformation',
  baseWord: 'FOR',
  correctAnswer: 'has played the piano for',
  acceptedAnswers: ['has played the piano for', 'has been playing the piano for'],
  mark1Parts: ['has played', 'has been playing'],
  mark2Parts: ['the piano for'],
};

function player(id: number, money = 1000, extra: Partial<Player> = {}): Player {
  return { id, name: `P${id}`, money, history: [], avatar: '🦊', winStreak: 0, effects: [], ...extra };
}

interface Setup {
  sentence?: GeneratedSentence;
  players: Player[];
  bets: Record<number, Bet>;
  powerUps?: Record<number, ActivePowerUp[]>;
  verifications?: SettleRoundInput['verifications'];
  clozeWordVerifications?: SettleRoundInput['clozeWordVerifications'];
}

function settle({ sentence = flawed, players, bets, powerUps = {}, verifications = {}, clozeWordVerifications = {} }: Setup) {
  const qType: QuestionType = sentence.questionType || 'binary';
  const { acceptedSet, baseWordNorm } = buildAcceptedAnswerSet(sentence, qType);
  const active = players.filter(p => p.money > 0);
  return settleRound({
    currentSentence: sentence,
    qType,
    players,
    activePlayers: active,
    validPlayers: active,
    bets,
    activePowerUps: powerUps,
    verifications,
    clozeWordVerifications,
    baseWordNorm,
    acceptedSet,
    isTurnTimerEnabled: false,
    isMultiplayer: false,
    teacherRevealOverride: false,
    hasPlayerPlacedBet: id => typeof bets[id]?.bet === 'number' && Number(bets[id]?.bet) > 0,
    currentRound: 1,
    roundSpending: {},
  });
}

const money = (r: ReturnType<typeof settle>, id: number) => r.updatedPlayers.find(p => p.id === id)!.money;
const flagged = (bet: number, userCorrection?: string): Bet => ({ opinion: 'incorrect', bet, userCorrection });
const validPick = (bet: number): Bet => ({ opinion: 'correct', bet });
const okFix = { isCorrect: true, feedback: 'ok' };

describe('basic Valid / Flawed payouts', () => {
  it('pays the wager on a win and takes it on a loss', () => {
    const r = settle({ players: [player(1), player(2)], bets: { 1: flagged(100), 2: validPick(200) } });
    expect(money(r, 1)).toBe(1100);
    expect(money(r, 2)).toBe(800);
    expect(r.sounds).toEqual([{ sound: 'win', index: 0 }, { sound: 'lose', index: 0 }]);
  });

  it('adds a correction bonus equal to the wager for an accepted correction', () => {
    const r = settle({ players: [player(1)], bets: { 1: flagged(100, 'fix') }, verifications: { 1: okFix } });
    expect(money(r, 1)).toBe(1200);
    expect(r.roundResults[0].correctionFeedback).toMatch(/^Accepted!/);
  });

  it('updates win streaks and history', () => {
    const r = settle({ players: [player(1, 1000, { winStreak: 2 }), player(2, 1000, { winStreak: 2 })], bets: { 1: flagged(100), 2: validPick(100) } });
    expect(r.updatedPlayers[0].winStreak).toBe(3);
    expect(r.updatedPlayers[1].winStreak).toBe(0);
    expect(r.updatedPlayers[0].history).toEqual([{ round: 1, amount: 100, spent: 0, endTotal: 1100, sentence: flawed.text }]);
  });

  it('caps a bet at the Bet Cap amount when targeted', () => {
    const r = settle({
      sentence: valid,
      players: [player(1), player(2)],
      bets: { 1: validPick(400), 2: validPick(10) },
      powerUps: { 2: [{ type: 'BET_CAP', target: 1 }] },
    });
    expect(money(r, 1)).toBe(1050);
  });

  it('leaves a frozen player untouched', () => {
    const r = settle({
      players: [player(1), player(2)],
      bets: { 1: flagged(100), 2: validPick(100) },
      powerUps: { 2: [{ type: 'SUB_ZERO', target: 1 }] },
    });
    expect(money(r, 1)).toBe(1000);
    expect(r.roundResults.find(x => x.name === 'P1')!.outcomeText).toContain('Frozen');
  });
});

describe('Double or Nothing', () => {
  const dbl = { 1: [{ type: 'DOUBLE_OR_NOTHING' } as ActivePowerUp] };

  it('pays 3x the wager on a win', () => {
    const r = settle({ sentence: valid, players: [player(1)], bets: { 1: validPick(100) }, powerUps: dbl });
    expect(money(r, 1)).toBe(1300);
  });

  it('loses 1.5x when a flawed sentence is flagged without a valid correction', () => {
    const r = settle({ players: [player(1)], bets: { 1: flagged(100) }, powerUps: dbl });
    expect(money(r, 1)).toBe(850);
    expect(r.roundResults[0].outcomeText).toContain('Failed Mandatory Correction');
  });

  it('pays 3x when a flawed sentence is flagged with a valid correction', () => {
    const r = settle({ players: [player(1)], bets: { 1: flagged(100, 'fix') }, powerUps: dbl, verifications: { 1: okFix } });
    expect(money(r, 1)).toBe(1300);
  });
});

describe('protective power-ups', () => {
  it('Immunity Idol cancels a loss', () => {
    const r = settle({ players: [player(1)], bets: { 1: validPick(300) }, powerUps: { 1: [{ type: 'IMMUNITY_IDOL' }] } });
    expect(money(r, 1)).toBe(1000);
  });

  it('Safety Net halves a loss', () => {
    const r = settle({ players: [player(1)], bets: { 1: validPick(300) }, powerUps: { 1: [{ type: 'SAFETY_NET' }] } });
    expect(money(r, 1)).toBe(850);
  });

  it('Second Chance revives a bankrupt player with $300 and is used up', () => {
    const effects: PlayerEffect[] = [{ type: 'SECOND_CHANCE', roundsLeft: -1 }];
    const r = settle({ players: [player(1, 200, { effects })], bets: { 1: validPick(200) } });
    expect(money(r, 1)).toBe(300);
    expect(r.updatedPlayers[0].effects).toEqual([]);
  });
});

describe('crowd power-ups', () => {
  it('Lone Wolf pays 3x when the caster is the only winner', () => {
    const r = settle({
      players: [player(1), player(2)],
      bets: { 1: flagged(100), 2: validPick(100) },
      powerUps: { 1: [{ type: 'LONE_WOLF' }] },
    });
    expect(money(r, 1)).toBe(1300);
  });

  it('Lone Wolf pays normally when someone else also wins', () => {
    const r = settle({
      players: [player(1), player(2)],
      bets: { 1: flagged(100), 2: flagged(100) },
      powerUps: { 1: [{ type: 'LONE_WOLF' }] },
    });
    expect(money(r, 1)).toBe(1100);
  });
});

describe('relational power-ups (second pass)', () => {
  it('Copycat earns half the target\'s winnings (at least $50)', () => {
    const r = settle({
      players: [player(1), player(2)],
      bets: { 1: flagged(10), 2: flagged(400) },
      powerUps: { 1: [{ type: 'COPYCAT', target: 2 }] },
    });
    expect(money(r, 1)).toBe(1000 + 10 + 200);
    expect(money(r, 2)).toBe(1400);
  });

  it('Copycat costs $100 when the target loses', () => {
    const r = settle({
      players: [player(1), player(2)],
      bets: { 1: flagged(10), 2: validPick(100) },
      powerUps: { 1: [{ type: 'COPYCAT', target: 2 }] },
    });
    expect(money(r, 1)).toBe(1000 + 10 - 100);
  });

  it('Blood Pact gives both winners a 50% bonus', () => {
    const r = settle({
      players: [player(1), player(2)],
      bets: { 1: flagged(200), 2: flagged(40) },
      powerUps: { 1: [{ type: 'BLOOD_PACT', target: 2 }] },
    });
    expect(money(r, 1)).toBe(1000 + 200 + 100);
    expect(money(r, 2)).toBe(1000 + 40 + 50);
  });

  it('Blood Pact moves $100 from the loser to the winner', () => {
    const r = settle({
      players: [player(1), player(2)],
      bets: { 1: flagged(200), 2: validPick(40) },
      powerUps: { 1: [{ type: 'BLOOD_PACT', target: 2 }] },
    });
    expect(money(r, 1)).toBe(1000 + 200 + 100);
    expect(money(r, 2)).toBe(1000 - 40 - 100);
  });
});

describe('Key Word Transformation marks', () => {
  it('pays 2x for 2 marks, 1x for 1 mark and loses for 0 marks', () => {
    const r = settle({
      sentence: kwt,
      players: [player(1), player(2), player(3)],
      bets: {
        1: { bet: 100, clozeAnswer: 'has been playing the piano for' },
        2: { bet: 100, clozeAnswer: 'has played piano since for' },
        3: { bet: 100, clozeAnswer: 'played for' },
      },
    });
    expect(money(r, 1)).toBe(1200);
    expect(r.playerResults[0].marksAwarded).toBe(2);
    expect(money(r, 2)).toBe(1100);
    expect(r.playerResults[1].marksAwarded).toBe(1);
    expect(money(r, 3)).toBe(900);
    expect(r.playerResults[2].marksAwarded).toBe(0);
  });
});
