import type { PowerUpKey, UsedPowerUp } from '../types';

/**
 * Saved games (package F5). One place that brings an older saved game up to today's shape.
 * It was copied in loadInitialState (the browser's saved game) and handleConfirmLoadGame
 * (a game file the teacher opens).
 */

/** Fills fields older saves lack. Pass the avatar picker in, so this stays free of randomness. */
export function migrateSavedGame<T extends Record<string, any>>(
  parsed: T,
  pickAvatar: () => string
): T {
  const out: any = parsed;
  if (out.players) {
    out.players = out.players.map((p: any) => ({
      ...p,
      avatar: p.avatar || pickAvatar(),
      winStreak: p.winStreak || 0,
      effects: p.effects || [],
    }));
  }
  if (out.powerUpsUsedThisRound) {
    // Before UsedPowerUp records, a hand's power-ups were stored as plain keys (or a count).
    const fixed: Record<number, UsedPowerUp[]> = {};
    Object.keys(out.powerUpsUsedThisRound).forEach((k) => {
      const key = Number(k);
      const val = out.powerUpsUsedThisRound[key];
      if (Array.isArray(val)) {
        fixed[key] =
          val.length > 0 && typeof val[0] === 'string' ? val.map((p: string) => ({ key: p as PowerUpKey })) : val;
      } else {
        fixed[key] = [];
      }
    });
    out.powerUpsUsedThisRound = fixed;
  }
  return out;
}


// ---------------------------------------------------------------------------
// Package T5: one versioned save format, resume offer and the list of finished games.

/** Version 1 saves had no saveVersion; version 2 adds saveVersion and savedAt. */
export const SAVE_VERSION = 2;

/** An unfinished game opened again after this long gets a "Resume or start fresh" choice. */
export const RESUME_PROMPT_AFTER_MS = 10 * 60 * 1000;

/** Stamps a save with its format version and the time it was written. */
export function stampSave<T extends Record<string, any>>(state: T, now: number): T & { saveVersion: number; savedAt: number } {
  return { ...state, saveVersion: SAVE_VERSION, savedAt: now };
}

/** Reads any saved game (version 1 or 2) into today's shape, or null when it is not a game. */
export function readSave(raw: unknown, pickAvatar: () => string): (Record<string, any> & { saveVersion: number }) | null {
  let parsed: any = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object' || typeof parsed.step !== 'string') return null;
  const version = typeof parsed.saveVersion === 'number' ? parsed.saveVersion : 1;
  if (version > SAVE_VERSION) return null;
  const migrated = migrateSavedGame({ ...parsed }, pickAvatar);
  return { ...migrated, saveVersion: SAVE_VERSION };
}

export interface ResumeOffer {
  /** "Resume the game from 10:42 (hand 6 of 10)" */
  label: string;
}

function clockTime(at: number, now: number): string {
  const d = new Date(at);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const today = new Date(now);
  const sameDay = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
  if (sameDay) return time;
  const day = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  return `${day}, ${time}`;
}

/**
 * Should opening the site offer to resume this save? Only for a game in progress that was last
 * saved a while ago: a quick reload mid-lesson simply carries on.
 */
export function getResumeOffer(save: Record<string, any> | null, now: number): ResumeOffer | null {
  if (!save) return null;
  if (save.step !== 'IN_GAME' && save.step !== 'RESULTS') return null;
  if (typeof save.savedAt !== 'number' || now - save.savedAt < RESUME_PROMPT_AFTER_MS) return null;
  const hand = Number(save.currentRound) || 1;
  const limit = save.gameMode === 'rounds' ? Number(save.totalRounds) || 0 : 0;
  const handText = limit > 0 ? `hand ${hand} of ${limit}` : `hand ${hand}`;
  return { label: `Resume the game from ${clockTime(save.savedAt, now)} (${handText})` };
}

/** A finished game kept on this computer, for its report (last 20). */
export interface FinishedGame {
  id: string;
  finishedAt: number;
  winnerName: string | null;
  players: { id: number; name: string; money: number; avatar: string }[];
  roundHistory: any[];
  settings?: any;
  gameMode?: string;
  totalRounds?: number | string;
  targetAmount?: number | string;
}

export const FINISHED_GAMES_LIMIT = 20;

/** Adds a game to the front of the list (replacing an older copy of the same game), keeping 20. */
export function addFinishedGame(list: FinishedGame[], game: FinishedGame): FinishedGame[] {
  return [game, ...list.filter((g) => g.id !== game.id)].slice(0, FINISHED_GAMES_LIMIT);
}

/** Parses the stored list, dropping anything that is not a finished game. */
export function parseFinishedGames(raw: string | null): FinishedGame[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((g) => g && typeof g.id === 'string' && typeof g.finishedAt === 'number' && Array.isArray(g.roundHistory))
      .slice(0, FINISHED_GAMES_LIMIT);
  } catch {
    return [];
  }
}
