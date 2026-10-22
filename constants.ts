import { PowerUp, PowerUpKey, WheelItem, GrammarTopic, CEFRLevel, Theme, ChallengeFormat } from './types';

export const LOCAL_STORAGE_KEY = 'grammarCasinoGameState';
export const INITIAL_PLAYER_MONEY = 1000;
export const MIN_TARGET_AMOUNT = 2000;
export const DEFAULT_TARGET_AMOUNT = 2000;
export const HINT_COST = 20;
export const POWERUP_COST = 50;
export const TAXMAN_AMOUNT = 100;
export const GENEROUS_GIFT_AMOUNT = 50;
export const BET_CAP_AMOUNT = 50;
export const JACKPOT_MULTIPLIER = 1.5;

// --- Betting Turn Timer ---
export const TURN_TIMER_OPTIONS = [0, 30, 45, 60, 90, 120]; // Seconds per player turn; 0 = Off
export const TURN_TIMER_BONUS_MS = 15_000;                  // Teacher "+15s" button
export const TURN_TIMER_WARNING_SECONDS = 10;               // Ticking sound + pulse during the final seconds

export const WHEEL_ITEMS: WheelItem[] = [
  {
    id: 'jackpot',
    name: "Grand Windfall",
    type: 'positive',
    icon: "💰",
    shortDesc: "+$500",
    description: "Gain +$500 immediately.",
    color: "#059669",
    textColor: "#ffffff",
  },
  {
    id: 'house_tax',
    name: "House Levy",
    type: 'negative',
    icon: "💸",
    shortDesc: "-$100",
    description: "Lose $100 to the House immediately.",
    color: "#dc2626",
    textColor: "#ffffff",
  },
  {
    id: 'shield',
    name: "Aegis Shield",
    type: 'positive',
    icon: "🛡️",
    shortDesc: "Shield",
    description: "Blocks all rival power-ups targeting you this round.",
    color: "#0284c7",
    textColor: "#ffffff",
  },
  {
    id: 'freeze',
    name: "Deep Freeze",
    type: 'negative',
    icon: "🥶",
    shortDesc: "Frozen ❄️",
    description: "You are frozen and must sit out this round.",
    color: "#475569",
    textColor: "#ffffff",
  },
  {
    id: 'safety_net',
    name: "Safety Net",
    type: 'positive',
    icon: "🦺",
    shortDesc: "Safety Net",
    description: "Halves your loss if your bet loses this round.",
    color: "#16a34a",
    textColor: "#ffffff",
  },
  {
    id: 'silenced',
    name: "Mute Curse",
    type: 'negative',
    icon: "🤐",
    shortDesc: "Silenced",
    description: "You cannot buy or use power-ups for 2 rounds.",
    color: "#b91c1c",
    textColor: "#ffffff",
  },
  {
    id: 'bounty',
    name: "Pocket Pinch",
    type: 'positive',
    icon: "🤑",
    shortDesc: "+$100/ea",
    description: "Steal $100 from every other unshielded player.",
    color: "#d97706",
    textColor: "#ffffff",
  },
  {
    id: 'bet_cap',
    name: "Bet Shackle",
    type: 'negative',
    icon: "🔒",
    shortDesc: "Max $50",
    description: "Your maximum bet is capped at $50 this round.",
    color: "#7c2d12",
    textColor: "#ffffff",
  },
  {
    id: 'lucky_refund',
    name: "Lucky Refund",
    type: 'positive',
    icon: "🎁",
    shortDesc: "+$250 Bonus",
    description: "Refunds your $50 spin cost plus a $250 bonus (+$300 total).",
    color: "#0d9488",
    textColor: "#ffffff",
  },
  {
    id: 'forced_charity',
    name: "Forced Charity",
    type: 'negative',
    icon: "🕊️",
    shortDesc: "-$25/ea",
    description: "Pay $25 from your bankroll to every other active player.",
    color: "#991b1b",
    textColor: "#ffffff",
  },
];

