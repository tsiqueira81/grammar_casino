import { Settings, GeneratedSentence, CEFRLevel, QuestionType } from '../types';
import { getCuratedSentence } from './fallbackSentences';
import { archiveSentenceToCloudBank, auth, isVerifiedTeacherUser } from './firebaseService';

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

// --- Teacher PIN Gate (Offline-Only Fallback for Unauthenticated Visitors) ---
const TEACHER_PIN_STORAGE_KEY = 'grammar_casino_teacher_pin';

// Stored strictly in volatile memory (never persisted in localStorage/sessionStorage).
// Editing the URL, reloading the page, opening a new tab, or finishing a game automatically locks Live Mode.
let activeSessionTeacherPin = '';

if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem(TEACHER_PIN_STORAGE_KEY);
    sessionStorage.removeItem(TEACHER_PIN_STORAGE_KEY);
  } catch {}
}

export const getSavedTeacherPin = (): string => {
  return activeSessionTeacherPin.trim();
};

export const setSavedTeacherPin = (pin: string): void => {
  activeSessionTeacherPin = (pin || '').trim();
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(TEACHER_PIN_STORAGE_KEY);
      sessionStorage.removeItem(TEACHER_PIN_STORAGE_KEY);
    } catch {}
  }
};

export const clearSavedTeacherPin = (): void => {
  activeSessionTeacherPin = '';
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(TEACHER_PIN_STORAGE_KEY);
      sessionStorage.removeItem(TEACHER_PIN_STORAGE_KEY);
    } catch {}
  }
};

export const isTeacherPinUnlocked = (): boolean => {
  if (isDesktopApp()) return true;
  if (isVerifiedTeacherUser(auth.currentUser)) return true;
  return Boolean(getSavedTeacherPin());
};

export const verifyTeacherGoogleOnServer = async (idToken: string): Promise<{ valid: boolean; error?: string }> => {
  if (!idToken) return { valid: false, error: 'Missing Google ID token.' };
  try {
    const res = await fetch('/api/teacher-auth/google-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      // Static host fallback where /api/teacher-auth/google-verify is not present
      setSavedTeacherPin('google_verified');
      return { valid: true };
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.valid) {
      if (data.sessionPin) {
        setSavedTeacherPin(data.sessionPin);
      } else {
        setSavedTeacherPin('google_verified');
      }
      return { valid: true };
    }
    return { valid: false, error: data?.error || 'Google account is not authorized for Teacher Live AI.' };
  } catch {
    setSavedTeacherPin('google_verified');
    return { valid: true };
  }
};

export const checkTeacherPinStatus = async (): Promise<boolean> => {
  if (isDesktopApp()) return true;
  if (isVerifiedTeacherUser(auth.currentUser)) {
    if (!getSavedTeacherPin()) {
      try {
        const token = await auth.currentUser!.getIdToken();
        await verifyTeacherGoogleOnServer(token);
      } catch {}
    }
    return true;
  }
  const savedPin = getSavedTeacherPin();
  if (!savedPin) return false;
  try {
    const res = await fetch('/api/teacher-auth/status', {
      headers: { 'x-teacher-pin': savedPin },
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (!data?.unlocked) {
      clearSavedTeacherPin();
      return false;
    }
    return true;
  } catch {
    return Boolean(savedPin);
  }
};

export const verifyTeacherPinOnServer = async (pin: string): Promise<{ valid: boolean; error?: string }> => {
  const cleanPin = (pin || '').trim();
  if (!cleanPin) return { valid: false, error: 'Please enter the Teacher PIN.' };
  try {
    const res = await fetch('/api/teacher-auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: cleanPin }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.valid) {
      setSavedTeacherPin(cleanPin);
      return { valid: true };
    }
    return { valid: false, error: data?.error || 'Incorrect Teacher PIN.' };
  } catch {
    return { valid: false, error: 'Could not reach the server to verify PIN.' };
  }
};

export const changeTeacherPinOnServer = async (
  currentPin: string,
  newPin: string
): Promise<{ ok: boolean; error?: string }> => {
  const cleanCurrent = (currentPin || '').trim();
  const cleanNew = (newPin || '').trim();
  if (cleanNew.length < 4) {
    return { ok: false, error: 'New PIN must be at least 4 characters.' };
  }
  try {
    const res = await fetch('/api/teacher-auth/change-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPin: cleanCurrent, newPin: cleanNew }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.ok) {
      setSavedTeacherPin(cleanNew);
      return { ok: true };
    }
    return { ok: false, error: data?.error || 'Failed to update Teacher PIN.' };
  } catch {
    return { ok: false, error: 'Could not reach the server to update PIN.' };
  }
};

async function postToGeminiApi<T>(action: string, payload: Record<string, any>): Promise<T> {
  const savedPin = getSavedTeacherPin();
  if (!savedPin) {
    throw new Error('Offline Curated Mode active (Teacher PIN required for live Gemini AI).');
  }

  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-teacher-pin': savedPin,
    },
    body: JSON.stringify({ action, teacherPin: savedPin, ...payload }),
  });

  let data: any = null;
  try {
    data = await response.json();
  } catch {
    // Non-JSON response
  }

  if (data?.offlineMode) {
    clearSavedTeacherPin();
  }

  if (!response.ok || data?.fallback) {
    const errorMsg = data?.error || `HTTP ${response.status} from /api/gemini`;
    throw new Error(errorMsg);
  }

  return data as T;
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
      // Automatically archive verified AI-generated sentences to the Cloud Sentence Bank in the background
      void archiveSentenceToCloudBank(data, settings, subtype);
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

