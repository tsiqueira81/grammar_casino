import { GeneratedSentence, CEFRLevel, Settings, QuestionType, GrammarTopic } from '../types';

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
  },

  // --- COLLOCATIONS ---
  {
    topic: 'Collocations',
    level: 'A1',
    subtype: 'Verb + Noun (make/do/take/have)',
    text: 'I always make my homework in the afternoon after school.',
    isCorrect: false,
    correction: 'I always do my homework in the afternoon after school.',
    explanation: 'In English, the noun "homework" collocates with the verb "do" ("do homework"), not "make".',
    grammarPhrase: 'make my homework',
    errorPhrase: 'make my homework',
    mistakeType: 'make vs do collocation'
  },
  {
    topic: 'Collocations',
    level: 'A1',
    subtype: 'Verb + Noun (make/do/take/have)',
    text: 'We usually have breakfast together at seven o\'clock.',
    isCorrect: true,
    correction: 'We usually have breakfast together at seven o\'clock.',
    explanation: '"Have breakfast" is a natural verb + noun collocation for eating a morning meal.',
    grammarPhrase: 'have breakfast together',
    errorPhrase: '',
    mistakeType: ''
  },
  {
    topic: 'Collocations',
    level: 'A2',
    subtype: 'Adjective + Noun collocations',
    text: 'We stayed indoors because there was a very strong rain all afternoon.',
    isCorrect: false,
    correction: 'We stayed indoors because there was heavy rain all afternoon.',
    explanation: 'In English, "rain" collocates with "heavy" ("heavy rain"), whereas "strong" collocates with "wind".',
    grammarPhrase: 'a very strong rain',
    errorPhrase: 'strong rain',
    mistakeType: 'adjective + noun collocation'
  },
  {
    topic: 'Collocations',
    level: 'A2',
    subtype: 'Verb + Noun (make/do/take/have)',
    text: 'Please take a photo of the castle before the sun goes down.',
    isCorrect: true,
    correction: 'Please take a photo of the castle before the sun goes down.',
    explanation: '"Take a photo" is the standard English collocation for capturing a picture with a camera.',
    grammarPhrase: 'take a photo of the castle',
    errorPhrase: '',
    mistakeType: ''
  },
  {
    topic: 'Collocations',
    level: 'B1',
    subtype: 'Verb + Noun (make/do/take/have)',
    text: 'Everyone does mistakes when they are learning a foreign language.',
    isCorrect: false,
    correction: 'Everyone makes mistakes when they are learning a foreign language.',
    explanation: 'The noun "mistakes" collocates with the verb "make" ("make a mistake"), never "do".',
    grammarPhrase: 'Everyone does mistakes',
    errorPhrase: 'does mistakes',
    mistakeType: 'verb + noun collocation'
  },
  {
    topic: 'Collocations',
    level: 'B1',
    subtype: 'Verb + Preposition collocations',
    text: 'All passengers must pay close attention to the safety demonstration before takeoff.',
    isCorrect: true,
    correction: 'All passengers must pay close attention to the safety demonstration before takeoff.',
    explanation: '"Pay close attention to" is a strong, natural verb + adjective + noun + preposition collocation.',
    grammarPhrase: 'pay close attention to',
    errorPhrase: '',
    mistakeType: ''
  },
  {
    topic: 'Collocations',
    level: 'B2',
    subtype: 'Adverb + Adjective collocations',
    text: 'The coaching staff was bitterly disappointed with the team\'s performance in the final.',
    isCorrect: true,
    correction: 'The coaching staff was bitterly disappointed with the team\'s performance in the final.',
    explanation: '"Bitterly disappointed" is an authentic adverb + adjective intensifying collocation.',
    grammarPhrase: 'bitterly disappointed with',
    errorPhrase: '',
    mistakeType: ''
  },
  {
    topic: 'Collocations',
    level: 'B2',
    subtype: 'Verb + Noun (make/do/take/have)',
    text: 'The sudden frost made severe damage to the regional citrus orchards.',
    isCorrect: false,
    correction: 'The sudden frost did severe damage to the regional citrus orchards.',
    explanation: 'The noun "damage" collocates with "do" or "cause" ("do/cause damage"), not "make".',
    grammarPhrase: 'made severe damage to',
    errorPhrase: 'made severe damage',
    mistakeType: 'make vs do collocation with damage'
  },
  {
    topic: 'Collocations',
    level: 'C1',
    subtype: 'Adjective + Noun collocations',
    text: 'The two rival factions finally reached a begrudging consensus after midnight.',
    isCorrect: true,
    correction: 'The two rival factions finally reached a begrudging consensus after midnight.',
    explanation: '"Reach a consensus" is the standard formal collocation for arriving at shared agreement.',
    grammarPhrase: 'reached a begrudging consensus',
    errorPhrase: '',
    mistakeType: ''
  },
  {
    topic: 'Collocations',
    level: 'C1',
    subtype: 'Adverb + Adjective collocations',
    text: 'The lead investigator remained utterly aware of the political risks involved in the probe.',
    isCorrect: false,
    correction: 'The lead investigator remained acutely aware of the political risks involved in the probe.',
    explanation: '"Aware" collocates naturally with "acutely", "fully", or "painfully" ("acutely aware"), whereas "utterly" collocates with extreme negative/absolute adjectives like "impossible" or "exhausted".',
    grammarPhrase: 'remained utterly aware of',
    errorPhrase: 'utterly aware',
    mistakeType: 'adverb + adjective collocation mismatch'
  },
  {
    topic: 'Collocations',
    level: 'C2',
    subtype: 'Fixed idiomatic expressions',
    text: 'His remarks cast serious doubt on the authenticity of the newly discovered manuscript.',
    isCorrect: true,
    correction: 'His remarks cast serious doubt on the authenticity of the newly discovered manuscript.',
    explanation: '"Cast doubt on" is an idiomatic, high-register verb + noun + preposition collocation.',
    grammarPhrase: 'cast serious doubt on',
    errorPhrase: '',
    mistakeType: ''
  },
  {
    topic: 'Collocations',
    level: 'C2',
    subtype: 'Verb + Noun (make/do/take/have)',
    text: 'The central bank\'s abrupt announcement inflicted havoc on currency markets across the continent.',
    isCorrect: false,
    correction: 'The central bank\'s abrupt announcement wreaked havoc on currency markets across the continent.',
    explanation: 'The fixed high-register collocation is "wreak havoc on" (or "play havoc with"), not "inflict havoc on".',
    grammarPhrase: 'inflicted havoc on currency markets',
    errorPhrase: 'inflicted havoc',
    mistakeType: 'high-register verb + noun collocation'
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

export const CURATED_CLOZE_BANK: CuratedClozeEntry[] = [
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
  },
  {
    topic: 'Collocations',
    level: 'A1',
    text: 'Don\'t forget to _____ your bed before you go to school this morning.',
    correction: 'Don\'t forget to make your bed before you go to school this morning.',
    explanation: '"Make your bed" is the fixed verb + noun collocation for tidying sheets and blankets.',
    grammarPhrase: 'make your bed',
    correctAnswer: 'make',
    acceptedAnswers: ['make'],
    options: ['make', 'do', 'take', 'put']
  },
  {
    topic: 'Collocations',
    level: 'A2',
    text: 'Our flight was delayed for two hours because of _____ fog around the airport.',
    correction: 'Our flight was delayed for two hours because of thick fog around the airport.',
    explanation: '"Thick fog" (or "dense/heavy fog") is the natural adjective + noun collocation for low-visibility fog.',
    grammarPhrase: 'because of thick fog',
    correctAnswer: 'thick',
    acceptedAnswers: ['thick', 'dense', 'heavy'],
    options: ['thick', 'strong', 'tall', 'loud']
  },
  {
    topic: 'Collocations',
    level: 'B1',
    text: 'Could you _____ me a favor and water my plants while I\'m away on vacation?',
    correction: 'Could you do me a favor and water my plants while I\'m away on vacation?',
    explanation: '"Do someone a favor" is a classic verb + noun collocation ("do", never "make").',
    grammarPhrase: 'do me a favor',
    correctAnswer: 'do',
    acceptedAnswers: ['do', 'grant'],
    options: ['do', 'make', 'give', 'take']
  },
  {
    topic: 'Collocations',
    level: 'B1',
    text: 'She _____ a deep breath before stepping onto the brightly lit theater stage.',
    correction: 'She took a deep breath before stepping onto the brightly lit theater stage.',
    explanation: '"Take a deep breath" is the standard collocation (past tense: "took a deep breath").',
    grammarPhrase: 'took a deep breath',
    correctAnswer: 'took',
    acceptedAnswers: ['took', 'drew'],
    options: ['took', 'made', 'did', 'kept']
  },
  {
    topic: 'Collocations',
    level: 'B2',
    text: 'The new documentary raises serious _____ about how social media algorithms shape attention.',
    correction: 'The new documentary raises serious questions about how social media algorithms shape attention.',
    explanation: '"Raise questions" (or "raise concerns/doubts") is a strong verb + noun collocation.',
    grammarPhrase: 'raises serious questions about',
    correctAnswer: 'questions',
    acceptedAnswers: ['questions', 'concerns', 'doubts', 'issues'],
    options: ['questions', 'inquiries', 'askings', 'answers']
  },
  {
    topic: 'Collocations',
    level: 'B2',
    text: 'I am _____ aware that the deadline is tight, but quality must remain our top priority.',
    correction: 'I am fully aware that the deadline is tight, but quality must remain our top priority.',
    explanation: '"Fully aware" (or "well/acutely aware") is the standard adverb + adjective collocation.',
    grammarPhrase: 'am fully aware that',
    correctAnswer: 'fully',
    acceptedAnswers: ['fully', 'well', 'acutely', 'completely', 'quite'],
    options: ['fully', 'heavily', 'strongly', 'hardly']
  },
  {
    topic: 'Collocations',
    level: 'C1',
    text: 'The protracted trade dispute has _____ a heavy toll on small manufacturing firms.',
    correction: 'The protracted trade dispute has taken a heavy toll on small manufacturing firms.',
    explanation: '"Take a heavy toll on" is an idiomatic C1 collocation meaning to cause severe damage or wear.',
    grammarPhrase: 'taken a heavy toll on',
    correctAnswer: 'taken',
    acceptedAnswers: ['taken', 'exacted'],
    options: ['taken', 'made', 'done', 'put']
  },
  {
    topic: 'Collocations',
    level: 'C2',
    text: 'The sudden deregulation of the sector _____ havoc with long-standing supply chains.',
    correction: 'The sudden deregulation of the sector played havoc with long-standing supply chains.',
    explanation: '"Play havoc with" (or "wreak havoc on") is the idiomatic mastery-level collocation for causing widespread disruption.',
    grammarPhrase: 'played havoc with',
    correctAnswer: 'played',
    acceptedAnswers: ['played', 'wrought', 'wreaked'],
    options: ['played', 'made', 'took', 'gave']
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

const CLOUD_SENTENCE_STORAGE_KEY = 'grammar_casino_cloud_sentences_v1';

function getDynamicCloudEntries(): any[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CLOUD_SENTENCE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export interface CuratedWordFormationEntry {
  topic: GrammarTopic | string;
  level: CEFRLevel;
  text: string;
  correction: string;
  explanation: string;
  grammarPhrase: string;
  baseWord: string;
  correctAnswer: string;
  acceptedAnswers: string[];
}

export const CURATED_WORD_FORMATION_BANK: CuratedWordFormationEntry[] = [
  {
    topic: 'Tenses',
    level: 'A1',
    text: 'My older brother is a very good _____ who works at the city school.',
    correction: 'My older brother is a very good teacher who works at the city school.',
    explanation: 'We add the suffix "-er" to the verb "teach" to form the person noun "teacher".',
    grammarPhrase: 'very good teacher',
    baseWord: 'TEACH',
    correctAnswer: 'teacher',
    acceptedAnswers: ['teacher'],
  },
  {
    topic: 'Prepositions',
    level: 'A1',
    text: 'Please drive _____ because the roads are wet after the rain.',
    correction: 'Please drive carefully because the roads are wet after the rain.',
    explanation: 'To describe how someone drives, we turn "care" into the adjective "careful" and add "-ly" to form the adverb "carefully".',
    grammarPhrase: 'Please drive carefully',
    baseWord: 'CARE',
    correctAnswer: 'carefully',
    acceptedAnswers: ['carefully'],
  },
  {
    topic: 'Collocations',
    level: 'A1',
    text: 'Our new neighbor is always very _____ and greets everyone with a big smile.',
    correction: 'Our new neighbor is always very friendly and greets everyone with a big smile.',
    explanation: 'Adding "-ly" to the noun "friend" forms the adjective "friendly" to describe a person.',
    grammarPhrase: 'always very friendly',
    baseWord: 'FRIEND',
    correctAnswer: 'friendly',
    acceptedAnswers: ['friendly'],
  },
  {
    topic: 'Articles',
    level: 'A2',
    text: 'Making a final _____ about which university to attend took her several weeks.',
    correction: 'Making a final decision about which university to attend took her several weeks.',
    explanation: 'After the adjective "final", we need a singular noun: the verb "decide" becomes "decision".',
    grammarPhrase: 'Making a final decision',
    baseWord: 'DECIDE',
    correctAnswer: 'decision',
    acceptedAnswers: ['decision'],
  },
  {
    topic: 'Modals',
    level: 'A2',
    text: 'It is completely _____ to finish such a huge project in just one hour.',
    correction: 'It is completely impossible to finish such a huge project in just one hour.',
    explanation: 'The context requires the negative prefix "im-" before "possible" to mean "not possible".',
    grammarPhrase: 'is completely impossible',
    baseWord: 'POSSIBLE',
    correctAnswer: 'impossible',
    acceptedAnswers: ['impossible'],
  },
  {
    topic: 'Collocations',
    level: 'A2',
    text: 'Regular exercise and fresh food can make a big _____ to your daily energy levels.',
    correction: 'Regular exercise and fresh food can make a big difference to your daily energy levels.',
    explanation: '"Make a difference" is a classic collocation requiring the noun form "difference" from "different".',
    grammarPhrase: 'make a big difference',
    baseWord: 'DIFFERENT',
    correctAnswer: 'difference',
    acceptedAnswers: ['difference'],
  },
  {
    topic: 'Conditionals',
    level: 'B1',
    text: 'If you do not dress warmly, you will feel very _____ during the mountain hike.',
    correction: 'If you do not dress warmly, you will feel very uncomfortable during the mountain hike.',
    explanation: 'We add the negative prefix "un-" and adjective suffix "-able" to "comfort" to form "uncomfortable".',
    grammarPhrase: 'feel very uncomfortable',
    baseWord: 'COMFORT',
    correctAnswer: 'uncomfortable',
    acceptedAnswers: ['uncomfortable'],
  },
  {
    topic: 'Phrasal Verbs',
    level: 'B1',
    text: 'To our great _____, the train arrived right on time despite the snowstorm.',
    correction: 'To our great amazement, the train arrived right on time despite the snowstorm.',
    explanation: 'After the possessive "our" and adjective "great", we need the abstract noun "amazement" formed with the suffix "-ment".',
    grammarPhrase: 'our great amazement',
    baseWord: 'AMAZE',
    correctAnswer: 'amazement',
    acceptedAnswers: ['amazement'],
  },
  {
    topic: 'Reported Speech',
    level: 'B1',
    text: 'The tour guide apologized for the _____ caused by the sudden change in schedule.',
    correction: 'The tour guide apologized for the inconvenience caused by the sudden change in schedule.',
    explanation: 'We add the negative prefix "in-" and change "-t" to "-ce" to form the noun "inconvenience".',
    grammarPhrase: 'for the inconvenience',
    baseWord: 'CONVENIENT',
    correctAnswer: 'inconvenience',
    acceptedAnswers: ['inconvenience'],
  },
  {
    topic: 'Collocations',
    level: 'B1',
    text: 'She had a strong _____ that her team would win the championship trophy.',
    correction: 'She had a strong belief that her team would win the championship trophy.',
    explanation: 'The collocation "a strong belief" requires transforming the verb "believe" into its noun form "belief".',
    grammarPhrase: 'a strong belief',
    baseWord: 'BELIEVE',
    correctAnswer: 'belief',
    acceptedAnswers: ['belief'],
  },
  {
    topic: 'Tenses',
    level: 'B2',
    text: 'The rescue team searched _____ for three days before finally locating the lost hikers.',
    correction: 'The rescue team searched tirelessly for three days before finally locating the lost hikers.',
    explanation: 'We combine the suffix "-less" (without tiring) and "-ly" to form the adverb "tirelessly" modifying "searched".',
    grammarPhrase: 'team searched tirelessly',
    baseWord: 'TIRE',
    correctAnswer: 'tirelessly',
    acceptedAnswers: ['tirelessly'],
  },
  {
    topic: 'Conditionals',
    level: 'B2',
    text: 'Without proper _____, even the finest laboratory equipment will eventually break down.',
    correction: 'Without proper maintenance, even the finest laboratory equipment will eventually break down.',
    explanation: 'After the adjective "proper", the verb "maintain" undergoes an internal spelling shift to form the noun "maintenance".',
    grammarPhrase: 'Without proper maintenance',
    baseWord: 'MAINTAIN',
    correctAnswer: 'maintenance',
    acceptedAnswers: ['maintenance'],
  },
  {
    topic: 'Modals',
    level: 'B2',
    text: 'Workers must wear protective helmets at all times to ensure their _____ on the construction site.',
    correction: 'Workers must wear protective helmets at all times to ensure their safety on the construction site.',
    explanation: 'Following the possessive determiner "their", the adjective "safe" becomes the abstract noun "safety".',
    grammarPhrase: 'ensure their safety',
    baseWord: 'SAFE',
    correctAnswer: 'safety',
    acceptedAnswers: ['safety'],
  },
  {
    topic: 'Collocations',
    level: 'B2',
    text: 'The documentary raised public _____ of the dangers of plastic pollution in our oceans.',
    correction: 'The documentary raised public awareness of the dangers of plastic pollution in our oceans.',
    explanation: '"Raise public awareness" is a fixed B2 collocation requiring the noun "awareness" from the adjective "aware".',
    grammarPhrase: 'raised public awareness',
    baseWord: 'AWARE',
    correctAnswer: 'awareness',
    acceptedAnswers: ['awareness'],
  },
  {
    topic: 'Prepositions',
    level: 'C1',
    text: 'Despite several attempts to negotiate a truce, the two rival factions remained _____ opposed.',
    correction: 'Despite several attempts to negotiate a truce, the two rival factions remained irreconcilably opposed.',
    explanation: 'Modifying the participle "opposed" requires the negative prefix "ir-" and adverb suffix "-ably" ("irreconcilably").',
    grammarPhrase: 'remained irreconcilably opposed',
    baseWord: 'RECONCILE',
    correctAnswer: 'irreconcilably',
    acceptedAnswers: ['irreconcilably'],
  },
  {
    topic: 'Articles',
    level: 'C1',
    text: 'The sudden _____ of the ancient manuscript baffled historians across the continent.',
    correction: 'The sudden disappearance of the ancient manuscript baffled historians across the continent.',
    explanation: 'We add both the negative prefix "dis-" and the noun suffix "-ance" to "appear" to form "disappearance".',
    grammarPhrase: 'The sudden disappearance',
    baseWord: 'APPEAR',
    correctAnswer: 'disappearance',
    acceptedAnswers: ['disappearance'],
  },
  {
    topic: 'Collocations',
    level: 'C1',
    text: 'The committee expressed its _____ gratitude to the volunteers who worked through the night.',
    correction: 'The committee expressed its heartfelt gratitude to the volunteers who worked through the night.',
    explanation: '"Heartfelt gratitude" is an advanced C1 collocation formed by compounding "heart" with "felt".',
    grammarPhrase: 'its heartfelt gratitude',
    baseWord: 'HEART',
    correctAnswer: 'heartfelt',
    acceptedAnswers: ['heartfelt'],
  },
  {
    topic: 'Reported Speech',
    level: 'C2',
    text: 'The senator dismissed the allegations as completely _____ and demanded a formal retraction.',
    correction: 'The senator dismissed the allegations as completely unsubstantiated and demanded a formal retraction.',
    explanation: 'From "substance", we form the negative participial adjective "unsubstantiated" (not supported by evidence).',
    grammarPhrase: 'as completely unsubstantiated',
    baseWord: 'SUBSTANCE',
    correctAnswer: 'unsubstantiated',
    acceptedAnswers: ['unsubstantiated'],
  },
  {
    topic: 'Phrasal Verbs',
    level: 'C2',
    text: 'His _____ refusal to compromise ultimately alienated even his most loyal allies.',
    correction: 'His obstinate refusal to compromise ultimately alienated even his most loyal allies.',
    explanation: 'Before the noun "refusal", the abstract noun "obstinacy" shifts to the attributive adjective "obstinate".',
    grammarPhrase: 'His obstinate refusal',
    baseWord: 'OBSTINACY',
    correctAnswer: 'obstinate',
    acceptedAnswers: ['obstinate'],
  },
  {
    topic: 'Collocations',
    level: 'C2',
    text: 'The company faced _____ criticism after independent auditors uncovered widespread financial irregularities.',
    correction: 'The company facedunprecedented criticism after independent auditors uncovered widespread financial irregularities.'.replace('facedunprecedented', 'faced unprecedented'),
    explanation: '"Unprecedented criticism" is a high-register collocation formed with the negative prefix "un-" and suffix "-ed" from "precedent".',
    grammarPhrase: 'faced unprecedented criticism',
    baseWord: 'PRECEDENT',
    correctAnswer: 'unprecedented',
    acceptedAnswers: ['unprecedented'],
  },
];

interface CuratedKeyWordTransformationEntry {
  topic: string;
  level: CEFRLevel;
  leadInSentence: string;
  baseWord: string;
  text: string;
  correction: string;
  explanation: string;
  grammarPhrase: string;
  correctAnswer: string;
  acceptedAnswers: string[];
  mark1Parts: string[];
  mark2Parts: string[];
}

export const CURATED_KEY_WORD_TRANSFORMATION_BANK: CuratedKeyWordTransformationEntry[] = [
  // --- TENSES ---
  {
    topic: 'Tenses',
    level: 'A1',
    leadInSentence: 'Sarah started playing the piano three years ago.',
    baseWord: 'FOR',
    text: 'Sarah _____ three years.',
    correction: 'Sarah has played the piano for three years.',
    explanation: 'Use the present perfect ("has played the piano") + "for" to show an action that began in the past and continues up to now.',
    grammarPhrase: 'has played the piano for',
    correctAnswer: 'has played the piano for',
    acceptedAnswers: ['has played the piano for', 'has been playing the piano for', 'has played piano for'],
    mark1Parts: ['has played the piano', 'has been playing the piano', 'has played piano'],
    mark2Parts: ['for'],
  },
  {
    topic: 'Tenses',
    level: 'A2',
    leadInSentence: 'The last time I saw Marcus was in 2021.',
    baseWord: 'SEEN',
    text: 'I _____ 2021.',
    correction: 'I have not seen Marcus since 2021.',
    explanation: 'Transform "The last time I saw X was in..." into the negative present perfect ("have not seen X") + "since" + the starting point in time.',
    grammarPhrase: 'have not seen Marcus since',
    correctAnswer: 'have not seen Marcus since',
    acceptedAnswers: ['have not seen Marcus since', "haven't seen Marcus since"],
    mark1Parts: ['have not seen Marcus', "haven't seen Marcus"],
    mark2Parts: ['since'],
  },
  {
    topic: 'Tenses',
    level: 'B1',
    leadInSentence: 'This is the first time I have ever eaten sushi.',
    baseWord: 'NEVER',
    text: 'I _____ before.',
    correction: 'I have never eaten sushi before.',
    explanation: '"This is the first time I have ever..." corresponds to the present perfect with "never" ("have never eaten sushi") before "before".',
    grammarPhrase: 'have never eaten sushi',
    correctAnswer: 'have never eaten sushi',
    acceptedAnswers: ['have never eaten sushi', "'ve never eaten sushi", 'have never tried sushi'],
    mark1Parts: ['have never', "'ve never"],
    mark2Parts: ['eaten sushi', 'tried sushi'],
  },
  {
    topic: 'Tenses',
    level: 'B2',
    leadInSentence: 'When did they buy their country house?',
    baseWord: 'LONG',
    text: 'How _____ their country house?',
    correction: 'How long have they had their country house?',
    explanation: 'Questions about duration up to the present use "How long have they had / owned..." instead of the stative verb "buy".',
    grammarPhrase: 'long have they had',
    correctAnswer: 'long have they had',
    acceptedAnswers: ['long have they had', 'long have they owned'],
    mark1Parts: ['long have they'],
    mark2Parts: ['had', 'owned'],
  },
  {
    topic: 'Tenses',
    level: 'C1',
    leadInSentence: 'The train left the platform just before we reached the station.',
    baseWord: 'SOONER',
    text: 'No _____ the station than the train left the platform.',
    correction: 'No sooner had we reached the station than the train left the platform.',
    explanation: '"No sooner" at the start of a clause triggers past perfect auxiliary inversion ("sooner had we reached / arrived at") paired with "than".',
    grammarPhrase: 'sooner had we reached',
    correctAnswer: 'sooner had we reached',
    acceptedAnswers: ['sooner had we reached', 'sooner had we arrived at', 'sooner had we got to'],
    mark1Parts: ['sooner had we'],
    mark2Parts: ['reached', 'arrived at', 'got to'],
  },
  {
    topic: 'Tenses',
    level: 'C2',
    leadInSentence: 'We only realized how treacherous the mountain pass was after the blizzard began.',
    baseWord: 'DID',
    text: 'Not until the blizzard _____ how treacherous the mountain pass was.',
    correction: 'Not until the blizzard began did we realize how treacherous the mountain pass was.',
    explanation: 'Fronted "Not until + past clause" triggers subject-auxiliary inversion ("did we realize / realise") in the main clause.',
    grammarPhrase: 'began did we realize',
    correctAnswer: 'began did we realize',
    acceptedAnswers: ['began did we realize', 'began did we realise', 'started did we realize', 'started did we realise'],
    mark1Parts: ['began', 'started'],
    mark2Parts: ['did we realize', 'did we realise'],
  },

  // --- CONDITIONALS ---
  {
    topic: 'Conditionals',
    level: 'A2',
    leadInSentence: 'You will miss the bus if you do not leave right now.',
    baseWord: 'UNLESS',
    text: 'You will miss the bus _____ right now.',
    correction: 'You will miss the bus unless you leave right now.',
    explanation: '"Unless" means "if ... not" and takes an affirmative present simple verb ("unless you leave") in a first conditional.',
    grammarPhrase: 'unless you leave',
    correctAnswer: 'unless you leave',
    acceptedAnswers: ['unless you leave', 'unless you go'],
    mark1Parts: ['unless you'],
    mark2Parts: ['leave', 'go'],
  },
  {
    topic: 'Conditionals',
    level: 'B1',
    leadInSentence: 'I do not have enough free time, so I cannot learn Italian.',
    baseWord: 'WOULD',
    text: 'If I had more free time, _____ Italian.',
    correction: 'If I had more free time, I would learn Italian.',
    explanation: 'In a second conditional describing an unreal present situation, the main clause uses "I would + bare infinitive" ("I would learn").',
    grammarPhrase: 'I would learn',
    correctAnswer: 'I would learn',
    acceptedAnswers: ['I would learn', 'I would study'],
    mark1Parts: ['I would'],
    mark2Parts: ['learn', 'study'],
  },
  {
    topic: 'Conditionals',
    level: 'B2',
    leadInSentence: 'We got lost because we did not bring a map with us.',
    baseWord: 'HAVE',
    text: 'If we had brought a map with us, we _____ lost.',
    correction: 'If we had brought a map with us, we would not have got lost.',
    explanation: 'Third conditionals express unreal past outcomes using "would not have + past participle" ("would not have got / gotten").',
    grammarPhrase: 'would not have got',
    correctAnswer: 'would not have got',
    acceptedAnswers: [
      'would not have got',
      "wouldn't have got",
      'would not have gotten',
      "wouldn't have gotten",
    ],
    mark1Parts: ['would not have', "wouldn't have"],
    mark2Parts: ['got', 'gotten'],
  },
  {
    topic: 'Conditionals',
    level: 'C1',
    leadInSentence: 'Without the lifeguard’s swift intervention, the swimmer would have drowned.',
    baseWord: 'FOR',
    text: 'Had _____ the lifeguard’s swift intervention, the swimmer would have drowned.',
    correction: 'Had it not been for the lifeguard’s swift intervention, the swimmer would have drowned.',
    explanation: '"Had it not been for" is the inverted third-conditional equivalent of "Without" or "If it had not been for".',
    grammarPhrase: 'it not been for',
    correctAnswer: 'it not been for',
    acceptedAnswers: ['it not been for'],
    mark1Parts: ['it not been'],
    mark2Parts: ['for'],
  },

  // --- MODALS ---
  {
    topic: 'Modals',
    level: 'A2',
    leadInSentence: 'It is not necessary for visitors to book tickets in advance.',
    baseWord: 'HAVE',
    text: 'Visitors _____ book tickets in advance.',
    correction: 'Visitors do not have to book tickets in advance.',
    explanation: 'Lack of necessity is expressed with "do not have to" ("don\'t have to").',
    grammarPhrase: 'do not have to',
    correctAnswer: 'do not have to',
    acceptedAnswers: ['do not have to', "don't have to"],
    mark1Parts: ['do not', "don't"],
    mark2Parts: ['have to'],
  },
  {
    topic: 'Modals',
    level: 'B1',
    leadInSentence: 'I am sure that Clara is still at the office because her coat is here.',
    baseWord: 'MUST',
    text: 'Clara _____ at the office because her coat is here.',
    correction: 'Clara must still be at the office because her coat is here.',
    explanation: 'Present logical certainty ("I am sure that...") is expressed with the modal of deduction "must + bare infinitive" ("must still be" / "must be").',
    grammarPhrase: 'must still be',
    correctAnswer: 'must still be',
    acceptedAnswers: ['must still be', 'must be'],
    mark1Parts: ['must still'],
    mark2Parts: ['be'],
  },
  {
    topic: 'Modals',
    level: 'B2',
    leadInSentence: 'It was a mistake for you to lend Julian so much money.',
    baseWord: 'OUGHT',
    text: 'You _____ Julian so much money.',
    correction: 'You ought not to have lent Julian so much money.',
    explanation: 'Past criticism or regret with "ought" uses "ought not to have + past participle" ("ought not to have lent").',
    grammarPhrase: 'ought not to have lent',
    correctAnswer: 'ought not to have lent',
    acceptedAnswers: ['ought not to have lent'],
    mark1Parts: ['ought not to', "oughtn't to"],
    mark2Parts: ['have lent'],
  },
  {
    topic: 'Modals',
    level: 'C1',
    leadInSentence: 'It is impossible that Julian leaked the confidential report by accident.',
    baseWord: 'HAVE',
    text: 'Julian _____ the confidential report by accident.',
    correction: 'Julian cannot have leaked the confidential report by accident.',
    explanation: 'Negative certainty about a past action uses "cannot / can\'t / could not have + past participle".',
    grammarPhrase: 'cannot have leaked',
    correctAnswer: 'cannot have leaked',
    acceptedAnswers: ['cannot have leaked', "can't have leaked", 'could not have leaked', "couldn't have leaked"],
    mark1Parts: ['cannot have', "can't have", 'could not have', "couldn't have"],
    mark2Parts: ['leaked'],
  },

  // --- REPORTED SPEECH ---
  {
    topic: 'Reported Speech',
    level: 'B1',
    leadInSentence: '"Where did you park the rental car?" Elena asked me.',
    baseWord: 'HAD',
    text: 'Elena asked me where _____ the rental car.',
    correction: 'Elena asked me where I had parked the rental car.',
    explanation: 'Reported wh-questions use statement word order (subject before auxiliary) and backshift past simple to past perfect ("I had parked").',
    grammarPhrase: 'I had parked',
    correctAnswer: 'I had parked',
    acceptedAnswers: ['I had parked', 'I had left'],
    mark1Parts: ['I had'],
    mark2Parts: ['parked', 'left'],
  },
  {
    topic: 'Reported Speech',
    level: 'B2',
    leadInSentence: '"I did not copy the essay from the internet," Leo said.',
    baseWord: 'DENIED',
    text: 'Leo _____ the essay from the internet.',
    correction: 'Leo denied copying the essay from the internet.',
    explanation: 'The reporting verb "deny" is followed by a gerund ("denied copying" / "denied having copied") rather than an infinitive.',
    grammarPhrase: 'denied copying',
    correctAnswer: 'denied copying',
    acceptedAnswers: ['denied copying', 'denied having copied', 'denied that he had copied'],
    mark1Parts: ['denied'],
    mark2Parts: ['copying', 'having copied', 'that he had copied'],
  },
  {
    topic: 'Reported Speech',
    level: 'C1',
    leadInSentence: '"You really should consult a tax specialist before signing," my lawyer said to me.',
    baseWord: 'ADVISED',
    text: 'My lawyer _____ a tax specialist before signing.',
    correction: 'My lawyer advised me to consult a tax specialist before signing.',
    explanation: '"Advise" takes an object pronoun + full infinitive ("advised me to consult").',
    grammarPhrase: 'advised me to consult',
    correctAnswer: 'advised me to consult',
    acceptedAnswers: ['advised me to consult', 'advised me to see'],
    mark1Parts: ['advised me'],
    mark2Parts: ['to consult', 'to see'],
  },

  // --- PHRASAL VERBS ---
  {
    topic: 'Phrasal Verbs',
    level: 'B1',
    leadInSentence: 'The outdoor concert was cancelled because of the torrential rain.',
    baseWord: 'CALLED',
    text: 'The outdoor concert _____ because of the torrential rain.',
    correction: 'The outdoor concert was called off because of the torrential rain.',
    explanation: 'The phrasal verb "call off" means "cancel", used here in the past simple passive ("was called off").',
    grammarPhrase: 'was called off',
    correctAnswer: 'was called off',
    acceptedAnswers: ['was called off', 'got called off'],
    mark1Parts: ['was called', 'got called'],
    mark2Parts: ['off'],
  },
  {
    topic: 'Phrasal Verbs',
    level: 'B2',
    leadInSentence: 'I cannot tolerate the noise from the construction site any longer.',
    baseWord: 'PUT',
    text: 'I cannot _____ the noise from the construction site any longer.',
    correction: 'I cannot put up with the noise from the construction site any longer.',
    explanation: 'The three-part phrasal verb "put up with" means "tolerate" or "endure".',
    grammarPhrase: 'put up with',
    correctAnswer: 'put up with',
    acceptedAnswers: ['put up with'],
    mark1Parts: ['put up'],
    mark2Parts: ['with'],
  },
  {
    topic: 'Phrasal Verbs',
    level: 'C1',
    leadInSentence: 'Nobody could think of a workable solution to the supply crisis.',
    baseWord: 'COME',
    text: 'Nobody managed _____ a workable solution to the supply crisis.',
    correction: 'Nobody managed to come up with a workable solution to the supply crisis.',
    explanation: '"Manage" requires a to-infinitive ("to come"), and "come up with" means to think of or produce an idea or solution.',
    grammarPhrase: 'to come up with',
    correctAnswer: 'to come up with',
    acceptedAnswers: ['to come up with'],
    mark1Parts: ['to come'],
    mark2Parts: ['up with'],
  },

  // --- PREPOSITIONS & COLLOCATIONS ---
  {
    topic: 'Prepositions',
    level: 'B1',
    leadInSentence: 'My sister prefers reading historical novels to watching television.',
    baseWord: 'RATHER',
    text: 'My sister would _____ watch television.',
    correction: 'My sister would rather read historical novels than watch television.',
    explanation: '"Would rather + bare infinitive ... than + bare infinitive" expresses preference.',
    grammarPhrase: 'rather read historical novels than',
    correctAnswer: 'rather read historical novels than',
    acceptedAnswers: ['rather read historical novels than'],
    mark1Parts: ['rather read historical novels'],
    mark2Parts: ['than'],
  },
  {
    topic: 'Prepositions',
    level: 'B2',
    leadInSentence: 'Despite the heavy traffic, we arrived at the airport on time.',
    baseWord: 'SPITE',
    text: 'We arrived at the airport on time _____ the heavy traffic.',
    correction: 'We arrived at the airport on time in spite of the heavy traffic.',
    explanation: '"In spite of" is the three-word prepositional phrase equivalent of "despite".',
    grammarPhrase: 'in spite of',
    correctAnswer: 'in spite of',
    acceptedAnswers: ['in spite of'],
    mark1Parts: ['in spite'],
    mark2Parts: ['of'],
  },
  {
    topic: 'Collocations',
    level: 'B2',
    leadInSentence: 'She did not pay any attention to the safety instructions.',
    baseWord: 'NOTICE',
    text: 'She _____ the safety instructions.',
    correction: 'She took no notice of the safety instructions.',
    explanation: 'The fixed collocation "take no notice of" (or "did not take any notice of") means to pay no attention to.',
    grammarPhrase: 'took no notice of',
    correctAnswer: 'took no notice of',
    acceptedAnswers: ['took no notice of', 'did not take any notice of', "didn't take any notice of"],
    mark1Parts: ['took no', 'did not take any', "didn't take any"],
    mark2Parts: ['notice of'],
  },
  {
    topic: 'Collocations',
    level: 'C1',
    leadInSentence: "The new director doesn't plan to resign before her contract expires.",
    baseWord: 'INTENTION',
    text: 'The new director _____ before her contract expires.',
    correction: 'The new director has no intention of resigning before her contract expires.',
    explanation: '"Not plan to do something" becomes "have no intention of + -ing": the noun "intention" takes the preposition "of" followed by a gerund.',
    grammarPhrase: 'has no intention of resigning',
    correctAnswer: 'has no intention of resigning',
    acceptedAnswers: ['has no intention of resigning', 'has no intention of stepping down', 'has no intention of quitting'],
    mark1Parts: ['has no intention'],
    mark2Parts: ['of resigning', 'of stepping down', 'of quitting'],
  },
  {
    topic: 'Articles',
    level: 'B1',
    leadInSentence: 'As you practice more, playing scales becomes easier.',
    baseWord: 'THE',
    text: 'The more you practice, _____ playing scales becomes.',
    correction: 'The more you practice, the easier playing scales becomes.',
    explanation: 'Double comparatives ("The more..., the easier...") require the definite article "the" before both comparative clauses.',
    grammarPhrase: 'the easier',
    correctAnswer: 'the easier',
    acceptedAnswers: ['the easier'],
    mark1Parts: ['the'],
    mark2Parts: ['easier'],
  },
  // --- PASSIVE VOICE (Varied Tenses & Constructions) ---
  {
    topic: 'Passive Voice',
    level: 'A2',
    leadInSentence: 'A famous Italian architect designed the city museum in 1925.',
    baseWord: 'BY',
    text: 'The city museum _____ a famous Italian architect in 1925.',
    correction: 'The city museum was designed by a famous Italian architect in 1925.',
    explanation: 'Use the past simple passive ("was designed") + the agent preposition "by".',
    grammarPhrase: 'was designed by',
    correctAnswer: 'was designed by',
    acceptedAnswers: ['was designed by'],
    mark1Parts: ['was designed'],
    mark2Parts: ['by'],
  },
  {
    topic: 'Passive Voice',
    level: 'B1',
    leadInSentence: 'Sound engineers are currently remixing the band\'s debut album in London.',
    baseWord: 'BEING',
    text: 'The band\'s debut album _____ in London right now.',
    correction: 'The band\'s debut album is currently being remixed in London right now.',
    explanation: 'Transform the present continuous active into the present continuous passive ("is currently being remixed" or "is being remixed").',
    grammarPhrase: 'is currently being remixed',
    correctAnswer: 'is currently being remixed',
    acceptedAnswers: ['is currently being remixed', 'is being remixed'],
    mark1Parts: ['is currently being', 'is being'],
    mark2Parts: ['remixed'],
  },
  {
    topic: 'Passive Voice',
    level: 'B1',
    leadInSentence: 'More than two million gamers have downloaded the indie expansion pack this week.',
    baseWord: 'BEEN',
    text: 'The indie expansion pack _____ more than two million gamers this week.',
    correction: 'The indie expansion pack has been downloaded by more than two million gamers this week.',
    explanation: 'Use the present perfect passive ("has been downloaded") followed by "by" to introduce the agent.',
    grammarPhrase: 'has been downloaded by',
    correctAnswer: 'has been downloaded by',
    acceptedAnswers: ['has been downloaded by'],
    mark1Parts: ['has been downloaded'],
    mark2Parts: ['by'],
  },
  {
    topic: 'Passive Voice',
    level: 'B2',
    leadInSentence: 'Film critics say that the director shot the entire thriller on vintage 35mm film.',
    baseWord: 'SAID',
    text: 'The director _____ the entire thriller on vintage 35mm film.',
    correction: 'The director is said to have shot the entire thriller on vintage 35mm film.',
    explanation: 'Use the impersonal reporting passive ("is said") + the perfect infinitive ("to have shot") for a past action.',
    grammarPhrase: 'is said to have shot',
    correctAnswer: 'is said to have shot',
    acceptedAnswers: ['is said to have shot', 'is said to have filmed'],
    mark1Parts: ['is said'],
    mark2Parts: ['to have shot', 'to have filmed'],
  },
  {
    topic: 'Passive Voice',
    level: 'B2',
    leadInSentence: 'A professional costume designer is altering the lead singer\'s jacket before the broadcast.',
    baseWord: 'HAVING',
    text: 'The lead singer _____ before the broadcast.',
    correction: 'The lead singer is having his jacket altered before the broadcast.',
    explanation: 'Use the present continuous causative structure "is having + object + past participle" ("is having his/her jacket altered").',
    grammarPhrase: 'is having his jacket altered',
    correctAnswer: 'is having his jacket altered',
    acceptedAnswers: [
      'is having his jacket altered',
      'is having her jacket altered',
      'is having their jacket altered',
    ],
    mark1Parts: ['is having'],
    mark2Parts: ['his jacket altered', 'her jacket altered', 'their jacket altered'],
  },
  {
    topic: 'Passive Voice',
    level: 'B2',
    leadInSentence: 'Someone had leaked the final episode\'s script online before the season premiere.',
    baseWord: 'BEEN',
    text: 'The final episode\'s script _____ online before the season premiere.',
    correction: 'The final episode\'s script had been leaked online before the season premiere.',
    explanation: 'Use the past perfect passive ("had been leaked") to show an action completed before another past point.',
    grammarPhrase: 'had been leaked',
    correctAnswer: 'had been leaked',
    acceptedAnswers: ['had been leaked', 'had already been leaked'],
    mark1Parts: ['had been', 'had already been'],
    mark2Parts: ['leaked'],
  },
  {
    topic: 'Passive Voice',
    level: 'B2',
    leadInSentence: 'The studio ought to have credited the voice actors in the opening titles.',
    baseWord: 'SHOULD',
    text: 'The voice actors _____ in the opening titles.',
    correction: 'The voice actors should have been credited in the opening titles.',
    explanation: 'Transform "ought to have + past participle" into the modal perfect passive ("should have been credited").',
    grammarPhrase: 'should have been credited',
    correctAnswer: 'should have been credited',
    acceptedAnswers: ['should have been credited'],
    mark1Parts: ['should have been'],
    mark2Parts: ['credited'],
  },
  {
    topic: 'Passive Voice',
    level: 'B2',
    leadInSentence: 'Famous celebrities often hate it when paparazzi photograph them at the airport.',
    baseWord: 'BEING',
    text: 'Famous celebrities often hate _____ paparazzi at the airport.',
    correction: 'Famous celebrities often hate being photographed by paparazzi at the airport.',
    explanation: 'After verbs like "hate", use the passive gerund ("being photographed") + "by" to express a passive action.',
    grammarPhrase: 'being photographed by',
    correctAnswer: 'being photographed by',
    acceptedAnswers: ['being photographed by'],
    mark1Parts: ['being photographed'],
    mark2Parts: ['by'],
  },
  {
    topic: 'Passive Voice',
    level: 'B2',
    leadInSentence: 'Technicians were still calibrating the stage microphones when the audience arrived.',
    baseWord: 'BEING',
    text: 'The stage microphones _____ when the audience arrived.',
    correction: 'The stage microphones were still being calibrated when the audience arrived.',
    explanation: 'Use the past continuous passive ("were still being calibrated") for an action in progress when interrupted in the past.',
    grammarPhrase: 'were still being calibrated',
    correctAnswer: 'were still being calibrated',
    acceptedAnswers: ['were still being calibrated', 'were being calibrated'],
    mark1Parts: ['were still being', 'were being'],
    mark2Parts: ['calibrated'],
  },
  {
    topic: 'Passive Voice',
    level: 'B2',
    leadInSentence: 'Everyone expects the animated sequel to break box-office records next month.',
    baseWord: 'EXPECTED',
    text: 'The animated sequel _____ box-office records next month.',
    correction: 'The animated sequel is expected to break box-office records next month.',
    explanation: 'Use the passive reporting verb "is expected" followed by the to-infinitive ("to break").',
    grammarPhrase: 'is expected to break',
    correctAnswer: 'is expected to break',
    acceptedAnswers: ['is expected to break'],
    mark1Parts: ['is expected'],
    mark2Parts: ['to break'],
  },
  {
    topic: 'Passive Voice',
    level: 'B2',
    leadInSentence: 'By Friday, the editors will have finalized all twelve podcast episodes.',
    baseWord: 'BEEN',
    text: 'By Friday, all twelve podcast episodes _____ by the editors.',
    correction: 'By Friday, all twelve podcast episodes will have been finalized by the editors.',
    explanation: 'Use the future perfect passive ("will have been finalized" / "will have been finalised") for completion before a future deadline.',
    grammarPhrase: 'will have been finalized',
    correctAnswer: 'will have been finalized',
    acceptedAnswers: ['will have been finalized', 'will have been finalised'],
    mark1Parts: ['will have been'],
    mark2Parts: ['finalized', 'finalised'],
  },
  {
    topic: 'Passive Voice',
    level: 'C1',
    leadInSentence: 'Journalists rumour that the graphic novelist is negotiating a three-series streaming deal.',
    baseWord: 'RUMOURED',
    text: 'The graphic novelist _____ a three-series streaming deal.',
    correction: 'The graphic novelist is rumoured to be negotiating a three-series streaming deal.',
    explanation: 'Use the impersonal passive "is rumoured" + the continuous infinitive ("to be negotiating") for an ongoing action.',
    grammarPhrase: 'is rumoured to be negotiating',
    correctAnswer: 'is rumoured to be negotiating',
    acceptedAnswers: ['is rumoured to be negotiating'],
    mark1Parts: ['is rumoured'],
    mark2Parts: ['to be negotiating'],
  },
  {
    topic: 'Passive Voice',
    level: 'C1',
    leadInSentence: 'Nobody had informed the screenwriter that the studio was rewriting her dialogue.',
    baseWord: 'BEING',
    text: 'The screenwriter had not been informed about _____ by the studio.',
    correction: 'The screenwriter had not been informed about her dialogue being rewritten by the studio.',
    explanation: 'After the preposition "about", use the possessive + passive gerund ("her dialogue being rewritten").',
    grammarPhrase: 'her dialogue being rewritten',
    correctAnswer: 'her dialogue being rewritten',
    acceptedAnswers: ['her dialogue being rewritten'],
    mark1Parts: ['her dialogue'],
    mark2Parts: ['being rewritten'],
  },
];

export function getStaticBankCounts(): {
  binaryCount: number;
  clozeCount: number;
  wordFormationCount: number;
  keyWordTransformationCount: number;
  totalCount: number;
} {
  return {
    binaryCount: CURATED_SENTENCE_BANK.length,
    clozeCount: CURATED_CLOZE_BANK.length,
    wordFormationCount: CURATED_WORD_FORMATION_BANK.length,
    keyWordTransformationCount: CURATED_KEY_WORD_TRANSFORMATION_BANK.length,
    totalCount:
      CURATED_SENTENCE_BANK.length +
      CURATED_CLOZE_BANK.length +
      CURATED_WORD_FORMATION_BANK.length +
      CURATED_KEY_WORD_TRANSFORMATION_BANK.length,
  };
}

interface BankEntryBase {
  topic: string;
  level: CEFRLevel;
  text: string;
  correction?: string;
  leadInSentence?: string;
}

/**
 * Picks a random entry from the first non-empty tier.
 *
 * Fallback order when the bank runs dry (the level is kept for as long as possible):
 *   1. same level + same topic + any extra filters (e.g. valid/flawed balance), not yet played
 *   2. same level + same topic, not yet played
 *   3. same level + any topic, not yet played
 *   4. same level + same topic, repeats allowed
 *   5. same level + any topic, repeats allowed
 *   6. same topic at any level, not yet played (only if the level has no items at all)
 *   7. anything
 * Returns the entry plus whether the topic had to be switched, so the UI can say so.
 */
function pickKeepingLevel<T extends BankEntryBase>(
  bank: T[],
  settings: Pick<Settings, 'topic' | 'level'>,
  pastTextSet: Set<string>,
  extraFilters: ((entry: T) => boolean)[] = []
): { entry: T | undefined; topicSwitched: boolean } {
  const { topic, level } = settings;
  const hasTopic = Boolean(topic) && topic !== 'My own choice';
  const topicLower = (topic || '').trim().toLowerCase();
  const sameTopic = (e: T) => {
    if (!hasTopic) return true;
    const entryTopicLower = e.topic.toLowerCase();
    if (entryTopicLower === topicLower) return true;
    if (topicLower.includes('passive') && entryTopicLower === 'passive voice') return true;
    return false;
  };
  const sameLevel = (e: T) => !level || e.level === level;
  const pastTextList = Array.from(pastTextSet);
  const unplayed = (e: T) => {
    const tNorm = e.text.trim().toLowerCase();
    if (pastTextSet.has(tNorm)) return false;
    const cNorm = e.correction?.trim().toLowerCase();
    const lNorm = e.leadInSentence?.trim().toLowerCase();
    return !pastTextList.some(
      past =>
        past.includes(tNorm) ||
        (cNorm ? past.includes(cNorm) : false) ||
        (lNorm ? past.includes(lNorm) : false)
    );
  };
  const extras = (e: T) => extraFilters.every(f => f(e));

  const tiers: { filter: (e: T) => boolean; keepsTopic: boolean }[] = [
    { filter: e => sameLevel(e) && sameTopic(e) && unplayed(e) && extras(e), keepsTopic: true },
    { filter: e => sameLevel(e) && sameTopic(e) && unplayed(e), keepsTopic: true },
    { filter: e => sameLevel(e) && unplayed(e) && extras(e), keepsTopic: false },
    { filter: e => sameLevel(e) && unplayed(e), keepsTopic: false },
    { filter: e => sameLevel(e) && sameTopic(e), keepsTopic: true },
    { filter: e => sameLevel(e), keepsTopic: false },
    { filter: e => sameTopic(e) && unplayed(e), keepsTopic: true },
    { filter: () => true, keepsTopic: false },
  ];

  for (const tier of tiers) {
    const candidates = bank.filter(tier.filter);
    if (candidates.length > 0) {
      const entry = candidates[Math.floor(Math.random() * candidates.length)];
      return { entry, topicSwitched: hasTopic && !tier.keepsTopic && !sameTopic(entry) };
    }
  }
  return { entry: undefined, topicSwitched: false };
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
    (challengeFormat === 'multipleChoice' ||
    challengeFormat === 'openCloze' ||
    challengeFormat === 'wordFormation' ||
    challengeFormat === 'keyWordTransformation' ||
    challengeFormat === 'binary'
      ? challengeFormat
      : (['binary', 'multipleChoice', 'openCloze', 'wordFormation', 'keyWordTransformation'] as QuestionType[])[
          Math.floor(Math.random() * 5)
        ]);

  const pastTextSet = new Set(pastSentences.map(s => s.trim().toLowerCase()));
  const cloudEntries = getDynamicCloudEntries();

  if (resolvedType === 'keyWordTransformation') {
    const cloudKwt: CuratedKeyWordTransformationEntry[] = cloudEntries
      .filter(
        c =>
          c.questionType === 'keyWordTransformation' &&
          c.text &&
          c.correctAnswer &&
          c.baseWord &&
          c.leadInSentence
      )
      .map(c => ({
        topic: c.topic || 'General',
        level: (c.level as CEFRLevel) || 'B1',
        leadInSentence: String(c.leadInSentence),
        baseWord: String(c.baseWord).toUpperCase(),
        text: c.text,
        correction: c.correction || c.text,
        explanation: c.explanation || '',
        grammarPhrase: c.grammarPhrase || '',
        correctAnswer: c.correctAnswer!,
        acceptedAnswers:
          Array.isArray(c.acceptedAnswers) && c.acceptedAnswers.length > 0 ? c.acceptedAnswers : [c.correctAnswer!],
        mark1Parts: Array.isArray(c.mark1Parts) ? c.mark1Parts : [],
        mark2Parts: Array.isArray(c.mark2Parts) ? c.mark2Parts : [],
      }));

    const combinedKwtBank = [...cloudKwt, ...CURATED_KEY_WORD_TRANSFORMATION_BANK];

    const kwtPick = pickKeepingLevel(combinedKwtBank, settings, pastTextSet);
    const picked = kwtPick.entry || CURATED_KEY_WORD_TRANSFORMATION_BANK[0];
    return {
      text: picked.text,
      leadInSentence: picked.leadInSentence,
      isCorrect: true,
      correction: picked.correction,
      explanation: picked.explanation,
      grammarPhrase: picked.grammarPhrase,
      errorPhrase: '',
      mistakeType: '',
      questionType: 'keyWordTransformation',
      bankTopic: kwtPick.topicSwitched ? picked.topic : undefined,
      baseWord: picked.baseWord,
      correctAnswer: picked.correctAnswer,
      acceptedAnswers: picked.acceptedAnswers,
      mark1Parts: picked.mark1Parts,
      mark2Parts: picked.mark2Parts,
    };
  }

  if (resolvedType === 'wordFormation') {
    const cloudWf: CuratedWordFormationEntry[] = cloudEntries
      .filter(c => c.questionType === 'wordFormation' && c.text && c.correctAnswer && c.baseWord)
      .map(c => ({
        topic: c.topic || 'General',
        level: (c.level as CEFRLevel) || 'B1',
        text: c.text,
        correction: c.correction || c.text,
        explanation: c.explanation || '',
        grammarPhrase: c.grammarPhrase || '',
        baseWord: String(c.baseWord).toUpperCase(),
        correctAnswer: c.correctAnswer,
        acceptedAnswers:
          Array.isArray(c.acceptedAnswers) && c.acceptedAnswers.length > 0 ? c.acceptedAnswers : [c.correctAnswer],
      }));

    const combinedWfBank = [...cloudWf, ...CURATED_WORD_FORMATION_BANK];

    const wfPick = pickKeepingLevel(combinedWfBank, settings, pastTextSet);
    const picked = wfPick.entry || CURATED_WORD_FORMATION_BANK[0];
    return {
      text: picked.text,
      isCorrect: true,
      correction: picked.correction,
      explanation: picked.explanation,
      grammarPhrase: picked.grammarPhrase,
      errorPhrase: '',
      mistakeType: '',
      questionType: 'wordFormation',
      bankTopic: wfPick.topicSwitched ? picked.topic : undefined,
      baseWord: picked.baseWord,
      correctAnswer: picked.correctAnswer,
      acceptedAnswers: picked.acceptedAnswers,
    };
  }

  if (resolvedType === 'multipleChoice' || resolvedType === 'openCloze') {
    const cloudCloze: CuratedClozeEntry[] = cloudEntries
      .filter(
        c =>
          (c.questionType === 'multipleChoice' || c.questionType === 'openCloze') &&
          c.text &&
          c.correctAnswer &&
          (resolvedType !== 'multipleChoice' || (Array.isArray(c.options) && c.options.length >= 2))
      )
      .map(c => ({
        topic: c.topic || 'General',
        level: (c.level as CEFRLevel) || 'B1',
        text: c.text,
        correction: c.correction || c.text,
        explanation: c.explanation || '',
        grammarPhrase: c.grammarPhrase || '',
        correctAnswer: c.correctAnswer,
        acceptedAnswers: Array.isArray(c.acceptedAnswers) && c.acceptedAnswers.length > 0 ? c.acceptedAnswers : [c.correctAnswer],
        options: Array.isArray(c.options) && c.options.length >= 2 ? c.options : [c.correctAnswer, 'that', 'which', 'what'],
      }));

    const combinedClozeBank = [...cloudCloze, ...CURATED_CLOZE_BANK];

    const clozePick = pickKeepingLevel(combinedClozeBank, settings, pastTextSet);
    const picked = clozePick.entry || CURATED_CLOZE_BANK[0];
    return {
      text: picked.text,
      isCorrect: true,
      correction: picked.correction,
      explanation: picked.explanation,
      grammarPhrase: picked.grammarPhrase,
      errorPhrase: '',
      mistakeType: '',
      questionType: resolvedType,
      bankTopic: clozePick.topicSwitched ? picked.topic : undefined,
      correctAnswer: picked.correctAnswer,
      acceptedAnswers: picked.acceptedAnswers,
      options: resolvedType === 'multipleChoice' ? shuffleArray(picked.options) : undefined,
    };
  }

  const cloudBinary: CuratedEntry[] = cloudEntries
    .filter(c => (!c.questionType || c.questionType === 'binary') && c.text)
    .map(c => ({
      topic: c.topic || 'General',
      level: (c.level as CEFRLevel) || 'B1',
      subtype: c.subtype || undefined,
      text: c.text,
      isCorrect: Boolean(c.isCorrect),
      correction: c.correction || c.text,
      explanation: c.explanation || '',
      grammarPhrase: c.grammarPhrase || '',
      errorPhrase: c.errorPhrase || '',
      mistakeType: c.mistakeType || '',
    }));

  const combinedBinaryBank = [...cloudBinary, ...CURATED_SENTENCE_BANK];
  const pastMistakesSet = new Set(pastMistakes.map(m => m.trim().toLowerCase()));

  const binaryPick = pickKeepingLevel(combinedBinaryBank, settings, pastTextSet, [
    entry => forceCorrect === null || entry.isCorrect === forceCorrect,
    entry => !subtype || !entry.subtype || entry.subtype.toLowerCase() === subtype.toLowerCase(),
    entry =>
      entry.isCorrect || !entry.errorPhrase || !pastMistakesSet.has(entry.errorPhrase.trim().toLowerCase()),
  ]);
  const selected = binaryPick.entry || CURATED_SENTENCE_BANK[0];

  return {
    text: selected.text,
    isCorrect: selected.isCorrect,
    correction: selected.correction,
    explanation: selected.explanation,
    grammarPhrase: selected.grammarPhrase,
    errorPhrase: selected.errorPhrase,
    mistakeType: selected.mistakeType,
    questionType: 'binary',
    bankTopic: binaryPick.topicSwitched ? selected.topic : undefined,
  };
}
