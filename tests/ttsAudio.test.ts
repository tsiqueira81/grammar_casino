import { describe, expect, it } from 'vitest';
import { base64ToBytes, pcmToAudioBuffer } from '../utils/ttsAudio';

// A tiny stand-in for AudioContext.createBuffer.
const fakeCtx = {
  createBuffer: (channels: number, frames: number, rate: number) => {
    const data = Array.from({ length: channels }, () => new Float32Array(frames));
    return { numberOfChannels: channels, length: frames, sampleRate: rate, getChannelData: (c: number) => data[c] };
  },
} as unknown as AudioContext;

function wav(samples: number[], rate: number, trailer = 0): Uint8Array {
  const dataBytes = samples.length * 2;
  const out = new Uint8Array(44 + dataBytes + trailer);
  const v = new DataView(out.buffer);
  const tag = (o: number, s: string) => [...s].forEach((ch, i) => (out[o + i] = ch.charCodeAt(0)));
  tag(0, 'RIFF'); v.setUint32(4, 36 + dataBytes, true); tag(8, 'WAVE');
  tag(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  tag(36, 'data'); v.setUint32(40, dataBytes, true);
  samples.forEach((s, i) => v.setInt16(44 + i * 2, s, true));
  return out;
}

describe('AI voice decoding', () => {
  it('reads base64 into bytes', () => {
    expect([...base64ToBytes('AQID')]).toEqual([1, 2, 3]);
  });

  it('takes the sample rate from a WAV header and ignores bytes after the data chunk', () => {
    const samples = Array.from({ length: 1000 }, () => 16384);
    const buffer = pcmToAudioBuffer(wav(samples, 16000, 40), fakeCtx);
    expect(buffer.sampleRate).toBe(16000);
    expect(buffer.length).toBeLessThanOrEqual(1000);
    expect(buffer.getChannelData(0)[500]).toBeCloseTo(0.5, 3);
  });

  it('reads raw PCM at the default rate', () => {
    const raw = new Uint8Array(400);
    expect(pcmToAudioBuffer(raw, fakeCtx).sampleRate).toBe(24000);
  });
});
