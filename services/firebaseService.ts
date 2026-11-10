import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInAnonymously,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  CEFRLevel,
  GeneratedSentence,
  Player,
  QuestionType,
  RoundHistoryRecord,
  Settings,
} from '../types';
import { getBuiltInCuratedSentencesForCloudSeed } from './fallbackSentences';
import { PlayerViewPayload, mergePlayerView } from '../utils/multiplayerProtocol';

// Initialize Firebase App singleton
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Local testing only: start the dev server with VITE_FIREBASE_EMULATORS=1 to use the Firebase
// Auth and Firestore emulators (ports 9099 and 8080) instead of the real project.
if ((import.meta as any).env?.VITE_FIREBASE_EMULATORS === '1') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const VERIFIED_TEACHER_EMAIL = 'teacher.siqueira@gmail.com';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): void {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) || [],
    },
    operationType,
    path,
  };
  console.warn('Firestore Operation Notice:', JSON.stringify(errInfo));
}

// ============================================================================
// 1. Teacher Google Authentication
// ============================================================================

export function isVerifiedTeacherUser(user: User | null | undefined): boolean {
  if (!user || !user.email) return false;
  return user.email.trim().toLowerCase() === VERIFIED_TEACHER_EMAIL;
}

export async function signInTeacherWithGoogle(): Promise<{
  ok: boolean;
  user?: User;
  isVerifiedTeacher?: boolean;
  idToken?: string;
  error?: string;
}> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    const isVerified = isVerifiedTeacherUser(user);
    const idToken = await user.getIdToken();
    return {
      ok: true,
      user,
      isVerifiedTeacher: isVerified,
      idToken,
    };
  } catch (err: any) {
    const code = String(err?.code || '');
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      return { ok: false, error: 'Google Sign-In popup was closed.' };
    }
    if (code === 'auth/unauthorized-domain') {
      const host = typeof window !== 'undefined' ? window.location.hostname : 'this domain';
      return {
        ok: false,
        error: `This domain (${host}) is not yet authorized in Firebase Authentication. Add "${host}" in Firebase Console → Authentication → Settings → Authorized domains (project: ${firebaseConfig.projectId}).`,
      };
    }
    return {
      ok: false,
      error: err?.message || 'Google Sign-In failed.',
    };
  }
}

export async function signOutTeacherGoogle(): Promise<void> {
  try {
    await signOut(auth);
  } catch (err) {
    console.warn('Failed to sign out of Google:', err);
  }
}

export function subscribeToAuthChanges(callback: (user: User | null) => void): Unsubscribe {
  return onAuthStateChanged(auth, callback);
}

// Live rooms need every device to have a Firebase identity, so the Firestore rules can tell
// the host apart from the students. The teacher keeps their Google sign-in; everyone else
// gets a silent anonymous one (no account, no prompt). If that fails (offline, or Anonymous
// sign-in is switched off in the Firebase console) we return null and the room carries on
// over its other relays.
const ANON_SIGN_IN_RETRY_MS = 60_000;
let pendingAnonSignIn: Promise<User | null> | null = null;
let lastAnonSignInFailureAt = 0;

export async function ensureFirebaseUser(): Promise<User | null> {
  try {
    await auth.authStateReady();
  } catch {}
  if (auth.currentUser) return auth.currentUser;
  if (Date.now() - lastAnonSignInFailureAt < ANON_SIGN_IN_RETRY_MS) return null;
  if (!pendingAnonSignIn) {
    pendingAnonSignIn = signInAnonymously(auth)
      .then((cred) => cred.user)
      .catch((err) => {
        lastAnonSignInFailureAt = Date.now();
        console.warn('Firebase anonymous sign-in failed; live rooms will use the other relays.', err?.code || err);
        return null;
      })
      .finally(() => {
        pendingAnonSignIn = null;
      });
  }
  return pendingAnonSignIn;
}

// ============================================================================
// 2. Feature A — Firestore Live Classroom Relay (QR multiplayer on any host)
// ============================================================================
//
// rooms/{code}                    The shared table: what every student's phone shows anyway
//                                 (round, sentence, names and money, revealed results).
//                                 Never bets, hints or power-ups. Anyone with the code can read it.
// rooms/{code}/seats/{clientId}   One private record per phone: that student's own part of the
//                                 view (their bet, hints, power-ups) and the answer to their join
//                                 request. Only that phone's Firebase id and the host can read it.
// rooms/{code}/intents/{clientId} What each phone sends the host (join requests, bets).
//                                 Only the host can read them.
//
// The host writes the table and every changed seat record in one batch, and stamps them with
// a revision number (`rev`). The table lists the revision of each player's latest seat record
// (`seatRevs`), so a phone only shows a view once both halves come from the same update.

