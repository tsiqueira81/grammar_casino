// Words students read on their phones (package S3), in one place, in plain A2-level English.
// The interface is English only (decision D7): this is the one place to review and simplify
// wording, not a translation table. Every message is 12 words or fewer (a unit test checks),
// counting a {placeholder} as one word. Power-up names stay as they are.

export const EN = {
  // Lock-in checks
  'lock.baseWordUnchanged': 'Change the form of {word} before you lock in.',
  'lock.kwtRule': 'Use 2 to 6 words, with the key word {word}.',
  'lock.needBoth.multipleChoice': 'Choose an answer and type your bet.',
  'lock.needBoth.multipleChoiceSplit': 'Choose two answers, or tap one answer twice. Then type your bet.',
  'lock.needBoth.keyWordTransformation': 'Use 2 to 6 words with {word}. Then type your bet.',
  'lock.needBoth.wordFormation': 'Change the form of {word}. Then type your bet.',
  'lock.needBoth.openCloze': 'Type the missing word. Then type your bet.',
  'lock.needBoth.openClozeSplit': 'Type one or two words. Then type your bet.',
  'lock.needBoth.binary': 'Choose Valid or Flawed. Then type your bet.',
  'lock.needAnswer.multipleChoice': 'Choose an answer: A, B, C or D.',
  'lock.needAnswer.multipleChoiceSplit': 'Choose two answers, or tap one answer twice.',
  'lock.needAnswer.keyWordTransformation': 'Type 2 to 6 words, with the key word {word}.',
  'lock.needAnswer.wordFormation': 'Change {word} so it fits the gap.',
  'lock.needAnswer.openCloze': 'Type the missing word.',
  'lock.needAnswer.openClozeSplit': 'Type at least one word.',
  'lock.needAnswer.binary': 'Choose Valid or Flawed.',
  'lock.needBet': 'Type your bet ($1 or more), or tap a chip.',
  'lock.highRollerMin': 'High Roller: you must bet at least {amount} this hand.',

  // After the reveal
  'results.build': 'And the answer is…',
  'results.yourAnswer': 'Your answer: ',
  'results.alsoRight': 'Also right: {answers}',
  'results.mistake': 'The mistake: ',
  'results.why': 'Why: ',
  'results.gotIt': 'Got it',
  'results.stillConfused': 'Still confused',
  'results.didThisMakeSense': 'Did this make sense?',
  'results.nextHand': 'The next hand appears here when the teacher deals it.',
  'results.lead': 'You are in the lead.',
  'results.toPass': '{amount} more to pass {name}.',

  // Power-ups
  'powerUp.whatDoesItDo': 'What does it do?',
  'powerUp.dismiss': 'Dismiss',
} as const;

export type StringKey = keyof typeof EN;

/** A phone message, with {placeholders} filled in. */
export function t(key: StringKey, vars: Record<string, string | number> = {}): string {
  return EN[key].replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

/** Words in a message, counting a {placeholder} as one word. */
export function wordCount(message: string): number {
  return message.replace(/\{\w+\}/g, 'X').split(/\s+/).filter((w) => /[\p{L}\p{N}$X]/u.test(w)).length;
}
