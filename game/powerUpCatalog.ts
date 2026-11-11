// Every power-up as data (package G5): a plain description a student can read on a phone
// (12 words or fewer, simple English), what kind of card it is, and where it can be used.
// Names, icons, effects and the flat price stay where they are (constants.ts); this file only
// describes them, so nothing about how a card plays changes.
import {
  BINARY_DISABLED_POWER_UPS,
  CLOZE_DISABLED_POWER_UPS,
  MP_ONLY_POWER_UPS,
  POWERUP_COST,
  POWER_UPS,
} from '../constants';
import type { PowerUpKey, QuestionType } from '../types';

export type PowerUpCategory = 'boost' | 'shield' | 'insight' | 'mischief';

export interface PowerUpCatalogEntry {
  key: PowerUpKey;
  name: string;
  /** At most 12 words, simple English, for phones and the touch help sheet. */
  plainDescription: string;
  category: PowerUpCategory;
  /** The flat price, unchanged. */
  cost: number;
  allowedQuestionTypes: QuestionType[];
  multiplayerOnly: boolean;
  targeted: boolean;
}

const ALL_TYPES: QuestionType[] = ['binary', 'multipleChoice', 'openCloze', 'wordFormation', 'keyWordTransformation'];

const PLAIN: Record<PowerUpKey, { text: string; category: PowerUpCategory }> = {
  GRAMMAR_GOGGLES: { text: 'Shows you the important grammar words in the sentence.', category: 'insight' },
  THE_WHEEL: { text: 'Spin a wheel: win a prize or get a problem.', category: 'boost' },
  SAFETY_NET: { text: 'If you lose this hand, you lose only half.', category: 'shield' },
  IMMUNITY_IDOL: { text: 'If you are wrong this hand, you lose nothing.', category: 'shield' },
  TAXMAN: { text: 'Take $100 from every other player without a shield.', category: 'mischief' },
  BET_CAP: { text: 'One rival can bet only $50 this hand.', category: 'mischief' },
  HALF_BAKED: { text: 'If one rival wins this hand, they win only half.', category: 'mischief' },
  GENEROUS: { text: 'Give $50 of your money to every other player.', category: 'boost' },
  JACKPOT: { text: 'If you win this hand, you win 1.5 times more.', category: 'boost' },
  BLESSING: { text: 'For three hands, you lose 30% less when wrong.', category: 'shield' },
  BOUNTY_HUNTER: { text: 'Win 50% more if few players chose your right answer.', category: 'boost' },
  CRUCIO: { text: 'For three hands, one rival wins 20% less.', category: 'mischief' },
  GUARDIAN_ANGEL: { text: 'Removes bad effects on you and blocks attacks this hand.', category: 'shield' },
  POWER_SURGE: { text: 'You can buy two more power-ups this hand.', category: 'boost' },
  SAVINGS_ACCOUNT: { text: 'Money you did not bet grows 40% after this hand.', category: 'boost' },
  SHIELD: { text: "Rivals' power-ups cannot target you this hand.", category: 'shield' },
  SNOWBALL: { text: 'Win 10% more for each win in your streak.', category: 'boost' },
  SPLIT_BET: { text: 'Bet on two answers, or all on one for double.', category: 'boost' },
  SUB_ZERO: { text: 'Freeze one rival: they cannot play this hand.', category: 'mischief' },
  THE_PUNISHER: { text: 'One rival loses a quarter of their money now.', category: 'mischief' },
  THE_TITHE: { text: 'Take 10% of the money of every unshielded player.', category: 'mischief' },
  ROBIN_HOOD: { text: 'Take 20% from the richest and share it with everyone.', category: 'mischief' },
  SILENCER: { text: 'One rival cannot buy power-ups until the next hand ends.', category: 'mischief' },
  SECOND_CHANCE: { text: 'If your money reaches $0, you get $300 back.', category: 'shield' },
  TEACHERS_PET: { text: 'After three wins in a row, your money grows 50%.', category: 'boost' },
  CORRECTION_BOUNTY: { text: 'Fix a flawed sentence correctly for a double bonus.', category: 'boost' },
  LONE_WOLF: { text: 'Win three times your bet if only you are right.', category: 'boost' },
  SWAP: { text: 'Swap all your money with the money of one rival.', category: 'mischief' },
  SCALPEL: { text: 'Removes wrong options, or shows letters of the answer.', category: 'insight' },
  PEEKABOO: { text: "Secretly see one rival's answer and bet on your phone.", category: 'insight' },
  COPYCAT: { text: 'Win 50% of a rival’s winnings; lose $100 if they lose.', category: 'mischief' },
  BLOOD_PACT: { text: 'Team up with a rival: win together, or the loser pays.', category: 'mischief' },
  CROWD_SURFER: { text: 'Win 10% more for every other player who is right.', category: 'boost' },
  HIGH_ROLLER: { text: 'One rival must bet at least half of their money.', category: 'mischief' },
  DOUBLE_OR_NOTHING: { text: 'Right: win three times your bet. Wrong: lose 1.5 times.', category: 'boost' },
  BOOMERANG: { text: 'A secret trap: attacks on you go back to the attacker.', category: 'shield' },
  PICKPOCKET: { text: "Take 20% of one rival's money now.", category: 'mischief' },
  AUDIENCE_POLL: { text: "See the table's answers and average bet, with no names.", category: 'insight' },
  UNDERDOG: { text: 'In the bottom half? A win pays 2.5 times.', category: 'boost' },
  SCAVENGER: { text: 'Collect 25% of the bets other players lose, up to $500.', category: 'boost' },
};

