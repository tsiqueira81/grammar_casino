import { CEFRLevel } from '../types';

export interface CefrTopicRuleSpec {
  topic: string;
  level: CEFRLevel;
  /** Short 1-line summary shown in the Teacher Table Setup Curriculum Inspector */
  classroomSummary: string;
  /** Specific Cambridge English Grammar Profile (EGP) structures allowed at this level */
  allowedStructures: string[];
  /** Structures strictly forbidden because they belong to higher CEFR levels */
  forbiddenAboveLevel: string[];
  /** Authentic learner error mechanisms (ERRANT / Write & Improve style) for Binary & Cloze traps */
  signatureErrorTraps: string[];
}

export type CanonicalGrammarTopic =
  | 'Tenses'
  | 'Prepositions'
  | 'Articles'
  | 'Conditionals'
  | 'Modals'
  | 'Phrasal Verbs'
  | 'Reported Speech'
  | 'Collocations';

export const CANONICAL_GRAMMAR_TOPICS: CanonicalGrammarTopic[] = [
  'Tenses',
  'Prepositions',
  'Articles',
  'Conditionals',
  'Modals',
  'Phrasal Verbs',
  'Reported Speech',
  'Collocations',
];

export const CEFR_GRAMMAR_MATRIX: Record<CanonicalGrammarTopic, Record<CEFRLevel, CefrTopicRuleSpec>> = {
  Tenses: {
    A1: {
      topic: 'Tenses',
      level: 'A1',
      classroomSummary: 'Present Simple (be/have/routine verbs), Present Continuous (now), and Past Simple of "be".',
      allowedStructures: [
        'Present Simple affirmative, negative (don\'t/doesn\'t), and questions with frequency adverbs (always, usually, never)',
        'Present Continuous for actions happening right now (am/is/are + -ing)',
        'Past Simple of "be" (was/were) with yesterday or last night',
      ],
      forbiddenAboveLevel: [
        'Present Perfect (have/has + V3)',
        'Past Perfect (had + V3)',
        'Past Continuous (was/were + -ing)',
        'Future Perfect or Future Continuous',
        'Passive voice',
      ],
      signatureErrorTraps: [
        '3rd-person singular missing -s or auxiliary agreement ("She have two brothers", "He don\'t work here")',
        'Missing auxiliary "be" in Present Continuous ("They playing football now")',
        'Using "was" with plural pronouns ("We was at home yesterday")',
      ],
    },
    A2: {
      topic: 'Tenses',
      level: 'A2',
      classroomSummary: 'Past Simple (regular/irregular), Past Continuous vs. Past Simple, "going to" / "will" future, and basic Present Perfect (ever/never).',
      allowedStructures: [
        'Past Simple affirmative, negative (didn\'t + bare infinitive), and irregular past forms (went, bought, saw)',
        'Past Continuous interrupted by Past Simple with "when" or "while"',
        'Future plans with "be going to" vs. predictions/promises with "will"',
        'Introductory Present Perfect for life experience with "ever" and "never"',
      ],
      forbiddenAboveLevel: [
        'Past Perfect Continuous (had been + -ing)',
        'Future Perfect (will have + V3)',
        'Present Perfect Continuous (have been + -ing)',
      ],
      signatureErrorTraps: [
        'Double past marking after didn\'t ("She didn\'t went to school", "Did you saw him?")',
        'Over-regularized irregular past tense ("buyed", "maked", "eated")',
        'Using Present Simple instead of Past Simple with finished past time ("I go to Paris last year")',
      ],
    },
    B1: {
      topic: 'Tenses',
      level: 'B1',
      classroomSummary: 'Present Perfect vs. Past Simple (for/since/already/yet), Present Perfect Continuous, Past Perfect, and "used to".',
      allowedStructures: [
        'Present Perfect vs. Past Simple contrast with finished vs. unfinished time markers (since, for, just, already, yet, ago)',
        'Present Perfect Continuous for ongoing duration (have/has been + -ing)',
        'Past Perfect (had + V3) for an action completed before another past event',
        '"used to + infinitive" for discontinued past habits and states',
      ],
      forbiddenAboveLevel: [
        'Future Perfect Continuous (will have been + -ing)',
        'Inverted Past Perfect ("Hardly had I...")',
      ],
      signatureErrorTraps: [
        'Using Present Perfect with a specific finished past time marker ("I have arrived yesterday", "We have met in 2021")',
        'Using Present Simple instead of Present Perfect for duration up to now ("I live here since five years")',
        'Confusing "used to do" with "be used to doing"',
      ],
    },
    B2: {
      topic: 'Tenses',
      level: 'B2',
      classroomSummary: 'Narrative tense sequencing (Past Perfect Continuous), Future Continuous & Future Perfect ("by the time"), and stative vs. dynamic verbs.',
      allowedStructures: [
        'Past Perfect Continuous (had been + -ing) showing cause or duration before a past point',
        'Future Continuous (will be + -ing) and Future Perfect (will have + V3) with "by next month / by the time"',
        'Stative verbs with meaning shifts in continuous aspect (thinking vs. think, having vs. have, seeing vs. see)',
        '"be/get used to + -ing" vs. "used to + bare infinitive"',
      ],
      forbiddenAboveLevel: [
        'Archaic subjunctive tense forms',
      ],
      signatureErrorTraps: [
        'Using "will" inside future time clauses after "by the time / as soon as / until" ("By the time she will arrive, we will have left")',
        'Using progressive aspect with permanent stative verbs ("She is knowing the answer", "This box is containing tools")',
        'Using bare infinitive after "be used to" ("I am used to wake up early")',
      ],
    },
    C1: {
      topic: 'Tenses',
      level: 'C1',
      classroomSummary: 'Future Perfect Continuous, Future in the Past ("was about to / was to have"), "It\'s high time + Past", and perfect infinitives/participles.',
      allowedStructures: [
        'Future Perfect Continuous (will have been + -ing) for projected duration',
        'Future in the past (was/were about to, was/were due to, was/were to have + V3)',
        'Unreal past tense after "It\'s (high) time", "would rather + subject + past tense"',
        'Perfect participle clauses ("Having completed the audit, she...")',
      ],
      forbiddenAboveLevel: [],
      signatureErrorTraps: [
        'Using Present Simple or infinitive after "It\'s high time" + subject ("It\'s high time we leave" -> "left" or "had left")',
        'Using Present Perfect instead of Past Perfect after "would rather" for past regret ("I\'d rather you didn\'t tell him yesterday" -> "hadn\'t told")',
        'Faulty tense sequencing in "was to have + V3" unfulfilled past plans',
      ],
    },
    C2: {
      topic: 'Tenses',
      level: 'C2',
      classroomSummary: 'Subtle aspectual contrasts, Historic Present shifts, negative inversion with perfect aspects ("No sooner had... than"), and mandative subjunctive.',
      allowedStructures: [
        'Negative adverbial inversion with Past Perfect ("No sooner had... than", "Hardly/Scarcely had... when", "Not until... did")',
        'Mandative subjunctive vs. putative "should" ("insisted that he be/not be..." vs. indicative tense)',
        'Delicate aspectual distinctions between perfect infinitives ("seem to have forgotten" vs. "seem to have been forgetting")',
      ],
      forbiddenAboveLevel: [],
      signatureErrorTraps: [
        'Pairing "No sooner had..." with "when" instead of "than", or failing to invert auxiliary ("No sooner she had sat down...")',
        'Using past indicative instead of bare subjunctive after formal demand verbs ("The judge ordered that the witness was removed" -> "be removed")',
      ],
    },
  },

  Prepositions: {
    A1: {
      topic: 'Prepositions',
      level: 'A1',
      classroomSummary: 'Basic place (in, on, under, next to, behind) and basic time prepositions (at 5 o\'clock, on Monday, in July).',
      allowedStructures: [
        'Prepositions of time: at (clock times, night), on (days of the week), in (months, years, morning/afternoon)',
        'Prepositions of place and movement: in, on, at, under, next to, between, to, from',
      ],
      forbiddenAboveLevel: [
        'Complex multi-word prepositions (in accordance with, by virtue of, notwithstanding)',
        'Advanced dependent prepositions on abstract C1 nouns',
      ],
      signatureErrorTraps: [
        'Using "in" with days of the week ("in Monday" -> "on Monday")',
        'Using "at" with months or years ("at July" -> "in July")',
        'Adding "to" before "home" ("go to home" -> "go home")',
      ],
    },
    A2: {
      topic: 'Prepositions',
      level: 'A2',
      classroomSummary: 'Movement prepositions (into, out of, across, through), transport (by bus vs. on foot), and high-frequency adjective + preposition pairs.',
      allowedStructures: [
        'Transport prepositions: by car/train/plane vs. on foot, in a car vs. on a bus/train',
        'Common adjective + preposition combinations: good at, afraid of, interested in, worried about, married to',
        'Duration prepositions: for (a period) vs. during (a named event)',
      ],
      forbiddenAboveLevel: [
        'Formal legal/academic complex prepositions (pursuant to, irrespective of)',
      ],
      signatureErrorTraps: [
        'Saying "by foot" instead of "on foot"',
        'Saying "married with" instead of "married to", or "interested on" instead of "interested in"',
        'Using "during" with a number of hours/days ("during three hours" -> "for three hours")',
      ],
    },
    B1: {
      topic: 'Prepositions',
      level: 'B1',
      classroomSummary: 'Dependent prepositions after verbs/adjectives (depend on, apologize for, keen on, responsible for) and time boundaries (until vs. by).',
      allowedStructures: [
        'Verb + dependent preposition: depend on, belong to, apologize for, succeed in, consist of, approve of',
        'Adjective + dependent preposition: keen on, proud of, responsible for, similar to, different from',
        'Contrast between "by" (deadline) and "until" (continuous duration up to a point)',
      ],
      forbiddenAboveLevel: [
        'C2 archaic/literary prepositional inversions',
      ],
      signatureErrorTraps: [
        'Using "depend of" instead of "depend on", or "consist in/from" instead of "consist of"',
        'Confusing "until" and "by" ("Please submit the report until Friday" -> "by Friday")',
        'Adding an unnecessary preposition after transitive verbs ("discuss about", "enter into the room", "marry with")',
      ],
    },
    B2: {
      topic: 'Prepositions',
      level: 'B2',
      classroomSummary: 'Complex prepositional phrases (in spite of, on behalf of, in terms of) and Verb + Object + Preposition + -ing patterns.',
      allowedStructures: [
        'Multi-word prepositions: in spite of, despite, on behalf of, in charge of, with regard to, in favour of, instead of',
        'Verb + object + preposition + gerund: accuse someone of, prevent someone from, congratulate someone on, blame someone for',
        'Noun + dependent preposition: increase in, solution to, reason for, impact on, attitude towards',
      ],
      forbiddenAboveLevel: [],
      signatureErrorTraps: [
        'Writing "despite of" instead of "despite" or "in spite of"',
        'Using "prevent to do" instead of "prevent from doing", or "accuse for" instead of "accuse of"',
        'Using "solution of" instead of "solution to", or "increase of" (for rate/number) instead of "increase in"',
      ],
    },
    C1: {
      topic: 'Prepositions',
      level: 'C1',
      classroomSummary: 'Advanced academic dependent prepositions (comply with, attribute to, devoid of, prone to) and formal prepositional phrases (in accordance with).',
      allowedStructures: [
        'Advanced adjective/verb + preposition: devoid of, prone to, impervious to, compatible with, comply with, adhere to, refrain from, culminate in',
        'Formal complex prepositions: in accordance with, by virtue of, in light of, at the expense of, prior to, subsequent to',
      ],
      forbiddenAboveLevel: [],
      signatureErrorTraps: [
        'Saying "comply to" instead of "comply with", or "adhere with" instead of "adhere to"',
        'Saying "devoid from" instead of "devoid of", or "culminate with" instead of "culminate in"',
        'Confusing "to + gerund" vs. "to + infinitive" after expressions like "be accustomed to", "be committed to", "with a view to"',
      ],
    },
    C2: {
      topic: 'Prepositions',
      level: 'C2',
      classroomSummary: 'High-register idiomatic prepositional phrases (at odds with, Tantamount to, in lieu of, irrespective of) and formal relative clause fronting ("under which").',
      allowedStructures: [
        'Erudite adjective/noun + preposition: tantamount to, incumbent upon, oblivious to, indicative of, commensurate with, contingent on',
        'Formal fronted prepositions in relative clauses ("the charter under which", "the principles upon which", "the extent to which")',
      ],
      forbiddenAboveLevel: [],
      signatureErrorTraps: [
        'Using "tantamount with" instead of "tantamount to", or "commensurate to" instead of "commensurate with"',
        'Doubling the preposition at both ends of a relative clause ("the treaty under which they operated under")',
      ],
    },
  },

  Articles: {
    A1: {
      topic: 'Articles',
      level: 'A1',
      classroomSummary: 'Indefinite "a" vs. "an" (vowel/consonant sounds), singular countable nouns, and basic "the" for unique/known objects.',
      allowedStructures: [
        '"a" before consonant sounds vs. "an" before vowel sounds (a book, an apple, an umbrella)',
        'Mandatory "a/an" before singular countable jobs ("She is a doctor", "He is an engineer")',
        'Zero article with plural and uncountable nouns in general statements ("I like music", "Dogs are friendly")',
      ],
      forbiddenAboveLevel: [
        'Abstract institutional vs. physical building article contrasts',
        'C1/C2 nominalized adjectives ("the underprivileged")',
      ],
      signatureErrorTraps: [
        'Using "a" before a vowel sound ("a apple", "a orange") or "an" before a consonant sound ("an car")',
        'Omitting "a/an" before singular professions ("My sister is architect")',
      ],
    },
    A2: {
      topic: 'Articles',
      level: 'A2',
      classroomSummary: ' Phonetic "a/an" traps (an hour, a university), first mention ("a") vs. second mention ("the"), and "the" with superlatives.',
      allowedStructures: [
        'Phonetic initial sound exceptions: "an hour", "an honest person" vs. "a university", "a European country", "a uniform"',
        'First mention ("I bought a jacket") vs. second mention ("The jacket was warm")',
        'Mandatory "the" before superlative adjectives ("the tallest building", "the best movie") and ordinal numbers ("the first floor")',
      ],
      forbiddenAboveLevel: [
        'Advanced comparative correlatives ("The sooner, the better")',
      ],
      signatureErrorTraps: [
        'Writing "an university" or "a hour" by looking at the spelling letter instead of listening to the sound',
        'Omitting "the" before superlatives ("She is best student in our class")',
      ],
    },
    B1: {
      topic: 'Articles',
      level: 'B1',
      classroomSummary: 'Geographical names (rivers/oceans/mountain ranges vs. lakes/countries), musical instruments, and uncountable information/advice nouns.',
      allowedStructures: [
        'Geographical article rules: "the" with rivers, oceans, deserts, mountain ranges, and plural countries (the Thames, the Alps, the USA) vs. zero article with lakes, single mountains, and most countries (Lake Como, Mount Fuji, France)',
        '"the" with musical instruments ("play the piano") vs. zero article with sports ("play tennis")',
        'Zero article (or "a piece of") with uncountable nouns like advice, information, furniture, luggage, news',
      ],
      forbiddenAboveLevel: [],
      signatureErrorTraps: [
        'Using "a/an" with uncountable nouns ("He gave me a good advice", "an important information")',
        'Adding "the" before sports ("play the basketball") or single mountains/lakes ("the Mount Everest")',
      ],
    },
    B2: {
      topic: 'Articles',
      level: 'B2',
      classroomSummary: 'Institutions vs. physical buildings (go to hospital/prison/university vs. go to the hospital), generic "the + singular noun", and "the + adjective" groups.',
      allowedStructures: [
        'Institutional purpose (zero article: in hospital, at university, in prison, go to bed) vs. visiting the physical building ("the")',
        'Collective groups using "the + adjective" (the rich, the unemployed, the elderly) taking plural verbs',
        'Generic reference with "the + singular countable noun" for inventions and species ("The blue whale is endangered", "Who invented the telephone?")',
      ],
      forbiddenAboveLevel: [],
      signatureErrorTraps: [
        'Adding "the" when referring to generalizations about abstract nouns ("The life is unpredictable" -> "Life is unpredictable")',
        'Using a singular verb after collective "the + adjective" ("The unemployed is struggling" -> "are struggling")',
      ],
    },
    C1: {
      topic: 'Articles',
      level: 'C1',
      classroomSummary: 'Correlative comparatives ("The more..., the more..."), "a/an" with modified abstract/proper nouns ("a deeper understanding", "a very different London"), and fixed idioms.',
      allowedStructures: [
        'Correlative comparative clauses ("The more complex the algorithm, the greater the risk")',
        'Indefinite article "a/an" before normally uncountable abstract nouns when pre- or post-modified ("a thorough knowledge of", "an uncanny ability to")',
        'Zero article in parallel binominal phrases ("from start to finish", "face to face", "hand in hand", "day by day")',
      ],
      forbiddenAboveLevel: [],
      signatureErrorTraps: [
        'Omitting "a/an" before a pre-modified singular abstract noun phrase ("She demonstrated remarkable knowledge" vs. "a working knowledge of")',
        'Inserting articles inside fixed parallel expressions ("from the start to the finish", "by the mistake" -> "by mistake")',
      ],
    },
    C2: {
      topic: 'Articles',
      level: 'C2',
      classroomSummary: 'Subtle post-modification shifts ("of" phrases requiring "the"), appositive titles/roles (zero article with unique post-office roles), and "such a" vs. "so + adj + a".',
      allowedStructures: [
        '"so + adjective + a/an + singular countable noun" ("so compelling an argument", "too rare an opportunity")',
        'Zero article with unique titles/offices after "appoint / elect / declare" ("He was appointed Chairman of the Board")',
        'Mandatory definite article before nouns specified by a restrictive "of"-phrase ("the music of the 1960s" vs. "1960s music")',
      ],
      forbiddenAboveLevel: [],
      signatureErrorTraps: [
        'Misplacing the indefinite article in formal degree inversion ("a so compelling argument" -> "so compelling an argument" or "such a compelling argument")',
        'Omitting "the" when an abstract noun is restrictively defined by "of" ("Development of new vaccines took years" -> "The development of...")',
      ],
    },
  },

  Conditionals: {
    A1: {
      topic: 'Conditionals',
      level: 'A1',
      classroomSummary: 'Zero Conditional for simple everyday facts and rules ("If you heat ice, it melts").',
      allowedStructures: [
        'Zero Conditional: If + Present Simple, Present Simple for everyday facts, habits, and simple instructions',
      ],
      forbiddenAboveLevel: [
        'First Conditional with modals other than will/can',
        'Second Conditional (If + Past Simple, would)',
        'Third Conditional (If + Past Perfect, would have + V3)',
        'Mixed Conditionals and Inverted Conditionals',
      ],
      signatureErrorTraps: [
        'Subject-verb agreement error in Zero Conditional ("If he eat too much, he feels sick")',
        'Putting "would" in a basic Zero Conditional fact ("If water reaches 100 degrees, it would boil")',
      ],
    },
    A2: {
      topic: 'Conditionals',
      level: 'A2',
      classroomSummary: 'First Conditional ("If + Present Simple, will + infinitive") and Zero Conditional.',
      allowedStructures: [
        'First Conditional: If + Present Simple, will / won\'t / can + bare infinitive for real future possibilities',
        'Zero Conditional with "if" or "when"',
      ],
      forbiddenAboveLevel: [
        'Third Conditional (If + had + V3, would have + V3)',
        'Mixed Conditionals',
        'Inverted Conditionals (Had / Were / Should)',
      ],
      signatureErrorTraps: [
        'Using "will" inside the "if"-clause ("If it will rain tomorrow, we will stay inside")',
        'Using "to" after "will" in the main clause ("If you study hard, you will to pass")',
      ],
    },
    B1: {
      topic: 'Conditionals',
      level: 'B1',
      classroomSummary: 'Second Conditional ("If I had time, I would...") for unreal present/future, plus "unless" and "as soon as".',
      allowedStructures: [
        'Second Conditional: If + Past Simple (including "If I were you"), would / could / might + bare infinitive',
        'First Conditional with "unless" (= if not), "as soon as", and "until"',
      ],
      forbiddenAboveLevel: [
        'Inverted Conditionals without "if" ("Had I known...", "Were she to...")',
      ],
      signatureErrorTraps: [
        'Using "would" inside the "if"-clause ("If I would have more money, I would travel")',
        'Using a negative verb after "unless" ("Unless you don\'t hurry, we will be late")',
      ],
    },
    B2: {
      topic: 'Conditionals',
      level: 'B2',
      classroomSummary: 'Third Conditional ("If + Past Perfect, would have + V3"), "wish / if only", and conditional linkers ("provided that", "in case", "as long as").',
      allowedStructures: [
        'Third Conditional: If + Past Perfect (had + V3), would / could / might + have + V3 for unreal past regrets',
        '"wish / if only + Past Simple" (present wish) vs. "wish / if only + Past Perfect" (past regret) vs. "wish + would" (annoyance)',
        'Conditional conjunctions: provided that, providing, as long as, on condition that, in case',
      ],
      forbiddenAboveLevel: [],
      signatureErrorTraps: [
        'Using "would have" inside the "if"-clause ("If she would have set an alarm, she wouldn\'t have missed the flight")',
        'Confusing "in case" (precaution beforehand) with "if" (condition)',
        'Using "wish + would" with the same subject ("I wish I would have more free time" -> "I wish I had...")',
      ],
    },
    C1: {
      topic: 'Conditionals',
      level: 'C1',
      classroomSummary: 'Mixed Conditionals (Past -> Present and Present -> Past), Inverted Conditionals ("Had I known...", "Were they to...", "Should you..."), and "but for".',
      allowedStructures: [
        'Mixed Conditional Type A: If + Past Perfect (past cause), would + bare infinitive (present result)',
        'Mixed Conditional Type B: If + Past Simple (ongoing state), would have + V3 (past result)',
        'Formal Inverted Conditionals omitting "if": "Had + subject + V3", "Were + subject + to-infinitive", "Should + subject + bare infinitive"',
        '"But for + noun phrase" and "If it hadn\'t been for + noun phrase"',
      ],
      forbiddenAboveLevel: [],
      signatureErrorTraps: [
        'Using "would have" in the present-result main clause when "now / today" is specified ("If he had taken the job, he would have been rich now" -> "would be rich now")',
        'Adding "if" together with auxiliary inversion ("Had if they known..." or "Were they know...")',
      ],
    },
    C2: {
      topic: 'Conditionals',
      level: 'C2',
      classroomSummary: 'Subjunctive & formal counterfactuals ("Were it not for", "Had it not been for", "If push comes to shove", "Whether or not", "Suppose / Supposing").',
      allowedStructures: [
        'Counterfactual inversion idioms: "Were it not for..." (present) vs. "Had it not been for..." (past)',
        'Concessive conditionals: "Even if they were to...", "Whether or not the proposal be approved", "Be that as it may"',
        'Implicit conditionals with "Otherwise", "Without your intervention", "Given the chance"',
      ],
      forbiddenAboveLevel: [],
      signatureErrorTraps: [
        'Mixing present "Were it not for" with a past counterfactual result ("Were it not for the tugboats, the ship would have sunk yesterday" -> "Had it not been for...")',
        'Using past participle instead of bare infinitive after "Should + subject" inversion ("Should the alarm sounded..." -> "Should the alarm sound...")',
      ],
    },
  },

  Modals: {
    A1: {
      topic: 'Modals',
      level: 'A1',
      classroomSummary: '"can / can\'t" for ability and requests, and basic "must / mustn\'t" for simple classroom or safety rules.',
      allowedStructures: [
        'can / can\'t + bare infinitive for ability, permission, and polite requests ("Can you help me?")',
        'must / mustn\'t + bare infinitive for clear rules ("You mustn\'t park here")',
      ],
      forbiddenAboveLevel: [
        'Modal Perfects (must have, should have, could have, might have + V3)',
        'needn\'t have + V3 vs. didn\'t need to',
        'be supposed to / be bound to',
      ],
      signatureErrorTraps: [
        'Adding "to" after a modal verb ("She can to swim", "You must to stop")',
        'Adding 3rd-person -s to a modal ("He cans speak Spanish")',
      ],
    },
    A2: {
      topic: 'Modals',
      level: 'A2',
      classroomSummary: '"should / shouldn\'t" for advice, "have to / don\'t have to" for obligation vs. no obligation, and "may / might" for future possibility.',
      allowedStructures: [
        'should / shouldn\'t + bare infinitive for advice and recommendations',
        'have to / has to (obligation) vs. don\'t have to / doesn\'t have to (lack of obligation)',
        'may / might + bare infinitive for uncertainty',
      ],
      forbiddenAboveLevel: [
        'Modal Perfects (must/can\'t/should/might have + V3)',
      ],
      signatureErrorTraps: [
        'Confusing "mustn\'t" (prohibition) with "don\'t have to" (not necessary)',
        'Forming negatives of "have to" without auxiliary "do" ("You haven\'t to pay" -> "You don\'t have to pay")',
      ],
    },
    B1: {
      topic: 'Modals',
      level: 'B1',
      classroomSummary: 'Present deduction ("must be" vs. "can\'t be" vs. "might be"), past ability ("could" vs. "was able to"), and "ought to / had better".',
      allowedStructures: [
        'Modals of present deduction: "must be" (certainly true), "may/might/could be" (possibly true), "can\'t be" (certainly false)',
        'General past ability ("could") vs. specific past achievement on one occasion ("was/were able to", "managed to")',
        '"ought to + bare infinitive" and "had better (not) + bare infinitive"',
      ],
      forbiddenAboveLevel: [
        'needn\'t have + V3 vs. didn\'t need to',
      ],
      signatureErrorTraps: [
        'Using "mustn\'t be" instead of "can\'t be" for negative logical deduction ("That mustn\'t be Sarah at the door; she\'s in Rome" -> "can\'t be")',
        'Adding "to" after "had better" ("You had better to leave now" -> "You had better leave now")',
      ],
    },
    B2: {
      topic: 'Modals',
      level: 'B2',
      classroomSummary: 'Modal Perfects for past deduction and criticism ("must have", "can\'t have", "should have", "might have" + V3) and "be supposed to".',
      allowedStructures: [
        'Past deduction with Modal Perfects: must have + V3, can\'t/couldn\'t have + V3, may/might/could have + V3',
        'Past regret or criticism: should(n\'t) have + V3, ought(n\'t) to have + V3',
        'Unfulfilled past possibility: could have + V3 ("You could have told me!")',
      ],
      forbiddenAboveLevel: [],
      signatureErrorTraps: [
        'Using "must of / should of / could of" instead of "must have / should have / could have"',
        'Using base verb or past simple instead of past participle after "modal + have" ("She must have went" -> "must have gone")',
      ],
    },
    C1: {
      topic: 'Modals',
      level: 'C1',
      classroomSummary: '"needn\'t have done" vs. "didn\'t need to do", modal continuous/perfect continuous ("must be working", "must have been waiting"), and "be bound to".',
      allowedStructures: [
        'Contrast between "needn\'t have + V3" (action was done unnecessarily) and "didn\'t need to + infinitive" (action was unnecessary, whether done or not)',
        'Modal Continuous (must/can\'t/might be + -ing) and Modal Perfect Continuous (must/can\'t/should have been + -ing)',
        'Semi-modal certainty & obligation: be bound to, be sure to, be due to, be obliged to',
      ],
      forbiddenAboveLevel: [],
      signatureErrorTraps: [
        'Using "needn\'t to" with "to" ("You needn\'t to worry" -> "You needn\'t worry" or "You don\'t need to worry")',
        'Using "needn\'t have + V3" when the speaker states the action was NOT performed ("I needn\'t have bought tickets because entry was free, so I saved my money" -> "didn\'t need to buy")',
      ],
    },
    C2: {
      topic: 'Modals',
      level: 'C2',
      classroomSummary: 'Idiomatic & rhetorical modals ("may/might well", "may as well", "try as he might", "would that", concessive "may ... but").',
      allowedStructures: [
        '"may/might well + bare infinitive / have + V3" (strong probability) vs. "may/might as well" (pragmatic resignation)',
        'Concessivefronted clauses with "might" or "may": "Try as she might...", "Much as I may admire..."',
        'Epistemic & deontic subtleties with "dare not + bare infinitive", "need + bare infinitive" in negative/interrogative clauses ("Need we say more?")',
      ],
      forbiddenAboveLevel: [],
      signatureErrorTraps: [
        'Adding "to" after bare modal "dare not" or negative/interrogative "need" ("He dare not to speak", "Need she to attend?")',
        'Confusing "may well" (very likely) with "may as well" (nothing better to do)',
      ],
    },
  },

  'Phrasal Verbs': {
    A1: {
      topic: 'Phrasal Verbs',
      level: 'A1',
      classroomSummary: 'Everyday classroom and daily-routine phrasal verbs (wake up, get up, sit down, stand up, turn on, turn off, come in).',
      allowedStructures: [
        'High-frequency literal/daily phrasal verbs: wake up, get up, sit down, stand up, put on, take off, turn on, turn off, go out, come in',
      ],
      forbiddenAboveLevel: [
        '3-part phrasal-prepositional verbs',
        'Abstract C1/C2 idiomatic phrasal verbs (brush up on, do away with)',
      ],
      signatureErrorTraps: [
        'Using the wrong opposite particle ("Please turn on the lights before you go to sleep" when meaning "turn off")',
        'Omitting the particle completely ("I wake at 7 o\'clock")',
      ],
    },
    A2: {
      topic: 'Phrasal Verbs',
      level: 'A2',
      classroomSummary: 'Common travel and household phrasal verbs (look for, look after, find out, give up, pick up, throw away, check in, take off).',
      allowedStructures: [
        'Everyday separable and inseparable 2-part phrasal verbs: look for (search), look after (care for), find out, give up, pick up, throw away, fill in',
      ],
      forbiddenAboveLevel: [
        'Low-frequency C1/C2 phrasal verbs',
      ],
      signatureErrorTraps: [
        'Confusing "look for" (search), "look after" (take care of), and "look at"',
        'Using "give in" or "give out" when "give up" (quit a habit) is intended',
      ],
    },
    B1: {
      topic: 'Phrasal Verbs',
      level: 'B1',
      classroomSummary: 'Separable phrasal verbs with object pronouns ("turn it off", NOT "turn off it") and intermediate phrasal verbs (run out of, look forward to, put off, call off).',
      allowedStructures: [
        'Mandatory pronoun placement between verb and particle for separable phrasal verbs: "turn it off", "pick them up", "put it on", "throw it away"',
        'Core B1 phrasal verbs: put off (postpone), call off (cancel), set up, carry on, break down, work out, get along with',
      ],
      forbiddenAboveLevel: [],
      signatureErrorTraps: [
        'Placing a personal pronoun AFTER the particle of a separable phrasal verb ("Please turn off it" -> "Please turn it off", "She picked up them" -> "She picked them up")',
        'Separating an inseparable phrasal verb ("I looked the keys for" -> "I looked for the keys")',
      ],
    },
    B2: {
      topic: 'Phrasal Verbs',
      level: 'B2',
      classroomSummary: '3-part phrasal-prepositional verbs (put up with, come up with, look up to, cut down on, make up for) and "look forward to + -ing".',
      allowedStructures: [
        'Three-part phrasal-prepositional verbs (inseparable): put up with (tolerate), come up with (invent), look up to (admire), look down on, cut down on, catch up with, make up for, get away with',
        'Phrasal verbs followed by gerund (-ing): look forward to doing, end up doing, keep on doing, give up doing, put off doing',
      ],
      forbiddenAboveLevel: [],
      signatureErrorTraps: [
        'Using bare infinitive instead of -ing after "look forward to" ("I look forward to meet you" -> "to meeting you")',
        'Dropping the final preposition of a 3-part phrasal verb ("We must cut down sugar" -> "cut down on sugar", "put up the noise" -> "put up with the noise")',
      ],
    },
    C1: {
      topic: 'Phrasal Verbs',
      level: 'C1',
      classroomSummary: 'Academic & idiomatic phrasal verbs (do away with, brush up on, live up to, fall back on, account for, bring about, single out).',
      allowedStructures: [
        'Advanced C1 phrasal verbs: do away with (abolish), brush up on (review), live up to (match expectations), fall back on (use as reserve), account for (explain/constitute), bring about (cause), single out, phase out',
      ],
      forbiddenAboveLevel: [],
      signatureErrorTraps: [
        'Inserting a pronoun inside an inseparable 3-part phrasal verb ("They did it away with" -> "They did away with it")',
        'Confusing particle meanings in same-verb families (bring about vs. bring up vs. bring round vs. bring off)',
      ],
    },
    C2: {
      topic: 'Phrasal Verbs',
      level: 'C2',
      classroomSummary: 'Nuanced C2 phrasal verbs (boil down to, clamp down on, zero in on, balk at, mete out, stave off, Mull over) and nominalized phrasal forms.',
      allowedStructures: [
        'Mastery-level phrasal verbs: boil down to, clamp down on, zero in on, stave off, mete out, mull over, vouch for, hinge on, write off, pan out',
        'Passive and participle forms of complex phrasal verbs ("was meted out", "having been phased out", "cannot be done away with")',
      ],
      forbiddenAboveLevel: [],
      signatureErrorTraps: [
        'Omitting the mandatory particle/preposition in passive phrasal constructions ("The old regulations were done away" -> "were done away with")',
        'Using the wrong preposition in C2 multi-word verbs ("boil down on" -> "boil down to", "clamp down at" -> "clamp down on")',
      ],
    },
  },

  'Reported Speech': {
    A1: {
      topic: 'Reported Speech',
      level: 'A1',
      classroomSummary: 'Basic "say" vs. "tell" in present/simple contexts ("She says that she is tired", "He told me his name").',
      allowedStructures: [
        'Distinction between "say (that)..." (no personal object) and "tell + someone (that)..." (with personal object)',
      ],
      forbiddenAboveLevel: [
        'Past Perfect backshifts',
        'Complex reporting verbs (accuse of, deny, suggest + -ing)',
      ],
      signatureErrorTraps: [
        'Putting a personal object directly after "say" without "to" ("She said me that she was ready" -> "She told me..." or "She said to me...")',
        'Putting "to" after "tell" ("He told to me the truth" -> "He told me the truth")',
      ],
    },
    A2: {
      topic: 'Reported Speech',
      level: 'A2',
      classroomSummary: 'Basic tense backshift (Present Simple -> Past Simple, "will" -> "would", "can" -> "could") and reported requests ("asked me to...").',
      allowedStructures: [
        'Backshifting Present Simple to Past Simple, Present Continuous to Past Continuous, and "will/can" to "would/could"',
        'Reported commands and requests with "ask / tell + object + (not) to + infinitive"',
      ],
      forbiddenAboveLevel: [
        'Advanced reporting verbs with gerunds or perfect infinitives',
      ],
      signatureErrorTraps: [
        'Placing "not" after "to" or using "don\'t" in reported negative orders ("She told me don\'t be late" -> "She told me not to be late")',
        'Failing to backshift "will" to "would" after a past reporting verb ("He said he will call me the next day" -> "would call")',
      ],
    },
    B1: {
      topic: 'Reported Speech',
      level: 'B1',
      classroomSummary: 'Reported questions (statement word order without "do/did", using "if / whether") and time/place shifts ("yesterday" -> "the day before").',
      allowedStructures: [
        'Reported Yes/No questions with "if" or "whether" and statement word order (subject + verb)',
        'Reported Wh- questions maintaining statement word order ("She asked where I lived", NOT "where did I live")',
        'Backshifting Past Simple / Present Perfect to Past Perfect (had + V3), and shifting time expressions (tomorrow -> the next day, here -> there)',
      ],
      forbiddenAboveLevel: [],
      signatureErrorTraps: [
        'Keeping inverted question word order or auxiliary "did" inside a reported question ("He asked me where did I work" -> "where I worked", "She asked what was my name" -> "what my name was")',
        'Using "that" together with a question word ("He asked that where I was going")',
      ],
    },
    B2: {
      topic: 'Reported Speech',
      level: 'B2',
      classroomSummary: 'Reporting verb patterns: "+ to-infinitive" (refuse, offer, promise), "+ object + to-infinitive" (warn, advise, remind), and "+ -ing / prep + -ing" (deny, admit, suggest, apologize for).',
      allowedStructures: [
        'Verb + to-infinitive: agree, offer, refuse, promise, threaten, claim',
        'Verb + object + (not) to-infinitive: advise, remind, warn, persuade, encourage, urge',
        'Verb + gerund (-ing) or Verb + (object) + preposition + -ing: admit, deny, suggest, recommend, insist on, apologize for, accuse someone of, blame someone for',
      ],
      forbiddenAboveLevel: [],
      signatureErrorTraps: [
        'Using "suggest / recommend + object + to-infinitive" ("She suggested me to take a taxi" -> "She suggested taking a taxi" or "She suggested that I take a taxi")',
        'Using "deny / admit + to-infinitive" instead of gerund ("He denied to steal the files" -> "He denied stealing the files")',
      ],
    },
    C1: {
      topic: 'Reported Speech',
      level: 'C1',
      classroomSummary: 'Impersonal passive reporting ("is said/believed/rumoured to have + V3", "It is alleged that...") and reporting verbs with perfect gerunds/infinitives.',
      allowedStructures: [
        'Impersonal passive reporting structures: "Subject + is/was said/thought/believed/alleged/reported + to-infinitive / to be -ing / to have + V3"',
        'Reporting verbs with perfect infinitive or perfect gerund: "claimed to have discovered", "denied having leaked", "recalled having met"',
        'Subjunctive or "should" after formal reporting verbs: "insisted/recommended/demanded that she (should) resign"',
      ],
      forbiddenAboveLevel: [],
      signatureErrorTraps: [
        'Using simple infinitive instead of perfect infinitive when the reported action preceded the reporting ("The suspect is believed to flee the country last week" -> "to have fled")',
        'Using "suggest/insist + object + to-infinitive" in formal C1 transformations',
      ],
    },
    C2: {
      topic: 'Reported Speech',
      level: 'C2',
      classroomSummary: 'High-register reporting verbs (allege, contend, purport, insinuate, attribute to, credit with, Distance markers) and passive perfect infinitives ("is rumoured to have been destroyed").',
      allowedStructures: [
        'Passive perfect infinitives in reporting: "The manuscript is thought to have been destroyed in the fire"',
        'High-register reporting collocations: purport to be, attribute X to Y, credit someone with -ing, cast doubt on whether, make no secret of the fact that',
      ],
      forbiddenAboveLevel: [],
      signatureErrorTraps: [
        'Omitting "been" in passive perfect reporting infinitives ("The painting was rumoured to have stolen" -> "to have been stolen")',
        'Using wrong preposition with C2 reporting verbs ("credit someone for doing" in formal Cambridge exams -> "credit someone with doing")',
      ],
    },
  },

  Collocations: {
    A1: {
      topic: 'Collocations',
      level: 'A1',
      classroomSummary: 'Basic everyday "have / do / make / go / take" collocations (have breakfast, do homework, make a cake, go shopping, take a photo).',
      allowedStructures: [
        'Core A1 verb + noun collocations: have breakfast/lunch/dinner, have a shower, do homework, make the bed, take a photo, go swimming/shopping, watch TV',
      ],
      forbiddenAboveLevel: [
        'C1/C2 idiomatic academic collocations (wreak havoc, harbour doubts)',
      ],
      signatureErrorTraps: [
        'Using "make" instead of "do" with homework ("make my homework" -> "do my homework")',
        'Using "make" instead of "take" with photos ("make a photo" -> "take a photo")',
      ],
    },
    A2: {
      topic: 'Collocations',
      level: 'A2',
      classroomSummary: 'Common "make vs. do vs. take vs. pay" collocations (make a mistake, do a favour, take an exam, pay attention, catch a cold, heavy rain).',
      allowedStructures: [
        'Make vs. Do: make a mistake, make a decision, make noise, make friends vs. do business, do someone a favour, do the dishes, do exercise',
        'Common adjective + noun & verb + noun pairs: heavy rain, strong wind, catch a bus/cold, tell the truth, tell a lie, keep a secret',
      ],
      forbiddenAboveLevel: [
        'Archaic or legal C2 collocations',
      ],
      signatureErrorTraps: [
        'Saying "do a mistake" instead of "make a mistake", or "make a favour" instead of "do a favour"',
        'Saying "strong rain" instead of "heavy rain", or "say a lie" instead of "tell a lie"',
      ],
    },
    B1: {
      topic: 'Collocations',
      level: 'B1',
      classroomSummary: 'Intermediate verb + noun & adverb + adjective collocations (take responsibility, reach an agreement, miss an opportunity, deeply regret, fully aware).',
      allowedStructures: [
        'Verb + noun collocations: take advantage of, take part in, pay a compliment, reach an agreement, miss an opportunity, meet a deadline, Break a record',
        'Adverb + adjective collocations: deeply disappointed, fully aware, highly likely, fast asleep, wide awake',
      ],
      forbiddenAboveLevel: [],
      signatureErrorTraps: [
        'Saying "lose an opportunity" or "lose a flight" instead of "miss an opportunity / miss a flight"',
        'Saying "do an agreement" instead of "reach/come to an agreement"',
      ],
    },
    B2: {
      topic: 'Collocations',
      level: 'B2',
      classroomSummary: 'Upper-intermediate collocations (bitterly disappointed, heavy traffic, pose a threat,jump to conclusions, bear in mind, narrow escape).',
      allowedStructures: [
        'Intensifier adverb + adjective/verb: bitterly cold/disappointed, deeply rooted, Ridiculously expensive, strongly oppose, utterly exhausted, vitally important',
        'Formal verb + noun collocations: pose a threat, draw a conclusion, launch a campaign, raise awareness, Jump to conclusions, bear in mind',
      ],
      forbiddenAboveLevel: [],
      signatureErrorTraps: [
        'Pairing non-gradable extreme adjectives with "very" instead of "utterly / completely / absolutely" ("very exhausted", "very freezing")',
        'Using "make a threat" instead of "pose a threat" for impersonal risks, or "do a conclusion" instead of "draw/reach a conclusion"',
      ],
    },
    C1: {
      topic: 'Collocations',
      level: 'C1',
      classroomSummary: 'Advanced academic & idiomatic collocations (wreak havoc, staunch supporter, lluvia/torrential rain, jump at the chance, foregone conclusion, heated debate).',
      allowedStructures: [
        'High-register C1 collocations: wreak havoc, harbour doubts/grudges, alleviate poverty/pain, bridge the gap, strike a balance, staunch supporter, foregone conclusion, heated debate, slim chance, resounding success',
      ],
      forbiddenAboveLevel: [],
      signatureErrorTraps: [
        'Using near-synonyms that break fixed C1 collocations ("inflict havoc" -> "wreak havoc", "narrow chance" -> "slim chance", "warm debate" -> "heated debate")',
      ],
    },
    C2: {
      topic: 'Collocations',
      level: 'C2',
      classroomSummary: 'Mastery-level collocations (cast aspersions, Level accusations, unmitigated disaster, diametric opposite, fleeting glimpse, abject poverty, bone of contention).',
      allowedStructures: [
        'C2 literary & formal collocations: unmitigated disaster, abject poverty/apology, diametric opposite, fleeting glimpse, bone of contention, cast aspersions on, level accusations at, Exercise restraint, broker a deal, harbour illusions',
      ],
      forbiddenAboveLevel: [],
      signatureErrorTraps: [
        'Mixing C2 collocational partners ("throw aspersions" -> "cast aspersions", "utter disaster" when testing "unmitigated disaster", "aim accusations" -> "level accusations")',
      ],
    },
  },
};

