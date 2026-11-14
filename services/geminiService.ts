import { getAiCallKind, getBrowserDailyStorage, giveBackAiCalls, tryUseAiCall } from '../utils/aiDailyLimit';
import { Settings, GeneratedSentence, CEFRLevel, QuestionType } from '../types';
import { getE2eSentence, isE2eMode } from '../utils/e2eContent';
import { validateItem } from '../content/schema';
import { logEvent } from '../utils/debugLog';
import { nextDeckItem } from '../game/teacherDeck';
import { getSubtypesForTopic } from '../constants';
import { SentencePool, planBatch, poolKey, type PooledItem, type SentencePlan } from './sentencePool';
import { archiveSentenceToCloudBank } from './firebaseService';
import {
  evaluateBinaryCorrectionOffline,
  evaluateWordFormationOffline,
  evaluateOpenClozeOffline,
} from '../utils/offlineGrammarEngine';

// Desktop Electron IPC interface exposed securely via contextBridge preload
export interface DesktopStatus {
  isDesktop: boolean;
  isPortable?: boolean;
  isOnline: boolean;
  hasKey: boolean;
  isEncrypted: boolean;
  decryptionFailed?: boolean;
  isReadOnly?: boolean;
  dataPath?: string;
  maskedKey?: string;
}

// Package T6: on the web the AI key lives on the game's server, so "AI sentences" depends on
// whether the server has one. /api/health says so (a yes or no, never the key). Asked at most once
// every 5 minutes.
let serverAiCache: { at: number; value: boolean } | null = null;
export async function serverHasAi(): Promise<boolean> {
  if (serverAiCache && Date.now() - serverAiCache.at < 5 * 60_000) return serverAiCache.value;
  let value = false;
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 3000) : null;
    const res = await fetch('/api/health', { signal: controller?.signal });
    if (timer) clearTimeout(timer);
    const body = res.ok ? await res.json() : null;
    value = Boolean(body && body.aiConfigured === true);
  } catch {
    value = false;
  }
  serverAiCache = { at: Date.now(), value };
  return value;
}

interface ElectronDesktopAPI {
  isDesktop: boolean;
  gemini: {
    generateSentence: (payload: any) => Promise<any>;
    getHint: (payload: any) => Promise<{ hint: string }>;
    verifyCorrection: (payload: any) => Promise<{ isCorrect: boolean; feedback: string }>;
    verifyOpenClozeBatch: (payload: any) => Promise<{ results: Record<string, { isCorrect: boolean; marks?: 0 | 1 | 2; feedback: string }> }>;
    simplifyExplanation: (payload: any) => Promise<{ simplified: string }>;
    generateSpeech: (payload: any) => Promise<{ base64Audio: string }>;
  };
  settings: {
    getStatus: () => Promise<DesktopStatus>;
    setApiKey: (key: string) => Promise<{ success: boolean; hasKey: boolean; error?: string }>;
    clearApiKey: () => Promise<{ success: boolean; hasKey: boolean; error?: string }>;
    testApiKey: (key?: string) => Promise<{ valid: boolean; text?: string; error?: string }>;
  };
  storage?: {
    saveGame: (gameState: any) => Promise<{ success: boolean; readOnly?: boolean; error?: string }>;
    loadGame: () => Promise<{ success: boolean; gameState: any | null; error?: string }>;
    clearGame: () => Promise<{ success: boolean; readOnly?: boolean; error?: string }>;
  };
  system: {
    openExternal: (url: string) => Promise<void>;
  };
}

declare global {
  interface Window {
    electronDesktop?: ElectronDesktopAPI;
  }
}

export const isDesktopApp = (): boolean => {
  return typeof window !== 'undefined' && Boolean(window.electronDesktop?.isDesktop);
};

