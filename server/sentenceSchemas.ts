import { Type } from '@google/genai';

// --- CEFR Linguistic Profiles ---
export interface CefrProfile {
  syntax: string;
  lexis: string;
  mistakeIdentification: string;
  targetLength: string;
}

export const CEFR_PROFILES: Record<string, CefrProfile> = {
  A1: {
    syntax:
      'Elementary, basic SVO clauses only (6-10 words). Present simple of be/have/common action verbs or past simple of be. Only basic coordinating conjunctions ("and", "or"). Strictly NO subordinate clauses, NO relative clauses, NO passive voice.',
    lexis:
      "Beginner, high-frequency everyday vocabulary (family, numbers, colors, basic food, daily routines). Avoid abstract, specialized, or idiomatic vocabulary.",
    mistakeIdentification:
      'Glaring, obvious, and immediate to identify (e.g., "She have two cats", "I no like tea", "more big"). No subtle traps.',
    targetLength: "6-10 words",
  },
  A2: {
    syntax:
      'Simple compound and basic complex sentences (8-14 words). Basic time clauses ("when", "before", "after") and elementary cause-and-effect connectors ("because", "so").',
    lexis:
      "Everyday vocabulary for familiar topics (routine, shopping, travel, basic professions, weather). Simple, transparent collocations only.",
    mistakeIdentification:
      'Clear, direct, and easily detectable (e.g., "She buyed a car", "in Monday", "I didn\'t see nobody").',
    targetLength: "8-14 words",
  },
  B1: {
    syntax:
      'Intermediate multi-clause sentences (12-18 words). Standard relative clauses ("who", "which", "that"), first/second conditionals, modal auxiliaries, present perfect vs past simple.',
    lexis:
      'Practical, functional vocabulary for everyday communication, hobbies, opinions, and work. Common phrasal verbs ("give up", "look for") and fixed prepositional expressions.',
    mistakeIdentification:
      'Moderately distinguishable (e.g., "I have arrived yesterday", "interested on", "we must to go").',
    targetLength: "12-18 words",
  },
  B2: {
    syntax:
      "Upper-intermediate multi-clause sentences (16-24 words). Varied clause openers, passive voice constructions, third conditionals, concession clauses, reported speech backshifts, gerund vs infinitive patterns.",
    lexis:
      "Rich, diverse vocabulary covering abstract nouns, workplace and societal themes, nuanced phrasal verbs, and dependent prepositions.",
    mistakeIdentification:
      'Challenging and nuanced (e.g., "despite" + full clause without "the fact that", state verbs in progressive, "insisted in going").',
    targetLength: "16-24 words",
  },
  C1: {
    syntax:
      'Sophisticated, dense syntactic architecture (20-30 words). Negative inversion ("Seldom have we seen..."), cleft sentences, mixed conditionals, participle clauses, nominalizations, modal perfects.',
    lexis:
      "Advanced academic, literary, and professional vocabulary. Low-frequency adjectives and verbs, sophisticated collocations, nuanced register, precise discourse markers.",
    mistakeIdentification:
      'Subtle and deceptive (e.g., "Rarely she had observed...", subjunctive mood violations, dangling participle modifiers, "indifferent at").',
    targetLength: "20-30 words",
  },
  C2: {
    syntax:
      'Masterful, intricate native-level syntax (22-35 words). Stylistic inversion, fronting of prepositional phrases, conditional inversion without "if", balanced rhetorical parallelism, embedded parentheticals.',
    lexis:
      "Erudite, nuanced, mastery-level vocabulary. Rare and subtle collocations, refined idioms, precise connotations, sophisticated figurative expressions.",
    mistakeIdentification:
      'Extremely subtle and elusive (e.g., delicate case agreement like "between you and I", subtle faux-subjunctive, delicate agreement mismatches separated by parentheticals).',
    targetLength: "22-35 words",
  },
};

export const binarySentenceSchema = {
  type: Type.OBJECT,
  properties: {
    text: { type: Type.STRING, description: "The generated sentence." },
    isCorrect: { type: Type.BOOLEAN, description: "Whether the sentence is grammatically correct." },
    correction: { type: Type.STRING, description: "The full corrected version of the sentence (or original if correct)." },
    explanation: {
      type: Type.STRING,
      description: "A clear, plain-English 1-2 sentence explanation (easy for students to understand without heavy technical jargon).",
    },
    grammarPhrase: { type: Type.STRING, description: "Key part of the sentence (3-5 words) testing the rule." },
    errorPhrase: { type: Type.STRING, description: "If incorrect, the exact erroneous phrase. If correct, empty string." },
    mistakeType: { type: Type.STRING, description: "If incorrect, 2-4 word descriptor of error mechanism. If correct, empty string." },
  },
  required: ["text", "isCorrect", "correction", "explanation", "grammarPhrase", "errorPhrase", "mistakeType"],
};

