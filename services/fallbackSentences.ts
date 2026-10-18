import { GeneratedSentence, CEFRLevel, Settings, QuestionType } from '../types';

interface CuratedEntry extends GeneratedSentence {
  topic: string;
  level: CEFRLevel;
  subtype?: string;
}

export const CURATED_SENTENCE_BANK: CuratedEntry[] = [
  // --- TENSES ---
  {
    topic: 'Tenses',
    level: 'A1',
    subtype: 'Present Simple',
    text: 'She works at the downtown library every morning.',
    isCorrect: true,
    correction: 'She works at the downtown library every morning.',
    explanation: 'The third-person singular (she) takes the -s suffix in the present simple.',
    grammarPhrase: 'works at the library',
    errorPhrase: '',
    mistakeType: ''
  },
  {
    topic: 'Tenses',
    level: 'A1',
    subtype: 'Present Simple',
    text: 'He don\'t like coffee in the morning.',
    isCorrect: false,
    correction: 'He doesn\'t like coffee in the morning.',
    explanation: 'Third-person singular subjects (he/she/it) require "doesn\'t" rather than "don\'t" in present simple negatives.',
    grammarPhrase: 'don\'t like coffee',
    errorPhrase: 'don\'t like',
    mistakeType: 'third-person negative auxiliary'
  },
  {
    topic: 'Tenses',
    level: 'A2',
    subtype: 'Past Simple',
    text: 'Yesterday she buyed a brand new laptop for work.',
    isCorrect: false,
    correction: 'Yesterday she bought a brand new laptop for work.',
    explanation: '"Buy" is an irregular verb whose past simple form is "bought", not "buyed".',
    grammarPhrase: 'buyed a brand new laptop',
    errorPhrase: 'buyed',
    mistakeType: 'irregular past verb regularization'
  },
  {
    topic: 'Tenses',
    level: 'A2',
    subtype: 'Past Simple',
    text: 'They visited the famous national museum last Saturday afternoon.',
    isCorrect: true,
    correction: 'They visited the famous national museum last Saturday afternoon.',
    explanation: 'Regular past tense verbs correctly take the -ed ending for completed past events.',
    grammarPhrase: 'visited the famous national museum',
    errorPhrase: '',
    mistakeType: ''
  },
  {
    topic: 'Tenses',
    level: 'B1',
    subtype: 'Present Perfect',
    text: 'I have seen that captivating movie two days ago with my friends.',
    isCorrect: false,
    correction: 'I saw that captivating movie two days ago with my friends.',
    explanation: 'Specific past time markers like "two days ago" require the past simple, not the present perfect.',
    grammarPhrase: 'have seen that captivating movie two days ago',
    errorPhrase: 'have seen ... two days ago',
    mistakeType: 'present perfect with finished past time'
  },
  {
    topic: 'Tenses',
    level: 'B1',
    subtype: 'Present Perfect',
    text: 'She has lived in Madrid for nearly five years now.',
    isCorrect: true,
    correction: 'She has lived in Madrid for nearly five years now.',
    explanation: 'Present perfect with "for" correctly describes an action that began in the past and continues to the present.',
    grammarPhrase: 'has lived in Madrid for nearly five years',
    errorPhrase: '',
    mistakeType: ''
  },
  {
    topic: 'Tenses',
    level: 'B2',
    subtype: 'Past Perfect',
    text: 'By the time the train arrived, they waited on the chilly platform for an hour.',
    isCorrect: false,
    correction: 'By the time the train arrived, they had been waiting on the chilly platform for an hour.',
    explanation: 'An ongoing action that was in progress before another completed past event requires the past perfect continuous.',
    grammarPhrase: 'waited on the chilly platform',
    errorPhrase: 'waited',
    mistakeType: 'past simple instead of past perfect continuous'
  },
  {
    topic: 'Tenses',
    level: 'C1',
    subtype: 'Future Perfect',
    text: 'By the end of next month, the research team will have finalized the clinical trials.',
    isCorrect: true,
    correction: 'By the end of next month, the research team will have finalized the clinical trials.',
    explanation: 'The future perfect correctly indicates an action that will be completed before a specified future deadline.',
    grammarPhrase: 'will have finalized the clinical trials',
    errorPhrase: '',
    mistakeType: ''
  },
  {
    topic: 'Tenses',
    level: 'C2',
    subtype: 'Stylistic Inversion',
    text: 'Rarely she had observed such remarkable dedication among newly hired researchers.',
    isCorrect: false,
    correction: 'Rarely had she observed such remarkable dedication among newly hired researchers.',
    explanation: 'Negative adverbs placed at the start of a clause (e.g., "Rarely") require subject-auxiliary inversion.',
    grammarPhrase: 'Rarely she had observed',
    errorPhrase: 'she had observed',
    mistakeType: 'negative inversion word order'
  },

  // --- PREPOSITIONS ---
  {
    topic: 'Prepositions',
    level: 'A1',
    subtype: 'Time (at/on/in)',
    text: 'The English class starts in 9:00 AM every weekday.',
    isCorrect: false,
    correction: 'The English class starts at 9:00 AM every weekday.',
    explanation: 'Exact clock times require the preposition "at", not "in".',
    grammarPhrase: 'starts in 9:00 AM',
    errorPhrase: 'in 9:00 AM',
    mistakeType: 'preposition of exact time'
  },
  {
    topic: 'Prepositions',
    level: 'A2',
    subtype: 'Time (at/on/in)',
    text: 'We always travel to the coast on July for summer vacation.',
    isCorrect: false,
    correction: 'We always travel to the coast in July for summer vacation.',
    explanation: 'Months and seasons require the preposition "in" (e.g., in July), whereas "on" is reserved for specific dates and days.',
    grammarPhrase: 'travel to the coast on July',
    errorPhrase: 'on July',
    mistakeType: 'preposition of months'
  },
  {
    topic: 'Prepositions',
    level: 'B1',
    subtype: 'Prepositions after adjectives',
    text: 'She has always been deeply interested in classical literature and art.',
    isCorrect: true,
    correction: 'She has always been deeply interested in classical literature and art.',
    explanation: 'The adjective "interested" takes the dependent preposition "in".',
    grammarPhrase: 'deeply interested in classical literature',
    errorPhrase: '',
    mistakeType: ''
  },
  {
    topic: 'Prepositions',
    level: 'B1',
    subtype: 'Prepositions after adjectives',
    text: 'My younger brother is really good in playing chess against grandmasters.',
    isCorrect: false,
    correction: 'My younger brother is really good at playing chess against grandmasters.',
    explanation: 'The adjective "good" takes the preposition "at" to indicate skill or proficiency.',
    grammarPhrase: 'good in playing chess',
    errorPhrase: 'good in',
    mistakeType: 'dependent preposition with adjective of skill'
  },
  {
    topic: 'Prepositions',
    level: 'B2',
    subtype: 'Prepositions after verbs',
    text: 'The senior director insisted on reviewing every single financial report personally.',
    isCorrect: true,
    correction: 'The senior director insisted on reviewing every single financial report personally.',
    explanation: 'The verb "insist" correctly takes the dependent preposition "on" followed by a gerund.',
    grammarPhrase: 'insisted on reviewing every single financial report',
    errorPhrase: '',
    mistakeType: ''
  },
  {
    topic: 'Prepositions',
    level: 'C1',
    subtype: 'Prepositional phrases',
    text: 'The board members were completely indifferent at the public concerns raised yesterday.',
    isCorrect: false,
    correction: 'The board members were completely indifferent to the public concerns raised yesterday.',
    explanation: 'The adjective "indifferent" requires the dependent preposition "to", not "at".',
    grammarPhrase: 'indifferent at the public concerns',
    errorPhrase: 'indifferent at',
    mistakeType: 'dependent preposition with adjective of attitude'
  },

  // --- CONDITIONALS ---
  {
    topic: 'Conditionals',
    level: 'A2',
    subtype: 'First Conditional',
    text: 'If it rains this evening, we will stay at home.',
    isCorrect: true,
    correction: 'If it rains this evening, we will stay at home.',
    explanation: 'First conditional sentences use present simple in the if-clause and will + bare infinitive in the result clause.',
    grammarPhrase: 'If it rains this evening',
    errorPhrase: '',
    mistakeType: ''
  },
  {
    topic: 'Conditionals',
    level: 'B1',
    subtype: 'First Conditional',
    text: 'If you will study hard tonight, you will pass tomorrow\'s examination.',
    isCorrect: false,
    correction: 'If you study hard tonight, you will pass tomorrow\'s examination.',
    explanation: 'In the first conditional, the condition clause uses the present simple, not "will".',
    grammarPhrase: 'If you will study hard',
    errorPhrase: 'will study',
    mistakeType: 'future tense in conditional clause'
  },
  {
    topic: 'Conditionals',
    level: 'B1',
    subtype: 'Second Conditional',
    text: 'If I had more free time, I would travel around South America.',
    isCorrect: true,
    correction: 'If I had more free time, I would travel around South America.',
    explanation: 'Second conditional properly pairs past simple in the if-clause with would + bare infinitive for hypothetical situations.',
    grammarPhrase: 'If I had more free time',
    errorPhrase: '',
    mistakeType: ''
  },
  {
    topic: 'Conditionals',
    level: 'B2',
    subtype: 'Third Conditional',
    text: 'If she would have checked the schedule earlier, she wouldn\'t have missed her train.',
    isCorrect: false,
    correction: 'If she had checked the schedule earlier, she wouldn\'t have missed her train.',
    explanation: 'The if-clause of a third conditional requires past perfect ("had checked"), never "would have".',
    grammarPhrase: 'If she would have checked',
    errorPhrase: 'would have checked',
    mistakeType: 'modal perfect in if-clause'
  },
  {
    topic: 'Conditionals',
    level: 'C1',
    subtype: 'Mixed Conditional',
    text: 'Had the architect foreseen the soil instability, the foundation would not be cracking today.',
    isCorrect: true,
    correction: 'Had the architect foreseen the soil instability, the foundation would not be cracking today.',
    explanation: 'Inverted third-conditional structure smoothly connects past cause to a present ongoing consequence.',
    grammarPhrase: 'Had the architect foreseen',
    errorPhrase: '',
    mistakeType: ''
  },

  // --- MODALS ---
  {
    topic: 'Modals',
    level: 'A1',
    subtype: 'Ability (can/could)',
    text: 'She can speaks three different languages fluently.',
    isCorrect: false,
    correction: 'She can speak three different languages fluently.',
    explanation: 'Modal auxiliaries like "can" must be followed by a bare infinitive without -s.',
    grammarPhrase: 'can speaks three different languages',
    errorPhrase: 'can speaks',
    mistakeType: 'inflected verb after modal'
  },
  {
    topic: 'Modals',
    level: 'A2',
    subtype: 'Obligation (must/have to)',
    text: 'All airline passengers must to show valid photo identification before boarding.',
    isCorrect: false,
    correction: 'All airline passengers must show valid photo identification before boarding.',
    explanation: 'The modal "must" takes a bare infinitive without the particle "to".',
    grammarPhrase: 'must to show valid photo identification',
    errorPhrase: 'must to show',
    mistakeType: 'to-infinitive after modal auxiliary'
  },
  {
    topic: 'Modals',
    level: 'B1',
    subtype: 'Advice (should/ought to)',
    text: 'You should consult a physician before starting any rigorous new fitness program.',
    isCorrect: true,
    correction: 'You should consult a physician before starting any rigorous new fitness program.',
    explanation: '"Should" is followed by a bare infinitive to offer sensible advice.',
    grammarPhrase: 'should consult a physician',
    errorPhrase: '',
    mistakeType: ''
  },
  {
    topic: 'Modals',
    level: 'B2',
    subtype: 'Deduction (must/can\'t)',
    text: 'She must had forgotten her keys because the front door remains firmly locked.',
    isCorrect: false,
    correction: 'She must have forgotten her keys because the front door remains firmly locked.',
    explanation: 'Past modal deduction requires modal + have + past participle, never modal + had.',
    grammarPhrase: 'must had forgotten her keys',
    errorPhrase: 'must had forgotten',
    mistakeType: 'past auxiliary after modal deduction'
  },

  // --- ARTICLES ---
  {
    topic: 'Articles',
    level: 'A1',
    subtype: 'Indefinite article (a/an)',
    text: 'He bought a orange and two fresh apples from the market.',
    isCorrect: false,
    correction: 'He bought an orange and two fresh apples from the market.',
    explanation: 'Words beginning with a vowel sound take "an" rather than "a".',
    grammarPhrase: 'bought a orange',
    errorPhrase: 'a orange',
    mistakeType: 'indefinite article vowel mismatch'
  },
  {
    topic: 'Articles',
    level: 'A2',
    subtype: 'Definite article (the)',
    text: 'The sun rises in the east and sets in the west every single day.',
    isCorrect: true,
    correction: 'The sun rises in the east and sets in the west every single day.',
    explanation: 'Unique astronomical bodies and cardinal directions take the definite article "the".',
    grammarPhrase: 'The sun rises in the east',
    errorPhrase: '',
    mistakeType: ''
  },
  {
    topic: 'Articles',
    level: 'B1',
    subtype: 'Zero article',
    text: 'The breakfast is the most important meal of the morning.',
    isCorrect: false,
    correction: 'Breakfast is the most important meal of the morning.',
    explanation: 'General names of meals (breakfast, lunch, dinner) take the zero article when discussed in general.',
    grammarPhrase: 'The breakfast is the most important',
    errorPhrase: 'The breakfast',
    mistakeType: 'superfluous definite article before meal name'
  },
  {
    topic: 'Articles',
    level: 'B2',
    subtype: 'Generic reference',
    text: 'Knowledge is power when shared responsibly among peers.',
    isCorrect: true,
    correction: 'Knowledge is power when shared responsibly among peers.',
    explanation: 'Uncountable abstract nouns used in a general sense take the zero article.',
    grammarPhrase: 'Knowledge is power',
    errorPhrase: '',
    mistakeType: ''
  },

  // --- PHRASAL VERBS ---
  {
    topic: 'Phrasal Verbs',
    level: 'A2',
    subtype: 'Separable transitive',
    text: 'Please turn off the lights before you leave the conference room.',
    isCorrect: true,
    correction: 'Please turn off the lights before you leave the conference room.',
    explanation: '"Turn off" is a separable phrasal verb correctly positioned before a noun phrase object.',
    grammarPhrase: 'turn off the lights',
    errorPhrase: '',
    mistakeType: ''
  },
  {
    topic: 'Phrasal Verbs',
    level: 'B1',
    subtype: 'Separable transitive',
    text: 'I will pick up you from the airport as soon as your flight lands.',
    isCorrect: false,
    correction: 'I will pick you up from the airport as soon as your flight lands.',
    explanation: 'When the direct object of a separable phrasal verb is a pronoun (you/him/her/it/them), it MUST go between the verb and the particle.',
    grammarPhrase: 'pick up you from the airport',
    errorPhrase: 'pick up you',
    mistakeType: 'pronoun placement in separable phrasal verb'
  },
  {
    topic: 'Phrasal Verbs',
    level: 'B2',
    subtype: 'Inseparable transitive',
    text: 'After months of hard work, they finally came up with an ingenious technical solution.',
    isCorrect: true,
    correction: 'After months of hard work, they finally came up with an ingenious technical solution.',
    explanation: '"Come up with" is a three-part inseparable phrasal verb correctly used here.',
    grammarPhrase: 'came up with an ingenious technical solution',
    errorPhrase: '',
    mistakeType: ''
  },

  // --- REPORTED SPEECH ---
  {
    topic: 'Reported Speech',
    level: 'B1',
    subtype: 'Tense backshift',
    text: 'She told me that she is living in London during her college years in 2018.',
    isCorrect: false,
    correction: 'She told me that she was living in London during her college years in 2018.',
    explanation: 'In reported speech with a past reporting verb ("told"), present forms backshift to past forms ("was living").',
    grammarPhrase: 'told me that she is living',
    errorPhrase: 'she is living',
    mistakeType: 'failure to backshift tense in reported speech'
  },
  {
    topic: 'Reported Speech',
    level: 'B2',
    subtype: 'Reported questions',
    text: 'The customs officer asked me where was I traveling from.',
    isCorrect: false,
    correction: 'The customs officer asked me where I was traveling from.',
    explanation: 'Reported questions use normal statement word order (subject + verb), not interrogative inversion.',
    grammarPhrase: 'asked me where was I traveling',
    errorPhrase: 'where was I',
    mistakeType: 'inverted word order in reported question'
  },
  {
    topic: 'Reported Speech',
    level: 'C1',
    subtype: 'Reporting verbs',
    text: 'The defense attorney argued that the evidence presented had been unlawfully obtained.',
    isCorrect: true,
    correction: 'The defense attorney argued that the evidence presented had been unlawfully obtained.',
    explanation: 'Appropriate past perfect passive backshift following the reporting verb "argued".',
    grammarPhrase: 'argued that the evidence presented had been unlawfully obtained',
    errorPhrase: '',
    mistakeType: ''
  }
];