export const getDesktopStatus = async (): Promise<DesktopStatus> => {
  if (typeof window !== 'undefined' && window.electronDesktop?.settings) {
    try {
      return await window.electronDesktop.settings.getStatus();
    } catch (e) {
      console.warn('Failed to get desktop status:', e);
    }
  }
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  return {
    isDesktop: false,
    isPortable: false,
    isOnline,
    // On the web, "has a key" means the game's server has one.
    hasKey: isOnline && typeof fetch === 'function' ? await serverHasAi() : false,
    isEncrypted: false,
  };
};

export const saveDesktopApiKey = async (key: string) => {
  if (typeof window !== 'undefined' && window.electronDesktop?.settings) {
    return await window.electronDesktop.settings.setApiKey(key);
  }
  return { success: false, hasKey: false, error: 'Desktop storage not available.' };
};

export const removeDesktopApiKey = async () => {
  if (typeof window !== 'undefined' && window.electronDesktop?.settings) {
    return await window.electronDesktop.settings.clearApiKey();
  }
  return { success: false, hasKey: false, error: 'Desktop storage not available.' };
};

export const testDesktopApiKey = async (key?: string) => {
  if (typeof window !== 'undefined' && window.electronDesktop?.settings) {
    return await window.electronDesktop.settings.testApiKey(key);
  }
  return { valid: false, error: 'Desktop storage not available.' };
};

export const savePortableGame = async (gameState: any) => {
  if (typeof window !== 'undefined' && window.electronDesktop?.storage) {
    try {
      return await window.electronDesktop.storage.saveGame(gameState);
    } catch (e) {
      console.warn('Failed to save portable game state:', e);
    }
  }
  return { success: false };
};

export const loadPortableGame = async () => {
  if (typeof window !== 'undefined' && window.electronDesktop?.storage) {
    try {
      return await window.electronDesktop.storage.loadGame();
    } catch (e) {
      console.warn('Failed to load portable game state:', e);
    }
  }
  return { success: false, gameState: null };
};

export const clearPortableGame = async () => {
  if (typeof window !== 'undefined' && window.electronDesktop?.storage) {
    try {
      return await window.electronDesktop.storage.clearGame();
    } catch (e) {
      console.warn('Failed to clear portable game state:', e);
    }
  }
  return { success: false };
};

/**
 * The lesson must never stall (package R8). A sentence that takes longer than this is dealt from the
 * offline bank instead; every other AI call gives up later, and its caller falls back the same way.
 * 12 s since 2026-11-14 (it was 8 s), so glm-5.3-flash, which takes 5 to 7 s, can write it and still
 * be checked. The server stops at 11 s (GAME_WAITS_MS in server/providers.ts must match).
 */
export const AI_SENTENCE_TIMEOUT_MS = 12_000;
/**
 * A sentence made ahead (while the class plays the hand before, or the teacher is on the setup
 * screen): nobody waits for it yet, so it may take longer. The server stops at 19 s.
 */
export const AI_AHEAD_SENTENCE_TIMEOUT_MS = 20_000;
/**
 * When the class reaches a hand whose sentence is still being made ahead, it waits at most this
 * long for it, and then the hand is dealt from the offline bank.
 */
export const AHEAD_WAIT_LIMIT_MS = 6_000;
export const AI_CALL_TIMEOUT_MS = 20_000;

/** A batch is made ahead of time, so it may take long; nobody waits for it. */
export const AI_BATCH_TIMEOUT_MS = 150_000;

export function getAiTimeoutMs(action: string, ahead = false): number {
  if (action === 'generateSentenceBatch') return AI_BATCH_TIMEOUT_MS;
  if (action === 'generateSentence') return ahead ? AI_AHEAD_SENTENCE_TIMEOUT_MS : AI_SENTENCE_TIMEOUT_MS;
  return AI_CALL_TIMEOUT_MS;
}

