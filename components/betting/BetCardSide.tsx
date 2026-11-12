// A betting card's right column: help and power-ups, and the status line (moved out of PlayerBettingCard, F7).

import type { TurnTimerStatus } from '../../types';
import { Player, Bet, Hint, QuestionType } from '../../types';
import PowerUpTooltip from '../PowerUpTooltip';
import { HINT_COST, POWERUP_COST } from '../../constants';
import { isValidKeyWordTransformationPhrase } from '../../utils/multiplayerProtocol';
import { isOptionType, isWordAnswerType } from '../../game/questionTypes';

export interface BetCardSideProps {
  onGetHint: (playerId: number) => void;
  player: Player;
  hint: Hint;
  isBlocked: boolean;
  isSilenced: boolean;
  onGetPowerUp: (playerId: number) => void;
  hasFreeDraw: boolean;
  powerUpUsedThisRound: boolean;
  isEliminated: boolean;
  isFrozen: boolean;
  isSatOut: boolean;
  isTurnLocked: boolean;
  timerEnabled: boolean;
  timerStatus: TurnTimerStatus;
  isUnchangedBaseWord: boolean;
  baseWord: string;
  isInvalidKwtPhrase: boolean;
  questionType: QuestionType;
  bet: Bet;
  hasSplitBet: boolean;
}

