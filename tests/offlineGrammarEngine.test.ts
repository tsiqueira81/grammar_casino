import { describe, it, expect } from 'vitest';
import {
  WORD_FAMILY_LEXICON,
  lookupWordFamily,
  diagnoseWordFormationAttempt,
} from '../utils/wordFamilyLexicon';
import {
  CEFR_GRAMMAR_MATRIX,
  getCefrTopicRuleSpec,
  formatCefrPromptDirective,
  checkCefrLevelViolation,
} from '../utils/cefrGrammarMatrix';
import {
  expandEnglishContractions,
  normalizeUkUsSpelling,
  normalizeEnglishSentence,
  getClauseOrderVariants,
  evaluateBinaryCorrectionOffline,
  evaluateWordFormationOffline,
  evaluateOpenClozeOffline,
  sanitizeMultipleChoiceDistractors,
} from '../utils/offlineGrammarEngine';
import { buildAcceptedAnswerSet } from '../utils/roundSettlement';
import { GRAMMAR_TOPICS, CEFR_LEVELS } from '../constants';

describe('Pillar 1 — Derivational Word-Family Lexicon & POS Diagnostic Engine', () => {
  it('contains rich word families for Cambridge Part 3 high-frequency stems', () => {
    expect(Object.keys(WORD_FAMILY_LEXICON).length).toBeGreaterThanOrEqual(45);
    const decideFamily = lookupWordFamily('DECIDE');
    expect(decideFamily).not.toBeNull();
    expect(decideFamily?.forms.noun).toContain('decision');
    expect(decideFamily?.forms.adj_negative).toContain('indecisive');
    expect(decideFamily?.forms.adv_positive).toContain('decisively');
  });

  it('lookupWordFamily resolves both base roots and derived forms', () => {
    const byRoot = lookupWordFamily('FORTUNATE');
    const byDerived = lookupWordFamily('unfortunately');
    expect(byRoot?.baseWord).toBe('FORTUNATE');
    expect(byDerived?.baseWord).toBe('FORTUNATE');
  });

  it('diagnoses when a student submits a positive adjective instead of a negative adverb', () => {
    const feedback = diagnoseWordFormationAttempt('fortunate', 'unfortunately', 'FORTUNATE');
    expect(feedback).not.toBeNull();
    expect(feedback).toContain('positive adjective');
    expect(feedback).toContain('negative adverb');
    expect(feedback).toContain('unfortunately');
  });

  it('diagnoses when a student misses a negative prefix within the same POS', () => {
    const feedback = diagnoseWordFormationAttempt('fortunately', 'unfortunately', 'FORTUNATE');
    expect(feedback).not.toBeNull();
    expect(feedback).toContain('negative');
    expect(feedback).toContain('unfortunately');
  });

  it('diagnoses when a student submits a person noun instead of an abstract noun', () => {
    const feedback = diagnoseWordFormationAttempt('scientist', 'science', 'SCIENCE');
    expect(feedback).not.toBeNull();
    expect(feedback).toContain('person noun');
  });
});