interface CuratedClozeEntry {
  topic: string;
  level: CEFRLevel;
  text: string;
  correction: string;
  explanation: string;
  grammarPhrase: string;
  correctAnswer: string;
  acceptedAnswers: string[];
  options: [string, string, string, string];
}

const CURATED_CLOZE_BANK: CuratedClozeEntry[] = [
  {
    topic: 'Tenses',
    level: 'A2',
    text: 'She _____ never visited Paris before her trip last summer.',
    correction: 'She had never visited Paris before her trip last summer.',
    explanation: 'Past Perfect ("had" + past participle) is used for an experience or action before a specific past event.',
    grammarPhrase: 'She had never visited',
    correctAnswer: 'had',
    acceptedAnswers: ['had'],
    options: ['had', 'has', 'was', 'did']
  },
  {
    topic: 'Tenses',
    level: 'B1',
    text: 'We _____ been waiting outside the theater for over forty minutes when the doors finally opened.',
    correction: 'We had been waiting outside the theater for over forty minutes when the doors finally opened.',
    explanation: 'Past Perfect Continuous ("had been waiting") emphasizes the duration of an action up to a past moment.',
    grammarPhrase: 'We had been waiting',
    correctAnswer: 'had',
    acceptedAnswers: ['had'],
    options: ['had', 'have', 'were', 'are']
  },
  {
    topic: 'Tenses',
    level: 'B2',
    text: 'By the end of this decade, engineers will _____ developed far more efficient battery cells.',
    correction: 'By the end of this decade, engineers will have developed far more efficient battery cells.',
    explanation: 'Future Perfect ("will have" + past participle) describes an action completed before a future deadline.',
    grammarPhrase: 'will have developed',
    correctAnswer: 'have',
    acceptedAnswers: ['have'],
    options: ['have', 'be', 'had', 'has']
  },
  {
    topic: 'Prepositions',
    level: 'A2',
    text: 'The final championship match starts _____ 7:30 PM on Saturday.',
    correction: 'The final championship match starts at 7:30 PM on Saturday.',
    explanation: 'Use the preposition "at" before specific clock times.',
    grammarPhrase: 'starts at 7:30 PM',
    correctAnswer: 'at',
    acceptedAnswers: ['at', 'around', 'by'],
    options: ['at', 'on', 'in', 'to']
  },
  {
    topic: 'Prepositions',
    level: 'B1',
    text: 'The lead detective was deeply suspicious _____ the alibi provided by the witness.',
    correction: 'The lead detective was deeply suspicious of the alibi provided by the witness.',
    explanation: 'The adjective "suspicious" takes the dependent preposition "of" ("suspicious of").',
    grammarPhrase: 'deeply suspicious of the alibi',
    correctAnswer: 'of',
    acceptedAnswers: ['of', 'about'],
    options: ['of', 'on', 'for', 'with']
  },
  {
    topic: 'Prepositions',
    level: 'B2',
    text: 'The new safety regulations will come _____ effect at the beginning of next month.',
    correction: 'The new safety regulations will come into effect at the beginning of next month.',
    explanation: 'The fixed prepositional phrase "come into effect" means to become legally active.',
    grammarPhrase: 'come into effect',
    correctAnswer: 'into',
    acceptedAnswers: ['into'],
    options: ['into', 'in', 'on', 'under']
  },
  {
    topic: 'Articles',
    level: 'B1',
    text: 'She plays _____ cello in the national youth orchestra every weekend.',
    correction: 'She plays the cello in the national youth orchestra every weekend.',
    explanation: 'In standard English, the definite article "the" is used with musical instruments ("play the cello").',
    grammarPhrase: 'plays the cello',
    correctAnswer: 'the',
    acceptedAnswers: ['the'],
    options: ['the', 'a', 'an', 'one']
  },
  {
    topic: 'Articles',
    level: 'B2',
    text: 'It was _____ honor to represent our university at the international linguistics symposium.',
    correction: 'It was an honor to represent our university at the international linguistics symposium.',
    explanation: 'Use "an" before "honor" because the "h" is silent and the word begins with a vowel sound.',
    grammarPhrase: 'It was an honor',
    correctAnswer: 'an',
    acceptedAnswers: ['an'],
    options: ['an', 'a', 'the', 'some']
  },
  {
    topic: 'Conditionals',
    level: 'B1',
    text: 'If I _____ known about the traffic jam earlier, I would have taken the train.',
    correction: 'If I had known about the traffic jam earlier, I would have taken the train.',
    explanation: 'Third Conditional requires Past Perfect ("had known") in the if-clause.',
    grammarPhrase: 'If I had known',
    correctAnswer: 'had',
    acceptedAnswers: ['had'],
    options: ['had', 'have', 'would', 'did']
  },
  {
    topic: 'Conditionals',
    level: 'B2',
    text: 'You cannot enter the high-stakes salon _____ you are wearing formal evening attire.',
    correction: 'You cannot enter the high-stakes salon unless you are wearing formal evening attire.',
    explanation: '"Unless" means "except if" and introduces a negative condition.',
    grammarPhrase: 'salon unless you are',
    correctAnswer: 'unless',
    acceptedAnswers: ['unless'],
    options: ['unless', 'despite', 'otherwise', 'without']
  },
  {
    topic: 'Conditionals',
    level: 'C1',
    text: '_____ the board of directors approved the budget earlier, the project would already be finished.',
    correction: 'Had the board of directors approved the budget earlier, the project would already be finished.',
    explanation: 'In formal third conditionals, "If" can be omitted using subject-auxiliary inversion ("Had the board...").',
    grammarPhrase: 'Had the board of directors approved',
    correctAnswer: 'Had',
    acceptedAnswers: ['had'],
    options: ['Had', 'Were', 'Should', 'Have']
  },
  {
    topic: 'Modals',
    level: 'B1',
    text: 'The lights are completely off in his office; he _____ have gone home for the evening.',
    correction: 'The lights are completely off in his office; he must have gone home for the evening.',
    explanation: 'Use "must have + past participle" for a strong logical deduction about the past.',
    grammarPhrase: 'he must have gone',
    correctAnswer: 'must',
    acceptedAnswers: ['must', 'might', 'may', 'could'],
    options: ['must', 'should', 'can', 'ought']
  },
  {
    topic: 'Modals',
    level: 'B2',
    text: 'You really _____ to apologize to your colleague before the misunderstanding gets worse.',
    correction: 'You really ought to apologize to your colleague before the misunderstanding gets worse.',
    explanation: '"Ought" is the modal verb followed directly by "to" + bare infinitive ("ought to apologize") to give advice.',
    grammarPhrase: 'really ought to apologize',
    correctAnswer: 'ought',
    acceptedAnswers: ['ought', 'need', 'have'],
    options: ['ought', 'should', 'must', 'had']
  },
  {
    topic: 'Phrasal Verbs',
    level: 'B1',
    text: 'The outdoor concert had to be called _____ at the last minute due to the thunderstorm.',
    correction: 'The outdoor concert had to be called off at the last minute due to the thunderstorm.',
    explanation: 'The phrasal verb "call off" means to cancel a planned event.',
    grammarPhrase: 'be called off at',
    correctAnswer: 'off',
    acceptedAnswers: ['off'],
    options: ['off', 'out', 'up', 'away']
  },
  {
    topic: 'Phrasal Verbs',
    level: 'B2',
    text: 'After hours of negotiation, they finally came _____ with a brilliant compromise.',
    correction: 'After hours of negotiation, they finally came up with a brilliant compromise.',
    explanation: 'The three-part phrasal verb "come up with" means to think of or produce an idea or plan.',
    grammarPhrase: 'came up with a',
    correctAnswer: 'up',
    acceptedAnswers: ['up'],
    options: ['up', 'out', 'across', 'over']
  },
  {
    topic: 'Reported Speech',
    level: 'B1',
    text: 'The customs officer asked the passenger _____ he was carrying any declared goods.',
    correction: 'The customs officer asked the passenger whether he was carrying any declared goods.',
    explanation: 'Reported yes/no questions are introduced by "whether" or "if".',
    grammarPhrase: 'asked the passenger whether he',
    correctAnswer: 'whether',
    acceptedAnswers: ['whether', 'if'],
    options: ['whether', 'that', 'what', 'which']
  },
  {
    topic: 'Reported Speech',
    level: 'B2',
    text: 'The witness denied _____ seen the suspect anywhere near the vault that night.',
    correction: 'The witness denied having seen the suspect anywhere near the vault that night.',
    explanation: 'The reporting verb "deny" is followed by a gerund or perfect gerund ("having seen").',
    grammarPhrase: 'denied having seen',
    correctAnswer: 'having',
    acceptedAnswers: ['having', 'ever'],
    options: ['having', 'have', 'to', 'had']
  }
];

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function getCuratedSentence(
  settings: Settings,
  pastSentences: string[] = [],
  forceCorrect: boolean | null = null,
  subtype: string | null = null,
  pastMistakes: string[] = [],
  questionType?: QuestionType
): GeneratedSentence {
  const { topic, level, challengeFormat } = settings;
  const resolvedType: QuestionType =
    questionType ||
    (challengeFormat === 'multipleChoice' || challengeFormat === 'openCloze' || challengeFormat === 'binary'
      ? challengeFormat
      : (['binary', 'multipleChoice', 'openCloze'] as QuestionType[])[Math.floor(Math.random() * 3)]);

  const pastTextSet = new Set(pastSentences.map(s => s.trim().toLowerCase()));

  if (resolvedType === 'multipleChoice' || resolvedType === 'openCloze') {
    let clozeCandidates = CURATED_CLOZE_BANK.filter(entry => {
      if (topic && topic !== 'My own choice' && entry.topic.toLowerCase() !== topic.toLowerCase()) {
        return false;
      }
      if (level && entry.level !== level) {
        return false;
      }
      return !pastTextSet.has(entry.text.trim().toLowerCase());
    });

    if (clozeCandidates.length === 0) {
      clozeCandidates = CURATED_CLOZE_BANK.filter(entry => {
        if (topic && topic !== 'My own choice' && entry.topic.toLowerCase() !== topic.toLowerCase()) {
          return false;
        }
        return !pastTextSet.has(entry.text.trim().toLowerCase());
      });
    }

    if (clozeCandidates.length === 0) {
      clozeCandidates = CURATED_CLOZE_BANK.filter(entry => !pastTextSet.has(entry.text.trim().toLowerCase()));
    }

    if (clozeCandidates.length === 0) {
      clozeCandidates = CURATED_CLOZE_BANK;
    }

    const picked = clozeCandidates[Math.floor(Math.random() * clozeCandidates.length)] || CURATED_CLOZE_BANK[0];
    return {
      text: picked.text,
      isCorrect: true,
      correction: picked.correction,
      explanation: picked.explanation,
      grammarPhrase: picked.grammarPhrase,
      errorPhrase: '',
      mistakeType: '',
      questionType: resolvedType,
      correctAnswer: picked.correctAnswer,
      acceptedAnswers: picked.acceptedAnswers,
      options: resolvedType === 'multipleChoice' ? shuffleArray(picked.options) : undefined,
    };
  }

  const pastMistakesSet = new Set(pastMistakes.map(m => m.trim().toLowerCase()));

  // 1. Try matching both topic and level
  let candidates = CURATED_SENTENCE_BANK.filter(entry => {
    if (topic && topic !== 'My own choice' && entry.topic.toLowerCase() !== topic.toLowerCase()) {
      return false;
    }
    if (level && entry.level !== level) {
      return false;
    }
    if (forceCorrect !== null && entry.isCorrect !== forceCorrect) {
      return false;
    }
    if (subtype && entry.subtype && entry.subtype.toLowerCase() !== subtype.toLowerCase()) {
      return false;
    }
    if (pastTextSet.has(entry.text.trim().toLowerCase())) {
      return false;
    }
    if (!entry.isCorrect && entry.errorPhrase && pastMistakesSet.has(entry.errorPhrase.trim().toLowerCase())) {
      return false;
    }
    return true;
  });

  // 2. If no exact match, broaden to match topic regardless of level
  if (candidates.length === 0) {
    candidates = CURATED_SENTENCE_BANK.filter(entry => {
      if (topic && topic !== 'My own choice' && entry.topic.toLowerCase() !== topic.toLowerCase()) {
        return false;
      }
      if (forceCorrect !== null && entry.isCorrect !== forceCorrect) {
        return false;
      }
      return !pastTextSet.has(entry.text.trim().toLowerCase());
    });
  }

  // 3. If still empty, broaden to any unplayed sentence matching correctness
  if (candidates.length === 0) {
    candidates = CURATED_SENTENCE_BANK.filter(entry => {
      if (forceCorrect !== null && entry.isCorrect !== forceCorrect) {
        return false;
      }
      return !pastTextSet.has(entry.text.trim().toLowerCase());
    });
  }

  // 4. Final fallback if everything has been played
  if (candidates.length === 0) {
    candidates = CURATED_SENTENCE_BANK.filter(entry => {
      if (forceCorrect !== null) return entry.isCorrect === forceCorrect;
      return true;
    });
  }

  const selected = candidates[Math.floor(Math.random() * candidates.length)] || CURATED_SENTENCE_BANK[0];

  return {
    text: selected.text,
    isCorrect: selected.isCorrect,
    correction: selected.correction,
    explanation: selected.explanation,
    grammarPhrase: selected.grammarPhrase,
    errorPhrase: selected.errorPhrase,
    mistakeType: selected.mistakeType,
    questionType: 'binary',
  };
}
