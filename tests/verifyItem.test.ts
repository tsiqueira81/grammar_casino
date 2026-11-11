import { describe, expect, it, vi } from 'vitest';
import { judge, quickProblems, sensitivityProblems, verifierPrompt, verifyItem } from '../server/verifyItem';
import { bankAuditItems } from '../content/bankItems';
import type { GeneratedSentence } from '../types';

// Package L3: AI content is checked by rules and by a second model before students see it.
const binaryOk: Partial<GeneratedSentence> = {
  text: 'She has lived in Lisbon since 2019.',
  isCorrect: true,
  correction: 'She has lived in Lisbon since 2019.',
  explanation: 'Present perfect with since and a point in time.',
  grammarPhrase: 'has lived',
};
const mcOk: Partial<GeneratedSentence> = {
  text: 'I have lived here _____ 2010.',
  isCorrect: true,
  correction: 'I have lived here since 2010.',
  explanation: 'Since goes with a point in time.',
  options: ['since', 'for', 'during', 'while'],
  correctAnswer: 'since',
};
const clozeOk: Partial<GeneratedSentence> = {
  text: 'She is good _____ maths.',
  isCorrect: true,
  correction: 'She is good at maths.',
  explanation: 'Good at is the fixed phrase.',
  correctAnswer: 'at',
  acceptedAnswers: ['at'],
};
const reply = (o: object) => vi.fn(async () => JSON.stringify(o));

describe('the four ways a generated item goes wrong are all rejected', () => {
  it('a wrong key: the checker picks a different option', async () => {
    const wrongKey = { ...mcOk, correctAnswer: 'for' };
    const v = await verifyItem(wrongKey, 'multipleChoice', 'B1', reply({ acceptable: ['since'] }));
    expect(v.ok).toBe(false);
  });
  it('a second valid option in multiple choice', async () => {
    const v = await verifyItem(mcOk, 'multipleChoice', 'B1', reply({ acceptable: ['since', 'during'] }));
    expect(v.ok).toBe(false);
    expect(v.reasons[0]).toMatch(/2 acceptable/);
  });
  it('an off-level sentence', async () => {
    const offLevel = { ...binaryOk, text: 'She would have come if you had asked.', correction: 'She would have come if you had asked.' };
    const ask = reply({ grammatical: true, correction: offLevel.text });
    const v = await verifyItem(offLevel, 'binary', 'A1', ask);
    expect(v.ok).toBe(false);
    expect(ask).not.toHaveBeenCalled();
  });
  it('a duplicate of a sentence already dealt', async () => {
    const v = await verifyItem(binaryOk, 'binary', 'B1', reply({ grammatical: true, correction: binaryOk.text }), ['She has lived in Lisbon since 2019!']);
    expect(v.ok).toBe(false);
    expect(v.reasons.join()).toMatch(/near copy/);
  });
});

describe('items that pass', () => {
  it('a correct sentence the checker also finds correct', async () => {
    expect((await verifyItem(binaryOk, 'binary', 'B1', reply({ grammatical: true, correction: binaryOk.text }))).ok).toBe(true);
  });
  it('a flawed sentence the checker also finds flawed', async () => {
    const flawed = { ...binaryOk, text: 'She have lived in Lisbon since 2019.', isCorrect: false, errorPhrase: 'have' };
    expect((await verifyItem(flawed, 'binary', 'B1', reply({ grammatical: false, correction: binaryOk.text }))).ok).toBe(true);
    expect((await verifyItem(flawed, 'binary', 'B1', reply({ grammatical: true, correction: flawed.text }))).ok).toBe(false);
  });
  it('a cloze word the checker also accepts is added as a right answer', async () => {
    const v = await verifyItem(clozeOk, 'openCloze', 'B1', reply({ acceptable: ['at', 'in', 'really good'] }));
    expect(v).toEqual({ ok: true, reasons: [], extraAnswers: ['in'] });
  });
  it('a cloze key the checker does not accept is rejected', async () => {
    expect((await verifyItem(clozeOk, 'openCloze', 'B1', reply({ acceptable: ['with'] }))).ok).toBe(false);
  });
  it('an option written with its letter still counts', () => {
    expect(judge(mcOk, 'multipleChoice', { acceptable: ['A) since'] }).ok).toBe(true);
  });
  it('a checker that fails or times out means the item is not dealt', async () => {
    const v = await verifyItem(binaryOk, 'binary', 'B1', vi.fn(async () => { throw new Error('groq took longer than 4 s'); }));
    expect(v.ok).toBe(false);
  });
  it('without a second model, the rules alone decide', async () => {
    expect((await verifyItem(binaryOk, 'binary', 'B1', null)).ok).toBe(true);
  });
});

describe('the cold question', () => {
  it('never shows the key', () => {
    const prompt = verifierPrompt({ ...mcOk, explanation: 'SECRET' }, 'multipleChoice') || '';
    expect(prompt).toContain('since');
    expect(prompt).not.toContain('SECRET');
    expect(prompt).not.toMatch(/correct answer/i);
    const cloze = verifierPrompt(clozeOk, 'openCloze') || '';
    expect(cloze).not.toContain(' at ');
    expect(cloze).not.toContain('good at');
  });
});

describe('school safety', () => {
  it('catches topics a school game stays away from', () => {
    expect(sensitivityProblems('He took drugs at the party.')).toHaveLength(1);
    expect(sensitivityProblems('The soldier killed the man.')).toHaveLength(1);
  });
  it('leaves ordinary words alone', () => {
    expect(sensitivityProblems('She has drunk three glasses of water. Our class skills improved. He shot a film.')).toEqual([]);
  });
  it('flags nothing in the whole built-in bank', () => {
    const items = bankAuditItems();
    expect(items.length).toBeGreaterThan(400);
    const flagged = items.filter((i) => sensitivityProblems([i.leadInSentence, i.text, i.correctAnswer, ...(i.options || [])].join(' ')).length);
    expect(flagged.map((i) => i.text)).toEqual([]);
  });
  it('quick checks report schema problems too', () => {
    expect(quickProblems({ ...binaryOk, explanation: '' }, 'binary', 'B1').join()).toMatch(/explanation/);
  });
});