export const multipleChoiceSentenceSchema = {
  type: Type.OBJECT,
  properties: {
    correction: {
      type: Type.STRING,
      description: "Step 1: Write the FULL, 100% grammatically complete sentence first (with NO blanks and NO missing prepositions or particles).",
    },
    correctAnswer: {
      type: Type.STRING,
      description: "Step 2: Choose ONLY the exact target word (or exact target verb form) from 'correction' to be the gap. NEVER include surrounding words from the sentence.",
    },
    text: {
      type: Type.STRING,
      description: "Step 3: Copy 'correction' word-for-word and replace ONLY 'correctAnswer' with '_____'. Replacing '_____' with 'correctAnswer' MUST produce 'correction' word-for-word without duplicating any word.",
    },
    options: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Step 4: 4 distinct options (1 'correctAnswer' + 3 plausible grammatical distractors) containing ONLY the word(s) for '_____', NEVER words already present in 'text'.",
    },
    explanation: {
      type: Type.STRING,
      description: "A clear, plain-English 1-2 sentence explanation (easy for students to understand without heavy technical jargon) of why the correct option fits.",
    },
    grammarPhrase: { type: Type.STRING, description: "The 3-5 word phrase from 'correction' containing the target gap." },
  },
  required: ["correction", "correctAnswer", "text", "options", "explanation", "grammarPhrase"],
};

export const openClozeSentenceSchema = {
  type: Type.OBJECT,
  properties: {
    correction: {
      type: Type.STRING,
      description: "Step 1: Write the FULL, 100% grammatically complete sentence first (with NO blanks and NO missing prepositions or particles).",
    },
    correctAnswer: {
      type: Type.STRING,
      description: "Step 2: Choose ONE single word from 'correction' to be the missing word.",
    },
    text: {
      type: Type.STRING,
      description: "Step 3: Copy 'correction' word-for-word and replace ONLY that single 'correctAnswer' word with '_____'. Every other word (such as 'to', 'with', 'of', 'for') MUST remain in 'text'.",
    },
    explanation: {
      type: Type.STRING,
      description: "A clear, plain-English 1-2 sentence explanation (easy for students to understand without heavy technical jargon) of why this word is needed.",
    },
    grammarPhrase: { type: Type.STRING, description: "The 3-5 word phrase from the completed sentence around the gap." },
    acceptedAnswers: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Array of all valid single-word answers (primary word + valid single-word synonyms).",
    },
  },
  required: ["correction", "correctAnswer", "text", "explanation", "grammarPhrase", "acceptedAnswers"],
};

export const wordFormationSentenceSchema = {
  type: Type.OBJECT,
  properties: {
    correction: {
      type: Type.STRING,
      description: "Step 1: Write the FULL, 100% grammatically complete sentence first (with NO blanks).",
    },
    baseWord: {
      type: Type.STRING,
      description: "Step 2: The root/stem word in UPPERCASE (e.g. 'DECIDE', 'FORTUNATE', 'FRIEND', 'RELY') from which 'correctAnswer' is morphologically derived. MUST NOT be identical to 'correctAnswer'.",
    },
    correctAnswer: {
      type: Type.STRING,
      description: "Step 3: Choose ONE single derived word from 'correction' (e.g. 'decision', 'unfortunately', 'friendship', 'unreliable') formed from 'baseWord'.",
    },
    text: {
      type: Type.STRING,
      description: "Step 4: Copy 'correction' word-for-word and replace ONLY 'correctAnswer' with '_____'. Do NOT write '(BASEWORD)' inside 'text' (the UI renders the baseWord badge automatically).",
    },
    explanation: {
      type: Type.STRING,
      description: "A clear, plain-English 1-2 sentence explanation of how the base word is transformed (e.g. which prefix/suffix or part of speech is needed and why).",
    },
    grammarPhrase: { type: Type.STRING, description: "The 3-5 word phrase from the completed sentence around the gap." },
    acceptedAnswers: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Array of all valid single-word derivations of 'baseWord' that fit the gap (including US/UK spelling variants like -ize/-ise).",
    },
  },
  required: ["correction", "baseWord", "correctAnswer", "text", "explanation", "grammarPhrase", "acceptedAnswers"],
};

