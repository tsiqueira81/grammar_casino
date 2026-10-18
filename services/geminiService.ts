import { Settings, GeneratedSentence, CEFRLevel } from '../types';
import { getCuratedSentence } from './fallbackSentences';

// Primary endpoint with fallback to direct Netlify function path
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

export const generateSentence = async (
  settings: Settings,
  pastSentences: string[] = [],
  forceCorrect: boolean | null = null,
  subtype: string | null = null,
  pastMistakes: string[] = []
): Promise<GeneratedSentence> => {
  try {
    const data = await postToGeminiApi<GeneratedSentence>('generateSentence', {
      settings,
      pastSentences,
      forceCorrect,
      subtype,
      pastMistakes,
    });

    if (data && data.text) {
      if (!data.isCorrect && !data.errorPhrase) {
        data.errorPhrase = data.grammarPhrase;
      }
      return data;
    }
    throw new Error("Invalid sentence structure returned from service.");
  } catch (err) {
    console.warn("Using curated fallback challenge due to service notice:", err);
    return getCuratedSentence(settings, pastSentences, forceCorrect, subtype, pastMistakes);
  }
};

export const getHint = async (sentence: string, topic: string, level?: CEFRLevel): Promise<string> => {
  try {
    const data = await postToGeminiApi<{ hint: string }>('getHint', {
      sentence,
      topic,
      level,
    });
    if (data?.hint) return data.hint.trim();
  } catch (err) {
    console.warn("Using pedagogical hint heuristic:", err);
  }

  // Topic-specific pedagogical heuristic hints
  const topicLower = (topic || '').toLowerCase();
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
    const data = await postToGeminiApi<{ isCorrect: boolean; feedback: string }>('verifyCorrection', {
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

export const simplifyExplanation = async (originalExplanation: string, topic: string): Promise<string> => {
  try {
    const data = await postToGeminiApi<{ simplified: string }>('simplifyExplanation', {
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
  const data = await postToGeminiApi<{ base64Audio: string }>('generateSpeech', { text });
  if (!data?.base64Audio) {
    throw new Error("No speech audio returned by dealer service.");
  }
  return data.base64Audio;
};