export const AVATARS = [
  '👽', '👾', '🤖', '👻', '🤡', '💩', '👺', '👹', '👿', '💀',
  '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯',
  '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦆',
  '🦄', '🐴', '🐗', '🐺', '🦇', '🦉', '🦅', '🐝', '🐛', '🦋',
  '🐌', '🐞', '🐜', '🦟', '🦗', '🕷', '🕸', '🦂', '🐢', '🐍',
  '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠',
  '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍',
  '🦧', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒', '🦘', '🐃', '🐂',
  '🐄', '🐎', '🐖', '🐏', '🐑', '🦙', '🐐', '🦌', '🐕', '🐩',
  '🦮', '🐕‍🦺', '🐈', '🐈‍⬛', '🐓', '🦃', '🦚', '🦜', '🦢', '🦩',
  '🕊', '🐇', '🦝', '🦨', '🦡', '🦦', '🦥', '🐁', '🐀', '🐿', '🦔',
  '👨', '👩', '👱', '👨‍🦰', '👩‍🦰', '👨‍🦱', '👩‍🦱', '👨‍🦳', '👩‍🦳', '🧛', '🧙', '🧝'
];

export const POWER_UPS: Record<PowerUpKey, PowerUp> = {
  GRAMMAR_GOGGLES: {
    name: "Grammar Goggles",
    description: "Highlights the key grammar phrase in this round's sentence.",
    icon: "🤓",
    requiresTarget: false,
  },
  THE_WHEEL: {
    name: "The Wheel",
    description: "Spin the Wheel of Fortune for 1 of 5 rewards or 5 hazards.",
    icon: "🎡",
    requiresTarget: false,
  },
  SAFETY_NET: {
    name: "Safety Net",
    description: "Halves your loss if your bet loses this round.",
    icon: "🦺",
    requiresTarget: false,
  },
  IMMUNITY_IDOL: {
    name: "Immunity Idol",
    description: "Lose $0 if your bet is wrong this round.",
    icon: "🗿",
    requiresTarget: false,
  },
  TAXMAN: {
    name: "Taxman",
    description: `Steal $${TAXMAN_AMOUNT} from every other unshielded player.`,
    icon: "🤑",
    requiresTarget: false,
  },
  BET_CAP: {
    name: "Bet Cap",
    description: `Limits one rival's maximum bet to $${BET_CAP_AMOUNT} this round.`,
    icon: "🧢",
    requiresTarget: true,
  },
  HALF_BAKED: {
    name: "Half-Baked",
    description: "Cuts one rival's payout in half if they win this round.",
    icon: "🍪",
    requiresTarget: true,
  },
  GENEROUS: {
    name: "Generous Gift",
    description: `Gives $${GENEROUS_GIFT_AMOUNT} from your bankroll to every other active player.`,
    icon: "🎁",
    requiresTarget: false,
  },
  JACKPOT: {
    name: "Jackpot",
    description: `Boosts your winnings by ${JACKPOT_MULTIPLIER}× if you win this round.`,
    icon: "🎰",
    requiresTarget: false,
  },
  BLESSING: {
    name: "Blessing",
    description: "Reduces any bet losses by 30% for the next 3 rounds.",
    icon: "💖",
    requiresTarget: false,
  },
  BOUNTY_HUNTER: {
    name: "Bounty Hunter",
    description: "Gain +50% winnings if you win with the minority choice.",
    icon: "🎯",
    requiresTarget: false,
  },
  CRUCIO: {
    name: "Crucio",
    description: "Curses one rival to lose 20% of their winnings for 3 rounds.",
    icon: "⛓️",
    requiresTarget: true,
  },
  GUARDIAN_ANGEL: {
    name: "Guardian Angel",
    description: "Clears negative effects on you and blocks rival attacks this round.",
    icon: "😇",
    requiresTarget: false,
  },
  POWER_SURGE: {
    name: "Power Surge",
    description: "Allows you to buy up to 2 extra power-ups this round.",
    icon: "⚡",
    requiresTarget: false,
  },
  SAVINGS_ACCOUNT: {
    name: "Savings Account",
    description: "Earn +40% interest on any unbet cash after this round.",
    icon: "🏦",
    requiresTarget: false,
  },
  SHIELD: {
    name: "Shield",
    description: "Blocks all rival power-ups from targeting you this round.",
    icon: "🛡️",
    requiresTarget: false,
  },
  SNOWBALL: {
    name: "Snowball",
    description: "Adds +10% winnings per win in your current streak.",
    icon: "⛄",
    requiresTarget: false,
  },
  SPLIT_BET: {
    name: "Split Bet",
    description: "Split your wager across 2 answers (50/50) or stack 100% on 1 answer for 2× payout.",
    icon: "⚖️",
    requiresTarget: false,
  },
  SUB_ZERO: {
    name: "Sub-zero",
    description: "Freezes one rival so they must sit out this round.",
    icon: "❄️",
    requiresTarget: true,
  },
  THE_PUNISHER: {
    name: "The Punisher",
    description: "Instantly cuts one rival's bankroll by 25%.",
    icon: "💀",
    requiresTarget: true,
  },
  THE_TITHE: {
    name: "The Tithe",
    description: "Steal 10% of every other unshielded player's bankroll.",
    icon: "🙏",
    requiresTarget: false,
  },
  ROBIN_HOOD: {
    name: "Robin Hood",
    description: "Takes 20% from the richest player(s) and splits it among everyone else.",
    icon: "🏹",
    requiresTarget: false,
  },
  SILENCER: {
    name: "Silencer",
    description: "Blocks one rival from buying power-ups through next round.",
    icon: "🤐",
    requiresTarget: true,
  },
  SECOND_CHANCE: {
    name: "Second Chance",
    description: "Auto-revives you with $100 the next time you hit $0.",
    icon: "👼",
    requiresTarget: false,
  },
  TEACHERS_PET: {
    name: "Teacher’s Pet",
    description: "Grants +50% bankroll at a 3-win streak (instant if already at 3+).",
    icon: "🍎",
    requiresTarget: false,
  },
  CORRECTION_BOUNTY: {
    name: "Correction Bounty",
    description: "Doubles your correction bonus (+100% extra wager) when fixing a flawed sentence.",
    icon: "📝",
    requiresTarget: false,
  },
  LONE_WOLF: {
    name: "Lone Wolf",
    description: "Win a 3× payout if you are the only player with the correct answer.",
    icon: "🐺",
    requiresTarget: false,
  },
  SWAP: {
    name: "Swap",
    description: "Swap your entire bankroll with a chosen rival.",
    icon: "🔄",
    requiresTarget: true,
  }
};