/**
 * Resolves any user/game topic string to its matching CanonicalGrammarTopic if applicable.
 */
export function resolveCanonicalTopic(topic: string): CanonicalGrammarTopic | null {
  const clean = (topic || '').trim().toLowerCase();
  if (!clean) return null;
  if (clean.includes('tense') || clean.includes('passive') || clean.includes('aspect')) return 'Tenses';
  if (clean.includes('prep')) return 'Prepositions';
  if (clean.includes('article') || clean.includes('determiner')) return 'Articles';
  if (clean.includes('conditional') || clean.includes('wish') || clean.includes('unreal')) return 'Conditionals';
  if (clean.includes('modal')) return 'Modals';
  if (clean.includes('phrasal')) return 'Phrasal Verbs';
  if (clean.includes('reported') || clean.includes('indirect')) return 'Reported Speech';
  if (clean.includes('collocation')) return 'Collocations';
  return null;
}

/**
 * Returns the Cambridge EGP curriculum specification for a given (topic, level) pair.
 */
export function getCefrTopicRuleSpec(topic: string, level: CEFRLevel): CefrTopicRuleSpec | null {
  const canonical = resolveCanonicalTopic(topic);
  if (!canonical) return null;
  return CEFR_GRAMMAR_MATRIX[canonical]?.[level] || null;
}

