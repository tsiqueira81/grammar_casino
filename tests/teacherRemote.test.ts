import { describe, expect, it } from 'vitest';
import {
  answerForTeacher,
  buildRemoteView,
  isRemoteAction,
  isRemoteAvatar,
  newRemoteKey,
  primaryLabelFor,
  remoteAvatar,
  remoteLink,
  remoteName,
  savedRemoteToken,
} from '../game/teacherRemote';
import type { GeneratedSentence } from '../types';

const s = (over: Partial<GeneratedSentence>): GeneratedSentence => ({ text: 'She go home.', isCorrect: false, correction: 'She goes home.', explanation: 'Third person -s.', ...over }) as GeneratedSentence;

describe('teacher remote (T3)', () => {
  it('makes 16-character hex keys and avatars only the remote uses', () => {
    const key = newRemoteKey(() => new Uint8Array([0, 1, 2, 255, 16, 32, 64, 128]));
    expect(key).toBe('000102ff10204080');
    expect(newRemoteKey()).toMatch(/^[0-9a-f]{16}$/);
    expect(isRemoteAvatar(remoteAvatar(key))).toBe(true);
    expect(isRemoteAvatar('🦊')).toBe(false);
    expect(isRemoteAvatar(undefined)).toBe(false);
    expect(remoteName(key)).toBe('Teacher remote 0001');
  });

  it('builds the link phones open', () => {
    expect(remoteLink('https://grammarcasino.pages.dev/', 'ABCD', 'k1')).toBe('https://grammarcasino.pages.dev/?room=ABCD&remote=k1');
  });

  it('accepts only the shortcut actions', () => {
    expect(isRemoteAction('primary')).toBe(true);
    expect(isRemoteAction('room')).toBe(false);
    expect(isRemoteAction('fullscreen')).toBe(false);
    expect(isRemoteAction(3)).toBe(false);
  });

  it('says the answer in words', () => {
    expect(answerForTeacher(s({}))).toBe('Flawed. Correct: She goes home.');
    expect(answerForTeacher(s({ isCorrect: true }))).toBe('Valid');
    expect(answerForTeacher(s({ questionType: 'multipleChoice', options: ['go', 'goes', 'going', 'gone'], correctAnswer: 'goes' }))).toBe('B: goes');
    expect(answerForTeacher(s({ questionType: 'openCloze', correctAnswer: 'since', acceptedAnswers: ['since', 'for'] }))).toBe('since (also: for)');
    expect(answerForTeacher(null)).toBeNull();
  });

  it('builds the private view: who is still deciding, who is away', () => {
    const view = buildRemoteView({
      step: 'IN_GAME',
      round: 2,
      totalRounds: 10,
      paused: false,
      sentence: s({}),
      players: [
        { id: 1, name: 'Ana' },
        { id: 2, name: 'Bo' },
        { id: 3, name: 'Cy' },
      ],
      lockedIds: [1, 99],
      awayIds: [3],
      reactions: { gotIt: 1, confused: 2 },
      notice: null,
    });
    expect(view.lockedIn).toBe(1);
    expect(view.seated).toBe(3);
    expect(view.waitingFor).toEqual(['Bo', 'Cy']);
    expect(view.away).toEqual(['Cy']);
    expect(view.answer).toContain('She goes home.');
    expect(view.reactions).toBeNull();
    expect(view.primaryLabel).toBe('Reveal the answer');
  });

  it('hides the sentence outside a hand and shows reactions after the reveal', () => {
    const base = { round: 1, totalRounds: null, paused: false, sentence: s({}), players: [], lockedIds: [], awayIds: [], reactions: { gotIt: 3, confused: 0 }, notice: null };
    expect(buildRemoteView({ ...base, step: 'SETUP' }).sentence).toBeNull();
    expect(buildRemoteView({ ...base, step: 'RESULTS' }).reactions).toEqual({ gotIt: 3, confused: 0 });
    expect(primaryLabelFor('RESULTS')).toBe('Deal the next hand');
  });

  it('reuses a saved token only for the same room and link', () => {
    const raw = JSON.stringify({ code: 'ABCD', key: 'k1', token: 'stu_1' });
    expect(savedRemoteToken(raw, 'abcd', 'k1')).toBe('stu_1');
    expect(savedRemoteToken(raw, 'ABCD', 'k2')).toBeUndefined();
    expect(savedRemoteToken('{bad', 'ABCD', 'k1')).toBeUndefined();
    expect(savedRemoteToken(null, 'ABCD', 'k1')).toBeUndefined();
  });
});
