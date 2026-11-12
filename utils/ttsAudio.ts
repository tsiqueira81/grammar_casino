// Decoding the AI voice's audio (base64 WAV or raw PCM) into a Web Audio buffer. Moved out of
// App.tsx (package F7) without changes.
export function base64ToBytes(base64: string) {
  const binaryString = atob(base64);
  const length = binaryString.length;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function pcmToAudioBuffer(
  data: Uint8Array,
  ctx: AudioContext,
  defaultSampleRate: number = 24000,
  defaultNumChannels: number = 1
): AudioBuffer {
  let pcmBytes = data;
  let sampleRate = defaultSampleRate;
  let numChannels = defaultNumChannels;

  // Gemini 3.8 TTS unary calls return a complete WAV file (RIFF....WAVE) which
  // includes a 44-byte header and often trailing LIST/INFO metadata chunks at the end.
  // If we don't extract strictly the 'data' subchunk, those trailing metadata bytes
  // get played as a burst of static/noise at the end of the sentence.
  const isRiffWav =
    data.length > 44 &&
    data[0] === 0x52 && // 'R'
    data[1] === 0x49 && // 'I'
    data[2] === 0x46 && // 'F'
    data[3] === 0x46 && // 'F'
    data[8] === 0x57 && // 'W'
    data[9] === 0x41 && // 'A'
    data[10] === 0x56 && // 'V'
    data[11] === 0x45;   // 'E'

  if (isRiffWav) {
    let offset = 12;
    let foundDataChunk = false;
    while (offset + 8 <= data.length) {
      const chunkId = String.fromCharCode(
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3]
      );
      const chunkSize =
        (data[offset + 4] |
          (data[offset + 5] << 8) |
          (data[offset + 6] << 16) |
          (data[offset + 7] << 24)) >>>
        0;
      const chunkDataStart = offset + 8;

      if (chunkId === 'fmt ' && chunkSize >= 16 && chunkDataStart + 16 <= data.length) {
        const parsedChannels = data[chunkDataStart + 2] | (data[chunkDataStart + 3] << 8);
        const parsedRate =
          (data[chunkDataStart + 4] |
            (data[chunkDataStart + 5] << 8) |
            (data[chunkDataStart + 6] << 16) |
            (data[chunkDataStart + 7] << 24)) >>>
          0;
        if (parsedChannels >= 1 && parsedChannels <= 2) numChannels = parsedChannels;
        if (parsedRate >= 8000 && parsedRate <= 96000) sampleRate = parsedRate;
      } else if (chunkId === 'data') {
        // Streaming WAV headers sometimes set chunkSize to 0xFFFFFFFF; clamp to actual buffer length
        const availableBytes = data.length - chunkDataStart;
        const actualDataBytes =
          chunkSize > 0 && chunkSize <= availableBytes ? chunkSize : availableBytes;
        pcmBytes = data.subarray(chunkDataStart, chunkDataStart + actualDataBytes);
        foundDataChunk = true;
        break;
      }

      if (chunkSize === 0 || chunkDataStart + chunkSize > data.length) {
        break;
      }
      offset = chunkDataStart + chunkSize + (chunkSize % 2);
    }

    if (!foundDataChunk) {
      // Fallback: strip standard 44-byte WAV header
      pcmBytes = data.subarray(44);
    }
  }

  // Ensure even byte length for Int16Array
  const alignedByteLength = pcmBytes.byteLength - (pcmBytes.byteLength % 2);
  const sampleCount = Math.floor(alignedByteLength / 2);
  const view = new DataView(pcmBytes.buffer, pcmBytes.byteOffset, alignedByteLength);

  const rawFrameCount = Math.floor(sampleCount / numChannels);
  // Trim any tiny trailing click/pop in the last ~15ms and apply a smooth fade-in/fade-out
  const trimTailFrames = Math.min(Math.floor(sampleRate * 0.012), Math.floor(rawFrameCount * 0.05));
  const frameCount = Math.max(1, rawFrameCount - trimTailFrames);
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  const fadeInFrames = Math.min(Math.floor(sampleRate * 0.006), Math.floor(frameCount * 0.1));
  const fadeOutFrames = Math.min(Math.floor(sampleRate * 0.03), Math.floor(frameCount * 0.15));

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      const sampleIndex = (i * numChannels + channel) * 2;
      let sample = view.getInt16(sampleIndex, true) / 32768.0;

      if (i < fadeInFrames && fadeInFrames > 0) {
        sample *= i / fadeInFrames;
      } else if (i >= frameCount - fadeOutFrames && fadeOutFrames > 0) {
        const remaining = frameCount - 1 - i;
        // Cosine fade-out to eliminate any end-of-clip pop or noise
        const t = remaining / fadeOutFrames;
        sample *= 0.5 * (1 - Math.cos(Math.PI * t));
      }

      channelData[i] = sample;
    }
  }
  return buffer;
}
