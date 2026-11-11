// Package V8: themes that change the room. Each sentence theme gives the table its own felt, the
// colour of the lamp over it, the colour of the sparks and the key the music plays in.

export interface StageLook {
  /** Felt colour (0-255 RGB), or null for the classic green felt. */
  felt: [number, number, number] | null;
  /** The key light over the table. */
  lamp: number;
  /** Spark colours for chips, sweeps and wins. */
  sparks: number[];
  /** Music key, in semitones from F major. */
  musicKey: number;
}

export const CLASSIC_LOOK: StageLook = {
  felt: null,
  lamp: 0xfff3d1,
  sparks: [0xffd56b, 0xfff1c1, 0xffb347, 0xffffff],
  musicKey: 0,
};

export const STAGE_LOOKS: Record<string, StageLook> = {
  Fantasy: { felt: null, lamp: 0xffe2b0, sparks: [0xffd56b, 0xc084fc, 0xfff1c1, 0xffffff], musicKey: 0 },
  'Sci-Fi': { felt: [22, 64, 112], lamp: 0xd6ecff, sparks: [0x67e8f9, 0xe879f9, 0xa5f3fc, 0xffffff], musicKey: 2 },
  History: { felt: [112, 30, 40], lamp: 0xffd9a0, sparks: [0xfcd34d, 0xf59e0b, 0xfff1c1, 0xffffff], musicKey: -2 },
  'Everyday Life': { felt: [62, 102, 80], lamp: 0xfff0d6, sparks: [0xfde68a, 0xfca5a5, 0xfff7ed, 0xffffff], musicKey: 5 },
  Business: { felt: [30, 50, 90], lamp: 0xf4f6ff, sparks: [0xe5e7eb, 0xfcd34d, 0xcbd5e1, 0xffffff], musicKey: -3 },
  Technology: { felt: [22, 82, 86], lamp: 0xe0fbff, sparks: [0x5eead4, 0x93c5fd, 0xccfbf1, 0xffffff], musicKey: 4 },
  'Pop Culture': { felt: [100, 34, 92], lamp: 0xffe4f2, sparks: [0xf472b6, 0xfde047, 0x60a5fa, 0xffffff], musicKey: 7 },
};

/** The look for a theme setting such as "Sci-Fi 🚀"; Custom and anything unknown get the classic look. */
export function lookForTheme(theme: string | undefined | null): StageLook {
  const name = (theme ?? '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim();
  return STAGE_LOOKS[name] ?? CLASSIC_LOOK;
}

/**
 * Recolours felt pixels (RGBA, in place): each pixel keeps its brightness relative to the
 * texture's average, so the weave stays, and takes the new colour.
 */
export function recolorPixels(data: Uint8ClampedArray, rgb: [number, number, number]): void {
  let total = 0;
  const n = data.length / 4;
  if (n === 0) return;
  for (let i = 0; i < data.length; i += 4) total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  const mean = total / n || 1;
  for (let i = 0; i < data.length; i += 4) {
    const k = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / mean;
    data[i] = Math.min(255, rgb[0] * k);
    data[i + 1] = Math.min(255, rgb[1] * k);
    data[i + 2] = Math.min(255, rgb[2] * k);
  }
}
