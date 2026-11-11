// Teacher fixes after a reveal (package R8): undo a reveal started by mistake, void a hand,
// or accept a further answer and settle the hand again. All of them work from a snapshot of
// the table taken just before the bets were settled.
import { normalizeGapAnswer, settleRound, type SettleRoundInput, type SettleRoundOutput } from '../utils/roundSettlement';
import type { Bet, Player, PlayerTurnTimer } from '../types';
import type { MultiplayerSeat } from '../utils/multiplayerProtocol';
import { isOptionType } from './questionTypes';

/** "Undo reveal" is offered for this long after the reveal. */
export const UNDO_REVEAL_MS = 10_000;

export interface RevealSnapshot {
  /** Exactly what the settlement was given, so the hand can be settled again. */
  input: SettleRoundInput;
  /** What the settlement gave back (the current ruling). */
  output: SettleRoundOutput;
  /** When the results appeared (ms since epoch). */
  revealedAt: number;
  round: number;
  /** Table state from before the reveal locked everyone in, for "Undo reveal". */
  seatsBefore: Record<number, MultiplayerSeat>;
  turnTimersBefore: Record<number, PlayerTurnTimer>;
  teacherRevealOverrideBefore: boolean;
  /** The ruling was already corrected once (void or accepted answer). */
  corrected: boolean;
}

export function canUndoReveal(snapshot: RevealSnapshot | null, now: number, round: number): boolean {
  return Boolean(snapshot && snapshot.round === round && !snapshot.corrected && now - snapshot.revealedAt < UNDO_REVEAL_MS);
}

export function undoRevealSecondsLeft(snapshot: RevealSnapshot | null, now: number): number {
  if (!snapshot) return 0;
  return Math.max(0, Math.ceil((UNDO_REVEAL_MS - (now - snapshot.revealedAt)) / 1000));
}

/** Money before the hand was settled: what "Undo reveal" and "Void the hand" give back. */
export function playersBeforeSettlement(snapshot: RevealSnapshot): Player[] {
  return snapshot.input.players;
}

/**
 * "Void the hand": every stake is returned. Bankrolls go back to what they were before the
 * reveal; money spent on hints and power-ups stays spent. Result rows show no change.
 */
export function voidHand(snapshot: RevealSnapshot): SettleRoundOutput {
  const before = new Map(snapshot.input.players.map((p) => [p.id, p.money]));
  const beforeByName = new Map(snapshot.input.players.map((p) => [p.name, p.money]));
  return {
    updatedPlayers: snapshot.input.players,
    roundResults: snapshot.output.roundResults.map((r) => ({
      ...r,
      amountChanged: 0,
      newTotal: beforeByName.get(r.name) ?? r.newTotal - r.amountChanged,
      outcomeText: 'Hand voided: stake returned',
    })),
    playerResults: snapshot.output.playerResults.map((r) => ({
      ...r,
      isWin: false,
      amountChanged: 0,
      newTotal: before.get(r.playerId) ?? r.newTotal - r.amountChanged,
    })),
    sounds: [],
  };
}

const norm = normalizeGapAnswer;

/** Can a teacher accept another answer for this kind of item? (Multiple choice can only be voided.) */
export function canAcceptOtherAnswers(input: SettleRoundInput): boolean {
  if (isOptionType(input.qType)) return false;
  if (input.qType === 'binary') return !input.currentSentence.isCorrect;
  return true;
}

function typedAnswersOf(input: SettleRoundInput, bet: Bet | undefined): string[] {
  if (!bet) return [];
  if (input.qType === 'binary') {
    return bet.userCorrection ? [bet.userCorrection] : [];
  }
  const split = bet.splitClozeAnswers?.filter(Boolean) as string[] | undefined;
  if (split && split.length) return split;
  return bet.clozeAnswer ? [bet.clozeAnswer] : [];
}

/**
 * The typed answers a teacher may accept: answers given this hand by players who did not win.
 * Duplicates (ignoring case and spaces) are listed once, with how many players gave them.
 */
export function listAnswersToAccept(snapshot: RevealSnapshot): { answer: string; players: number }[] {
  const { input, output } = snapshot;
  if (!canAcceptOtherAnswers(input)) return [];
  const losers = new Set(output.playerResults.filter((r) => !r.isWin || (r.marksAwarded ?? 2) < 2).map((r) => r.playerId));
  const found = new Map<string, { answer: string; players: number }>();
  input.validPlayers.forEach((p) => {
    if (input.qType === 'binary' ? input.verifications[p.id]?.isCorrect !== false : !losers.has(p.id)) return;
    typedAnswersOf(input, input.bets[p.id]).forEach((raw) => {
      const key = norm(raw);
      if (!key) return;
      if (input.qType !== 'binary' && input.qType !== 'keyWordTransformation' && input.acceptedSet.has(key)) return;
      if (input.qType === 'keyWordTransformation' && input.clozeWordVerifications[key]?.marks === 2) return;
      const cur = found.get(key);
      found.set(key, { answer: cur?.answer ?? raw.trim().replace(/\s+/g, ' '), players: (cur?.players ?? 0) + 1 });
    });
  });
  return [...found.values()];
}

const ACCEPTED_FEEDBACK = 'Accepted by the teacher.';

/** The settlement input with one more answer counted as fully right. */
export function withAcceptedAnswer(input: SettleRoundInput, answer: string): SettleRoundInput {
  const key = norm(answer);
  if (!key) return input;
  if (input.qType === 'binary') {
    const verifications = { ...input.verifications };
    input.validPlayers.forEach((p) => {
      const b = input.bets[p.id];
      if (b && input.verifications[p.id] && norm(b.userCorrection) === key) {
        verifications[p.id] = { isCorrect: true, feedback: ACCEPTED_FEEDBACK };
      }
    });
    return { ...input, verifications };
  }
  const acceptedSet = new Set(input.acceptedSet);
  if (input.qType !== 'keyWordTransformation') acceptedSet.add(key);
  const clozeWordVerifications = {
    ...input.clozeWordVerifications,
    [key]: { isCorrect: true, marks: 2 as const, feedback: ACCEPTED_FEEDBACK },
  };
  return { ...input, acceptedSet, clozeWordVerifications };
}

/** "Accept this answer too": settle the hand again from the snapshot with the answer accepted. */
export function resettleWithAcceptedAnswer(snapshot: RevealSnapshot, answer: string): RevealSnapshot {
  const input = withAcceptedAnswer(snapshot.input, answer);
  return { ...snapshot, input, output: settleRound(input), corrected: true };
}
