import { describe, expect, it } from 'vitest';
import { REVEAL_BEATS, playCues, revealCueSheet } from '../show/director';

describe('the reveal director (package V5)', () => {
  it('sweeps the pot after the verdict, then the extras', () => {
    const cues = revealCueSheet({ bigWin: true, bust: true, calm: false });
    expect(cues.map((c) => `${c.at} ${c.track} ${c.name}`)).toEqual([
      `${REVEAL_BEATS.potSweep} sound potSweep`,
      `${REVEAL_BEATS.potSweep} table potSweep`,
      `${REVEAL_BEATS.jackpot} table jackpot`,
      `${REVEAL_BEATS.bankrupt} sound bankrupt`,
    ]);
    expect(REVEAL_BEATS.potSweep).toBeGreaterThan(0);
    expect(REVEAL_BEATS.jackpot).toBeGreaterThan(REVEAL_BEATS.potSweep);
  });

  it('leaves out beats that did not happen', () => {
    const names = revealCueSheet({ bigWin: false, bust: false, calm: false }).map((c) => c.name);
    expect(names).toEqual(['potSweep', 'potSweep']);
  });

  it('plays every beat at once in Calm mode', () => {
    expect(revealCueSheet({ bigWin: true, bust: true, calm: true }).every((c) => c.at === 0)).toBe(true);
  });

  it('runs 0 ms cues now and schedules the rest', () => {
    const ran: string[] = [];
    const scheduled: number[] = [];
    playCues(
      [
        { at: 0, track: 'sound', name: 'potSweep' },
        { at: 300, track: 'table', name: 'jackpot' },
      ],
      { sound: (n) => ran.push(`sound ${n}`), table: (n) => ran.push(`table ${n}`) },
      (fn, ms) => {
        scheduled.push(ms);
        fn();
      },
    );
    expect(scheduled).toEqual([300]);
    expect(ran).toEqual(['sound potSweep', 'table jackpot']);
  });
});
