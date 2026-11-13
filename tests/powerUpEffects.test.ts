// One check per power-up that had none (Akita testing pass, 2026-11-13).
// Each test pins what the power-up does today, so a later change elsewhere can't quietly break it.
// The rule texts quoted in the test names come from the power-up cards (constants.ts).
import { describe, it, expect } from 'vitest';
import { settleRound, buildAcceptedAnswerSet, SettleRoundInput } from '../utils/roundSettlement';
import { buildAllPlayerViews, buildAudiencePollSummary } from '../utils/multiplayerProtocol';
import {
  applyTaxman,
  applyTithe,
  applyRobinHood,
  punisherBankroll,
  silencerDuration,
  powerUpLimitPerHand,
  teachersPetInstantGrant,
  scalpelEliminatedOptions,
  applyWheelMoneyPrize,
} from '../game/instantPowerUps';
import { drawWheelItem } from '../game/intents';
import { POWER_UPS, TAXMAN_AMOUNT, WHEEL_ITEMS } from '../constants';
import type { ActivePowerUp, Bet, GeneratedSentence, Player, PowerUpKey, QuestionType } from '../types';

// ---------- helpers ----------

const flawed: GeneratedSentence = {
  text: "He don't like coffee.",
  isCorrect: false,
  correction: "He doesn't like coffee.",
  explanation: '',
  grammarPhrase: "don't like",
  questionType: 'binary',
};

const mc: GeneratedSentence = {
  text: 'She ___ here since 2010.',
  isCorrect: true,
  correction: 'She has lived here since 2010.',
  explanation: '',
  grammarPhrase: 'has lived',
  questionType: 'multipleChoice',
  options: ['has lived', 'lives', 'is living', 'lived'],
  correctAnswer: 'has lived',
};

function player(id: number, money = 1000, extra: Partial<Player> = {}): Player {
  return { id, name: `P${id}`, money, history: [], avatar: '🦊', winStreak: 0, effects: [], ...extra };
}

const flagged = (bet: number, userCorrection?: string): Bet => ({ opinion: 'incorrect', bet, userCorrection });
const validPick = (bet: number): Bet => ({ opinion: 'correct', bet });

interface Setup {
  sentence?: GeneratedSentence;
  players: Player[];
  bets: Record<number, Bet>;
  powerUps?: Record<number, ActivePowerUp[]>;
  verifications?: SettleRoundInput['verifications'];
}

function settle({ sentence = flawed, players, bets, powerUps = {}, verifications = {} }: Setup) {
  const qType: QuestionType = sentence.questionType || 'binary';
  const { acceptedSet, baseWordNorm } = buildAcceptedAnswerSet(sentence, qType);
  const active = players.filter((p) => p.money > 0);
  return settleRound({
    currentSentence: sentence,
    qType,
    players,
    activePlayers: active,
    validPlayers: active,
    bets,
    activePowerUps: powerUps,
    verifications,
    clozeWordVerifications: {},
    baseWordNorm,
    acceptedSet,
    isTurnTimerEnabled: false,
    isMultiplayer: false,
    teacherRevealOverride: false,
    hasPlayerPlacedBet: (id) => typeof bets[id]?.bet === 'number' && Number(bets[id]?.bet) > 0,
    currentRound: 1,
    roundSpending: {},
  });
}

const money = (r: ReturnType<typeof settle>, id: number) => r.updatedPlayers.find((p) => p.id === id)!.money;
const moneyOf = (ps: Player[], id: number) => ps.find((p) => p.id === id)!.money;

function views(opts: {
  players: Player[];
  bets?: Record<number, Bet>;
  activePowerUps?: Record<number, ActivePowerUp[]>;
  powerUpsUsedThisRound?: Record<number, { key: PowerUpKey }[]>;
  sentence?: GeneratedSentence;
  step?: 'IN_GAME' | 'RESULTS';
}) {
  return buildAllPlayerViews({
    roomCode: 'TEST',
    roomLocked: false,
    step: opts.step ?? 'IN_GAME',
    currentRound: 1,
    gameMode: 'rounds',
    totalRounds: 10,
    targetAmount: 2000,
    settings: { topic: 'Tenses', level: 'B2', theme: 'General', challengeFormat: 'binary' } as any,
    customTopic: '',
    customTheme: '',
    isLoading: false,
    isProcessing: false,
    players: opts.players,
    seats: {},
    bets: opts.bets ?? {},
    hints: {},
    activePowerUps: opts.activePowerUps ?? {},
    powerUpsUsedThisRound: (opts.powerUpsUsedThisRound ?? {}) as any,
    availablePowerUps: ['JACKPOT', 'SHIELD', 'LONE_WOLF', 'SAFETY_NET'],
    currentSentence: opts.sentence ?? flawed,
    roundResults: [],
    winner: null,
    studentPendingTarget: {},
    studentPendingWheel: {},
    studentNotifications: {},
  });
}

