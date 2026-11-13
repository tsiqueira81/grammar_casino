// Power-ups that act the moment they are bought, as plain functions (Akita testing pass).
// App.tsx used to compute these inline inside setState calls, so no test could reach them.
// The maths here is exactly what App.tsx did before; App.tsx now calls these functions.
import type { ActivePowerUp, Player } from '../types';
import { TAXMAN_AMOUNT } from '../constants';
import { hasShieldProtection } from './status';
import { isProtectedFromWheelBounty } from './powerUpRules';

type PowerUpMap = Record<number, ActivePowerUp[] | undefined>;

const isShielded = (activePowerUps: PowerUpMap, id: number) =>
  hasShieldProtection((activePowerUps[id] || []) as ActivePowerUp[]);

export interface CollectResult {
  players: Player[];
  collected: number;
}

/**
 * Taxman and The Tithe: every active rival without a Shield pays the caster.
 * Taxman takes a flat TAXMAN_AMOUNT (or what the rival has left); The Tithe takes 10%, rounded down.
 */
function collectFromRivals(
  kind: 'TAXMAN' | 'THE_TITHE',
  casterId: number,
  players: readonly Player[],
  activePlayers: readonly Pick<Player, 'id'>[],
  activePowerUps: PowerUpMap,
): CollectResult {
  let collected = 0;
  const taxed = players.map((p) => {
    if (p.id !== casterId && activePlayers.some((ap) => ap.id === p.id) && !isShielded(activePowerUps, p.id)) {
      const tax = kind === 'TAXMAN' ? Math.min(TAXMAN_AMOUNT, p.money) : Math.floor(p.money * 0.1);
      collected += tax;
      return { ...p, money: p.money - tax };
    }
    return p;
  });
  return {
    players: taxed.map((p) => (p.id === casterId ? { ...p, money: p.money + collected } : p)),
    collected,
  };
}

export function applyTaxman(
  casterId: number,
  players: readonly Player[],
  activePlayers: readonly Pick<Player, 'id'>[],
  activePowerUps: PowerUpMap,
): CollectResult {
  return collectFromRivals('TAXMAN', casterId, players, activePlayers, activePowerUps);
}

export function applyTithe(
  casterId: number,
  players: readonly Player[],
  activePlayers: readonly Pick<Player, 'id'>[],
  activePowerUps: PowerUpMap,
): CollectResult {
  return collectFromRivals('THE_TITHE', casterId, players, activePlayers, activePowerUps);
}

export interface RobinHoodResult {
  players: Player[];
  totalStolen: number;
  /** Who lost money, with the amount. */
  robbed: { id: number; name: string; amount: number }[];
  /** Who received a share. Empty when nobody was eligible or nothing was taken. */
  beneficiaries: { id: number; name: string; amount: number }[];
}

/**
 * Robin Hood: takes 20% (rounded down) from the richest active player(s) without a Shield and shares
 * it equally (rounded down) among every other player who still has money. The caster can be robbed
 * if they are the richest, exactly as before.
 */
export function applyRobinHood(
  players: readonly Player[],
  activePlayers: readonly Pick<Player, 'id' | 'money'>[],
  activePowerUps: PowerUpMap,
): RobinHoodResult {
  const richestAmount = Math.max(...activePlayers.map((p) => p.money));
  const richestIds = new Set(activePlayers.filter((p) => p.money === richestAmount).map((p) => p.id));
  let totalStolen = 0;
  const robbed: RobinHoodResult['robbed'] = [];
  const afterTheft = players.map((p) => {
    if (richestIds.has(p.id) && !isShielded(activePowerUps, p.id)) {
      const stolen = Math.floor(p.money * 0.2);
      totalStolen += stolen;
      robbed.push({ id: p.id, name: p.name, amount: stolen });
      return { ...p, money: p.money - stolen };
    }
    return p;
  });
  const eligible = afterTheft.filter((p) => !richestIds.has(p.id) && p.money > 0);
  if (eligible.length === 0 || totalStolen <= 0) {
    return { players: afterTheft, totalStolen, robbed, beneficiaries: [] };
  }
  const share = Math.floor(totalStolen / eligible.length);
  const eligibleIds = new Set(eligible.map((p) => p.id));
  const beneficiaries: RobinHoodResult['beneficiaries'] = [];
  const shared = afterTheft.map((p) => {
    if (!eligibleIds.has(p.id)) return p;
    beneficiaries.push({ id: p.id, name: p.name, amount: share });
    return { ...p, money: p.money + share };
  });
  return { players: shared, totalStolen, robbed, beneficiaries };
}

