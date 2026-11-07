export type CharacterCategoryId = 'vip' | 'mythic' | 'cyber' | 'critters' | 'quirky';

export type AuraId =
  | 'gold'
  | 'emerald'
  | 'neon'
  | 'amethyst'
  | 'crimson'
  | 'frost'
  | 'sunset'
  | 'obsidian';

export type FlairId =
  | 'none'
  | 'crown'
  | 'shades'
  | 'tophat'
  | 'halo'
  | 'wizard'
  | 'headset'
  | 'horns';

export interface AuraDefinition {
  id: AuraId;
  name: string;
  bgGradient: string;
  ringColor: string;
  accentHex: string;
  glowHex: string;
}

export interface FlairDefinition {
  id: FlairId;
  name: string;
  icon: string;
}

export type EarStyle =
  | 'fox'
  | 'cat'
  | 'round'
  | 'floppy'
  | 'bunny'
  | 'horns'
  | 'antenna'
  | 'fins'
  | 'feathers'
  | 'none';

export type EyeStyle =
  | 'confident'
  | 'happy'
  | 'cool'
  | 'visor'
  | 'robo'
  | 'wise'
  | 'fierce'
  | 'sparkle';

export type MouthStyle =
  | 'smirk'
  | 'grin'
  | 'snout'
  | 'beak'
  | 'fangs'
  | 'robo_grille'
  | 'whiskers'
  | 'mustache';

export type CollarStyle =
  | 'tuxedo'
  | 'cape'
  | 'cyber_armor'
  | 'hoodie'
  | 'scarf'
  | 'royal_robe'
  | 'none';

export type FacePattern =
  | 'mask'
  | 'stripes'
  | 'blush'
  | 'circuit'
  | 'scales'
  | 'patch'
  | 'freckles'
  | 'none';

export interface CharacterAvatarDefinition {
  id: string;
  name: string;
  title: string;
  category: CharacterCategoryId;
  fallbackEmoji: string;
  defaultAura: AuraId;
  defaultFlair: FlairId;
  primaryColor: string;
  secondaryColor: string;
  detailColor: string;
  earStyle: EarStyle;
  eyeStyle: EyeStyle;
  mouthStyle: MouthStyle;
  collarStyle: CollarStyle;
  facePattern: FacePattern;
}

export const CHARACTER_CATEGORIES: {
  id: CharacterCategoryId | 'all' | 'emoji';
  label: string;
  icon: string;
}[] = [
  { id: 'all', label: 'All Heroes', icon: '✨' },
  { id: 'vip', label: 'Casino VIPs', icon: '🎰' },
  { id: 'mythic', label: 'Myth & Magic', icon: '🐉' },
  { id: 'cyber', label: 'Cyber & Sci-Fi', icon: '🤖' },
  { id: 'critters', label: 'Clever Critters', icon: '🐾' },
  { id: 'quirky', label: 'Snack Squad', icon: '🍿' },
  { id: 'emoji', label: 'Classic Emojis', icon: '😀' },
];

export const AVATAR_AURAS: AuraDefinition[] = [
  {
    id: 'gold',
    name: 'Royal Gold',
    bgGradient: 'linear-gradient(135deg, #451a03 0%, #b45309 55%, #fbbf24 100%)',
    ringColor: '#fbbf24',
    accentHex: '#f59e0b',
    glowHex: 'rgba(251, 191, 36, 0.45)',
  },
  {
    id: 'emerald',
    name: 'Casino Felt',
    bgGradient: 'linear-gradient(135deg, #022c22 0%, #047857 55%, #34d399 100%)',
    ringColor: '#34d399',
    accentHex: '#10b981',
    glowHex: 'rgba(52, 211, 153, 0.45)',
  },
  {
    id: 'neon',
    name: 'Cyber Cyan',
    bgGradient: 'linear-gradient(135deg, #083344 0%, #0284c7 55%, #38bdf8 100%)',
    ringColor: '#38bdf8',
    accentHex: '#06b6d4',
    glowHex: 'rgba(56, 189, 248, 0.45)',
  },
  {
    id: 'amethyst',
    name: 'Mythic Violet',
    bgGradient: 'linear-gradient(135deg, #2e1065 0%, #7c3aed 55%, #c084fc 100%)',
    ringColor: '#c084fc',
    accentHex: '#8b5cf6',
    glowHex: 'rgba(192, 132, 252, 0.45)',
  },
  {
    id: 'crimson',
    name: 'Velvet Ruby',
    bgGradient: 'linear-gradient(135deg, #450a0a 0%, #be123c 55%, #fb7185 100%)',
    ringColor: '#fb7185',
    accentHex: '#f43f5e',
    glowHex: 'rgba(251, 113, 133, 0.45)',
  },
  {
    id: 'frost',
    name: 'Arctic Ice',
    bgGradient: 'linear-gradient(135deg, #0f172a 0%, #1d4ed8 50%, #93c5fd 100%)',
    ringColor: '#93c5fd',
    accentHex: '#60a5fa',
    glowHex: 'rgba(147, 197, 253, 0.45)',
  },
  {
    id: 'sunset',
    name: 'Solar Blaze',
    bgGradient: 'linear-gradient(135deg, #431407 0%, #ea580c 55%, #fde047 100%)',
    ringColor: '#fb923c',
    accentHex: '#f97316',
    glowHex: 'rgba(251, 146, 60, 0.45)',
  },
  {
    id: 'obsidian',
    name: 'Midnight Onyx',
    bgGradient: 'linear-gradient(135deg, #09090b 0%, #27272a 60%, #71717a 100%)',
    ringColor: '#a1a1aa',
    accentHex: '#52525b',
    glowHex: 'rgba(161, 161, 170, 0.4)',
  },
];