export interface FirestoreJoinResponseItem {
  ok: boolean;
  code: string;
  requestId: string;
  /** The teacher has to approve this phone before it gets the seat. */
  pending?: boolean;
  seat?: {
    seatId: string;
    playerId: number;
    name: string;
    avatar: string;
    connected: boolean;
    lockedIn: boolean;
    lastSeen: number;
  };
  error?: string;
}

export interface FirestoreSeatWrite {
  clientId: string;
  uid: string;
  playerId: number | null;
  view: Partial<PlayerViewPayload> | null;
  join: FirestoreJoinResponseItem | null;
  kicked: boolean;
}

export async function writeFirestoreRoom(params: {
  code: string;
  locked: boolean;
  rev: number;
  table: Partial<PlayerViewPayload>;
  seatRevs: Record<number, number>;
  kickedPlayerIds: number[];
  seats: FirestoreSeatWrite[];
}): Promise<boolean> {
  const cleanCode = params.code.trim().toUpperCase();
  const path = `rooms/${cleanCode}`;
  try {
    const user = await ensureFirebaseUser();
    const now = Date.now();
    const seatRevs: Record<string, number> = {};
    Object.entries(params.seatRevs || {}).forEach(([pid, rev]) => {
      seatRevs[String(pid)] = rev;
    });

    const batch = writeBatch(db);
    batch.set(doc(db, 'rooms', cleanCode), {
      code: cleanCode,
      locked: Boolean(params.locked),
      rev: params.rev,
      tableJson: JSON.stringify(params.table || {}),
      seatRevs,
      kickedPlayerIds: params.kickedPlayerIds || [],
      updatedAt: now,
      // The rules only let this device change the room (and write its seats) again later.
      ...(user ? { hostUid: user.uid } : {}),
    });
    for (const seat of params.seats) {
      batch.set(doc(db, 'rooms', cleanCode, 'seats', seat.clientId), {
        clientId: seat.clientId,
        // Only the phone signed in with this Firebase id (and the host) can read the record.
        uid: seat.uid,
        playerId: seat.playerId ?? null,
        viewJson: seat.view ? JSON.stringify(seat.view) : '',
        joinJson: seat.join ? JSON.stringify(seat.join) : '',
        kicked: Boolean(seat.kicked),
        rev: params.rev,
        updatedAt: now,
      });
    }
    await batch.commit();
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    return false;
  }
}

/**
 * Whether this device may host a room under this code: nobody has it, its host is this
 * device, or it was left over from an earlier class (the rules then allow a takeover).
 * If Firestore cannot be reached the code is treated as free; the lesson must not stall.
 */
export async function isFirestoreRoomCodeFree(code: string): Promise<boolean> {
  const cleanCode = code.trim().toUpperCase();
  try {
    const user = await ensureFirebaseUser();
    // Opening the room must stay quick even on a slow school network.
    const snap = await Promise.race([
      getDoc(doc(db, 'rooms', cleanCode)),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
    ]);
    if (!snap || !snap.exists()) return true;
    const data = snap.data() || {};
    if (!data.hostUid || (user && data.hostUid === user.uid)) return true;
    return typeof data.updatedAt !== 'number' || data.updatedAt < Date.now() - 6 * 60 * 60 * 1000;
  } catch {
    return true;
  }
}

export async function deleteFirestoreRoom(
  code: string,
  extra: { seatClientIds?: string[]; intentClientIds?: string[] } = {}
): Promise<void> {
  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode) return;
  const path = `rooms/${cleanCode}`;
  try {
    await ensureFirebaseUser();
    // Seats and intents first, while the room (and its host id) still exists for the rules.
    const childRefs = [
      ...(extra.seatClientIds || []).map((id) => doc(db, 'rooms', cleanCode, 'seats', id)),
      ...(extra.intentClientIds || []).map((id) => doc(db, 'rooms', cleanCode, 'intents', id)),
    ];
    for (let i = 0; i < childRefs.length; i += 400) {
      const batch = writeBatch(db);
      childRefs.slice(i, i + 400).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
    await deleteDoc(doc(db, 'rooms', cleanCode));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export function listenToFirestoreRoomIntents(
  code: string,
  onIntentMessage: (clientId: string, payload: any, uid: string | null) => void,
  onConnectionState?: (connected: boolean) => void
): Unsubscribe {
  const cleanCode = code.trim().toUpperCase();
  const path = `rooms/${cleanCode}/intents`;
  const intentsCol = collection(db, 'rooms', cleanCode, 'intents');

  // Only the room's host may read intents, so sign in before listening.
  let unsubscribe: Unsubscribe | null = null;
  let cancelled = false;
  void ensureFirebaseUser().then(() => {
    if (cancelled) return;
    unsubscribe = attach();
  });
  return () => {
    cancelled = true;
    unsubscribe?.();
  };

  function attach(): Unsubscribe {
    return onSnapshot(
      intentsCol,
      (snapshot) => {
        onConnectionState?.(true);
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added' || change.type === 'modified') {
            const data = change.doc.data();
            if (data && typeof data.payloadJson === 'string') {
              try {
                const parsed = JSON.parse(data.payloadJson);
                // The rules make `uid` the writer's own Firebase id, so the host can trust it.
                const uid = typeof data.uid === 'string' && data.uid ? data.uid : null;
                onIntentMessage(change.doc.id, parsed, uid);
              } catch {}
            }
          }
        });
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, path);
        onConnectionState?.(false);
      }
    );
  }
}

