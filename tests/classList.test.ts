import { describe, expect, it } from 'vitest';
import { LOBBY_TIPS, LOBBY_TIP_MS, classListMatch, lobbyTipAt, missingFromClass, nameKey } from '../game/classList';

const list = [
  { id: 1, name: 'Ana' },
  { id: 2, name: 'João' },
  { id: 3, name: 'Leo' },
  { id: 4, name: 'Leo' },
];

describe('class list in the lobby (package T4)', () => {
  it('matches names whatever the case, spaces or accents', () => {
    expect(nameKey('  JOÃO  ')).toBe('joao');
    expect(classListMatch(list, [], 'ana')).toBe(0);
    expect(classListMatch(list, [], 'Joao ')).toBe(1);
  });

  it('does not give away a place that is already on a phone, or a name two students share', () => {
    expect(classListMatch(list, [1], 'Ana')).toBe(-1);
    expect(classListMatch(list, [], 'Leo')).toBe(-1);
    expect(classListMatch(list, [], 'Zoe')).toBe(-1);
    expect(classListMatch(list, [], '   ')).toBe(-1);
  });

  it('lists who is not here yet', () => {
    expect(missingFromClass(list, [1, 3]).map(p => p.id)).toEqual([2, 4]);
  });

  it('rotates the tips and comes back round', () => {
    expect(lobbyTipAt(0)).toBe(LOBBY_TIPS[0]);
    expect(lobbyTipAt(LOBBY_TIP_MS)).toBe(LOBBY_TIPS[1]);
    expect(lobbyTipAt(LOBBY_TIP_MS * LOBBY_TIPS.length)).toBe(LOBBY_TIPS[0]);
  });
});
