import { sanitizeMultipleChoiceDistractors } from '../utils/offlineGrammarEngine';

export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Guarantees that a Multiple-Choice Cloze challenge has options and `correctAnswer`
 * that ONLY represent the missing gap `_____` in `text`, never duplicating words
 * that already appear in the given sentence around the gap.
 */
export function enforceMultipleChoiceIntegrity(data: any) {
  let corr = String(data.correction || "").replace(/\s+/g, " ").trim();
  let txt = String(data.text || "").replace(/\s+/g, " ").trim();
  let answer = String(data.correctAnswer || "").replace(/\s+/g, " ").trim();
  let opts: string[] = Array.isArray(data.options)
    ? data.options.map((o: any) => String(o || "").replace(/\s+/g, " ").trim()).filter(Boolean)
    : [];

  if (/_{2,}/.test(txt)) {
    txt = txt.replace(/_{2,}/, "_____");
  }

  // 1. Repair common 3-part phrasal-prepositional verb omissions in `correction`
  const phrasalRepairs: Array<[RegExp, string]> = [
    [/\b(look(?:s|ed|ing)?\s+forward)\s+(?!to\b)([a-z]+ing)\b/gi, "$1 to $2"],
    [/\b(put(?:s|ting)?\s+up)\s+(?!with\b)([a-z]+ing)\b/gi, "$1 with $2"],
    [/\b(came|come(?:s|ing)?)\s+up\s+(?!with\b)(a|an|the|some|this|that|an?\s+idea|a\s+plan)\b/gi, "$1 up with $2"],
    [/\b(ran|run(?:s|ning)?)\s+out\s+(?!of\b)([a-z]+)\b/gi, "$1 out of $2"],
  ];
  for (const [pattern, replacement] of phrasalRepairs) {
    corr = corr.replace(pattern, replacement);
  }

  // 2. If all options (and correctAnswer) share an identical leading word or trailing word,
  // strip that constant word from all options and correctAnswer so unchanging sentence words aren't in the choices.
  const allChoices = answer ? [answer, ...opts] : [...opts];
  if (allChoices.length >= 2) {
    while (allChoices.every((c) => c.split(/\s+/).length > 1)) {
      const firstWord = allChoices[0].split(/\s+/)[0].toLowerCase();
      if (allChoices.every((c) => c.split(/\s+/)[0].toLowerCase() === firstWord)) {
        const stripLeading = (s: string) => s.replace(/^\S+\s+/, "").trim();
        answer = stripLeading(answer);
        opts = opts.map(stripLeading);
        for (let i = 0; i < allChoices.length; i++) allChoices[i] = stripLeading(allChoices[i]);
      } else {
        break;
      }
    }
    while (allChoices.every((c) => c.split(/\s+/).length > 1)) {
      const words0 = allChoices[0].split(/\s+/);
      const lastWord = words0[words0.length - 1].toLowerCase();
      if (
        allChoices.every((c) => {
          const w = c.split(/\s+/);
          return w[w.length - 1].toLowerCase() === lastWord;
        })
      ) {
        const stripTrailing = (s: string) => s.replace(/\s+\S+$/, "").trim();
        answer = stripTrailing(answer);
        opts = opts.map(stripTrailing);
        for (let i = 0; i < allChoices.length; i++) allChoices[i] = stripTrailing(allChoices[i]);
      } else {
        break;
      }
    }
  }

  // 3. Check for overlap between `answer` / `opts` and the words immediately before/after `_____` in `txt`
  if (txt.includes("_____") && corr) {
    const [beforeRaw, afterRaw] = txt.split("_____");
    const beforeWords = beforeRaw.trim().split(/\s+/).filter(Boolean);
    const afterWords = (afterRaw || "").trim().split(/\s+/).filter(Boolean);
    const prevWord = beforeWords.length > 0 ? beforeWords[beforeWords.length - 1].replace(/^[^a-zA-Z0-9']+|[^a-zA-Z0-9']+$/g, "") : "";
    const nextWord = afterWords.length > 0 ? afterWords[0].replace(/^[^a-zA-Z0-9']+|[^a-zA-Z0-9']+$/g, "") : "";

    if (prevWord) {
      const prevPrefixRe = new RegExp(`^${escapeRegExp(prevWord)}\\s+`, "i");
      if (prevPrefixRe.test(answer)) {
        const strippedAnswer = answer.replace(prevPrefixRe, "").trim();
        const strippedOpts = opts.map((o) => o.replace(prevPrefixRe, "").trim());
        const uniqueStripped = new Set(strippedOpts.map((o) => o.toLowerCase()));
        const testFilled = txt.replace("_____", strippedAnswer).replace(/\s+/g, " ").trim();
        if (strippedAnswer && testFilled.toLowerCase() === corr.toLowerCase() && uniqueStripped.size === opts.length) {
          answer = strippedAnswer;
          opts = strippedOpts;
        } else {
          txt = txt.replace(new RegExp(`\\b${escapeRegExp(prevWord)}\\s+_____`, "i"), "_____");
        }
      } else if (opts.some((o) => o.toLowerCase() === `${prevWord.toLowerCase()} ${answer.toLowerCase()}`)) {
        // E.g. txt = "He decided to _____ the offer", answer = "accept", opts = ["accept", "to accept", "accepting", "accepted"]
        const expandedAnswer = `${prevWord} ${answer}`;
        const expandedTxt = txt.replace(new RegExp(`\\b${escapeRegExp(prevWord)}\\s+_____`, "i"), "_____");
        if (expandedTxt.replace("_____", expandedAnswer).replace(/\s+/g, " ").trim().toLowerCase() === corr.toLowerCase()) {
          txt = expandedTxt;
          answer = expandedAnswer;
        }
      }
    }

    const [, afterRaw2] = txt.split("_____");
    const afterWords2 = (afterRaw2 || "").trim().split(/\s+/).filter(Boolean);
    const nextWord2 = afterWords2.length > 0 ? afterWords2[0].replace(/^[^a-zA-Z0-9']+|[^a-zA-Z0-9']+$/g, "") : "";

    if (nextWord2) {
      const nextSuffixRe = new RegExp(`\\s+${escapeRegExp(nextWord2)}$`, "i");
      if (nextSuffixRe.test(answer)) {
        const strippedAnswer = answer.replace(nextSuffixRe, "").trim();
        const strippedOpts = opts.map((o) => o.replace(nextSuffixRe, "").trim());
        const uniqueStripped = new Set(strippedOpts.map((o) => o.toLowerCase()));
        const testFilled = txt.replace("_____", strippedAnswer).replace(/\s+/g, " ").trim();
        if (strippedAnswer && testFilled.toLowerCase() === corr.toLowerCase() && uniqueStripped.size === opts.length) {
          answer = strippedAnswer;
          opts = strippedOpts;
        } else {
          txt = txt.replace(new RegExp(`_____\\s+${escapeRegExp(nextWord2)}\\b`, "i"), "_____");
        }
      }
    }
  }

  // 4. Ensure `txt` with `answer` substituted in place of `_____` matches `corr` word-for-word
  if (answer && corr) {
    const filled = txt.replace(/_{2,}/, answer).replace(/\s+/g, " ").trim();
    if (filled.toLowerCase() !== corr.toLowerCase()) {
      const targetRegex = new RegExp(`\\b${escapeRegExp(answer)}\\b`, "i");
      const phrase = String(data.grammarPhrase || "").trim();
      let rebuilt = "";

      if (phrase && corr.toLowerCase().includes(phrase.toLowerCase()) && targetRegex.test(phrase)) {
        const phraseMatch = corr.match(new RegExp(escapeRegExp(phrase), "i"));
        if (phraseMatch && phraseMatch.index !== undefined) {
          const before = corr.slice(0, phraseMatch.index);
          const matchedPhrase = phraseMatch[0];
          const after = corr.slice(phraseMatch.index + matchedPhrase.length);
          const blankedPhrase = matchedPhrase.replace(targetRegex, (m) => {
            answer = m;
            return "_____";
          });
          rebuilt = `${before}${blankedPhrase}${after}`;
        }
      }

      if (!rebuilt && targetRegex.test(corr)) {
        rebuilt = corr.replace(targetRegex, (m) => {
          answer = m;
          return "_____";
        });
      }

      if (rebuilt && /_{2,}/.test(rebuilt)) {
        txt = rebuilt;
      } else if (/_{2,}/.test(txt)) {
        let repairedFilled = filled;
        for (const [pattern, replacement] of phrasalRepairs) {
          repairedFilled = repairedFilled.replace(pattern, replacement);
        }
        corr = repairedFilled;
        if (repairedFilled.toLowerCase() !== filled.toLowerCase() && targetRegex.test(corr)) {
          txt = corr.replace(targetRegex, "_____");
        }
      }
    }
  }

  // 5. Strip adjacent `prevWord` or `nextWord` from any individual distractor option that still includes it
  if (txt.includes("_____")) {
    const [beforeFinal, afterFinal] = txt.split("_____");
    const bw = beforeFinal.trim().split(/\s+/).filter(Boolean);
    const aw = (afterFinal || "").trim().split(/\s+/).filter(Boolean);
    const finalPrev = bw.length > 0 ? bw[bw.length - 1].replace(/^[^a-zA-Z0-9']+|[^a-zA-Z0-9']+$/g, "") : "";
    const finalNext = aw.length > 0 ? aw[0].replace(/^[^a-zA-Z0-9']+|[^a-zA-Z0-9']+$/g, "") : "";

    const prevRe = finalPrev ? new RegExp(`^${escapeRegExp(finalPrev)}\\s+`, "i") : null;
    const nextRe = finalNext ? new RegExp(`\\s+${escapeRegExp(finalNext)}$`, "i") : null;

    opts = opts.map((opt) => {
      if (opt.toLowerCase() === answer.toLowerCase()) return answer;
      let cleaned = opt;
      if (prevRe && prevRe.test(cleaned)) {
        const candidate = cleaned.replace(prevRe, "").trim();
        if (candidate && candidate.toLowerCase() !== answer.toLowerCase()) {
          cleaned = candidate;
        }
      }
      if (nextRe && nextRe.test(cleaned)) {
        const candidate = cleaned.replace(nextRe, "").trim();
        if (candidate && candidate.toLowerCase() !== answer.toLowerCase()) {
          cleaned = candidate;
        }
      }
      return cleaned;
    });
  }

  // 6. Deduplicate options and ensure `answer` is present
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const o of opts) {
    const key = o.trim().toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      deduped.push(o.trim());
    }
  }
  if (answer && !seen.has(answer.toLowerCase())) {
    if (deduped.length >= 4) {
      deduped[0] = answer;
    } else {
      deduped.unshift(answer);
    }
    seen.add(answer.toLowerCase());
  }

  data.correction = corr;
  data.text = txt;
  data.correctAnswer = answer;
  data.options = answer ? sanitizeMultipleChoiceDistractors(answer, deduped, data.acceptedAnswers || []) : deduped;
  data.acceptedAnswers = answer ? [answer] : [];
}

