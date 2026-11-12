// Package R4: what a phone makes of the two records it receives (the shared room record and its
// own seat record), the same for every transport (Firestore today, the Cloudflare room next).
import { PlayerViewPayload, mergePlayerView } from '../utils/multiplayerProtocol';
import type { FirestoreJoinResponseItem, FirestoreSeatUpdate } from './firebaseService';

/**
 * Returns a function that turns the latest room and seat records into a seat update. The view is
 * given only when both halves belong to the same write (the seat's rev matches the room's), so a
 * phone never shows the new table with its old private part.
 */
export function createSeatMerger(): (room: any | null, seat: any | null) => FirestoreSeatUpdate {
  let tableJson = '';
  let table: Partial<PlayerViewPayload> = {};
  let ownViewJson = '';
  let ownView: Partial<PlayerViewPayload> | null = null;
  return (room, seat) => {
    if (room && typeof room.tableJson === 'string' && room.tableJson !== tableJson) {
      tableJson = room.tableJson;
      try {
        table = JSON.parse(tableJson) || {};
      } catch {
        table = {};
      }
    }
    const seatViewJson = seat && typeof seat.viewJson === 'string' ? seat.viewJson : '';
    if (seatViewJson !== ownViewJson) {
      ownViewJson = seatViewJson;
      try {
        ownView = seatViewJson ? JSON.parse(seatViewJson) : null;
      } catch {
        ownView = null;
      }
    }
    let join: FirestoreJoinResponseItem | null = null;
    if (seat && typeof seat.joinJson === 'string' && seat.joinJson) {
      try {
        join = JSON.parse(seat.joinJson);
      } catch {}
    }
    const playerId = seat && typeof seat.playerId === 'number' ? seat.playerId : null;
    const seatRev = seat && typeof seat.rev === 'number' ? seat.rev : null;
    const tableSeatRev =
      room && room.seatRevs && playerId !== null ? room.seatRevs[String(playerId)] : undefined;
    const inStep = room && ownView && playerId !== null && seatRev !== null && tableSeatRev === seatRev;
    return {
      join,
      playerId,
      view: inStep ? mergePlayerView(table, ownView as Partial<PlayerViewPayload>) : null,
      kicked: Boolean(seat?.kicked),
      kickedPlayerIds: room && Array.isArray(room.kickedPlayerIds) ? room.kickedPlayerIds : [],
    };
  };
}
