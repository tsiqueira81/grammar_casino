/**
 * Grammar Casino sound engine.
 *
 * Every sound is synthesised live with the Web Audio API: there are no audio
 * files to download, so phones on weak classroom Wi-Fi get the same sounds as
 * the projector, and the game sounds right offline too (the old engine needed
 * Tone.js from a CDN).
 *
 * Signal chain: voices -> dry bus + small "card room" reverb send -> master
 * gain (volume) -> soft compressor -> speakers.
 */
import type { SoundEffect } from '../types';

export const SFX_VOLUME_STORAGE_KEY = 'grammar_casino_sfx_volume';
export const SFX_MUTED_STORAGE_KEY = 'grammar_casino_sfx_muted';
export const DEFAULT_SFX_VOLUME = 0.8;

/** Clamp any stored or user-entered volume into 0..1. */
export function clampVolume(value: unknown, fallback: number = DEFAULT_SFX_VOLUME): number {
  const n = typeof value === 'string' ? parseFloat(value) : typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

/**
 * Base pitch (Hz) of a chip's ceramic "clack" by denomination.
 * Higher-value chips are heavier and ring lower.
 */
export function chipPitchForDenomination(denomination: number): number {
  const d = Number(denomination) || 25;
  if (d >= 500) return 2350;
  if (d >= 100) return 2700;
  if (d >= 50) return 3050;
  if (d >= 25) return 3400;
  return 3800;
}

/** Perceptual (squared) curve so the slider feels even across its range. */
export function volumeToGain(volume: number): number {
  const v = clampVolume(volume);
  return v * v;
}

type AudioCtor = typeof AudioContext;

export interface SoundEngine {
  play: (sound: SoundEffect, ...args: any[]) => void;
  setVolume: (volume: number) => void;
  getVolume: () => number;
  /** Resume the AudioContext; must be reachable from a user gesture on iOS. */
  unlock: () => Promise<void>;
  isSupported: () => boolean;
}

export function createSoundEngine(initialVolume: number = DEFAULT_SFX_VOLUME): SoundEngine {
  let volume = clampVolume(initialVolume);
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let dry: GainNode | null = null;
  let reverbSend: GainNode | null = null;
  let noiseBuffer: AudioBuffer | null = null;
  let pinkBuffer: AudioBuffer | null = null;
  let lastPlayed: Partial<Record<SoundEffect, number>> = {};

  const getCtor = (): AudioCtor | null => {
    if (typeof window === 'undefined') return null;
    return (window.AudioContext || (window as any).webkitAudioContext || null) as AudioCtor | null;
  };

  const ensureContext = (): AudioContext | null => {
    if (ctx) return ctx;
    const Ctor = getCtor();
    if (!Ctor) return null;
    try {
      ctx = new Ctor({ latencyHint: 'interactive' });
    } catch {
      return null;
    }

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 12;
    compressor.ratio.value = 3.5;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.18;
    compressor.connect(ctx.destination);

    master = ctx.createGain();
    master.gain.value = volumeToGain(volume);
    master.connect(compressor);

    dry = ctx.createGain();
    dry.gain.value = 1;
    dry.connect(master);

    // Small felt-and-wood card room: short synthetic impulse response.
    const convolver = ctx.createConvolver();
    convolver.buffer = buildImpulse(ctx, 0.9, 3.2);
    const reverbReturn = ctx.createGain();
    reverbReturn.gain.value = 0.32;
    convolver.connect(reverbReturn);
    reverbReturn.connect(master);
    reverbSend = ctx.createGain();
    reverbSend.gain.value = 1;
    reverbSend.connect(convolver);

    noiseBuffer = buildNoise(ctx, 1.5, false);
    pinkBuffer = buildNoise(ctx, 1.5, true);
    return ctx;
  };

  // ---------------------------------------------------------------------------
  // Building blocks
  // ---------------------------------------------------------------------------

  /** Route a voice to the dry bus and (optionally) the reverb. */
  const out = (node: AudioNode, wet = 0.25) => {
    if (!ctx || !dry || !reverbSend) return;
    node.connect(dry);
    if (wet > 0) {
      const send = ctx.createGain();
      send.gain.value = wet;
      node.connect(send);
      send.connect(reverbSend);
    }
  };

  const panned = (node: AudioNode, pan: number): AudioNode => {
    if (!ctx || typeof ctx.createStereoPanner !== 'function') return node;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    node.connect(p);
    return p;
  };

  /** Pitched partial with a percussive exponential envelope. */
  const tone = (
    t: number,
    freq: number,
    opts: {
      type?: OscillatorType;
      gain?: number;
      attack?: number;
      decay?: number;
      wet?: number;
      pan?: number;
      glideTo?: number;
      glideTime?: number;
      detune?: number;
    } = {}
  ) => {
    if (!ctx) return;
    const { type = 'sine', gain = 0.3, attack = 0.002, decay = 0.25, wet = 0.25, pan = 0, glideTo, glideTime, detune = 0 } = opts;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (detune) osc.detune.setValueAtTime(detune, t);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), t + (glideTime ?? decay));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    osc.connect(g);
    out(panned(g, pan), wet);
    osc.start(t);
    osc.stop(t + attack + decay + 0.05);
  };

  /** Filtered noise burst (felt, card paper, chip edge, drum skin...). */
  const noise = (
    t: number,
    opts: {
      filter?: BiquadFilterType;
      freq?: number;
      q?: number;
      freqTo?: number;
      gain?: number;
      attack?: number;
      decay?: number;
      wet?: number;
      pan?: number;
      panTo?: number;
      pink?: boolean;
    } = {}
  ) => {
    if (!ctx || !noiseBuffer || !pinkBuffer) return;
    const {
      filter = 'bandpass', freq = 3000, q = 1, freqTo, gain = 0.3, attack = 0.001, decay = 0.08, wet = 0.2, pan = 0, panTo, pink = false,
    } = opts;
    const src = ctx.createBufferSource();
    src.buffer = pink ? pinkBuffer : noiseBuffer;
    const offset = Math.random() * 0.8;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    if (freqTo) f.frequency.exponentialRampToValueAtTime(Math.max(30, freqTo), t + attack + decay);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    src.connect(f);
    f.connect(g);
    let node: AudioNode = g;
    if (typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), t);
      if (panTo !== undefined) p.pan.linearRampToValueAtTime(Math.max(-1, Math.min(1, panTo)), t + attack + decay);
      g.connect(p);
      node = p;
    }
    out(node, wet);
    src.start(t, offset, attack + decay + 0.05);
  };

  /** A clay/ceramic casino chip striking felt or another chip. */
  const chip = (t: number, denomination: number, strength = 1, pan = 0) => {
    const base = chipPitchForDenomination(denomination) * Math.pow(2, (Math.random() * 90 - 45) / 1200);
    // Bright edge transient
    noise(t, { filter: 'bandpass', freq: base * 1.6, q: 2.5, gain: 0.32 * strength, decay: 0.022, wet: 0.18, pan });
    // Inharmonic ceramic partials (disc modes ~ 1 : 1.59 : 2.14)
    tone(t, base, { gain: 0.16 * strength, decay: 0.07, wet: 0.22, pan });
    tone(t, base * 1.59, { gain: 0.08 * strength, decay: 0.045, wet: 0.2, pan });
    tone(t, base * 2.14, { gain: 0.05 * strength, decay: 0.03, wet: 0.15, pan });
    // Soft body thud into the felt
    noise(t, { filter: 'lowpass', freq: 700, q: 0.7, gain: 0.22 * strength, decay: 0.05, wet: 0.05, pan, pink: true });
  };

  /** Bell-like coin chime used for wins and payouts. */
  const bell = (t: number, freq: number, gain = 0.18, decay = 0.9, pan = 0) => {
    tone(t, freq, { gain, decay, wet: 0.45, pan });
    tone(t, freq * 2.01, { gain: gain * 0.45, decay: decay * 0.6, wet: 0.45, pan });
    tone(t, freq * 3.0, { gain: gain * 0.22, decay: decay * 0.35, wet: 0.45, pan });
    tone(t, freq * 4.23, { gain: gain * 0.12, decay: decay * 0.2, wet: 0.4, pan });
  };

  const note = (name: string): number => {
    const map: Record<string, number> = { C: -9, 'C#': -8, Db: -8, D: -7, 'D#': -6, Eb: -6, E: -5, F: -4, 'F#': -3, Gb: -3, G: -2, 'G#': -1, Ab: -1, A: 0, 'A#': 1, Bb: 1, B: 2 };
    const m = /^([A-G][#b]?)(\d)$/.exec(name);
    if (!m) return 440;
    const semis = map[m[1]] + (parseInt(m[2], 10) - 4) * 12;
    return 440 * Math.pow(2, semis / 12);
  };

  // ---------------------------------------------------------------------------
  // The sound palette
  // ---------------------------------------------------------------------------

  const voices: Record<SoundEffect, (t: number, args: any[]) => void> = {
    click: (t) => {
      noise(t, { filter: 'highpass', freq: 3500, gain: 0.12, decay: 0.012, wet: 0.05 });
      tone(t, 1900, { gain: 0.05, decay: 0.03, wet: 0.05 });
    },
    addPlayer: (t) => {
      chip(t, 25, 0.8);
      bell(t + 0.04, note('E5'), 0.1, 0.4);
      bell(t + 0.11, note('B5'), 0.08, 0.5);
    },
    startGame: (t) => {
      // Riffle shuffle, then a bright casino fanfare
      for (let i = 0; i < 14; i++) {
        noise(t + i * 0.022, { filter: 'bandpass', freq: 2600 + Math.random() * 1500, q: 1.4, gain: 0.12, decay: 0.018, wet: 0.1, pan: -0.4 + i * 0.06 });
      }
      const s = t + 0.38;
      ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => bell(s + i * 0.09, note(n), 0.14, 0.8));
      tone(s + 0.36, note('C4'), { type: 'triangle', gain: 0.12, decay: 0.9, wet: 0.4 });
    },
    win: (t, [index = 0]) => {
      const s = t + (Number(index) || 0) * 0.15;
      const pan = ((Number(index) || 0) % 5 - 2) * 0.2;
      bell(s, note('G5'), 0.14, 0.7, pan);
      bell(s + 0.07, note('D6'), 0.1, 0.8, pan);
      chip(s + 0.02, 100, 0.6, pan);
    },
    lose: (t, [index = 0]) => {
      const s = t + (Number(index) || 0) * 0.15;
      const pan = ((Number(index) || 0) % 5 - 2) * 0.2;
      // Chips raked away: soft felt drag and a falling muted tone
      noise(s, { filter: 'lowpass', freq: 1200, freqTo: 400, gain: 0.14, decay: 0.25, wet: 0.15, pink: true, pan });
      tone(s, 220, { type: 'triangle', gain: 0.12, decay: 0.35, glideTo: 150, wet: 0.2, pan });
    },
    hint: (t) => {
      bell(t, note('A5'), 0.1, 0.5);
      bell(t + 0.08, note('E6'), 0.07, 0.6);
    },
    powerUp: (t) => {
      // Rising shimmer sweep with sparkles
      tone(t, 300, { type: 'sawtooth', gain: 0.05, attack: 0.05, decay: 0.35, glideTo: 1400, glideTime: 0.35, wet: 0.35 });
      noise(t, { filter: 'bandpass', freq: 800, freqTo: 7000, q: 3, gain: 0.08, attack: 0.08, decay: 0.3, wet: 0.4 });
      ['C6', 'E6', 'G6'].forEach((n, i) => bell(t + 0.18 + i * 0.05, note(n), 0.06, 0.5));
    },
    gameOver: (t) => {
      // Jackpot: coin cascade and a held major chord
      for (let i = 0; i < 26; i++) {
        const dt = i * 0.045 + Math.random() * 0.02;
        chip(t + dt, [10, 25, 50, 100, 500][i % 5], 0.45, Math.random() * 1.4 - 0.7);
      }
      ['C5', 'E5', 'G5', 'C6', 'E6'].forEach((n, i) => bell(t + i * 0.11, note(n), 0.12, 1.4, (i - 2) * 0.25));
      ['C3', 'G3', 'C4', 'E4'].forEach((n) => tone(t + 0.55, note(n), { type: 'triangle', gain: 0.07, attack: 0.08, decay: 1.6, wet: 0.5 }));
    },
    bet: (t) => {
      chip(t, 50, 0.75);
    },
    flip: (t) => {
      // Playing card snapped over on felt
      noise(t, { filter: 'bandpass', freq: 5000, freqTo: 1800, q: 0.9, gain: 0.16, attack: 0.01, decay: 0.09, wet: 0.12 });
      noise(t + 0.085, { filter: 'highpass', freq: 2000, gain: 0.18, decay: 0.015, wet: 0.1 });
      noise(t + 0.09, { filter: 'lowpass', freq: 500, gain: 0.12, decay: 0.04, wet: 0.05, pink: true });
    },
    error: (t) => {
      tone(t, 196, { type: 'triangle', gain: 0.16, decay: 0.16, wet: 0.1 });
      tone(t + 0.13, 147, { type: 'triangle', gain: 0.16, decay: 0.22, wet: 0.1 });
    },
    success: (t) => {
      ['C5', 'E5', 'G5'].forEach((n, i) => bell(t + i * 0.06, note(n), 0.11, 0.7));
    },
    tick: (t) => {
      // Wooden clock tick
      noise(t, { filter: 'bandpass', freq: 2200, q: 6, gain: 0.2, decay: 0.02, wet: 0.08 });
      tone(t, 1150, { gain: 0.06, decay: 0.03, wet: 0.05 });
    },
    timeUp: (t) => {
      // Pit-boss bell: two struck notes and a low gong
      bell(t, note('E5'), 0.16, 0.6);
      bell(t + 0.18, note('C5'), 0.16, 0.9);
      tone(t + 0.18, note('C3'), { gain: 0.14, decay: 1.2, wet: 0.4 });
    },
    chipClink: (t, [denomination = 25]) => {
      const d = Number(denomination) || 25;
      chip(t, d, 1);
      // Chips rarely land alone: a quieter settle clack a moment later
      chip(t + 0.035 + Math.random() * 0.02, d, 0.35);
    },
    potSweep: (t, [winnerCount = 1]) => {
      const winners = Number(winnerCount) || 0;
      // Croupier rake across the felt
      noise(t, { filter: 'bandpass', freq: 900, freqTo: 2200, q: 0.8, gain: 0.16, attack: 0.04, decay: 0.42, wet: 0.15, pink: true, pan: -0.5, panTo: 0.5 });
      const clinks = winners > 0 ? 12 : 7;
      for (let i = 0; i < clinks; i++) {
        chip(t + 0.08 + i * 0.04 + Math.random() * 0.02, [100, 50, 25, 500][i % 4], 0.5, -0.5 + i / clinks);
      }
      if (winners > 0) {
        ['C6', 'E6', 'G6'].forEach((n, i) => bell(t + 0.45 + i * 0.06, note(n), 0.06, 0.8));
      }
    },
    boomerangWhoosh: (t) => {
      noise(t, { filter: 'bandpass', freq: 400, freqTo: 2400, q: 2.2, gain: 0.2, attack: 0.12, decay: 0.2, wet: 0.3, pan: -0.8, panTo: 0.8 });
      noise(t + 0.32, { filter: 'bandpass', freq: 2400, freqTo: 350, q: 2.2, gain: 0.2, attack: 0.05, decay: 0.3, wet: 0.3, pan: 0.8, panTo: -0.6 });
      chip(t + 0.3, 500, 0.6, 0.7);
    },
    drumroll: (t) => {
      // Snare roll crescendo with a cymbal crash at the end
      const len = 1.1;
      const hits = 30;
      for (let i = 0; i < hits; i++) {
        const k = i / hits;
        noise(t + k * len, { filter: 'bandpass', freq: 1800, q: 0.7, gain: 0.05 + 0.15 * k, decay: 0.05, wet: 0.2, pan: (i % 2 ? 0.1 : -0.1) });
      }
      noise(t + len, { filter: 'highpass', freq: 4500, gain: 0.22, decay: 1.1, wet: 0.5 });
      tone(t + len, 90, { gain: 0.25, decay: 0.3, glideTo: 50, wet: 0.2 });
    },
    lockIn: (t) => {
      // Chips pushed to the line and a firm table knock
      chip(t, 100, 0.9);
      chip(t + 0.05, 500, 0.6);
      tone(t + 0.02, 140, { gain: 0.18, decay: 0.12, glideTo: 90, wet: 0.08 });
    },
    bankrupt: (t) => {
      // Comic descending "wah wah" so busting stays light-hearted
      const steps = [note('G3'), note('F#3'), note('F3'), note('E3')];
      steps.forEach((f, i) => {
        tone(t + i * 0.26, f, { type: 'sawtooth', gain: 0.07, attack: 0.03, decay: i === 3 ? 0.7 : 0.22, wet: 0.25, glideTo: i === 3 ? f * 0.94 : undefined, glideTime: 0.6 });
      });
    },
    wheelTick: (t) => {
      noise(t, { filter: 'bandpass', freq: 3200, q: 4, gain: 0.14, decay: 0.012, wet: 0.08 });
    },
    roundWin: (t) => {
      // A phone's personal "you won" moment
      chip(t, 100, 0.8);
      ['E5', 'G#5', 'B5', 'E6'].forEach((n, i) => bell(t + 0.05 + i * 0.08, note(n), 0.13, 0.9));
      for (let i = 0; i < 8; i++) chip(t + 0.35 + i * 0.05, [25, 50, 100][i % 3], 0.4, Math.random() - 0.5);
    },
    roundLose: (t) => {
      noise(t, { filter: 'lowpass', freq: 900, freqTo: 300, gain: 0.14, decay: 0.3, wet: 0.15, pink: true });
      tone(t, note('E4'), { type: 'triangle', gain: 0.11, decay: 0.3, wet: 0.25 });
      tone(t + 0.22, note('C4'), { type: 'triangle', gain: 0.11, decay: 0.55, wet: 0.3 });
    },
  };

  // Minimum spacing between identical sounds so rapid UI events never stack into a roar.
  const MIN_GAP: Partial<Record<SoundEffect, number>> = { click: 0.03, tick: 0.05, bet: 0.03, chipClink: 0.025, wheelTick: 0.02 };

  const play = (sound: SoundEffect, ...args: any[]) => {
    const c = ensureContext();
    if (!c || !master) return;
    if (c.state === 'suspended') {
      c.resume().catch(() => {});
    }
    const voice = voices[sound];
    if (!voice) return;
    const now = c.currentTime;
    const gap = MIN_GAP[sound];
    if (gap !== undefined) {
      const last = lastPlayed[sound];
      if (last !== undefined && now - last < gap) return;
    }
    lastPlayed = { ...lastPlayed, [sound]: now };
    try {
      voice(now + 0.005, args);
    } catch (e) {
      console.warn('Sound failed:', sound, e);
    }
  };

  return {
    play,
    setVolume: (next: number) => {
      volume = clampVolume(next);
      if (ctx && master) {
        master.gain.setTargetAtTime(volumeToGain(volume), ctx.currentTime, 0.02);
      }
    },
    getVolume: () => volume,
    unlock: async () => {
      const c = ensureContext();
      if (c && c.state !== 'running') {
        try {
          await c.resume();
        } catch {}
      }
    },
    isSupported: () => getCtor() !== null,
  };
}

function buildNoise(ctx: BaseAudioContext, seconds: number, pink: boolean): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    if (!pink) {
      data[i] = white;
      continue;
    }
    // Paul Kellet's pink noise filter
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
  return buffer;
}

function buildImpulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const k = i / length;
      // Early reflections are denser, the tail is darker and decays exponentially
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - k, decay) * (i < ctx.sampleRate * 0.01 ? 0.5 : 1);
    }
  }
  return buffer;
}
