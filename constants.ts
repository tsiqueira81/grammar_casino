import { PowerUp, PowerUpKey, WheelItem, GrammarTopic, CEFRLevel, Theme, ChallengeFormat, QuestionType } from './types';

export const ALL_QUESTION_TYPES: QuestionType[] = ['binary', 'multipleChoice', 'openCloze', 'wordFormation', 'keyWordTransformation'];

export const getEffectiveMixedFormats = (mixedFormats?: QuestionType[]): QuestionType[] => {
  if (!Array.isArray(mixedFormats) || mixedFormats.length === 0) {
    return ALL_QUESTION_TYPES;
  }
  const filtered = ALL_QUESTION_TYPES.filter(q => mixedFormats.includes(q));
  return filtered.length > 0 ? filtered : ALL_QUESTION_TYPES;
};

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
    description: "Auto-revives you with $300 the next time you hit $0.",
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
  },
  SCALPEL: {
    name: "50/50 Scalpel",
    description: "Eliminates 2 wrong options in Multiple-Choice, reveals first letter & length in Open Cloze, reveals prefix/suffix letters in Word Formation, or reveals word count & boundary words in Key Word Transformation.",
    icon: "✂️",
    requiresTarget: false,
  },
  PEEKABOO: {
    name: "Peekaboo",
    description: "Secretly spy on a chosen rival's live answer and bet amount on your screen (Multiplayer only).",
    icon: "🕵️",
    requiresTarget: true,
  },
  COPYCAT: {
    name: "Copycat",
    description: "If your chosen target wins this round, you earn +50% of their winnings; if they lose, you lose $100.",
    icon: "🪞",
    requiresTarget: true,
  },
  BLOOD_PACT: {
    name: "Blood Pact",
    description: "Links you and a rival: if both win, both get +50% payout; if one misses, the loser pays $100 to the winner.",
    icon: "🤝",
    requiresTarget: true,
  },
  CROWD_SURFER: {
    name: "Crowd Surfer",
    description: "Gain +10% bonus winnings for every other player at the table who also gets the question right.",
    icon: "📢",
    requiresTarget: false,
  },
  HIGH_ROLLER: {
    name: "High Roller",
    description: "Forces one rival's minimum bet this round to be at least 50% of their current bankroll.",
    icon: "🔥",
    requiresTarget: true,
  },
  DOUBLE_OR_NOTHING: {
    name: "Double or Nothing",
    description: "Win 3× (+200% payout, requires a valid correction on Flawed sentences in Binary mode), or lose 1.5× your bet if wrong.",
    icon: "🎲",
    requiresTarget: false,
  },
  BOOMERANG: {
    name: "Boomerang",
    description: "Concealed trap: reflects any offensive targeted power-up used against you this round back at the attacker.",
    icon: "🪃",
    requiresTarget: false,
  },
  PICKPOCKET: {
    name: "Pickpocket",
    description: "Instantly steals 20% of a chosen rival's current bankroll and adds it to yours.",
    icon: "🕵️‍♂️",
    requiresTarget: true,
  },
  AUDIENCE_POLL: {
    name: "Ask the Table",
    description: "Reveals a live anonymized poll of all answers and average bet from other players this round.",
    icon: "📊",
    requiresTarget: false,
  },
  UNDERDOG: {
    name: "Underdog Surge",
    description: "Win a 2.5× comeback payout (+150% winnings) if you are in the bottom half of the standings.",
    icon: "🚀",
    requiresTarget: false,
  },
  SCAVENGER: {
    name: "Dead Pool Scavenger",
    description: "Scoop up 25% of every losing bet lost by other players to the House this round (up to +$500).",
    icon: "🦅",
    requiresTarget: false,
  }
};

export const GRAMMAR_TOPICS: GrammarTopic[] = [
  'Tenses', 'Prepositions', 'Articles', 'Conditionals', 'Modals', 'Phrasal Verbs', 'Reported Speech', 'Collocations', 'My own choice'
];