export function normalizeContractionsForKwt(input: string): string {
  return (input || '')
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.,!?;:"“”]/g, '')
    .replace(/\bwon't\b/g, 'will not')
    .replace(/\bcan't\b/g, 'cannot')
    .replace(/\bshan't\b/g, 'shall not')
    .replace(/\bdon't\b/g, 'do not')
    .replace(/\bdoesn't\b/g, 'does not')
    .replace(/\bdidn't\b/g, 'did not')
    .replace(/\bhaven't\b/g, 'have not')
    .replace(/\bhasn't\b/g, 'has not')
    .replace(/\bhadn't\b/g, 'had not')
    .replace(/\bwouldn't\b/g, 'would not')
    .replace(/\bcouldn't\b/g, 'could not')
    .replace(/\bshouldn't\b/g, 'should not')
    .replace(/\bmustn't\b/g, 'must not')
    .replace(/\bneedn't\b/g, 'need not')
    .replace(/\boughtn't\b/g, 'ought not')
    .replace(/\bisn't\b/g, 'is not')
    .replace(/\baren't\b/g, 'are not')
    .replace(/\bwasn't\b/g, 'was not')
    .replace(/\bweren't\b/g, 'were not')
    .replace(/\bi'm\b/g, 'i am')
    .replace(/\byou're\b/g, 'you are')
    .replace(/\bwe're\b/g, 'we are')
    .replace(/\bthey're\b/g, 'they are')
    .replace(/\bi've\b/g, 'i have')
    .replace(/\byou've\b/g, 'you have')
    .replace(/\bwe've\b/g, 'we have')
    .replace(/\bthey've\b/g, 'they have')
    .replace(/\bi'll\b/g, 'i will')
    .replace(/\byou'll\b/g, 'you will')
    .replace(/\bhe'll\b/g, 'he will')
    .replace(/\bshe'll\b/g, 'she will')
    .replace(/\bwe'll\b/g, 'we will')
    .replace(/\bthey'll\b/g, 'they will')
    .replace(/\s+/g, ' ')
    .trim();
}

export function evaluateKeyWordTransformationDeterministic(
  candidate: string,
  intendedAnswer: string,
  acceptedAnswers: string[] = [],
  baseWord?: string,
  mark1Parts: string[] = [],
  mark2Parts: string[] = []
): { isCorrect: boolean; marks: 0 | 1 | 2; feedback: string } {
  const rawTrimmed = (candidate || '').trim().replace(/\s+/g, ' ');
  const words = rawTrimmed.split(' ').filter(Boolean);
  const key = (baseWord || '').trim().toUpperCase();

  if (words.length < 2 || words.length > 6) {
    return {
      isCorrect: false,
      marks: 0,
      feedback: `Key Word Transformation answers must be between 2 and 6 words (you wrote ${words.length} word${words.length === 1 ? '' : 's'}).`,
    };
  }

  if (key) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const keyRegex = new RegExp(`(^|[^a-zA-Z])${escapedKey}([^a-zA-Z]|$)`, 'i');
    if (!keyRegex.test(rawTrimmed)) {
      return {
        isCorrect: false,
        marks: 0,
        feedback: `0/2 Marks: You must include the given KEY WORD "${key}" without changing its form.`,
      };
    }
  }

  const candNorm = normalizeContractionsForKwt(rawTrimmed);
  const candRawNorm = rawTrimmed.toLowerCase().replace(/[.,!?;:"“”]/g, '').replace(/\s+/g, ' ').trim();

  const allAccepted = [intendedAnswer, ...(acceptedAnswers || [])].filter(Boolean);
  for (const acc of allAccepted) {
    const accNorm = normalizeContractionsForKwt(acc);
    const accRawNorm = acc.trim().toLowerCase().replace(/[.,!?;:"“”]/g, '').replace(/\s+/g, ' ').trim();
    if (candNorm === accNorm || candRawNorm === accRawNorm) {
      return {
        isCorrect: true,
        marks: 2,
        feedback: `2/2 Marks! Full Cambridge Part 4 transformation ("${rawTrimmed}").`,
      };
    }
  }

  // Derive fallback mark1Parts / mark2Parts from intendedAnswer split around baseWord if not explicitly provided
  let m1List = Array.isArray(mark1Parts) && mark1Parts.length > 0 ? [...mark1Parts] : [];
  let m2List = Array.isArray(mark2Parts) && mark2Parts.length > 0 ? [...mark2Parts] : [];
  if (m1List.length === 0 && m2List.length === 0 && intendedAnswer) {
    const intWords = intendedAnswer.trim().split(/\s+/).filter(Boolean);
    if (intWords.length >= 2) {
      const mid = Math.ceil(intWords.length / 2);
      m1List = [intWords.slice(0, mid).join(' ')];
      m2List = [intWords.slice(mid).join(' ')];
    }
  }

  const normM1 = m1List.map(normalizeContractionsForKwt).filter(Boolean);
  const normM2 = m2List.map(normalizeContractionsForKwt).filter(Boolean);

  const matchedM1 = normM1.find(p => candNorm === p || candNorm.startsWith(p + ' ') || candNorm.includes(' ' + p + ' '));
  const matchedM2 = normM2.find(p => candNorm === p || candNorm.endsWith(' ' + p) || candNorm.includes(' ' + p + ' '));

  // If both halves match and their combined length equals candNorm, award 2 marks
  for (const p1 of normM1) {
    for (const p2 of normM2) {
      if (`${p1} ${p2}`.trim() === candNorm) {
        return {
          isCorrect: true,
          marks: 2,
          feedback: `2/2 Marks! Both halves of the target transformation are accurate ("${rawTrimmed}").`,
        };
      }
    }
  }

  if (matchedM1 || matchedM2) {
    const earnedHalf = matchedM1 || matchedM2;
    return {
      isCorrect: true,
      marks: 1,
      feedback: `1/2 Mark (Partial Credit): Good structure with "${earnedHalf}", though the full 2-mark transformation is "${intendedAnswer}".`,
    };
  }

  return {
    isCorrect: false,
    marks: 0,
    feedback: `0/2 Marks: "${rawTrimmed}" does not match the target structure (expected "${intendedAnswer}").`,
  };
}

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
      return data.results;
    }
  } catch (err) {
    console.warn('Using offline Cloze/Transformation batch verification fallback:', err);
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

  // Offline heuristic fallback for single-word Open Cloze & Word Formation
  const cleanBase = (baseWord || '').trim().toLowerCase();
  const acceptedSet = new Set(
    [intendedAnswer, ...(acceptedAnswers || [])]
      .map(a => (a || '').trim().toLowerCase())
      .filter(a => Boolean(a) && (questionType !== 'wordFormation' || a !== cleanBase))
  );
  uniqueWords.forEach(word => {
    const key = word.trim().toLowerCase();
    if (key.includes(' ')) {
      fallbackResults[key] = {
        isCorrect: false,
        marks: 0,
        feedback: 'Single-word gaps require one word only.',
      };
    } else if (questionType === 'wordFormation' && cleanBase && key === cleanBase) {
      fallbackResults[key] = {
        isCorrect: false,
        marks: 0,
        feedback: `You must transform the base word (${baseWord?.toUpperCase()}) into a different grammatical form.`,
      };
    } else if (acceptedSet.has(key)) {
      fallbackResults[key] = {
        isCorrect: true,
        marks: 1,
        feedback: `Accepted! "${word}" fits the grammatical gap.`,
      };
    } else {
      fallbackResults[key] = {
        isCorrect: false,
        marks: 0,
        feedback: `"${word}" does not fit the grammatical context (expected "${intendedAnswer}").`,
      };
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
  }

  return `Grammatical Focus (${topic}): ${originalExplanation}${correction ? ` Standard target structure: "${correction}".` : ''}`;
};

export const generateSpeech = async (text: string): Promise<string> => {
  const data = await requestDealerAction<{ base64Audio: string }>('generateSpeech', { text });
  if (!data?.base64Audio) {
    throw new Error("No speech audio returned by dealer service.");
  }
  return data.base64Audio;
};
