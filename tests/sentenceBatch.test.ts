import { describe, expect, it, vi } from 'vitest';
import { MAX_BATCH, batchPrompt, cleanSlots, makeBatch } from '../server/sentenceBatch';
import type { AiMeta } from '../server/providers';

// Up to 15 items in one request (2026-11-14): one call writes them, one blind call checks them,
// and only the items the checker agrees with go back to the game.
const make = (text: string, isCorrect = true) => ({
  text,
  isCorrect,
  correction: isCorrect ? text : text.replace('have went', 'have gone'),
  explanation: 'Present perfect: have/has plus the past participle.',
  grammarPhrase: isCorrect ? text.split(' ').slice(1, 3).join(' ') : 'have went',
  errorPhrase: isCorrect ? '' : 'have went',
  mistakeType: isCorrect ? '' : 'wrong participle',
});
const items = [
  make('She has lived in Lisbon since 2019.'),
  make('We have went to the museum twice this year.', false),
  make('They have just finished their science project.'),
];
const payload = {
  settings: { topic: 'Present Perfect', level: 'B1', theme: 'Travel' },
  questionType: 'binary',
  slots: [
    { forceCorrect: true, subtype: 'since and for', theme: 'Travel' },
    { forceCorrect: false, subtype: null, theme: 'History' },
    { forceCorrect: true, subtype: null, theme: 'Travel' },
  ],
};
const meta: AiMeta = { provider: 'nvidia', model: 'z-ai/glm-5.3-flash', latencyMs: 5 };

function deps(answers: object[] | Error, written: object[] = items) {
  const ask = vi.fn(async (_prompt: string) => {
    if (answers instanceof Error) throw answers;
    return JSON.stringify({ answers });
  });
  const write = vi.fn(async (_req: any) => ({ text: JSON.stringify({ items: written }), meta }));
  return { write, ask, deps: { write, checker: () => ({ model: 'minimaxai/minimax-m3.1-flash', ask }) } };
}
const yes = (t: number, text: string) => ({ task: t, grammatical: true, correction: text, acceptable: [] });

describe('a batch of sentences', () => {
  it('asks for every slot in one writer call and checks them all in one checker call', async () => {
    const d = deps([yes(1, items[0].text), { task: 2, grammatical: false, correction: items[1].correction, acceptable: [] }, yes(3, items[2].text)]);
    const out = await makeBatch(payload, d.deps);
    expect(d.write).toHaveBeenCalledTimes(1);
    expect(d.ask).toHaveBeenCalledTimes(1);
    expect(out.items.map((i) => i.batchSlot)).toEqual([0, 1, 2]);
    expect(out.items[0]).toMatchObject({ writtenFor: 'since and for', theme: 'Travel', checkedBy: 'two models' });
    expect(out.items[1].theme).toBe('History');
    expect(out.rejected).toBe(0);
  });

  it('leaves out an item the checker disagrees with, and keeps the rest', async () => {
    const d = deps([yes(1, items[0].text), yes(2, items[1].text), yes(3, items[2].text)]);
    const out = await makeBatch(payload, d.deps);
    expect(out.items.map((i) => i.batchSlot)).toEqual([0, 2]);
    expect(out.rejected).toBe(1);
    expect(out.reasons[0]).toMatch(/item 2/);
  });

  it('leaves out everything when the checker does not answer: nothing unchecked reaches students', async () => {
    const out = await makeBatch(payload, deps(new Error('timeout')).deps);
    expect(out.items).toEqual([]);
    expect(out.rejected).toBe(3);
  });

  it('leaves out an item that is correct when a flawed one was asked for', async () => {
    const written = [items[0], make('They have just finished their maths project.'), items[2]];
    const out = await makeBatch(payload, deps([yes(1, written[0].text), yes(2, written[1].text), yes(3, written[2].text)], written).deps);
    expect(out.items.map((i) => i.batchSlot)).toEqual([0, 2]);
  });

  it('leaves out an item that is not for school, before the checker sees it', async () => {
    const written = [items[0], items[1], make('They have just bought some beer for the party.')];
    const d = deps([yes(1, written[0].text), { task: 2, grammatical: false, correction: '', acceptable: [] }]);
    const out = await makeBatch(payload, { ...d.deps, write: async () => ({ text: JSON.stringify({ items: written }), meta }) });
    expect(out.items.map((i) => i.batchSlot)).toEqual([0, 1]);
    expect(d.ask.mock.calls[0][0]).not.toContain('beer');
  });

  it('never sends the answer key to the checker', async () => {
    const d = deps([yes(1, items[0].text)]);
    await makeBatch(payload, d.deps);
    const prompt = d.ask.mock.calls[0][0];
    expect(prompt).not.toContain('Present perfect: have/has');
    expect(prompt).not.toContain('isCorrect');
  });

  it('a near copy of a sentence already played is left out', async () => {
    // Tasks are numbered after the quick checks: task 1 is item 2 here.
    const d = deps([{ task: 1, grammatical: false, correction: '', acceptable: [] }, yes(2, items[2].text)]);
    const out = await makeBatch({ ...payload, pastSentences: ['She has lived in Lisbon since 2019!'] }, d.deps);
    expect(out.items.map((i) => i.batchSlot)).toEqual([1, 2]);
  });

  it('the prompt lists every slot with its theme, correctness and grammar point', () => {
    const { prompt } = batchPrompt(payload, cleanSlots(payload.slots, 'Travel'));
    expect(prompt).toMatch(/WRITE 3 ITEMS/);
    expect(prompt).toMatch(/Item 1: theme "Travel"; the sentence MUST be 100% correct; structure focus: "since and for"/);
    expect(prompt).toMatch(/Item 2: theme "History"; the sentence MUST contain exactly one error/);
  });

  it('never more than 15 in one batch', () => {
    expect(MAX_BATCH).toBe(15);
    expect(cleanSlots(Array.from({ length: 40 }, () => ({})), 'Travel')).toHaveLength(15);
  });
});
