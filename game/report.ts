// The game report, built once (package L7). The on-screen report card, the PDF and the CSV all
// read this, so they can never disagree again.
import type { Player, QuestionType, RoundHistoryRecord, RoundPlayerResult } from '../types';

export type ReportFilter = 'all' | 'errors' | 'missed' | 'perfect';

/** The best-player award needs this many bets (or every hand, in a shorter game). */
export const AWARD_MIN_BETS = 5;

export interface ReportPlayer {
  id: number;
  name: string;
  avatar: string;
  bets: number;
  wins: number;
  /** Rounded percent of bets that were right. */
  winRate: number;
  net: number;
  correctionsTried: number;
  correctionsAccepted: number;
  finalMoney: number;
}

export interface ReportArea {
  /** A topic, or a question type label. */
  label: string;
  bets: number;
  right: number;
  accuracy: number;
}

export interface MissedItem {
  round: number;
  text: string;
  topic: string;
  missed: number;
  bets: number;
  /** The wrong answer most players gave, when there is one. */
  popularWrongAnswer: string | null;
}

export interface GameReport {
  hands: number;
  bets: number;
  rightBets: number;
  accuracy: number;
  flawedSentences: number;
  validSentences: number;
  handsWithAMiss: number;
  players: ReportPlayer[];
  topPlayer: ReportPlayer | null;
  byTopic: ReportArea[];
  byType: ReportArea[];
  mostMissed: MissedItem[];
  teachNext: string[];
}

const TYPE_LABEL: Record<QuestionType, string> = {
  binary: 'Valid or flawed',
  multipleChoice: 'Multiple choice',
  openCloze: 'Open cloze',
  wordFormation: 'Word formation',
  keyWordTransformation: 'Key word transformation',
};

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Was this typed correction accepted? (Settlement writes "Accepted! ..." or "Rejected for bonus. ...".) */
export function correctionAccepted(res: Pick<RoundPlayerResult, 'correctionFeedback'>): boolean {
  return /^accepted\b/i.test((res.correctionFeedback || '').trim());
}

/** The hands a report tab shows. */
export function filterHistory(history: RoundHistoryRecord[], filter: ReportFilter): RoundHistoryRecord[] {
  if (filter === 'errors') return history.filter((r) => !r.sentence.isCorrect);
  if (filter === 'missed') return history.filter((r) => r.playerResults.some((pr) => !pr.isWin));
  if (filter === 'perfect') return history.filter((r) => r.playerResults.every((pr) => pr.isWin));
  return history;
}

function areas(history: RoundHistoryRecord[], key: (r: RoundHistoryRecord) => string): ReportArea[] {
  const map = new Map<string, ReportArea>();
  history.forEach((r) => {
    const label = key(r);
    const a = map.get(label) ?? { label, bets: 0, right: 0, accuracy: 0 };
    a.bets += r.playerResults.length;
    a.right += r.playerResults.filter((p) => p.isWin).length;
    map.set(label, a);
  });
  return [...map.values()].map((a) => ({ ...a, accuracy: pct(a.right, a.bets) })).sort((a, b) => a.accuracy - b.accuracy || b.bets - a.bets);
}

function answerOf(res: RoundPlayerResult): string {
  return (res.playerAnswerDisplay || res.clozeAnswer || res.selectedOption || (res.opinion === 'correct' ? 'Valid' : 'Flawed')).trim();
}

