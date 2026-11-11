// Package G5: every power-up described in plain words, the default deck and the presets.
import { describe, expect, it } from 'vitest';
import { POWER_UPS, POWERUP_COST, CLOZE_DISABLED_POWER_UPS, BINARY_DISABLED_POWER_UPS, MP_ONLY_POWER_UPS } from '../constants';
import { DECK_PRESETS, DEFAULT_DECK, POWER_UP_CATALOG, matchingPreset, plainDescriptionOf } from '../game/powerUpCatalog';
import {
  BOOMERANG_REFLECTED_ATTACKS, BOOMERANG_REFLECTED_PLACED, clearNegativeEffects, isProtectedFromWheelBounty, mayBuyPowerUps,
} from '../game/powerUpRules';

const words = (s: string) => s.trim().split(/\s+/).length;

describe('power-up catalog', () => {
  it('describes all 40 cards in 12 words or fewer', () => {
    expect(POWER_UP_CATALOG).toHaveLength(40);
    expect(new Set(POWER_UP_CATALOG.map((e) => e.key)).size).toBe(40);
    for (const e of POWER_UP_CATALOG) {
      expect(words(e.plainDescription), e.key).toBeLessThanOrEqual(12);
      expect(e.plainDescription.length, e.key).toBeGreaterThan(10);
      expect(plainDescriptionOf(e.key)).toBe(e.plainDescription);
    }
  });

  it('changes nothing about price, targets or where a card can be used', () => {
    for (const e of POWER_UP_CATALOG) {
      expect(e.cost).toBe(POWERUP_COST);
      expect(e.name).toBe(POWER_UPS[e.key].name);
      expect(e.targeted).toBe(POWER_UPS[e.key].requiresTarget);
      expect(e.multiplayerOnly).toBe(MP_ONLY_POWER_UPS.includes(e.key));
      expect(e.allowedQuestionTypes.includes('binary')).toBe(!BINARY_DISABLED_POWER_UPS.includes(e.key));
      expect(e.allowedQuestionTypes.includes('openCloze')).toBe(!CLOZE_DISABLED_POWER_UPS.includes(e.key));
    }
  });
});

describe('decks', () => {
  it('the default deck is still all 40 cards', () => {
    expect(DEFAULT_DECK).toHaveLength(40);
    expect(new Set(DEFAULT_DECK)).toEqual(new Set(Object.keys(POWER_UPS)));
  });

  it('Classic has 12 balanced cards', () => {
    const classic = DECK_PRESETS.find((p) => p.id === 'classic')!;
    expect(classic.keys).toHaveLength(12);
    const cats = new Set(classic.keys.map((k) => POWER_UP_CATALOG.find((e) => e.key === k)!.category));
    expect(cats).toEqual(new Set(['boost', 'shield', 'insight', 'mischief']));
  });

  it('Friendly has no card that attacks another player', () => {
    const friendly = DECK_PRESETS.find((p) => p.id === 'friendly')!;
    expect(friendly.keys.length).toBeGreaterThan(15);
    for (const k of friendly.keys) {
      expect(POWER_UP_CATALOG.find((e) => e.key === k)!.category).not.toBe('mischief');
      expect(BOOMERANG_REFLECTED_ATTACKS).not.toContain(k);
    }
  });

  it('Chaos is everything, and a hand-picked deck is Custom', () => {
    expect(DECK_PRESETS.find((p) => p.id === 'chaos')!.keys).toHaveLength(40);
    expect(matchingPreset(DEFAULT_DECK)).toBe('chaos');
    expect(matchingPreset(['JACKPOT'])).toBe('custom');
    expect(matchingPreset([...DECK_PRESETS[0].keys].reverse())).toBe('classic');
  });
});

describe('power-up fixes (G5)', () => {
  it('one Boomerang list: what it sends back later is part of what it sends back at once', () => {
    for (const k of BOOMERANG_REFLECTED_PLACED) expect(BOOMERANG_REFLECTED_ATTACKS).toContain(k);
  });

  it("Guardian Angel protects from the wheel's Bounty, like a Shield", () => {
    expect(isProtectedFromWheelBounty([{ type: 'GUARDIAN_ANGEL' }])).toBe(true);
    expect(isProtectedFromWheelBounty([{ type: 'SHIELD' }])).toBe(true);
    expect(isProtectedFromWheelBounty([{ type: 'JACKPOT' }])).toBe(false);
  });

  it("Guardian Angel clears the wheel's freeze and bet cap as well as curses and silence", () => {
    const effects = [
      { type: 'CRUCIO', roundsLeft: 2 },
      { type: 'SILENCED', roundsLeft: 1 },
      { type: 'SUB_ZERO', roundsLeft: 1 },
      { type: 'BET_CAP', roundsLeft: 1 },
      { type: 'BLESSING', roundsLeft: 3 },
    ] as any;
    expect(clearNegativeEffects(effects).map((e) => e.type)).toEqual(['BLESSING']);
  });

  it('a silenced player cannot buy power-ups', () => {
    expect(mayBuyPowerUps({ effects: [{ type: 'SILENCED', roundsLeft: 1 }] as any })).toBe(false);
    expect(mayBuyPowerUps({ effects: [] })).toBe(true);
  });
});
