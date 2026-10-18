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
    description: "Fortune smiles on you! Added $500 directly to your bankroll.",
    color: "#059669",
    textColor: "#ffffff",
  },
  {
    id: 'house_tax',
    name: "House Levy",
    type: 'negative',
    icon: "💸",
    shortDesc: "-$100",
    description: "The casino collector demands his cut! Lost $100 to the House.",
    color: "#dc2626",
    textColor: "#ffffff",
  },
  {
    id: 'shield',
    name: "Aegis Shield",
    type: 'positive',
    icon: "🛡️",
    shortDesc: "Shield",
    description: "Protected! An impenetrable barrier guards you against harmful power-ups this round.",
    color: "#0284c7",
    textColor: "#ffffff",
  },
  {
    id: 'freeze',
    name: "Deep Freeze",
    type: 'negative',
    icon: "🥶",
    shortDesc: "Frozen ❄️",
    description: "Icy blast! Freezes you like Sub-zero for the current round. You cannot participate.",
    color: "#475569",
    textColor: "#ffffff",
  },
  {
    id: 'safety_net',
    name: "Safety Net",
    type: 'positive',
    icon: "🦺",
    shortDesc: "Safety Net",
    description: "Cushions your fall: if you lose your bet this round, you only lose half!",
    color: "#16a34a",
    textColor: "#ffffff",
  },
  {
    id: 'silenced',
    name: "Mute Curse",
    type: 'negative',
    icon: "🤐",
    shortDesc: "Silenced",
    description: "Cursed with silence! You cannot buy or use any power-ups for 2 rounds.",
    color: "#b91c1c",
    textColor: "#ffffff",
  },
  {
    id: 'bounty',
    name: "Pocket Pinch",
    type: 'positive',
    icon: "🤑",
    shortDesc: "+$100/ea",
    description: "Sticky fingers! Steal $100 from every other active player at the table.",
    color: "#d97706",
    textColor: "#ffffff",
  },
  {
    id: 'bet_cap',
    name: "Bet Shackle",
    type: 'negative',
    icon: "🔒",
    shortDesc: "Max $50",
    description: "Hands tied! Your bet for this round is strictly capped at $50 maximum.",
    color: "#7c2d12",
    textColor: "#ffffff",
  },
  {
    id: 'lucky_refund',
    name: "Lucky Refund",
    type: 'positive',
    icon: "🎁",
    shortDesc: "+$250 Bonus",
    description: "Complimentary jackpot! Refunded your $50 spin cost plus a +$250 bonus (+$300 total)!",
    color: "#0d9488",
    textColor: "#ffffff",
  },
  {
    id: 'forced_charity',
    name: "Forced Charity",
    type: 'negative',
    icon: "🕊️",
    shortDesc: "-$25/ea",
    description: "Compulsory generosity! You are forced to pay $25 to every other active player.",
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
    description: "Highlights the key grammatical phrase in the sentence for you.",
    icon: "🤓",
    requiresTarget: false,
  },
  THE_WHEEL: {
    name: "The Wheel",
    description: "Spin the Wheel of Fortune! 10 outcomes: 5 lucky fortunes, 5 perilous misfortunes.",
    icon: "🎡",
    requiresTarget: false,
  },
  SAFETY_NET: {
    name: "Safety Net",
    description: "If you lose this round, you only lose half of your bet.",
    icon: "🦺",
    requiresTarget: false,
  },
  IMMUNITY_IDOL: {
    name: "Immunity Idol",
    description: "If you lose this round, you lose $0. A one-time save!",
    icon: "🗿",
    requiresTarget: false,
  },
  TAXMAN: {
    name: "Taxman",
    description: `Collect $${TAXMAN_AMOUNT} from every other active player.`,
    icon: "🤑",
    requiresTarget: false,
  },
  BET_CAP: {
    name: "Bet Cap",
    description: `Caps a target player's maximum bet for this round at $${BET_CAP_AMOUNT}.`,
    icon: "🧢",
    requiresTarget: true,
  },
  HALF_BAKED: {
    name: "Half-Baked",
    description: "Halves the winnings of a target player if they win this round.",
    icon: "🍪",
    requiresTarget: true,
  },
  GENEROUS: {
    name: "Generous Gift",
    description: `You give every other active player $${GENEROUS_GIFT_AMOUNT}. Why? Who knows!`,
    icon: "🎁",
    requiresTarget: false,
  },
  JACKPOT: {
    name: "Jackpot",
    description: `If you win this round, your winnings are multiplied by ${JACKPOT_MULTIPLIER}x.`,
    icon: "🎰",
    requiresTarget: false,
  },
  BLESSING: {
    name: "Blessing",
    description: "For the next 3 rounds, 30% of your losses are forgiven.",
    icon: "💖",
    requiresTarget: false,
  },
  BOUNTY_HUNTER: {
    name: "Bounty Hunter",
    description: "If you win as part of the minority opinion, gain a 50% bonus.",
    icon: "🎯",
    requiresTarget: false,
  },
  CRUCIO: {
    name: "Crucio",
    description: "Target a player. They lose 20% of their winnings for the next 3 rounds.",
    icon: "⛓️",
    requiresTarget: true,
  },
  GUARDIAN_ANGEL: {
    name: "Guardian Angel",
    description: "You cannot be targeted for the rest of the round. Removes active curses/effects.",
    icon: "😇",
    requiresTarget: false,
  },
  POWER_SURGE: {
    name: "Power Surge",
    description: "You can buy up to two additional power-ups this round.",
    icon: "⚡",
    requiresTarget: false,
  },
  SAVINGS_ACCOUNT: {
    name: "Savings Account",
    description: "Earn 40% interest on money you don’t bet this round.",
    icon: "🏦",
    requiresTarget: false,
  },
  SHIELD: {
    name: "Shield",
    description: "You cannot be targeted by other players' power-ups for the rest of the round.",
    icon: "🛡️",
    requiresTarget: false,
  },
  SNOWBALL: {
    name: "Snowball",
    description: "Gain +10% winnings for each round in your current win streak.",
    icon: "⛄",
    requiresTarget: false,
  },
  SPLIT_BET: {
    name: "Split Bet",
    description: "Hedge your wager! Classic: split % between Valid & Flawed. MC Cloze: 50/50 Two-Option Pick. Open Cloze: submit 2 candidate words (50% wager each).",
    icon: "⚖️",
    requiresTarget: false,
  },
  SUB_ZERO: {
    name: "Sub-zero",
    description: "Freeze a target player. They cannot participate in this round.",
    icon: "❄️",
    requiresTarget: true,
  },
  THE_PUNISHER: {
    name: "The Punisher",
    description: "Reduce a target player's current money to 75%.",
    icon: "💀",
    requiresTarget: true,
  },
  THE_TITHE: {
    name: "The Tithe",
    description: "Collect 10% of every other active player's money.",
    icon: "🙏",
    requiresTarget: false,
  },
  ROBIN_HOOD: {
    name: "Robin Hood",
    description: "Steal 20% from the richest player(s) and distribute it to everyone else.",
    icon: "🏹",
    requiresTarget: false,
  },
  SILENCER: {
    name: "Silencer",
    description: "Prevent a target player from using any power-ups during the next round.",
    icon: "🤐",
    requiresTarget: true,
  },
  SECOND_CHANCE: {
    name: "Second Chance",
    description: "Passive: If you hit $0, instantly revive with $100. (Consumed on use).",
    icon: "👼",
    requiresTarget: false,
  },
  TEACHERS_PET: {
    name: "Teacher’s Pet",
    description: "The House grants you an additional 50% of your funds if you already have a 3-win streak or whenever you reach a 3-win streak.",
    icon: "🍎",
    requiresTarget: false,
  },
  CORRECTION_BOUNTY: {
    name: "Correction Bounty",
    description: "If the sentence is Incorrect, you bet on 'Incorrect', and properly correct it, you earn an extra bonus of 100% of your bet.",
    icon: "📝",
    requiresTarget: false,
  },
  LONE_WOLF: {
    name: "Lone Wolf",
    description: "If you are the only player at the table who bets on the correct outcome while all other players pick the wrong side, you win a 3× payout on your bet.",
    icon: "🐺",
    requiresTarget: false,
  },
  SWAP: {
    name: "Swap",
    description: "Select a player to swap your current funds with theirs.",
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