// ---------- power-ups paid out at the end of the hand ----------

describe('Half-Baked', () => {
  it("cuts the target's winnings in half", () => {
    const r = settle({
      players: [player(1), player(2)],
      bets: { 1: flagged(100), 2: flagged(100) },
      powerUps: { 2: [{ type: 'HALF_BAKED', target: 1 }] },
    });
    expect(money(r, 1)).toBe(1050);
    expect(money(r, 2)).toBe(1100);
  });

  it('does nothing to a target who loses', () => {
    const r = settle({
      players: [player(1), player(2)],
      bets: { 1: validPick(100), 2: flagged(100) },
      powerUps: { 2: [{ type: 'HALF_BAKED', target: 1 }] },
    });
    expect(money(r, 1)).toBe(900);
  });
});

describe('Bounty Hunter', () => {
  it('pays 1.5x when the holder wins with the minority answer', () => {
    const r = settle({
      players: [player(1), player(2), player(3)],
      bets: { 1: flagged(100), 2: validPick(100), 3: validPick(100) },
      powerUps: { 1: [{ type: 'BOUNTY_HUNTER' }] },
    });
    expect(money(r, 1)).toBe(1150);
  });

  it('pays normally when the winning answer was the majority', () => {
    const r = settle({
      players: [player(1), player(2), player(3)],
      bets: { 1: flagged(100), 2: flagged(100), 3: validPick(100) },
      powerUps: { 1: [{ type: 'BOUNTY_HUNTER' }] },
    });
    expect(money(r, 1)).toBe(1100);
  });
});

describe('Crowd Surfer', () => {
  it('adds 10% for every other winner', () => {
    const r = settle({
      players: [player(1), player(2), player(3), player(4)],
      bets: { 1: flagged(100), 2: flagged(100), 3: flagged(100), 4: validPick(100) },
      powerUps: { 1: [{ type: 'CROWD_SURFER' }] },
    });
    // 2 other winners: +20% of 100.
    expect(money(r, 1)).toBe(1120);
  });

  it('adds nothing when the holder is the only winner', () => {
    const r = settle({
      players: [player(1), player(2)],
      bets: { 1: flagged(100), 2: validPick(100) },
      powerUps: { 1: [{ type: 'CROWD_SURFER' }] },
    });
    expect(money(r, 1)).toBe(1100);
  });
});

describe('Snowball', () => {
  it('adds 10% of the win for each hand of the current win streak', () => {
    const r = settle({
      players: [player(1, 1000, { winStreak: 3 })],
      bets: { 1: flagged(100) },
      powerUps: { 1: [{ type: 'SNOWBALL' }] },
    });
    expect(money(r, 1)).toBe(1130);
  });

  it('adds nothing without a streak', () => {
    const r = settle({ players: [player(1)], bets: { 1: flagged(100) }, powerUps: { 1: [{ type: 'SNOWBALL' }] } });
    expect(money(r, 1)).toBe(1100);
  });
});

describe('Correction Bounty', () => {
  it('pays the correction bonus a second time for an accepted correction', () => {
    const r = settle({
      players: [player(1)],
      bets: { 1: flagged(100, "He doesn't like coffee.") },
      powerUps: { 1: [{ type: 'CORRECTION_BOUNTY' }] },
      verifications: { 1: { isCorrect: true, feedback: 'ok' } },
    });
    // Win 100 + correction 100 + bounty 100.
    expect(money(r, 1)).toBe(1300);
  });

  it('pays no bounty when the correction is rejected', () => {
    const r = settle({
      players: [player(1)],
      bets: { 1: flagged(100, 'nonsense') },
      powerUps: { 1: [{ type: 'CORRECTION_BOUNTY' }] },
      verifications: { 1: { isCorrect: false, feedback: 'no' } },
    });
    expect(money(r, 1)).toBe(1100);
  });
});