export const AVATAR_FLAIRS: FlairDefinition[] = [
  { id: 'none', name: 'No Flair', icon: '⊘' },
  { id: 'crown', name: 'VIP Crown', icon: '👑' },
  { id: 'shades', name: 'Deal Shades', icon: '🕶️' },
  { id: 'tophat', name: 'Croupier Hat', icon: '🎩' },
  { id: 'halo', name: 'Lucky Halo', icon: '✨' },
  { id: 'wizard', name: 'Arcane Hat', icon: '🧙' },
  { id: 'headset', name: 'Pro Headset', icon: '🎧' },
  { id: 'horns', name: 'Rebel Horns', icon: '😈' },
];

export const CHARACTER_AVATARS: CharacterAvatarDefinition[] = [
  // ==========================================================================
  // 1. CASINO VIPs (8 Characters)
  // ==========================================================================
  {
    id: 'baron_fox',
    name: 'Baron Fox',
    title: 'High-Roller Strategist',
    category: 'vip',
    fallbackEmoji: '🦊',
    defaultAura: 'gold',
    defaultFlair: 'tophat',
    primaryColor: '#ea580c',
    secondaryColor: '#ffedd5',
    detailColor: '#fbbf24',
    earStyle: 'fox',
    eyeStyle: 'confident',
    mouthStyle: 'snout',
    collarStyle: 'tuxedo',
    facePattern: 'blush',
  },
  {
    id: 'lady_velvet',
    name: 'Lady Velvet',
    title: 'Monte Carlo Contessa',
    category: 'vip',
    fallbackEmoji: '🐱',
    defaultAura: 'crimson',
    defaultFlair: 'crown',
    primaryColor: '#f8fafc',
    secondaryColor: '#fbcfe8',
    detailColor: '#f43f5e',
    earStyle: 'cat',
    eyeStyle: 'sparkle',
    mouthStyle: 'whiskers',
    collarStyle: 'royal_robe',
    facePattern: 'blush',
  },
  {
    id: 'duke_bulldog',
    name: 'Duke Winston',
    title: 'Vault Tycoon',
    category: 'vip',
    fallbackEmoji: '🐶',
    defaultAura: 'emerald',
    defaultFlair: 'tophat',
    primaryColor: '#b45309',
    secondaryColor: '#fde68a',
    detailColor: '#10b981',
    earStyle: 'floppy',
    eyeStyle: 'wise',
    mouthStyle: 'mustache',
    collarStyle: 'tuxedo',
    facePattern: 'patch',
  },
  {
    id: 'ace_raccoon',
    name: 'Ace Bandit',
    title: 'Card-Counting Prodigy',
    category: 'vip',
    fallbackEmoji: '🦝',
    defaultAura: 'obsidian',
    defaultFlair: 'shades',
    primaryColor: '#64748b',
    secondaryColor: '#e2e8f0',
    detailColor: '#38bdf8',
    earStyle: 'round',
    eyeStyle: 'cool',
    mouthStyle: 'smirk',
    collarStyle: 'tuxedo',
    facePattern: 'mask',
  },
  {
    id: 'vegas_bunny',
    name: 'Ruby Jackpot',
    title: 'Lucky Wheel Hostess',
    category: 'vip',
    fallbackEmoji: '🐰',
    defaultAura: 'sunset',
    defaultFlair: 'halo',
    primaryColor: '#f472b6',
    secondaryColor: '#fce7f3',
    detailColor: '#fbbf24',
    earStyle: 'bunny',
    eyeStyle: 'happy',
    mouthStyle: 'whiskers',
    collarStyle: 'royal_robe',
    facePattern: 'freckles',
  },
  {
    id: 'croupier_owl',
    name: 'Lord Sterling',
    title: 'Grand Salon Arbiter',
    category: 'vip',
    fallbackEmoji: '🦉',
    defaultAura: 'emerald',
    defaultFlair: 'none',
    primaryColor: '#78350f',
    secondaryColor: '#fef3c7',
    detailColor: '#34d399',
    earStyle: 'feathers',
    eyeStyle: 'wise',
    mouthStyle: 'beak',
    collarStyle: 'tuxedo',
    facePattern: 'none',
  },
  {
    id: 'golden_lion',
    name: 'King Midas',
    title: 'Sovereign of Stakes',
    category: 'vip',
    fallbackEmoji: '🦁',
    defaultAura: 'gold',
    defaultFlair: 'crown',
    primaryColor: '#f59e0b',
    secondaryColor: '#fef08a',
    detailColor: '#b45309',
    earStyle: 'round',
    eyeStyle: 'fierce',
    mouthStyle: 'snout',
    collarStyle: 'royal_robe',
    facePattern: 'stripes',
  },
  {
    id: 'diamond_peacock',
    name: 'Duchess Opal',
    title: 'High-Table Patron',
    category: 'vip',
    fallbackEmoji: '🦚',
    defaultAura: 'neon',
    defaultFlair: 'crown',
    primaryColor: '#0284c7',
    secondaryColor: '#bae6fd',
    detailColor: '#2dd4bf',
    earStyle: 'feathers',
    eyeStyle: 'sparkle',
    mouthStyle: 'beak',
    collarStyle: 'royal_robe',
    facePattern: 'scales',
  },

  // ==========================================================================
  // 2. MYTH & MAGIC (8 Characters)
  // ==========================================================================
  {
    id: 'ember_dragon',
    name: 'Ignis Drake',
    title: 'Hoarder of Gold Chips',
    category: 'mythic',
    fallbackEmoji: '🐉',
    defaultAura: 'crimson',
    defaultFlair: 'horns',
    primaryColor: '#dc2626',
    secondaryColor: '#fca5a5',
    detailColor: '#fbbf24',
    earStyle: 'horns',
    eyeStyle: 'fierce',
    mouthStyle: 'fangs',
    collarStyle: 'cape',
    facePattern: 'scales',
  },
  {
    id: 'kitsune_spirit',
    name: 'Kitsune Nine',
    title: 'Oracle of Syntax',
    category: 'mythic',
    fallbackEmoji: '🦊',
    defaultAura: 'amethyst',
    defaultFlair: 'halo',
    primaryColor: '#f8fafc',
    secondaryColor: '#e9d5ff',
    detailColor: '#c084fc',
    earStyle: 'fox',
    eyeStyle: 'confident',
    mouthStyle: 'smirk',
    collarStyle: 'cape',
    facePattern: 'stripes',
  },
  {
    id: 'frost_yeti',
    name: 'Boreas Yeti',
    title: 'Sub-Zero Enforcer',
    category: 'mythic',
    fallbackEmoji: '🥶',
    defaultAura: 'frost',
    defaultFlair: 'horns',
    primaryColor: '#60a5fa',
    secondaryColor: '#eff6ff',
    detailColor: '#38bdf8',
    earStyle: 'horns',
    eyeStyle: 'fierce',
    mouthStyle: 'fangs',
    collarStyle: 'scarf',
    facePattern: 'freckles',
  },
  {
    id: 'phoenix_chick',
    name: 'Solari Phoenix',
    title: 'Second-Chance Flame',
    category: 'mythic',
    fallbackEmoji: '🐦‍🔥',
    defaultAura: 'sunset',
    defaultFlair: 'crown',
    primaryColor: '#f97316',
    secondaryColor: '#fef08a',
    detailColor: '#ef4444',
    earStyle: 'feathers',
    eyeStyle: 'sparkle',
    mouthStyle: 'beak',
    collarStyle: 'royal_robe',
    facePattern: 'scales',
  },
  {
    id: 'arcane_unicorn',
    name: 'Celestia',
    title: 'Starlight Alchemist',
    category: 'mythic',
    fallbackEmoji: '🦄',
    defaultAura: 'amethyst',
    defaultFlair: 'wizard',
    primaryColor: '#e879f9',
    secondaryColor: '#fdf4ff',
    detailColor: '#38bdf8',
    earStyle: 'fox',
    eyeStyle: 'sparkle',
    mouthStyle: 'grin',
    collarStyle: 'cape',
    facePattern: 'blush',
  },
  {
    id: 'kraken_kid',
    name: 'Captain Cthulhu',
    title: 'Abyssal High-Roller',
    category: 'mythic',
    fallbackEmoji: '🐙',
    defaultAura: 'emerald',
    defaultFlair: 'tophat',
    primaryColor: '#0d9488',
    secondaryColor: '#99f6e4',
    detailColor: '#2dd4bf',
    earStyle: 'fins',
    eyeStyle: 'wise',
    mouthStyle: 'mustache',
    collarStyle: 'cape',
    facePattern: 'scales',
  },
  {
    id: 'griffin_knight',
    name: 'Sir Valor',
    title: 'Aegis Shield Bearer',
    category: 'mythic',
    fallbackEmoji: '🦅',
    defaultAura: 'gold',
    defaultFlair: 'halo',
    primaryColor: '#d97706',
    secondaryColor: '#fef3c7',
    detailColor: '#f59e0b',
    earStyle: 'feathers',
    eyeStyle: 'confident',
    mouthStyle: 'beak',
    collarStyle: 'royal_robe',
    facePattern: 'stripes',
  },
  {
    id: 'shadow_wolf',
    name: 'Fenrir Eclipse',
    title: 'Lone Wolf Tactician',
    category: 'mythic',
    fallbackEmoji: '🐺',
    defaultAura: 'obsidian',
    defaultFlair: 'none',
    primaryColor: '#334155',
    secondaryColor: '#cbd5e1',
    detailColor: '#a855f7',
    earStyle: 'fox',
    eyeStyle: 'fierce',
    mouthStyle: 'fangs',
    collarStyle: 'cape',
    facePattern: 'mask',
  },

  // ==========================================================================
  // 3. CYBER & SCI-FI (8 Characters)
  // ==========================================================================
  {
    id: 'astro_shiba',
    name: 'Nova Shiba',
    title: 'Orbital Doge Commander',
    category: 'cyber',
    fallbackEmoji: '🐕',
    defaultAura: 'neon',
    defaultFlair: 'headset',
    primaryColor: '#f59e0b',
    secondaryColor: '#fef3c7',
    detailColor: '#38bdf8',
    earStyle: 'fox',
    eyeStyle: 'happy',
    mouthStyle: 'snout',
    collarStyle: 'cyber_armor',
    facePattern: 'blush',
  },
  {
    id: 'neon_bot',
    name: 'Unit 777',
    title: 'Quantum Probability Droid',
    category: 'cyber',
    fallbackEmoji: '🤖',
    defaultAura: 'neon',
    defaultFlair: 'none',
    primaryColor: '#0ea5e9',
    secondaryColor: '#e0f2fe',
    detailColor: '#22d3ee',
    earStyle: 'antenna',
    eyeStyle: 'robo',
    mouthStyle: 'robo_grille',
    collarStyle: 'cyber_armor',
    facePattern: 'circuit',
  },
  {
    id: 'glitch_cat',
    name: 'Pixel Neko',
    title: 'Synthwave Hacker',
    category: 'cyber',
    fallbackEmoji: '👾',
    defaultAura: 'amethyst',
    defaultFlair: 'headset',
    primaryColor: '#a855f7',
    secondaryColor: '#f3e8ff',
    detailColor: '#ec4899',
    earStyle: 'cat',
    eyeStyle: 'visor',
    mouthStyle: 'whiskers',
    collarStyle: 'cyber_armor',
    facePattern: 'circuit',
  },
  {
    id: 'cyber_axolotl',
    name: 'Axo-9000',
    title: 'Neon Lagoon Navigator',
    category: 'cyber',
    fallbackEmoji: '🦎',
    defaultAura: 'crimson',
    defaultFlair: 'halo',
    primaryColor: '#fb7185',
    secondaryColor: '#ffe4e6',
    detailColor: '#38bdf8',
    earStyle: 'fins',
    eyeStyle: 'sparkle',
    mouthStyle: 'grin',
    collarStyle: 'cyber_armor',
    facePattern: 'blush',
  },
  {
    id: 'mecha_frog',
    name: 'Chrono Ribbit',
    title: 'Time-Warp Hopper',
    category: 'cyber',
    fallbackEmoji: '🐸',
    defaultAura: 'emerald',
    defaultFlair: 'shades',
    primaryColor: '#22c55e',
    secondaryColor: '#dcfce7',
    detailColor: '#facc15',
    earStyle: 'antenna',
    eyeStyle: 'visor',
    mouthStyle: 'grin',
    collarStyle: 'cyber_armor',
    facePattern: 'circuit',
  },
  {
    id: 'synth_shark',
    name: 'Mako Laser',
    title: 'Deep-Space Card Shark',
    category: 'cyber',
    fallbackEmoji: '🦈',
    defaultAura: 'frost',
    defaultFlair: 'shades',
    primaryColor: '#3b82f6',
    secondaryColor: '#dbeafe',
    detailColor: '#f43f5e',
    earStyle: 'fins',
    eyeStyle: 'fierce',
    mouthStyle: 'fangs',
    collarStyle: 'cyber_armor',
    facePattern: 'stripes',
  },
  {
    id: 'star_koala',
    name: 'Cosmo Koala',
    title: 'Zero-Gravity Scholar',
    category: 'cyber',
    fallbackEmoji: '🐨',
    defaultAura: 'amethyst',
    defaultFlair: 'headset',
    primaryColor: '#94a3b8',
    secondaryColor: '#f1f5f9',
    detailColor: '#38bdf8',
    earStyle: 'round',
    eyeStyle: 'cool',
    mouthStyle: 'snout',
    collarStyle: 'cyber_armor',
    facePattern: 'blush',
  },
  {
    id: 'plasma_hawk',
    name: 'Volt Falcon',
    title: 'Supersonic Interceptor',
    category: 'cyber',
    fallbackEmoji: '🦅',
    defaultAura: 'sunset',
    defaultFlair: 'none',
    primaryColor: '#eab308',
    secondaryColor: '#fef9c3',
    detailColor: '#38bdf8',
    earStyle: 'feathers',
    eyeStyle: 'visor',
    mouthStyle: 'beak',
    collarStyle: 'cyber_armor',
    facePattern: 'circuit',
  },

  // ==========================================================================
  // 4. CLEVER CRITTERS (8 Characters)
  // ==========================================================================
  {
    id: 'prof_capybara',
    name: 'Prof. Capy',
    title: 'Unbothered Grammar Zen',
    category: 'critters',
    fallbackEmoji: '🦫',
    defaultAura: 'emerald',
    defaultFlair: 'tophat',
    primaryColor: '#92400e',
    secondaryColor: '#fde68a',
    detailColor: '#34d399',
    earStyle: 'round',
    eyeStyle: 'cool',
    mouthStyle: 'snout',
    collarStyle: 'scarf',
    facePattern: 'blush',
  },
  {
    id: 'detective_badger',
    name: 'Inspector Claw',
    title: 'Error-Spotting Sleuth',
    category: 'critters',
    fallbackEmoji: '🦡',
    defaultAura: 'gold',
    defaultFlair: 'tophat',
    primaryColor: '#475569',
    secondaryColor: '#f8fafc',
    detailColor: '#f59e0b',
    earStyle: 'round',
    eyeStyle: 'wise',
    mouthStyle: 'mustache',
    collarStyle: 'scarf',
    facePattern: 'stripes',
  },
  {
    id: 'samurai_tiger',
    name: 'Tora Shogun',
    title: 'Clause Katana Master',
    category: 'critters',
    fallbackEmoji: '🐯',
    defaultAura: 'sunset',
    defaultFlair: 'crown',
    primaryColor: '#f97316',
    secondaryColor: '#ffedd5',
    detailColor: '#1e293b',
    earStyle: 'round',
    eyeStyle: 'fierce',
    mouthStyle: 'whiskers',
    collarStyle: 'royal_robe',
    facePattern: 'stripes',
  },
  {
    id: 'ninja_chameleon',
    name: 'Karma Gecko',
    title: 'Camouflage Tactician',
    category: 'critters',
    fallbackEmoji: '🦎',
    defaultAura: 'emerald',
    defaultFlair: 'shades',
    primaryColor: '#10b981',
    secondaryColor: '#a7f3d0',
    detailColor: '#fbbf24',
    earStyle: 'fins',
    eyeStyle: 'confident',
    mouthStyle: 'smirk',
    collarStyle: 'hoodie',
    facePattern: 'scales',
  },
  {
    id: 'pilot_penguin',
    name: 'Captain Waddles',
    title: 'Polar Express Ace',
    category: 'critters',
    fallbackEmoji: '🐧',
    defaultAura: 'frost',
    defaultFlair: 'headset',
    primaryColor: '#1e293b',
    secondaryColor: '#f8fafc',
    detailColor: '#f59e0b',
    earStyle: 'none',
    eyeStyle: 'happy',
    mouthStyle: 'beak',
    collarStyle: 'scarf',
    facePattern: 'blush',
  },
  {
    id: 'lucky_panda',
    name: 'Bamboozle',
    title: 'Double-or-Nothing Champion',
    category: 'critters',
    fallbackEmoji: '🐼',
    defaultAura: 'emerald',
    defaultFlair: 'halo',
    primaryColor: '#f8fafc',
    secondaryColor: '#1e293b',
    detailColor: '#10b981',
    earStyle: 'round',
    eyeStyle: 'happy',
    mouthStyle: 'snout',
    collarStyle: 'hoodie',
    facePattern: 'patch',
  },
  {
    id: 'dj_lemur',
    name: 'King Tempo',
    title: 'Rhythm & Rhyme Spinner',
    category: 'critters',
    fallbackEmoji: '🐒',
    defaultAura: 'amethyst',
    defaultFlair: 'headset',
    primaryColor: '#64748b',
    secondaryColor: '#f1f5f9',
    detailColor: '#facc15',
    earStyle: 'round',
    eyeStyle: 'sparkle',
    mouthStyle: 'grin',
    collarStyle: 'hoodie',
    facePattern: 'mask',
  },
  {
    id: 'pirate_otter',
    name: 'Barnaby Shells',
    title: 'Treasure Chest Raider',
    category: 'critters',
    fallbackEmoji: '🦦',
    defaultAura: 'neon',
    defaultFlair: 'shades',
    primaryColor: '#b45309',
    secondaryColor: '#fef3c7',
    detailColor: '#38bdf8',
    earStyle: 'round',
    eyeStyle: 'confident',
    mouthStyle: 'whiskers',
    collarStyle: 'scarf',
    facePattern: 'freckles',
  },

  // ==========================================================================
  // 5. SNACK SQUAD & QUIRKY (8 Characters)
  // ==========================================================================
  {
    id: 'boba_wizard',
    name: 'Boba Merlin',
    title: 'Tapioca Spellcaster',
    category: 'quirky',
    fallbackEmoji: '🧋',
    defaultAura: 'amethyst',
    defaultFlair: 'wizard',
    primaryColor: '#d97706',
    secondaryColor: '#fef3c7',
    detailColor: '#7c3aed',
    earStyle: 'round',
    eyeStyle: 'sparkle',
    mouthStyle: 'grin',
    collarStyle: 'cape',
    facePattern: 'freckles',
  },
  {
    id: 'sir_taco',
    name: 'Señor Crunch',
    title: 'Spicy Salsa Duelist',
    category: 'quirky',
    fallbackEmoji: '🌮',
    defaultAura: 'sunset',
    defaultFlair: 'crown',
    primaryColor: '#f59e0b',
    secondaryColor: '#fef08a',
    detailColor: '#ef4444',
    earStyle: 'feathers',
    eyeStyle: 'happy',
    mouthStyle: 'mustache',
    collarStyle: 'royal_robe',
    facePattern: 'blush',
  },
  {
    id: 'espresso_ghost',
    name: 'Phantom Latte',
    title: 'Midnight Crammer Spirit',
    category: 'quirky',
    fallbackEmoji: '👻',
    defaultAura: 'obsidian',
    defaultFlair: 'halo',
    primaryColor: '#e2e8f0',
    secondaryColor: '#f8fafc',
    detailColor: '#38bdf8',
    earStyle: 'none',
    eyeStyle: 'sparkle',
    mouthStyle: 'grin',
    collarStyle: 'scarf',
    facePattern: 'blush',
  },
  {
    id: 'king_pineapple',
    name: 'King Aloha',
    title: 'Tropical Jackpot Sovereign',
    category: 'quirky',
    fallbackEmoji: '🍍',
    defaultAura: 'gold',
    defaultFlair: 'shades',
    primaryColor: '#eab308',
    secondaryColor: '#fef9c3',
    detailColor: '#16a34a',
    earStyle: 'feathers',
    eyeStyle: 'cool',
    mouthStyle: 'grin',
    collarStyle: 'royal_robe',
    facePattern: 'scales',
  },
  {
    id: 'ramen_ronin',
    name: 'Master Miso',
    title: 'Umami Noodle Sage',
    category: 'quirky',
    fallbackEmoji: '🍜',
    defaultAura: 'crimson',
    defaultFlair: 'none',
    primaryColor: '#ef4444',
    secondaryColor: '#fef2f2',
    detailColor: '#fbbf24',
    earStyle: 'round',
    eyeStyle: 'wise',
    mouthStyle: 'mustache',
    collarStyle: 'royal_robe',
    facePattern: 'stripes',
  },
  {
    id: 'pizza_knight',
    name: 'Pepperoni Paladin',
    title: 'Defender of Deep Dish',
    category: 'quirky',
    fallbackEmoji: '🍕',
    defaultAura: 'sunset',
    defaultFlair: 'crown',
    primaryColor: '#ea580c',
    secondaryColor: '#fde047',
    detailColor: '#dc2626',
    earStyle: 'horns',
    eyeStyle: 'confident',
    mouthStyle: 'smirk',
    collarStyle: 'cape',
    facePattern: 'freckles',
  },
  {
    id: 'donut_ufo',
    name: 'Sprinkle Nebula',
    title: 'Glazed Galaxy Traveler',
    category: 'quirky',
    fallbackEmoji: '🍩',
    defaultAura: 'neon',
    defaultFlair: 'halo',
    primaryColor: '#ec4899',
    secondaryColor: '#fce7f3',
    detailColor: '#38bdf8',
    earStyle: 'antenna',
    eyeStyle: 'robo',
    mouthStyle: 'grin',
    collarStyle: 'cyber_armor',
    facePattern: 'freckles',
  },
  {
    id: 'sushi_samurai',
    name: 'Wasabi Sensei',
    title: 'Precision Grammar Chef',
    category: 'quirky',
    fallbackEmoji: '🍣',
    defaultAura: 'emerald',
    defaultFlair: 'none',
    primaryColor: '#fb7185',
    secondaryColor: '#fff1f2',
    detailColor: '#10b981',
    earStyle: 'none',
    eyeStyle: 'confident',
    mouthStyle: 'smirk',
    collarStyle: 'tuxedo',
    facePattern: 'stripes',
  },
];