export function buildReport(history: RoundHistoryRecord[], players: Player[]): GameReport {
  const byId = new Map<number, ReportPlayer>();
  players.forEach((p) =>
    byId.set(p.id, { id: p.id, name: p.name, avatar: p.avatar, bets: 0, wins: 0, winRate: 0, net: 0, correctionsTried: 0, correctionsAccepted: 0, finalMoney: p.money }),
  );

  let bets = 0;
  let rightBets = 0;
  let flawedSentences = 0;
  let handsWithAMiss = 0;
  const mostMissed: MissedItem[] = [];

  history.forEach((r) => {
    if (!r.sentence.isCorrect) flawedSentences++;
    const wrong = new Map<string, number>();
    let missed = 0;
    r.playerResults.forEach((res) => {
      bets++;
      if (res.isWin) rightBets++;
      else {
        missed++;
        const a = answerOf(res);
        wrong.set(a, (wrong.get(a) ?? 0) + 1);
      }
      let p = byId.get(res.playerId);
      if (!p) {
        p = { id: res.playerId, name: res.playerName, avatar: res.playerAvatar, bets: 0, wins: 0, winRate: 0, net: 0, correctionsTried: 0, correctionsAccepted: 0, finalMoney: res.newTotal };
        byId.set(res.playerId, p);
      }
      p.bets++;
      if (res.isWin) p.wins++;
      p.net += res.amountChanged;
      if (res.userCorrection?.trim()) {
        p.correctionsTried++;
        if (correctionAccepted(res)) p.correctionsAccepted++;
      }
    });
    if (missed > 0) {
      handsWithAMiss++;
      const top = [...wrong.entries()].sort((a, b) => b[1] - a[1])[0];
      mostMissed.push({ round: r.round, text: r.sentence.text, topic: r.topic, missed, bets: r.playerResults.length, popularWrongAnswer: top && top[1] > 1 ? top[0] : null });
    }
  });

  const reportPlayers = [...byId.values()].map((p) => ({ ...p, winRate: pct(p.wins, p.bets) })).sort((a, b) => b.finalMoney - a.finalMoney);
  const minBets = Math.min(AWARD_MIN_BETS, Math.max(1, history.length));
  const topPlayer =
    [...reportPlayers].filter((p) => p.bets >= minBets).sort((a, b) => b.winRate - a.winRate || b.wins - a.wins || b.finalMoney - a.finalMoney)[0] ?? null;

  const byTopic = areas(history, (r) => r.topic || 'Other');
  const byType = areas(history, (r) => TYPE_LABEL[(r.sentence.questionType || 'binary') as QuestionType]);
  const teachNext = byTopic
    .filter((a) => a.bets > 0 && a.accuracy < 75)
    .slice(0, 3)
    .map((a) => `Review: ${a.label} (${a.accuracy}% right).`);

  return {
    hands: history.length,
    bets,
    rightBets,
    accuracy: pct(rightBets, bets),
    flawedSentences,
    validSentences: history.length - flawedSentences,
    handsWithAMiss,
    players: reportPlayers,
    topPlayer,
    byTopic,
    byType,
    mostMissed: mostMissed.sort((a, b) => b.missed / b.bets - a.missed / a.bets || b.missed - a.missed).slice(0, 5),
    teachNext,
  };
}

const csvCell = (v: string | number) => {
  const s = String(v);
  // Quote when needed, and stop spreadsheets reading a name as a formula.
  const safe = typeof v === 'string' && /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** One row per student, for a gradebook. */
export function reportToCsv(report: GameReport): string {
  const rows: (string | number)[][] = [
    ['Rank', 'Student', 'Final money', 'Bets', 'Right', 'Percent right', 'Corrections tried', 'Corrections accepted'],
    ...report.players.map((p, i) => [i + 1, p.name, p.finalMoney, p.bets, p.wins, p.winRate, p.correctionsTried, p.correctionsAccepted]),
  ];
  return rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

/** Package V9: one line that hands the lesson back to the teacher at the end of the game. */
export function classResultLine(report: Pick<GameReport, 'bets' | 'accuracy' | 'byTopic'>): string {
  if (!report.bets) return '';
  const parts = [`Together you got ${report.accuracy}% right.`];
  const topics = report.byTopic.filter((t) => t.bets >= 2);
  if (topics.length > 1) {
    const best = topics.reduce((a, b) => (b.accuracy > a.accuracy ? b : a));
    if (best.accuracy > Math.min(...topics.map((t) => t.accuracy))) parts.push(`Best topic: ${best.label}.`);
  }
  // byTopic is sorted weakest first, so the first one under 75% is the one to review.
  const review = report.byTopic.find((t) => t.bets > 0 && t.accuracy < 75);
  if (review) parts.push(`To review: ${review.label}.`);
  return parts.join(' ');
}