export const GRAMMAR_TOPICS: GrammarTopic[] = [
  'Tenses', 'Prepositions', 'Articles', 'Conditionals', 'Modals', 'Phrasal Verbs', 'Reported Speech', 'My own choice'
];

export const CEFR_LEVELS: CEFRLevel[] = [
  'A1', 'A2', 'B1', 'B2', 'C1', 'C2'
];

export interface CefrDifficultyProfile {
  level: CEFRLevel;
  title: string;
  syntax: string;
  lexis: string;
  mistakeIdentification: string;
  badgeColor: string;
}

export const CEFR_DIFFICULTY_PROFILES: Record<CEFRLevel, CefrDifficultyProfile> = {
  'A1': {
    level: 'A1',
    title: 'Beginner',
    syntax: 'Short, basic SVO clauses (6-10 words)',
    lexis: 'Elementary, high-frequency everyday vocabulary',
    mistakeIdentification: 'Blatant, obvious error directly spotted (e.g. "She have two cats")',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-700'
  },
  'A2': {
    level: 'A2',
    title: 'Elementary',
    syntax: 'Simple compound sentences with basic connectors (8-14 words)',
    lexis: 'Everyday routine vocabulary and common collocations',
    mistakeIdentification: 'Clear, direct error (e.g. irregular past "buyed", preposition "in Monday")',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700'
  },
  'B1': {
    level: 'B1',
    title: 'Intermediate',
    syntax: 'Multi-clause sentences with relative clauses & modals (12-18 words)',
    lexis: 'Broad conversational vocabulary and common phrasal verbs',
    mistakeIdentification: 'Distinguishable error requiring clause context (e.g. present perfect with past time adverb)',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700'
  },
  'B2': {
    level: 'B2',
    title: 'Upper-Intermediate',
    syntax: 'Complex multi-clause syntax with passives & conditionals (16-24 words)',
    lexis: 'Rich, varied vocabulary, abstract nouns & dependent prepositions',
    mistakeIdentification: 'Challenging, nuanced error embedded in natural flow (e.g. state verb in progressive)',
    badgeColor: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-700'
  },
  'C1': {
    level: 'C1',
    title: 'Advanced',
    syntax: 'Dense academic structures: inversion, clefts, participle clauses (20-30 words)',
    lexis: 'Sophisticated academic/professional lexis and nuanced register',
    mistakeIdentification: 'Subtle and deceptive error camouflaged in formal phrasing (e.g. negative inversion order)',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-700'
  },
  'C2': {
    level: 'C2',
    title: 'Mastery',
    syntax: 'Masterful native syntax: fronting, parentheticals, inverted conditionals (22-35 words)',
    lexis: 'Erudite, nuanced vocabulary, rare idioms & subtle connotations',
    mistakeIdentification: 'Extremely subtle, elusive error requiring razor-sharp scrutiny (e.g. delicate case agreement)',
    badgeColor: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-700'
  }
};