const CHARACTER_MAP = new Map<string, CharacterAvatarDefinition>(
  CHARACTER_AVATARS.map((c) => [c.id, c])
);

const AURA_MAP = new Map<AuraId, AuraDefinition>(AVATAR_AURAS.map((a) => [a.id, a]));
const FLAIR_MAP = new Map<FlairId, FlairDefinition>(AVATAR_FLAIRS.map((f) => [f.id, f]));

export interface ParsedAvatar {
  kind: 'character' | 'emoji';
  character?: CharacterAvatarDefinition;
  emoji: string;
  aura: AuraDefinition;
  flair: FlairDefinition;
  raw: string;
}

export function getAuraById(id?: string | null): AuraDefinition {
  if (id && AURA_MAP.has(id as AuraId)) {
    return AURA_MAP.get(id as AuraId)!;
  }
  return AVATAR_AURAS[0];
}

export function getFlairById(id?: string | null): FlairDefinition {
  if (id && FLAIR_MAP.has(id as FlairId)) {
    return FLAIR_MAP.get(id as FlairId)!;
  }
  return AVATAR_FLAIRS[0];
}

export function getCharacterById(id?: string | null): CharacterAvatarDefinition | undefined {
  if (!id) return undefined;
  return CHARACTER_MAP.get(id);
}