/**
 * Guarantees that an Open Cloze challenge has a single-word gap and that
 * replacing "_____" with `correctAnswer` in `text` produces `correction` word-for-word,
 * without ever dropping prepositions or particles (e.g., "look forward to visiting").
 */
export function enforceOpenClozeIntegrity(data: any) {
  let corr = String(data.correction || "").replace(/\s+/g, " ").trim();
  let txt = String(data.text || "").replace(/\s+/g, " ").trim();
  const rawAnswer = String(data.correctAnswer || "").trim();
  const answerWords = rawAnswer.split(/\s+/).filter(Boolean);
  let primary = answerWords[0] || "";

  // 1. If the model put multiple words in correctAnswer (e.g. "forward to"), restore trailing words into `text`
  if (answerWords.length > 1 && /_{2,}/.test(txt)) {
    const trailing = answerWords.slice(1).join(" ");
    const afterBlankRegex = new RegExp(`_{2,}\\s+${escapeRegExp(trailing)}\\b`, "i");
    if (!afterBlankRegex.test(txt)) {
      txt = txt.replace(/_{2,}/, `_____ ${trailing}`);
    }
  }

  // 2. Repair common 3-part phrasal-prepositional verb omissions in `correction` (e.g., "look forward visiting" -> "look forward to visiting")
  const phrasalRepairs: Array<[RegExp, string]> = [
    [/\b(look(?:s|ed|ing)?\s+forward)\s+(?!to\b)([a-z]+ing)\b/gi, "$1 to $2"],
    [/\b(put(?:s|ting)?\s+up)\s+(?!with\b)([a-z]+ing)\b/gi, "$1 with $2"],
    [/\b(came|come(?:s|ing)?)\s+up\s+(?!with\b)(a|an|the|some|this|that|an?\s+idea|a\s+plan)\b/gi, "$1 up with $2"],
    [/\b(ran|run(?:s|ning)?)\s+out\s+(?!of\b)([a-z]+)\b/gi, "$1 out of $2"],
  ];
  for (const [pattern, replacement] of phrasalRepairs) {
    corr = corr.replace(pattern, replacement);
  }

  // 3. Ensure `text` with `primary` substituted in place of `_____` matches `correction` word-for-word
  if (primary && corr) {
    const filled = txt.replace(/_{2,}/, primary).replace(/\s+/g, " ").trim();
    if (filled.toLowerCase() !== corr.toLowerCase()) {
      const wordRegex = new RegExp(`\\b${escapeRegExp(primary)}\\b`, "i");
      const phrase = String(data.grammarPhrase || "").trim();
      let rebuilt = "";

      // Prefer blanking the target word inside `grammarPhrase` if `grammarPhrase` appears in `correction`
      if (phrase && corr.toLowerCase().includes(phrase.toLowerCase()) && wordRegex.test(phrase)) {
        const phraseMatch = corr.match(new RegExp(escapeRegExp(phrase), "i"));
        if (phraseMatch && phraseMatch.index !== undefined) {
          const before = corr.slice(0, phraseMatch.index);
          const matchedPhrase = phraseMatch[0];
          const after = corr.slice(phraseMatch.index + matchedPhrase.length);
          const blankedPhrase = matchedPhrase.replace(wordRegex, (m) => {
            primary = m;
            return "_____";
          });
          rebuilt = `${before}${blankedPhrase}${after}`;
        }
      }

      if (!rebuilt && wordRegex.test(corr)) {
        rebuilt = corr.replace(wordRegex, (m) => {
          primary = m;
          return "_____";
        });
      }

      if (rebuilt && /_{2,}/.test(rebuilt)) {
        txt = rebuilt;
      } else if (/_{2,}/.test(txt)) {
        // Fallback: if `primary` wasn't found in `corr`, make `corr` match `filled` (with phrasal repairs applied)
        let repairedFilled = filled;
        for (const [pattern, replacement] of phrasalRepairs) {
          repairedFilled = repairedFilled.replace(pattern, replacement);
        }
        corr = repairedFilled;
        if (repairedFilled.toLowerCase() !== filled.toLowerCase() && wordRegex.test(corr)) {
          txt = corr.replace(wordRegex, "_____");
        }
      }
    }
  }

  data.correction = corr;
  data.text = txt;
  data.correctAnswer = primary;

  const rawAccepted = Array.isArray(data.acceptedAnswers) ? data.acceptedAnswers : [];
  const normalizedSet = new Set<string>();
  if (primary) normalizedSet.add(primary.toLowerCase());
  rawAccepted.forEach((ans: any) => {
    const clean = String(ans || "").trim().toLowerCase();
    if (clean && !clean.includes(" ")) {
      normalizedSet.add(clean);
    }
  });
  data.acceptedAnswers = Array.from(normalizedSet);
}

