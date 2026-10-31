// Checks firestore.rules against the Firebase emulator before you publish them.
//
// Run (needs Java and internet the first time, to download the emulator):
//   npm i --no-save @firebase/rules-unit-testing firebase-tools
//   npx firebase emulators:exec --config scripts/firestore-emulator.json --project demo-grammar-casino --only firestore "node scripts/check-firestore-rules.mjs"
//
// It is not part of `npm test` because it needs the emulator.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, writeBatch, onSnapshot } from 'firebase/firestore';

const here = dirname(fileURLToPath(import.meta.url));
const TEACHER = 'teacher.siqueira@gmail.com';

const env = await initializeTestEnvironment({
  projectId: 'demo-grammar-casino',
  firestore: { rules: readFileSync(join(here, '..', 'firestore.rules'), 'utf8') },
});

const teacher = env.authenticatedContext('teacher-uid', { email: TEACHER, email_verified: true }).firestore();
const otherGoogle = env.authenticatedContext('other-uid', { email: 'someone@gmail.com', email_verified: true }).firestore();
const fakeTeacher = env.authenticatedContext('fake-uid', { email: TEACHER, email_verified: false }).firestore();
const hostAnon = env.authenticatedContext('host-anon', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const studentA = env.authenticatedContext('student-a', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const studentB = env.authenticatedContext('student-b', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const nobody = env.unauthenticatedContext().firestore();

const now = () => Date.now();
const roster = () => ({
  name: 'Class 3B', notes: '', startingCash: 1000, playersJson: '[{"name":"Ana"}]',
  playerCount: 1, updatedBy: TEACHER, createdAt: now(), updatedAt: now(),
});
const report = () => ({
  title: 'Friday', topic: 'Tenses', level: 'C1', roundsPlayed: 3, playerCount: 2,
  playersJson: '[]', roundHistoryJson: '[]', createdAt: now(),
});
const sentence = () => ({
  topic: 'Tenses', level: 'C1', questionType: 'binary', text: 'She has lived here for years.',
  isCorrect: true, correction: 'She has lived here for years.', explanation: 'Present perfect with for.', createdAt: now(),
});
const room = (code, uid, extra = {}) => ({ code, locked: false, rev: 1, tableJson: '{"round":1}', seatRevs: {}, kickedPlayerIds: [], updatedAt: now(), hostUid: uid, ...extra });
const seat = (clientId, uid, extra = {}) => ({ clientId, uid, playerId: 101, viewJson: '{"myBet":{"bet":120}}', joinJson: '', kicked: false, rev: 1, updatedAt: now(), ...extra });
const intent = (clientId, uid) => ({ clientId, uid, type: 'STUDENT_INTENT', payloadJson: '{"bet":100}', updatedAt: now() });

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${name}\n       ${String(err?.message || err).split('\n')[0]}`);
  }
}

console.log('Rosters and reports');
await check('teacher can save a roster', () => assertSucceeds(setDoc(doc(teacher, 'rosters/roster_1'), roster())));
await check('teacher can list rosters', () => assertSucceeds(getDocs(collection(teacher, 'rosters'))));
await check('teacher can delete a roster', () => assertSucceeds(deleteDoc(doc(teacher, 'rosters/roster_1'))));
await check('anyone else cannot read rosters', async () => {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'rosters/roster_2'), roster()));
  await assertFails(getDoc(doc(nobody, 'rosters/roster_2')));
  await assertFails(getDoc(doc(studentA, 'rosters/roster_2')));
  await assertFails(getDoc(doc(otherGoogle, 'rosters/roster_2')));
  await assertFails(getDocs(collection(otherGoogle, 'rosters')));
});
await check('unverified email that claims to be the teacher cannot read rosters', () => assertFails(getDoc(doc(fakeTeacher, 'rosters/roster_2'))));
await check('anyone else cannot write or delete rosters', async () => {
  await assertFails(setDoc(doc(nobody, 'rosters/roster_3'), roster()));
  await assertFails(setDoc(doc(otherGoogle, 'rosters/roster_3'), roster()));
  await assertFails(deleteDoc(doc(studentA, 'rosters/roster_2')));
});
await check('teacher can save and read a session report', async () => {
  await assertSucceeds(setDoc(doc(teacher, 'session_reports/report_1'), report()));
  await assertSucceeds(getDocs(collection(teacher, 'session_reports')));
});
await check('anyone else cannot read or delete reports', async () => {
  await assertFails(getDocs(collection(nobody, 'session_reports')));
  await assertFails(getDoc(doc(otherGoogle, 'session_reports/report_1')));
  await assertFails(deleteDoc(doc(studentA, 'session_reports/report_1')));
});

console.log('Sentence bank');
await check('teacher can add a sentence', () => assertSucceeds(setDoc(doc(teacher, 'curated_sentences/sent_binary_1'), sentence())));
await check('everyone can read the bank', async () => {
  await assertSucceeds(getDocs(collection(nobody, 'curated_sentences')));
  await assertSucceeds(getDocs(collection(studentA, 'curated_sentences')));
});
await check('others cannot add or delete sentences', async () => {
  await assertFails(setDoc(doc(nobody, 'curated_sentences/sent_binary_2'), sentence()));
  await assertFails(setDoc(doc(otherGoogle, 'curated_sentences/sent_binary_2'), sentence()));
  await assertFails(deleteDoc(doc(studentA, 'curated_sentences/sent_binary_1')));
});
await check('teacher can delete a sentence', () => assertSucceeds(deleteDoc(doc(teacher, 'curated_sentences/sent_binary_1'))));

console.log('Live rooms');
await check('signed-in host can create a room', () => assertSucceeds(setDoc(doc(hostAnon, 'rooms/ABCD'), room('ABCD', 'host-anon'))));
await check('room cannot be created without signing in', () => assertFails(setDoc(doc(nobody, 'rooms/WXYZ'), room('WXYZ', 'x'))));
await check('room cannot be created in someone else\'s name', () => assertFails(setDoc(doc(studentA, 'rooms/WXYZ'), room('WXYZ', 'host-anon'))));
await check('host can update the room', () => assertSucceeds(setDoc(doc(hostAnon, 'rooms/ABCD'), room('ABCD', 'host-anon', { locked: true }))));
await check('student cannot take over or update the room', () => assertFails(setDoc(doc(studentA, 'rooms/ABCD'), room('ABCD', 'student-a'))));
await check('teacher (Google) can take over the room', () => assertSucceeds(setDoc(doc(teacher, 'rooms/ABCD'), room('ABCD', 'teacher-uid'))));
await check('original anonymous host can no longer write after the teacher took over', () => assertFails(setDoc(doc(hostAnon, 'rooms/ABCD'), room('ABCD', 'host-anon'))));
await check('room cannot carry extra fields such as everyone\'s views', () => assertFails(setDoc(doc(teacher, 'rooms/ABCD'), room('ABCD', 'teacher-uid', { viewsJson: '{}' }))));
await check('anyone can read a room (the shared table only)', async () => {
  await assertSucceeds(getDoc(doc(nobody, 'rooms/ABCD')));
  await assertSucceeds(getDoc(doc(studentB, 'rooms/ABCD')));
});
await check('student cannot delete a room', () => assertFails(deleteDoc(doc(studentA, 'rooms/ABCD'))));
await check('old room without a host can be reused', async () => {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'rooms/OLD1'), { code: 'OLD1', locked: false, updatedAt: now() }));
  await assertSucceeds(setDoc(doc(hostAnon, 'rooms/OLD1'), room('OLD1', 'host-anon')));
});
await check('room idle for 6+ hours can be reused by a new host', async () => {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'rooms/OLD2'), room('OLD2', 'someone', { updatedAt: now() - 7 * 3600 * 1000 })));
  await assertSucceeds(setDoc(doc(hostAnon, 'rooms/OLD2'), room('OLD2', 'host-anon')));
});
await check('active room of another host cannot be reused', async () => {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'rooms/LIVE'), room('LIVE', 'someone')));
  await assertFails(setDoc(doc(hostAnon, 'rooms/LIVE'), room('LIVE', 'host-anon')));
});
await check('host can close its own room', async () => {
  await assertSucceeds(setDoc(doc(hostAnon, 'rooms/BYE1'), room('BYE1', 'host-anon')));
  await assertSucceeds(deleteDoc(doc(hostAnon, 'rooms/BYE1')));
});

console.log('Student intents');
await assertSucceeds(setDoc(doc(hostAnon, 'rooms/PLAY'), room('PLAY', 'host-anon')));
await check('student can send their own intent', () => assertSucceeds(setDoc(doc(studentA, 'rooms/PLAY/intents/stu_a'), intent('stu_a', 'student-a'))));
await check('student can update their own intent', () => assertSucceeds(setDoc(doc(studentA, 'rooms/PLAY/intents/stu_a'), intent('stu_a', 'student-a'))));
await check('another student cannot overwrite it', () => assertFails(setDoc(doc(studentB, 'rooms/PLAY/intents/stu_a'), intent('stu_a', 'student-b'))));
await check('student cannot write an intent in someone else\'s name', () => assertFails(setDoc(doc(studentB, 'rooms/PLAY/intents/stu_b'), intent('stu_b', 'student-a'))));
await check('intent cannot be sent without signing in', () => assertFails(setDoc(doc(nobody, 'rooms/PLAY/intents/stu_c'), intent('stu_c', 'x'))));
await check('host can read all intents in its room', () => assertSucceeds(getDocs(collection(hostAnon, 'rooms/PLAY/intents'))));
await check('classmates cannot read other students\' intents', async () => {
  await assertFails(getDocs(collection(studentB, 'rooms/PLAY/intents')));
  await assertFails(getDoc(doc(studentB, 'rooms/PLAY/intents/stu_a')));
  await assertFails(getDocs(collection(nobody, 'rooms/PLAY/intents')));
});
await check('student can read their own intent', () => assertSucceeds(getDoc(doc(studentA, 'rooms/PLAY/intents/stu_a'))));
await check('old intent without uid can be claimed by the next write', async () => {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'rooms/PLAY/intents/stu_old'), { clientId: 'stu_old', type: 'JOIN_REQUEST', payloadJson: '{}', updatedAt: now() }));
  await assertSucceeds(setDoc(doc(studentB, 'rooms/PLAY/intents/stu_old'), intent('stu_old', 'student-b')));
});

console.log('Private seat records');
await assertSucceeds(setDoc(doc(hostAnon, 'rooms/SEAT'), room('SEAT', 'host-anon')));
await check('host can write a seat record for a student', () => assertSucceeds(setDoc(doc(hostAnon, 'rooms/SEAT/seats/stu_a'), seat('stu_a', 'student-a'))));
await check('host can create the room and its seats in one batch', async () => {
  const batch = writeBatch(hostAnon);
  batch.set(doc(hostAnon, 'rooms/NEW1'), room('NEW1', 'host-anon'));
  batch.set(doc(hostAnon, 'rooms/NEW1/seats/stu_a'), seat('stu_a', 'student-a'));
  await assertSucceeds(batch.commit());
});
await check('the student it is addressed to can read it', () => assertSucceeds(getDoc(doc(studentA, 'rooms/SEAT/seats/stu_a'))));
await check('a student can wait on a seat record that does not exist yet', () => assertSucceeds(getDoc(doc(studentB, 'rooms/SEAT/seats/stu_b'))));
await check('a student can listen to their own seat record', () => assertSucceeds(new Promise((resolve, reject) => {
  const unsub = onSnapshot(doc(studentA, 'rooms/SEAT/seats/stu_a'), (snap) => { unsub(); resolve(snap); }, reject);
})));
await check('classmates cannot read it (no peeking at bets)', async () => {
  await assertFails(getDoc(doc(studentB, 'rooms/SEAT/seats/stu_a')));
  await assertFails(getDoc(doc(nobody, 'rooms/SEAT/seats/stu_a')));
  await assertFails(getDoc(doc(otherGoogle, 'rooms/SEAT/seats/stu_a')));
});
await check('nobody can list the seat records', async () => {
  await assertFails(getDocs(collection(studentA, 'rooms/SEAT/seats')));
  await assertFails(getDocs(collection(nobody, 'rooms/SEAT/seats')));
});
await check('host and teacher can read a seat record', async () => {
  await assertSucceeds(getDoc(doc(hostAnon, 'rooms/SEAT/seats/stu_a')));
  await assertSucceeds(getDoc(doc(teacher, 'rooms/SEAT/seats/stu_a')));
});
await check('students cannot write seat records, even their own', async () => {
  await assertFails(setDoc(doc(studentA, 'rooms/SEAT/seats/stu_a'), seat('stu_a', 'student-a', { viewJson: '{"me":{"money":99999}}' })));
  await assertFails(setDoc(doc(studentB, 'rooms/SEAT/seats/stu_b'), seat('stu_b', 'student-b')));
});
await check('seat records must not carry extra fields', () => assertFails(setDoc(doc(hostAnon, 'rooms/SEAT/seats/stu_x'), seat('stu_x', 'student-a', { extra: 1 }))));
await check('host cannot write seats in a room it does not run', () => assertFails(setDoc(doc(hostAnon, 'rooms/LIVE/seats/stu_a'), seat('stu_a', 'student-a'))));
await check('students cannot delete seat records', () => assertFails(deleteDoc(doc(studentA, 'rooms/SEAT/seats/stu_a'))));
await check('host can delete seat records and then the room in one go', async () => {
  const batch = writeBatch(hostAnon);
  batch.delete(doc(hostAnon, 'rooms/NEW1/seats/stu_a'));
  batch.delete(doc(hostAnon, 'rooms/NEW1'));
  await assertSucceeds(batch.commit());
});

console.log('Everything else');
await check('unknown collections are closed', async () => {
  await assertFails(getDoc(doc(teacher, 'secrets/x')));
  await assertFails(setDoc(doc(hostAnon, 'secrets/x'), { a: 1 }));
});

await env.cleanup();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
