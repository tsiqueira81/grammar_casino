import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildBatchGradeRequest,
  buildBlindCheckRequest,
  buildCorrectionGradeRequest,
  evaluateBatchGrade,
  evaluateBlindCheckItem,
  evaluateCorrectionGrade,
  precheckKwtCandidate,
  precheckOpenClozeCandidate,
  precheckWordFormationCandidate,
  supportsDecisionBlindCheck,
  type DecisionAnswersMap,
} from '../server/decisionRubrics';
import {
  isDecisionEnabled,
  setDecisionRunner,
} from '../server/decisionEngine';

const KEYS = {
  GROQ_API_KEY: 'gsk_test_only',
  GEMINI_API_KEY: 'AIza_test_gemini',
};
const ENV_KEYS = ['GROQ_API_KEY', 'GROQ_API_KEY_2', 'NVIDIA_API_KEY', 'NVIDIA_CHECKER_API_KEY', 'GEMINI_API_KEY', 'API_KEY', 'AI_DECISION_ENABLED', 'GEMINI_DECISION_MODEL'];

let server: typeof import('../server');
let providers: typeof import('../server/providers');
let groqUtils: typeof import('../utils/groqUtils');
let limits: typeof import('../server/limits');
const savedEnv: Record<string, string | undefined> = {};

beforeAll(async () => {
  process.env.CF_PAGES = '1';
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  server = await import('../server');
  providers = await import('../server/providers');
  groqUtils = await import('../utils/groqUtils');
  limits = await import('../server/limits');
});

afterAll(() => {
  setDecisionRunner(null);
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.unstubAllGlobals();
});

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, KEYS);
  providers.aiBreaker.reset();
  groqUtils.clearGroqKeyCooldowns();
  limits.responseCache.clear();
  setDecisionRunner(null);
  vi.unstubAllGlobals();
});

const noul = (p: number) => ({ type: 'noul' as const, noul: p, confidence: Math.max(p, 1 - p) });
const score = (s: number, confidence = 0.8) => ({ type: 'score' as const, score: s, confidence });

