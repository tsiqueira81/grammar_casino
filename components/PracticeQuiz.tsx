// Package L6: "Practice these" at game over on the phone. A short solo quiz on the hands the student
// missed: no money, no timer, no room. Answer, see if it was right, read the rule, next.
import React, { useState } from 'react';
import type { GeneratedSentence } from '../types';
import { isPracticeAnswerRight, practiceMode } from '../game/practice';

export interface PracticeItem {
  sentence: GeneratedSentence;
  answer: string;
  explanation: string;
}

const choiceBtn =
  'w-full min-h-[52px] px-4 rounded-gc border border-gc-line/[0.2] bg-gc-line/[0.05] text-left text-gc-body font-semibold text-gc-ink cursor-pointer disabled:cursor-default';

export const PracticeQuiz: React.FC<{ items: PracticeItem[]; onClose: () => void }> = ({ items, onClose }) => {
  const [at, setAt] = useState(0);
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<boolean | null>(null);
  const [right, setRight] = useState(0);

  const done = at >= items.length;
  const item = items[Math.min(at, items.length - 1)];
  const mode = practiceMode(item.sentence);

  const answer = (a: string) => {
    if (result !== null) return;
    const ok = isPracticeAnswerRight(item.sentence, a);
    setResult(ok);
    if (ok) setRight((n) => n + 1);
  };
  const next = () => {
    setAt((n) => n + 1);
    setTyped('');
    setResult(null);
  };

  return (
    <div className="gc-surface rounded-[20px] px-[18px] py-4 space-y-3" data-testid="practice-quiz" role="region" aria-label="Practice">
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-gc-small font-bold text-gc-quiet">
          {done ? 'Practice done' : `Practice ${at + 1} of ${items.length}`}
        </h2>
        <button type="button" onClick={onClose} className="min-h-[44px] px-3 text-gc-small font-semibold text-gc-quiet underline underline-offset-4 cursor-pointer">
          Close
        </button>
      </div>

      {done ? (
        <p className="m-0 text-gc-lead font-extrabold text-gc-ink" data-testid="practice-score">
          {right} of {items.length} right.{right === items.length ? ' Well done!' : ' Try them again any time.'}
        </p>
      ) : (
        <>
          <p className="m-0 font-sentence italic text-gc-lead text-gc-ink leading-snug">{item.sentence.text}</p>
          {mode === 'validOrFlawed' && (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={choiceBtn} disabled={result !== null} onClick={() => answer('correct')}>
                Valid
              </button>
              <button type="button" className={choiceBtn} disabled={result !== null} onClick={() => answer('incorrect')}>
                Flawed
              </button>
            </div>
          )}
          {mode === 'choice' && (
            <div className="space-y-2">
              {(item.sentence.options || []).map((o, i) => (
                <button key={`${i}-${o}`} type="button" className={choiceBtn} disabled={result !== null} onClick={() => answer(o)}>
                  <span className="font-extrabold mr-2">{'ABCD'[i]}</span>
                  {o}
                </button>
              ))}
            </div>
          )}
          {mode === 'typed' && (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                answer(typed);
              }}
            >
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                disabled={result !== null}
                aria-label="Your answer"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className="flex-1 min-w-0 h-12 px-3 rounded-gc-sm border-2 border-gc-line/[0.16] bg-gc-line/[0.05] text-gc-body text-gc-ink focus:outline-none focus:border-gc-gold"
              />
              <button type="submit" disabled={result !== null || !typed.trim()} className="h-12 px-4 rounded-full bg-gc-gold text-gc-on-gold font-bold cursor-pointer disabled:opacity-50">
                Check
              </button>
            </form>
          )}

          {result !== null && (
            <div role="status" className="space-y-1" data-testid="practice-result">
              <p className={`m-0 text-gc-body font-extrabold ${result ? 'text-gc-win' : 'text-gc-loss'}`}>{result ? 'Right!' : 'Not this time.'}</p>
              {item.answer && <p className="m-0 text-gc-small font-bold text-gc-ink">{item.answer}</p>}
              {item.explanation && <p className="m-0 text-gc-small text-gc-quiet">{item.explanation}</p>}
              <button type="button" onClick={next} className="mt-2 w-full h-12 rounded-full bg-gc-gold text-gc-on-gold font-extrabold cursor-pointer">
                {at + 1 < items.length ? 'Next' : 'See my score'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