async function postToGeminiApi<T>(action: string, payload: Record<string, any>): Promise<T> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const limitMs = getAiTimeoutMs(action, payload?.ahead === true);
  const timer = controller ? setTimeout(() => controller.abort(), limitMs) : null;
  let response: Response;
  let data: any = null;
  try {
    response = await fetch('/api/gemini', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, ...payload }),
      signal: controller?.signal,
    });
    const meta = response.headers?.get?.('X-AI-Meta');
    if (meta) logEvent('ai', `${action}: ${meta}`);
    try {
      data = await response.json();
    } catch {
      // Non-JSON response (or the time ran out while reading it)
    }
    if (controller?.signal.aborted) {
      throw new Error(`The AI took longer than ${limitMs / 1000} s; using the offline fallback.`);
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(`The AI took longer than ${limitMs / 1000} s; using the offline fallback.`);
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (!response.ok || data?.fallback) {
    const errorMsg = data?.error || `HTTP ${response.status} from /api/gemini`;
    throw new Error(errorMsg);
  }

  return data as T;
}


async function requestDealerAction<T>(action: string, payload: Record<string, any>): Promise<T> {
  // Browser tests (?e2e=1 on the dev server) never call an AI provider; callers fall back offline.
  if ((import.meta as any).env.DEV && isE2eMode()) {
    throw new Error('AI calls are disabled in browser-test mode.');
  }
  // If running inside Electron desktop, execute strictly via IPC in the main process
  if (typeof window !== 'undefined' && window.electronDesktop?.gemini) {
    const desktopApi = window.electronDesktop.gemini;
    switch (action) {
      case 'generateSentence':
        return (await desktopApi.generateSentence(payload)) as T;
      case 'getHint':
        return (await desktopApi.getHint(payload)) as T;
      case 'verifyCorrection':
        return (await desktopApi.verifyCorrection(payload)) as T;
      case 'verifyOpenClozeBatch':
        return (await desktopApi.verifyOpenClozeBatch(payload)) as T;
      case 'simplifyExplanation':
        return (await desktopApi.simplifyExplanation(payload)) as T;
      case 'generateSpeech':
        return (await desktopApi.generateSpeech(payload)) as T;
      default:
        throw new Error(`Unsupported desktop action: ${action}`);
    }
  }

  // The web app is open to everyone, so each device has a daily AI allowance (utils/aiDailyLimit.ts).
  // Past it, callers fall back to the offline bank and local checks, as when the network is down.
  const count = action === 'generateSentenceBatch' && Array.isArray(payload.slots) ? payload.slots.length : 1;
  if (!tryUseAiCall(getBrowserDailyStorage(), getAiCallKind(action), new Date(), undefined, count)) {
    throw new Error('Daily AI limit reached on this device; using the offline bank.');
  }
  return postToGeminiApi<T>(action, payload);
}

// Package L4: the teacher's own sentences, dealt first and in order.
let teacherDeck: GeneratedSentence[] = [];
export function setTeacherDeck(items: GeneratedSentence[]): void {
  teacherDeck = items.slice();
}

const pendingArchive = new Map<string, { sentence: GeneratedSentence; settings: Settings; subtype: string | null }>();
const PENDING_ARCHIVE_LIMIT = 30;

function rememberForArchive(sentence: GeneratedSentence, settings: Settings, subtype: string | null) {
  pendingArchive.set(sentence.text, { sentence, settings, subtype });
  while (pendingArchive.size > PENDING_ARCHIVE_LIMIT) {
    const oldest = pendingArchive.keys().next().value;
    if (oldest === undefined) break;
    pendingArchive.delete(oldest);
  }
}

/** Saves an AI item to the cloud bank after it was played (not voided). Bank items are ignored. */
export function archivePlayedSentence(text: string | undefined): void {
  if (!text) return;
  const entry = pendingArchive.get(text);
  if (!entry) return;
  pendingArchive.delete(text);
  void archiveSentenceToCloudBank(entry.sentence, entry.settings, entry.subtype);
}