let ipSeq = 1;
const postGemini = (body: object) =>
  server.dispatchServerlessApi(
    new Request('https://example.test/api/gemini', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    `10.91.${Math.floor(++ipSeq / 200)}.${ipSeq % 200}`
  );

const metaOf = (res: Response) => JSON.parse(res.headers.get('x-ai-meta') || '{}');

describe('Decision 1 pure rubrics & calibrated gates', () => {
  it('supports closed-ended blind checking for binary, multipleChoice, and keyWordTransformation only', () => {
    expect(supportsDecisionBlindCheck('binary')).toBe(true);
    expect(supportsDecisionBlindCheck('multipleChoice')).toBe(true);
    expect(supportsDecisionBlindCheck('keyWordTransformation')).toBe(true);
    expect(supportsDecisionBlindCheck('openCloze')).toBe(false);
    expect(supportsDecisionBlindCheck('wordFormation')).toBe(false);
  });

  it('keeps binary and multipleChoice blind check inputs completely free of answer keys', () => {
    const binaryReq = buildBlindCheckRequest([
      {
        id: 0,
        type: 'binary',
        level: 'B1',
        item: {
          text: 'She has went to Lisbon twice.',
          isCorrect: false,
          correction: 'She has gone to Lisbon twice.',
          explanation: 'Past participle of go is gone.',
        },
      },
    ]);
    const binInput = binaryReq.input.map((b) => b.text).join('\n');
    expect(binInput).not.toContain('gone');
    expect(binInput).not.toContain('isCorrect');
    expect(binInput).not.toContain('Past participle');

    const mcReq = buildBlindCheckRequest([
      {
        id: 0,
        type: 'multipleChoice',
        level: 'B1',
        item: {
          text: 'She is interested _____ marine biology.',
          options: ['in', 'on', 'at', 'by'],
          correctAnswer: 'in',
          explanation: 'Interested takes in.',
        },
      },
    ]);
    const mcInput = mcReq.input.map((b) => b.text).join('\n');
    expect(mcInput).not.toContain('correctAnswer');
    expect(mcInput).not.toContain('Interested takes in');
    expect(Object.keys(mcReq.questions)).toEqual(['i0_opt0', 'i0_opt1', 'i0_opt2', 'i0_opt3', 'i0_cefr']);
  });

  it('binary blind check accepts clear valid/flawed items and rejects ambiguous gray-zone sentences', () => {
    const validEntry = { id: 0, type: 'binary' as const, level: 'B1', item: { text: 'She has lived in Lisbon since 2019.', isCorrect: true } };
    const flawedEntry = { id: 0, type: 'binary' as const, level: 'B1', item: { text: 'She have went to Lisbon.', isCorrect: false } };

    expect(evaluateBlindCheckItem(validEntry, { i0_gram: noul(0.91), i0_cefr: score(2.0) }).ok).toBe(true);
    expect(evaluateBlindCheckItem(validEntry, { i0_gram: noul(0.68), i0_cefr: score(2.0) }).ok).toBe(true);
    expect(evaluateBlindCheckItem(flawedEntry, { i0_gram: noul(0.08), i0_cefr: score(2.0) }).ok).toBe(true);
    expect(evaluateBlindCheckItem(flawedEntry, { i0_gram: noul(0.33), i0_cefr: score(2.0) }).ok).toBe(true);

    // Gray zone (0.35..0.65) rejected as ambiguous
    const borderlineValid = evaluateBlindCheckItem(validEntry, { i0_gram: noul(0.54), i0_cefr: score(2.0) });
    expect(borderlineValid.ok).toBe(false);
    expect(borderlineValid.reasons[0]).toMatch(/ambiguous grammaticality/);

    const borderlineFlawed = evaluateBlindCheckItem(flawedEntry, { i0_gram: noul(0.45), i0_cefr: score(2.0) });
    expect(borderlineFlawed.ok).toBe(false);
    expect(borderlineFlawed.reasons[0]).toMatch(/ambiguous flaw/);
  });

  it('multipleChoice rejects accidentally valid distractors and weak keys', () => {
    const entry = {
      id: 0,
      type: 'multipleChoice' as const,
      level: 'B2',
      item: { text: 'He decided to _____ the meeting until Monday.', options: ['postpone', 'delay', 'cancel', 'forget'], correctAnswer: 'postpone' },
    };
    const clean = evaluateBlindCheckItem(entry, {
      i0_opt0: noul(0.94),
      i0_opt1: noul(0.12),
      i0_opt2: noul(0.08),
      i0_opt3: noul(0.04),
      i0_cefr: score(3.0),
    });
    expect(clean.ok).toBe(true);

    // Distractor B ("delay") also looks valid -> reject!
    const dualValid = evaluateBlindCheckItem(entry, {
      i0_opt0: noul(0.92),
      i0_opt1: noul(0.71),
      i0_opt2: noul(0.10),
      i0_opt3: noul(0.05),
      i0_cefr: score(3.0),
    });
    expect(dualValid.ok).toBe(false);
    expect(dualValid.reasons[0]).toMatch(/distractor B also looks valid/);
  });

  it('keyWordTransformation blind check validates meaning, naturalness, and two-half split', () => {
    const entry = {
      id: 0,
      type: 'keyWordTransformation' as const,
      level: 'B2',
      item: {
        leadInSentence: 'I regret not studying harder for the exam.',
        text: 'I _____ harder for the exam.',
        baseWord: 'WISH',
        correctAnswer: 'wish I had studied',
        mark1Parts: ['wish I'],
        mark2Parts: ['had studied'],
      },
    };
    expect(
      evaluateBlindCheckItem(entry, {
        i0_meaning: noul(0.93),
        i0_natural: noul(0.95),
        i0_split: noul(0.88),
        i0_cefr: score(3.0),
      }).ok
    ).toBe(true);

    // Tuned thresholds (0.65 / 0.65 / 0.60) accept solid transformations that score around 0.70
    expect(
      evaluateBlindCheckItem(entry, {
        i0_meaning: noul(0.70),
        i0_natural: noul(0.70),
        i0_split: noul(0.62),
        i0_cefr: score(3.0),
      }).ok
    ).toBe(true);

    const badMeaning = evaluateBlindCheckItem(entry, {
      i0_meaning: noul(0.40),
      i0_natural: noul(0.92),
      i0_split: noul(0.85),
      i0_cefr: score(3.0),
    });
    expect(badMeaning.ok).toBe(false);
    expect(badMeaning.reasons[0]).toMatch(/meaning does not match/);

    const badSplit = evaluateBlindCheckItem(entry, {
      i0_meaning: noul(0.85),
      i0_natural: noul(0.90),
      i0_split: noul(0.55),
      i0_cefr: score(3.0),
    });
    expect(badSplit.ok).toBe(false);
    expect(badSplit.reasons[0]).toMatch(/two-half split/);
  });

  it('CEFR balanced drift gate allows 1-level adjacency and rejects 2+ level drift when confident', () => {
    const b1Entry = { id: 0, type: 'binary' as const, level: 'B1', item: { text: 'Hardly had she arrived when it started raining.', isCorrect: true } };
    // B2 (score 3.0) in a B1 game (idx 2): drift = 1.0 -> allowed
    expect(evaluateBlindCheckItem(b1Entry, { i0_gram: noul(0.95), i0_cefr: score(3.0, 0.85) }).ok).toBe(true);
    // C1 (score 4.0) in a B1 game (idx 2): drift = 2.0 >= 1.75 & conf 0.85 >= 0.55 -> rejected!
    const drifted = evaluateBlindCheckItem(b1Entry, { i0_gram: noul(0.95), i0_cefr: score(4.0, 0.85) });
    expect(drifted.ok).toBe(false);
    expect(drifted.reasons[0]).toMatch(/CEFR drift \(scored C1 for B1\)/);
    // Low confidence CEFR score does not falsely reject
    expect(evaluateBlindCheckItem(b1Entry, { i0_gram: noul(0.95), i0_cefr: score(4.0, 0.40) }).ok).toBe(true);
  });

  it('deterministic student grading pre-gates block invalid KWT, Open Cloze, and Word Formation inputs locally', () => {
    expect(precheckKwtCandidate('wish I had studied', 'WISH').passed).toBe(true);
    expect(precheckKwtCandidate('wished I had studied', 'WISH').passed).toBe(false);
    expect(precheckKwtCandidate('wish', 'WISH').passed).toBe(false);
    expect(precheckKwtCandidate('I really truly deeply wish I had studied', 'WISH').passed).toBe(false);

    expect(precheckOpenClozeCandidate('despite').passed).toBe(true);
    expect(precheckOpenClozeCandidate('in spite').passed).toBe(false);

    expect(precheckWordFormationCandidate('decision', 'DECIDE').passed).toBe(true);
    expect(precheckWordFormationCandidate('decide', 'DECIDE').passed).toBe(false);
    expect(precheckWordFormationCandidate('good decision', 'DECIDE').passed).toBe(false);
  });

  it('maps binary correction rubric sub-checks to diagnostic structured feedback', () => {
    const req = buildCorrectionGradeRequest({
      originalSentence: 'She have went home.',
      intendedCorrection: 'She has gone home.',
      userCorrection: 'She has gone home.',
    });
    expect(Object.keys(req.questions)).toEqual(['fixes_error', 'grammatically_natural', 'preserves_meaning', 'spelling_ok']);

    expect(
      evaluateCorrectionGrade({
        fixes_error: noul(0.95),
        grammatically_natural: noul(0.95),
        preserves_meaning: noul(0.92),
        spelling_ok: noul(0.98),
      })
    ).toMatchObject({ isCorrect: true, feedback: expect.stringMatching(/Valid fix/) });

    expect(
      evaluateCorrectionGrade({
        fixes_error: noul(0.90),
        grammatically_natural: noul(0.85),
        preserves_meaning: noul(0.90),
        spelling_ok: noul(0.20),
      })
    ).toMatchObject({ isCorrect: false, feedback: expect.stringMatching(/spelling/i) });

    expect(
      evaluateCorrectionGrade({
        fixes_error: noul(0.15),
        grammatically_natural: noul(0.25),
        preserves_meaning: noul(0.90),
        spelling_ok: noul(0.95),
      })
    ).toMatchObject({ isCorrect: false, feedback: expect.stringMatching(/original grammar/i) });
  });

  it('evaluates KWT batch candidates on independent 1+1 halves with half-specific rubric feedback', () => {
    const params = {
      mode: 'keyWordTransformation' as const,
      sentenceWithBlank: 'I _____ harder for the exam.',
      intendedAnswer: 'wish I had studied',
      acceptedAnswers: ['wish I had studied'],
      candidates: ['wish I had studied', 'wish I studied', 'wishing I had study'],
      baseWord: 'WISH',
      leadInSentence: 'I regret not studying harder for the exam.',
      mark1Parts: ['wish I'],
      mark2Parts: ['had studied'],
    };
    const req = buildBatchGradeRequest(params);
    expect(Object.keys(req.questions)).toHaveLength(12);

    const graded = evaluateBatchGrade(params, {
      c0_h1_gram: noul(0.95), c0_h1_spell: noul(0.98), c0_h2_gram: noul(0.95), c0_h2_spell: noul(0.98),
      c1_h1_gram: noul(0.92), c1_h1_spell: noul(0.98), c1_h2_gram: noul(0.20), c1_h2_spell: noul(0.98),
      c2_h1_gram: noul(0.10), c2_h1_spell: noul(0.95), c2_h2_gram: noul(0.15), c2_h2_spell: noul(0.95),
    });

    expect(graded['wish i had studied']).toMatchObject({ isCorrect: true, marks: 2 });
    expect(graded['wish i studied']).toMatchObject({ isCorrect: true, marks: 1, feedback: expect.stringMatching(/Half 1 is accurate.*Half 2/) });
    expect(graded['wishing i had study']).toMatchObject({ isCorrect: false, marks: 0 });
  });
});

describe('Decision 1 server integration, failover & kill-switch', () => {
  const validBinaryItem = {
    text: 'She has lived in Lisbon since 2019.',
    isCorrect: true,
    correction: 'She has lived in Lisbon since 2019.',
    explanation: 'Present perfect with since and a point in time.',
    grammarPhrase: 'has lived',
    errorPhrase: '',
    mistakeType: '',
  };

  const validKwtItem = {
    leadInSentence: 'I regret not studying harder for the exam.',
    text: 'I _____ harder for the exam.',
    baseWord: 'WISH',
    correctAnswer: 'wish I had studied',
    acceptedAnswers: ['wish I had studied'],
    mark1Parts: ['wish I'],
    mark2Parts: ['had studied'],
    correction: 'I wish I had studied harder for the exam.',
    explanation: 'Use wish + past perfect for past regrets.',
    grammarPhrase: 'wish I had studied',
    isCorrect: true,
  };

  function mockGroqWriter(responsePayload: object) {
    const calls: Array<{ url: string; body: any }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body || '{}'));
        calls.push({ url: String(url), body });
        return new Response(
          JSON.stringify({ choices: [{ message: { content: JSON.stringify(responsePayload) } }], usage: { total_tokens: 15 } }),
          { status: 200 }
        );
      })
    );
    return calls;
  }

  it('uses Decision 1 as primary blind checker for single binary and KWT hands without calling Groq text checker', async () => {
    const groqCalls = mockGroqWriter(validKwtItem);
    const decisionCalls: number[] = [];
    setDecisionRunner(async (req, model) => {
      decisionCalls.push(Object.keys(req.questions).length);
      return {
        model,
        answers: {
          i0_meaning: noul(0.94),
          i0_natural: noul(0.95),
          i0_split: noul(0.89),
          i0_cefr: score(3.0, 0.8),
        },
      };
    });

    const res = await postGemini({
      action: 'generateSentence',
      settings: { topic: 'Wishes & Regrets', level: 'B2', theme: 'Education' },
      questionType: 'keyWordTransformation',
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checkedBy).toBe('two models');
    expect(groqCalls).toHaveLength(1); // Writer only; no text checker call!
    expect(decisionCalls).toEqual([5]); // meaning, natural, split, cefr, topic
    expect(metaOf(res)).toMatchObject({ verifiedBy: 'gemini-decision-1', verified: 'yes' });
  });

  it('rejects a single binary sentence with 422 fallback when Decision 1 flags ambiguity', async () => {
    mockGroqWriter(validBinaryItem);
    setDecisionRunner(async (_req, model) => ({
      model,
      answers: { i0_gram: noul(0.51), i0_cefr: score(2.0, 0.8) },
    }));

    const res = await postGemini({
      action: 'generateSentence',
      settings: { topic: 'Present Perfect', level: 'B1', theme: 'Travel' },
      questionType: 'binary',
      forceCorrect: true,
    });

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.fallback).toBe(true);
    expect(body.error).toMatch(/ambiguous grammaticality/);
    expect(metaOf(res).verifiedBy).toBe('gemini-decision-1');
    expect(metaOf(res).fallbackReason).toContain('p=0.51');
  });

  it('verifies a multi-item batch in ONE Decision 1 call and drops only rejected items', async () => {
    const secondItem = {
      ...validBinaryItem,
      text: 'Hardly had they arrived at the station when the train departed.',
      correction: 'Hardly had they arrived at the station when the train departed.',
      grammarPhrase: 'Hardly had they arrived',
    };
    const groqCalls = mockGroqWriter({ items: [validBinaryItem, secondItem] });
    let questionCount = 0;
    setDecisionRunner(async (req, model) => {
      questionCount = Object.keys(req.questions).length;
      const answers: DecisionAnswersMap = {
        i0_gram: noul(0.95),
        i0_cefr: score(2.1, 0.85), // B1 matches B1
        i1_gram: noul(0.96),
        i1_cefr: score(4.3, 0.88), // C1/C2 drifts 2+ levels above B1!
      };
      return { model, answers };
    });

    const res = await postGemini({
      action: 'generateSentenceBatch',
      settings: { topic: 'Present Perfect', level: 'B1', theme: 'Travel' },
      questionType: 'binary',
      slots: [
        { forceCorrect: true, theme: 'Travel' },
        { forceCorrect: true, theme: 'Travel' },
      ],
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(groqCalls).toHaveLength(1);
    expect(questionCount).toBe(6); // 2 items × (gram, cefr, topic)
    expect(data.items).toHaveLength(1);
    expect(data.rejected).toBe(1);
    expect(data.items[0].checkedBy).toBe('two models');
    expect(metaOf(res)).toMatchObject({ verifiedBy: 'gemini-decision-1' });
    expect(metaOf(res).fallbackReason).toContain('batch: 1 kept, 1 replaced (item 2: CEFR drift (scored C1 for B1))');
  });

  it('summarizes multi-item batch rejection categories cleanly in X-AI-Meta', async () => {
    const item2 = { ...validBinaryItem, text: 'Hardly had they arrived at the station when the train departed.', correction: 'Hardly had they arrived at the station when the train departed.', grammarPhrase: 'Hardly had they arrived' };
    const item3 = { ...validBinaryItem, text: 'The museum has opened a brand new gallery downtown.', correction: 'The museum has opened a brand new gallery downtown.', grammarPhrase: 'has opened' };
    const item4 = { ...validBinaryItem, text: 'Our class has visited three different castles since April.', correction: 'Our class has visited three different castles since April.', grammarPhrase: 'has visited' };
    mockGroqWriter({ items: [validBinaryItem, item2, item3, item4] });
    setDecisionRunner(async (_req, model) => ({
      model,
      answers: {
        i0_gram: noul(0.92), i0_cefr: score(2.0, 0.85), // kept
        i1_gram: noul(0.95), i1_cefr: score(4.2, 0.88), // CEFR drift
        i2_gram: noul(0.52), i2_cefr: score(2.0, 0.80), // ambiguous
        i3_gram: noul(0.49), i3_cefr: score(2.0, 0.80), // ambiguous
      },
    }));

    const res = await postGemini({
      action: 'generateSentenceBatch',
      settings: { topic: 'Present Perfect', level: 'B1', theme: 'Travel' },
      questionType: 'binary',
      slots: [
        { forceCorrect: true, theme: 'Travel' },
        { forceCorrect: true, theme: 'Travel' },
        { forceCorrect: true, theme: 'Travel' },
        { forceCorrect: true, theme: 'Travel' },
      ],
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.items).toHaveLength(1);
    expect(data.rejected).toBe(3);
    expect(metaOf(res).fallbackReason).toBe('batch: 1 kept, 3 replaced (2 ambiguous, 1 CEFR drift)');
  });

  it('falls back seamlessly to Groq text checker when Decision 1 hits 429 and rests only gemini-decision breaker', async () => {
    const calls: any[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body || '{}'));
        calls.push(body);
        const prompt = String(body.messages?.[1]?.content || '');
        const isTextChecker = /examiner\. Answer only from the text/.test(prompt);
        const content = isTextChecker
          ? JSON.stringify({ grammatical: true, correction: validBinaryItem.text, acceptable: [] })
          : JSON.stringify(validBinaryItem);
        return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { total_tokens: 10 } }), { status: 200 });
      })
    );

    setDecisionRunner(async () => {
      throw Object.assign(new Error('429 Resource exhausted'), { status: 429, retryAfterMs: 60_000 });
    });

    const res = await postGemini({
      action: 'generateSentence',
      settings: { topic: 'Present Perfect', level: 'B1', theme: 'Travel' },
      questionType: 'binary',
      forceCorrect: true,
    });

    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2); // Writer + Groq fallback text checker
    expect(providers.aiBreaker.isOpen('gemini-decision')).toBe(true);
    expect(providers.aiBreaker.isOpen('gemini')).toBe(false); // General Gemini breaker stays untouched!
    expect(metaOf(res).fallbackReason).toMatch(/gemini-decision 429 busy/);
  });

  it('grades verifyCorrection via Decision 1 and serves cached duplicate submissions with zero repeat calls', async () => {
    let decisionRuns = 0;
    setDecisionRunner(async (_req, model) => {
      decisionRuns++;
      return {
        model,
        answers: {
          fixes_error: noul(0.95),
          grammatically_natural: noul(0.93),
          preserves_meaning: noul(0.91),
          spelling_ok: noul(0.97),
        },
      };
    });

    const payload = {
      action: 'verifyCorrection',
      originalSentence: 'She have went to Lisbon.',
      intendedCorrection: 'She has gone to Lisbon.',
      userCorrection: 'She has gone to Lisbon.',
    };

    const first = await postGemini(payload);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ isCorrect: true, feedback: expect.stringMatching(/Valid fix/) });
    expect(metaOf(first)).toMatchObject({ provider: 'gemini', model: 'gemini-decision-1' });
    expect(decisionRuns).toBe(1);

    // Identical answer with extra whitespace hits cache -> 0 extra Decision 1 calls!
    const second = await postGemini({ ...payload, userCorrection: '  she has   gone to Lisbon. ' });
    expect(second.status).toBe(200);
    expect(metaOf(second).provider).toBe('cache');
    expect(decisionRuns).toBe(1);
  });

  it('grades verifyOpenClozeBatch via deterministic pre-gates + ONE Decision 1 call for remaining candidates', async () => {
    let evaluatedQuestions: string[] = [];
    setDecisionRunner(async (req, model) => {
      evaluatedQuestions = Object.keys(req.questions);
      return {
        model,
        answers: {
          c0_h1_gram: noul(0.95),
          c0_h1_spell: noul(0.98),
          c0_h2_gram: noul(0.94),
          c0_h2_spell: noul(0.98),
        },
      };
    });

    const res = await postGemini({
      action: 'verifyOpenClozeBatch',
      questionType: 'keyWordTransformation',
      leadInSentence: 'I regret not studying harder.',
      sentenceWithBlank: 'I _____ harder.',
      baseWord: 'WISH',
      intendedAnswer: 'wish I had studied',
      acceptedAnswers: ['wish I had studied'],
      mark1Parts: ['wish I'],
      mark2Parts: ['had studied'],
      candidateWords: [
        'wish I had studied', // passes pre-gate -> sent to Decision 1 as c0
        'wished I had studied', // fails pre-gate locally (altered key word) -> 0 marks without AI!
        'wish', // fails pre-gate locally (< 2 words) -> 0 marks without AI!
      ],
    });

    expect(res.status).toBe(200);
    const { results } = await res.json();
    expect(evaluatedQuestions).toEqual(['c0_h1_gram', 'c0_h1_spell', 'c0_h2_gram', 'c0_h2_spell']);
    expect(results['wish i had studied']).toMatchObject({ isCorrect: true, marks: 2 });
    expect(results['wished i had studied']).toMatchObject({ isCorrect: false, marks: 0, feedback: expect.stringMatching(/key word/i) });
    expect(results['wish']).toMatchObject({ isCorrect: false, marks: 0, feedback: expect.stringMatching(/2 and 6 words/i) });
    expect(metaOf(res)).toMatchObject({ provider: 'gemini', model: 'gemini-decision-1' });
  });

  it('respects AI_DECISION_ENABLED=false kill-switch, placeholder keys, and missing GEMINI_API_KEY zero-latency bypass', () => {
    expect(isDecisionEnabled()).toBe(true);
    process.env.AI_DECISION_ENABLED = 'false';
    expect(isDecisionEnabled()).toBe(false);
    delete process.env.AI_DECISION_ENABLED;
    process.env.GEMINI_API_KEY = 'MY_GEMINI_API_KEY';
    expect(isDecisionEnabled()).toBe(false);
    process.env.GEMINI_API_KEY = 'YOUR_API_KEY';
    expect(isDecisionEnabled()).toBe(false);
    delete process.env.GEMINI_API_KEY;
    expect(isDecisionEnabled()).toBe(false);
  });

  it('surfaces sanitized 400 error details and immediately rests gemini-decision on an invalid API key', async () => {
    mockGroqWriter({ isCorrect: true, feedback: 'Looks good.' });
    setDecisionRunner(async () => {
      throw Object.assign(
        new Error('400 API error occurred: Body: {"error":{"code":400,"message":"API key not valid. Please pass a valid API key."}}'),
        { status: 400 }
      );
    });

    const res = await postGemini({
      action: 'verifyCorrection',
      originalSentence: 'She have went home.',
      intendedCorrection: 'She has gone home.',
      userCorrection: 'She has gone home.',
    });

    expect(res.status).toBe(200);
    expect(providers.aiBreaker.isOpen('gemini-decision')).toBe(true);
    expect(providers.aiBreaker.isOpen('gemini')).toBe(false);
    expect(metaOf(res).fallbackReason).toContain('gemini-decision 400 (API key not valid. Please pass a valid API key.)');
  });

  it('caps live single-hand Decision 1 timeout to <= 3.5 s and fails over cleanly to Groq text checker on timeout', async () => {
    let seenTimeoutMs = 0;
    const calls: any[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body || '{}'));
        calls.push(body);
        const prompt = String(body.messages?.[1]?.content || '');
        const isTextChecker = /examiner\. Answer only from the text/.test(prompt);
        const content = isTextChecker
          ? JSON.stringify({ grammatical: true, correction: validBinaryItem.text, acceptable: [] })
          : JSON.stringify(validBinaryItem);
        return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { total_tokens: 10 } }), { status: 200 });
      })
    );

    setDecisionRunner(async (_req, _model, timeoutMs) => {
      seenTimeoutMs = timeoutMs;
      const err: any = new Error('The operation was aborted due to timeout');
      err.name = 'AbortError';
      throw err;
    });

    const res = await postGemini({
      action: 'generateSentence',
      settings: { topic: 'Present Perfect', level: 'B1', theme: 'Travel' },
      questionType: 'binary',
      forceCorrect: true,
    });

    expect(res.status).toBe(200);
    expect(seenTimeoutMs).toBeGreaterThan(0);
    expect(seenTimeoutMs).toBeLessThanOrEqual(3_500);
    expect(calls).toHaveLength(2); // Writer + Groq fallback text checker
    expect(metaOf(res).fallbackReason).toContain('gemini-decision timeout');
  });

  it('rejects an off-topic Third Conditional for "Past Simple vs Present Perfect" via Decision 1 topic gate', async () => {
    const offTopicItem = {
      text: 'If I had watched the finale, I would have known the twist.',
      isCorrect: true,
      correction: 'If I had watched the finale, I would have known the twist.',
      explanation: 'Third conditional describes an unreal past result.',
      grammarPhrase: 'If I had watched',
      errorPhrase: '',
      mistakeType: '',
    };
    const onTopicRetry = {
      text: 'I watched the finale last night and immediately texted my friends.',
      isCorrect: true,
      correction: 'I watched the finale last night and immediately texted my friends.',
      explanation: 'Use Past Simple with finished past time markers like "last night".',
      grammarPhrase: 'watched the finale last night',
      errorPhrase: '',
      mistakeType: '',
    };

    let writerCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        writerCalls++;
        const payload = writerCalls === 1 ? offTopicItem : onTopicRetry;
        return new Response(
          JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }], usage: { total_tokens: 20 } }),
          { status: 200 }
        );
      })
    );

    let decCalls = 0;
    setDecisionRunner(async (req, model) => {
      decCalls++;
      expect(req.questions.i0_topic).toBeDefined();
      const answers: DecisionAnswersMap =
        decCalls === 1
          ? { i0_gram: noul(0.98), i0_cefr: score(2.5, 0.8), i0_topic: noul(0.04) }
          : { i0_gram: noul(0.97), i0_cefr: score(2.0, 0.85), i0_topic: noul(0.96) };
      return { model, answers };
    });

    const res = await postGemini({
      action: 'generateSentence',
      settings: { topic: 'Past Simple vs Present Perfect', level: 'B1', theme: 'Pop Culture' },
      questionType: 'binary',
      forceCorrect: true,
    });

    expect(res.status).toBe(200);
    expect(writerCalls).toBe(2);
    expect(decCalls).toBe(2);
    const body = await res.json();
    expect(body.text).toBe(onTopicRetry.text);
  });
});


