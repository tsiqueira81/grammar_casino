import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  contrastiveRivals,
  contrastiveSlotHint,
  extractContrastiveTargets,
  formatContrastivePromptDirective,
} from '../server/contrastiveTopic';
import { buildSentencePrompt } from '../server/sentencePrompt';
import { batchPrompt, summarizeBatchReasons } from '../server/sentenceBatch';
import { getSubtypesForTopic } from '../constants';
import { judge, quickProblems, verifyItem } from '../server/verifyItem';
import {
  buildBlindCheckRequest,
  evaluateBlindCheckItem,
  supportsDecisionBlindCheck,
  type DecisionAnswersMap,
} from '../server/decisionRubrics';
import { setDecisionRunner } from '../server/decisionEngine';

const noul = (p: number) => ({ type: 'noul' as const, noul: p, confidence: Math.max(p, 1 - p) });
const score = (s: number, confidence = 0.85) => ({ type: 'score' as const, score: s, confidence });

describe('extractContrastiveTargets', () => {
  it.each([
    ['can or must', ['can', 'must']],
    ['can vs must', ['can', 'must']],
    ['for vs. since', ['for', 'since']],
    ['make versus do', ['make', 'do']],
    ['can / must / should', ['can', 'must', 'should']],
    ['in, on, or at', ['in', 'on', 'at']],
    ['in, on, and at', ['in', 'on', 'at']],
    ['a, an, the', ['a', 'an', 'the']],
    ['Modals: can or must', ['can', 'must']],
    ['Prepositions (in, on, at)', ['in', 'on', 'at']],
    ['Difference between can and must', ['can', 'must']],
    ['can or must (A2 modals)', ['can', 'must']],
    ["can't or mustn't", ["can't", "mustn't"]],
    ['"for" vs "since"', ['for', 'since']],
  ])('parses "%s" into %j', (topic, expected) => {
    expect(extractContrastiveTargets(topic)).toEqual(expected);
  });

  it.each([
    'Comparatives and Superlatives',
    'Present Perfect vs Past Simple',
    'Active vs Passive',
    'Gerunds and Infinitives',
    'Food and Cooking',
    'Modal Verbs',
    'Mixed Grammar',
    'Connectors & Prepositions',
    'Collocations',
    '',
  ])('does not misclassify broad topic "%s" as single-word contrastive targets', (topic) => {
    expect(extractContrastiveTargets(topic)).toEqual([]);
  });

  it('computes rival words cleanly', () => {
    expect(contrastiveRivals(['can', 'must'], 'must')).toEqual(['can']);
    expect(contrastiveRivals(['in', 'on', 'at'], 'ON')).toEqual(['in', 'at']);
  });
});

