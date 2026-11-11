// The built-in bank as audit items (package L2). Importing this loads the whole bank, so only
// tests and scripts use it; the game loads the bank with import() when it needs it.
import type { AuditItem } from './audit';
import {
  CURATED_SENTENCE_BANK,
  CURATED_CLOZE_BANK,
  CURATED_WORD_FORMATION_BANK,
  CURATED_KEY_WORD_TRANSFORMATION_BANK,
} from '../services/fallbackSentences';

export function bankAuditItems(): AuditItem[] {
  return [
    ...CURATED_SENTENCE_BANK.map((e) => ({ ...e, type: 'binary' as const })),
    ...CURATED_CLOZE_BANK.map((e) => ({ ...e, type: 'multipleChoice' as const })),
    ...CURATED_CLOZE_BANK.map((e) => ({ ...e, options: undefined, type: 'openCloze' as const })),
    ...CURATED_WORD_FORMATION_BANK.map((e) => ({ ...e, type: 'wordFormation' as const })),
    ...CURATED_KEY_WORD_TRANSFORMATION_BANK.map((e) => ({ ...e, type: 'keyWordTransformation' as const })),
  ];
}