describe('Savings Account', () => {
  it('pays 40% interest on the money not bet, win or lose', () => {
    const win = settle({ players: [player(1)], bets: { 1: flagged(100) }, powerUps: { 1: [{ type: 'SAVINGS_ACCOUNT' }] } });
    expect(money(win, 1)).toBe(1000 + 100 + 360);
    const lose = settle({ players: [player(1)], bets: { 1: validPick(100) }, powerUps: { 1: [{ type: 'SAVINGS_ACCOUNT' }] } });
    expect(money(lose, 1)).toBe(1000 - 100 + 360);
  });
});

describe("Teacher's Pet", () => {
  it('pays +50% of the bankroll when a win completes a 3-win streak, then is used up', () => {
    const r = settle({
      players: [player(1, 1000, { winStreak: 2, effects: [{ type: 'TEACHERS_PET', roundsLeft: -1 }] })],
      bets: { 1: flagged(100) },
    });
    expect(money(r, 1)).toBe(1000 + 100 + 500);
    expect(r.updatedPlayers[0].effects.some((e) => e.type === 'TEACHERS_PET')).toBe(false);
  });

  it('keeps waiting while the streak is shorter', () => {
    const r = settle({
      players: [player(1, 1000, { winStreak: 0, effects: [{ type: 'TEACHERS_PET', roundsLeft: -1 }] })],
      bets: { 1: flagged(100) },
    });
    expect(money(r, 1)).toBe(1100);
    expect(r.updatedPlayers[0].effects.some((e) => e.type === 'TEACHERS_PET')).toBe(true);
  });

  it('pays at once when bought with a 3-win streak already running', () => {
    expect(teachersPetInstantGrant(3, 951)).toBe(475);
    expect(teachersPetInstantGrant(2, 951)).toBe(0);
  });
});

describe('Scavenger', () => {
  it("collects 25% of the rivals' losses", () => {
    const r = settle({
      players: [player(1), player(2), player(3)],
      bets: { 1: flagged(100), 2: validPick(200), 3: validPick(200) },
      powerUps: { 1: [{ type: 'SCAVENGER' }] },
    });
    expect(money(r, 1)).toBe(1000 + 100 + 100);
  });

  it('collects at most $500', () => {
    const r = settle({
      players: [player(1), player(2, 5000), player(3, 5000)],
      bets: { 1: flagged(100), 2: validPick(4000), 3: validPick(4000) },
      powerUps: { 1: [{ type: 'SCAVENGER' }] },
    });
    expect(money(r, 1)).toBe(1000 + 100 + 500);
  });
});

// ---------- power-ups that act the moment they are bought ----------

describe('Taxman', () => {
  it(`takes $${TAXMAN_AMOUNT} from each active rival without a Shield`, () => {
    const players = [player(1), player(2), player(3), player(4, 40)];
    const { players: after, collected } = applyTaxman(1, players, players, { 3: [{ type: 'SHIELD' }] });
    expect(moneyOf(after, 2)).toBe(1000 - TAXMAN_AMOUNT);
    expect(moneyOf(after, 3)).toBe(1000); // shielded
    expect(moneyOf(after, 4)).toBe(0); // only had $40
    expect(collected).toBe(TAXMAN_AMOUNT + 40);
    expect(moneyOf(after, 1)).toBe(1000 + collected);
  });

  it('never charges a player who is out of the hand', () => {
    const players = [player(1), player(2)];
    const { players: after } = applyTaxman(1, players, [players[0]], {});
    expect(moneyOf(after, 2)).toBe(1000);
  });
});

describe('The Tithe', () => {
  it('takes 10% (rounded down) from each active rival without a Shield', () => {
    const players = [player(1), player(2, 999), player(3, 500)];
    const { players: after, collected } = applyTithe(1, players, players, { 3: [{ type: 'GUARDIAN_ANGEL' }] });
    expect(moneyOf(after, 2)).toBe(900);
    expect(moneyOf(after, 3)).toBe(500);
    expect(collected).toBe(99);
    expect(moneyOf(after, 1)).toBe(1099);
  });
});

