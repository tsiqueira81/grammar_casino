// Music for the teacher's screen (package V6): a generative lounge bed synthesised with Web Audio,
// in the same style as the effects in soundEngine.ts. Walking bass, brushed hi-hat and soft
// electric-piano chords at 92 beats per minute, scheduled 100 ms ahead on the audio clock.
// Four layers the game fades between: lobby, think, tension and celebrate.
// Nothing is downloaded, and nothing plays until the teacher has clicked once (browser rule).

export type MusicLayer = 'lobby' | 'think' | 'tension' | 'celebrate';
export type Instrument = 'bass' | 'hat' | 'keys' | 'lead' | 'pedal';

export const MUSIC_VOLUME_KEY = 'grammar_casino_music_volume_v1';
export const DEFAULT_MUSIC_VOLUME = 0.35;
export const BPM = 92;
export const BEAT = 60 / BPM;
export const BAR = BEAT * 4;
export const LOOKAHEAD_S = 0.1;
const TICK_MS = 25;

/** Which instruments each layer plays (1 = full, 0 = silent). */
export const LAYER_MIX: Record<MusicLayer, Record<Instrument, number>> = {
  lobby: { bass: 1, hat: 0.8, keys: 1, lead: 0, pedal: 0 },
  think: { bass: 0.9, hat: 0.6, keys: 0, lead: 0, pedal: 0 },
  tension: { bass: 0.9, hat: 1, keys: 0, lead: 0, pedal: 1 },
  celebrate: { bass: 1, hat: 1, keys: 1, lead: 1, pedal: 0 },
};

/** A small ii-V-I-vi chart in F major, as MIDI notes (root, then the chord tones). */
const CHART: { root: number; chord: number[] }[] = [
  { root: 43, chord: [60, 63, 67, 70] }, // Gm7
  { root: 36, chord: [58, 62, 64, 67] }, // C9-ish
  { root: 41, chord: [57, 60, 64, 67] }, // Fmaj7
  { root: 38, chord: [57, 60, 62, 65] }, // Dm7
];
const LEAD = [72, 74, 77, 76, 74, 72, 69, 72];

export const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export interface MusicNote {
  instrument: Instrument;
  /** Seconds from the start of the bar. */
  at: number;
  duration: number;
  hz: number;
  gain: number;
}

/** The notes of one bar. Pure, so it is easy to test. */
export function notesForBar(bar: number, layer: MusicLayer): MusicNote[] {
  const chart = CHART[((bar % CHART.length) + CHART.length) % CHART.length];
  const next = CHART[(((bar + 1) % CHART.length) + CHART.length) % CHART.length];
  const mix = LAYER_MIX[layer];
  const notes: MusicNote[] = [];
  if (mix.bass) {
    // Walking bass: root, fifth, octave, then a step into the next chord.
    const walk = [chart.root, chart.root + 7, chart.root + 12, next.root + (next.root > chart.root ? -1 : 1)];
    walk.forEach((m, i) => notes.push({ instrument: 'bass', at: i * BEAT, duration: BEAT * 0.9, hz: midiToHz(m), gain: 0.5 * mix.bass }));
  }
  if (mix.hat) {
    const swing = layer === 'tension' ? 4 : 2;
    for (let i = 0; i < 4 * swing; i++) {
      const at = (i * BEAT) / swing + (i % 2 ? BEAT * 0.08 : 0);
      notes.push({ instrument: 'hat', at, duration: 0.05, hz: 8000, gain: (i % 2 ? 0.12 : 0.2) * mix.hat });
    }
  }
  if (mix.keys) {
    for (const beat of [0, 2.5]) {
      chart.chord.forEach((m) => notes.push({ instrument: 'keys', at: beat * BEAT, duration: BEAT * 1.4, hz: midiToHz(m), gain: 0.08 * mix.keys }));
    }
  }
  if (mix.pedal) {
    notes.push({ instrument: 'pedal', at: 0, duration: BAR * 0.98, hz: midiToHz(36), gain: 0.18 * mix.pedal });
  }
  if (mix.lead) {
    LEAD.slice((bar % 2) * 4, (bar % 2) * 4 + 4).forEach((m, i) => notes.push({ instrument: 'lead', at: i * BEAT, duration: BEAT * 0.7, hz: midiToHz(m), gain: 0.1 * mix.lead }));
  }
  return notes;
}

export interface MusicEngine {
  start: () => void;
  stop: () => void;
  setLayer: (layer: MusicLayer) => void;
  setVolume: (volume: number) => void;
  /** Lowers the music to this share of its volume (1 = no ducking), e.g. under speech. */
  duck: (share: number) => void;
  isPlaying: () => boolean;
  getLayer: () => MusicLayer;
}