/**
 * Parses any avatar string:
 * - `"char:baron_fox|gold|tophat"` -> character + custom aura + custom flair
 * - `"char:baron_fox"` -> character + its default aura & flair
 * - `"emoji:🦊|emerald|crown"` -> classic emoji + custom aura + custom flair
 * - `"🦊"` -> legacy emoji with clean default emerald aura & no flair
 */
export function parseAvatarString(raw: string | undefined | null): ParsedAvatar {
  const clean = (raw || '').trim();
  if (!clean) {
    const defChar = CHARACTER_AVATARS[0];
    return {
      kind: 'character',
      character: defChar,
      emoji: defChar.fallbackEmoji,
      aura: getAuraById(defChar.defaultAura),
      flair: getFlairById(defChar.defaultFlair),
      raw: serializeCharacterAvatar(defChar.id, defChar.defaultAura, defChar.defaultFlair),
    };
  }

  if (clean.startsWith('char:')) {
    const body = clean.slice(5);
    const [charId, auraId, flairId] = body.split('|');
    const character = getCharacterById(charId) || CHARACTER_AVATARS[0];
    const aura = auraId ? getAuraById(auraId) : getAuraById(character.defaultAura);
    const flair = flairId ? getFlairById(flairId) : getFlairById(character.defaultFlair);
    return {
      kind: 'character',
      character,
      emoji: character.fallbackEmoji,
      aura,
      flair,
      raw: clean,
    };
  }

  if (clean.startsWith('emoji:')) {
    const body = clean.slice(6);
    const [emojiChar, auraId, flairId] = body.split('|');
    const safeEmoji = emojiChar || '🦊';
    return {
      kind: 'emoji',
      emoji: safeEmoji,
      aura: getAuraById(auraId || 'emerald'),
      flair: getFlairById(flairId || 'none'),
      raw: clean,
    };
  }

  // Legacy plain emoji string
  return {
    kind: 'emoji',
    emoji: clean,
    aura: getAuraById('emerald'),
    flair: getFlairById('none'),
    raw: clean,
  };
}

