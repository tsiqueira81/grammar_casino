import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CHARACTER_AVATARS, AVATAR_FLAIRS } from '../utils/characterAvatars';

const DIR = path.resolve(__dirname, '..', 'public', 'avatars3d');

/** WebP header: "RIFF" .... "WEBP", then the VP8X/VP8L chunk. Width/height read from VP8X (alpha files). */
function webpSize(file: string): { w: number; h: number } {
  const b = fs.readFileSync(file);
  expect(b.toString('ascii', 0, 4)).toBe('RIFF');
  expect(b.toString('ascii', 8, 12)).toBe('WEBP');
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  }
  if (chunk === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  throw new Error(`unexpected WebP chunk ${chunk} in ${file}`);
}

describe('3D character sprites (scripts/assets/build_avatars.py)', () => {
  it('has a 4-frame strip in both sizes for every character', () => {
    for (const ch of CHARACTER_AVATARS) {
      const big = path.join(DIR, `${ch.id}.webp`);
      const small = path.join(DIR, 's', `${ch.id}.webp`);
      expect(fs.existsSync(big), big).toBe(true);
      expect(fs.existsSync(small), small).toBe(true);
      expect(webpSize(big)).toEqual({ w: 1024, h: 256 });
      expect(webpSize(small)).toEqual({ w: 512, h: 128 });
      // Phones download these: keep each one small.
      expect(fs.statSync(big).size).toBeLessThan(40_000);
      expect(fs.statSync(small).size).toBeLessThan(20_000);
    }
  });

  it('has an overlay in both sizes for every hat or accessory', () => {
    for (const f of AVATAR_FLAIRS) {
      if (f.id === 'none') continue;
      expect(webpSize(path.join(DIR, `flair_${f.id}.webp`))).toEqual({ w: 256, h: 256 });
      expect(webpSize(path.join(DIR, 's', `flair_${f.id}.webp`))).toEqual({ w: 128, h: 128 });
    }
  });
});