export const QUICK_LEXICAL_TOPICS: string[] = [
  'School Subjects',
  'Places in Town',
  'Food & Cooking',
  'Travel & Transport',
  'Jobs & Professions',
  'Daily Routines',
  'Sports & Hobbies',
  'Health & Body',
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
export const BINARY_DISABLED_POWER_UPS: PowerUpKey[] = ['SCALPEL'];
export const MP_ONLY_POWER_UPS: PowerUpKey[] = ['PEEKABOO'];
export const NON_OFFENSIVE_TARGETED_POWER_UPS: PowerUpKey[] = ['PEEKABOO', 'COPYCAT'];

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
    label: 'Valid or flawed',
    shortLabel: 'Valid or flawed',
    subtitle: 'Decide if the sentence is correct. Fixing a flawed one earns a bonus.',
    icon: '⚖️',
  },
  {
    id: 'multipleChoice',
    label: 'Multiple-choice cloze',
    shortLabel: 'Multiple choice',
    subtitle: 'Pick the word or phrase (A, B, C or D) that fills the gap.',
    icon: '🔠',
  },
  {
    id: 'openCloze',
    label: 'Open cloze',
    shortLabel: 'Open cloze',
    subtitle: 'Type the one missing word that fits the gap.',
    icon: '✍️',
  },
  {
    id: 'wordFormation',
    label: 'Word formation',
    shortLabel: 'Word formation',
    subtitle: 'Change the word in brackets so it fits the gap.',
    icon: '🧬',
  },
  {
    id: 'keyWordTransformation',
    label: 'Key word transformation',
    shortLabel: 'Key word',
    subtitle: 'Finish the second sentence with 2 to 6 words, including the key word. 1 or 2 marks.',
    icon: '🔑',
  },
  {
    id: 'mixed',
    label: 'Mixed',
    shortLabel: 'Mixed',
    subtitle: 'Each hand uses the next question type you choose below. All 5 are on at first.',
    icon: '🔀',
  },
];

