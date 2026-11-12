// Package L8: how the two newer question types look on the projector and on phones.
import React from 'react';
import { tilesLeft } from '../game/newFormats';

const LETTERS = ['A', 'B', 'C', 'D'];

/** Spot the error: the sentence in its four parts, each with its letter above it. */
export const SpotErrorSentence: React.FC<{ parts: string[]; compact?: boolean }> = ({ parts, compact }) => (
  <span data-testid="spot-error-sentence" className="inline">
    {parts.map((part, i) => (
      <React.Fragment key={i}>
        {i > 0 && ' '}
        <span className="inline-flex flex-col items-center align-bottom mx-0.5">
          {!compact && (
            <span aria-hidden="true" className="not-italic font-sans text-gc-cap font-black text-gc-money leading-none mb-1">
              {LETTERS[i]}
            </span>
          )}
          <span className="border-b-2 border-gc-gold/60 pb-0.5">
            <span className="sr-only">{LETTERS[i]}: </span>
            {part}
          </span>
        </span>
      </React.Fragment>
    ))}
    .
  </span>
);

/** Word order: the mixed-up words as tiles (read-only). */
export const WordTiles: React.FC<{ tiles: string[]; size?: 'lg' | 'md' }> = ({ tiles, size = 'lg' }) => (
  <span data-testid="word-tiles" className="inline-flex flex-wrap justify-center gap-2 sm:gap-3 not-italic font-sans">
    {tiles.map((t, i) => (
      <span
        key={i}
        className={`inline-flex items-center rounded-gc-sm bg-gc-line/[0.08] border border-gc-line/[0.2] text-gc-ink font-semibold shadow-gc-1 ${
          size === 'lg' ? 'px-3.5 py-1.5' : 'px-2.5 py-1 text-gc-body'
        }`}
      >
        {t}
      </span>
    ))}
  </span>
);

/** The task, said once above the sentence. */
export function newFormatTask(questionType: string | undefined): string | null {
  if (questionType === 'spotError') return 'Which part has the mistake? A, B, C or D.';
  if (questionType === 'wordOrder') return 'Put the words in order to make a sentence.';
  return null;
}

/**
 * Word order on a phone or a player card: tap the tiles in order to build the answer. The answer
 * stays a plain text field too, so a student can also type it or fix one word.
 */
export const WordTilePicker: React.FC<{
  tiles: string[];
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}> = ({ tiles, value, onChange, disabled }) => {
  const left = tilesLeft(tiles, value);
  const placed = value.trim() ? value.trim().split(/\s+/) : [];
  const btn =
    'min-h-[44px] px-3.5 rounded-gc-sm text-gc-body font-semibold border transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-turn disabled:opacity-50 disabled:cursor-not-allowed';
  return (
    <div data-testid="word-tile-picker" className="space-y-2">
      <div role="group" aria-label="Words left to place" className="flex flex-wrap gap-2">
        {left.map((t, i) => (
          <button
            key={`${t}-${i}`}
            type="button"
            disabled={disabled}
            onClick={() => onChange(placed.length ? `${placed.join(' ')} ${t}` : t)}
            className={`${btn} bg-gc-card border-gc-line/[0.25] text-gc-ink hover:border-gc-gold`}
          >
            {t}
          </button>
        ))}
        {left.length === 0 && placed.length > 0 && (
          <span className="text-gc-small font-semibold text-gc-win self-center">All the words are placed.</span>
        )}
      </div>
      {placed.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(placed.slice(0, -1).join(' '))}
            className={`${btn} bg-gc-line/[0.06] border-gc-line/[0.16] text-gc-ink`}
          >
            Take back the last word
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange('')}
            className={`${btn} bg-gc-line/[0.06] border-gc-line/[0.16] text-gc-quiet`}
          >
            Start again
          </button>
        </div>
      )}
    </div>
  );
};
