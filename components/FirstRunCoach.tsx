import React, { useRef, useState } from 'react';
import { Bot, ChartColumn, QrCode, Sparkles, Smartphone, X } from 'lucide-react';
import { useFocusTrap } from '../utils/useFocusTrap';
import { COACH_STEPS } from '../game/coach';

// Package T7: a four-step coach on the first visit. It can be skipped, opened again from the
// lobby ("How it works"), and its last step offers a demo with bots.
interface FirstRunCoachProps {
  onClose: () => void;
  onDemo: (() => void) | null;
}

const ICONS = [QrCode, Smartphone, Sparkles, ChartColumn];

const FirstRunCoach: React.FC<FirstRunCoachProps> = ({ onClose, onDemo }) => {
  const [index, setIndex] = useState(0);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef);
  const step = COACH_STEPS[index];
  const Icon = ICONS[index] ?? Sparkles;
  const last = index === COACH_STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 dark:bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="coach-title"
        data-testid="first-run-coach"
        className="gc-panel rounded-gc-lg w-full max-w-md overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Skip the tour"
          className="absolute top-3 right-3 w-10 h-10 rounded-full bg-gc-line/[0.06] hover:bg-gc-line/[0.12] text-gc-quiet hover:text-gc-ink grid place-items-center cursor-pointer"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>
        <div className="px-6 pt-7 pb-6">
          <p className="text-gc-cap font-bold uppercase tracking-wider text-gc-gold">
            How it works · {index + 1} of {COACH_STEPS.length}
          </p>
          <div className="mt-4 flex items-start gap-4">
            <span className="w-12 h-12 shrink-0 rounded-full bg-gc-gold/15 text-gc-gold grid place-items-center">
              <Icon className="w-6 h-6" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="coach-title" className="text-gc-title font-bold text-gc-ink">{step.title}</h2>
              <p className="mt-2 text-gc-body text-gc-quiet">{step.body}</p>
            </div>
          </div>
          <div className="mt-5 flex justify-center gap-1.5" aria-hidden="true">
            {COACH_STEPS.map((s, i) => (
              <span key={s.title} className={`h-1.5 rounded-full transition-all ${i === index ? 'w-6 bg-gc-gold' : 'w-1.5 bg-gc-line/30'}`} />
            ))}
          </div>
          {last && onDemo && (
            <div className="mt-5 rounded-gc border border-gc-gold/30 bg-gc-gold/[0.07] p-4">
              <p className="text-gc-small text-gc-ink">
                Want to try it alone first? A demo room fills with 12 bots who bet on every hand. Nothing is saved.
              </p>
              <button
                type="button"
                onClick={onDemo}
                className="mt-3 h-11 px-4 inline-flex items-center gap-2 rounded-gc-sm bg-gc-gold text-gc-on-gold font-bold cursor-pointer"
              >
                <Bot className="w-4 h-4" aria-hidden="true" />
                Try a demo with bots
              </button>
            </div>
          )}
          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => (index === 0 ? onClose() : setIndex(index - 1))}
              className="h-11 px-4 rounded-gc-sm text-gc-body font-semibold text-gc-quiet hover:text-gc-ink cursor-pointer"
            >
              {index === 0 ? 'Skip' : 'Back'}
            </button>
            <button
              type="button"
              onClick={() => (last ? onClose() : setIndex(index + 1))}
              className="h-11 px-5 rounded-gc-sm bg-gc-ink text-gc-bg font-bold cursor-pointer"
            >
              {last ? 'Start playing' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FirstRunCoach;