export const TOPIC_SUBTYPES: Record<string, string[]> = {
  'Tenses': [
    'Present Simple',
    'Present Continuous',
    'Present Perfect Simple',
    'Present Perfect Continuous',
    'Past Simple',
    'Past Continuous',
    'Past Perfect Simple',
    'Past Perfect Continuous',
    'Future Continuous (will be doing)',
    'Future Perfect (will have done)',
    'Future in the Past (was/were going to / would)',
  ],
  'Conditionals': [
    'Zero Conditional',
    'First Conditional (with unless / as long as / provided that)',
    'Second Conditional (unreal present/future)',
    'Third Conditional (unreal past)',
    'Mixed Conditional (past condition, present result)',
    'Mixed Conditional (present state, past result)',
    'Inverted / Formal Conditionals (Had I known / Were it not for / Should you)',
    'Wish / If only / Would rather (unreal tenses)',
  ],
  'Modals': [
    'Ability & Achievement (can / could / be able to / manage to)',
    'Permission & Prohibition (may / be allowed to / mustn\'t / can\'t)',
    'Obligation & Necessity (must / have to / need to / needn\'t have)',
    'Advice & Criticism (should / ought to / had better / should have + past participle)',
    'Possibility & Probability (could / might / may well + infinitive or perfect infinitive)',
    'Logical Deduction Present & Past (must be / can\'t be / must have been / can\'t have been)',
    'Past Modal Regret & Speculation (could have / might have / needn\'t have + past participle)',
  ],
  'Prepositions': [
    'Time & Duration (at/on/in/by/until/during/throughout)',
    'Place, Position & Movement (at/on/in/into/onto/across/beyond)',
    'Dependent prepositions after adjectives (accustomed to, capable of, renowned for)',
    'Dependent prepositions after verbs (insist on, succeed in, blame for, accuse of)',
    'Dependent prepositions after nouns (increase in, solution to, impact on, demand for)',
    'Complex prepositional phrases (in spite of, on behalf of, with regard to, by means of)',
  ],
  'Articles': [
    'Definite article (the) for unique or previously mentioned reference',
    'Indefinite article (a/an) for singular countable roles & classifications',
    'Zero article with plural/uncountable generic concepts',
    'Generic reference (The + singular noun /The + adjective for groups)',
    'Specific vs. institutional reference (go to school/hospital/prison vs. the school)',
    'Articles with geographical names, institutions, and media',
  ],
  'Phrasal Verbs': [
    'Separable transitive phrasal verbs (call off, turn down, bring up, work out)',
    'Inseparable transitive phrasal verbs (look into, come across, run into, take after)',
    'Intransitive phrasal verbs (break down, show up, take off, wear off)',
    'Three-part phrasal verbs (put up with, look forward to, come up with, get away with)',
    'Phrasal verbs with multiple idiomatic meanings (make up, take on, set off, turn out)',
  ],
  'Reported Speech': [
    'Reported statements with tense backshift',
    'Reported yes/no and wh- questions (word order & if/whether)',
    'Reported commands, requests, and warnings (told/warned/urged + object + to-infinitive)',
    'Reporting verbs with gerund or preposition (admit, deny, apologize for, insist on, accuse of)',
    'Reporting verbs with to-infinitive (refuse, offer, promise, threaten, claim)',
    'Reporting verbs with that-clause / subjunctive (suggest, recommend, demand)',
    'Time and place reference shifts in indirect speech',
  ],
  'Collocations': [
    'Delexicalized Verb + Noun (make/do/take/have/pay/give/draw)',
    'Adjective + Noun collocations (heavy traffic, fierce competition, slim chance)',
    'Verb + Preposition collocations (contribute to, rely on, specialize in, stem from)',
    'Adverb + Adjective collocations (bitterly disappointed, highly unlikely, utterly ridiculous)',
    'Fixed idiomatic & comparative expressions (by far, at stake, out of the question)',
  ],
  'Passive Voice': [
    'Present Continuous Passive (is/are being + past participle)',
    'Past Continuous Passive (was/were being + past participle)',
    'Present Perfect Passive (has/have been + past participle)',
    'Past Perfect Passive (had been + past participle)',
    'Modal Passive & Modal Perfect Passive (must/should/could/might be or have been + past participle)',
    'Impersonal Reporting Passive (is/was said, believed, thought, rumoured, or expected + to-infinitive / to have + past participle)',
    'Causative Passive (have/get something done across varied tenses)',
    'Passive Infinitive or Gerund (to be + past participle / being + past participle / having been + past participle)',
    'Future & Future Perfect Passive (will be / is going to be / will have been + past participle)',
    'Ditransitive & Prepositional Passive (was awarded to / was spoken about / was relied upon / was taken care of)',
    'Present Simple Passive with high-register verbs (is regarded as / is attributed to / is composed of)',
    'Past Simple Passive with narrative/historical focus (was commissioned / was broadcast / was unveiled)',
  ],
  'Relative Clauses': [
    'Defining relative clauses (who/which/that)',
    'Non-defining relative clauses with commas',
    'Relative clauses with formal prepositions (in which / to whom / on which)',
    'Possessive relative clauses (whose)',
    'Relative adverbs of place, time, and reason (where / when / why)',
    'Reduced relative clauses (present -ing and past -ed participle phrases)',
    'Quantifiers with relative pronouns (most of whom / neither of which / many of which)',
    'Nominal relative clauses (what / whatever / whoever)',
  ],
  'Gerunds and Infinitives': [
    'Verbs followed by gerund (-ing: avoid, deny, risk, consider, postpone, suggest)',
    'Verbs followed by to-infinitive (afford, manage, pretend, refuse, tend, threaten)',
    'Verbs + object + to-infinitive (encourage, persuade, enable, forbid, remind)',
    'Verbs with meaning change (remember, forget, stop, regret, try, go on + -ing vs. to-infinitive)',
    'Prepositions and phrasal expressions followed by gerund (look forward to, be used to, in spite of, instead of)',
    'Passive gerunds and infinitives (being + past participle / to be + past participle)',
    'Perfect gerunds and infinitives (having + past participle / to have + past participle)',
    'Bare infinitive after make, let, perception verbs, had better, and would rather',
  ],
  'Comparatives and Superlatives': [
    'Comparative adjectives and adverbs with modifiers (much, far, slightly, a great deal, considerably)',
    'Superlative structures (by far the most..., one of the least..., the second most...)',
    'Equality & inequality comparisons (as...as / not nearly as...as / nowhere near as...as / twice as...as)',
    'Correlative double comparatives (The more..., the more... / The sooner..., the better)',
    'Preference comparisons (prefer X to Y / would rather do X than Y / would prefer to)',
    'Resultative comparisons (so + adj/adv + that vs. such + noun phrase + that / too...to vs. enough to)',
  ],
  'Subject-Verb Agreement': [
    'Indefinite pronouns (everyone, neither, each, nobody, either + singular verb)',
    'Correlative conjunctions (neither...nor / either...or / not only...but also proximity agreement)',
    'Subjects with intervening phrases (along with, as well as, accompanied by, in addition to)',
    'Quantifiers & fractions (a number of + plural vs. the number of + singular / majority of)',
    'Collective nouns and plural-form singular nouns (news, economics, series, species, criteria)',
    'Inverted subjects and cleft clauses (There is/are, Here comes, What matters most is/are)',
  ],
  'Inversion': [
    'Negative frequency adverbials at clause start (Never, Rarely, Seldom, Scarcely)',
    'Time correlative inversion (Hardly...when / Scarcely...when / No sooner...than)',
    'Additive & restrictive inversion (Not only...but also / Little did they know)',
    'Only-phrases requiring inversion (Only after / Only when / Only by / Only then)',
    'Prepositional & prohibitive inversion (Under no circumstances / On no account / At no time)',
    'Degree inversion (So + adjective + be + subject + that / Such + be + noun + that)',
  ],
  'Causatives': [
    'Have something done (present, past, present perfect, and modal forms)',
    'Get something done (informal/effort causative across tenses)',
    'Active causative: have someone do something (bare infinitive)',
    'Active persuasive causative: get someone to do something (to-infinitive)',
    'Make someone do something vs. passive be made to do something',
    'Let someone do something vs. be allowed to do something',
  ],
  'Wish and Unreal Past': [
    'Wish / If only + past simple or continuous (present regret or desire)',
    'Wish / If only + past perfect (past regret)',
    'Wish / If only + would + infinitive (annoyance or desire for change)',
    'It is time / It is high time + subject + past simple',
    'Would rather / Would sooner + subject + past simple or past perfect',
    'As if / As though + unreal past or past perfect',
  ],
  'Participle Clauses': [
    'Present participle clauses (-ing) expressing simultaneous action or reason',
    'Past participle clauses (-ed) expressing passive condition or cause',
    'Perfect participle clauses (Having + past participle) expressing prior action',
    'Passive perfect participle clauses (Having been + past participle)',
    'Participle clauses after conjunctions/prepositions (On arriving, While waiting, Once completed)',
  ],
  'Mixed Grammar': [
    'Subject-verb agreement',
    'Passive voice & causative structures',
    'Unreal past & mixed conditionals',
    'Relative clauses & participle clauses',
    'Gerunds vs. infinitives & dependent prepositions',
    'Modal perfects of deduction & regret',
    'Negative inversion & cleft sentences',
    'Reported speech with reporting verbs',
  ],
};