/** Forgets an item that will not be played (swapped or voided). */
export function forgetUnplayedSentence(text: string | undefined): void {
  if (text) pendingArchive.delete(text);
}

/**
 * Package L8: Spot the error and Word order are made from Valid-or-flawed items (a flawed one, or
 * a short correct one), so they reuse the AI writer, its check and the offline bank.
 */
export const generateSentence = async (
  settings: Settings,
  pastSentences: string[] = [],
  forceCorrect: boolean | null = null,
  subtype: string | null = null,
  pastMistakes: string[] = [],
  questionType?: QuestionType,
  plan?: SentencePlan
): Promise<GeneratedSentence> => {
  if (questionType !== 'spotError' && questionType !== 'wordOrder') {
    return generateBaseSentence(settings, pastSentences, forceCorrect, subtype, pastMistakes, questionType, plan);
  }
  if ((import.meta as any).env.DEV && isE2eMode()) return getE2eSentence(questionType, forceCorrect);
  const { toSpotError, toWordOrder } = await import('../game/newFormats');
  const convert = (item: GeneratedSentence) => (questionType === 'spotError' ? toSpotError(item) : toWordOrder(item));
  const wantCorrect = questionType === 'wordOrder';
  for (let tries = 0; tries < 3; tries++) {
    const item = await generateBaseSentence(settings, pastSentences, wantCorrect, subtype, pastMistakes, 'binary', tries === 0 ? plan : { ...plan, upcoming: [] });
    const made = convert(item);
    if (made) return made;
  }
  return dealFromBank(settings, pastSentences, forceCorrect, subtype, pastMistakes, questionType);
};

/**
 * A sentence from the offline bank, for any question type (Spot the error and Word order are made
 * from bank items too). Used when the AI fails, and when the class would otherwise wait too long
 * for a sentence still being made ahead (AHEAD_WAIT_LIMIT_MS).
 */
export const dealFromBank = async (
  settings: Settings,
  pastSentences: string[] = [],
  forceCorrect: boolean | null = null,
  subtype: string | null = null,
  pastMistakes: string[] = [],
  questionType?: QuestionType
): Promise<GeneratedSentence> => {
  const { getCuratedSentence } = await import('./fallbackSentences');
  if (questionType !== 'spotError' && questionType !== 'wordOrder') {
    return { ...getCuratedSentence(settings, pastSentences, forceCorrect, subtype, pastMistakes, questionType), source: 'bank' };
  }
  const { toSpotError, toWordOrder } = await import('../game/newFormats');
  const convert = (item: GeneratedSentence) => (questionType === 'spotError' ? toSpotError(item) : toWordOrder(item));
  const wantCorrect = questionType === 'wordOrder';
  // The bank has many items: keep drawing until one fits.
  for (let tries = 0; tries < 40; tries++) {
    const made = convert({ ...getCuratedSentence(settings, pastSentences, wantCorrect, subtype, pastMistakes, 'binary'), source: 'bank' });
    if (made) return made;
  }
  const last = questionType === 'spotError'
    ? toSpotError({ text: 'She don\'t like getting up early on Mondays.', isCorrect: false, correction: 'She doesn\'t like getting up early on Mondays.', errorPhrase: "don't", grammarPhrase: "don't", explanation: 'With she, he and it, the present simple negative is "doesn\'t".', questionType: 'binary' })
    : toWordOrder({ text: 'We have already finished our homework.', isCorrect: true, correction: '', explanation: '"Already" goes between "have" and the past participle.', grammarPhrase: 'have already finished', questionType: 'binary' });
  return last!;
};

