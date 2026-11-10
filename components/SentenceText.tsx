import React from 'react';
import { buildSentenceSegments } from '../utils/sentenceSegments';

interface SentenceTextProps {
  text: string;
  /** Grammar phrase to highlight (Grammar Goggles or the teacher's highlight). */
  highlight?: string | null;
  /** Draw `___` gaps as answer slots (cloze and word formation rounds). */
  showGaps?: boolean;
  /** Word formation base word, shown as a badge after each gap. */
  baseWord?: string | null;
  /** The projector and the phone use slightly different gap sizes. */
  size?: 'host' | 'phone';
}

/** Renders a sentence with highlights and gaps as React nodes; never as HTML. */
const SentenceText: React.FC<SentenceTextProps> = ({ text, highlight, showGaps = false, baseWord, size = 'host' }) => {
  const segments = buildSentenceSegments(text, { highlight, showGaps });
  const isPhone = size === 'phone';
  const gapClass = isPhone
    ? 'inline-block min-w-[4em] mx-1 px-2 leading-[1.25] rounded-md bg-gc-gold/15 border-b-[3px] border-gc-gold text-gc-money/60 font-sans not-italic font-bold tracking-widest text-center text-[0.65em] align-baseline select-none'
    : 'inline-block min-w-[4.5em] mx-1 px-2 leading-[1.25] rounded-md bg-gc-gold/15 border-b-[3px] border-gc-gold text-gc-money/60 font-sans not-italic font-bold tracking-widest text-center text-[0.6em] align-baseline select-none';
  const badgeClass = isPhone
    ? 'inline-block mx-0.5 px-2.5 py-0.5 leading-[1.2] rounded-full bg-gc-gold text-gc-on-gold font-sans not-italic font-extrabold tracking-wider text-[0.6em] align-middle select-none'
    : 'inline-block mx-1 px-3 py-0.5 leading-[1.2] rounded-full bg-gc-gold text-gc-on-gold font-sans not-italic font-extrabold tracking-wider text-[0.55em] align-middle select-none';

  return (
    <>
      &ldquo;
      {segments.map((seg, i) => {
        if (seg.kind === 'text') return <React.Fragment key={i}>{seg.text}</React.Fragment>;
        if (seg.kind === 'highlight') {
          return (
            <span key={i} className="bg-gc-gold/20 text-gc-ink border-b-2 border-gc-gold px-1 rounded-sm">
              {seg.text}
            </span>
          );
        }
        return (
          <span key={i} className="whitespace-nowrap">
            <span className={gapClass}>_____</span>
            {baseWord ? (
              <>
                {' '}
                <span className={badgeClass}>({baseWord.toUpperCase()})</span>
              </>
            ) : null}
            {seg.trailing}
          </span>
        );
      })}
      &rdquo;
    </>
  );
};

export default SentenceText;