export function serializeCharacterAvatar(
  characterId: string,
  auraId?: AuraId,
  flairId?: FlairId
): string {
  const ch = getCharacterById(characterId) || CHARACTER_AVATARS[0];
  const a = auraId || ch.defaultAura;
  const f = flairId || ch.defaultFlair;
  return `char:${ch.id}|${a}|${f}`;
}

export function serializeEmojiAvatar(
  emoji: string,
  auraId: AuraId = 'emerald',
  flairId: FlairId = 'none'
): string {
  const cleanEmoji = emoji.trim() || '🦊';
  if (auraId === 'emerald' && flairId === 'none') {
    return cleanEmoji;
  }
  return `emoji:${cleanEmoji}|${auraId}|${flairId}`;
}

/**
 * Picks a random Wayground-style character, avoiding characters already seated at the table first.
 */
export function getRandomCharacterAvatar(
  excludeAvatars: string[] = [],
  randomizeCustomization: boolean = false
): string {
  const usedCharIds = new Set(
    excludeAvatars
      .map((av) => parseAvatarString(av))
      .filter((p) => p.kind === 'character' && p.character)
      .map((p) => p.character!.id)
  );

  const unusedPool = CHARACTER_AVATARS.filter((c) => !usedCharIds.has(c.id));
  const pool = unusedPool.length > 0 ? unusedPool : CHARACTER_AVATARS;
  const picked = pool[Math.floor(Math.random() * pool.length)];

  if (!randomizeCustomization) {
    return serializeCharacterAvatar(picked.id, picked.defaultAura, picked.defaultFlair);
  }

  const randomAura = AVATAR_AURAS[Math.floor(Math.random() * AVATAR_AURAS.length)].id;
  const randomFlair = AVATAR_FLAIRS[Math.floor(Math.random() * AVATAR_FLAIRS.length)].id;
  return serializeCharacterAvatar(picked.id, randomAura, randomFlair);
}

/**
 * Returns a clean emoji representation for plain-text exports (.txt report card) or logs.
 */
export function getAvatarPlainText(raw: string | undefined | null): string {
  const parsed = parseAvatarString(raw);
  return parsed.emoji;
}

/**
 * Returns a human-readable label for accessibility and tooltips (e.g., "Baron Fox (Royal Gold, Top Hat)").
 */
export function getAvatarDisplayName(raw: string | undefined | null): string {
  const parsed = parseAvatarString(raw);
  if (parsed.kind === 'character' && parsed.character) {
    return parsed.character.name;
  }
  return `Avatar ${parsed.emoji}`;
}