/** The Punisher: the target keeps 75% of their bankroll, rounded down. */
export function punisherBankroll(targetMoney: number): number {
  return Math.floor(targetMoney * 0.75);
}

/** Silencer: 2 hands of silence if the target already used a power-up this hand, otherwise 1. */
export function silencerDuration(targetPowerUpsUsedThisHand: number): 1 | 2 {
  return targetPowerUpsUsedThisHand > 0 ? 2 : 1;
}

/** Power Surge lets its holder use up to 3 power-ups in a hand instead of 1. */
export function powerUpLimitPerHand(ownActivePowerUps: readonly ActivePowerUp[] | undefined): 1 | 3 {
  return (ownActivePowerUps || []).some((pu) => pu.type === 'POWER_SURGE') ? 3 : 1;
}

/**
 * Teacher's Pet bought with a 3-win streak already running pays +50% of the bankroll left after
 * buying it, at once. Otherwise it waits (as an effect) for the streak; returns 0 then.
 */
export function teachersPetInstantGrant(winStreak: number, moneyAfterPurchase: number): number {
  return winStreak >= 3 ? Math.floor(moneyAfterPurchase * 0.5) : 0;
}

/**
 * Scalpel on a multiple-choice hand removes 2 wrong options at random. Never removes the answer.
 * `random` is injectable so tests are repeatable; App.tsx passes Math.random.
 */
export function scalpelEliminatedOptions(
  options: readonly string[] | undefined,
  correctAnswer: string | undefined,
  random: () => number = Math.random,
): string[] {
  const correctNorm = (correctAnswer || '').trim().toLowerCase();
  const wrong = (options || []).filter((o) => o.trim().toLowerCase() !== correctNorm);
  return [...wrong].sort(() => random() - 0.5).slice(0, 2);
}

/** What a Wheel of Fortune prize does to bankrolls (prizes that only add an effect return players unchanged). */
export function applyWheelMoneyPrize(
  prizeId: string,
  spinnerId: number,
  players: readonly Player[],
  activePowerUps: PowerUpMap,
): Player[] {
  switch (prizeId) {
    case 'jackpot':
      return players.map((p) => (p.id === spinnerId ? { ...p, money: p.money + 500 } : p));
    case 'house_tax':
      return players.map((p) => (p.id === spinnerId ? { ...p, money: Math.max(0, p.money - 100) } : p));
    case 'lucky_refund':
      return players.map((p) => (p.id === spinnerId ? { ...p, money: p.money + 300 } : p));
    case 'bounty': {
      let stolen = 0;
      const updated = players.map((p) => {
        if (p.id !== spinnerId && p.money > 0 && !isProtectedFromWheelBounty((activePowerUps[p.id] || []) as ActivePowerUp[])) {
          const take = Math.min(100, p.money);
          stolen += take;
          return { ...p, money: p.money - take };
        }
        return p;
      });
      return updated.map((p) => (p.id === spinnerId ? { ...p, money: p.money + stolen } : p));
    }
    case 'forced_charity': {
      const others = players.filter((p) => p.id !== spinnerId && p.money > 0);
      const totalCost = others.length * 25;
      return players.map((p) => {
        if (p.id === spinnerId) return { ...p, money: Math.max(0, p.money - totalCost) };
        if (others.some((o) => o.id === p.id)) return { ...p, money: p.money + 25 };
        return p;
      });
    }
    default:
      return [...players];
  }
}
