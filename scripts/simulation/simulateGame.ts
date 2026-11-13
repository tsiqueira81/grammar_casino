// Headless game simulation (Akita testing pass, 2026-11-13).
//
// Bots play whole games, hand after hand, with random bets and random power-ups, through the
// same rule code the real game uses: settleRound (utils/roundSettlement.ts), the instant
// power-ups (game/instantPowerUps.ts), the wheel (game/intents.ts) and the end-of-game rules
// (game/flow.ts). No browser, no AI, no network, so thousands of games take seconds.
//
// After every hand it checks the things that must never happen: a balance that is negative,
// fractional or not a number, a crash in the rules, a game that never ends. tests/simulation.test.ts
// runs a few hundred games on every change; `npm run simulate` runs more and prints a summary.
//
// What it does NOT cover: screens, timers, phones, and the few instant power-ups still computed
// inside App.tsx (Pickpocket, Swap, Generous, Boomerang reflections). Those are bought as plain
// "active" power-ups here, which is enough for settlement but not for their own instant effect.
import { settleRound, buildAcceptedAnswerSet } from '../../utils/roundSettlement';
import { checkGameEnd, pickWinnerAtGameEnd } from '../../game/flow';
import { getE2eSentence } from '../../utils/e2eContent';
import { drawWheelItem } from '../../game/intents';
import { isFrozenBySubZero } from '../../game/status';
import { mayBuyPowerUps, clearNegativeEffects } from '../../game/powerUpRules';
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
} from '../../game/instantPowerUps';
import {
  POWER_UPS,
  POWERUP_COST,
  INITIAL_PLAYER_MONEY,
  CLOZE_DISABLED_POWER_UPS,
  BINARY_DISABLED_POWER_UPS,
  MP_ONLY_POWER_UPS,
} from '../../constants';
import { isGapType, isOptionType } from '../../game/questionTypes';
import type { ActivePowerUp, Bet, GameMode, GeneratedSentence, Player, PowerUpKey, QuestionType } from '../../types';

export const HOUSE_BAILOUT_AMOUNT = 150; // Same as App.tsx.
const QUESTION_TYPES: QuestionType[] = ['binary', 'multipleChoice', 'openCloze', 'wordFormation', 'keyWordTransformation', 'spotError', 'wordOrder'];
const ALL_POWER_UPS = Object.keys(POWER_UPS) as PowerUpKey[];

/** A small seeded random number generator, so a failing game can be replayed exactly. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SimOptions {
  seed: number;
  players?: number;
  gameMode?: GameMode;
  totalRounds?: number;
  targetAmount?: number;
  /** A live room: the House Bailout applies outside last player standing, and Peekaboo exists. */
  isRoom?: boolean;
  /** Chance a player buys a power-up on a hand (default 0.6). */
  powerUpChance?: number;
  /** Chance a player answers right (default 0.5). */
  skill?: number;
  /** Stop a game that has not ended after this many hands (default 400). */
  maxHands?: number;
}

export interface SimProblem {
  seed: number;
  hand: number;
  message: string;
}

export interface SimResult {
  seed: number;
  hands: number;
  ended: boolean;
  winnerId: number | null;
  finalMoney: number[];
  powerUpsBought: Partial<Record<PowerUpKey, number>>;
  /** Power-ups bought by the player who went on to win. */
  winnerPowerUps: PowerUpKey[];
  problems: SimProblem[];
}

const pick = <T>(items: readonly T[], rand: () => number): T => items[Math.min(items.length - 1, Math.floor(rand() * items.length))];

function sentenceFor(rand: () => number): GeneratedSentence {
  const qType = pick(QUESTION_TYPES, rand);
  return getE2eSentence(qType, rand() < 0.5);
}

