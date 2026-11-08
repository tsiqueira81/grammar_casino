// Round settlement: turns every player's bet, the house ruling and the active
// power-ups into new bankrolls and result rows.
//
// Moved out of App.tsx (handleRevealResults) without behaviour changes so it can be
// unit tested. The asynchronous answer checking (AI judge, correction checks) still
// happens in App.tsx; its results are passed in as `verifications` and
// `clozeWordVerifications`. Sounds are returned in order instead of played here.
import {
  Player, Bet, GeneratedSentence, ActivePowerUp, PlayerEffect, RoundResultInfo, RoundPlayerResult, QuestionType,
} from '../types';
import { BET_CAP_AMOUNT, JACKPOT_MULTIPLIER } from '../constants';
import { isPlayerUnderdog } from './multiplayerProtocol';
import { evaluateKeyWordTransformationDeterministic } from '../services/geminiService';
import { normalizeUkUsSpelling } from './offlineGrammarEngine';

const GeminiService = { evaluateKeyWordTransformationDeterministic };

export type CorrectionVerifications = Record<number, { isCorrect: boolean; feedback: string }>;
export type ClozeWordVerifications = Record<string, { isCorrect: boolean; marks?: 0 | 1 | 2; feedback: string }>;

export interface SettleRoundInput {
  currentSentence: GeneratedSentence;
  qType: QuestionType;
  /** All players at the table, including bankrupt ones. */
  players: Player[];
  /** Players still in the game (money > 0) at the start of the reveal. */
  activePlayers: Player[];
  /** Unfrozen players who take part in this hand (used for crowd counts). */
  validPlayers: Player[];
  bets: Record<number, Bet>;
  activePowerUps: Record<number, ActivePowerUp[]>;
  /** Binary mode: result of checking each player's typed correction. */
  verifications: CorrectionVerifications;
  /** Open cloze / word formation / KWT: marking of each normalised typed answer. */
  clozeWordVerifications: ClozeWordVerifications;
  /** Lower-cased word-formation base word ('' for other formats). */
  baseWordNorm: string;
  /** Lower-cased accepted answers (base word excluded for word formation). */
  acceptedSet: Set<string>;
  isTurnTimerEnabled: boolean;
  isMultiplayer: boolean;
  teacherRevealOverride: boolean;
  hasPlayerPlacedBet: (playerId: number) => boolean;
  currentRound: number;
  roundSpending: Record<number, number>;
}

export interface SettleRoundOutput {
  updatedPlayers: Player[];
  roundResults: RoundResultInfo[];
  playerResults: RoundPlayerResult[];
  /** Win / lose sounds in the order they should be played. */
  sounds: { sound: 'win' | 'lose'; index: number }[];
}

/** Lower-cased accepted answers for the gap formats (the unchanged base word never counts). */
export function buildAcceptedAnswerSet(sentence: GeneratedSentence, qType: QuestionType): { acceptedSet: Set<string>; baseWordNorm: string } {
  const baseWordNorm = qType === 'wordFormation' ? (sentence.baseWord || '').trim().toLowerCase() : '';
  const acceptedSet = new Set<string>();
  const addVariant = (raw: string) => {
    const norm = raw.trim().toLowerCase();
    if (!norm) return;
    if (baseWordNorm && norm === baseWordNorm) return;
    acceptedSet.add(norm);
    const canonical = normalizeUkUsSpelling(norm);
    if (canonical && (!baseWordNorm || canonical !== normalizeUkUsSpelling(baseWordNorm))) {
      acceptedSet.add(canonical);
    }
  };
  if (sentence.correctAnswer) {
    addVariant(sentence.correctAnswer);
  }
  (sentence.acceptedAnswers || []).forEach(ans => {
    if (ans && ans.trim()) {
      addVariant(ans);
    }
  });
  return { acceptedSet, baseWordNorm };
}

/**
 * Returns only the accepted answers that are genuinely distinct from `correctAnswer`
 * (case-insensitive, whitespace-normalized), preserving their original display casing.
 */
export function getAlternativeAcceptedAnswers(
  correctAnswer?: string,
  acceptedAnswers?: string[]
): string[] {
  if (!Array.isArray(acceptedAnswers) || acceptedAnswers.length === 0) return [];
  const norm = (s: string) =>
    (s || '')
      .trim()
      .toLowerCase()
      .replace(/[’‘]/g, "'")
      .replace(/\s+/g, ' ');
  const primaryNorm = norm(correctAnswer || '');
  const seen = new Set<string>();
  if (primaryNorm) seen.add(primaryNorm);
  const result: string[] = [];
  for (const ans of acceptedAnswers) {
    const trimmed = (ans || '').trim().replace(/\s+/g, ' ');
    if (!trimmed) continue;
    const n = norm(trimmed);
    if (!seen.has(n)) {
      seen.add(n);
      result.push(trimmed);
    }
  }
  return result;
}

