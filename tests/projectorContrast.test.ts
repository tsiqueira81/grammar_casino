import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Package V10: on a washed-out projector every text colour in the projector theme must reach
// WCAG AAA (7:1) against every surface it sits on.
const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');

function tokens(selector: string): Record<string, number[]> {
  const start = css.indexOf(`${selector} {`);
  const block = css.slice(start, css.indexOf('}', start));
  const out: Record<string, number[]> = {};
  for (const m of block.matchAll(/--gc-([\w-]+):\s*(\d+) (\d+) (\d+);/g)) out[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
  return out;
}

const luminance = (rgb: number[]) => {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: number[], b: number[]) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const TEXT = ['ink', 'quiet', 'gold', 'money', 'win', 'loss', 'info', 'danger'];
const SURFACES = ['bg', 'card', 'raised'];

describe('projector theme contrast (package V10)', () => {
  for (const selector of ['html.projector:not(.dark)', 'html.projector.dark']) {
    it(`${selector}: every text colour is AAA on every surface`, () => {
      const t = tokens(selector);
      const low: string[] = [];
      for (const fg of TEXT) for (const bg of SURFACES) if (contrast(t[fg], t[bg]) < 7) low.push(`${fg} on ${bg}: ${contrast(t[fg], t[bg]).toFixed(2)}`);
      expect(low).toEqual([]);
      expect(contrast(t['on-gold'], t.gold)).toBeGreaterThanOrEqual(7); // the main button
    });
  }
});
