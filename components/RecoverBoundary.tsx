import React from 'react';
import { crashDetails, logEvent } from '../utils/debugLog';

/**
 * The lesson must never stall (package R8). If a screen crashes, show a way out instead of a blank
 * page. Reloading is safe: the teacher's game is saved after every change and an open live room
 * reopens by itself (R1); a phone rejoins its seat from its saved session.
 */
interface Props {
  /** 'teacher' for the projector screen, 'phone' for a student's phone. */
  who: 'teacher' | 'phone';
  children: React.ReactNode;
}

interface State {
  failed: boolean;
  copied: boolean;
}

export class RecoverBoundary extends React.Component<Props, State> {
  state: State = { failed: false, copied: false };
  private details = '';

  static getDerivedStateFromError(): State {
    return { failed: true, copied: false };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('A screen crashed; offering to recover.', error, info?.componentStack);
    logEvent('error', `Crash: ${error instanceof Error ? error.message : String(error)}`);
    // Package A4: kept for "Copy details". Nothing is sent anywhere automatically.
    this.details = crashDetails(error, info?.componentStack);
  }

  private copyDetails = () => {
    const done = () => this.setState({ copied: true });
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(this.details).then(done, () => this.downloadDetails());
        return;
      }
    } catch {
      // fall through to a download
    }
    this.downloadDetails();
  };

  private downloadDetails = () => {
    try {
      const url = URL.createObjectURL(new Blob([this.details], { type: 'text/plain;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'grammar-casino-crash.txt';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.setState({ copied: true });
    } catch {
      // nothing else to try
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const isPhone = this.props.who === 'phone';
    return (
      <div role="alert" className="min-h-[100dvh] flex items-center justify-center p-4 bg-gc-bg text-gc-ink font-sans">
        <div className="w-full max-w-md rounded-gc bg-gc-card border border-gc-line/[0.14] shadow-gc-1 p-6 text-center space-y-4">
          <h1 className="text-gc-h2 font-bold">Something went wrong</h1>
          <p className="text-gc-body">
            {isPhone
              ? 'Tap below to go back to your seat. Your money and your bet are safe.'
              : 'Press below to reload. The game and any live room come back as they were.'}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-[44px] w-full rounded-gc-sm bg-gc-gold text-black font-bold px-5 py-3 cursor-pointer"
          >
            {isPhone ? 'Back to my seat' : 'Recover the game'}
          </button>
          {!isPhone && (
            <button
              type="button"
              onClick={this.copyDetails}
              data-testid="crash-copy-details"
              className="min-h-[44px] w-full rounded-gc-sm bg-gc-line/[0.07] border border-gc-line/[0.14] text-gc-ink font-semibold px-5 py-2 cursor-pointer"
            >
              {this.state.copied ? 'Details copied' : 'Copy details (to report the problem)'}
            </button>
          )}
        </div>
      </div>
    );
  }
}