export const keyWordTransformationSentenceSchema = {
  type: Type.OBJECT,
  properties: {
    leadInSentence: {
      type: Type.STRING,
      description: "Step 1: The original complete lead-in sentence whose meaning must be preserved.",
    },
    baseWord: {
      type: Type.STRING,
      description: "Step 2: The single given KEY WORD in UPPERCASE (e.g. 'SEEN', 'UNLESS', 'RATHER', 'SPITE', 'HAD') that students MUST include WITHOUT changing its form.",
    },
    correction: {
      type: Type.STRING,
      description: "Step 3: The FULL, 100% grammatically complete second sentence (with NO blanks) that has the same meaning as 'leadInSentence' and contains 'baseWord'.",
    },
    correctAnswer: {
      type: Type.STRING,
      description: "Step 4: The exact 2-to-6 word phrase from 'correction' (containing 'baseWord' unchanged) that fills the blank '_____'.",
    },
    text: {
      type: Type.STRING,
      description: "Step 5: Copy 'correction' word-for-word and replace ONLY 'correctAnswer' with '_____'. Must have words before and/or after '_____' to frame the transformation.",
    },
    mark1Parts: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Step 6: The first scoring half of the target phrase (1 mark in Cambridge Part 4), including contraction variants (e.g. ['have not seen', \"haven't seen\"]).",
    },
    mark2Parts: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Step 7: The second scoring half of the target phrase (1 mark in Cambridge Part 4), such as ['since'] or ['to consult']. Combining a mark1Part + mark2Part equals a full 2-mark answer.",
    },
    acceptedAnswers: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Array of all valid 2-to-6 word phrases (containing 'baseWord' unchanged, including contraction variants) that earn the full 2/2 marks.",
    },
    explanation: {
      type: Type.STRING,
      description: "A clear, plain-English 1-2 sentence explanation of the two grammatical components required around the key word.",
    },
    grammarPhrase: { type: Type.STRING, description: "The 3-6 word phrase from 'correction' containing the transformation." },
  },
  required: [
    "leadInSentence",
    "baseWord",
    "correction",
    "correctAnswer",
    "text",
    "mark1Parts",
    "mark2Parts",
    "acceptedAnswers",
    "explanation",
    "grammarPhrase",
  ],
};

export function getSentenceSchema(
  questionType: "binary" | "multipleChoice" | "openCloze" | "wordFormation" | "keyWordTransformation"
) {
  if (questionType === "multipleChoice") return multipleChoiceSentenceSchema;
  if (questionType === "openCloze") return openClozeSentenceSchema;
  if (questionType === "wordFormation") return wordFormationSentenceSchema;
  if (questionType === "keyWordTransformation") return keyWordTransformationSentenceSchema;
  return binarySentenceSchema;
}


export const verificationSchema = {
  type: Type.OBJECT,
  properties: {
    isCorrect: { type: Type.BOOLEAN, description: "Whether the user's correction is valid." },
    feedback: { type: Type.STRING, description: "Brief one-sentence explanation of why it was accepted or rejected." },
  },
  required: ["isCorrect", "feedback"],
};

export const batchClozeVerificationSchema = {
  type: Type.OBJECT,
  properties: {
    evaluations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          word: { type: Type.STRING, description: "The candidate word or phrase being evaluated." },
          mark1Correct: {
            type: Type.BOOLEAN,
            description: "For Key Word Transformation: true ONLY if the 1st structural half (mark1Parts) has 100% accurate tense, subject-verb agreement, grammar, and spelling.",
          },
          mark2Correct: {
            type: Type.BOOLEAN,
            description: "For Key Word Transformation: true ONLY if the 2nd structural half (mark2Parts) has 100% accurate grammar, collocation, and spelling.",
          },
          isCorrect: { type: Type.BOOLEAN, description: "True if marks >= 1 (for Key Word Transformation) or if the single word fits the gap." },
          marks: {
            type: Type.INTEGER,
            description: "For Key Word Transformation: (mark1Correct ? 1 : 0) + (mark2Correct ? 1 : 0) -> 2, 1, or 0. For single-word Cloze: 1 if correct, 0 if incorrect.",
          },
          feedback: { type: Type.STRING, description: "Brief one-sentence explanation of why the submission earned 2, 1, or 0 marks." },
        },
        required: ["word", "mark1Correct", "mark2Correct", "isCorrect", "marks", "feedback"],
      },
    },
  },
  required: ["evaluations"],
};