const CLOZE_TYPES: QuestionType[] = ['multipleChoice', 'openCloze', 'wordFormation', 'keyWordTransformation'];

function allowedTypes(key: PowerUpKey): QuestionType[] {
  return ALL_TYPES.filter((t) => {
    if (t === 'binary') return !BINARY_DISABLED_POWER_UPS.includes(key);
    if (CLOZE_TYPES.includes(t)) return !CLOZE_DISABLED_POWER_UPS.includes(key);
    return true;
  });
}

export const POWER_UP_CATALOG: PowerUpCatalogEntry[] = (Object.keys(POWER_UPS) as PowerUpKey[]).map((key) => ({
  key,
  name: POWER_UPS[key].name,
  plainDescription: PLAIN[key].text,
  category: PLAIN[key].category,
  cost: POWERUP_COST,
  allowedQuestionTypes: allowedTypes(key),
  multiplayerOnly: MP_ONLY_POWER_UPS.includes(key),
  targeted: POWER_UPS[key].requiresTarget,
}));

const BY_KEY = new Map(POWER_UP_CATALOG.map((e) => [e.key, e]));

export function getPowerUpEntry(key: PowerUpKey): PowerUpCatalogEntry | undefined {
  return BY_KEY.get(key);
}

export function plainDescriptionOf(key: PowerUpKey): string {
  return BY_KEY.get(key)?.plainDescription ?? POWER_UPS[key]?.description ?? '';
}

// --- Ready-made decks (opt-in presets; the default deck stays all 40 cards) ---

export type DeckPresetId = 'classic' | 'friendly' | 'chaos';

export interface DeckPreset {
  id: DeckPresetId;
  name: string;
  description: string;
  keys: PowerUpKey[];
}

/** Twelve balanced cards: four boosts, three shields, two insights, three mischief cards. */
const CLASSIC_KEYS: PowerUpKey[] = [
  'JACKPOT', 'SPLIT_BET', 'SNOWBALL', 'LONE_WOLF',
  'SAFETY_NET', 'SHIELD', 'IMMUNITY_IDOL',
  'GRAMMAR_GOGGLES', 'SCALPEL',
  'BET_CAP', 'SUB_ZERO', 'TAXMAN',
];

export const DECK_PRESETS: DeckPreset[] = [
  { id: 'classic', name: 'Classic', description: '12 balanced cards: boosts, shields, clues and a little mischief.', keys: CLASSIC_KEYS },
  {
    id: 'friendly',
    name: 'Friendly',
    description: 'Only boosts, shields and clues. Nobody can attack anyone.',
    keys: POWER_UP_CATALOG.filter((e) => e.category !== 'mischief').map((e) => e.key),
  },
  { id: 'chaos', name: 'Chaos', description: 'All 40 cards.', keys: POWER_UP_CATALOG.map((e) => e.key) },
];

/** The deck a new game starts with: all 40 cards, as before. */
export const DEFAULT_DECK: PowerUpKey[] = POWER_UP_CATALOG.map((e) => e.key);

/** Which preset (if any) a selection matches exactly; otherwise it is a custom deck. */
export function matchingPreset(selected: readonly PowerUpKey[]): DeckPresetId | 'custom' {
  const set = new Set(selected);
  const found = DECK_PRESETS.find((p) => p.keys.length === set.size && p.keys.every((k) => set.has(k)));
  return found ? found.id : 'custom';
}
