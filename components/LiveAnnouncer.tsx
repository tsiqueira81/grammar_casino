import React from 'react';

// Package S8: screen readers hear each change of phase ("Hand 3 of 10 is dealt", "The answer is
// in") without the page moving focus. Polite, so it never cuts off what is being read.
const LiveAnnouncer: React.FC<{ message: string }> = ({ message }) => (
  <div className="sr-only" role="status" aria-live="polite" aria-atomic="true" data-testid="live-announcer">
    {message}
  </div>
);

export default LiveAnnouncer;