type Ctor = typeof AudioContext;

export function createMusicEngine(initialVolume: number = DEFAULT_MUSIC_VOLUME): MusicEngine {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let volume = Math.min(1, Math.max(0, initialVolume));
  let ducking = 1;
  let layer: MusicLayer = 'lobby';
  let playing = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let nextBarAt = 0;
  let bar = 0;
  let noise: AudioBuffer | null = null;

  const ctor = (): Ctor | null => {
    if (typeof window === 'undefined') return null;
    return (window.AudioContext || (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext || null) as Ctor | null;
  };

  const level = () => volume * volume * ducking; // perceived loudness is closer to the square

  const ensure = (): AudioContext | null => {
    if (ctx) return ctx;
    const C = ctor();
    if (!C) return null;
    try {
      ctx = new C();
    } catch {
      return null;
    }
    master = ctx.createGain();
    master.gain.value = level();
    master.connect(ctx.destination);
    const length = Math.max(1, Math.floor(ctx.sampleRate * 0.1));
    noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return ctx;
  };

  const play = (c: AudioContext, n: MusicNote, at: number) => {
    if (!master || at < c.currentTime) return; // never schedule in the past
    const g = c.createGain();
    const end = at + n.duration;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(n.gain, at + Math.min(0.02, n.duration / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    g.connect(master);
    if (n.instrument === 'hat') {
      const src = c.createBufferSource();
      src.buffer = noise;
      const hp = c.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 6000;
      src.connect(hp);
      hp.connect(g);
      src.start(at);
      src.stop(end + 0.01);
      return;
    }
    const osc = c.createOscillator();
    osc.type = n.instrument === 'bass' || n.instrument === 'pedal' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(n.hz, at);
    osc.connect(g);
    osc.start(at);
    osc.stop(end + 0.02);
  };

  const schedule = () => {
    const c = ctx;
    if (!c || !playing) return;
    while (nextBarAt < c.currentTime + LOOKAHEAD_S) {
      notesForBar(bar, layer).forEach((n) => play(c, n, nextBarAt + n.at));
      nextBarAt += BAR;
      bar++;
    }
  };

  const applyLevel = () => {
    if (ctx && master) master.gain.setTargetAtTime(level(), ctx.currentTime, 0.3);
  };

  return {
    start() {
      if (playing || volume <= 0) return;
      const c = ensure();
      if (!c) return;
      if (c.state === 'suspended') void c.resume();
      playing = true;
      nextBarAt = c.currentTime + 0.05;
      applyLevel();
      schedule();
      timer = setInterval(schedule, TICK_MS);
    },
    stop() {
      playing = false;
      if (timer) clearInterval(timer);
      timer = null;
      if (ctx && master) master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15);
    },
    setLayer(next) {
      layer = next; // takes effect from the next bar, so a change is always on the beat
    },
    setVolume(next) {
      volume = Math.min(1, Math.max(0, Number.isFinite(next) ? next : DEFAULT_MUSIC_VOLUME));
      applyLevel();
    },
    duck(share) {
      ducking = Math.min(1, Math.max(0, share));
      applyLevel();
    },
    isPlaying: () => playing,
    getLayer: () => layer,
  };
}

/** Which layer fits a screen of the game. */
export function layerForStep(step: string, secondsLeft?: number | null): MusicLayer {
  if (step === 'GAME_OVER') return 'celebrate';
  if (step === 'IN_GAME') return typeof secondsLeft === 'number' && secondsLeft <= 5 ? 'tension' : 'think';
  return 'lobby';
}

/** Seconds left on the soonest running turn timer (held or paused timers do not count), or null. */
export function secondsLeftOnTimers(
  timers: ReadonlyArray<{ status: string; endsAt?: number; held?: boolean }>,
  now: number,
): number | null {
  let soonest: number | null = null;
  for (const t of timers) {
    if (t.status !== 'running' || t.held || typeof t.endsAt !== 'number') continue;
    if (soonest === null || t.endsAt < soonest) soonest = t.endsAt;
  }
  return soonest === null ? null : Math.max(0, Math.ceil((soonest - now) / 1000));
}

/** How loud the music plays: 30% while the results are read, at most 35% while a sentence is spoken. */
export function musicDuckFor(step: string, speaking: boolean): number {
  const base = step === 'RESULTS' ? 0.3 : 1;
  return speaking ? Math.min(base, 0.35) : base;
}