const generateBaseSentence = async (
  settings: Settings,
  pastSentences: string[] = [],
  forceCorrect: boolean | null = null,
  subtype: string | null = null,
  pastMistakes: string[] = [],
  questionType?: QuestionType,
  plan?: SentencePlan
): Promise<GeneratedSentence> => {
  const own = nextDeckItem(teacherDeck, pastSentences);
  if (own) return { ...own, source: 'own' };
  // Browser tests get a fixed, known sentence for each question type.
  if ((import.meta as any).env.DEV && isE2eMode()) {
    return getE2eSentence(questionType, forceCorrect);
  }
  // A checked item made ahead in a batch, when one fits this hand. The next batch is asked for
  // in the background either way.
  const pooled = sentencePool.take(settings, questionType, forceCorrect, subtype, Boolean(plan?.strictSubtype), pastSentences);
  refillPool(settings, questionType, plan, pastSentences, pastMistakes);
  if (pooled) {
    const { batchSlot: _slot, theme: _theme, ...item } = pooled as PooledItem & { batchSlot?: number };
    item.questionType = item.questionType || questionType || 'binary';
    rememberForArchive(item, settings, item.writtenFor ?? subtype);
    logEvent('ai', `Sentence from a batch made ahead (${sentencePool.size()} left)`);
    return { ...item, source: 'ai' };
  }
  try {
    const data = await requestDealerAction<GeneratedSentence>('generateSentence', {
      settings,
      pastSentences,
      forceCorrect,
      subtype,
      pastMistakes,
      questionType,
      // Made ahead: the server gives glm a longer head start, and the game waits longer.
      ...(plan?.ahead ? { ahead: true } : {}),
    });

    if (data && data.text) {
      if (!data.questionType) {
        data.questionType = questionType || 'binary';
      }
      if (data.questionType === 'binary' && !data.isCorrect && !data.errorPhrase) {
        data.errorPhrase = data.grammarPhrase;
      }
      // Package L1: an AI item gets the same check as the bank. A broken one is never dealt (or
      // archived); the class gets a bank item instead, without a message.
      const check = validateItem(data, data.questionType);
      if (!check.ok) throw new Error(`AI sentence failed the content check: ${check.errors.join('; ')}`);
      // Package L3: no silent archiving. The item is saved to the cloud bank only once it has been
      // played and not voided (archivePlayedSentence, called by the game when the hand is over).
      rememberForArchive(data, settings, subtype);
      data.source = 'ai';
      return data;
    }
    throw new Error("Invalid sentence structure returned from service.");
  } catch (err) {
    console.warn("Using curated fallback challenge due to service notice:", err);
    logEvent('ai', `Sentence from the built-in bank instead of AI: ${err instanceof Error ? err.message : String(err)}`);
    // Package L1: the offline bank loads only when it is needed.
    const { getCuratedSentence } = await import('./fallbackSentences');
    return { ...getCuratedSentence(settings, pastSentences, forceCorrect, subtype, pastMistakes, questionType), source: 'bank' };
  }
};

/** Sentences made ahead in batches (services/sentencePool.ts). */
export const sentencePool = new SentencePool();

/** Asks, in the background, for the next batch of this hand's type, when one is worth it. */
function refillPool(settings: Settings, questionType: QuestionType | undefined, plan: SentencePlan | undefined, pastSentences: string[], pastMistakes: string[]): void {
  if (typeof window !== 'undefined' && window.electronDesktop?.gemini) return; // The desktop app has no batch call.
  const key = poolKey(settings, questionType);
  const slots = planBatch(settings, questionType, plan, sentencePool.size(key), getSubtypesForTopic(settings.topic, settings.level));
  if (!slots.length || !sentencePool.begin(key)) return;
  const type = !questionType || questionType === 'spotError' || questionType === 'wordOrder' ? 'binary' : questionType;
  requestDealerAction<{ items?: PooledItem[] }>('generateSentenceBatch', {
    settings: { topic: settings.topic, level: settings.level, theme: settings.theme },
    questionType: type,
    slots,
    pastSentences,
    pastMistakes,
  })
    .then((data) => {
      const items = (data?.items || []).filter((it) => validateItem(it, it.questionType || type).ok);
      sentencePool.add(key, items);
      // Only the sentences that arrived count toward the device's daily allowance.
      giveBackAiCalls(getBrowserDailyStorage(), 'sentence', slots.length - items.length);
      logEvent('ai', `Batch made ahead: ${items.length} of ${slots.length} sentences kept`);
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      if (!/Daily AI limit/.test(message)) giveBackAiCalls(getBrowserDailyStorage(), 'sentence', slots.length);
      logEvent('ai', `Batch not made: ${message}`);
    })
    .finally(() => sentencePool.end(key));
}

