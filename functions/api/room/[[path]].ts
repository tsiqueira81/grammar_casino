// Package R4 stage A: /api/room/* goes to the live-room Worker (room-worker/), including the
// WebSocket upgrade, through the ROOM_WORKER service binding. Same origin as the game, so phones
// on a school network reach it like the game itself. Without the binding (not deployed yet), the
// game sees a plain 404 and keeps using Firestore.
export const onRequest = async (context: { request: Request; env: Record<string, any> }) => {
  const worker = context.env.ROOM_WORKER;
  if (!worker || typeof worker.fetch !== 'function') {
    return new Response(JSON.stringify({ error: 'rooms-not-available' }), {
      status: 404,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }
  try {
    return await worker.fetch(context.request);
  } catch {
    return new Response(JSON.stringify({ error: 'rooms-not-available' }), {
      status: 503,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }
};