describe('Robin Hood', () => {
  it('takes 20% from the richest player and shares it among the others', () => {
    const players = [player(1, 500), player(2, 2000), player(3, 300)];
    const r = applyRobinHood(players, players, {});
    expect(r.totalStolen).toBe(400);
    expect(moneyOf(r.players, 2)).toBe(1600);
    expect(moneyOf(r.players, 1)).toBe(700);
    expect(moneyOf(r.players, 3)).toBe(500);
  });

  it('robs every player tied for richest', () => {
    const players = [player(1, 100), player(2, 1000), player(3, 1000)];
    const r = applyRobinHood(players, players, {});
    expect(moneyOf(r.players, 2)).toBe(800);
    expect(moneyOf(r.players, 3)).toBe(800);
    expect(moneyOf(r.players, 1)).toBe(500);
  });

  it('takes nothing from a richest player with a Shield', () => {
    const players = [player(1, 500), player(2, 2000)];
    const r = applyRobinHood(players, players, { 2: [{ type: 'SHIELD' }] });
    expect(r.totalStolen).toBe(0);
    expect(r.players.map((p) => p.money)).toEqual([500, 2000]);
  });

  it('never creates or destroys more than the rounding remainder', () => {
    const players = [player(1, 10), player(2, 1001), player(3, 20), player(4, 30)];
    const before = players.reduce((s, p) => s + p.money, 0);
    const r = applyRobinHood(players, players, {});
    const after = r.players.reduce((s, p) => s + p.money, 0);
    expect(before - after).toBeGreaterThanOrEqual(0);
    expect(before - after).toBeLessThan(r.beneficiaries.length || 1);
  });
});

describe('The Punisher', () => {
  it("cuts the target's bankroll by 25%, rounded down", () => {
    expect(punisherBankroll(1000)).toBe(750);
    expect(punisherBankroll(101)).toBe(75);
    expect(punisherBankroll(0)).toBe(0);
  });
});

describe('Silencer', () => {
  it('silences for 1 hand, or 2 if the target already used a power-up this hand', () => {
    expect(silencerDuration(0)).toBe(1);
    expect(silencerDuration(1)).toBe(2);
  });
});

describe('Power Surge', () => {
  it('raises the power-up limit for the hand from 1 to 3', () => {
    expect(powerUpLimitPerHand([])).toBe(1);
    expect(powerUpLimitPerHand(undefined)).toBe(1);
    expect(powerUpLimitPerHand([{ type: 'POWER_SURGE' }])).toBe(3);
  });

  it("lets the holder's phone keep buying after the first power-up", () => {
    const players = [player(1), player(2)];
    const used = { 1: [{ key: 'POWER_SURGE' as PowerUpKey }], 2: [{ key: 'JACKPOT' as PowerUpKey }] };
    const v = views({ players, activePowerUps: { 1: [{ type: 'POWER_SURGE' }] }, powerUpsUsedThisRound: used });
    expect(v[1].canBuyPowerUp).toBe(true);
    expect(v[2].canBuyPowerUp).toBe(false);
  });
});

describe('Scalpel', () => {
  it('removes exactly 2 wrong options and never the answer', () => {
    for (let seed = 0; seed < 50; seed++) {
      let x = seed + 1;
      const rnd = () => ((x = (x * 16807) % 2147483647) / 2147483647);
      const gone = scalpelEliminatedOptions(mc.options, mc.correctAnswer, rnd);
      expect(gone).toHaveLength(2);
      expect(gone).not.toContain('has lived');
      for (const g of gone) expect(mc.options).toContain(g);
    }
  });

  it("shows the removed options on the holder's phone only", () => {
    const players = [player(1), player(2)];
    const v = views({
      players,
      sentence: mc,
      activePowerUps: { 1: [{ type: 'SCALPEL', eliminatedOptions: ['lives', 'lived'] }] },
    });
    expect(v[1].scalpelHint).toEqual({ eliminatedOptions: ['lives', 'lived'] });
    expect(v[2].scalpelHint).toBeNull();
  });

  it('gives a first-letter clue on an open cloze without the whole word', () => {
    const cloze: GeneratedSentence = { ...flawed, questionType: 'openCloze', text: 'I have ___ been there.', correctAnswer: 'never' };
    const v = views({ players: [player(1)], sentence: cloze, activePowerUps: { 1: [{ type: 'SCALPEL' }] } });
    expect(v[1].scalpelHint?.clozeMask).toBe('n _ _ _ _ (5 letters)');
  });
});

describe('Grammar Goggles', () => {
  it("shows the key phrase on the holder's phone only, during the hand", () => {
    const players = [player(1), player(2)];
    const v = views({ players, activePowerUps: { 1: [{ type: 'GRAMMAR_GOGGLES' }] } });
    expect(v[1].sentence?.grammarPhrase).toBe("don't like");
    expect(v[2].sentence?.grammarPhrase).toBeUndefined();
  });
});

