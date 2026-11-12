// Package F6: one store for the state of the game in play (the table, the hand, the results), so
// that screens can read it directly instead of receiving it through long lists of props.
// Each App owns its own store (made once, from the saved game), and every field has a setter that
// works like React's: it takes a value or a function of the previous value. Setters never change,
// so they are safe in effect and callback dependency lists.
import { createContext, useContext } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import type { Bet, GeneratedSentence, Hint, Player, RoundHistoryRecord, RoundResultInfo, Step } from '../types';

export interface GameState {
  step: Step;
  players: Player[];
  currentRound: number;
  currentSentence: GeneratedSentence | null;
  bets: Record<number, Bet>;
  hints: Record<number, Hint>;
  roundResults: RoundResultInfo[];
  winner: Player | null;
  roundHistory: RoundHistoryRecord[];
}

export type Update<T> = T | ((prev: T) => T);
export type Setter<T> = (next: Update<T>) => void;

type SetterName<K extends string> = `set${Capitalize<K>}`;
export type GameSetters = { [K in keyof GameState as SetterName<K & string>]: Setter<GameState[K]> };
export type GameStoreState = GameState & GameSetters;
export type GameStore = StoreApi<GameStoreState>;

export const GAME_STATE_KEYS = [
  'step', 'players', 'currentRound', 'currentSentence', 'bets', 'hints', 'roundResults', 'winner', 'roundHistory',
] as const satisfies readonly (keyof GameState)[];

const setterName = (key: string) => `set${key[0].toUpperCase()}${key.slice(1)}`;

export function createGameStore(initial: GameState): GameStore {
  return createStore<GameStoreState>()((set, get) => {
    const setters: Record<string, Setter<unknown>> = {};
    for (const key of GAME_STATE_KEYS) {
      setters[setterName(key)] = (next) => {
        const prev = get()[key];
        const value = typeof next === 'function' ? (next as (p: unknown) => unknown)(prev) : next;
        // Like React: setting the same value again changes nothing and wakes no one.
        if (Object.is(value, prev)) return;
        set({ [key]: value } as Partial<GameStoreState>);
      };
    }
    return { ...initial, ...(setters as unknown as GameSetters) };
  });
}

export const GameStoreContext = createContext<GameStore | null>(null);

/** Read one piece of the game in play, from inside the App. */
export function useGame<T>(selector: (state: GameStoreState) => T): T {
  const store = useContext(GameStoreContext);
  if (!store) throw new Error('useGame needs the GameStoreContext provider that App renders.');
  return useStore(store, selector);
}
