import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isVerifiedTeacherUser } from '../services/firebaseService';

// Package A6 (decision D9): any teacher with a verified Google account gets a private space.
const user = (over: Record<string, unknown>) =>
  ({ isAnonymous: false, email: 'a@example.com', emailVerified: true, providerData: [{ providerId: 'google.com' }], ...over }) as never;

describe('cloud saves for every teacher (package A6)', () => {
  it('opens a private space for any verified Google account', () => {
    expect(isVerifiedTeacherUser(user({}))).toBe(true);
    expect(isVerifiedTeacherUser(user({ email: 'another.teacher@example.org' }))).toBe(true);
  });

  it('keeps out anonymous devices, unverified emails and other sign-in kinds', () => {
    expect(isVerifiedTeacherUser(null)).toBe(false);
    expect(isVerifiedTeacherUser(user({ isAnonymous: true }))).toBe(false);
    expect(isVerifiedTeacherUser(user({ emailVerified: false }))).toBe(false);
    expect(isVerifiedTeacherUser(user({ providerData: [{ providerId: 'password' }] }))).toBe(false);
  });

  it('names no teacher in the code or the rules', () => {
    for (const f of ['../firestore.rules', '../services/firebaseService.ts', '../components/CloudManagerModal.tsx', '../scripts/check-firestore-rules.mjs']) {
      const text = readFileSync(new URL(f, import.meta.url), 'utf8');
      expect(text).not.toMatch(/@gmail\.com/);
    }
  });
});
