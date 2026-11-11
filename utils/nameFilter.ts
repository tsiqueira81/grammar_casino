// Player names (package R6): short, printable, classroom-safe and unique at the table.
// English only (decision D7). A blocked name is replaced by a friendly casino name.

export const MAX_NAME_LENGTH = 20;

/** Friendly names for "Give me a name" and for replacing a blocked one. */
const NAME_FIRST = ['Lucky', 'Royal', 'Golden', 'Silver', 'Clever', 'Bold', 'Swift', 'Jolly', 'Wild', 'Brave', 'Sunny', 'Mighty', 'Cosmic', 'Velvet', 'Ruby', 'Jade'];
const NAME_SECOND = ['Fox', 'Flush', 'Ace', 'Joker', 'Dice', 'Chip', 'Owl', 'Tiger', 'Comet', 'Falcon', 'Panda', 'Otter', 'Dragon', 'Card', 'Wolf', 'Star'];

// Words blocked anywhere inside a name (after undoing look-alike letters).
const BLOCKED_ANYWHERE = [
  'fuck', 'shit', 'cunt', 'bitch', 'nigg', 'faggot', 'whore', 'slut', 'wank', 'twat',
  'penis', 'vagina', 'porn', 'nazi', 'hitler', 'retard', 'dildo', 'boob', 'pussy', 'bastard', 'asshole', 'jizz',
];
// Words blocked only as a whole word, because they hide inside ordinary names (Cassie, Essex, Grape).
const BLOCKED_WORDS = ['fuk', 'cum', 'ass', 'arse', 'cock', 'sex', 'sexy', 'rape', 'kill', 'die', 'fag', 'tits', 'piss', 'crap', 'damn', 'hell', 'poop', 'stupid', 'idiot', 'loser', 'ugly', 'fat'];

const LOOK_ALIKES: Record<string, string> = { '0': 'o', '1': 'i', '!': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '8': 'b', '9': 'g', '|': 'i' };

/** Trim, drop control and invisible characters and flag emoji, collapse spaces, cap the length. */
export function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const cleaned = raw
    .normalize('NFC')
    // Control and format characters (zero-width, direction marks), flag letters and tag characters.
    .replace(/[\p{Cc}\p{Cf}\u{1F1E6}-\u{1F1FF}\u{E0000}-\u{E007F}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(cleaned).slice(0, MAX_NAME_LENGTH).join('').trim();
}

function plainLetters(word: string): string {
  return word
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split('')
    .map((c) => LOOK_ALIKES[c] ?? c)
    .join('');
}

/** Is this name rude or unkind? */
export function isBlockedName(name: string): boolean {
  const lettersOnly = plainLetters(name).replace(/[^a-z]/g, '');
  // Squash repeated letters too ("fuuuck"), checking both forms.
  const squashed = lettersOnly.replace(/(.)\1+/g, '$1');
  if (BLOCKED_ANYWHERE.some((w) => lettersOnly.includes(w) || squashed.includes(w))) return true;
  const words = plainLetters(name).split(/[^a-z]+/).filter(Boolean);
  return words.some((w) => BLOCKED_WORDS.includes(w) || BLOCKED_WORDS.includes(w.replace(/(.)\1+/g, '$1')));
}

/** A friendly name nobody at the table has yet. */
export function generateFriendlyName(taken: Iterable<string> = [], random: () => number = Math.random): string {
  const used = new Set(Array.from(taken, (n) => n.toLowerCase()));
  for (let tries = 0; tries < 40; tries++) {
    const name = `${NAME_FIRST[Math.floor(random() * NAME_FIRST.length)]} ${NAME_SECOND[Math.floor(random() * NAME_SECOND.length)]}`;
    if (!used.has(name.toLowerCase())) return name;
  }
  return makeUnique('Lucky Fox', used);
}

/** "Ana" when free, otherwise "Ana 2", "Ana 3"... (still within the length cap). */
export function makeUnique(name: string, taken: Iterable<string>): string {
  const used = new Set(Array.from(taken, (n) => n.toLowerCase()));
  if (!used.has(name.toLowerCase())) return name;
  for (let n = 2; n < 1000; n++) {
    const suffix = ` ${n}`;
    const base = Array.from(name).slice(0, MAX_NAME_LENGTH - suffix.length).join('').trim();
    const candidate = base + suffix;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return name;
}

/**
 * The name a player gets at the table: cleaned, replaced by a friendly one when blocked or empty,
 * and made unique among `taken` (the other players' names).
 */
export function safePlayerName(raw: unknown, taken: Iterable<string> = [], random?: () => number): string {
  const takenList = Array.from(taken);
  const cleaned = cleanName(raw);
  const base = !cleaned || isBlockedName(cleaned) ? generateFriendlyName(takenList, random) : cleaned;
  return makeUnique(base, takenList);
}