export const THEMES: Theme[] = [
  'Fantasy 🐉', 'Sci-Fi 🚀', 'History 🏛️', 'Everyday Life ☕', 'Business 💼', 'Technology 💻', 'Pop Culture 🍿', 'Custom ✍️'
];

export const CLOZE_DISABLED_POWER_UPS: PowerUpKey[] = ['CORRECTION_BOUNTY', 'GRAMMAR_GOGGLES'];

export interface ChallengeFormatOption {
  id: ChallengeFormat;
  label: string;
  shortLabel: string;
  subtitle: string;
  icon: string;
}

export const CHALLENGE_FORMATS: ChallengeFormatOption[] = [
  {
    id: 'binary',
    label: 'Valid or Flawed (Classic)',
    shortLabel: 'Valid / Flawed',
    subtitle: 'Judge if the sentence is grammatically sound or flawed (+ correction bonus)',
    icon: '⚖️',
  },
  {
    id: 'multipleChoice',
    label: 'Multiple-Choice Cloze',
    shortLabel: 'MC Cloze (A–D)',
    subtitle: '4 options (A, B, C, D) — pick the word or phrase that completes the gap',
    icon: '🔠',
  },
  {
    id: 'openCloze',
    label: 'Open Cloze',
    shortLabel: 'Open Cloze',
    subtitle: 'Cambridge style — type the single missing word that fits the gap',
    icon: '✍️',
  },
  {
    id: 'mixed',
    label: 'Mixed Shoe',
    shortLabel: 'Mixed Shoe',
    subtitle: 'Rotates between Valid/Flawed, Multiple-Choice Cloze, and Open Cloze each hand',
    icon: '🔀',
  },
];

export const TOPIC_SUBTYPES: Record<string, string[]> = {
  'Tenses':          ['Present Simple','Present Continuous','Present Perfect','Past Simple','Past Continuous','Past Perfect','Future Simple','Future Continuous','Future Perfect'],
  'Conditionals':    ['Zero Conditional','First Conditional','Second Conditional','Third Conditional','Mixed Conditional'],
  'Modals':          ['Ability (can/could)','Permission (may/might)','Obligation (must/have to)','Advice (should/ought to)','Possibility (could/might/may)','Deduction (must/can\'t)'],
  'Prepositions':    ['Time (at/on/in)','Place (at/on/in)','Direction (to/into/onto)','Prepositions after adjectives','Prepositions after verbs','Prepositional phrases'],
  'Articles':        ['Definite article (the)','Indefinite article (a/an)','Zero article','Generic reference','Specific reference'],
  'Phrasal Verbs':   ['Separable transitive','Inseparable transitive','Intransitive','Three-part phrasal verbs'],
  'Reported Speech': ['Reported statements','Reported questions','Reported commands','Tense backshift','Reporting verbs'],
  'Mixed Grammar':   ['Subject-verb agreement','Pronoun reference','Parallelism','Dangling modifiers','Run-on sentences','Sentence fragments'],
};