/**
 * Formats the Topic x CEFR Level specification as an explicit prompt directive block for Groq/Gemini.
 */
export function formatCefrPromptDirective(topic: string, level: CEFRLevel): string {
  const spec = getCefrTopicRuleSpec(topic, level);
  if (!spec) return '';

  const allowedLines = spec.allowedStructures.map(s => `  * ${s}`).join('\n');
  const forbiddenLines =
    spec.forbiddenAboveLevel.length > 0
      ? `\n- STRICTLY FORBIDDEN ABOVE-LEVEL STRUCTURES (DO NOT USE AT ${level}):\n${spec.forbiddenAboveLevel.map(s => `  * NEVER USE: ${s}`).join('\n')}`
      : '';
  const trapLines = spec.signatureErrorTraps.map(s => `  * ${s}`).join('\n');

  return `
=== CAMBRIDGE ENGLISH GRAMMAR PROFILE (EGP) MATRIX FOR "${spec.topic.toUpperCase()}" AT CEFR ${spec.level} ===
- CURRICULUM TARGET SUMMARY: ${spec.classroomSummary}
- ALLOWED ${spec.level} STRUCTURES FOR "${spec.topic}":
${allowedLines}${forbiddenLines}
- AUTHENTIC ${spec.level} LEARNER ERROR MECHANISMS / DISTRACTOR TARGETS:
${trapLines}`;
}