const LEVEL_FALLBACK_SUBTYPES: Record<CEFRLevel, string[]> = {
  A1: [
    'Present Simple affirmative/negative/question form',
    'Present Continuous action in progress',
    'Past Simple regular and irregular forms',
    'Basic modal verbs (can / can\'t / must)',
    'Going to future plans',
    'Singular/plural & countable/uncountable determiners',
  ],
  A2: [
    'Past Simple vs. Past Continuous',
    'Present Perfect with ever/never/already/yet/just',
    'Comparative and superlative forms',
    'First Conditional & future time clauses',
    'Modal verbs of obligation and advice (have to / should)',
    'Present and Past Simple Passive',
    'Gerunds vs. to-infinitives after common verbs',
  ],
  B1: [
    'Present Perfect Simple vs. Continuous (for/since)',
    'Past Perfect in narrative sequences',
    'Second & Third Conditionals',
    'Passive Voice across continuous, perfect, and modal tenses',
    'Reported speech & reporting verbs',
    'Defining and non-defining relative clauses',
    'Modals of deduction (must / might / can\'t)',
    'Causative have/get something done',
  ],
  B2: [
    'Present Perfect Continuous & Past Perfect Continuous',
    'Modal Perfects (should have / must have / needn\'t have + past participle)',
    'Impersonal Reporting Passive (is said/believed/expected to have...)',
    'Present & Past Continuous Passive / Perfect Passive',
    'Causative constructions (have/get something done)',
    'Mixed Conditionals & Wish / If only / High time',
    'Future Continuous & Future Perfect',
    'Gerund/Infinitive meaning shifts & Passive Gerunds/Infinitives',
    'Correlative comparisons (The more..., the more... / nowhere near as...as)',
    'Participle clauses & reduced relative clauses',
  ],
  C1: [
    'Negative & restrictive inversion (Never / No sooner / Only after / Not only)',
    'Impersonal passive & passive infinitives/gerunds (is rumoured to have been...)',
    'Subjunctive mood & formal conditional inversion (Were it not for / Had it not been for)',
    'Cleft sentences for emphasis (It was... that / What... was)',
    'Perfect & passive participle clauses (Having been...)',
    'Advanced reporting verbs + preposition + gerund',
    'Complex relative clauses with prepositions & quantifiers (in which / most of whom)',
    'Nuanced modal idioms & hedging structures',
  ],
  C2: [
    'Inverted conditionals & negative adverbial fronting (Scarcely / Little / Under no circumstances)',
    'Complex impersonal passive &perfect passive infinitives',
    'Emphatic cleft & pseudo-cleft constructions',
    'Absolute participle clauses & nominative absolutes',
    'Subtle subjunctive, putative should, and archaic/formal conditionals',
    'Idiomatic phrasal-prepositional verbs & high-register collocations',
    'Double comparatives & subtle degree modifiers',
    'Ellipsis, substitution, and discourse-level cohesion',
  ],
};