export async function sendFirestoreStudentIntent(
  code: string,
  clientId: string,
  type: 'JOIN_REQUEST' | 'STUDENT_INTENT',
  payload: Record<string, any>
): Promise<boolean> {
  const cleanCode = code.trim().toUpperCase();
  const path = `rooms/${cleanCode}/intents/${clientId}`;
  try {
    const user = await ensureFirebaseUser();
    await setDoc(doc(db, 'rooms', cleanCode, 'intents', clientId), {
      clientId,
      // The rules only let this device overwrite this intent, and only the host can read it.
      ...(user ? { uid: user.uid } : {}),
      type,
      payloadJson: JSON.stringify(payload),
      updatedAt: Date.now(),
    });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    return false;
  }
}

export interface FirestoreSeatUpdate {
  /** The host's answer to this phone's join request, if any. */
  join: FirestoreJoinResponseItem | null;
  /** The player this seat record belongs to, once the host has given it one. */
  playerId: number | null;
  /** The full view (shared table + this phone's private part), only when both halves match. */
  view: PlayerViewPayload | null;
  /** The host removed this phone (kicked, or the seat moved to another phone). */
  kicked: boolean;
  kickedPlayerIds: number[];
}

export interface FirestoreSeatListener {
  /** Route updates to new handlers; the latest update (if any) is replayed straight away. */
  setHandlers(
    onUpdate: (update: FirestoreSeatUpdate) => void,
    onConnectionState?: (connected: boolean) => void
  ): void;
  unsubscribe(): void;
}

/**
 * A student phone's view of the room: the shared table plus its own private seat record.
 * Signs the phone in (anonymously) first, because the seat record is readable only by the
 * Firebase id the host addressed it to.
 */
export function listenToFirestoreSeat(code: string, clientId: string): FirestoreSeatListener {
  const cleanCode = code.trim().toUpperCase();
  const roomRef = doc(db, 'rooms', cleanCode);
  const seatRef = doc(db, 'rooms', cleanCode, 'seats', clientId);

  let onUpdate: ((update: FirestoreSeatUpdate) => void) | null = null;
  let onConnection: ((connected: boolean) => void) | null = null;
  let lastUpdate: FirestoreSeatUpdate | null = null;
  let lastConnected: boolean | null = null;

  let room: any = null;
  let seat: any = null;
  let tableJson = '';
  let table: Partial<PlayerViewPayload> = {};
  let ownViewJson = '';
  let ownView: Partial<PlayerViewPayload> | null = null;
  let roomOk = false;
  let seatOk = false;

  const unsubs: Unsubscribe[] = [];
  let cancelled = false;

  const setConnected = (connected: boolean) => {
    lastConnected = connected;
    onConnection?.(connected);
  };

  const emit = () => {
    if (cancelled) return;
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

    lastUpdate = {
      join,
      playerId,
      view: inStep ? mergePlayerView(table, ownView as Partial<PlayerViewPayload>) : null,
      kicked: Boolean(seat?.kicked),
      kickedPlayerIds: room && Array.isArray(room.kickedPlayerIds) ? room.kickedPlayerIds : [],
    };
    onUpdate?.(lastUpdate);
  };

  void ensureFirebaseUser().then((user) => {
    if (cancelled) return;
    if (!user) {
      setConnected(false);
      return;
    }
    unsubs.push(
      onSnapshot(
        roomRef,
        (snap) => {
          room = snap.exists() ? snap.data() : null;
          roomOk = true;
          if (seatOk) setConnected(true);
          emit();
        },
        (err) => {
          roomOk = false;
          handleFirestoreError(err, OperationType.GET, `rooms/${cleanCode}`);
          setConnected(false);
        }
      )
    );
    unsubs.push(
      onSnapshot(
        seatRef,
        (snap) => {
          seat = snap.exists() ? snap.data() : null;
          seatOk = true;
          if (roomOk) setConnected(true);
          emit();
        },
        (err) => {
          seatOk = false;
          handleFirestoreError(err, OperationType.GET, `rooms/${cleanCode}/seats/${clientId}`);
          setConnected(false);
        }
      )
    );
  });

  return {
    setHandlers(nextOnUpdate, nextOnConnection) {
      onUpdate = nextOnUpdate;
      onConnection = nextOnConnection || null;
      if (lastConnected !== null) onConnection?.(lastConnected);
      if (lastUpdate) onUpdate(lastUpdate);
    },
    unsubscribe() {
      cancelled = true;
      onUpdate = null;
      onConnection = null;
      unsubs.forEach((u) => {
        try {
          u();
        } catch {}
      });
    },
  };
}