describe('Pillar 2 — Cambridge EGP Topic × CEFR Level Curriculum Matrix', () => {
  const coreTopics = GRAMMAR_TOPICS.filter(t => t !== 'My own choice');

  it('defines all 48 (8 Topics × 6 CEFR Levels) curriculum cells', () => {
    expect(coreTopics.length).toBe(8);
    for (const topic of coreTopics) {
      for (const level of CEFR_LEVELS) {
        const spec = getCefrTopicRuleSpec(topic, level);
        expect(spec).not.toBeNull();
        expect(spec!.classroomSummary.length).toBeGreaterThan(15);
        expect(spec!.allowedStructures.length).toBeGreaterThanOrEqual(1);
        expect(spec!.signatureErrorTraps.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('formats a structured prompt directive for AI sentence generation', () => {
    const directive = formatCefrPromptDirective('Conditionals', 'A2');
    expect(directive).toContain('CAMBRIDGE ENGLISH GRAMMAR PROFILE (EGP) MATRIX FOR "CONDITIONALS" AT CEFR A2');
    expect(directive).toContain('ALLOWED A2 STRUCTURES');
    expect(directive).toContain('STRICTLY FORBIDDEN ABOVE-LEVEL STRUCTURES');
  });

  it('checkCefrLevelViolation flags C1/B2 structures leaked into A1/A2 sentences', () => {
    const leakedThirdConditional = checkCefrLevelViolation(
      'Had I known about the delay, I would have taken an earlier train.',
      'A2'
    );
    expect(leakedThirdConditional.violated).toBe(true);

    const validA2Sentence = checkCefrLevelViolation(
      'If it rains tomorrow, we will stay at home and watch a film.',
      'A2'
    );
    expect(validA2Sentence.violated).toBe(false);
  });
});

describe('Pillar 3 — Deterministic Offline Grammar Engine & Distractor Sanitizer', () => {
  describe('Context-Sensitive Contraction Expansion', () => {
    it("disambiguates 's as 'has' before past participles vs 'is' elsewhere", () => {
      expect(expandEnglishContractions("She's lived in London for ten years").toLowerCase()).toBe(
        'she has lived in london for ten years'
      );
      expect(expandEnglishContractions("She's living in London right now").toLowerCase()).toBe(
        'she is living in london right now'
      );
      expect(expandEnglishContractions("He's been working all morning").toLowerCase()).toBe(
        'he has been working all morning'
      );
    });

    it("disambiguates 'd as 'had' before past participles vs 'would' before bare infinitives", () => {
      expect(expandEnglishContractions("They'd already eaten when we arrived").toLowerCase()).toBe(
        'they had already eaten when we arrived'
      );
      expect(expandEnglishContractions("They'd love to join us tonight").toLowerCase()).toBe(
        'they would love to join us tonight'
      );
      expect(expandEnglishContractions("I'd rather stay home tonight").toLowerCase()).toBe(
        'i would rather stay home tonight'
      );
    });
  });

  describe('UK / US Spelling Normalization', () => {
    it('normalizes British and American spelling pairs to identical canonical tokens', () => {
      expect(normalizeUkUsSpelling('organise')).toBe(normalizeUkUsSpelling('organize'));
      expect(normalizeUkUsSpelling('organised')).toBe(normalizeUkUsSpelling('organized'));
      expect(normalizeUkUsSpelling('organisation')).toBe(normalizeUkUsSpelling('organization'));
      expect(normalizeUkUsSpelling('colour')).toBe(normalizeUkUsSpelling('color'));
      expect(normalizeUkUsSpelling('travelled')).toBe(normalizeUkUsSpelling('traveled'));
      expect(normalizeUkUsSpelling('travelling')).toBe(normalizeUkUsSpelling('traveling'));
      expect(normalizeUkUsSpelling('centre')).toBe(normalizeUkUsSpelling('center'));
      expect(normalizeUkUsSpelling('defence')).toBe(normalizeUkUsSpelling('defense'));
    });

    it('integrates UK/US normalization into roundSettlement buildAcceptedAnswerSet', () => {
      const { acceptedSet } = buildAcceptedAnswerSet(
        {
          text: 'The charity is _____ a concert.',
          isCorrect: true,
          correction: 'The charity is organizing a concert.',
          explanation: 'Present participle needed.',
          grammarPhrase: 'is organizing a concert',
          questionType: 'wordFormation',
          baseWord: 'ORGANIZE',
          correctAnswer: 'organizing',
          acceptedAnswers: ['organizing'],
        },
        'wordFormation'
      );
      expect(acceptedSet.has('organizing')).toBe(true);
      expect(acceptedSet.has(normalizeUkUsSpelling('organising'))).toBe(true);
    });
  });

  describe('Movable Clause & Time-Marker Variants', () => {
    it('generates fronted and end-positioned variants for movable time markers and subordinate clauses', () => {
      const variants = getClauseOrderVariants('Yesterday, I went to the library');
      expect(variants).toContain('i went to the library yesterday');

      const subVariants = getClauseOrderVariants('When she arrived, everyone cheered');
      expect(subVariants).toContain('everyone cheered when she arrived');
    });
  });

  describe('3-Gate Binary Error-Span Diff Validator (evaluateBinaryCorrectionOffline)', () => {
    const originalFlawed = 'She have lived in London since five years.';
    const intendedFix = 'She has lived in London for five years.';
    const errorPhrase = 'have lived in London since';

    it('GATE 1: rejects the 1-letter unrelated typo exploit on an unfixed sentence', () => {
      // Previously, geminiService.ts:407 accepted any string within 15 chars of intendedFix!
      const exploitAttempt = 'She have lived in London since five yearz.';
      const res = evaluateBinaryCorrectionOffline(originalFlawed, exploitAttempt, intendedFix, errorPhrase);
      expect(res.isCorrect).toBe(false);
    });

    it('rejects a submission where the errorPhrase is still verbatim present', () => {
      const stillBroken = 'She have lived in London since five years ago.';
      const res = evaluateBinaryCorrectionOffline(originalFlawed, stillBroken, intendedFix, 'have lived');
      expect(res.isCorrect).toBe(false);
    });

    it('accepts exact, contraction, and UK/US spelling variants of the intended fix', () => {
      const contracted = "She's lived in London for five years.";
      const res = evaluateBinaryCorrectionOffline(originalFlawed, contracted, intendedFix, errorPhrase);
      expect(res.isCorrect).toBe(true);
    });

    it('accepts movable time-marker / clause order variants', () => {
      const orig = 'Yesterday I go to the market with my brother.';
      const intended = 'Yesterday, I went to the market with my brother.';
      const student = 'I went to the market with my brother yesterday.';
      const res = evaluateBinaryCorrectionOffline(orig, student, intended, 'go');
      expect(res.isCorrect).toBe(true);
    });

    it('accepts valid grammatical repair equivalents (e.g., despite <-> in spite of, should <-> ought to)', () => {
      const orig = 'Despite of the heavy rain, the match continued.';
      const intended = 'Despite the heavy rain, the match continued.';
      const student = 'In spite of the heavy rain, the match continued.';
      const res = evaluateBinaryCorrectionOffline(orig, student, intended, 'Despite of');
      expect(res.isCorrect).toBe(true);
    });
  });

  describe('Word Formation & Open Cloze Offline Evaluators', () => {
    it('accepts UK/US spelling variants in Word Formation and rejects unchanged base words', () => {
      const ukAttempt = evaluateWordFormationOffline('unfavourable', 'unfavorable', ['unfavorable'], 'FAVOR');
      expect(ukAttempt.isCorrect).toBe(true);
      expect(ukAttempt.marks).toBe(1);

      const unchangedAttempt = evaluateWordFormationOffline('favor', 'unfavorable', ['unfavorable'], 'FAVOR');
      expect(unchangedAttempt.isCorrect).toBe(false);
      expect(unchangedAttempt.marks).toBe(0);
    });

    it('provides pinpoint POS feedback when a student uses the wrong member of a word family', () => {
      const wrongPos = evaluateWordFormationOffline('decisive', 'decision', ['decision'], 'DECIDE');
      expect(wrongPos.isCorrect).toBe(false);
      expect(wrongPos.feedback).toContain('positive adjective');
      expect(wrongPos.feedback).toContain('noun');
    });

    it('accepts unambiguous grammatical equivalents in Open Cloze when structurally valid', () => {
      const res = evaluateOpenClozeOffline(
        'though',
        'although',
        ['although'],
        '_____ the weather was freezing, they went swimming.'
      );
      expect(res.isCorrect).toBe(true);
      expect(res.marks).toBe(1);
    });
  });

  describe('CLOTH-Inspired Multiple-Choice Distractor Sanitizer', () => {
    it('strips distractors that are synonyms/equivalents of correctAnswer and replenishes to 4 distinct options', () => {
      const sanitized = sanitizeMultipleChoiceDistractors(
        'although',
        ['although', 'though', 'despite', 'because'],
        ['although', 'even though']
      );
      expect(sanitized.length).toBe(4);
      expect(sanitized.map(o => o.toLowerCase())).toContain('although');
      expect(sanitized.map(o => o.toLowerCase())).not.toContain('though');
    });
  });
});
