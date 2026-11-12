// Package G3 / V9: optional end-of-game awards, so more students get a moment. Only from data the
// game already keeps (the hand history), never a rule or a payout. One award per student at most.
import type { RoundHistoryRecord } from '../types';
import { correctionAccepted } from './report';

export const AWARDS_KEY = 'grammar_casino_awards';
/** Accuracy needs at least this many bets (or every hand, in a shorter game). */
export const AWARD_MIN_BETS = 5;

export interface Award {
  id: 'sharpEye' | 'hotStreak' | 'boldBet' | 'fixer' | 'comeback';
  icon: string;
  title: string;
  playerId: number;
  name: string;
  detail: string;
}

interface Tally {
  name: string;
  bets: number;
  wins: number;
  streak: number;
  bestStreak: number;
  boldest: number;
  fixes: number;
  low: number;
  last: number;
}

export function computeAwards(history: RoundHistoryRecord[], startingCash: number): Award[] {
  const t = new Map<number, Tally>();
  const sorted = [...history].sort((a, b) => a.round - b.round);
  for (const h of sorted) {
    for (const r of h.playerResults) {
      let p = t.get(r.playerId);
      if (!p) {
        p = { name: r.playerName, bets: 0, wins: 0, streak: 0, bestStreak: 0, boldest: 0, fixes: 0, low: startingCash, last: startingCash };
        t.set(r.playerId, p);
      }
      p.bets++;
      if (r.isWin) {
        p.wins++;
        p.streak++;
        p.bestStreak = Math.max(p.bestStreak, p.streak);
        p.boldest = Math.max(p.boldest, r.bet);
      } else p.streak = 0;
      if (r.userCorrection?.trim() && correctionAccepted(r)) p.fixes++;
      p.low = Math.min(p.low, r.newTotal);
      p.last = r.newTotal;
    }
  }
  const players = [...t.entries()];
  const minBets = Math.min(AWARD_MIN_BETS, Math.max(1, sorted.length));
  const taken = new Set<number>();
  const awards: Award[] = [];
  const give = (
    id: Award['id'],
    icon: string,
    title: string,
    score: (p: Tally) => number,
    ok: (p: Tally) => boolean,
    detail: (p: Tally) => string
  ) => {
    const best = players
      .filter(([pid, p]) => !taken.has(pid) && ok(p))
      .sort((a, b) => score(b[1]) - score(a[1]) || a[1].name.localeCompare(b[1].name))[0];
    if (!best) return;
    taken.add(best[0]);
    awards.push({ id, icon, title, playerId: best[0], name: best[1].name, detail: detail(best[1]) });
  };
  const pct = (p: Tally) => Math.round((p.wins / p.bets) * 100);
  const dollars = (n: number) => '$' + n.toLocaleString('en-US');
  give('sharpEye', '🎯', 'Sharpest eye', (p) => pct(p) * 1000 + p.wins, (p) => p.bets >= minBets && p.wins > 0, (p) => `${pct(p)}% right`);
  give('hotStreak', '🔥', 'Hot streak', (p) => p.bestStreak, (p) => p.bestStreak >= 3, (p) => `${p.bestStreak} right in a row`);
  give('fixer', '✍️', 'Best corrector', (p) => p.fixes, (p) => p.fixes >= 1, (p) => `${p.fixes} correction${p.fixes === 1 ? '' : 's'} accepted`);
  give('comeback', '📈', 'Comeback', (p) => p.last - p.low, (p) => p.low < startingCash && p.last - p.low >= 300, (p) => `up ${dollars(p.last - p.low)} from their lowest`);
  give('boldBet', '💎', 'Boldest bet', (p) => p.boldest, (p) => p.boldest > 0, (p) => `won a ${dollars(p.boldest)} bet`);
  return awards;
}
