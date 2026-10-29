// Simulates N pupils + 1 teacher against the LOCAL emulators and measures sync latency.
// Usage: npm run emulators ; npm run seed:emulator ; npm run load:sim -- 2 5 10 30
// Each simulated pupil is a separate Firebase app instance (own anonymous uid + websocket).
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously, signInWithEmailAndPassword } from 'firebase/auth';
import { connectDatabaseEmulator, get, getDatabase, onValue, push, ref, serverTimestamp, set, update } from 'firebase/database';
import { writeFileSync } from 'node:fs';

const config = { apiKey: 'demo-key', projectId: 'demo-music-quest', databaseURL: 'https://demo-music-quest-default-rtdb.firebaseio.com' };
const email = process.env.TEACHER_EMAIL ?? 'teacher@example.test';
const password = process.env.TEACHER_PASSWORD ?? 'music-quest-dev';
let appSeq = 0;

function client() {
  const app = initializeApp(config, `c${appSeq++}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getDatabase(app);
  connectDatabaseEmulator(db, '127.0.0.1', 9000);
  return { app, auth, db };
}

const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return { n: s.length, p50: s[Math.floor(s.length / 2)], p95: s[Math.floor(s.length * 0.95)] ?? s.at(-1), max: s.at(-1) };
};

async function run(n) {
  const t = client();
  await signInWithEmailAndPassword(t.auth, email, password);
  const roomId = push(ref(t.db, 'sessions')).key;
  const code = Array.from({ length: 6 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]).join('');
  const s = (k) => `sessions/${roomId}/${k}`;
  await update(ref(t.db), {
    [`sessions/${roomId}`]: { owner: t.auth.currentUser.uid, roomCode: code, bankId: 'demo', status: 'LOBBY', questIndex: 0, questionIndex: -1, questionId: '', optionCount: 0, rev: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
    [`roomCodes/${code}`]: { roomId, owner: t.auth.currentUser.uid },
  });

  const pupils = await Promise.all(
    Array.from({ length: n }, async (_, i) => {
      const c = client();
      await signInAnonymously(c.auth);
      const rid = (await get(ref(c.db, `roomCodes/${code}`))).val().roomId;
      await set(ref(c.db, `sessionParticipants/${rid}/${c.auth.currentUser.uid}`), { alias: `S${i + 1}`, joinedAt: serverTimestamp() });
      return c;
    }),
  );

  // Every pupil listens to the session and answers as soon as q1 opens.
  let openedAt = 0;
  const seen = [];
  const acceptedLatency = [];
  let rejected = 0;
  const done = Promise.all(
    pupils.map(
      (c) =>
        new Promise((resolve) => {
          const off = onValue(ref(c.db, `sessions/${roomId}`), async (snap) => {
            const v = snap.val();
            if (v?.status !== 'QUESTION_OPEN' || v.questionId !== 'gate-1') return;
            off();
            seen.push(Date.now() - openedAt);
            const sent = Date.now();
            const choice = Math.floor(Math.random() * 4);
            const path = `sessionAnswers/${roomId}/gate-1/${c.auth.currentUser.uid}`;
            try {
              await set(ref(c.db, path), { choice, at: serverTimestamp() });
              acceptedLatency.push(Date.now() - sent);
            } catch {
              rejected++;
            }
            // Duplicate submission must be refused.
            await set(ref(c.db, path), { choice: (choice + 1) % 4, at: serverTimestamp() }).then(
              () => { throw new Error('DUPLICATE ACCEPTED'); },
              () => {},
            );
            resolve();
          });
        }),
    ),
  );

  openedAt = Date.now();
  await update(ref(t.db), { [s('status')]: 'QUESTION_OPEN', [s('questionId')]: 'gate-1', [s('questionIndex')]: 0, [s('optionCount')]: 4, [s('rev')]: 1, [s('updatedAt')]: serverTimestamp() });
  await done;
  await update(ref(t.db), { [s('status')]: 'QUESTION_PAUSED', [s('rev')]: 2, [s('updatedAt')]: serverTimestamp() });
  const answers = Object.keys((await get(ref(t.db, `sessionAnswers/${roomId}/gate-1`))).val() ?? {}).length;
  const participants = Object.keys((await get(ref(t.db, `sessionParticipants/${roomId}`))).val() ?? {}).length;

  // During pause, a late answer from a fresh participant must be refused.
  const late = client();
  await signInAnonymously(late.auth);
  await set(ref(late.db, `sessionParticipants/${roomId}/${late.auth.currentUser.uid}`), { alias: 'late', joinedAt: serverTimestamp() });
  const pausedRejected = await set(ref(late.db, `sessionAnswers/${roomId}/gate-1/${late.auth.currentUser.uid}`), { choice: 0, at: serverTimestamp() }).then(() => false, () => true);

  await Promise.all([t, late, ...pupils].map((c) => deleteApp(c.app)));
  return { pupils: n, participants, answers, rejected, pausedRejected, questionReceivedMs: stats(seen), answerAckMs: stats(acceptedLatency) };
}

const sizes = process.argv.slice(2).map(Number).filter(Boolean);
const results = [];
for (const n of sizes.length ? sizes : [2, 5, 10, 30]) {
  const r = await run(n);
  results.push(r);
  console.log(JSON.stringify(r));
}
writeFileSync('load-report.json', JSON.stringify({ at: new Date().toISOString(), target: 'local emulator', results }, null, 2));
process.exit(0);