/**
 * Guarantees that a Word Formation challenge has a clean uppercase `baseWord`,
 * a single-word `correctAnswer` that is NOT identical to `baseWord`, no duplicate
 * `(BASEWORD)` baked into `text`, and US/UK spelling variants in `acceptedAnswers`.
 */
export function enforceWordFormationIntegrity(data: any) {
  let rawBase = String(data.baseWord || "")
    .replace(/[()[\]{}'"]/g, "")
    .trim()
    .split(/\s+/)[0] || "FORM";
  rawBase = rawBase.toUpperCase();

  // Strip any inline `(BASEWORD)` that the model might have accidentally placed inside `text`
  if (typeof data.text === "string" && rawBase) {
    const inlineParenRe = new RegExp(`(_{2,})\\s*\\(\\s*${escapeRegExp(rawBase)}\\s*\\)`, "i");
    data.text = data.text.replace(inlineParenRe, "$1");
  }

  enforceOpenClozeIntegrity(data);

  const primaryLower = String(data.correctAnswer || "").trim().toLowerCase();
  if (primaryLower && rawBase.toLowerCase() === primaryLower) {
    // Derive a clean stem if the model accidentally set baseWord === correctAnswer
    const stripSuffixes = ["fully", "lessly", "ingly", "edly", "ment", "tion", "sion", "ness", "able", "ible", "less", "ful", "ive", "ous", "al", "ly", "er", "or", "ed", "ing"];
    for (const suf of stripSuffixes) {
      if (primaryLower.length > suf.length + 2 && primaryLower.endsWith(suf)) {
        rawBase = primaryLower.slice(0, -suf.length).toUpperCase();
        break;
      }
    }
  }
  data.baseWord = rawBase;

  // Expand US/UK spelling variants in acceptedAnswers and ensure baseWord itself is excluded
  const expanded = new Set<string>();
  const currentList: string[] = Array.isArray(data.acceptedAnswers) ? data.acceptedAnswers : [];
  if (primaryLower) currentList.unshift(primaryLower);

  const addWithVariants = (word: string) => {
    const w = word.trim().toLowerCase();
    if (!w || w.includes(" ") || w === rawBase.toLowerCase()) return;
    expanded.add(w);
    if (w.includes("ize")) expanded.add(w.replace(/ize/g, "ise"));
    if (w.includes("ise")) expanded.add(w.replace(/ise/g, "ize"));
    if (w.includes("ization")) expanded.add(w.replace(/ization/g, "isation"));
    if (w.includes("isation")) expanded.add(w.replace(/isation/g, "ization"));
    if (w.includes("yze")) expanded.add(w.replace(/yze/g, "yse"));
    if (w.includes("yse")) expanded.add(w.replace(/yse/g, "yze"));
    if (w.includes("our")) expanded.add(w.replace(/our/g, "or"));
    if (w.endsWith("ourite")) expanded.add(w.replace(/ourite$/, "orite"));
    if (w.endsWith("orite")) expanded.add(w.replace(/orite$/, "ourite"));
    if (w.endsWith("elled")) expanded.add(w.replace(/elled$/, "eled"));
    if (w.endsWith("eled")) expanded.add(w.replace(/eled$/, "elled"));
    if (w.endsWith("elling")) expanded.add(w.replace(/elling$/, "eling"));
    if (w.endsWith("eling")) expanded.add(w.replace(/eling$/, "elling"));
    if (w.endsWith("eller")) expanded.add(w.replace(/eller$/, "eler"));
    if (w.endsWith("eler")) expanded.add(w.replace(/eler$/, "eller"));
  };

  currentList.forEach(addWithVariants);
  data.acceptedAnswers = Array.from(expanded);
}

/**
 * Guarantees that a Key Word Transformation (Cambridge Part 4) challenge has:
 * - A clean `leadInSentence`
 * - An uppercase single-word `baseWord` (the unchangeable KEY WORD)
 * - A 2-to-6 word `correctAnswer` that contains `baseWord` as a whole word
 * - A gapped `text` where replacing `_____` with `correctAnswer` produces `correction`
 * - Populated `mark1Parts`, `mark2Parts`, and `acceptedAnswers`
 */
export function enforceKeyWordTransformationIntegrity(data: any) {
  const leadIn = String(data.leadInSentence || "").replace(/\s+/g, " ").trim();
  let rawBase = String(data.baseWord || "")
    .replace(/[()[\]{}'"]/g, "")
    .trim()
    .split(/\s+/)[0] || "KEY";
  rawBase = rawBase.toUpperCase();

  let corr = String(data.correction || "").replace(/\s+/g, " ").trim();
  let txt = String(data.text || "").replace(/\s+/g, " ").trim();
  let answer = String(data.correctAnswer || "").replace(/\s+/g, " ").trim();

  if (/_{2,}/.test(txt)) {
    txt = txt.replace(/_{2,}/, "_____");
  }

  // Strip any accidental `(BASEWORD)` from `txt`
  if (txt && rawBase) {
    const inlineParenRe = new RegExp(`(_{2,})\\s*\\(\\s*${escapeRegExp(rawBase)}\\s*\\)`, "i");
    txt = txt.replace(inlineParenRe, "$1");
  }

  // Ensure `txt` with `answer` replacing `_____` matches `corr`
  if (answer && corr) {
    const filled = txt.replace(/_{2,}/, answer).replace(/\s+/g, " ").trim();
    if (filled.toLowerCase() !== corr.toLowerCase()) {
      const phraseRe = new RegExp(escapeRegExp(answer), "i");
      if (phraseRe.test(corr)) {
        txt = corr.replace(phraseRe, (m) => {
          answer = m;
          return "_____";
        });
      } else if (/_{2,}/.test(txt)) {
        corr = filled;
      }
    }
  }

  // Ensure `baseWord` actually appears in `answer`; if not, pick a key word from `answer`
  const keyRe = new RegExp(`(^|[^a-zA-Z])${escapeRegExp(rawBase)}([^a-zA-Z]|$)`, "i");
  const answerWords = answer.split(/\s+/).filter(Boolean);
  if (!keyRe.test(answer) && answerWords.length >= 2) {
    const candidateKey = answerWords.find((w) => w.replace(/[^a-zA-Z]/g, "").length >= 3) || answerWords[0];
    rawBase = candidateKey.replace(/[^a-zA-Z]/g, "").toUpperCase() || rawBase;
  }

  // Populate mark1Parts & mark2Parts if missing or if any part is just the bare baseWord alone (when 3+ words)
  let mark1Parts: string[] = Array.isArray(data.mark1Parts)
    ? data.mark1Parts.map((s: any) => String(s || "").trim()).filter(Boolean)
    : [];
  let mark2Parts: string[] = Array.isArray(data.mark2Parts)
    ? data.mark2Parts.map((s: any) => String(s || "").trim()).filter(Boolean)
    : [];

  const hasBareBasePart =
    answerWords.length >= 3 &&
    (mark1Parts.some((p) => p.toLowerCase() === rawBase.toLowerCase()) ||
      mark2Parts.some((p) => p.toLowerCase() === rawBase.toLowerCase()));

  if ((mark1Parts.length === 0 || mark2Parts.length === 0 || hasBareBasePart) && answerWords.length >= 2) {
    const mid = Math.ceil(answerWords.length / 2);
    mark1Parts = [answerWords.slice(0, mid).join(" ")];
    mark2Parts = [answerWords.slice(mid).join(" ")];
  }

  const rawAccepted: string[] = Array.isArray(data.acceptedAnswers)
    ? data.acceptedAnswers.map((s: any) => String(s || "").replace(/\s+/g, " ").trim()).filter(Boolean)
    : [];
  const acceptedSet = new Set<string>();
  if (answer) acceptedSet.add(answer);
  rawAccepted.forEach((a) => acceptedSet.add(a));

  data.leadInSentence = leadIn;
  data.baseWord = rawBase;
  data.correction = corr;
  data.text = txt;
  data.correctAnswer = answer;
  data.mark1Parts = mark1Parts;
  data.mark2Parts = mark2Parts;
  data.acceptedAnswers = Array.from(acceptedSet);
}