// ============================================================================
// 3. Feature B — Cloud Classroom Rosters & Session Reports
// ============================================================================

export interface CloudRosterPlayer {
  id: number;
  name: string;
  avatar: string;
  money: number;
  winStreak: number;
}

export interface CloudRoster {
  id: string;
  name: string;
  notes: string;
  startingCash: number;
  players: CloudRosterPlayer[];
  playerCount: number;
  updatedBy?: string;
  createdAt: number;
  updatedAt: number;
}

export async function listCloudRosters(): Promise<CloudRoster[]> {
  const path = 'rosters';
  try {
    const q = query(collection(db, 'rosters'), orderBy('updatedAt', 'desc'), limit(50));
    const snap = await getDocs(q);
    const results: CloudRoster[] = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      let players: CloudRosterPlayer[] = [];
      try {
        players = JSON.parse(d.playersJson || '[]');
      } catch {}
      results.push({
        id: docSnap.id,
        name: String(d.name || 'Unnamed Roster'),
        notes: String(d.notes || ''),
        startingCash: Number(d.startingCash || 500),
        players,
        playerCount: Number(d.playerCount || players.length),
        updatedBy: d.updatedBy,
        createdAt: Number(d.createdAt || Date.now()),
        updatedAt: Number(d.updatedAt || Date.now()),
      });
    });
    return results;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return [];
  }
}

export async function saveCloudRoster(params: {
  id?: string;
  name: string;
  notes?: string;
  startingCash: number;
  players: Player[];
}): Promise<CloudRoster | null> {
  const now = Date.now();
  const rosterId =
    params.id ||
    `roster_${now}_${Math.random().toString(36).slice(2, 7)}`;
  const path = `rosters/${rosterId}`;

  const cleanPlayers: CloudRosterPlayer[] = params.players.map((p, idx) => ({
    id: p.id || idx + 1,
    name: p.name.trim(),
    avatar: p.avatar || '🦊',
    money: Math.max(0, Math.round(Number(p.money) || 0)),
    winStreak: Math.max(0, Number(p.winStreak) || 0),
  }));

  try {
    let createdAt = now;
    if (params.id) {
      const existing = await getDoc(doc(db, 'rosters', rosterId));
      if (existing.exists() && existing.data()?.createdAt) {
        createdAt = Number(existing.data()?.createdAt);
      }
    }

    const docData = {
      name: params.name.trim().slice(0, 100),
      notes: (params.notes || '').trim().slice(0, 200),
      startingCash: Math.max(1, Math.min(1000000, Math.round(params.startingCash || 500))),
      playersJson: JSON.stringify(cleanPlayers),
      playerCount: cleanPlayers.length,
      updatedBy: auth.currentUser?.email || 'Teacher PIN',
      createdAt,
      updatedAt: now,
    };

    await setDoc(doc(db, 'rosters', rosterId), docData);

    return {
      id: rosterId,
      name: docData.name,
      notes: docData.notes,
      startingCash: docData.startingCash,
      players: cleanPlayers,
      playerCount: cleanPlayers.length,
      updatedBy: docData.updatedBy,
      createdAt,
      updatedAt: now,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    return null;
  }
}

export async function deleteCloudRoster(rosterId: string): Promise<boolean> {
  const path = `rosters/${rosterId}`;
  try {
    await deleteDoc(doc(db, 'rosters', rosterId));
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
    return false;
  }
}

export interface CloudSessionReport {
  id: string;
  title: string;
  topic: string;
  level: string;
  theme: string;
  gameMode: string;
  roundsPlayed: number;
  playerCount: number;
  winnerName: string;
  winnerAvatar: string;
  winnerMoney: number;
  players: CloudRosterPlayer[];
  roundHistory: RoundHistoryRecord[];
  fullGameState?: any;
  createdAt: number;
}

export async function listCloudSessionReports(): Promise<CloudSessionReport[]> {
  const path = 'session_reports';
  try {
    const q = query(collection(db, 'session_reports'), orderBy('createdAt', 'desc'), limit(40));
    const snap = await getDocs(q);
    const reports: CloudSessionReport[] = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      let players: CloudRosterPlayer[] = [];
      let roundHistory: RoundHistoryRecord[] = [];
      let fullGameState: any = undefined;
      try {
        players = JSON.parse(d.playersJson || '[]');
      } catch {}
      try {
        roundHistory = JSON.parse(d.roundHistoryJson || '[]');
      } catch {}
      try {
        if (d.fullGameStateJson) {
          fullGameState = JSON.parse(d.fullGameStateJson);
        }
      } catch {}
      reports.push({
        id: docSnap.id,
        title: String(d.title || 'Classroom Session'),
        topic: String(d.topic || 'Mixed'),
        level: String(d.level || 'B1'),
        theme: String(d.theme || 'Classic'),
        gameMode: String(d.gameMode || 'rounds'),
        roundsPlayed: Number(d.roundsPlayed || roundHistory.length),
        playerCount: Number(d.playerCount || players.length),
        winnerName: String(d.winnerName || ''),
        winnerAvatar: String(d.winnerAvatar || '👑'),
        winnerMoney: Number(d.winnerMoney || 0),
        players,
        roundHistory,
        fullGameState,
        createdAt: Number(d.createdAt || Date.now()),
      });
    });
    return reports;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return [];
  }
}

