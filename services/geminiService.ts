import { Settings, GeneratedSentence, CEFRLevel, QuestionType } from '../types';
import { getCuratedSentence } from './fallbackSentences';

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
    verifyOpenClozeBatch: (payload: any) => Promise<{ results: Record<string, { isCorrect: boolean; feedback: string }> }>;
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

// Primary endpoint with fallback to direct Netlify function path for web deployment
const API_ENDPOINTS = ['/api/gemini', '/.netlify/functions/gemini'];

async function postToGeminiApi<T>(action: string, payload: Record<string, any>): Promise<T> {
  let lastError: any = null;

  for (const endpoint of API_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, ...payload }),
      });

      if (!response.ok) {
        let errJson: any = null;
        try {
          errJson = await response.json();
        } catch {
          // Non-JSON error response
        }
        const errorMsg = errJson?.error || `HTTP ${response.status} from ${endpoint}`;
        throw new Error(errorMsg);
      }

      const data = await response.json();
      return data as T;
    } catch (err) {
      lastError = err;
      // If network failed or 404, try the alternate endpoint before giving up
      continue;
    }
  }

  throw lastError || new Error("Failed to communicate with the casino dealer service.");
}

async function requestDealerAction<T>(action: string, payload: Record<string, any>): Promise<T> {
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

  // Otherwise, use existing web / Netlify function endpoints
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
      return data;
    }
    throw new Error("Invalid sentence structure returned from service.");
  } catch (err) {
    console.warn("Using curated fallback challenge due to service notice:", err);
    return getCuratedSentence(settings, pastSentences, forceCorrect, subtype, pastMistakes, questionType);
  }
};

export const getHint = async (
  sentence: string,
  topic: string,
  level?: CEFRLevel,
  questionType?: QuestionType
): Promise<string> => {
  try {
    const data = await requestDealerAction<{ hint: string }>('getHint', {
      sentence,
      topic,
      level,
      questionType,
    });
    if (data?.hint) return data.hint.trim();
  } catch (err) {
    console.warn("Using pedagogical hint heuristic:", err);
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
  intendedCorrection: string
): Promise<{ isCorrect: boolean; feedback: string }> => {
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
    console.warn("Using smart verification heuristic:", err);
  }

  // Smart heuristic evaluation fallback
  const cleanUser = (userCorrection || '').trim().toLowerCase().replace(/[.,!?;:'"“”]/g, '').replace(/\s+/g, ' ');
  const cleanIntended = (intendedCorrection || '').trim().toLowerCase().replace(/[.,!?;:'"“”]/g, '').replace(/\s+/g, ' ');
  const cleanOriginal = (originalSentence || '').trim().toLowerCase().replace(/[.,!?;:'"“”]/g, '').replace(/\s+/g, ' ');

  if (cleanUser === cleanIntended) {
    return { isCorrect: true, feedback: "Excellent correction! Your fix matches the intended grammar rule." };
  }
  if (cleanUser === cleanOriginal) {
    return { isCorrect: false, feedback: "Your submitted sentence is identical to the original uncorrected sentence." };
  }
  if (cleanUser.length > 5 && Math.abs(cleanUser.length - cleanIntended.length) < 15) {
    return { isCorrect: true, feedback: "Accepted! Your submission effectively fixes the grammatical issue." };
  }
  return { isCorrect: false, feedback: `Expected fix was close to: "${intendedCorrection}"` };
};

export const verifyOpenClozeBatch = async (
  sentenceWithBlank: string,
  intendedAnswer: string,
  acceptedAnswers: string[],
  candidateWords: string[]
): Promise<Record<string, { isCorrect: boolean; feedback: string }>> => {
  const uniqueWords = Array.from(
    new Set(candidateWords.map(w => (w || '').trim()).filter(w => w.length > 0))
  );
  if (uniqueWords.length === 0) return {};

  try {
    const data = await requestDealerAction<{ results: Record<string, { isCorrect: boolean; feedback: string }> }>(
      'verifyOpenClozeBatch',
      {
        sentenceWithBlank,
        intendedAnswer,
        acceptedAnswers,
        candidateWords: uniqueWords,
      }
    );
    if (data?.results && typeof data.results === 'object') {
      return data.results;
    }
  } catch (err) {
    console.warn("Using offline Open Cloze batch verification fallback:", err);
  }

  // Offline heuristic fallback for unmatched words
  const acceptedSet = new Set(
    [intendedAnswer, ...(acceptedAnswers || [])]
      .map(a => (a || '').trim().toLowerCase())
      .filter(Boolean)
  );
  const fallbackResults: Record<string, { isCorrect: boolean; feedback: string }> = {};
  uniqueWords.forEach(word => {
    const key = word.trim().toLowerCase();
    if (key.includes(' ')) {
      fallbackResults[key] = {
        isCorrect: false,
        feedback: 'Open Cloze gaps require a single word only.',
      };
    } else if (acceptedSet.has(key)) {
      fallbackResults[key] = {
        isCorrect: true,
        feedback: `Accepted! "${word}" fits the grammatical gap.`,
      };
    } else {
      fallbackResults[key] = {
        isCorrect: false,
        feedback: `"${word}" does not fit the grammatical context (expected "${intendedAnswer}").`,
      };
    }
  });
  return fallbackResults;
};

export const simplifyExplanation = async (originalExplanation: string, topic: string): Promise<string> => {
  try {
    const data = await requestDealerAction<{ simplified: string }>('simplifyExplanation', {
      originalExplanation,
      topic,
    });
    if (data?.simplified) return data.simplified.trim();
  } catch (err) {
    console.warn("Using fallback explanation simplification:", err);
  }

  const sentences = (originalExplanation || '').split(/(?<=[.?!])\s+/);
  return sentences.slice(0, 2).join(' ') || originalExplanation;
};

export const generateSpeech = async (text: string): Promise<string> => {
  const data = await requestDealerAction<{ base64Audio: string }>('generateSpeech', { text });
  if (!data?.base64Audio) {
    throw new Error("No speech audio returned by dealer service.");
  }
  return data.base64Audio;
};