export const getHint = async (
  sentence: string,
  topic: string,
  level?: CEFRLevel,
  questionType?: QuestionType,
  baseWord?: string,
  leadInSentence?: string
): Promise<string> => {
  try {
    const data = await requestDealerAction<{ hint: string }>('getHint', {
      sentence,
      topic,
      level,
      questionType,
      baseWord,
      leadInSentence,
    });
    if (data?.hint) return data.hint.trim();
  } catch (err) {
    console.warn("Using pedagogical hint heuristic:", err);
  }

  if (questionType === 'keyWordTransformation') {
    return `Rewrite the meaning of the first sentence in 2 to 6 words using "${baseWord || 'the KEY WORD'}" unchanged — pay attention to both halves of the target grammatical structure around the key word.`;
  }

  if (questionType === 'wordFormation') {
    return `Look at the grammatical position of the gap and decide whether "${baseWord || 'the base word'}" needs a noun, verb, adjective, or adverb suffix — or a negative prefix.`;
  }

  const isCloze = questionType === 'multipleChoice' || questionType === 'openCloze' || sentence.includes('_____');
  const topicLower = (topic || '').toLowerCase();
  if (isCloze) {
    if (topicLower.includes('tense')) {
      return "Focus on the verb form immediately following the blank and any time markers in the sentence.";
    } else if (topicLower.includes('prep')) {
      return "Look at the word right before or after the blank — which dependent preposition forms a fixed collocation here?";
    } else if (topicLower.includes('cond')) {
      return "Check the verb form in the main clause to determine whether this is a 1st, 2nd, 3rd, or inverted conditional.";
    } else if (topicLower.includes('modal')) {
      return "Consider the speaker's degree of certainty, obligation, or advice, and check if 'to' or 'have' follows the blank.";
    } else if (topicLower.includes('art')) {
      return "Listen to the initial sound (not just the letter) of the noun phrase and check if the reference is specific.";
    } else if (topicLower.includes('phrasal')) {
      return "Consider which particle combines with the verb before the blank to match the context of the sentence.";
    } else if (topicLower.includes('reported')) {
      return "Check whether the reporting verb introduces a yes/no question, a gerund, or a backshifted clause.";
    }
    return "Examine the words immediately surrounding the blank to identify the required grammatical connector or auxiliary.";
  }

  // Topic-specific pedagogical heuristic hints for binary mode
  if (topicLower.includes('tense')) {
    return "Examine the timeline of events: pay special attention to the auxiliary verbs and past/present time markers.";
  } else if (topicLower.includes('prep')) {
    return "Look closely at the prepositions: does the preposition correctly match the noun, adjective, or time phrase?";
  } else if (topicLower.includes('cond')) {
    return "Check the conditional structure: ensure the if-clause tense matches the consequence clause modal.";
  } else if (topicLower.includes('modal')) {
    return "Check the modal auxiliary: verify whether the main verb following it is in its bare infinitive form.";
  } else if (topicLower.includes('art')) {
    return "Scrutinize the noun phrases: check whether 'a', 'an', 'the', or no article is required.";
  } else if (topicLower.includes('phrasal')) {
    return "Look at the particle and pronoun placement: does the phrasal verb follow correct word order?";
  } else if (topicLower.includes('reported')) {
    return "Check the backshifting of tenses and word order following the reporting verb.";
  }
  return "Carefully review the subject, verb agreement, and key grammatical markers in the sentence.";
};