/** A bet that is right with probability `skill`, for any question type. */
function makeBet(s: GeneratedSentence, money: number, rand: () => number, skill: number): Bet {
  const stake = Math.max(1, Math.min(money, 10 * (1 + Math.floor(rand() * 30))));
  const right = rand() < skill;
  const qType = s.questionType || 'binary';
  if (qType === 'binary') {
    const opinion: 'correct' | 'incorrect' = right === s.isCorrect ? 'correct' : 'incorrect';
    return { bet: stake, opinion, userCorrection: opinion === 'incorrect' ? s.correction || 'fixed' : undefined };
  }
  if (isOptionType(qType)) {
    const wrong = (s.options || []).filter((o) => o !== s.correctAnswer);
    return { bet: stake, selectedOption: right ? s.correctAnswer : pick(wrong.length ? wrong : ['?'], rand) };
  }
  return { bet: stake, clozeAnswer: right ? s.correctAnswer : 'wrong answer' };
}

function powerUpAllowed(key: PowerUpKey, s: GeneratedSentence, isRoom: boolean): boolean {
  const cloze = isGapType(s.questionType);
  if (cloze && CLOZE_DISABLED_POWER_UPS.includes(key)) return false;
  if (!cloze && BINARY_DISABLED_POWER_UPS.includes(key)) return false;
  if (!isRoom && MP_ONLY_POWER_UPS.includes(key)) return false;
  return true;
}

function checkBalances(players: readonly Player[], where: string): string | null {
  for (const p of players) {
    if (!Number.isFinite(p.money)) return `${where}: P${p.id} has a balance that is not a number (${p.money})`;
    if (p.money < 0) return `${where}: P${p.id} has a negative balance ($${p.money})`;
    if (!Number.isInteger(p.money)) return `${where}: P${p.id} has a fractional balance ($${p.money})`;
  }
  return null;
}

