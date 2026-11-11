import React from 'react';

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
}

export class RecoverBoundary extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('A screen crashed; offering to recover.', error, info?.componentStack);
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
        </div>
      </div>
    );
  }
}
