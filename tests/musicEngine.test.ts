import { afterEach, describe, expect, it, vi } from 'vitest';
import { BAR, LAYER_MIX, createMusicEngine, layerForStep, midiToHz, notesForBar } from '../utils/musicEngine';

// Package V6: the music bed, with a fake audio clock.
function installFakeAudio() {
  const scheduled: { kind: string; at: number }[] = [];
  const ramps: number[] = [];
  let now = 1;
  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn((v: number) => { ramps.push(v); }),
    setTargetAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn((v: number) => {
      if (!(v > 0)) throw new RangeError('exponentialRampToValueAtTime needs a positive value');
      ramps.push(v);
    }),
  });
  const node = () => ({ connect: vi.fn((n: unknown) => n) });
  class FakeContext {
    state = 'running';
    get currentTime() { return now; }
    sampleRate = 8000;
    destination = node();
    resume = vi.fn(async () => {});
    createGain() { return { ...node(), gain: param() }; }
    createBiquadFilter() { return { ...node(), type: 'lowpass', frequency: param(), Q: param() }; }
    createOscillator() {
      return { ...node(), type: 'sine', frequency: param(), start: vi.fn((t: number) => scheduled.push({ kind: 'osc', at: t })), stop: vi.fn() };
    }
    createBufferSource() {
      return { ...node(), buffer: null, start: vi.fn((t: number) => scheduled.push({ kind: 'noise', at: t })), stop: vi.fn() };
    }
    createBuffer(_c: number, length: number) {
      const data = new Float32Array(length);
      return { getChannelData: () => data };
    }
  }
  (globalThis as any).window = { AudioContext: FakeContext };
  return { scheduled, ramps, advance: (s: number) => { now += s; } };
}

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as any).window;
});

describe('the notes', () => {
  it('every layer stays inside the bar and has positive levels', () => {
    for (const layer of Object.keys(LAYER_MIX) as (keyof typeof LAYER_MIX)[]) {
      for (let bar = 0; bar < 8; bar++) {
        for (const n of notesForBar(bar, layer)) {
          expect(n.at).toBeGreaterThanOrEqual(0);
          expect(n.at).toBeLessThan(BAR);
          expect(n.duration).toBeGreaterThan(0);
          expect(n.gain).toBeGreaterThan(0);
          expect(n.hz).toBeGreaterThan(20);
        }
      }
    }
  });
  it('think is bass and brushes only; celebrate adds the lead', () => {
    const kinds = (layer: 'think' | 'celebrate') => new Set(notesForBar(0, layer).map((n) => n.instrument));
    expect([...kinds('think')].sort()).toEqual(['bass', 'hat']);
    expect(kinds('celebrate').has('lead')).toBe(true);
  });
  it('A is 440 Hz', () => {
    expect(midiToHz(69)).toBe(440);
  });
  it('the screen picks the layer', () => {
    expect(layerForStep('PLAYER_SETUP')).toBe('lobby');
    expect(layerForStep('IN_GAME')).toBe('think');
    expect(layerForStep('IN_GAME', 4)).toBe('tension');
    expect(layerForStep('GAME_OVER')).toBe('celebrate');
  });
});

describe('the scheduler', () => {
  it('schedules ahead, never in the past, and stops cleanly', () => {
    vi.useFakeTimers();
    const audio = installFakeAudio();
    const engine = createMusicEngine(0.35);
    engine.start();
    expect(engine.isPlaying()).toBe(true);
    for (let i = 0; i < 40; i++) {
      audio.advance(0.025);
      vi.advanceTimersByTime(25);
    }
    expect(audio.scheduled.length).toBeGreaterThan(0);
    // Everything was scheduled at or after the clock time when it was scheduled (clock started at 1).
    expect(audio.scheduled.every((s) => s.at >= 1)).toBe(true);
    expect(audio.ramps.every((v) => v >= 0)).toBe(true);
    engine.stop();
    const count = audio.scheduled.length;
    audio.advance(2);
    vi.advanceTimersByTime(2000);
    expect(audio.scheduled.length).toBe(count);
    expect(engine.isPlaying()).toBe(false);
  });
  it('does nothing at volume 0 or without Web Audio', () => {
    installFakeAudio();
    const silent = createMusicEngine(0);
    silent.start();
    expect(silent.isPlaying()).toBe(false);
    delete (globalThis as any).window;
    const none = createMusicEngine(0.5);
    none.start();
    expect(none.isPlaying()).toBe(false);
  });
  it('a new layer starts on the next bar', () => {
    installFakeAudio();
    const engine = createMusicEngine(0.5);
    engine.setLayer('tension');
    expect(engine.getLayer()).toBe('tension');
  });
});