describe('contrastive prompt & batch slot generation', () => {
  it('rotates assigned target on single-hand Open Cloze and injects disambiguation rules', () => {
    const round0 = buildSentencePrompt({
      settings: { topic: 'can or must', level: 'A2', theme: 'Technology' },
      questionType: 'openCloze',
      pastSentences: [],
    });
    const round1 = buildSentencePrompt({
      settings: { topic: 'can or must', level: 'A2', theme: 'Technology' },
      questionType: 'openCloze',
      pastSentences: ['Visitors must wear safety goggles.'],
    });
    expect(round0.contrastiveTargets).toEqual(['can', 'must']);
    expect(round0.prompt).toContain('CONTRASTIVE WORD-CHOICE RULE');
    expect(round0.prompt).toContain('"correctAnswer" MUST be "can"');
    expect(round1.prompt).toContain('"correctAnswer" MUST be "must"');
    expect(formatContrastivePromptDirective(['can', 'must'], 'multipleChoice', 'must')).toContain('"can" MUST appear');
  });

  it('balances targets across batch slots instead of banning repeated gap targets', () => {
    const bp = batchPrompt(
      {
        settings: { topic: 'can or must', level: 'A2', theme: 'Technology' },
        questionType: 'openCloze',
        slots: [],
      },
      [
        { theme: 'Technology' },
        { theme: 'Technology' },
        { theme: 'Technology' },
        { theme: 'Technology' },
      ]
    );
    expect(bp.contrastiveTargets).toEqual(['can', 'must']);
    expect(bp.prompt).toContain('Item 1: theme "Technology"; gap target MUST be "can"');
    expect(bp.prompt).toContain('Item 2: theme "Technology"; gap target MUST be "must"');
    expect(bp.prompt).toContain('Item 3: theme "Technology"; gap target MUST be "can"');
    expect(bp.prompt).toContain('Item 4: theme "Technology"; gap target MUST be "must"');
    expect(bp.prompt).not.toContain('key word or gap target');
  });

  it('provides scalar optional-vs-mandatory guidance for "should vs must"', () => {
    const directive = formatContrastivePromptDirective(['should', 'must'], 'openCloze', 'should');
    expect(directive).toContain('HOW TO SEPARATE "should" vs "must"');
    expect(directive).toContain('OPTIONAL, NOT mandatory');
    expect(directive).toContain('strictly mandatory');

    expect(contrastiveSlotHint('should', ['must'])).toContain('optional / not required');
    expect(contrastiveSlotHint('must', ['should'])).toContain('strictly mandatory and NOT optional advice');
  });

  it('keeps "Past Simple vs Present Perfect" strictly on topic without injecting competing grammar structures', () => {
    const subtypes = getSubtypesForTopic('Past Simple vs Present Perfect', 'B1');
    expect(subtypes.length).toBeGreaterThanOrEqual(8);
    for (const s of subtypes) {
      expect(s).toContain('Past Simple vs Present Perfect');
      expect(s).not.toMatch(/conditional|passive|causative|reported speech|past perfect/i);
    }

    const built = buildSentencePrompt({
      settings: { topic: 'Past Simple vs Present Perfect', level: 'B1', theme: 'Pop Culture' },
      questionType: 'binary',
      subtype: subtypes[0],
      pastSentences: [],
    });
    expect(built.prompt).toContain('STRICT TOPIC ADHERENCE ("Past Simple vs Present Perfect")');
    expect(built.prompt).toContain('CONTRASTIVE STRUCTURE FOCUS ("Past Simple vs Present Perfect")');
    expect(built.prompt).not.toContain('Do NOT default repeatedly to Simple Present or Simple Past!');
    expect(built.prompt).not.toContain('lexical/vocabulary category');

    expect(
      summarizeBatchReasons([
        'item 1: off-topic for "Past Simple vs Present Perfect" (p=0.04)',
        'item 2: off-topic for "Past Simple vs Present Perfect" (p=0.09)',
      ])
    ).toBe('2 off-topic');
  });
});

describe('contrastive verification (quick rules, text checker, and Decision 1)', () => {
  const ambiguousEngineer = {
    text: 'The engineer _____ test the battery before it works.',
    correctAnswer: 'must',
    acceptedAnswers: ['must'],
    correction: 'The engineer must test the battery before it works.',
    explanation: 'Use must to show necessity.',
    grammarPhrase: 'engineer must test',
    isCorrect: true,
  };

  const crispMust = {
    text: 'Visitors _____ wear safety goggles inside the lab because it is a strict rule.',
    correctAnswer: 'must',
    acceptedAnswers: ['must'],
    correction: 'Visitors must wear safety goggles inside the lab because it is a strict rule.',
    explanation: 'Use must for strict rules and obligations.',
    grammarPhrase: 'Visitors must wear',
    isCorrect: true,
  };

  it('quickProblems rejects wrong target or writer-listed rival in acceptedAnswers', () => {
    expect(
      quickProblems({ ...ambiguousEngineer, acceptedAnswers: ['must', 'can'] }, 'openCloze', 'A2', ['can', 'must'])
    ).toContain('rival target "can" is also listed as accepted');

    expect(
      quickProblems({ ...ambiguousEngineer, correctAnswer: 'should', acceptedAnswers: ['should'] }, 'openCloze', 'A2', ['can', 'must'])
    ).toContain('gap target "should" is not one of can / must');

    expect(quickProblems(crispMust, 'openCloze', 'A2', ['can', 'must'])).toEqual([]);
  });

  it('text checker judge rejects when a rival target fits OR when 4+ words fit any Open Cloze gap', async () => {
    // Exact bug from screenshot: checker returns ["must", "should", "can", "could", "might"]
    const vRival = judge(ambiguousEngineer, 'openCloze', { acceptable: ['must', 'should', 'can', 'could', 'might'] }, ['can', 'must']);
    expect(vRival.ok).toBe(false);
    expect(vRival.reasons[0]).toBe('rival target "can" also fits the gap');

    // Even without a contrastive topic, 4+ interchangeable words makes an Open Cloze gap too vague
    const vTooOpen = judge(ambiguousEngineer, 'openCloze', { acceptable: ['must', 'should', 'could', 'might'] }, []);
    expect(vTooOpen.ok).toBe(false);
    expect(vTooOpen.reasons[0]).toMatch(/gap is too open/);

    // Tight Open Cloze (1-3 valid synonyms, no rival) passes cleanly
    const vGood = await verifyItem(
      crispMust,
      'openCloze',
      'A2',
      async () => JSON.stringify({ acceptable: ['must'] }),
      [],
      ['can', 'must']
    );
    expect(vGood.ok).toBe(true);
  });

  it('Decision 1 supports contrastive Open Cloze blindly and rejects when a rival scores high', () => {
    expect(supportsDecisionBlindCheck('openCloze')).toBe(false);
    expect(supportsDecisionBlindCheck('openCloze', ['can', 'must'])).toBe(true);

    const entry = {
      id: 0,
      type: 'openCloze' as const,
      level: 'A2',
      item: ambiguousEngineer,
      contrastiveTargets: ['can', 'must'],
    };
    const req = buildBlindCheckRequest([entry]);
    const inputText = req.input.map((b) => b.text).join('\n');
    expect(inputText).not.toContain('correctAnswer');
    expect(inputText).not.toContain('Use must to show necessity');
    expect(Object.keys(req.questions)).toEqual(['i0_c0', 'i0_c1', 'i0_cefr']);

    // Both "can" (0.88) and "must" (0.95) fit -> rejected!
    const rejected = evaluateBlindCheckItem(entry, {
      i0_c0: noul(0.88),
      i0_c1: noul(0.95),
      i0_cefr: score(1.0),
    });
    expect(rejected.ok).toBe(false);
    expect(rejected.reasons[0]).toContain('rival target "can" also fits the gap (p=0.88)');

    // Only "must" (0.96) fits, "can" (0.11) fails -> accepted!
    const accepted = evaluateBlindCheckItem(
      { ...entry, item: crispMust },
      {
        i0_c0: noul(0.11),
        i0_c1: noul(0.96),
        i0_cefr: score(1.2),
      }
    );
    expect(accepted.ok).toBe(true);
  });

  it('summarizes rival-fits and too-open batch rejections cleanly', () => {
    expect(
      summarizeBatchReasons([
        'item 1: rival target "can" also fits the gap (p=0.88)',
        'item 2: rival target "must" also fits the gap (p=0.79)',
        'item 3: gap is too open (5 words fit)',
      ])
    ).toBe('2 rival fits, 1 too open');
  });
});