export function simulateGame(opts: SimOptions): SimResult {
  const rand = seededRandom(opts.seed);
  const gameMode: GameMode = opts.gameMode ?? 'rounds';
  const totalRounds = opts.totalRounds ?? 10;
  const targetAmount = opts.targetAmount ?? 3000;
  const isRoom = opts.isRoom ?? false;
  const powerUpChance = opts.powerUpChance ?? 0.6;
  const skill = opts.skill ?? 0.5;
  const maxHands = opts.maxHands ?? 400;
  const count = opts.players ?? 6;

  let players: Player[] = Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Bot ${i + 1}`,
    money: INITIAL_PLAYER_MONEY,
    history: [],
    avatar: '🤖',
    winStreak: 0,
    effects: [],
  }));
  const problems: SimProblem[] = [];
  const powerUpsBought: SimResult['powerUpsBought'] = {};
  const boughtBy = new Map<number, PowerUpKey[]>();
  let hand = 0;
  let ended = false;
  let winnerId: number | null = null;

  const fail = (message: string) => problems.push({ seed: opts.seed, hand, message });

  while (hand < maxHands) {
    hand += 1;
    const sentence = sentenceFor(rand);
    const qType: QuestionType = sentence.questionType || 'binary';
    const activePowerUps: Record<number, ActivePowerUp[]> = {};
    const used: Record<number, PowerUpKey[]> = {};
    const roundSpending: Record<number, number> = {};

    // 1. Power-ups, bought before betting, one at a time per player.
    for (const buyer of [...players]) {
      const me = players.find((p) => p.id === buyer.id)!;
      if (me.money < POWERUP_COST || !mayBuyPowerUps(me) || rand() >= powerUpChance) continue;
      const limit = powerUpLimitPerHand(activePowerUps[me.id]);
      if ((used[me.id] || []).length >= limit) continue;
      const key = pick(ALL_POWER_UPS, rand);
      if (!powerUpAllowed(key, sentence, isRoom)) continue;
      const rivals = players.filter((p) => p.id !== me.id && p.money > 0);
      if (POWER_UPS[key].requiresTarget && rivals.length === 0) continue;

      players = players.map((p) => (p.id === me.id ? { ...p, money: p.money - POWERUP_COST } : p));
      roundSpending[me.id] = (roundSpending[me.id] || 0) + POWERUP_COST;
      used[me.id] = [...(used[me.id] || []), key];
      powerUpsBought[key] = (powerUpsBought[key] || 0) + 1;
      boughtBy.set(me.id, [...(boughtBy.get(me.id) || []), key]);
      const add = (pu: ActivePowerUp) => {
        activePowerUps[me.id] = [...(activePowerUps[me.id] || []), pu];
      };
      const active = players.filter((p) => p.money > 0);
      const target = POWER_UPS[key].requiresTarget ? pick(rivals, rand) : null;

      try {
        switch (key) {
          case 'TAXMAN':
            players = applyTaxman(me.id, players, active, activePowerUps).players;
            break;
          case 'THE_TITHE':
            players = applyTithe(me.id, players, active, activePowerUps).players;
            break;
          case 'ROBIN_HOOD':
            players = applyRobinHood(players, active, activePowerUps).players;
            break;
          case 'THE_PUNISHER':
            players = players.map((p) => (p.id === target!.id ? { ...p, money: punisherBankroll(p.money) } : p));
            break;
          case 'SILENCER':
            players = players.map((p) =>
              p.id === target!.id ? { ...p, effects: [...p.effects, { type: 'SILENCED', roundsLeft: silencerDuration((used[p.id] || []).length) }] } : p,
            );
            break;
          case 'CRUCIO':
            players = players.map((p) => (p.id === target!.id ? { ...p, effects: [...p.effects, { type: 'CRUCIO', roundsLeft: 3 }] } : p));
            break;
          case 'BLESSING':
            players = players.map((p) => (p.id === me.id ? { ...p, effects: [...p.effects, { type: 'BLESSING', roundsLeft: 3 }] } : p));
            break;
          case 'SECOND_CHANCE':
            players = players.map((p) => (p.id === me.id ? { ...p, effects: [...p.effects, { type: 'SECOND_CHANCE', roundsLeft: -1 }] } : p));
            break;
          case 'GUARDIAN_ANGEL':
            players = players.map((p) => (p.id === me.id ? { ...p, effects: clearNegativeEffects(p.effects) } : p));
            add({ type: key });
            break;
          case 'TEACHERS_PET': {
            const now = players.find((p) => p.id === me.id)!;
            const grant = teachersPetInstantGrant(now.winStreak, now.money);
            if (grant > 0) {
              players = players.map((p) => (p.id === me.id ? { ...p, money: p.money + grant } : p));
            } else {
              players = players.map((p) =>
                p.id === me.id ? { ...p, effects: [...p.effects.filter((e) => e.type !== 'TEACHERS_PET'), { type: 'TEACHERS_PET', roundsLeft: -1 }] } : p,
              );
              add({ type: key });
            }
            break;
          }
          case 'SCALPEL':
            add({ type: key, eliminatedOptions: isOptionType(qType) ? scalpelEliminatedOptions(sentence.options, sentence.correctAnswer, rand) : undefined });
            break;
          case 'THE_WHEEL': {
            const prize = drawWheelItem(rand);
            players = applyWheelMoneyPrize(prize.id, me.id, players, activePowerUps);
            if (prize.id === 'shield') add({ type: 'SHIELD' });
            if (prize.id === 'safety_net') add({ type: 'SAFETY_NET' });
            break;
          }
          case 'HIGH_ROLLER':
            add({ type: key, target: target!.id, amount: Math.max(1, Math.ceil(target!.money * 0.5)) });
            break;
          case 'BET_CAP':
            add({ type: key, target: target!.id, amount: 100 });
            break;
          default:
            add(target ? { type: key, target: target.id } : { type: key });
        }
      } catch (e) {
        fail(`buying ${key} threw: ${(e as Error).message}`);
      }
      const bad = checkBalances(players, `after ${key}`);
      if (bad) fail(bad);
    }

    // 2. Bets.
    const allActive = Object.values(activePowerUps).flat();
    const bets: Record<number, Bet> = {};
    for (const p of players) {
      if (p.money <= 0 || isFrozenBySubZero(p, allActive)) continue;
      bets[p.id] = makeBet(sentence, p.money, rand, skill);
    }

    // 3. Settlement.
    const activePlayers = players.filter((p) => p.money > 0);
    const validPlayers = activePlayers.filter((p) => !isFrozenBySubZero(p, allActive));
    const { acceptedSet, baseWordNorm } = buildAcceptedAnswerSet(sentence, qType);
    const verifications = Object.fromEntries(
      Object.entries(bets)
        .filter(([, b]) => b.opinion === 'incorrect' && b.userCorrection)
        .map(([id]) => [id, { isCorrect: rand() < 0.7, feedback: 'sim' }]),
    );
    try {
      const out = settleRound({
        currentSentence: sentence,
        qType,
        players,
        activePlayers,
        validPlayers,
        bets,
        activePowerUps,
        verifications,
        clozeWordVerifications: {},
        baseWordNorm,
        acceptedSet,
        isTurnTimerEnabled: false,
        isMultiplayer: isRoom,
        teacherRevealOverride: false,
        hasPlayerPlacedBet: (id) => typeof bets[id]?.bet === 'number' && Number(bets[id]?.bet) > 0,
        currentRound: hand,
        roundSpending,
      });
      players = out.updatedPlayers;
      if (out.roundResults.some((r) => !r.outcomeText)) fail('a result line has no text');
    } catch (e) {
      fail(`settling the hand threw: ${(e as Error).message}`);
      break;
    }
    const bad = checkBalances(players, 'after settlement');
    if (bad) {
      fail(bad);
      // Keep going with a clamped table so one bug doesn't hide the next.
      players = players.map((p) => ({ ...p, money: Math.max(0, Math.round(Number.isFinite(p.money) ? p.money : 0)) }));
    }

    // 4. End of the hand.
    const endInput = { players, gameMode, currentRound: hand, totalRounds, targetAmount, isRoom };
    const end = checkGameEnd(endInput);
    if (end.isGameOver) {
      ended = true;
      winnerId = pickWinnerAtGameEnd(endInput)?.id ?? null;
      break;
    }
    if (end.bailoutEnabled) {
      players = players.map((p) => (p.money <= 0 ? { ...p, money: HOUSE_BAILOUT_AMOUNT } : p));
    }
  }

  if (!ended && gameMode === 'rounds') fail(`a ${totalRounds}-hand game did not end after ${hand} hands`);

  return {
    seed: opts.seed,
    hands: hand,
    ended,
    winnerId,
    finalMoney: players.map((p) => p.money),
    powerUpsBought,
    winnerPowerUps: winnerId != null ? boughtBy.get(winnerId) || [] : [],
    problems,
  };
}

export interface SimSummary {
  games: number;
  ended: number;
  averageHands: number;
  ties: number;
  problems: SimProblem[];
  /** For each power-up: times bought, and the share of games won by a player who bought it. */
  powerUps: { key: PowerUpKey; bought: number; winnerBoughtIt: number }[];
}

export function simulateMany(games: number, base: Omit<SimOptions, 'seed'> = {}, firstSeed = 1): SimSummary {
  const results: SimResult[] = [];
  for (let i = 0; i < games; i++) results.push(simulateGame({ ...base, seed: firstSeed + i }));
  const ended = results.filter((r) => r.ended);
  const powerUps = ALL_POWER_UPS.map((key) => ({
    key,
    bought: results.reduce((s, r) => s + (r.powerUpsBought[key] || 0), 0),
    winnerBoughtIt: results.filter((r) => r.winnerPowerUps.includes(key)).length,
  }));
  return {
    games,
    ended: ended.length,
    averageHands: results.reduce((s, r) => s + r.hands, 0) / Math.max(1, games),
    ties: ended.filter((r) => r.winnerId === null).length,
    problems: results.flatMap((r) => r.problems),
    powerUps,
  };
}