/**
 * Post-generation guardrail that checks whether an AI-generated sentence for A1 or A2
 * accidentally used advanced B2/C1/C2 syntactic constructions (like Third Conditionals,
 * Modal Perfects, or Negative Inversion).
 */
export function checkCefrLevelViolation(
  sentenceText: string,
  level: CEFRLevel
): { violated: boolean; reason?: string } {
  const text = (sentenceText || '').trim();
  if (!text) return { violated: false };

  if (level === 'A1' || level === 'A2') {
    // Check for Modal Perfect / Third Conditional ("would have", "could have", "should have", "must have", "might have" + word)
    if (/\b(would|could|should|must|might|may|ought\s+to)\s+(not\s+)?have\s+[a-z]{3,}/i.test(text) ||
        /\b(wouldn't|couldn't|shouldn't|mustn't|mightn't)\s+have\s+[a-z]{3,}/i.test(text)) {
      return {
        violated: true,
        reason: `Sentence contains a B2/C1 Modal Perfect or Third Conditional ("...have + participle") which exceeds CEFR ${level}.`,
      };
    }
    // Check for C1 negative inversion at clause start ("Hardly had", "No sooner had", "Seldom have", "Rarely did", "Were it not")
    if (/^(Hardly|Scarcely|Barely|No\s+sooner|Seldom|Rarely|Little|Not\s+only)\s+(had|have|has|did|do|does|was|were|would|should|could)\b/i.test(text)) {
      return {
        violated: true,
        reason: `Sentence uses C1/C2 negative inversion at CEFR ${level}.`,
      };
    }
  }

  if (level === 'A1') {
    // A1 strictly forbids Past Perfect ("had + past participle")
    if (/\bhad\s+(not\s+)?(been|gone|seen|done|made|taken|known|come|left|written|eaten|bought|found|given|told|said|[a-z]+ed)\b/i.test(text) ||
        /\bhadn't\s+(been|gone|seen|done|made|taken|known|come|left|written|eaten|bought|found|given|told|said|[a-z]+ed)\b/i.test(text)) {
      return {
        violated: true,
        reason: 'Sentence uses Past Perfect ("had + participle") which exceeds CEFR A1.',
      };
    }
  }

  return { violated: false };
}