describe('end-to-end /api/gemini contrastive Open Cloze batch with Decision 1', () => {
  const ENV_KEYS = ['GROQ_API_KEY', 'NVIDIA_API_KEY', 'NVIDIA_CHECKER_API_KEY', 'GEMINI_API_KEY', 'API_KEY', 'AI_DECISION_ENABLED'];
  const saved: Record<string, string | undefined> = {};
  let server: typeof import('../server');
  let providers: typeof import('../server/providers');
  let groqUtils: typeof import('../utils/groqUtils');

  beforeAll(async () => {
    process.env.CF_PAGES = '1';
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    server = await import('../server');
    providers = await import('../server/providers');
    groqUtils = await import('../utils/groqUtils');
  });

  afterAll(() => {
    setDecisionRunner(null);
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
    process.env.GROQ_API_KEY = 'gsk_test_only';
    process.env.GEMINI_API_KEY = 'AIza_test_gemini';
    providers.aiBreaker.reset();
    groqUtils.clearGroqKeyCooldowns();
    setDecisionRunner(null);
    vi.unstubAllGlobals();
  });

  it('filters out ambiguous "can or must" batch items via Decision 1 and strips loose extra acceptedAnswers', async () => {
    const items = [
      {
        text: 'The engineer _____ test the battery before it works.',
        correctAnswer: 'must',
        acceptedAnswers: ['must'],
        correction: 'The engineer must test the battery before it works.',
        explanation: 'Use must for necessity.',
        grammarPhrase: 'engineer must test',
      },
      {
        text: 'Visitors _____ wear safety goggles inside the lab because it is a strict rule.',
        correctAnswer: 'must',
        acceptedAnswers: ['must', 'should'],
        correction: 'Visitors must wear safety goggles inside the lab because it is a strict rule.',
        explanation: 'Use must for strict rules.',
        grammarPhrase: 'Visitors must wear',
      },
      {
        text: 'Even at age five, Leo _____ swim across the whole pool without help.',
        correctAnswer: 'can',
        acceptedAnswers: ['can'],
        correction: 'Even at age five, Leo can swim across the whole pool without help.',
        explanation: 'Use can for ability.',
        grammarPhrase: 'Leo can swim',
      },
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items }) } }], usage: { total_tokens: 40 } }), { status: 200 })
      )
    );

    setDecisionRunner(async (_req, model) => {
      const answers: DecisionAnswersMap = {
        // Item 0: both can & must fit -> rejected!
        i0_c0: noul(0.89),
        i0_c1: noul(0.94),
        i0_cefr: score(1.0),
        // Item 1: only must fits -> kept!
        i1_c0: noul(0.10),
        i1_c1: noul(0.97),
        i1_cefr: score(1.2),
        // Item 2: only can fits -> kept!
        i2_c0: noul(0.96),
        i2_c1: noul(0.08),
        i2_cefr: score(1.0),
      };
      return { model, answers };
    });

    const res = await server.dispatchServerlessApi(
      new Request('https://example.test/api/gemini', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'generateSentenceBatch',
          settings: { topic: 'can or must', level: 'A2', theme: 'Everyday Life' },
          questionType: 'openCloze',
          slots: [
            { theme: 'Everyday Life' },
            { theme: 'Everyday Life' },
            { theme: 'Everyday Life' },
          ],
        }),
      }),
      '10.95.0.1'
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.items).toHaveLength(2);
    expect(data.rejected).toBe(1);
    expect(data.items[0].correctAnswer).toBe('must');
    expect(data.items[0].acceptedAnswers).toEqual(['must']); // loose "should" stripped
    expect(data.items[1].correctAnswer).toBe('can');
    expect(data.items[1].acceptedAnswers).toEqual(['can']);

    const meta = JSON.parse(res.headers.get('x-ai-meta') || '{}');
    expect(meta.verifiedBy).toBe('gemini-decision-1');
    expect(meta.fallbackReason).toContain('rival target can also fits the gap (p=0.89)');
  });

  it('auto-retries once on a single-hand Decision 1 rejection with the rejection feedback before falling back', async () => {
    const weakDraft = {
      text: 'Travelers _____ carry a lantern in the dark forest.',
      correctAnswer: 'should',
      acceptedAnswers: ['should'],
      correction: 'Travelers should carry a lantern in the dark forest.',
      explanation: 'Use should for advice.',
      grammarPhrase: 'Travelers should carry',
    };
    const crispRetry = {
      text: "It isn't mandatory, though travelers _____ carry a lantern in the dark forest.",
      correctAnswer: 'should',
      acceptedAnswers: ['should'],
      correction: "It isn't mandatory, though travelers should carry a lantern in the dark forest.",
      explanation: 'Use should for optional advice rather than strict obligation.',
      grammarPhrase: 'travelers should carry',
    };

    const promptsSeen: string[] = [];
    let writerCall = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) => {
        const body = JSON.parse(String((init as RequestInit)?.body || '{}'));
        const userMsg = body?.messages?.find((m: { role?: string }) => m.role === 'user')?.content || '';
        promptsSeen.push(String(userMsg));
        writerCall++;
        const payload = writerCall === 1 ? weakDraft : crispRetry;
        return new Response(
          JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }], usage: { total_tokens: 30 } }),
          { status: 200 }
        );
      })
    );

    let decisionCall = 0;
    setDecisionRunner(async (_req, model) => {
      decisionCall++;
      const answers: DecisionAnswersMap =
        decisionCall === 1
          ? { i0_c0: noul(0.91), i0_c1: noul(0.84), i0_cefr: score(2.0) }
          : { i0_c0: noul(0.95), i0_c1: noul(0.09), i0_cefr: score(2.1) };
      return { model, answers };
    });

    const res = await server.dispatchServerlessApi(
      new Request('https://example.test/api/gemini', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'generateSentence',
          settings: { topic: 'should vs must', level: 'B1', theme: 'Fantasy' },
          questionType: 'openCloze',
          pastSentences: [],
        }),
      }),
      '10.95.0.2'
    );

    expect(res.status).toBe(200);
    expect(writerCall).toBe(2);
    expect(decisionCall).toBe(2);
    expect(promptsSeen[1]).toContain('=== RETRY CORRECTION ===');
    expect(promptsSeen[1]).toContain('rival target "must" also fits the gap (p=0.84)');

    const data = await res.json();
    expect(data.text).toBe(crispRetry.text);
    expect(data.correctAnswer).toBe('should');
    expect(data.acceptedAnswers).toEqual(['should']);

    const meta = JSON.parse(res.headers.get('x-ai-meta') || '{}');
    expect(meta.verified).toBe('yes');
    expect(meta.verifiedBy).toBe('gemini-decision-1');
  });
});
