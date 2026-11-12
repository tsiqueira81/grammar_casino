import { describe, expect, it, vi } from 'vitest';
import { createGameStore, type GameState } from '../state/gameStore';

const initial = (): GameState => ({
  step: 'PLAYER_SETUP', players: [], currentRound: 1, currentSentence: null,
  bets: {}, hints: {}, roundResults: [], winner: null, roundHistory: [],
  isSentenceRevealed: false, highlightedPhrase: null, teacherRevealOverride: false, isPaused: false, turnTimers: {},
  settings: { topic: 'Past simple', level: 'B1', theme: 'Space', challengeFormat: 'binary' } as GameState['settings'],
  gameMode: 'rounds', totalRounds: 10, targetAmount: 1000,
  freeDraws: {}, powerUpsUsedThisRound: {}, activePowerUps: {}, availablePowerUps: [], selectedPowerUps: [], roundSpending: {},
});

describe('game store (package F6)', () => {
  it('starts from the saved game', () => {
    const store = createGameStore({ ...initial(), step: 'RESULTS', currentRound: 4 });
    expect(store.getState().step).toBe('RESULTS');
    expect(store.getState().currentRound).toBe(4);
  });

  it('setters take a value or a function of the previous value, like React', () => {
    const store = createGameStore(initial());
    const { setCurrentRound, setStep } = store.getState();
    setCurrentRound(3);
    setCurrentRound(r => r + 1);
    setCurrentRound(r => r + 1);
    setStep('IN_GAME');
    expect(store.getState().currentRound).toBe(5);
    expect(store.getState().step).toBe('IN_GAME');
  });

  it('setting the same value again wakes no one', () => {
    const store = createGameStore(initial());
    const heard = vi.fn();
    store.subscribe(heard);
    const bets = store.getState().bets;
    store.getState().setBets(bets);
    store.getState().setBets(prev => prev);
    expect(heard).not.toHaveBeenCalled();
    store.getState().setBets({ 1: { amount: 10 } as never });
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('setters never change, so they are safe in dependency lists', () => {
    const store = createGameStore(initial());
    const before = store.getState().setPlayers;
    store.getState().setPlayers([{ id: 1 } as never]);
    expect(store.getState().setPlayers).toBe(before);
  });

  it('each game gets its own store', () => {
    const a = createGameStore(initial());
    const b = createGameStore(initial());
    a.getState().setCurrentRound(7);
    expect(b.getState().currentRound).toBe(1);
  });
});
