// Package T5: one versioned save format, the resume offer and the finished-games list.
import { describe, expect, it } from 'vitest';
import {
  FINISHED_GAMES_LIMIT, RESUME_PROMPT_AFTER_MS, SAVE_VERSION, addFinishedGame, getResumeOffer, parseFinishedGames, readSave, stampSave,
  type FinishedGame,
} from '../game/persistence';

const v1Save = {
  step: 'IN_GAME',
  players: [{ id: 1, name: 'Ana', money: 900, history: [] }],
  currentRound: 6,
  gameMode: 'rounds',
  totalRounds: 10,
  powerUpsUsedThisRound: { 1: ['HINT'] },
};

describe('save format', () => {
  it('reads a version 1 save and brings it up to version 2', () => {
    const read = readSave(JSON.stringify(v1Save), () => '🦊')!;
    expect(read.saveVersion).toBe(SAVE_VERSION);
    expect(read.players[0]).toMatchObject({ name: 'Ana', avatar: '🦊', winStreak: 0, effects: [] });
    expect(read.powerUpsUsedThisRound[1]).toEqual([{ key: 'HINT' }]);
  });

  it('round-trips a version 2 save unchanged', () => {
    const stamped = stampSave(readSave(v1Save, () => '🦊')!, 1_000);
    const again = readSave(JSON.stringify(stamped), () => '🐼')!;
    expect(again).toEqual(stamped);
    expect(again.savedAt).toBe(1_000);
  });

  it('refuses things that are not a game, and saves from a newer version', () => {
    expect(readSave('not json', () => '🦊')).toBeNull();
    expect(readSave({ players: [] }, () => '🦊')).toBeNull();
    expect(readSave({ ...v1Save, saveVersion: SAVE_VERSION + 1 }, () => '🦊')).toBeNull();
  });
});

describe('resume offer', () => {
  const savedAt = new Date(2026, 10, 11, 10, 42).getTime();

  it('offers to resume a game in progress opened again later', () => {
    const offer = getResumeOffer({ ...v1Save, savedAt }, savedAt + 2 * 60 * 60 * 1000);
    expect(offer?.label).toBe('Resume the game from 10:42 (hand 6 of 10)');
  });

  it('names the day when the game is from another day', () => {
    const offer = getResumeOffer({ ...v1Save, gameMode: 'lastPlayer', savedAt }, savedAt + 30 * 60 * 60 * 1000);
    expect(offer?.label).toMatch(/^Resume the game from \w+ 11 November, 10:42 \(hand 6\)$/);
  });

  it('just carries on after a quick reload, and never offers a game not in progress', () => {
    expect(getResumeOffer({ ...v1Save, savedAt }, savedAt + RESUME_PROMPT_AFTER_MS - 1)).toBeNull();
    expect(getResumeOffer({ ...v1Save, step: 'PLAYER_SETUP', savedAt }, savedAt + RESUME_PROMPT_AFTER_MS * 10)).toBeNull();
    expect(getResumeOffer({ ...v1Save }, savedAt)).toBeNull();
    expect(getResumeOffer(null, savedAt)).toBeNull();
  });
});

describe('finished games', () => {
  const game = (id: string): FinishedGame => ({ id, finishedAt: 1, winnerName: null, players: [], roundHistory: [] });

  it('keeps the newest 20 and never the same game twice', () => {
    let list: FinishedGame[] = [];
    for (let i = 0; i < 25; i++) list = addFinishedGame(list, game(`g${i}`));
    expect(list).toHaveLength(FINISHED_GAMES_LIMIT);
    expect(list[0].id).toBe('g24');
    list = addFinishedGame(list, { ...game('g20'), finishedAt: 2 });
    expect(list.filter((g) => g.id === 'g20')).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'g20', finishedAt: 2 });
  });

  it('reads only valid entries', () => {
    expect(parseFinishedGames(null)).toEqual([]);
    expect(parseFinishedGames('{')).toEqual([]);
    expect(parseFinishedGames(JSON.stringify([game('a'), { id: 3 }]))).toEqual([game('a')]);
  });
});
