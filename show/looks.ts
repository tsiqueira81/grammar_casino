// Package V8: themes that change the room. Each sentence theme gives the chips' sparks their own
// colours and the music its own key. (The felt and lamp colours went with the 3D table room.)

export interface StageLook {
  /** Spark colours for chips, sweeps and wins. */
  sparks: number[];
  /** Music key, in semitones from F major. */
  musicKey: number;
}

export const CLASSIC_LOOK: StageLook = {
  sparks: [0xffd56b, 0xfff1c1, 0xffb347, 0xffffff],
  musicKey: 0,
};

export const STAGE_LOOKS: Record<string, StageLook> = {
  Fantasy: { sparks: [0xffd56b, 0xc084fc, 0xfff1c1, 0xffffff], musicKey: 0 },
  'Sci-Fi': { sparks: [0x67e8f9, 0xe879f9, 0xa5f3fc, 0xffffff], musicKey: 2 },
  History: { sparks: [0xfcd34d, 0xf59e0b, 0xfff1c1, 0xffffff], musicKey: -2 },
  'Everyday Life': { sparks: [0xfde68a, 0xfca5a5, 0xfff7ed, 0xffffff], musicKey: 5 },
  Business: { sparks: [0xe5e7eb, 0xfcd34d, 0xcbd5e1, 0xffffff], musicKey: -3 },
  Technology: { sparks: [0x5eead4, 0x93c5fd, 0xccfbf1, 0xffffff], musicKey: 4 },
  'Pop Culture': { sparks: [0xf472b6, 0xfde047, 0x60a5fa, 0xffffff], musicKey: 7 },
};

/** The look for a theme setting such as "Sci-Fi 🚀"; Custom and anything unknown get the classic look. */
export function lookForTheme(theme: string | undefined | null): StageLook {
  const name = (theme ?? '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim();
  return STAGE_LOOKS[name] ?? CLASSIC_LOOK;
}