describe('Peekaboo', () => {
  it("shows the spy the target's live answer and wager, and nobody else", () => {
    const players = [player(1), player(2), player(3)];
    const v = views({
      players,
      bets: { 2: flagged(250) },
      activePowerUps: { 1: [{ type: 'PEEKABOO', target: 2 }] },
    });
    expect(v[1].peekabooSpyFeed).toEqual([
      expect.objectContaining({ targetId: 2, betAmount: 250, answerSummary: '✕ Flawed' }),
    ]);
    expect(v[3].peekabooSpyFeed).toBeUndefined();
  });
});

describe('Ask the Table (Audience Poll)', () => {
  it("summarises the rivals' answers and average bet, leaving out the holder", () => {
    const players = [player(1), player(2), player(3), player(4)];
    const bets = { 1: flagged(999), 2: flagged(100), 3: flagged(200), 4: validPick(300) };
    const poll = buildAudiencePollSummary(players, bets, {}, flawed, 1);
    expect(poll.totalRivals).toBe(3);
    expect(poll.submittedCount).toBe(3);
    expect(poll.averageBet).toBe(200);
    expect(poll.breakdown).toEqual([
      { label: '✓ Valid', count: 1, percent: 33 },
      { label: '✕ Flawed', count: 2, percent: 67 },
    ]);
  });

  it("puts the poll on the holder's phone only", () => {
    const players = [player(1), player(2)];
    const v = views({ players, activePowerUps: { 1: [{ type: 'AUDIENCE_POLL' }] } });
    expect(v[1].audiencePollFeed?.totalRivals).toBe(1);
    expect(v[2].audiencePollFeed).toBeNull();
  });
});

describe('The Wheel', () => {
  it('can land on every prize, and only on real prizes', () => {
    const seen = new Set<string>();
    for (let i = 0; i < WHEEL_ITEMS.length; i++) {
      seen.add(drawWheelItem(() => (i + 0.5) / WHEEL_ITEMS.length).id);
    }
    expect(seen).toEqual(new Set(WHEEL_ITEMS.map((w) => w.id)));
    expect(WHEEL_ITEMS.map((w) => w.id)).toContain(drawWheelItem(() => 0.9999999).id);
  });

  it('pays the money prizes as the wheel says', () => {
    const ps = [player(1, 1000), player(2, 1000), player(3, 50)];
    expect(moneyOf(applyWheelMoneyPrize('jackpot', 1, ps, {}), 1)).toBe(1500);
    expect(moneyOf(applyWheelMoneyPrize('lucky_refund', 1, ps, {}), 1)).toBe(1300);
    expect(moneyOf(applyWheelMoneyPrize('house_tax', 3, ps, {}), 3)).toBe(0);
    const charity = applyWheelMoneyPrize('forced_charity', 1, ps, {});
    expect(charity.map((p) => p.money)).toEqual([950, 1025, 75]);
  });

  it('Bounty takes up to $100 from each rival, skipping anyone with a Shield', () => {
    const ps = [player(1, 1000), player(2, 1000), player(3, 50), player(4, 1000)];
    const after = applyWheelMoneyPrize('bounty', 1, ps, { 4: [{ type: 'SHIELD' }] });
    expect(after.map((p) => p.money)).toEqual([1150, 900, 0, 1000]);
  });

  it('leaves money alone for prizes that only add an effect', () => {
    const ps = [player(1), player(2)];
    for (const id of ['shield', 'freeze', 'safety_net', 'silenced', 'bet_cap']) {
      expect(applyWheelMoneyPrize(id, 1, ps, {}).map((p) => p.money)).toEqual([1000, 1000]);
    }
  });
});

describe('coverage of this file', () => {
  it('names a real power-up in every describe block above', () => {
    // Guards against a power-up being renamed and its test silently going stale.
    const keys: PowerUpKey[] = [
      'GRAMMAR_GOGGLES', 'THE_WHEEL', 'TAXMAN', 'HALF_BAKED', 'BOUNTY_HUNTER', 'POWER_SURGE', 'SAVINGS_ACCOUNT',
      'SNOWBALL', 'THE_PUNISHER', 'THE_TITHE', 'ROBIN_HOOD', 'SILENCER', 'TEACHERS_PET', 'CORRECTION_BOUNTY',
      'SCALPEL', 'PEEKABOO', 'CROWD_SURFER', 'AUDIENCE_POLL', 'SCAVENGER',
    ];
    for (const k of keys) expect(POWER_UPS[k], k).toBeDefined();
  });
});
