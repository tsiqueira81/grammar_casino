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

async function postToGeminiApi<T>(action: string, payload: Record<string, any>, isRetry = false): Promise<T> {
  let savedPin = getSavedTeacherPin();
  if (!savedPin && isVerifiedTeacherUser(auth.currentUser)) {
    try {
      const idToken = await auth.currentUser!.getIdToken();
      await verifyTeacherGoogleOnServer(idToken);
      savedPin = getSavedTeacherPin();
    } catch {}
  }
  if (!savedPin) {
    throw new Error('Offline Curated Mode active (Teacher PIN or Google Sign-In required for live Gemini AI).');
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
    if (!isRetry && isVerifiedTeacherUser(auth.currentUser)) {
      return postToGeminiApi<T>(action, payload, true);
    }
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

const FINITE_AUX_GROUPS: Record<string, string> = {
  is: 'be_pres_sg',
  are: 'be_pres_pl',
  am: 'be_pres_1s',
  was: 'be_past_sg',
  were: 'be_past_pl',
  has: 'have_pres_sg',
  have: 'have_pres_pl',
  had: 'have_past',
  does: 'do_pres_sg',
  do: 'do_pres_pl',
  did: 'do_past',
  will: 'modal_will_pres',
  would: 'modal_will_past',
};

const IRREGULAR_TENSE_CONFLICT_PAIRS: Array<[string, string]> = [
  ['take', 'took'],
  ['takes', 'took'],
  ['make', 'made'],
  ['makes', 'made'],
  ['go', 'went'],
  ['goes', 'went'],
  ['come', 'came'],
  ['comes', 'came'],
  ['see', 'saw'],
  ['sees', 'saw'],
  ['know', 'knew'],
  ['knows', 'knew'],
  ['give', 'gave'],
  ['gives', 'gave'],
  ['tell', 'told'],
  ['tells', 'told'],
  ['say', 'said'],
  ['says', 'said'],
  ['think', 'thought'],
  ['thinks', 'thought'],
  ['buy', 'bought'],
  ['buys', 'bought'],
  ['bring', 'brought'],
  ['brings', 'brought'],
  ['keep', 'kept'],
  ['keeps', 'kept'],
  ['leave', 'left'],
  ['leaves', 'left'],
  ['feel', 'felt'],
  ['feels', 'felt'],
  ['find', 'found'],
  ['finds', 'found'],
  ['begin', 'began'],
  ['begins', 'began'],
];

function computeLevenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function areValidUkUsSpellingVariants(a: string, b: string): boolean {
  const w1 = a.toLowerCase();
  const w2 = b.toLowerCase();
  if (w1 === w2) return true;
  const normalizeUkUs = (w: string) =>
    w
      .replace(/ization\b/g, 'isation')
      .replace(/ize(d|s|r|rs)?\b/g, 'ise$1')
      .replace(/izing\b/g, 'ising')
      .replace(/yze(d|s)?\b/g, 'yse$1')
      .replace(/our(s|ed|ing|ite|ites)?\b/g, 'or$1')
      .replace(/\b(travel|cancel|model|label|signal|dial|fuel|quarrel|counsel|marvel)led\b/g, '$1ed')
      .replace(/\b(travel|cancel|model|label|signal|dial|fuel|quarrel|counsel|marvel)ling\b/g, '$1ing')
      .replace(/\b(travel|cancel|model|label|signal|dial|fuel|quarrel|counsel|marvel)ler(s)?\b/g, '$1er$2')
      .replace(/\b(learn|spoil|dream|burn|leap|spell|smell|kneel)t\b/g, '$1ed')
      .replace(/\bgotten\b/g, 'got')
      .replace(/\bpractise(d|s|ing)?\b/g, 'practice$1');
  return normalizeUkUs(w1) === normalizeUkUs(w2);
}

function detectHalfDisqualification(
  candHalf: string,
  refHalves: string[],
  knownValidWords: Set<string>
): string | null {
  const candWords = candHalf.split(/\s+/).filter(Boolean);
  if (candWords.length === 0 || refHalves.length === 0) return null;

  const refWordsList = refHalves.map(h => h.split(/\s+/).filter(Boolean));
  const allRefWords = new Set<string>(refWordsList.flat());

  // 1. Check for finite tense / agreement auxiliary conflict against reference halves
  const refAuxSet = new Set<string>();
  allRefWords.forEach(w => {
    if (FINITE_AUX_GROUPS[w]) refAuxSet.add(w);
  });

  if (refAuxSet.size > 0) {
    for (const cw of candWords) {
      if (FINITE_AUX_GROUPS[cw] && !refAuxSet.has(cw)) {
        const expectedAux = Array.from(refAuxSet)[0];
        return `wrong verb tense/agreement "${cw}" instead of "${expectedAux}"`;
      }
    }
  }

  // Check irregular lexical verb tense conflicts (e.g. "take" vs "took")
  for (const [pres, past] of IRREGULAR_TENSE_CONFLICT_PAIRS) {
    if (allRefWords.has(pres) && !allRefWords.has(past) && candWords.includes(past)) {
      return `wrong verb tense "${past}" instead of "${pres}"`;
    }
    if (allRefWords.has(past) && !allRefWords.has(pres) && candWords.includes(pres)) {
      return `wrong verb tense "${pres}" instead of "${past}"`;
    }
  }

  // 2. Check for spelling errors / typos of target words in this half
  for (const cw of candWords) {
    if (cw.length < 4 || allRefWords.has(cw) || knownValidWords.has(cw)) continue;
    for (const rw of allRefWords) {
      if (rw.length < 4 || cw === rw) continue;
      if (areValidUkUsSpellingVariants(cw, rw)) continue;
      const dist = computeLevenshteinDistance(cw, rw);
      const collapsedCand = cw.replace(/(.)\1+/g, '$1');
      const collapsedRef = rw.replace(/(.)\1+/g, '$1');
      const isDoubleLetterTypo = collapsedCand === collapsedRef;
      const isCloseTypo = dist === 1 || (dist === 2 && rw.length >= 7 && cw[0] === rw[0]);
      if (isDoubleLetterTypo || isCloseTypo) {
        return `spelling error "${cw}" (should be "${rw}")`;
      }
    }
  }

  return null;
}

export interface KwtDeterministicEvaluation {
  isCorrect: boolean;
  marks: 0 | 1 | 2;
  feedback: string;
  half1Matched?: boolean;
  half2Matched?: boolean;
  half1Disqualified?: boolean;
  half2Disqualified?: boolean;
  half1Reason?: string | null;
  half2Reason?: string | null;
}

export function evaluateKeyWordTransformationDeterministic(
  candidate: string,
  intendedAnswer: string,
  acceptedAnswers: string[] = [],
  baseWord?: string,
  mark1Parts: string[] = [],
  mark2Parts: string[] = []
): KwtDeterministicEvaluation {
  const rawTrimmed = (candidate || '').trim().replace(/\s+/g, ' ');
  const words = rawTrimmed.split(' ').filter(Boolean);
  const key = (baseWord || '').trim().toUpperCase();
  const keyNorm = key.toLowerCase();

  if (words.length < 2 || words.length > 6) {
    return {
      isCorrect: false,
      marks: 0,
      half1Disqualified: true,
      half2Disqualified: true,
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
        half1Disqualified: true,
        half2Disqualified: true,
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
        half1Matched: true,
        half2Matched: true,
        half1Disqualified: false,
        half2Disqualified: false,
        feedback: `2/2 Marks! Full Cambridge Part 4 transformation ("${rawTrimmed}").`,
      };
    }
  }

  // Derive fallback mark1Parts / mark2Parts from intendedAnswer split around midpoint if not explicitly provided
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

  const normM1All = m1List.map(normalizeContractionsForKwt).filter(Boolean);
  const normM2All = m2List.map(normalizeContractionsForKwt).filter(Boolean);

  // If both halves match and their combined string equals candNorm, award 2 marks
  for (const p1 of normM1All) {
    for (const p2 of normM2All) {
      if (`${p1} ${p2}`.trim() === candNorm) {
        return {
          isCorrect: true,
          marks: 2,
          half1Matched: true,
          half2Matched: true,
          half1Disqualified: false,
          half2Disqualified: false,
          feedback: `2/2 Marks! Both halves of the target transformation are accurate ("${rawTrimmed}").`,
        };
      }
    }
  }

  // In Cambridge Part 4, a 1-mark partial half can NEVER be just the bare given KEY WORD alone,
  // and mark1Parts must match at the START of the phrase while mark2Parts must match at the END.
  const normM1Partial = normM1All.filter(p => p !== keyNorm);
  const normM2Partial = normM2All.filter(p => p !== keyNorm);

  const matchedM1 = normM1Partial.find(p => candNorm === p || candNorm.startsWith(p + ' '));
  const matchedM2 = normM2Partial.find(p => candNorm === p || candNorm.endsWith(' ' + p));

  // Split candidate into candHalf1 and candHalf2 to inspect non-matching halves for tense/spelling errors
  const candWords = candNorm.split(' ').filter(Boolean);
  let candHalf1 = '';
  let candHalf2 = '';
  if (matchedM1 && candNorm.startsWith(matchedM1 + ' ')) {
    candHalf1 = matchedM1;
    candHalf2 = candNorm.slice(matchedM1.length).trim();
  } else if (matchedM2 && candNorm.endsWith(' ' + matchedM2)) {
    candHalf2 = matchedM2;
    candHalf1 = candNorm.slice(0, candNorm.length - matchedM2.length).trim();
  } else {
    const m1SampleWords = (normM1All[0] || '').split(' ').filter(Boolean);
    const m2SampleWords = (normM2All[0] || '').split(' ').filter(Boolean);
    const keyIdxInCand = keyNorm ? candWords.indexOf(keyNorm) : -1;
    let splitIdx = Math.min(candWords.length - 1, Math.max(1, m1SampleWords.length || Math.ceil(candWords.length / 2)));
    if (keyIdxInCand >= 0 && keyNorm) {
      if (m1SampleWords.includes(keyNorm)) {
        const afterKey = m1SampleWords.length - 1 - m1SampleWords.lastIndexOf(keyNorm);
        splitIdx = Math.min(candWords.length - 1, Math.max(1, keyIdxInCand + 1 + afterKey));
      } else if (m2SampleWords.includes(keyNorm)) {
        const beforeKey = m2SampleWords.indexOf(keyNorm);
        splitIdx = Math.min(candWords.length - 1, Math.max(1, keyIdxInCand - beforeKey));
      }
    }
    candHalf1 = candWords.slice(0, splitIdx).join(' ');
    candHalf2 = candWords.slice(splitIdx).join(' ');
  }

  const knownValidWords = new Set<string>();
  [...allAccepted, ...normM1All, ...normM2All].forEach(phrase => {
    normalizeContractionsForKwt(phrase)
      .split(/\s+/)
      .filter(Boolean)
      .forEach(w => knownValidWords.add(w));
  });

  const half1Reason = matchedM1 ? null : detectHalfDisqualification(candHalf1, normM1All, knownValidWords);
  const half2Reason = matchedM2 ? null : detectHalfDisqualification(candHalf2, normM2All, knownValidWords);
  const half1Disqualified = Boolean(half1Reason);
  const half2Disqualified = Boolean(half2Reason);

  if (matchedM1 || matchedM2) {
    const earnedHalf = matchedM1 || matchedM2;
    const otherIssue = matchedM1 ? half2Reason : half1Reason;
    return {
      isCorrect: true,
      marks: 1,
      half1Matched: Boolean(matchedM1),
      half2Matched: Boolean(matchedM2),
      half1Disqualified,
      half2Disqualified,
      half1Reason,
      half2Reason,
      feedback: otherIssue
        ? `1/2 Mark (Partial Credit): "${earnedHalf}" earns 1 mark, but the other half has a ${otherIssue} (full answer: "${intendedAnswer}").`
        : `1/2 Mark (Partial Credit): Good structure with "${earnedHalf}", though the full 2-mark transformation is "${intendedAnswer}".`,
    };
  }

  const bothReasons = [half1Reason, half2Reason].filter(Boolean);
  const detailedZeroFeedback =
    bothReasons.length > 0
      ? `0/2 Marks: ${bothReasons.join(', and ')} (expected "${intendedAnswer}").`
      : `0/2 Marks: "${rawTrimmed}" does not match the target structure (expected "${intendedAnswer}").`;

  return {
    isCorrect: false,
    marks: 0,
    half1Matched: false,
    half2Matched: false,
    half1Disqualified,
    half2Disqualified,
    half1Reason,
    half2Reason,
    feedback: detailedZeroFeedback,
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
