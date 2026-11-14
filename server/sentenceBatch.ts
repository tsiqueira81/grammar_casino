// Up to 15 grammar items in one request (2026-11-14), so a lesson uses few requests and stays far
// below each provider's daily limit. The game asks for a batch ahead of time, while a hand is being
// played, never while the class waits. One writer writes the whole batch in one call; a different
// model then answers every item blind in one call (package L3), and only the items it agrees with
// go back to the game. The rest are simply missing: the game makes or draws those hands as before.
import { Type } from '@google/genai';
import type { GeneratedSentence, QuestionType } from '../types';
import { NEAR_DUPLICATE, similarity } from '../content/audit';
import { buildSentencePrompt, type ServerQuestionType } from './sentencePrompt';
import { getSentenceSchema } from './sentenceSchemas';
import { enforceKeyWordTransformationIntegrity, enforceMultipleChoiceIntegrity, enforceOpenClozeIntegrity, enforceWordFormationIntegrity } from './sentenceIntegrity';
import { judge, quickProblems, verifierPrompt, verifierSchema, type VerifierAnswer } from './verifyItem';
import type { AiMeta } from './providers';

export const MAX_BATCH = 15;

export interface BatchSlot {
  /** Binary only: must the sentence be correct (true) or contain one mistake (false)? */
  forceCorrect?: boolean | null;
  subtype?: string | null;
  theme?: string;
}

export interface BatchPayload {
  settings: { topic: string; level: string; theme?: string };
  questionType?: string;
  slots: BatchSlot[];
  pastSentences?: unknown[];
  pastMistakes?: unknown[];
}

/** What a batch item carries back, so the game knows which slot it fills. */
export type BatchItem = GeneratedSentence & { batchSlot: number; writtenFor: string | null; theme: string };

const clip = (s: unknown, n: number) => String(s ?? '').slice(0, n);

export function cleanSlots(raw: unknown, fallbackTheme: string): BatchSlot[] {
  const list = Array.isArray(raw) ? raw.slice(0, MAX_BATCH) : [];
  return list.map((s: any) => ({
    forceCorrect: typeof s?.forceCorrect === 'boolean' ? s.forceCorrect : null,
    subtype: s?.subtype ? clip(s.subtype, 140) : null,
    theme: clip(s?.theme || fallbackTheme, 80),
  }));
}

/** The one-item prompt, plus the list of items wanted. Each item's line overrides the settings above. */
export function batchPrompt(payload: BatchPayload, slots: BatchSlot[]): { prompt: string; type: ServerQuestionType; level: string } {
  const theme = slots[0]?.theme || payload.settings.theme || 'Everyday Life';
  const base = buildSentencePrompt({
    settings: { ...payload.settings, theme },
    pastSentences: payload.pastSentences,
    pastMistakes: payload.pastMistakes,
    forceCorrect: null,
    subtype: null,
    questionType: payload.questionType,
  });
  const lines = slots.map((slot, i) => {
    const parts = [`theme "${slot.theme}"`];
    if (base.resolvedQuestionType === 'binary' && typeof slot.forceCorrect === 'boolean') {
      parts.push(slot.forceCorrect ? 'the sentence MUST be 100% correct' : 'the sentence MUST contain exactly one error');
    }
    if (slot.subtype) parts.push(`structure focus: "${slot.subtype}"`);
    return `Item ${i + 1}: ${parts.join('; ')}.`;
  });
  const prompt = `${base.prompt}

=== BATCH: WRITE ${slots.length} ITEMS ===
Write ${slots.length} different items. Every item follows ALL the rules above. Where an item below names a theme, a correctness or a structure focus, it replaces the matching setting above for that item only.
${lines.join('\n')}
No two items may share a scenario, main verb, key word or gap target.
Reply ONLY with JSON of the form {"items": [ item 1, item 2, ... ]} in this order, each item an object matching the schema.`;
  return { prompt, type: base.resolvedQuestionType, level: base.level };
}

export function batchSchema(type: ServerQuestionType) {
  return { type: Type.OBJECT, properties: { items: { type: Type.ARRAY, items: getSentenceSchema(type) } }, required: ['items'] };
}

export const batchVerifierSchema = {
  type: Type.OBJECT,
  properties: {
    answers: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { task: { type: Type.NUMBER }, ...verifierSchema.properties },
        required: ['task', ...verifierSchema.required],
      },
    },
  },
  required: ['answers'],
};

/** The blind check for many items: each task has the item without its key. */
export function batchVerifierPrompt(tasks: Array<{ task: number; prompt: string }>): string {
  return `You are a careful Cambridge English examiner. Answer each numbered task separately, only from its own text. Reply ONLY with JSON {"answers": [{"task": 1, "grammatical": ..., "correction": ..., "acceptable": [...]}, ...]} with one answer per task. Fill every field: "grammatical" and "correction" matter for sentence tasks, "acceptable" for gap tasks.

${tasks.map((t) => `--- Task ${t.task} ---\n${t.prompt}`).join('\n\n')}`;
}

/** The same clean-up a single item gets in aiHandler.ts. */
export function finishItem(data: any, type: ServerQuestionType): void {
  data.questionType = type;
  if (type === 'binary') {
    if (!data.isCorrect && !data.errorPhrase) data.errorPhrase = data.grammarPhrase;
  } else {
    data.isCorrect = true;
    if (type === 'multipleChoice') enforceMultipleChoiceIntegrity(data);
    if (type === 'openCloze') enforceOpenClozeIntegrity(data);
    if (type === 'wordFormation') enforceWordFormationIntegrity(data);
    if (type === 'keyWordTransformation') enforceKeyWordTransformationIntegrity(data);
  }
}

