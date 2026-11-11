import { getAiCallKind, getBrowserDailyStorage, tryUseAiCall } from '../utils/aiDailyLimit';
import { Settings, GeneratedSentence, CEFRLevel, QuestionType } from '../types';
import { getE2eSentence, isE2eMode } from '../utils/e2eContent';
import { validateItem } from '../content/schema';
import { logEvent } from '../utils/debugLog';
import { archiveSentenceToCloudBank, auth, isVerifiedTeacherUser } from './firebaseService';
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
  return {
    isDesktop: false,
    isPortable: false,
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    hasKey: false,
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
 */
export const AI_SENTENCE_TIMEOUT_MS = 8_000;
export const AI_CALL_TIMEOUT_MS = 20_000;

export function getAiTimeoutMs(action: string): number {
  return action === 'generateSentence' ? AI_SENTENCE_TIMEOUT_MS : AI_CALL_TIMEOUT_MS;
}

async function postToGeminiApi<T>(action: string, payload: Record<string, any>): Promise<T> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), getAiTimeoutMs(action)) : null;
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
    try {
      data = await response.json();
    } catch {
      // Non-JSON response (or the time ran out while reading it)
    }
    if (controller?.signal.aborted) {
      throw new Error(`The AI took longer than ${getAiTimeoutMs(action) / 1000} s; using the offline fallback.`);
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(`The AI took longer than ${getAiTimeoutMs(action) / 1000} s; using the offline fallback.`);
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
  if (!tryUseAiCall(getBrowserDailyStorage(), getAiCallKind(action))) {
    throw new Error('Daily AI limit reached on this device; using the offline bank.');
  }
  return postToGeminiApi<T>(action, payload);
}

export const generateSentence = async (
  settings: Settings,
  pastSentences: string[] = [],
  forceCorrect: boolean | null = null,
  subtype: string | null = null,
  pastMistakes: string[] = [],
  questionType?: QuestionType
): Promise<GeneratedSentence> => {
  // Browser tests get a fixed, known sentence for each question type.
  if ((import.meta as any).env.DEV && isE2eMode()) {
    return getE2eSentence(questionType, forceCorrect);
  }
  try {
    const data = await requestDealerAction<GeneratedSentence>('generateSentence', {
      settings,
      pastSentences,
      forceCorrect,
      subtype,
      pastMistakes,
      questionType,
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
      // Automatically archive verified AI-generated sentences to the Cloud Sentence Bank in the background
      void archiveSentenceToCloudBank(data, settings, subtype);
      return data;
    }
    throw new Error("Invalid sentence structure returned from service.");
  } catch (err) {
    console.warn("Using curated fallback challenge due to service notice:", err);
    logEvent('ai', `Sentence from the built-in bank instead of AI: ${err instanceof Error ? err.message : String(err)}`);
    // Package L1: the offline bank loads only when it is needed.
    const { getCuratedSentence } = await import('./fallbackSentences');
    return getCuratedSentence(settings, pastSentences, forceCorrect, subtype, pastMistakes, questionType);
  }
};

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

