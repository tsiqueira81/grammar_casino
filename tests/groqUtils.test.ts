import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  chunkTextForOrpheusTts,
  parseWavBuffer,
  stitchWavBuffers,
  convertToStrictJsonSchema,
  toStrictGroqResponseFormat,
  extractJsonFromText,
  extractGroqRetryDelayMs,
  resolveGroqApiKey,
  resolveGroqApiKeys,
  markGroqKeyCooldown,
  clearGroqKeyCooldowns,
  callGroqChatCompletion,
  resolveOrpheusVoice,
  ORPHEUS_MAX_INPUT_CHARS,
} from '../utils/groqUtils';

function createMockWavBuffer(pcmSamples: number[], sampleRate = 24000): Buffer {
  const pcmData = Buffer.alloc(pcmSamples.length * 2);
  for (let i = 0; i < pcmSamples.length; i++) {
    pcmData.writeInt16LE(pcmSamples[i], i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 4, 'ascii');
  header.writeUInt32LE(36 + pcmData.length, 4);
  header.write('WAVE', 8, 4, 'ascii');
  header.write('fmt ', 12, 4, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // Mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 4, 'ascii');
  header.writeUInt32LE(pcmData.length, 40);
  return Buffer.concat([header, pcmData]);
}

describe('Groq Free Tier Utilities (openai/gpt-oss-120b & canopylabs/orpheus-v1-english)', () => {
  afterEach(() => {
    clearGroqKeyCooldowns();
    vi.restoreAllMocks();
  });

  describe('chunkTextForOrpheusTts (200-char limit protection)', () => {
    it('keeps short sentences as a single chunk', () => {
      const text = 'Rarely had the engineers witnessed such a dramatic breakthrough in solar architecture.';
      const chunks = chunkTextForOrpheusTts(text);
      expect(chunks).toEqual([text]);
      expect(chunks[0].length).toBeLessThanOrEqual(ORPHEUS_MAX_INPUT_CHARS);
    });

    it('splits multi-sentence grammar explanations so every chunk is <= 190 chars', () => {
      const longExplanation =
        'When a negative adverbial such as "Not only" or "Rarely" is placed at the start of a clause for rhetorical emphasis, English grammar requires subject-auxiliary inversion. Therefore, the auxiliary verb "did" must precede the subject "the director" rather than following standard declarative word order. Using the uninverted form is a common C1 mistake.';
      expect(longExplanation.length).toBeGreaterThan(200);

      const chunks = chunkTextForOrpheusTts(longExplanation);
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(ORPHEUS_MAX_INPUT_CHARS);
        expect(chunk.length).toBeLessThan(200);
      }
      expect(chunks.join(' ')).toBe(longExplanation);
    });

    it('splits a single long sentence with clauses/words when no period is present', () => {
      const singleLongSentence =
        'Although the archaeological team had been excavating the sunken Mediterranean trading vessel for nearly three consecutive summers, they had neither catalogued the bronze navigational astrolabes nor deciphered the corroded lead tablets found inside the captain cabin.';
      expect(singleLongSentence.length).toBeGreaterThan(200);

      const chunks = chunkTextForOrpheusTts(singleLongSentence);
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(ORPHEUS_MAX_INPUT_CHARS);
      }
      expect(chunks.join(' ')).toBe(singleLongSentence);
    });
  });

  describe('parseWavBuffer & stitchWavBuffers', () => {
    it('stiches multiple RIFF WAVE buffers into a single valid WAVE buffer with concatenated PCM data', () => {
      const wav1 = createMockWavBuffer([100, 200, 300, -100]);
      const wav2 = createMockWavBuffer([400, 500, -200, -300, 600]);

      const stitched = stitchWavBuffers([wav1, wav2]);
      const parsed = parseWavBuffer(stitched);

      expect(parsed.sampleRate).toBe(24000);
      expect(parsed.numChannels).toBe(1);
      expect(parsed.bitsPerSample).toBe(16);
      // 4 samples (8 bytes) + 5 samples (10 bytes) = 18 bytes
      expect(parsed.pcmData.length).toBe(18);
      expect(parsed.pcmData.readInt16LE(0)).toBe(100);
      expect(parsed.pcmData.readInt16LE(6)).toBe(-100);
      expect(parsed.pcmData.readInt16LE(8)).toBe(400);
      expect(parsed.pcmData.readInt16LE(16)).toBe(600);
    });
  });

  describe('toStrictGroqResponseFormat & convertToStrictJsonSchema', () => {
    it('enforces additionalProperties: false and includes all properties in required for strict mode', () => {
      const geminiSchema = {
        type: 'OBJECT',
        properties: {
          evaluations: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                word: { type: 'STRING' },
                mark1Correct: { type: 'BOOLEAN' },
                mark2Correct: { type: 'BOOLEAN' },
                isCorrect: { type: 'BOOLEAN' },
                marks: { type: 'INTEGER' },
                feedback: { type: 'STRING' },
              },
              required: ['word', 'isCorrect', 'marks', 'feedback'],
            },
          },
        },
        required: ['evaluations'],
      };

      const formatted = toStrictGroqResponseFormat(geminiSchema, 'batch_cloze');
      expect(formatted.type).toBe('json_schema');
      expect(formatted.json_schema.strict).toBe(true);
      expect(formatted.json_schema.schema.additionalProperties).toBe(false);

      const itemSchema = formatted.json_schema.schema.properties.evaluations.items;
      expect(itemSchema.additionalProperties).toBe(false);
      expect(itemSchema.required).toEqual([
        'word',
        'mark1Correct',
        'mark2Correct',
        'isCorrect',
        'marks',
        'feedback',
      ]);
    });
  });

  describe('Helper extractors & resolvers', () => {
    it('extracts JSON from markdown code fences cleanly', () => {
      const fenced = '```json\n{"isCorrect": true, "feedback": "Well done!"}\n```';
      expect(JSON.parse(extractJsonFromText(fenced))).toEqual({
        isCorrect: true,
        feedback: 'Well done!',
      });
    });

    it('parses Groq retry-after delays from error text', () => {
      expect(
        extractGroqRetryDelayMs('Rate limit reached for model openai/gpt-oss-120b. Please try again in 2.5s.')
      ).toBeGreaterThanOrEqual(2500);
      expect(extractGroqRetryDelayMs('Please try again in 450ms.')).toBeGreaterThanOrEqual(450);
    });

    it('validates all 6 Orpheus voices and defaults to troy', () => {
      expect(resolveOrpheusVoice()).toBe('troy');
      expect(resolveOrpheusVoice('troy')).toBe('troy');
      expect(resolveOrpheusVoice('autumn')).toBe('autumn');
      expect(resolveOrpheusVoice('diana')).toBe('diana');
      expect(resolveOrpheusVoice('HANNAH')).toBe('hannah');
      expect(resolveOrpheusVoice('austin')).toBe('austin');
      expect(resolveOrpheusVoice('daniel')).toBe('daniel');
      expect(resolveOrpheusVoice('invalid_voice')).toBe('troy');
    });

    it('detects single and comma-separated gsk_ keys and rotates past keys on cooldown', () => {
      expect(resolveGroqApiKey('gsk_test123456789')).toBe('gsk_test123456789');

      const keys = resolveGroqApiKeys('gsk_primaryKey111, gsk_fallbackKey222');
      expect(keys.slice(0, 2)).toEqual(['gsk_primaryKey111', 'gsk_fallbackKey222']);

      // Put primary key on cooldown -> fallback key becomes primary immediately
      markGroqKeyCooldown('gsk_primaryKey111', 30_000);
      expect(resolveGroqApiKey('gsk_primaryKey111, gsk_fallbackKey222')).toBe('gsk_fallbackKey222');
    });

    it('automatically fails over to Key 2 with zero delay when Key 1 returns 429', async () => {
      const usedAuthHeaders: string[] = [];
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init: any) => {
        const auth = init?.headers?.Authorization || '';
        usedAuthHeaders.push(auth);
        if (auth === 'Bearer gsk_keyOneRateLimited') {
          return new Response('Rate limit reached. Please try again in 45s.', {
            status: 429,
            headers: { 'retry-after': '45' },
          });
        }
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"isCorrect": true}' } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });

      const res = await callGroqChatCompletion({
        apiKey: ['gsk_keyOneRateLimited', 'gsk_keyTwoHealthy'],
        prompt: 'Verify sentence.',
      });

      expect(res.text).toBe('{"isCorrect": true}');
      expect(usedAuthHeaders).toEqual([
        'Bearer gsk_keyOneRateLimited',
        'Bearer gsk_keyTwoHealthy',
      ]);
    });
  });
});