export function settleRound(input: SettleRoundInput): SettleRoundOutput {
  const {
    currentSentence, qType, players, activePlayers, validPlayers, bets, activePowerUps, verifications,
    clozeWordVerifications, baseWordNorm, acceptedSet, isTurnTimerEnabled, teacherRevealOverride,
    hasPlayerPlacedBet, currentRound, roundSpending,
  } = input;
  const mpRoomCode = input.isMultiplayer;
  const sounds: SettleRoundOutput['sounds'] = [];

  const isMcOptionCorrect = (opt: string | undefined): boolean => {
    if (!opt || !currentSentence.correctAnswer) return false;
    return opt.trim().toLowerCase() === currentSentence.correctAnswer.trim().toLowerCase();
  };

  const getKwtPhraseMarks = (phrase: string | undefined): 0 | 1 | 2 => {
    const norm = (phrase || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!norm) return 0;
    const entry = clozeWordVerifications[norm];
    if (entry && entry.marks !== undefined) return entry.marks;
    const det = GeminiService.evaluateKeyWordTransformationDeterministic(
      phrase || '',
      currentSentence.correctAnswer || '',
      currentSentence.acceptedAnswers || [],
      currentSentence.baseWord,
      currentSentence.mark1Parts,
      currentSentence.mark2Parts
    );
    return det.marks;
  };

  const isClozeWordCorrect = (word: string | undefined): boolean => {
    if (qType === 'keyWordTransformation') {
      return getKwtPhraseMarks(word) >= 1;
    }
    const norm = (word || '').trim().toLowerCase();
    if (!norm) return false;
    const canonical = normalizeUkUsSpelling(norm);
    if (baseWordNorm && (norm === baseWordNorm || canonical === normalizeUkUsSpelling(baseWordNorm))) return false;
    if (acceptedSet.has(norm) || acceptedSet.has(canonical)) return true;
    return Boolean(clozeWordVerifications[norm]?.isCorrect);
  };

  const formatMcOptionWithLetter = (opt: string | undefined): string => {
    if (!opt) return '—';
    const idx = (currentSentence.options || []).findIndex(o => o.trim().toLowerCase() === opt.trim().toLowerCase());
    const letter = idx >= 0 ? ['A', 'B', 'C', 'D'][idx] || '' : '';
    return letter ? `${letter}: "${opt}"` : `"${opt}"`;
  };

  
  let winSoundCount = 0;
  let loseSoundCount = 0;
  const newRoundResultsData: RoundResultInfo[] = [];
  const newRoundPlayerResults: RoundPlayerResult[] = [];

  // Generalized choice frequency counter for BOUNTY_HUNTER (minorityOpinion)
  const choiceFrequency: Record<string, number> = {};
  let correctCount = 0;
  let incorrectCount = 0;

  validPlayers.forEach(p => {
    const b = bets[p.id];
    if (!b) return;
    const pSplit = (activePowerUps[p.id] || []).some(pu => pu.type === 'SPLIT_BET');
    if (qType === 'binary') {
      if (b.opinion === 'correct') {
        correctCount++;
        choiceFrequency['correct'] = (choiceFrequency['correct'] || 0) + 1;
      }
      if (b.opinion === 'incorrect') {
        incorrectCount++;
        choiceFrequency['incorrect'] = (choiceFrequency['incorrect'] || 0) + 1;
      }
    } else if (qType === 'multipleChoice') {
      const opts: string[] = pSplit ? (b.splitOptions || []) : (b.selectedOption ? [b.selectedOption] : []);
      const uniqueKeys = Array.from(new Set<string>(opts.map(o => (o || '').trim().toLowerCase()).filter(Boolean)));
      uniqueKeys.forEach(key => {
        choiceFrequency[key] = (choiceFrequency[key] || 0) + 1;
      });
    } else if (qType === 'openCloze' || qType === 'wordFormation' || qType === 'keyWordTransformation') {
      const words: string[] = pSplit ? (b.splitClozeAnswers || []) : (b.clozeAnswer ? [b.clozeAnswer] : []);
      const uniqueKeys = Array.from(new Set<string>(words.map(w => (w || '').trim().toLowerCase().replace(/\s+/g, ' ')).filter(Boolean)));
      uniqueKeys.forEach(key => {
        choiceFrequency[key] = (choiceFrequency[key] || 0) + 1;
      });
    }
  });

  const minorityOpinion = correctCount < incorrectCount ? 'correct' : (incorrectCount < correctCount ? 'incorrect' : null);
  const maxChoiceCount = Math.max(0, ...Object.values(choiceFrequency));

  // Calculate count of players who picked the correct outcome (for Lone Wolf & Bounty Hunter minority winners)
  const winningPlayersCount = validPlayers.filter(p => {
      const b = bets[p.id];
      if (!b) return false;
      const pActive = (activePowerUps[p.id] || []) as ActivePowerUp[];
      const pSplit = pActive.some(pu => pu.type === 'SPLIT_BET');
      if (qType === 'multipleChoice') {
        if (pSplit) {
          return (b.splitOptions || []).some(o => isMcOptionCorrect(o));
        }
        return isMcOptionCorrect(b.selectedOption);
      }
      if (qType === 'openCloze' || qType === 'wordFormation' || qType === 'keyWordTransformation') {
        if (pSplit) {
          return (b.splitClozeAnswers || []).some(w => isClozeWordCorrect(w));
        }
        return isClozeWordCorrect(b.clozeAnswer);
      }
      if (pSplit) {
          const splitPct = b.splitCorrectPercent ?? 50;
          const winningFrac = currentSentence.isCorrect ? (splitPct / 100) : (1 - splitPct / 100);
          return winningFrac > 0.5;
      }
      return (b.opinion === 'correct' && currentSentence.isCorrect) ||
             (b.opinion === 'incorrect' && !currentSentence.isCorrect);
  }).length;

  const isPlayerInMinority = (playerId: number): boolean => {
    const b = bets[playerId];
    if (!b) return false;
    if (qType === 'binary') {
      return Boolean(minorityOpinion && b.opinion === minorityOpinion);
    }
    if (validPlayers.length <= 1) return false;
    const pSplit = (activePowerUps[playerId] || []).some(pu => pu.type === 'SPLIT_BET');
    if (qType === 'multipleChoice') {
      const chosen = pSplit
        ? (b.splitOptions || []).find(o => isMcOptionCorrect(o))
        : b.selectedOption;
      const key = (chosen || '').trim().toLowerCase();
      const count = key ? (choiceFrequency[key] || 0) : 0;
      return (count > 0 && count < maxChoiceCount) || (winningPlayersCount > 0 && winningPlayersCount < validPlayers.length - winningPlayersCount);
    }
    if (qType === 'openCloze' || qType === 'wordFormation' || qType === 'keyWordTransformation') {
      const chosen = pSplit
        ? (b.splitClozeAnswers || []).find(w => isClozeWordCorrect(w))
        : b.clozeAnswer;
      const key = (chosen || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const count = key ? (choiceFrequency[key] || 0) : 0;
      return (count > 0 && count < maxChoiceCount) || (winningPlayersCount > 0 && winningPlayersCount < validPlayers.length - winningPlayersCount);
    }
    return false;
  };

  // Pass 1: Evaluate each player's individual answer, wager, and personal modifiers
  interface PlayerSettlementDraft {
    player: Player;
    participated: boolean;
    isFrozen: boolean;
    satOut: boolean;
    finalBet: number;
    isWin: boolean;
    marksAwarded?: 0 | 1 | 2;
    outcomeAmount: number;
    outcomeText: string;
    correctionFeedbackText: string;
    playerAnswerDisplay: string;
    syntheticOpinion: 'correct' | 'incorrect';
    playerBetData?: Bet;
    hasSplitBet: boolean;
    teachersPetAwarded: boolean;
  }

  const allActivePowerUps = Object.values(activePowerUps).flat() as ActivePowerUp[];
  const draftsById = new Map<number, PlayerSettlementDraft>();

  players.forEach(player => {
    if (!activePlayers.find(ap => ap.id === player.id)) return;
    const playerPowerUps = (activePowerUps[player.id] || []) as ActivePowerUp[];

    const isFrozen = allActivePowerUps.some(pu => pu.type === 'SUB_ZERO' && pu.target === player.id) || player.effects.some(e => e.type === ('SUB_ZERO' as any));
    if (isFrozen) {
      draftsById.set(player.id, {
        player,
        participated: false,
        isFrozen: true,
        satOut: false,
        finalBet: 0,
        isWin: false,
        outcomeAmount: 0,
        outcomeText: 'Frozen ❄️',
        correctionFeedbackText: '',
        playerAnswerDisplay: 'Frozen ❄️',
        syntheticOpinion: 'correct',
        hasSplitBet: false,
        teachersPetAwarded: false,
      });
      return;
    }

    const satOut = (isTurnTimerEnabled && !mpRoomCode)
      ? !hasPlayerPlacedBet(player.id)
      : !hasPlayerPlacedBet(player.id) && teacherRevealOverride;
    if (satOut) {
      draftsById.set(player.id, {
        player,
        participated: false,
        isFrozen: false,
        satOut: true,
        finalBet: 0,
        isWin: false,
        outcomeAmount: 0,
        outcomeText: 'Sat Out ⏱️',
        correctionFeedbackText: '',
        playerAnswerDisplay: 'Sat Out ⏱️',
        syntheticOpinion: 'correct',
        hasSplitBet: false,
        teachersPetAwarded: false,
      });
      return;
    }

    const playerBetData = bets[player.id];
    const betAmount = typeof playerBetData?.bet === 'number' ? playerBetData.bet : 0;
    const hasSplitBet = playerPowerUps.some(pu => pu.type === 'SPLIT_BET');
    const playerCaps = allActivePowerUps.filter(pu => pu.type === 'BET_CAP' && (pu.target !== undefined ? pu.target === player.id : playerPowerUps.includes(pu)));
    const isPlayerBetCapped = playerCaps.length > 0 || player.effects.some(e => e.type === ('BET_CAP' as any));
    const playerCapLimit = playerCaps.length > 0
      ? playerCaps.reduce((min, pu) => Math.min(min, pu.amount ?? BET_CAP_AMOUNT), BET_CAP_AMOUNT)
      : (isPlayerBetCapped ? 50 : BET_CAP_AMOUNT);
    let finalBet = isPlayerBetCapped ? Math.min(betAmount, playerCapLimit) : betAmount;

    // Enforce High Roller minimum floor if targeted
    const playerHighRollers = allActivePowerUps.filter(pu => pu.type === 'HIGH_ROLLER' && pu.target === player.id);
    if (playerHighRollers.length > 0 && player.money > 0) {
      const minRollerFloor = Math.min(
        player.money,
        Math.max(
          1,
          playerHighRollers.reduce(
            (max, pu) => Math.max(max, pu.amount ?? Math.ceil(player.money * 0.5)),
            Math.ceil(player.money * 0.5)
          )
        )
      );
      finalBet = Math.max(finalBet, minRollerFloor);
    }

    const hasDoubleOrNothing = playerPowerUps.some(pu => pu.type === 'DOUBLE_OR_NOTHING');
    const hasCrowdSurfer = playerPowerUps.some(pu => pu.type === 'CROWD_SURFER');
    const hasUnderdog = playerPowerUps.some(pu => pu.type === 'UNDERDOG');
    const qualifiesUnderdog = hasUnderdog && isPlayerUnderdog(player.id, players);

    let outcomeAmount = 0;
    let outcomeText = '';
    let correctionBonusApplied = false;
    let isWin = false;
    let marksAwarded: 0 | 1 | 2 | undefined = undefined;
    let correctionFeedbackText = '';
    let playerAnswerDisplay = '';

    // Compute human-readable answer display for Results, Report Card, and PDF
    if (qType === 'multipleChoice') {
      if (hasSplitBet) {
        const rawOpts = (playerBetData?.splitOptions || []).filter(Boolean);
        const isSingleStack =
          rawOpts.length === 1 ||
          (rawOpts.length === 2 && rawOpts[0].trim().toLowerCase() === rawOpts[1].trim().toLowerCase());
        if (isSingleStack && rawOpts[0]) {
          playerAnswerDisplay = `100% (2×): ${formatMcOptionWithLetter(rawOpts[0])}`;
        } else {
          const picks = rawOpts.map(o => formatMcOptionWithLetter(o));
          playerAnswerDisplay = `50/50: ${picks.join(' / ') || '—'}`;
        }
      } else {
        playerAnswerDisplay = formatMcOptionWithLetter(playerBetData?.selectedOption);
      }
    } else if (qType === 'openCloze' || qType === 'wordFormation' || qType === 'keyWordTransformation') {
      if (hasSplitBet) {
        const w1 = playerBetData?.splitClozeAnswers?.[0]?.trim() || '';
        const w2 = playerBetData?.splitClozeAnswers?.[1]?.trim() || '';
        const isSingleOrDuplicateCloze =
          (Boolean(w1) && !w2) ||
          (!w1 && Boolean(w2)) ||
          (Boolean(w1) && Boolean(w2) && w1.toLowerCase() === w2.toLowerCase());
        if (isSingleOrDuplicateCloze) {
          playerAnswerDisplay = `100% Split: "${w1 || w2 || '—'}"`;
        } else {
          playerAnswerDisplay = `50/50: "${w1 || '—'}" / "${w2 || '—'}"`;
        }
      } else {
        playerAnswerDisplay = `"${playerBetData?.clozeAnswer?.trim() || '—'}"`;
      }
    } else {
      if (hasSplitBet) {
        const pct = playerBetData?.splitCorrectPercent ?? 50;
        playerAnswerDisplay = `Split (${pct}% Valid / ${100 - pct}% Flawed)`;
      } else {
        playerAnswerDisplay = playerBetData?.opinion === 'correct' ? '✓ Valid' : '✕ Flawed';
      }
    }

    if (hasSplitBet) {
        const wager = finalBet;
        if (qType === 'multipleChoice') {
            const splitOpts = (playerBetData?.splitOptions || []).filter(Boolean);
            const isSingleStack =
              splitOpts.length === 1 ||
              (splitOpts.length === 2 && splitOpts[0].trim().toLowerCase() === splitOpts[1].trim().toLowerCase());
            if (isSingleStack && splitOpts[0]) {
                const hit = isMcOptionCorrect(splitOpts[0]);
                if (hit) {
                    isWin = true;
                    outcomeAmount = wager;
                    outcomeText = `Split Bet 2× Win (+$${wager})`;
                    sounds.push({ sound: 'win', index: winSoundCount++ });
                } else {
                    isWin = false;
                    outcomeAmount = -wager;
                    outcomeText = `Split Bet 2× Loss (-$${wager})`;
                    sounds.push({ sound: 'lose', index: loseSoundCount++ });
                }
            } else {
                const anyHit = splitOpts.some(o => isMcOptionCorrect(o));
                if (anyHit) {
                    isWin = true;
                    outcomeAmount = Math.round(wager * 0.5);
                    outcomeText = `50/50 Split Win (+$${outcomeAmount})`;
                    sounds.push({ sound: 'win', index: winSoundCount++ });
                } else {
                    isWin = false;
                    outcomeAmount = -wager;
                    outcomeText = `50/50 Split Loss (-$${wager})`;
                    sounds.push({ sound: 'lose', index: loseSoundCount++ });
                }
            }
        } else if (qType === 'keyWordTransformation') {
            const w1 = (playerBetData?.splitClozeAnswers?.[0] || '').trim();
            const w2 = (playerBetData?.splitClozeAnswers?.[1] || '').trim();
            const isSingleOrDuplicate =
              (Boolean(w1) && !w2) ||
              (!w1 && Boolean(w2)) ||
              (Boolean(w1) && Boolean(w2) && w1.toLowerCase().replace(/\s+/g, ' ') === w2.toLowerCase().replace(/\s+/g, ' '));
            if (isSingleOrDuplicate) {
                const singlePhrase = w1 || w2;
                const m = getKwtPhraseMarks(singlePhrase);
                marksAwarded = m;
                if (m === 2) {
                    isWin = true;
                    outcomeAmount = wager * 2;
                    outcomeText = `2/2 Marks · Split 2× Win (+$${outcomeAmount})!`;
                    sounds.push({ sound: 'win', index: winSoundCount++ });
                } else if (m === 1) {
                    isWin = true;
                    outcomeAmount = wager;
                    outcomeText = `1/2 Mark · Split 1× Win (+$${outcomeAmount})!`;
                    sounds.push({ sound: 'win', index: winSoundCount++ });
                } else {
                    isWin = false;
                    outcomeAmount = -wager;
                    outcomeText = `0/2 Marks · Split Loss (-$${wager})`;
                    sounds.push({ sound: 'lose', index: loseSoundCount++ });
                }
            } else {
                const m1 = getKwtPhraseMarks(w1);
                const m2 = getKwtPhraseMarks(w2);
                const bestMark: 0 | 1 | 2 = (Math.max(m1, m2) as 0 | 1 | 2);
                marksAwarded = bestMark;
                const halfWager = Math.round(wager * 0.5);
                if (m1 === 0 && m2 === 0) {
                    isWin = false;
                    outcomeAmount = -wager;
                    outcomeText = `0/2 Marks · 50/50 Split Loss (-$${wager})`;
                    sounds.push({ sound: 'lose', index: loseSoundCount++ });
                } else {
                    isWin = true;
                    const gain1 = m1 === 2 ? halfWager * 2 : m1 === 1 ? halfWager : 0;
                    const gain2 = m2 === 2 ? halfWager * 2 : m2 === 1 ? halfWager : 0;
                    outcomeAmount = gain1 + gain2;
                    outcomeText = `50/50 Split (${m1}/2 & ${m2}/2 Marks: +$${outcomeAmount})!`;
                    sounds.push({ sound: 'win', index: winSoundCount++ });
                }
            }
            const fbParts: string[] = [];
            const seenNorms = new Set<string>();
            [w1, w2].forEach(w => {
              const norm = (w || '').trim().toLowerCase().replace(/\s+/g, ' ');
              if (norm && !seenNorms.has(norm) && clozeWordVerifications[norm]?.feedback) {
                seenNorms.add(norm);
                fbParts.push(clozeWordVerifications[norm].feedback);
              }
            });
            if (fbParts.length > 0) correctionFeedbackText = fbParts.join(' · ');
        } else if (qType === 'openCloze' || qType === 'wordFormation') {
            const w1 = (playerBetData?.splitClozeAnswers?.[0] || '').trim();
            const w2 = (playerBetData?.splitClozeAnswers?.[1] || '').trim();
            const isSingleOrDuplicateCloze =
              (Boolean(w1) && !w2) ||
              (!w1 && Boolean(w2)) ||
              (Boolean(w1) && Boolean(w2) && w1.toLowerCase() === w2.toLowerCase());
            if (isSingleOrDuplicateCloze) {
                const singleWord = w1 || w2;
                const hit = isClozeWordCorrect(singleWord);
                if (hit) {
                    isWin = true;
                    outcomeAmount = wager;
                    outcomeText = `Split Cloze 100% Win (+$${wager})!`;
                    sounds.push({ sound: 'win', index: winSoundCount++ });
                } else {
                    isWin = false;
                    outcomeAmount = -wager;
                    outcomeText = `Split Cloze Loss (-$${wager})`;
                    sounds.push({ sound: 'lose', index: loseSoundCount++ });
                }
            } else {
                const hit1 = isClozeWordCorrect(w1);
                const hit2 = isClozeWordCorrect(w2);
                const hits = (hit1 ? 1 : 0) + (hit2 ? 1 : 0);
                if (hits === 2) {
                    isWin = true;
                    outcomeAmount = wager;
                    outcomeText = `Split Cloze Double Hit (+$${wager})!`;
                    sounds.push({ sound: 'win', index: winSoundCount++ });
                } else if (hits === 1) {
                    isWin = true;
                    outcomeAmount = Math.round(wager * 0.5);
                    outcomeText = `50/50 Split Cloze Win (+$${outcomeAmount})`;
                    sounds.push({ sound: 'win', index: winSoundCount++ });
                } else {
                    isWin = false;
                    outcomeAmount = -wager;
                    outcomeText = `Split Cloze Loss (-$${wager})`;
                    sounds.push({ sound: 'lose', index: loseSoundCount++ });
                }
            }
            const fbParts: string[] = [];
            const seenNorms = new Set<string>();
            [w1, w2].forEach(w => {
              const norm = (w || '').trim().toLowerCase();
              if (norm && !seenNorms.has(norm) && clozeWordVerifications[norm]?.feedback) {
                seenNorms.add(norm);
                fbParts.push(clozeWordVerifications[norm].feedback);
              }
            });
            if (fbParts.length > 0) correctionFeedbackText = fbParts.join(' · ');
        } else {
            const splitPercent = playerBetData?.splitCorrectPercent ?? 50;
            const fractionCorrect = splitPercent / 100;
            const fractionIncorrect = 1 - fractionCorrect;
            let winnings = 0;
            if (currentSentence.isCorrect) {
                winnings = (wager * fractionCorrect) * 2;
            } else {
                winnings = (wager * fractionIncorrect) * 2;
            }
            outcomeAmount = Math.floor(winnings - wager);
            if (outcomeAmount > 0) {
                isWin = true;
                outcomeText = `Split Bet Win (+$${outcomeAmount})`;
                sounds.push({ sound: 'win', index: winSoundCount++ });
            } else if (outcomeAmount < 0) {
                isWin = false;
                outcomeText = `Split Bet Loss (-$${Math.abs(outcomeAmount)})`;
                sounds.push({ sound: 'lose', index: loseSoundCount++ });
            } else {
                outcomeText = 'Split Bet (Even) ⚖️';
            }

            // Split bet correction bonus (binary mode only)
            if (!currentSentence.isCorrect && fractionIncorrect > 0 && verifications[player.id]?.isCorrect) {
                const bonus = Math.floor(wager * fractionIncorrect); 
                outcomeAmount += bonus;
                outcomeText += ' + Correction! 🧠';
                correctionBonusApplied = true;
            }

            // Correction Bounty in split bet (binary mode only)
            const hasCorrectionBounty = playerPowerUps.some(pu => pu.type === 'CORRECTION_BOUNTY');
            if (hasCorrectionBounty && !currentSentence.isCorrect && fractionIncorrect > 0 && verifications[player.id]?.isCorrect) {
                const bountyBonus = Math.floor(wager * fractionIncorrect);
                outcomeAmount += bountyBonus;
                outcomeText += ` + Correction Bounty (+$${bountyBonus})! 📝`;
            }
        }

        // Double or Nothing on Split Bet
        if (hasDoubleOrNothing) {
            const failedMandatoryCorrection =
              qType === 'binary' && !currentSentence.isCorrect && !verifications[player.id]?.isCorrect;
            if (isWin && !failedMandatoryCorrection) {
                outcomeAmount = Math.round(outcomeAmount * 3);
                outcomeText += ' + Double or Nothing (3×)! 🎲';
            } else {
                isWin = false;
                outcomeAmount = -Math.round(wager * 1.5);
                outcomeText = failedMandatoryCorrection
                  ? 'Double or Nothing Loss (Failed Mandatory Correction: -1.5×)! 🎲'
                  : 'Double or Nothing Loss (-1.5×)! 🎲';
            }
        }

        // Shared Split Bet modifiers on Win / Loss
        if (isWin && outcomeAmount > 0) {
            const hasLoneWolf = playerPowerUps.some(pu => pu.type === 'LONE_WOLF');
            if (hasLoneWolf && winningPlayersCount === 1) {
                outcomeAmount = Math.round(outcomeAmount * 3);
                outcomeText += ' + Lone Wolf (3x Payout)! 🐺';
            }
            if (hasCrowdSurfer && winningPlayersCount > 1) {
                const otherWinners = winningPlayersCount - 1;
                const crowdBonus = Math.round(outcomeAmount * (0.10 * otherWinners));
                outcomeAmount += crowdBonus;
                outcomeText += ` + Crowd Surfer (+${otherWinners * 10}%)! 📢`;
            }
            const hasBountyHunter = playerPowerUps.some(pu => pu.type === 'BOUNTY_HUNTER');
            if (hasBountyHunter && isPlayerInMinority(player.id)) {
                outcomeAmount = Math.round(outcomeAmount * 1.5);
                outcomeText += ' + Bounty! 🎯';
            }
            const hasJackpot = playerPowerUps.some(pu => pu.type === 'JACKPOT');
            if (hasJackpot) {
                outcomeAmount = Math.round(outcomeAmount * JACKPOT_MULTIPLIER);
                outcomeText += ' + Jackpot! 🎰';
            }
            if (qualifiesUnderdog) {
                outcomeAmount = Math.round(outcomeAmount * 2.5);
                outcomeText += ' + Underdog Surge (2.5×)! 🚀';
            }
        } else if (!isWin && outcomeAmount < 0 && (qType === 'multipleChoice' || qType === 'openCloze' || qType === 'wordFormation' || qType === 'keyWordTransformation' || hasDoubleOrNothing)) {
            let lossAmount = Math.abs(outcomeAmount);
            const hasImmunity = playerPowerUps.some(pu => pu.type === 'IMMUNITY_IDOL');
            if (hasImmunity) {
                lossAmount = 0;
                outcomeText = 'Immunity Save! 🗿';
            } else {
                const hasSafetyNet = playerPowerUps.some(pu => pu.type === 'SAFETY_NET');
                if (hasSafetyNet) {
                    lossAmount *= 0.5;
                    outcomeText += ' (Safety Net) 🦺';
                }
                const hasBlessing = player.effects.some(e => e.type === 'BLESSING');
                if (hasBlessing) {
                    const forgiven = Math.round(lossAmount * 0.30);
                    lossAmount -= forgiven;
                    outcomeText += ' (Blessed: 30% Saved) 💖';
                }
            }
            outcomeAmount = -Math.round(lossAmount);
        }

    } else {
        let playerGuessedCorrectly = false;
        if (qType === 'multipleChoice') {
            if (!playerBetData?.selectedOption) return;
            playerGuessedCorrectly = isMcOptionCorrect(playerBetData.selectedOption);
        } else if (qType === 'keyWordTransformation') {
            if (!playerBetData?.clozeAnswer?.trim()) return;
            const kwtMarks = getKwtPhraseMarks(playerBetData.clozeAnswer);
            marksAwarded = kwtMarks;
            playerGuessedCorrectly = kwtMarks >= 1;
            const norm = playerBetData.clozeAnswer.trim().toLowerCase().replace(/\s+/g, ' ');
            if (clozeWordVerifications[norm]?.feedback) {
                correctionFeedbackText = clozeWordVerifications[norm].feedback;
            }
        } else if (qType === 'openCloze' || qType === 'wordFormation') {
            if (!playerBetData?.clozeAnswer?.trim()) return;
            playerGuessedCorrectly = isClozeWordCorrect(playerBetData.clozeAnswer);
            const norm = playerBetData.clozeAnswer.trim().toLowerCase();
            if (clozeWordVerifications[norm]?.feedback) {
                correctionFeedbackText = clozeWordVerifications[norm].feedback;
            }
        } else {
            if (!playerBetData || !playerBetData.opinion) return;
            playerGuessedCorrectly = (playerBetData.opinion === 'correct' && currentSentence.isCorrect) || 
                                     (playerBetData.opinion === 'incorrect' && !currentSentence.isCorrect);
        }

        // Confirmed Rule: For Double or Nothing in Binary mode on a flawed sentence, a valid correction is mandatory!
        const failedDoubleOrNothingCorrection =
          hasDoubleOrNothing &&
          qType === 'binary' &&
          !currentSentence.isCorrect &&
          playerGuessedCorrectly &&
          !verifications[player.id]?.isCorrect;

        if (playerGuessedCorrectly && !failedDoubleOrNothingCorrection) {
          isWin = true;
          sounds.push({ sound: 'win', index: winSoundCount++ });
          const baseWinMultiplier = qType === 'keyWordTransformation' && marksAwarded === 2 ? 2 : 1;
          let winnings = finalBet * baseWinMultiplier;

          if (hasDoubleOrNothing) {
              winnings = qType === 'keyWordTransformation'
                ? (marksAwarded === 2 ? finalBet * 4 : finalBet * 2)
                : finalBet * 3;
              if (qType === 'binary' && !currentSentence.isCorrect && verifications[player.id]?.isCorrect) {
                correctionBonusApplied = true;
              }
          }

          const hasLoneWolf = playerPowerUps.some(pu => pu.type === 'LONE_WOLF');
          const isLoneWolfActive = hasLoneWolf && winningPlayersCount === 1;
          if (isLoneWolfActive) {
              winnings = winnings * 3;
          }

          const isHalfBaked = allActivePowerUps.some(pu => pu.type === 'HALF_BAKED' && pu.target === player.id);
          if (isHalfBaked) winnings *= 0.5;
          outcomeAmount = Math.round(winnings);
          if (qType === 'keyWordTransformation') {
            const markPrefix = marksAwarded === 2 ? '2/2 Marks · 2× Win' : '1/2 Mark · 1× Win';
            outcomeText = hasDoubleOrNothing
              ? isLoneWolfActive
                ? `${markPrefix} (Double or Nothing + Lone Wolf 3×!) 🎲🐺`
                : `${markPrefix} (Double or Nothing ${marksAwarded === 2 ? '4×' : '2×'}!) 🎲`
              : isLoneWolfActive
                ? `${markPrefix} (Lone Wolf 3×!) 🐺`
                : `${markPrefix}!`;
          } else {
            outcomeText = hasDoubleOrNothing
              ? isLoneWolfActive
                ? 'Win (Double or Nothing 3× + Lone Wolf 3×!) 🎲🐺'
                : 'Win (Double or Nothing 3×!) 🎲'
              : isLoneWolfActive
                ? 'Win (Lone Wolf 3x!) 🐺'
                : 'Win';
          }
          
          if (hasCrowdSurfer && winningPlayersCount > 1) {
              const otherWinners = winningPlayersCount - 1;
              const crowdBonus = Math.round(outcomeAmount * (0.10 * otherWinners));
              outcomeAmount += crowdBonus;
              outcomeText += ` + Crowd Surfer (+${otherWinners * 10}%)! 📢`;
          }
          const hasBountyHunter = playerPowerUps.some(pu => pu.type === 'BOUNTY_HUNTER');
          if (hasBountyHunter && isPlayerInMinority(player.id)) {
              outcomeAmount = Math.round(outcomeAmount * 1.5);
              outcomeText += ' + Bounty! 🎯';
          }
          if (!hasDoubleOrNothing && qType === 'binary' && playerBetData?.opinion === 'incorrect' && !currentSentence.isCorrect && verifications[player.id]?.isCorrect) {
            outcomeAmount += finalBet; 
            outcomeText += ' + Correction! 🧠';
            correctionBonusApplied = true;
          }
          const hasCorrectionBounty = playerPowerUps.some(pu => pu.type === 'CORRECTION_BOUNTY');
          if (qType === 'binary' && hasCorrectionBounty && playerBetData?.opinion === 'incorrect' && !currentSentence.isCorrect && verifications[player.id]?.isCorrect) {
            outcomeAmount += finalBet;
            outcomeText += ` + Correction Bounty (+$${finalBet})! 📝`;
          }
          const hasJackpot = playerPowerUps.some(pu => pu.type === 'JACKPOT');
          if (hasJackpot) {
            outcomeAmount = Math.round(outcomeAmount * JACKPOT_MULTIPLIER);
            outcomeText += ' + Jackpot! 🎰';
          }
          if (qualifiesUnderdog) {
            outcomeAmount = Math.round(outcomeAmount * 2.5);
            outcomeText += ' + Underdog Surge (2.5×)! 🚀';
          }
          const hasSnowball = playerPowerUps.some(pu => pu.type === 'SNOWBALL');
          if (hasSnowball && player.winStreak > 0) {
              const snowballBonus = Math.round(outcomeAmount * (0.10 * player.winStreak));
              outcomeAmount += snowballBonus;
              outcomeText += ` + Snowball (${player.winStreak}x)! ⛄`;
          }
          const hasCrucio = player.effects.some(e => e.type === 'CRUCIO');
          if (hasCrucio) {
              const crucioPenalty = Math.round(outcomeAmount * 0.20);
              outcomeAmount -= crucioPenalty;
              outcomeText += ' - Crucio ⛓️';
          }
        } else { 
          isWin = false;
          sounds.push({ sound: 'lose', index: loseSoundCount++ });
          let lossAmount = hasDoubleOrNothing ? Math.round(finalBet * 1.5) : finalBet;
          outcomeText = failedDoubleOrNothingCorrection
            ? 'Double or Nothing Loss (Failed Mandatory Correction: -1.5×)! 🎲'
            : hasDoubleOrNothing
              ? 'Double or Nothing Loss (-1.5×)! 🎲'
              : qType === 'keyWordTransformation'
                ? '0/2 Marks · Lose'
                : 'Lose';
          const hasImmunity = playerPowerUps.some(pu => pu.type === 'IMMUNITY_IDOL');
          if (hasImmunity) {
              lossAmount = 0;
              outcomeText = 'Immunity Save! 🗿';
          } else {
              const hasSafetyNet = playerPowerUps.some(pu => pu.type === 'SAFETY_NET');
              if (hasSafetyNet) {
                  lossAmount *= 0.5;
                  outcomeText += ' (Safety Net) 🦺';
              }
              const hasBlessing = player.effects.some(e => e.type === 'BLESSING');
              if (hasBlessing) {
                  const forgiven = Math.round(lossAmount * 0.30);
                  lossAmount -= forgiven;
                  outcomeText += ' (Blessed: 30% Saved) 💖';
              }
          }
          outcomeAmount = -Math.round(lossAmount);
        }
    }

    const hasSavings = playerPowerUps.some(pu => pu.type === 'SAVINGS_ACCOUNT');
    if (hasSavings) {
        const unbetMoney = player.money - finalBet; 
        if (unbetMoney > 0) {
            const interest = Math.round(unbetMoney * 0.40);
            outcomeAmount += interest;
            outcomeText += ` + Interest (+$${interest.toLocaleString()}) 🏦`;
        }
    }

    // Teacher's Pet bonus (awarded if player already has a 3-win streak or whenever they reach a 3-win streak)
    const hasTeachersPet = player.effects.some(e => e.type === 'TEACHERS_PET') || playerPowerUps.some(pu => pu.type === 'TEACHERS_PET');
    let teachersPetAwarded = false;
    if (hasTeachersPet && isWin && (player.winStreak + 1) >= 3) {
        const petGrant = Math.floor(player.money * 0.5);
        outcomeAmount += petGrant;
        outcomeText += ` + Teacher's Pet (+$${petGrant.toLocaleString()})! 🍎`;
        teachersPetAwarded = true;
    }

    // Updated Correction Feedback Logic to support Split Bet (binary mode only)
    if (qType === 'binary') {
      const attemptedCorrection = hasSplitBet 
          ? (!currentSentence.isCorrect && (playerBetData?.splitCorrectPercent ?? 50) < 100 && playerBetData?.userCorrection?.trim())
          : (playerBetData?.opinion === 'incorrect' && !currentSentence.isCorrect && playerBetData?.userCorrection?.trim());

      if (attemptedCorrection) {
          correctionFeedbackText = verifications[player.id]?.feedback || "Correction not evaluated.";
          if (correctionBonusApplied) correctionFeedbackText = `Accepted! ${correctionFeedbackText}`;
          else if((hasSplitBet && !currentSentence.isCorrect) || (playerBetData?.opinion === 'incorrect' && !currentSentence.isCorrect)) { 
             correctionFeedbackText = `Rejected for bonus. ${correctionFeedbackText}`;
          } else correctionFeedbackText = `N/A (Sentence was correct).`;
      } else if (hasDoubleOrNothing && !currentSentence.isCorrect && playerBetData?.opinion === 'incorrect') {
          correctionFeedbackText = 'Double or Nothing requires a valid correction on flawed sentences!';
      }
    }

    const syntheticOpinion: 'correct' | 'incorrect' = qType === 'binary'
      ? (hasSplitBet ? 'correct' : (playerBetData?.opinion || 'correct'))
      : (isWin ? 'correct' : 'incorrect');

    draftsById.set(player.id, {
      player,
      participated: true,
      isFrozen: false,
      satOut: false,
      finalBet,
      isWin,
      marksAwarded,
      outcomeAmount,
      outcomeText,
      correctionFeedbackText,
      playerAnswerDisplay,
      syntheticOpinion,
      playerBetData,
      hasSplitBet,
      teachersPetAwarded,
    });
  });

  // Pass 2: Apply relational power-ups (COPYCAT, BLOOD_PACT, and SCAVENGER) across participating players
  const baseWinningAmounts = new Map<number, number>();
  const baseLosingAmounts = new Map<number, number>();
  draftsById.forEach((d, pid) => {
    baseWinningAmounts.set(pid, Math.max(0, d.outcomeAmount));
    baseLosingAmounts.set(pid, !d.isWin && d.outcomeAmount < 0 ? Math.abs(d.outcomeAmount) : 0);
  });

  for (const [casterIdStr, puList] of Object.entries(activePowerUps) as [string, ActivePowerUp[]][]) {
    const casterId = Number(casterIdStr);
    const casterDraft = draftsById.get(casterId);
    if (!casterDraft || !casterDraft.participated) continue;

    for (const pu of puList || []) {
      if (pu.type === 'COPYCAT' && pu.target !== undefined) {
        const targetDraft = draftsById.get(pu.target);
        if (!targetDraft || !targetDraft.participated) continue;
        if (targetDraft.isWin) {
          const targetBaseWin = baseWinningAmounts.get(pu.target) ?? Math.max(0, targetDraft.outcomeAmount);
          const copyBonus = Math.max(50, Math.round(targetBaseWin * 0.50));
          casterDraft.outcomeAmount += copyBonus;
          casterDraft.outcomeText += ` + Copycat (${targetDraft.player.name}: +$${copyBonus.toLocaleString()})! 🪞`;
        } else {
          casterDraft.outcomeAmount -= 100;
          casterDraft.outcomeText += ` - Copycat Penalty (${targetDraft.player.name} missed: -$100) 🪞`;
        }
      } else if (pu.type === 'BLOOD_PACT' && pu.target !== undefined) {
        const targetDraft = draftsById.get(pu.target);
        if (!targetDraft || !targetDraft.participated) continue;
        if (casterDraft.isWin && targetDraft.isWin) {
          const cBase = baseWinningAmounts.get(casterId) ?? Math.max(0, casterDraft.outcomeAmount);
          const tBase = baseWinningAmounts.get(pu.target) ?? Math.max(0, targetDraft.outcomeAmount);
          const cBonus = Math.max(50, Math.round(cBase * 0.50));
          const tBonus = Math.max(50, Math.round(tBase * 0.50));
          casterDraft.outcomeAmount += cBonus;
          casterDraft.outcomeText += ` + Blood Pact (+$${cBonus.toLocaleString()})! 🤝`;
          targetDraft.outcomeAmount += tBonus;
          targetDraft.outcomeText += ` + Blood Pact (+$${tBonus.toLocaleString()})! 🤝`;
        } else if (casterDraft.isWin && !targetDraft.isWin) {
          casterDraft.outcomeAmount += 100;
          casterDraft.outcomeText += ` + Blood Pact Tribute (+$100 from ${targetDraft.player.name})! 🤝`;
          targetDraft.outcomeAmount -= 100;
          targetDraft.outcomeText += ` - Blood Pact Tribute (-$100 to ${casterDraft.player.name}) 🤝`;
        } else if (!casterDraft.isWin && targetDraft.isWin) {
          targetDraft.outcomeAmount += 100;
          targetDraft.outcomeText += ` + Blood Pact Tribute (+$100 from ${casterDraft.player.name})! 🤝`;
          casterDraft.outcomeAmount -= 100;
          casterDraft.outcomeText += ` - Blood Pact Tribute (-$100 to ${targetDraft.player.name}) 🤝`;
        } else {
          casterDraft.outcomeAmount -= 100;
          casterDraft.outcomeText += ` - Blood Pact Broken (-$100) 🤝`;
          targetDraft.outcomeAmount -= 100;
          targetDraft.outcomeText += ` - Blood Pact Broken (-$100) 🤝`;
        }
      } else if (pu.type === 'SCAVENGER') {
        let totalOtherLosses = 0;
        let losingRivalsCount = 0;
        draftsById.forEach((otherDraft, otherPid) => {
          if (otherPid === casterId || !otherDraft.participated) return;
          const lostAmt = baseLosingAmounts.get(otherPid) ?? 0;
          if (lostAmt > 0) {
            totalOtherLosses += lostAmt;
            losingRivalsCount += 1;
          }
        });
        const scavenged = Math.min(500, Math.round(totalOtherLosses * 0.25));
        if (scavenged > 0) {
          casterDraft.outcomeAmount += scavenged;
          casterDraft.outcomeText += ` + Scavenger (+$${scavenged.toLocaleString()} from ${losingRivalsCount} losing bet${losingRivalsCount === 1 ? '' : 's'})! 🦅`;
        } else {
          casterDraft.outcomeText += ' (Scavenger: $0 — no rival losses) 🦅';
        }
      }
    }
  }

  // Finalize player money, Second Chance, history, and round results
  const updatedPlayers = players.map(player => {
    const draft = draftsById.get(player.id);
    if (!draft) return player;

    if (!draft.participated) {
      newRoundResultsData.push({
        name: player.name,
        bet: 0,
        opinion: 'correct',
        questionType: qType,
        playerAnswerDisplay: draft.playerAnswerDisplay,
        outcomeText: draft.outcomeText,
        newTotal: player.money,
        correctionFeedback: '',
        amountChanged: 0,
      });
      newRoundPlayerResults.push({
        playerId: player.id,
        playerName: player.name,
        playerAvatar: player.avatar,
        bet: 0,
        opinion: 'correct',
        questionType: qType,
        playerAnswerDisplay: draft.playerAnswerDisplay,
        isWin: false,
        amountChanged: 0,
        newTotal: player.money,
      });
      const updatedEffects = player.effects.map(e => ({...e, roundsLeft: e.roundsLeft - 1})).filter(e => e.roundsLeft > 0 || e.roundsLeft === -1);
      return { ...player, effects: updatedEffects };
    }

    const {
      finalBet,
      isWin,
      marksAwarded,
      outcomeAmount,
      correctionFeedbackText,
      playerAnswerDisplay,
      syntheticOpinion,
      playerBetData,
      hasSplitBet,
      teachersPetAwarded,
    } = draft;
    let { outcomeText } = draft;

    let newMoney = Math.max(0, player.money + outcomeAmount);

    // Check for Second Chance
    const secondChanceEffect = player.effects.find(e => e.type === 'SECOND_CHANCE');
    if (newMoney <= 0 && secondChanceEffect) {
        newMoney = 300;
        outcomeText += " (Second Chance: +$300!) 👼";
    }

    const newHistoryEntry = {
      round: currentRound,
      amount: outcomeAmount,
      spent: roundSpending[player.id] || 0,
      endTotal: newMoney,
      sentence: currentSentence.text,
    };

    newRoundResultsData.push({ 
      name: player.name, 
      bet: finalBet, 
      opinion: syntheticOpinion,
      questionType: qType,
      marksAwarded,
      playerAnswerDisplay,
      outcomeText, 
      newTotal: newMoney, 
      correctionFeedback: correctionFeedbackText, 
      amountChanged: outcomeAmount 
    });

    newRoundPlayerResults.push({
      playerId: player.id,
      playerName: player.name,
      playerAvatar: player.avatar,
      bet: finalBet,
      opinion: syntheticOpinion,
      questionType: qType,
      marksAwarded,
      options: currentSentence.options,
      selectedOption: playerBetData?.selectedOption,
      splitOptions: hasSplitBet ? playerBetData?.splitOptions : undefined,
      clozeAnswer: playerBetData?.clozeAnswer,
      splitClozeAnswers: hasSplitBet ? playerBetData?.splitClozeAnswers : undefined,
      playerAnswerDisplay,
      isWin,
      amountChanged: outcomeAmount,
      newTotal: newMoney,
      userCorrection: qType === 'binary' ? playerBetData?.userCorrection : undefined,
      correctionFeedback: correctionFeedbackText,
      splitPercent: (qType === 'binary' && hasSplitBet) ? (playerBetData?.splitCorrectPercent ?? 50) : undefined,
    });
    
    // Update effects: Decrement positive rounds, keep -1 (unless consumed Second Chance or Teacher's Pet)
    const updatedEffects = player.effects.map(e => {
      if (e.type === 'SECOND_CHANCE' && newMoney === 300 && player.money + outcomeAmount <= 0) {
           return null; // Consumed
      }
      if (e.type === 'TEACHERS_PET' && teachersPetAwarded) {
           return null; // Consumed
      }
      if (e.roundsLeft > 0) return {...e, roundsLeft: e.roundsLeft - 1};
      if (e.roundsLeft === -1) return e; // Persist indefinitely
      return null;
    }).filter((e): e is PlayerEffect => e !== null && (e.roundsLeft > 0 || e.roundsLeft === -1));

    const newStreak = isWin ? player.winStreak + 1 : 0;

    return { 
        ...player, 
        money: newMoney, 
        history: [...(player.history || []), newHistoryEntry],
        winStreak: newStreak,
        effects: updatedEffects
    };
  });

  return { updatedPlayers, roundResults: newRoundResultsData, playerResults: newRoundPlayerResults, sounds };
}