export async function saveCloudSessionReport(params: {
  title?: string;
  topic: string;
  level: string;
  theme: string;
  gameMode: string;
  players: Player[];
  roundHistory: RoundHistoryRecord[];
  winner?: Player | null;
  fullGameState?: any;
}): Promise<CloudSessionReport | null> {
  const now = Date.now();
  const reportId = `session_${now}_${Math.random().toString(36).slice(2, 7)}`;
  const path = `session_reports/${reportId}`;

  const sortedPlayers = [...params.players].sort((a, b) => b.money - a.money);
  const topPlayer = params.winner || sortedPlayers[0] || null;

  const cleanPlayers: CloudRosterPlayer[] = params.players.map((p, idx) => ({
    id: p.id || idx + 1,
    name: p.name,
    avatar: p.avatar || '🦊',
    money: p.money,
    winStreak: p.winStreak || 0,
  }));

  const dateLabel = new Date(now).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  const defaultTitle = `${params.topic} (${params.level}) — ${dateLabel}`;
  const finalTitle = (params.title || defaultTitle).trim().slice(0, 150);

  try {
    const docData: Record<string, any> = {
      title: finalTitle,
      topic: (params.topic || 'Grammar').slice(0, 100),
      level: (params.level || 'B1').slice(0, 20),
      theme: (params.theme || 'Standard').slice(0, 100),
      gameMode: (params.gameMode || 'rounds').slice(0, 30),
      roundsPlayed: params.roundHistory.length,
      playerCount: cleanPlayers.length,
      winnerName: topPlayer ? topPlayer.name : 'House',
      winnerAvatar: topPlayer ? topPlayer.avatar : '🏛️',
      winnerMoney: topPlayer ? topPlayer.money : 0,
      playersJson: JSON.stringify(cleanPlayers),
      roundHistoryJson: JSON.stringify(params.roundHistory || []),
      createdAt: now,
    };

    if (params.fullGameState) {
      const stateStr = JSON.stringify(params.fullGameState);
      if (stateStr.length < 750000) {
        docData.fullGameStateJson = stateStr;
      }
    }

    await setDoc(doc(db, 'session_reports', reportId), docData);

    return {
      id: reportId,
      title: docData.title,
      topic: docData.topic,
      level: docData.level,
      theme: docData.theme,
      gameMode: docData.gameMode,
      roundsPlayed: docData.roundsPlayed,
      playerCount: docData.playerCount,
      winnerName: docData.winnerName,
      winnerAvatar: docData.winnerAvatar,
      winnerMoney: docData.winnerMoney,
      players: cleanPlayers,
      roundHistory: params.roundHistory,
      fullGameState: params.fullGameState,
      createdAt: now,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    return null;
  }
}

export async function deleteCloudSessionReport(reportId: string): Promise<boolean> {
  const path = `session_reports/${reportId}`;
  try {
    await deleteDoc(doc(db, 'session_reports', reportId));
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
    return false;
  }
}

// ============================================================================
// 4. Feature C — Auto-Growing Cloud Sentence Bank
// ============================================================================

export interface CloudCuratedSentence {
  id: string;
  topic: string;
  level: CEFRLevel;
  questionType: QuestionType;
  text: string;
  isCorrect: boolean;
  correction: string;
  explanation: string;
  grammarPhrase: string;
  errorPhrase?: string;
  mistakeType?: string;
  correctAnswer?: string;
  baseWord?: string;
  leadInSentence?: string;
  mark1Parts?: string[];
  mark2Parts?: string[];
  acceptedAnswers?: string[];
  options?: string[];
  subtype?: string;
  createdAt: number;
}

const CLOUD_SENTENCE_STORAGE_KEY = 'grammar_casino_cloud_sentences_v1';
const MAX_CACHED_CLOUD_SENTENCES = 2500;

export function computeSentenceFingerprintId(text: string, questionType: QuestionType): string {
  const normalized = `${questionType}:${text.trim().toLowerCase().replace(/\s+/g, ' ')}`;
  let h1 = 0xdeadbeef ^ normalized.length;
  let h2 = 0x41c6ce57 ^ normalized.length;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hashHex = (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
  return `sent_${questionType}_${hashHex}`;
}

export function loadCachedCloudSentences(): CloudCuratedSentence[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CLOUD_SENTENCE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCachedCloudSentences(sentences: CloudCuratedSentence[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      CLOUD_SENTENCE_STORAGE_KEY,
      JSON.stringify(sentences.slice(0, MAX_CACHED_CLOUD_SENTENCES))
    );
  } catch {}
}

function mapDocToCloudSentence(id: string, d: Record<string, any>): CloudCuratedSentence | null {
  if (!d || !d.text) return null;
  return {
    id,
    topic: String(d.topic || 'General'),
    level: (d.level as CEFRLevel) || 'B1',
    questionType: (d.questionType as QuestionType) || 'binary',
    text: String(d.text),
    isCorrect: Boolean(d.isCorrect),
    correction: String(d.correction || d.text),
    explanation: String(d.explanation || ''),
    grammarPhrase: String(d.grammarPhrase || ''),
    errorPhrase: d.errorPhrase ? String(d.errorPhrase) : '',
    mistakeType: d.mistakeType ? String(d.mistakeType) : '',
    correctAnswer: d.correctAnswer ? String(d.correctAnswer) : undefined,
    baseWord: d.baseWord ? String(d.baseWord) : undefined,
    leadInSentence: d.leadInSentence ? String(d.leadInSentence) : undefined,
    mark1Parts: Array.isArray(d.mark1Parts) ? d.mark1Parts : undefined,
    mark2Parts: Array.isArray(d.mark2Parts) ? d.mark2Parts : undefined,
    acceptedAnswers: Array.isArray(d.acceptedAnswers) ? d.acceptedAnswers : undefined,
    options: Array.isArray(d.options) ? d.options : undefined,
    subtype: d.subtype ? String(d.subtype) : undefined,
    createdAt: Number(d.createdAt || Date.now()),
  };
}

export async function syncCloudSentenceBank(options?: {
  forceFullSync?: boolean;
}): Promise<CloudCuratedSentence[]> {
  const path = 'curated_sentences';
  const cached = loadCachedCloudSentences();
  try {
    const latestCachedTimestamp =
      !options?.forceFullSync && cached.length > 0
        ? cached.reduce((max, item) => Math.max(max, Number(item.createdAt) || 0), 0)
        : 0;

    if (latestCachedTimestamp > 0) {
      // Incremental delta sync: only read documents created after our newest cached entry
      const deltaQuery = query(
        collection(db, 'curated_sentences'),
        where('createdAt', '>', latestCachedTimestamp),
        orderBy('createdAt', 'desc'),
        limit(500)
      );
      const snap = await getDocs(deltaQuery);
      if (snap.empty) {
        return cached;
      }
      const deltaItems: CloudCuratedSentence[] = [];
      snap.forEach((docSnap) => {
        const mapped = mapDocToCloudSentence(docSnap.id, docSnap.data());
        if (mapped) deltaItems.push(mapped);
      });
      const byId = new Map<string, CloudCuratedSentence>();
      for (const item of [...deltaItems, ...cached]) {
        if (!byId.has(item.id)) byId.set(item.id, item);
      }
      const merged = Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt);
      saveCachedCloudSentences(merged);
      return merged;
    }

    const fullQuery = query(
      collection(db, 'curated_sentences'),
      orderBy('createdAt', 'desc'),
      limit(1200)
    );
    const snap = await getDocs(fullQuery);
    const list: CloudCuratedSentence[] = [];
    snap.forEach((docSnap) => {
      const mapped = mapDocToCloudSentence(docSnap.id, docSnap.data());
      if (mapped) list.push(mapped);
    });
    saveCachedCloudSentences(list);
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return cached;
  }
}

export function getMissingBuiltInCloudSeedCount(
  currentCloudSentences: CloudCuratedSentence[]
): number {
  const existingIds = new Set(currentCloudSentences.map((s) => s.id));
  const builtIn = getBuiltInCuratedSentencesForCloudSeed();
  let missing = 0;
  for (const item of builtIn) {
    const id = computeSentenceFingerprintId(item.text, item.questionType);
    if (!existingIds.has(id)) missing++;
  }
  return missing;
}

export async function seedBuiltInBankToCloud(
  currentCloudSentences: CloudCuratedSentence[],
  onProgress?: (seededCount: number, totalToSeed: number) => void
): Promise<{
  ok: boolean;
  addedCount: number;
  totalCloudCount: number;
  updatedList: CloudCuratedSentence[];
  error?: string;
}> {
  if (!isVerifiedTeacherUser(auth.currentUser)) {
    return {
      ok: false,
      addedCount: 0,
      totalCloudCount: currentCloudSentences.length,
      updatedList: currentCloudSentences,
      error: `Sign in with ${VERIFIED_TEACHER_EMAIL} first to seed the Cloud Sentence Bank.`,
    };
  }

  const existingIds = new Set(currentCloudSentences.map((s) => s.id));
  const builtIn = getBuiltInCuratedSentencesForCloudSeed();
  const baseNow = Date.now();

  const toWrite: { id: string; payload: Record<string, any>; entry: CloudCuratedSentence }[] = [];

  builtIn.forEach((item, idx) => {
    const sentenceId = computeSentenceFingerprintId(item.text, item.questionType);
    if (existingIds.has(sentenceId)) return;
    existingIds.add(sentenceId);

    const createdAt = baseNow + idx;
    const entry: CloudCuratedSentence = {
      id: sentenceId,
      topic: (item.topic || 'General').slice(0, 100),
      level: item.level || 'B1',
      questionType: item.questionType,
      text: item.text.trim().slice(0, 1000),
      isCorrect: Boolean(item.isCorrect),
      correction: (item.correction || item.text).trim().slice(0, 1000),
      explanation: item.explanation.trim().slice(0, 2500),
      grammarPhrase: (item.grammarPhrase || '').trim().slice(0, 300),
      errorPhrase: (item.errorPhrase || '').trim().slice(0, 300),
      mistakeType: (item.mistakeType || '').trim().slice(0, 200),
      correctAnswer: item.correctAnswer,
      baseWord: item.baseWord,
      leadInSentence: item.leadInSentence,
      mark1Parts: item.mark1Parts,
      mark2Parts: item.mark2Parts,
      acceptedAnswers: item.acceptedAnswers,
      options: item.options,
      subtype: item.subtype,
      createdAt,
    };

    const firestorePayload: Record<string, any> = {
      topic: entry.topic,
      level: entry.level,
      questionType: entry.questionType,
      text: entry.text,
      isCorrect: entry.isCorrect,
      correction: entry.correction,
      explanation: entry.explanation,
      grammarPhrase: entry.grammarPhrase,
      errorPhrase: entry.errorPhrase || '',
      mistakeType: entry.mistakeType || '',
      createdAt: entry.createdAt,
    };
    if (entry.correctAnswer) firestorePayload.correctAnswer = entry.correctAnswer;
    if (entry.baseWord) firestorePayload.baseWord = entry.baseWord;
    if (entry.leadInSentence) firestorePayload.leadInSentence = entry.leadInSentence;
    if (entry.mark1Parts) firestorePayload.mark1Parts = entry.mark1Parts;
    if (entry.mark2Parts) firestorePayload.mark2Parts = entry.mark2Parts;
    if (entry.acceptedAnswers) firestorePayload.acceptedAnswers = entry.acceptedAnswers;
    if (entry.options) firestorePayload.options = entry.options;
    if (entry.subtype) firestorePayload.subtype = entry.subtype;

    toWrite.push({ id: sentenceId, payload: firestorePayload, entry });
  });

  if (toWrite.length === 0) {
    return {
      ok: true,
      addedCount: 0,
      totalCloudCount: currentCloudSentences.length,
      updatedList: currentCloudSentences,
    };
  }

  const CHUNK_SIZE = 200;
  let written = 0;
  const newlyAddedEntries: CloudCuratedSentence[] = [];

  try {
    for (let i = 0; i < toWrite.length; i += CHUNK_SIZE) {
      const slice = toWrite.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const row of slice) {
        batch.set(doc(db, 'curated_sentences', row.id), row.payload);
      }
      await batch.commit();
      written += slice.length;
      newlyAddedEntries.push(...slice.map((r) => r.entry));
      onProgress?.(written, toWrite.length);
    }

    const updatedList = [...newlyAddedEntries.reverse(), ...currentCloudSentences];
    saveCachedCloudSentences(updatedList);
    return {
      ok: true,
      addedCount: written,
      totalCloudCount: updatedList.length,
      updatedList,
    };
  } catch (err: any) {
    handleFirestoreError(err, OperationType.WRITE, 'curated_sentences');
    const partialList = [...newlyAddedEntries.reverse(), ...currentCloudSentences];
    saveCachedCloudSentences(partialList);
    return {
      ok: false,
      addedCount: written,
      totalCloudCount: partialList.length,
      updatedList: partialList,
      error: err?.message || 'Failed while writing batch to Firestore.',
    };
  }
}

