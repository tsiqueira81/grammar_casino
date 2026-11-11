// The winner's ceremony (package V9). Game over plays as a short sequence: "The vault opens",
// third place, second place, the winner (fanfare and coin shower), then the class result.
// Calm mode and reduced motion skip straight to the end; the teacher can skip it too.

/** 0 vault opens, 1 third place, 2 second place, 3 the winner, 4 the class result. */
export type CeremonyStage = 0 | 1 | 2 | 3 | 4;
export const CEREMONY_DONE: CeremonyStage = 4;

/** How long each stage lasts before the next one, in milliseconds. */
export const STAGE_MS: readonly number[] = [1200, 1000, 1200, 1200];

/**
 * When stages 1 to 4 start, in milliseconds from the start of game over. A podium with fewer
 * than three players skips the empty places, so a two-player game reaches the winner sooner.
 */
export function ceremonyTimes(podiumSize: number): number[] {
  const durations = STAGE_MS.map((ms, i) => {
    if (i === 1 && podiumSize < 3) return 0; // no third place to show
    if (i === 2 && podiumSize < 2) return 0; // no second place to show
    return ms;
  });
  let at = 0;
  return durations.map((ms) => (at += ms));
}

export type CeremonyCue = 'drumroll' | 'step' | 'winner' | null;

/** The sound each stage starts with (the sound engine already respects Calm mode and mute). */
export function cueForStage(stage: CeremonyStage, podiumSize: number): CeremonyCue {
  if (stage === 0) return 'drumroll';
  if (stage === 1) return podiumSize >= 3 ? 'step' : null;
  if (stage === 2) return podiumSize >= 2 ? 'step' : null;
  if (stage === 3) return 'winner';
  return null;
}

/** Is the podium place (1, 2 or 3) shown yet at this stage? */
export function placeShown(place: number, stage: CeremonyStage): boolean {
  if (place === 3) return stage >= 1;
  if (place === 2) return stage >= 2;
  return stage >= 3;
}

export interface MomentPlace {
  place: number;
  name: string;
  money: number;
}

/**
 * Draws the podium for "Save this moment": a plain picture with nicknames, money and the class
 * result line, nothing else. Returns a PNG data URL, or null when there is no canvas.
 */
export function drawMoment(places: MomentPlace[], title: string, line: string, doc: Document = document): string | null {
  const canvas = doc.createElement('canvas');
  const W = 1200;
  const H = 675;
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  if (!g) return null;
  const felt = g.createRadialGradient(W / 2, H * 0.45, 60, W / 2, H / 2, W * 0.7);
  felt.addColorStop(0, '#1f6b4a');
  felt.addColorStop(1, '#0b2d20');
  g.fillStyle = felt;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#e2b04a';
  g.lineWidth = 6;
  g.strokeRect(18, 18, W - 36, H - 36);

  g.textAlign = 'center';
  g.fillStyle = '#f1cf72';
  g.font = '600 56px Georgia, serif';
  g.fillText(fit(g, title, W - 120), W / 2, 105);

  const slots: Record<number, { x: number; h: number }> = { 2: { x: W / 2 - 300, h: 170 }, 1: { x: W / 2, h: 240 }, 3: { x: W / 2 + 300, h: 120 } };
  const base = H - 120;
  places.forEach((p) => {
    const s = slots[p.place];
    if (!s) return;
    g.fillStyle = p.place === 1 ? 'rgba(241,207,114,0.35)' : 'rgba(255,255,255,0.12)';
    g.fillRect(s.x - 120, base - s.h, 240, s.h);
    g.fillStyle = p.place === 1 ? '#f1cf72' : '#e7e2d4';
    g.font = '800 64px system-ui, sans-serif';
    g.fillText(String(p.place), s.x, base - s.h + 70);
    g.fillStyle = '#fffdf7';
    g.font = `700 ${p.place === 1 ? 40 : 32}px system-ui, sans-serif`;
    g.fillText(fit(g, p.name, 280), s.x, base - s.h - 52);
    g.fillStyle = '#86efac';
    g.font = '700 28px system-ui, sans-serif';
    g.fillText(`$${p.money.toLocaleString('en-US')}`, s.x, base - s.h - 16);
  });

  if (line) {
    g.fillStyle = '#fffdf7';
    g.font = '500 28px system-ui, sans-serif';
    g.fillText(fit(g, line, W - 120), W / 2, H - 58);
  }
  try {
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

function fit(g: CanvasRenderingContext2D, text: string, max: number): string {
  if (g.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && g.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}