export function BetCardSide({
  onGetHint,
  player,
  hint,
  isBlocked,
  isSilenced,
  onGetPowerUp,
  hasFreeDraw,
  powerUpUsedThisRound,
  isEliminated,
  isFrozen,
  isSatOut,
  isTurnLocked,
  timerEnabled,
  timerStatus,
  isUnchangedBaseWord,
  baseWord,
  isInvalidKwtPhrase,
  questionType,
  bet,
  hasSplitBet,
}: BetCardSideProps) {

  return (
    <>
      {/* Right column: help and power-ups */}
      <div className="lg:col-span-5 flex flex-col justify-between gap-3.5 border-t lg:border-t-0 lg:border-l border-gc-line/[0.12] pt-4 lg:pt-0 lg:pl-6">
        <div className="space-y-3">
          <h4 className="text-gc-small font-bold text-gc-quiet">
            Help and power-ups
          </h4>

          <button
            type="button"
            onClick={() => onGetHint(player.id)}
            disabled={player.money < HINT_COST || !!hint || isBlocked}
            className="w-full flex items-center gap-3 p-3.5 rounded-gc bg-gc-line/[0.06] border border-gc-line/[0.12] text-gc-ink text-left transition-colors hover:border-gc-line/30 cursor-pointer disabled:cursor-not-allowed disabled:opacity-55 focus:outline-none focus-visible:ring-4 focus-visible:ring-gc-turn/40"
          >
            <span className="w-10 h-10 rounded-gc-sm bg-gc-info/15 grid place-items-center text-xl shrink-0" aria-hidden="true">💡</span>
            <span className="min-w-0">
              <span className="block text-gc-body font-bold">Croupier's whisper</span>
              <span className="block text-gc-small text-gc-quiet">A small grammar clue</span>
            </span>
            <span className="ml-auto pl-2 text-gc-body font-extrabold tabular-nums text-gc-money shrink-0">-${HINT_COST}</span>
          </button>

          {hint && (
            <div className="rounded-gc bg-gc-info/15 text-gc-info p-3.5 text-gc-body font-semibold animate-gc-slide-up">
              <div className="text-gc-cap font-bold mb-1 opacity-80">Hint</div>
              {hint.isLoading ? (
                <span className="animate-pulse">Finding a hint…</span>
              ) : (
                hint.text
              )}
            </div>
          )}

          <PowerUpTooltip
            icon={isSilenced ? "🤐" : "🃏"}
            name={isSilenced ? "Silenced" : "Draw a power-up"}
            description={isSilenced ? "You are silenced this round and cannot draw or use power-ups." : "Draw a random power-up card to gain an edge or disrupt rivals."}
            placement="top"
            className="w-full"
          >
            <button
              type="button"
              onClick={() => onGetPowerUp(player.id)}
              disabled={(player.money < POWERUP_COST && !hasFreeDraw) || isBlocked || powerUpUsedThisRound || isSilenced}
              className="w-full flex items-center gap-3 p-3.5 rounded-gc bg-gc-line/[0.06] border border-gc-line/[0.12] text-gc-ink text-left transition-colors hover:border-gc-line/30 cursor-pointer disabled:cursor-not-allowed disabled:opacity-55 focus:outline-none focus-visible:ring-4 focus-visible:ring-gc-turn/40"
              title={isSilenced ? "You are silenced this round" : undefined}
            >
              <span className="w-10 h-10 rounded-gc-sm bg-purple-500/15 grid place-items-center text-xl shrink-0" aria-hidden="true">{isSilenced ? '🤐' : '🃏'}</span>
              <span className="min-w-0">
                <span className="block text-gc-body font-bold">
                  {isSilenced ? 'Silenced' : powerUpUsedThisRound ? 'Power-up drawn' : 'Draw a power-up'}
                </span>
                <span className="block text-gc-small text-gc-quiet">
                  {isSilenced ? 'No power-ups this hand' : powerUpUsedThisRound ? 'One per hand' : 'A card from the house shoe'}
                </span>
              </span>
              {!isSilenced && (
                <span data-testid="draw-price" className="ml-auto pl-2 text-gc-body font-extrabold tabular-nums text-gc-money shrink-0">{hasFreeDraw ? 'Free' : `-$${POWERUP_COST}`}</span>
              )}
            </button>
          </PowerUpTooltip>
        </div>

        {/* Bottom Status Indicator */}
        <div className="pt-3 border-t border-gc-line/[0.12] flex items-center justify-between gap-3 text-gc-small text-gc-quiet">
          <span>Status</span>
          {isEliminated ? (
            <span className="text-gc-loss font-bold">Out of money</span>
          ) : isFrozen ? (
            <span className="text-gc-info font-bold">Frozen this hand</span>
          ) : isSatOut ? (
            <span className="text-gc-loss font-bold">Sat out (no bet)</span>
          ) : isTurnLocked ? (
            <span className="text-gc-win font-bold">Locked in</span>
          ) : timerEnabled && timerStatus === 'idle' ? (
            <span>Waiting for their turn</span>
          ) : isUnchangedBaseWord ? (
            <span className="text-gc-loss font-bold">
              Change the word ({(baseWord || '').toUpperCase()})
            </span>
          ) : isInvalidKwtPhrase ? (
            <span className="text-gc-loss font-bold">
              Use 2–6 words with {(baseWord || 'KEY').toUpperCase()}
            </span>
          ) : (
            isOptionType(questionType)
              ? (typeof bet?.bet === 'number' && (hasSplitBet ? (bet?.splitOptions?.length || 0) >= 1 : Boolean(bet?.selectedOption)))
              : questionType === 'keyWordTransformation'
                ? (typeof bet?.bet === 'number' && (hasSplitBet
                    ? (isValidKeyWordTransformationPhrase(bet?.splitClozeAnswers?.[0], baseWord) && (!bet?.splitClozeAnswers?.[1]?.trim() || isValidKeyWordTransformationPhrase(bet?.splitClozeAnswers?.[1], baseWord))) ||
                      (!bet?.splitClozeAnswers?.[0]?.trim() && isValidKeyWordTransformationPhrase(bet?.splitClozeAnswers?.[1], baseWord))
                    : isValidKeyWordTransformationPhrase(bet?.clozeAnswer, baseWord)))
                : (isWordAnswerType(questionType))
                  ? (typeof bet?.bet === 'number' && (hasSplitBet ? Boolean(bet?.splitClozeAnswers?.[0]?.trim() || bet?.splitClozeAnswers?.[1]?.trim()) : Boolean(bet?.clozeAnswer?.trim())))
                  : (hasSplitBet ? typeof bet?.bet === 'number' : (bet?.opinion && typeof bet?.bet === 'number'))
          ) ? (
            <span className="text-gc-win font-bold">
              Bet placed
            </span>
          ) : (
            <span>Waiting for a bet</span>
          )}
        </div>
      </div>
    </>
  );
}
