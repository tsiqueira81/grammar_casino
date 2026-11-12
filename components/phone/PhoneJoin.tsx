// The phone before it has a seat: the join screen (moved out of StudentControllerView, F7).

import React from 'react';
import { generateFriendlyName } from '../../utils/nameFilter';
import { ArrowRight, Moon, Sun } from 'lucide-react';

export interface PhoneJoinProps {
  onToggleTheme: () => void;
  isDarkMode: boolean;
  welcomeName: string;
  codeFromLink: boolean;
  joinError: string;
  isJoining: boolean;
  joinWaitingMessage: string;
  roomCodeInput: string;
  setCodeFromLink: React.Dispatch<React.SetStateAction<boolean>>;
  setRoomCodeInput: React.Dispatch<React.SetStateAction<string>>;
  fieldClass: "w-full rounded-gc border-2 border-gc-line/[0.14] bg-gc-line/[0.06] text-gc-ink placeholder:text-gc-quiet/70 focus:outline-none focus:border-gc-gold transition-colors";
  playerNameInput: string;
  setPlayerNameInput: React.Dispatch<React.SetStateAction<string>>;
  handleJoinRoom: (codeOverride?: string, nameOverride?: string, avatarOverride?: string, tokenOverride?: string) => Promise<void>;
  onExitStudentMode: () => void;
}

export function PhoneJoin({
  onToggleTheme,
  isDarkMode,
  welcomeName,
  codeFromLink,
  joinError,
  isJoining,
  joinWaitingMessage,
  roomCodeInput,
  setCodeFromLink,
  setRoomCodeInput,
  fieldClass,
  playerNameInput,
  setPlayerNameInput,
  handleJoinRoom,
  onExitStudentMode,
}: PhoneJoinProps) {

  return (
    <>
      <div className="game-container min-h-[100dvh] text-gc-ink flex justify-center">
        <div className="w-full max-w-md min-h-[100dvh] flex flex-col px-[22px] pt-5 pb-7 animate-gc-slide-up">
          <div className="flex items-center justify-between mb-6">
            <p className="font-logo font-bold text-[17px] tracking-[0.08em] text-gc-gold m-0">Grammar Casino</p>
            <button
              type="button"
              onClick={onToggleTheme}
              className="w-11 h-11 rounded-gc-sm grid place-items-center bg-gc-line/[0.07] border border-gc-line/[0.12] text-gc-quiet cursor-pointer"
              aria-label={isDarkMode ? 'Switch to the light theme' : 'Switch to the dark theme'}
            >
              {isDarkMode ? <Sun className="w-[18px] h-[18px]" aria-hidden="true" /> : <Moon className="w-[18px] h-[18px]" aria-hidden="true" />}
            </button>
          </div>

          <h1 className="text-[30px] leading-tight font-extrabold tracking-tight m-0">
            {welcomeName ? `Welcome back, ${welcomeName}` : 'Join the table'}
          </h1>
          <p className="mt-1.5 mb-5 text-gc-body text-gc-quiet">
            {codeFromLink ? 'Type your name and join.' : 'Type the code shown on the projector.'}
          </p>

          {joinError && (
            <div role="alert" className="mb-4 px-4 py-3 rounded-gc bg-gc-loss/10 border border-gc-loss/40 text-gc-small font-semibold text-gc-ink">
              {joinError}
            </div>
          )}
          {isJoining && joinWaitingMessage && (
            <div role="status" className="mb-4 px-4 py-3 rounded-gc bg-gc-info/10 border border-gc-info/35 text-gc-small font-semibold text-gc-ink">
              {joinWaitingMessage}
            </div>
          )}

          {codeFromLink ? (
            <div className="mb-5 h-14 px-4 rounded-gc flex items-center justify-between gap-3 bg-gc-line/[0.06] border border-gc-line/[0.14]" data-testid="joining-room">
              <span className="text-gc-body font-semibold text-gc-ink">
                Joining room <span className="font-extrabold tracking-[0.18em] text-gc-gold tabular-nums">{roomCodeInput}</span>
              </span>
              <button
                type="button"
                onClick={() => setCodeFromLink(false)}
                className="min-h-[44px] px-2 text-gc-small font-semibold text-gc-quiet underline underline-offset-4 cursor-pointer hover:text-gc-ink"
              >
                Change
              </button>
            </div>
          ) : (<>
          <label htmlFor="gc-join-code" className="block mb-2 text-gc-small font-bold text-gc-quiet">Room code</label>
          <input
            id="gc-join-code"
            type="text"
            maxLength={4}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={roomCodeInput}
            onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
            placeholder="K7XM"
            aria-label="Room code"
            className={`${fieldClass} h-[68px] mb-5 text-center text-[30px] font-extrabold tracking-[0.5em] pl-[0.5em] uppercase tabular-nums`}
          />
          </>)}

          <label htmlFor="gc-join-name" className="block mb-2 text-gc-small font-bold text-gc-quiet">Your name</label>
          <input
            id="gc-join-name"
            type="text"
            maxLength={20}
            autoComplete="off"
            value={playerNameInput}
            onChange={(e) => setPlayerNameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleJoinRoom();
            }}
            placeholder="First name"
            className={`${fieldClass} h-14 mb-2 px-4 text-lg font-semibold`}
          />
          <button
            type="button"
            onClick={() => setPlayerNameInput(generateFriendlyName())}
            className="mb-5 min-h-[44px] px-3 -ml-3 text-gc-small font-semibold text-gc-quiet underline underline-offset-4 cursor-pointer hover:text-gc-ink"
          >
            Give me a name
          </button>

          <p className="m-0 text-gc-small text-gc-quiet">You choose your character after you join.</p>

          <div className="mt-auto pt-6 space-y-2">
            <button
              type="button"
              disabled={isJoining}
              onClick={() => handleJoinRoom()}
              className="gc-btn-primary w-full h-[58px] rounded-full text-lg font-extrabold flex items-center justify-center gap-2.5 cursor-pointer active:scale-[0.99] transition-transform"
            >
              {isJoining ? (joinWaitingMessage ? 'Waiting for the teacher…' : 'Connecting…') : (
                <>
                  Join the table
                  <ArrowRight className="w-[18px] h-[18px]" aria-hidden="true" />
                </>
              )}
            </button>
            <p className="m-0 text-center text-gc-cap text-gc-quiet" data-testid="join-privacy">
              No account, no email: just a nickname, kept on this phone.{' '}
              <a href="/privacy.html" target="_blank" rel="noopener" className="inline-flex items-center min-h-[44px] min-w-[44px] px-2 underline underline-offset-4 text-gc-quiet hover:text-gc-ink">
                Privacy
              </a>
            </p>
            <button
              type="button"
              onClick={onExitStudentMode}
              className="w-full min-h-[44px] text-gc-small font-semibold text-gc-quiet underline underline-offset-4 cursor-pointer"
            >
              Back to the main screen
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
