// npm run simulate -- [games]   (default 2000)
// Plays many bot games through the real rules and prints problems plus a power-up summary.
import { simulateMany } from './simulateGame';
import type { GameMode } from '../../types';

const games = Math.max(1, parseInt(process.argv[2] || '2000', 10) || 2000);
const setups: { label: string; gameMode: GameMode; isRoom: boolean }[] = [
  { label: 'Most money after 10 hands, one screen', gameMode: 'rounds', isRoom: false },
  { label: 'Most money after 10 hands, live room', gameMode: 'rounds', isRoom: true },
  { label: 'First to $3,000, live room', gameMode: 'targetAmount', isRoom: true },
  { label: 'Last player standing, one screen', gameMode: 'lastPlayer', isRoom: false },
];

let problemCount = 0;
const totals = new Map<string, { bought: number; won: number }>();
for (const [i, s] of setups.entries()) {
  const summary = simulateMany(games, { gameMode: s.gameMode, isRoom: s.isRoom }, 1 + i * 1_000_000);
  problemCount += summary.problems.length;
  console.log(`\n${s.label}: ${summary.games} games, ${summary.ended} ended, ${summary.averageHands.toFixed(1)} hands on average, ${summary.ties} ties`);
  for (const p of summary.problems.slice(0, 10)) console.log(`  PROBLEM (seed ${p.seed}, hand ${p.hand}): ${p.message}`);
  for (const pu of summary.powerUps) {
    const t = totals.get(pu.key) || { bought: 0, won: 0 };
    totals.set(pu.key, { bought: t.bought + pu.bought, won: t.won + pu.winnerBoughtIt });
  }
}

const totalGames = games * setups.length;
console.log(`\nPower-ups: how often the game's winner had bought each one (out of ${totalGames} games)`);
[...totals.entries()]
  .sort((a, b) => b[1].won - a[1].won)
  .forEach(([key, t]) => console.log(`  ${key.padEnd(18)} bought ${String(t.bought).padStart(6)}   winner had it in ${((100 * t.won) / totalGames).toFixed(1)}% of games`));

console.log(problemCount === 0 ? '\nNo problems found.' : `\n${problemCount} problem(s) found.`);
process.exit(problemCount === 0 ? 0 : 1);
