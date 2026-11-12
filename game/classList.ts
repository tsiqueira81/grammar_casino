// Package T4: a lobby built for a class. When a saved class is loaded and a room is open, a phone
// that joins with a name from the list takes that student's place (money, streak and avatar
// kept), so the teacher sees who is still missing instead of getting "Ana" and "Ana 2".

/** "Ana", " ana ", "Aná" all match. */
export function nameKey(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * The index of the listed student a joining phone should take: the one player not yet on a phone
 * whose name matches. -1 when there is none, or when two listed students share the name.
 */
export function classListMatch(players: { id: number; name: string }[], seatedIds: Iterable<number>, joinName: string): number {
  const seated = new Set(seatedIds);
  const key = nameKey(joinName);
  if (!key) return -1;
  const hits: number[] = [];
  players.forEach((p, i) => {
    if (!seated.has(p.id) && nameKey(p.name) === key) hits.push(i);
  });
  return hits.length === 1 ? hits[0] : -1;
}

/** Who on the list has not joined from a phone yet. */
export function missingFromClass<T extends { id: number }>(players: T[], seatedIds: Iterable<number>): T[] {
  const seated = new Set(seatedIds);
  return players.filter((p) => !seated.has(p.id));
}

/** Short tips the projector rotates while students join. */
export const LOBBY_TIPS = [
  'Since or for? Since + a point in time (since 2019), for + a length of time (for three years).',
  'Third person -s: he plays, she watches, it rains.',
  'Make, not do, for most things you create: make a cake, make a mistake, make a plan.',
  'Second conditional: if + past simple, would + base form. If I had time, I would travel.',
  'Already and yet: I have already eaten. Have you eaten yet?',
  'Much for things you cannot count (much water), many for things you can (many books).',
  'The present perfect links the past to now: I have lived here for ten years.',
  'Adjective order: opinion, size, age, colour. A lovely big old red bus.',
];

export const LOBBY_TIP_MS = 9000;

export function lobbyTipAt(elapsedMs: number): string {
  const i = Math.floor(Math.max(0, elapsedMs) / LOBBY_TIP_MS) % LOBBY_TIPS.length;
  return LOBBY_TIPS[i];
}