export const verifyCorrection = async (
  originalSentence: string,
  userCorrection: string,
  intendedCorrection: string,
  errorPhrase?: string,
  acceptedAnswers?: string[]
): Promise<{ isCorrect: boolean; feedback: string }> => {
  // Fast deterministic pre-check: if the submission is identical to the original flawed sentence,
  // or matches the intended correction (including contractions, UK/US spelling, or movable adverbials),
  // resolve immediately without an API call.
  const offlineEval = evaluateBinaryCorrectionOffline(
    originalSentence,
    userCorrection,
    intendedCorrection,
    errorPhrase,
    acceptedAnswers
  );
  if (offlineEval.isCorrect) {
    return offlineEval;
  }
  const cleanUser = (userCorrection || '').trim().toLowerCase().replace(/[.,!?;:'"“”]/g, '').replace(/\s+/g, ' ');
  const cleanOriginal = (originalSentence || '').trim().toLowerCase().replace(/[.,!?;:'"“”]/g, '').replace(/\s+/g, ' ');
  if (!cleanUser || cleanUser === cleanOriginal) {
    return offlineEval;
  }

  try {
    const data = await requestDealerAction<{ isCorrect: boolean; feedback: string }>('verifyCorrection', {
      originalSentence,
      userCorrection,
      intendedCorrection,
    });
    if (typeof data?.isCorrect === 'boolean') {
      return data;
    }
  } catch (err) {
    console.warn("Using deterministic offline grammar engine fallback:", err);
    logEvent('ai', 'Correction marked offline instead of by AI');
  }

  return offlineEval;
};

import { evaluateKeyWordTransformationDeterministic } from '../utils/kwtMarking';
export { normalizeContractionsForKwt, evaluateKeyWordTransformationDeterministic } from '../utils/kwtMarking';

export const verifyOpenClozeBatch = async (
  sentenceWithBlank: string,
  intendedAnswer: string,
  acceptedAnswers: string[],
  candidateWords: string[],
  questionType?: QuestionType,
  baseWord?: string,
  leadInSentence?: string,
  mark1Parts?: string[],
  mark2Parts?: string[]
): Promise<Record<string, { isCorrect: boolean; marks?: 0 | 1 | 2; feedback: string }>> => {
  const uniqueWords = Array.from(
    new Set(candidateWords.map(w => (w || '').trim().replace(/\s+/g, ' ')).filter(w => w.length > 0))
  );
  if (uniqueWords.length === 0) return {};

  try {
    const data = await requestDealerAction<{
      results: Record<string, { isCorrect: boolean; marks?: 0 | 1 | 2; feedback: string }>;
    }>('verifyOpenClozeBatch', {
      sentenceWithBlank,
      intendedAnswer,
      acceptedAnswers,
      candidateWords: uniqueWords,
      questionType,
      baseWord,
      leadInSentence,
      mark1Parts,
      mark2Parts,
    });
    if (data?.results && typeof data.results === 'object') {
      if (questionType === 'keyWordTransformation') {
        const sanitized: Record<string, { isCorrect: boolean; marks?: 0 | 1 | 2; feedback: string }> = {};
        for (const [key, aiEval] of Object.entries(data.results)) {
          const det = evaluateKeyWordTransformationDeterministic(
            key,
            intendedAnswer,
            acceptedAnswers,
            baseWord,
            mark1Parts,
            mark2Parts
          );
          // Any half deterministically disqualified due to wrong tense/agreement or spelling typo cannot earn a mark
          const maxPossibleMarks = ((det.half1Disqualified ? 0 : 1) + (det.half2Disqualified ? 0 : 1)) as 0 | 1 | 2;
          const rawAiMarks: 0 | 1 | 2 = aiEval.marks === 2 ? 2 : aiEval.marks === 1 ? 1 : aiEval.isCorrect ? 2 : 0;
          const clampedMarks = Math.min(rawAiMarks, maxPossibleMarks) as 0 | 1 | 2;
          if (clampedMarks < rawAiMarks) {
            sanitized[key] = {
              isCorrect: clampedMarks >= 1,
              marks: clampedMarks,
              feedback: det.feedback,
            };
          } else {
            sanitized[key] = {
              isCorrect: clampedMarks >= 1,
              marks: clampedMarks,
              feedback: aiEval.feedback || det.feedback,
            };
          }
        }
        return sanitized;
      }
      return data.results;
    }
  } catch (err) {
    console.warn('Using offline Cloze/Transformation batch verification fallback:', err);
    logEvent('ai', 'Typed answers marked offline instead of by AI');
  }

  const fallbackResults: Record<string, { isCorrect: boolean; marks?: 0 | 1 | 2; feedback: string }> = {};

  if (questionType === 'keyWordTransformation') {
    uniqueWords.forEach(phrase => {
      const key = phrase.trim().toLowerCase();
      fallbackResults[key] = evaluateKeyWordTransformationDeterministic(
        phrase,
        intendedAnswer,
        acceptedAnswers,
        baseWord,
        mark1Parts,
        mark2Parts
      );
    });
    return fallbackResults;
  }

  // Offline deterministic evaluation for single-word Word Formation & Open Cloze
  uniqueWords.forEach(word => {
    const key = word.trim().toLowerCase();
    if (questionType === 'wordFormation') {
      fallbackResults[key] = evaluateWordFormationOffline(
        word,
        intendedAnswer,
        acceptedAnswers,
        baseWord
      );
    } else {
      fallbackResults[key] = evaluateOpenClozeOffline(
        word,
        intendedAnswer,
        acceptedAnswers,
        sentenceWithBlank
      );
    }
  });
  return fallbackResults;
};

export const simplifyExplanation = async (
  originalExplanation: string,
  topic: string,
  sentence?: string,
  correction?: string
): Promise<string> => {
  try {
    const data = await requestDealerAction<{ simplified?: string; detailed?: string }>('simplifyExplanation', {
      originalExplanation,
      topic,
      sentence,
      correction,
    });
    const text = data?.detailed || data?.simplified;
    if (text) return text.trim();
  } catch (err) {
    console.warn("Using fallback detailed explanation:", err);
    logEvent('ai', 'Explanation from the built-in text instead of AI');
  }

  return `Grammatical Focus (${topic}): ${originalExplanation}${correction ? ` Standard target structure: "${correction}".` : ''}`;
};

export type OrpheusVoiceId = 'troy' | 'autumn' | 'diana' | 'hannah' | 'austin' | 'daniel';

export const DEFAULT_ORPHEUS_VOICE: OrpheusVoiceId = 'troy';

export const ORPHEUS_VOICE_OPTIONS: ReadonlyArray<{
  id: OrpheusVoiceId;
  label: string;
  gender: 'Female' | 'Male';
  isDefault?: boolean;
}> = [
  { id: 'troy', label: 'Troy (Default)', gender: 'Male', isDefault: true },
  { id: 'autumn', label: 'Autumn', gender: 'Female' },
  { id: 'diana', label: 'Diana', gender: 'Female' },
  { id: 'hannah', label: 'Hannah', gender: 'Female' },
  { id: 'austin', label: 'Austin', gender: 'Male' },
  { id: 'daniel', label: 'Daniel', gender: 'Male' },
];

export const generateSpeech = async (text: string, voice: OrpheusVoiceId = DEFAULT_ORPHEUS_VOICE): Promise<string> => {
  const data = await requestDealerAction<{ base64Audio: string }>('generateSpeech', { text, voice });
  if (!data?.base64Audio) {
    throw new Error("No speech audio returned by dealer service.");
  }
  return data.base64Audio;
};

