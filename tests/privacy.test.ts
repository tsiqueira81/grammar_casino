import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';

// Package A5: what leaves the device. AI marking gets the sentence and the typed answer only:
// never a student's nickname, seat or any other identifier.
vi.mock('../services/firebaseService', () => ({
  archiveSentenceToCloudBank: vi.fn(),
  auth: { currentUser: null },
  isVerifiedTeacherUser: () => false,
}));

import { verifyCorrection, verifyOpenClozeBatch } from '../services/geminiService';
import { getLog } from '../utils/debugLog';

const IDENTIFYING_KEY = /name|player|seat|student|email|uid|nick|avatar/i;

function keysOf(value: unknown, out: string[] = []): string[] {
  if (value && typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
      out.push(k);
      keysOf(v, out);
    });
  }
  return out;
}

function capturingFetch(bodies: unknown[], reply: unknown) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body || '{}')));
    return new Response(JSON.stringify(reply), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
}

describe('AI requests carry no student identity', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a correction check sends the sentences and nothing that names a student', async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal('fetch', capturingFetch(bodies, { isCorrect: true, feedback: 'ok' }));
    await verifyCorrection('She go to school every day.', 'She walks to school each day.', 'She goes to school every day.', 'go');
    expect(bodies.length).toBe(1);
    expect(keysOf(bodies[0]).filter((k) => IDENTIFYING_KEY.test(k))).toEqual([]);
    expect(JSON.stringify(bodies[0])).toContain('She walks to school each day.');
  });

  it('a typed-answer batch sends only the distinct answers', async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal('fetch', capturingFetch(bodies, { results: { since: { isCorrect: true, feedback: 'ok' } } }));
    await verifyOpenClozeBatch('I have lived here _____ 2010.', 'since', [], ['since', 'since', 'for'], 'openCloze');
    expect(bodies.length).toBe(1);
    expect(keysOf(bodies[0]).filter((k) => IDENTIFYING_KEY.test(k))).toEqual([]);
  });

  it('the debug log never holds what a student typed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    await verifyCorrection('She go to school every day.', 'Secret typed answer here', 'She goes to school every day.', 'go');
    expect(getLog().map((e) => e.message).join('\n')).not.toContain('Secret typed answer');
  });
});

describe('the privacy notice', () => {
  const html = readFileSync('public/privacy.html', 'utf8');
  it('exists, is in English and says what is kept', () => {
    expect(html).toContain('<html lang="en">');
    expect(html).toMatch(/nickname/i);
    expect(html).toMatch(/no account/i);
  });
});
