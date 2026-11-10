import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  clampVolume,
  chipPitchForDenomination,
  volumeToGain,
  createSoundEngine,
  DEFAULT_SFX_VOLUME,
} from '../utils/soundEngine';
import type { SoundEffect } from '../types';

const ALL_SOUNDS: SoundEffect[] = [
  'click', 'addPlayer', 'startGame', 'win', 'lose', 'hint', 'powerUp', 'gameOver', 'bet', 'flip',
  'error', 'success', 'tick', 'timeUp', 'chipClink', 'potSweep', 'boomerangWhoosh',
  'drumroll', 'lockIn', 'bankrupt', 'wheelTick', 'roundWin', 'roundLose',
];

/** Minimal Web Audio stand-in that enforces the rules real browsers throw on. */
function installFakeAudio() {
  const started: string[] = [];
  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn((v: number) => {
      if (!(v > 0)) throw new RangeError('exponentialRampToValueAtTime needs a positive value');
    }),
  });
  const node = () => ({ connect: vi.fn((n: unknown) => n) });
  class FakeContext {
    state = 'running';
    currentTime = 1;
    sampleRate = 8000;
    destination = node();
    resume = vi.fn(async () => {});
    createGain() { return { ...node(), gain: param() }; }
    createDynamicsCompressor() {
      return { ...node(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() };
    }
    createConvolver() { return { ...node(), buffer: null }; }
    createStereoPanner() { return { ...node(), pan: param() }; }
    createBiquadFilter() { return { ...node(), type: 'lowpass', frequency: param(), Q: param() }; }
    createOscillator() {
      return { ...node(), type: 'sine', frequency: param(), detune: param(), start: vi.fn(() => started.push('osc')), stop: vi.fn() };
    }
    createBufferSource() {
      return { ...node(), buffer: null, start: vi.fn(() => started.push('noise')) };
    }
    createBuffer(channels: number, length: number) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { getChannelData: (c: number) => data[c] };
    }
  }
  (globalThis as any).window = { AudioContext: FakeContext };
  return started;
}

afterEach(() => {
  delete (globalThis as any).window;
});

describe('sound engine helpers', () => {
  it('clamps volume and falls back on junk', () => {
    expect(clampVolume(2)).toBe(1);
    expect(clampVolume(-1)).toBe(0);
    expect(clampVolume('0.4')).toBeCloseTo(0.4);
    expect(clampVolume(null)).toBe(DEFAULT_SFX_VOLUME);
    expect(clampVolume('abc', 0.3)).toBe(0.3);
  });

  it('uses a perceptual gain curve', () => {
    expect(volumeToGain(0)).toBe(0);
    expect(volumeToGain(1)).toBe(1);
    expect(volumeToGain(0.5)).toBeCloseTo(0.25);
  });

  it('makes heavier chips ring lower', () => {
    const pitches = [10, 25, 50, 100, 500].map(chipPitchForDenomination);
    for (let i = 1; i < pitches.length; i++) {
      expect(pitches[i]).toBeLessThan(pitches[i - 1]);
    }
  });
});

describe('createSoundEngine', () => {
  it('is a silent no-op where Web Audio does not exist', () => {
    const engine = createSoundEngine();
    expect(engine.isSupported()).toBe(false);
    expect(() => engine.play('win', 0)).not.toThrow();
  });

  it('plays every sound effect without Web Audio errors', () => {
    const started = installFakeAudio();
    const engine = createSoundEngine(0.5);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const sound of ALL_SOUNDS) {
      engine.play(sound, 2);
    }
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    expect(started.length).toBeGreaterThan(ALL_SOUNDS.length);
  });

  it('remembers and clamps the volume', () => {
    installFakeAudio();
    const engine = createSoundEngine(0.5);
    engine.setVolume(3);
    expect(engine.getVolume()).toBe(1);
  });
});