export interface BatchDeps {
  write: (req: { prompt: string; responseSchema: any; schemaName: string; maxCompletionTokens: number; kind: 'batch' }) => Promise<{ text: string; meta: AiMeta }>;
  checker: (meta: AiMeta) => { model: string; ask: ((prompt: string) => Promise<string>) | null };
}

export interface BatchResult {
  items: BatchItem[];
  rejected: number;
  reasons: string[];
  meta: AiMeta;
  checkedBy: string;
}

/** Writes, cleans and checks a batch. Items that fail any check are left out. */
export async function makeBatch(payload: BatchPayload, deps: BatchDeps): Promise<BatchResult> {
  const fallbackTheme = clip(payload.settings.theme || 'Everyday Life', 80);
  const slots = cleanSlots(payload.slots, fallbackTheme);
  if (!slots.length) throw Object.assign(new Error('A batch needs at least one item.'), { status: 400 });
  const { prompt, type, level } = batchPrompt(payload, slots);
  const response = await deps.write({
    prompt,
    responseSchema: batchSchema(type),
    schemaName: `sentence_batch_${type}`,
    maxCompletionTokens: Math.min(12_000, 400 + slots.length * 650),
    kind: 'batch',
  });
  const parsed = JSON.parse(response.text || '{}');
  const raw: any[] = Array.isArray(parsed?.items) ? parsed.items.slice(0, slots.length) : [];
  const reasons: string[] = [];
  const past = (Array.isArray(payload.pastSentences) ? payload.pastSentences : []).filter((t): t is string => typeof t === 'string').slice(-30);
  const accepted: Array<{ slot: number; item: any }> = [];

  raw.forEach((item, slot) => {
    if (!item || typeof item !== 'object') return void reasons.push(`item ${slot + 1}: not an item`);
    try {
      finishItem(item, type);
    } catch (e) {
      return void reasons.push(`item ${slot + 1}: ${e instanceof Error ? e.message.slice(0, 60) : 'broken'}`);
    }
    const problems = quickProblems(item, type as QuestionType, level);
    const seen = [...past, ...accepted.map((a) => a.item.text)];
    const copy = seen.find((t) => similarity(t, item.text || '') > NEAR_DUPLICATE);
    if (copy) problems.push('a near copy of another sentence');
    const want = slots[slot].forceCorrect;
    if (type === 'binary' && typeof want === 'boolean' && Boolean(item.isCorrect) !== want) problems.push('correct/flawed not as asked');
    if (problems.length) return void reasons.push(`item ${slot + 1}: ${problems[0]}`);
    accepted.push({ slot, item });
  });

  // One blind check for every item that needs one (key word transformation gets the rules only).
  const checker = deps.checker(response.meta);
  const tasks = accepted
    .map((a, i) => ({ i, prompt: verifierPrompt(a.item, type as QuestionType, false) }))
    .filter((t): t is { i: number; prompt: string } => Boolean(t.prompt));
  const answers = new Map<number, VerifierAnswer>();
  let checkFailed = '';
  if (tasks.length && checker.ask) {
    try {
      const out = JSON.parse(await checker.ask(batchVerifierPrompt(tasks.map((t, n) => ({ task: n + 1, prompt: t.prompt })))));
      const list: any[] = Array.isArray(out?.answers) ? out.answers : [];
      list.forEach((a, n) => {
        const taskNo = Number.isFinite(Number(a?.task)) ? Number(a.task) : n + 1;
        const t = tasks[taskNo - 1];
        if (t && !answers.has(t.i)) answers.set(t.i, a);
      });
    } catch (e) {
      checkFailed = `the checker did not answer (${e instanceof Error ? e.message.slice(0, 40) : 'error'})`;
    }
  }

  const items: BatchItem[] = [];
  accepted.forEach((a, i) => {
    const needsCheck = Boolean(checker.ask) && tasks.some((t) => t.i === i);
    if (needsCheck) {
      if (checkFailed) return void reasons.push(`item ${a.slot + 1}: ${checkFailed}`);
      const answer = answers.get(i);
      if (!answer) return void reasons.push(`item ${a.slot + 1}: the checker skipped it`);
      const verdict = judge(a.item, type as QuestionType, answer);
      if (!verdict.ok) return void reasons.push(`item ${a.slot + 1}: ${verdict.reasons[0]}`);
      if (verdict.extraAnswers.length) a.item.acceptedAnswers = Array.from(new Set([...(a.item.acceptedAnswers || []), ...verdict.extraAnswers]));
    }
    a.item.checkedBy = checker.ask ? 'two models' : 'rules';
    items.push({ ...a.item, batchSlot: a.slot, writtenFor: slots[a.slot].subtype || null, theme: slots[a.slot].theme || fallbackTheme });
  });
  if (raw.length < slots.length) reasons.push(`${slots.length - raw.length} items missing from the answer`);

  return {
    items,
    rejected: slots.length - items.length,
    reasons,
    meta: response.meta,
    checkedBy: checker.ask ? checker.model : 'rules only',
  };
}
