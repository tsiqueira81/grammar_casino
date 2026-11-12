// The phone during a hand: the sentence card (moved out of StudentControllerView, F7).

import type { PowerUpKey } from '../../types';
import React from 'react';
import { POWER_UPS } from '../../constants';
import { QuestionType } from '../../types';
import { PlayerViewPayload } from '../../utils/multiplayerProtocol';
import SentenceText from '../SentenceText';
import { type PowerUpSheetInfo } from '../PowerUpSheet';
import { SpotErrorSentence, WordTiles, newFormatTask } from '../NewFormatSentence';

/** Effects on a player, shown as the power-up that caused them. */
const EFFECT_CARD: Partial<Record<string, PowerUpKey>> = {
  BLESSING: 'BLESSING',
  CRUCIO: 'CRUCIO',
  SILENCED: 'SILENCER',
  SECOND_CHANCE: 'SECOND_CHANCE',
  TEACHERS_PET: 'TEACHERS_PET',
};

export interface PhoneSentenceProps {
  view: PlayerViewPayload;
  formatLabel: string;
  money: (n: number) => string;
  qType: QuestionType;
  isClozeRound: boolean;
  setSheet: React.Dispatch<React.SetStateAction<PowerUpSheetInfo>>;
}

export function PhoneSentence({
  view,
  formatLabel,
  money,
  qType,
  isClozeRound,
  setSheet,
}: PhoneSentenceProps) {

  return (
    <>
      <section className="gc-surface rounded-[20px] px-[18px] py-4 text-center animate-gc-deal" aria-label="The sentence">
        <span className="inline-flex items-center h-[26px] px-[11px] rounded-full bg-gc-gold text-gc-on-gold text-[12.5px] font-bold">
          Hand {view.round} · {formatLabel}
        </span>
        <div className="mt-1.5 text-gc-cap font-semibold text-gc-quiet">
          {view.settings.topic} · {view.settings.level}
        </div>

        {view.isLoadingSentence || !view.sentence ? (
          <div className="py-7 space-y-2">
            <div className="text-3xl animate-pulse" aria-hidden="true">♠</div>
            <div className="text-gc-body font-semibold text-gc-quiet">Next hand coming…</div>
            {/* Package S4: not a blank wait: the student's money (power-ups and effects show below). */}
            <div className="text-gc-lead font-extrabold text-gc-money tabular-nums" data-testid="between-hands-money">
              You have {money(view.me.money)}
            </div>
          </div>
        ) : (
          <div className="space-y-3 pt-2">
            {qType === 'keyWordTransformation' && view.sentence.leadInSentence && (
              <div className="px-3.5 py-3 rounded-gc bg-gc-line/[0.05] border border-gc-line/[0.12] space-y-1.5">
                <div className="text-gc-cap font-bold text-gc-quiet">First sentence (keep the meaning)</div>
                <p className="m-0 text-gc-lead font-sentence italic text-gc-ink leading-snug">
                  &ldquo;{view.sentence.leadInSentence}&rdquo;
                </p>
                {view.sentence.baseWord && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-gc-gold text-gc-on-gold font-extrabold text-gc-small tracking-wider">
                    <span aria-hidden="true">🔑</span>
                    Key word: {view.sentence.baseWord.toUpperCase()}
                  </span>
                )}
              </div>
            )}
            {newFormatTask(qType) && (
              <div data-testid="phone-format-task" className="text-gc-small font-semibold text-gc-quiet">{newFormatTask(qType)}</div>
            )}
            <p
              className="m-0 font-sentence italic font-medium text-[23px] leading-[1.3] text-gc-ink text-balance"
            >
              {view.specialHand?.hidesSentence ? (
                <span data-testid="phone-listening" className="not-italic font-sans text-gc-lead font-bold">
                  <span aria-hidden="true">🎧 </span>Listen to the sentence on your teacher&rsquo;s screen.
                </span>
              ) : qType === 'spotError' && view.sentence.options?.length === 4 ? (
                <SpotErrorSentence parts={view.sentence.options} />
              ) : qType === 'wordOrder' && view.sentence.options?.length ? (
                <WordTiles tiles={view.sentence.options} size="md" />
              ) : (
              <SentenceText
                text={view.sentence?.text || ''}
                highlight={view.sentence?.grammarPhrase}
                showGaps={isClozeRound}
                baseWord={qType === 'wordFormation' ? view.sentence?.baseWord : null}
                size="phone"
              />
              )}
            </p>
          </div>
        )}

        {/* Power-ups and effects on this player */}
        {(view.myActivePowerUps.length > 0 || view.isBetCapped || view.isHighRoller || (view.me.effects || []).some(e => EFFECT_CARD[e.type])) && (
          <div className="mt-3 pt-3 border-t border-gc-line/[0.1] flex flex-wrap justify-center gap-1.5 text-gc-cap font-semibold">
            {view.myActivePowerUps.map((pu, idx) => (
              <button
                type="button"
                key={idx}
                onClick={() => setSheet({ key: pu.type })}
                className="min-h-[32px] px-2.5 py-1 rounded-full bg-purple-500/15 text-purple-800 dark:text-purple-200 cursor-pointer"
                aria-label={`${POWER_UPS[pu.type]?.name}: what does it do?`}
              >
                {POWER_UPS[pu.type]?.icon} {POWER_UPS[pu.type]?.name}
              </button>
            ))}
            {(view.me.effects || []).map((e, idx) => {
              const key = EFFECT_CARD[e.type];
              if (!key || view.myActivePowerUps.some(pu => pu.type === key)) return null;
              const harmful = e.type === 'CRUCIO' || e.type === 'SILENCED';
              return (
                <button
                  type="button"
                  key={`effect-${idx}`}
                  onClick={() => setSheet({ key, handsLeft: e.roundsLeft })}
                  className={`min-h-[32px] px-2.5 py-1 rounded-full cursor-pointer ${harmful ? 'bg-gc-loss/15 text-gc-loss' : 'bg-gc-win/15 text-gc-win'}`}
                  aria-label={`${POWER_UPS[key].name}: what does it do?`}
                >
                  {POWER_UPS[key].icon} {POWER_UPS[key].name}
                  {e.roundsLeft > 0 ? ` · ${e.roundsLeft}` : ''}
                </button>
              );
            })}
            {view.isBetCapped && (
              <span className="px-2.5 py-1 rounded-full bg-gc-loss/15 text-gc-loss">
                🧢 Bets up to ${view.betCapAmount}
              </span>
            )}
            {view.isHighRoller && (
              <span className="px-2.5 py-1 rounded-full bg-gc-gold/15 text-gc-money">
                🔥 Bet at least ${view.minBetAmount}
              </span>
            )}
          </div>
        )}
      </section>
    </>
  );
}