export async function archiveSentenceToCloudBank(
  sentence: GeneratedSentence,
  settings: Settings,
  subtype?: string | null
): Promise<CloudCuratedSentence | null> {
  if (!sentence || !sentence.text || !sentence.explanation) return null;
  // Only the teacher's Google account may add to the shared bank (see firestore.rules).
  if (!isVerifiedTeacherUser(auth.currentUser)) return null;
  const qType: QuestionType = sentence.questionType || 'binary';
  const sentenceId = computeSentenceFingerprintId(sentence.text, qType);
  const path = `curated_sentences/${sentenceId}`;

  const entry: CloudCuratedSentence = {
    id: sentenceId,
    topic: (settings.topic || 'General').slice(0, 100),
    level: settings.level || 'B1',
    questionType: qType,
    text: sentence.text.trim().slice(0, 1000),
    isCorrect: Boolean(sentence.isCorrect),
    correction: (sentence.correction || sentence.text).trim().slice(0, 1000),
    explanation: sentence.explanation.trim().slice(0, 2500),
    grammarPhrase: (sentence.grammarPhrase || '').trim().slice(0, 300),
    errorPhrase: (sentence.errorPhrase || '').trim().slice(0, 300),
    mistakeType: (sentence.mistakeType || '').trim().slice(0, 200),
    correctAnswer: sentence.correctAnswer,
    baseWord: sentence.baseWord,
    leadInSentence: sentence.leadInSentence,
    mark1Parts: sentence.mark1Parts,
    mark2Parts: sentence.mark2Parts,
    acceptedAnswers: sentence.acceptedAnswers,
    options: sentence.options,
    subtype: subtype || undefined,
    createdAt: Date.now(),
  };

  try {
    const firestorePayload: Record<string, any> = {
      topic: entry.topic,
      level: entry.level,
      questionType: entry.questionType,
      text: entry.text,
      isCorrect: entry.isCorrect,
      correction: entry.correction,
      explanation: entry.explanation,
      grammarPhrase: entry.grammarPhrase,
      errorPhrase: entry.errorPhrase || '',
      mistakeType: entry.mistakeType || '',
      createdAt: entry.createdAt,
    };
    if (entry.correctAnswer) firestorePayload.correctAnswer = entry.correctAnswer;
    if (entry.baseWord) firestorePayload.baseWord = entry.baseWord;
    if (entry.leadInSentence) firestorePayload.leadInSentence = entry.leadInSentence;
    if (entry.mark1Parts) firestorePayload.mark1Parts = entry.mark1Parts;
    if (entry.mark2Parts) firestorePayload.mark2Parts = entry.mark2Parts;
    if (entry.acceptedAnswers) firestorePayload.acceptedAnswers = entry.acceptedAnswers;
    if (entry.options) firestorePayload.options = entry.options;
    if (entry.subtype) firestorePayload.subtype = entry.subtype;

    await setDoc(doc(db, 'curated_sentences', sentenceId), firestorePayload);

    // Also prepend to local cache if not present
    const cached = loadCachedCloudSentences();
    if (!cached.some((c) => c.id === sentenceId)) {
      saveCachedCloudSentences([entry, ...cached]);
    }
    return entry;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    return null;
  }
}

export async function deleteCloudCuratedSentence(sentenceId: string): Promise<boolean> {
  const path = `curated_sentences/${sentenceId}`;
  try {
    await deleteDoc(doc(db, 'curated_sentences', sentenceId));
    const cached = loadCachedCloudSentences().filter((s) => s.id !== sentenceId);
    saveCachedCloudSentences(cached);
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
    return false;
  }
}
