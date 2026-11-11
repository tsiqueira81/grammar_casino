import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Package S7: the game can be installed on a phone or computer, with its own icons.
const root = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('public/manifest.webmanifest', root), 'utf8'));
const html = readFileSync(new URL('index.html', root), 'utf8');

const pngSize = (path: string) => {
  const b = readFileSync(new URL(`public${path}`, root));
  expect(b.subarray(1, 4).toString()).toBe('PNG');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

describe('installable app (package S7)', () => {
  it('has a manifest with a name, standalone display and the icon sizes stores ask for', () => {
    expect(manifest.name).toBe('Grammar Casino');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(manifest.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true);
  });

  it('ships every icon at the size it claims', () => {
    for (const icon of manifest.icons) {
      const [w, h] = pngSize(icon.src);
      expect(`${w}x${h}`).toBe(icon.sizes);
    }
    expect(pngSize('/icons/apple-touch-icon.png')).toEqual([180, 180]);
    expect(pngSize('/icons/og-image.png')).toEqual([1200, 630]);
  });

  it('links the manifest, the icons and the share image from the page', () => {
    for (const ref of ['/manifest.webmanifest', '/icons/apple-touch-icon.png', '/icons/favicon-32.png', '/icons/og-image.png']) {
      expect(html).toContain(ref);
      expect(existsSync(new URL(`public${ref}`, root))).toBe(true);
    }
    expect(html).toContain('name="theme-color"');
  });
});
