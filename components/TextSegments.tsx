// Draws highlighted sentence parts (the mistake, the fix) as <mark> spans. Shared by the betting and
// results screens (package F7).
import React from 'react';
import type { TextSegment } from '../utils/errorHighlight';

export const renderTextSegments = (segments: TextSegment[], markClassName: string) =>
  segments.map((seg, i) =>
    seg.mark ? (
      <mark key={i} className={markClassName}>{seg.text}</mark>
    ) : (
      <React.Fragment key={i}>{seg.text}</React.Fragment>
    )
  );