export function getSubtypesForTopic(topic: string, level: CEFRLevel = 'B2'): string[] {
  const trimmed = (topic || '').trim();
  if (!trimmed) return LEVEL_FALLBACK_SUBTYPES[level] || LEVEL_FALLBACK_SUBTYPES.B2;

  // 1. Direct match
  if (TOPIC_SUBTYPES[trimmed]) {
    return TOPIC_SUBTYPES[trimmed];
  }

  // 2. Case-insensitive match
  const lower = trimmed.toLowerCase();
  for (const [key, list] of Object.entries(TOPIC_SUBTYPES)) {
    if (key.toLowerCase() === lower) {
      if (key === 'Passive Voice' && (level === 'A1' || level === 'A2')) {
        return [
          'Present Simple Passive (am/is/are + past participle)',
          'Past Simple Passive (was/were + past participle)',
          'Present Perfect Passive (has/have been + past participle)',
          'Modal Passive (can/must/should be + past participle)',
          'Future Simple Passive (will be + past participle)',
          'Going to Passive (is/are going to be + past participle)',
          'Ditransitive Passive (was given / was sent / was offered)',
        ];
      }
      return list;
    }
  }

  // 3. Keyword / alias matching for custom topics entered under "My own choice"
  if (lower.includes('passive')) {
    if (level === 'A1' || level === 'A2') {
      return [
        'Present Simple Passive (am/is/are + past participle)',
        'Past Simple Passive (was/were + past participle)',
        'Present Perfect Passive (has/have been + past participle)',
        'Modal Passive (can/must/should be + past participle)',
        'Future Simple Passive (will be + past participle)',
        'Going to Passive (is/are going to be + past participle)',
        'Ditransitive Passive (was given / was sent / was offered)',
      ];
    }
    return TOPIC_SUBTYPES['Passive Voice'];
  }
  if (lower.includes('relative')) return TOPIC_SUBTYPES['Relative Clauses'];
  if (lower.includes('gerund') || lower.includes('infinitive')) return TOPIC_SUBTYPES['Gerunds and Infinitives'];
  if (lower.includes('comparative') || lower.includes('superlative') || lower.includes('comparison')) {
    return TOPIC_SUBTYPES['Comparatives and Superlatives'];
  }
  if (lower.includes('agreement') || lower.includes('concord')) return TOPIC_SUBTYPES['Subject-Verb Agreement'];
  if (lower.includes('inversion') || lower.includes('inverted')) return TOPIC_SUBTYPES['Inversion'];
  if (lower.includes('causative') || lower.includes('have something done')) return TOPIC_SUBTYPES['Causatives'];
  if (lower.includes('wish') || lower.includes('unreal past') || lower.includes('if only') || lower.includes('regret')) {
    return TOPIC_SUBTYPES['Wish and Unreal Past'];
  }
  if (lower.includes('participle')) return TOPIC_SUBTYPES['Participle Clauses'];
  if (lower.includes('conditional')) return TOPIC_SUBTYPES['Conditionals'];
  if (lower.includes('modal')) return TOPIC_SUBTYPES['Modals'];
  if (lower.includes('preposition')) return TOPIC_SUBTYPES['Prepositions'];
  if (lower.includes('article') || lower.includes('determiner')) return TOPIC_SUBTYPES['Articles'];
  if (lower.includes('phrasal')) return TOPIC_SUBTYPES['Phrasal Verbs'];
  if (lower.includes('reported') || lower.includes('indirect speech')) return TOPIC_SUBTYPES['Reported Speech'];
  if (lower.includes('collocation') || lower.includes('idiom')) return TOPIC_SUBTYPES['Collocations'];
  if (lower.includes('tense')) return TOPIC_SUBTYPES['Tenses'];

  // 4. Universal fallback for any other custom topic: rotate through level-appropriate tense & structural contexts
  return (LEVEL_FALLBACK_SUBTYPES[level] || LEVEL_FALLBACK_SUBTYPES.B2).map(
    context => `${trimmed} — tested within a ${context}`
  );
}