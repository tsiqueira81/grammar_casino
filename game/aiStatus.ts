// Package T6: one honest line about where the sentences come from, used everywhere the teacher sees
// it (status chips, the settings drawer, the room timer). It follows the hand in play: when the AI is
// set up but this hand came from the built-in deck, it says so instead of "AI ready".
import type { GeneratedSentence } from '../types';

export interface SentenceStatusInput {
  hasKey: boolean;
  isOnline: boolean;
  decryptionFailed?: boolean;
}

export interface SentenceStatus {
  label: string;
  icon: string;
  /** "warn" for something the teacher may want to fix, "info" otherwise. */
  tone: 'ok' | 'info' | 'warn';
}

export function sentenceStatus(status: SentenceStatusInput, current?: Pick<GeneratedSentence, 'source'> | null): SentenceStatus {
  if (status.decryptionFailed) return { label: 'Re-enter the AI key', icon: '🔑', tone: 'warn' };
  if (current?.source === 'own') return { label: 'Your own sentences', icon: '📝', tone: 'ok' };
  if (!status.isOnline) return { label: 'Offline: built-in deck', icon: '💾', tone: 'info' };
  if (!status.hasKey) return { label: 'Built-in deck', icon: '💾', tone: 'info' };
  if (current?.source === 'bank') return { label: 'AI busy, using the built-in deck', icon: '💾', tone: 'info' };
  return { label: 'AI ready', icon: '⚡', tone: 'ok' };
}
