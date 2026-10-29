/**
 * Security-rule tests against the Realtime Database emulator.
 * Run with `npm run test:rules` (needs Java for the emulator).
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/database';

// rules-unit-testing hands out compat Database instances; these helpers keep the tests readable.
type Database = firebase.database.Database;
const ref = (db: Database, path = '/') => db.ref(path);
const get = (r: firebase.database.Reference) => r.get();
const set = (r: firebase.database.Reference, v: unknown) => r.set(v);
const update = (r: firebase.database.Reference, v: Record<string, unknown>) => r.update(v);
const serverTimestamp = () => ({ '.sv': 'timestamp' });
import { TRANSITIONS } from '../src/shared/stateMachine';
import type { SessionStatus } from '../src/shared/types';

const ROOM = 'room1';
const CODE = 'K7PQ2M';
let env: RulesTestEnvironment;

const teacherDb = () => env.authenticatedContext('teacher').database();
const otherTeacherDb = () => env.authenticatedContext('teacher2').database();
const studentDb = (uid = 'stu1') => env.authenticatedContext(uid).database();

function newSession() {
  return {
    owner: 'teacher', roomCode: CODE, bankId: 'demo', status: 'LOBBY', questIndex: 0, questionIndex: -1,
    questionId: '', optionCount: 0, rev: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  };
}

async function seed(status: SessionStatus = 'LOBBY', extra: Record<string, unknown> = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    await set(ref(db), {
      teachers: { teacher: true, teacher2: true },
      answerKeys: { demo: { q1: { correct: 1, explanation: 'x' } } },
      roomCodes: { [CODE]: { roomId: ROOM, owner: 'teacher' } },
      sessions: {
        [ROOM]: {
          owner: 'teacher', roomCode: CODE, bankId: 'demo', status, questIndex: 0, questionIndex: 0,
          questionId: 'q1', optionCount: 4, rev: 5, createdAt: Date.now(), updatedAt: Date.now(), ...extra,
        },
      },
      sessionParticipants: { [ROOM]: { stu1: { alias: 'A', joinedAt: Date.now() }, stu2: { alias: 'B', joinedAt: Date.now() } } },
    });
  });
}

async function teacherSet(status: SessionStatus, fields: Record<string, unknown> = {}, rev = 6) {
  const db = teacherDb();
  const patch: Record<string, unknown> = { [`sessions/${ROOM}/status`]: status, [`sessions/${ROOM}/rev`]: rev, [`sessions/${ROOM}/updatedAt`]: serverTimestamp() };
  for (const [k, v] of Object.entries(fields)) patch[`sessions/${ROOM}/${k}`] = v;
  return update(ref(db), patch);
}

const answer = (db: Database, qid = 'q1', uid = 'stu1', choice: unknown = 1) =>
  set(ref(db, `sessionAnswers/${ROOM}/${qid}/${uid}`), { choice, at: serverTimestamp() });

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-music-quest',
    database: { rules: readFileSync('database.rules.json', 'utf8'), host: '127.0.0.1', port: 9000 },
  });
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearDatabase());

describe('teacher authorization', () => {
  it('allowlisted teacher can create a session with a room code atomically', async () => {
    await env.withSecurityRulesDisabled((ctx) => set(ref(ctx.database(), 'teachers/teacher'), true));
    await assertSucceeds(update(ref(teacherDb()), { [`sessions/${ROOM}`]: newSession(), [`roomCodes/${CODE}`]: { roomId: ROOM, owner: 'teacher' } }));
  });
  it('non-teacher (anonymous student) cannot create a session', async () => {
    await assertFails(update(ref(studentDb()), { [`sessions/${ROOM}`]: { ...newSession(), owner: 'stu1' }, [`roomCodes/${CODE}`]: { roomId: ROOM, owner: 'stu1' } }));
  });
  it('a room code already in use cannot be claimed again', async () => {
    await seed();
    await assertFails(update(ref(otherTeacherDb()), { 'sessions/room2': { ...newSession(), owner: 'teacher2' }, [`roomCodes/${CODE}`]: { roomId: 'room2', owner: 'teacher2' } }));
  });
  it('another teacher cannot control someone else’s session', async () => {
    await seed();
    await assertFails(update(ref(otherTeacherDb()), { [`sessions/${ROOM}/status`]: 'QUESTION_PAUSED', [`sessions/${ROOM}/rev`]: 6, [`sessions/${ROOM}/updatedAt`]: serverTimestamp() }));
  });
  it('nobody can write the teacher allowlist or answer keys from a client', async () => {
    await seed();
    await assertFails(set(ref(studentDb(), 'teachers/stu1'), true));
    await assertFails(set(ref(teacherDb(), 'teachers/stu1'), true));
    await assertFails(set(ref(teacherDb(), 'answerKeys/demo/q1/correct'), 2));
  });
});

describe('answer keys stay hidden', () => {
  it('students cannot read answer keys; teachers can', async () => {
    await seed();
    await assertFails(get(ref(studentDb(), 'answerKeys/demo')));
    await assertSucceeds(get(ref(teacherDb(), 'answerKeys/demo')));
  });
  it('students cannot list rooms or read other sessions', async () => {
    await seed();
    await assertFails(get(ref(studentDb('outsider'), 'roomCodes')));
    await assertSucceeds(get(ref(studentDb('outsider'), `roomCodes/${CODE}`)));
    await assertFails(get(ref(studentDb('outsider'), `sessions/${ROOM}`)));
    await assertSucceeds(get(ref(studentDb(), `sessions/${ROOM}`)));
  });
});

describe('state transitions are enforced server-side', () => {
  const all = Object.keys(TRANSITIONS) as SessionStatus[];
  for (const from of all.filter((s) => s !== 'FINISHED')) {
    for (const to of all.filter((s) => s !== from)) {
      const allowed = TRANSITIONS[from].includes(to);
      it(`${from} → ${to} ${allowed ? 'allowed' : 'rejected'}`, async () => {
        await seed(from);
        const p = teacherSet(to);
        if (allowed) await assertSucceeds(p);
        else await assertFails(p);
      });
    }
  }
  it('FINISHED is terminal', async () => {
    await seed('FINISHED');
    await assertFails(teacherSet('LOBBY'));
    await assertFails(teacherSet('FINISHED'));
  });
  it('stale writes (wrong rev) are rejected', async () => {
    await seed('QUESTION_OPEN');
    await assertFails(teacherSet('QUESTION_PAUSED', {}, 5));
    await assertFails(teacherSet('QUESTION_PAUSED', {}, 8));
  });
  it('question cannot change while answering is open', async () => {
    await seed('QUESTION_OPEN');
    await assertFails(teacherSet('QUESTION_OPEN', { questionId: 'q2', questionIndex: 1 }));
    await assertFails(teacherSet('QUESTION_PAUSED', { optionCount: 6 }));
  });
  it('question can change when opening from a reveal', async () => {
    await seed('ANSWER_REVEALED');
    await assertSucceeds(teacherSet('QUESTION_OPEN', { questionId: 'q2', questionIndex: 1, optionCount: 4 }));
  });
  it('students cannot change status, question or quest', async () => {
    await seed('QUESTION_CLOSED');
    const db = studentDb();
    await assertFails(update(ref(db), { [`sessions/${ROOM}/status`]: 'ANSWER_REVEALED', [`sessions/${ROOM}/rev`]: 6, [`sessions/${ROOM}/updatedAt`]: serverTimestamp() }));
    await assertFails(set(ref(db, `sessions/${ROOM}/questIndex`), 3));
    await assertFails(set(ref(db, `sessionReveals/${ROOM}/q1`), { correct: 1, explanation: '' }));
    await assertFails(set(ref(db, `sessionResults/${ROOM}/q1`), { total: 30, correct: 30 }));
  });
});

describe('answers', () => {
  it('participant can answer once while open', async () => {
    await seed('QUESTION_OPEN');
    await assertSucceeds(answer(studentDb()));
    await assertFails(answer(studentDb(), 'q1', 'stu1', 2)); // second submission, e.g. duplicate tab / reload
  });
  it('answers are rejected while paused, closed or revealed', async () => {
    for (const s of ['QUESTION_PAUSED', 'QUESTION_CLOSED', 'ANSWER_REVEALED', 'LOBBY'] as SessionStatus[]) {
      await seed(s);
      await assertFails(answer(studentDb()));
    }
  });
  it('answers for a different (stale) question are rejected', async () => {
    await seed('QUESTION_OPEN');
    await assertFails(answer(studentDb(), 'q0'));
  });
  it('invalid payloads are rejected', async () => {
    await seed('QUESTION_OPEN');
    await assertFails(answer(studentDb(), 'q1', 'stu1', 4));
    await assertFails(answer(studentDb(), 'q1', 'stu1', -1));
    await assertFails(answer(studentDb(), 'q1', 'stu1', 1.5));
    await assertFails(answer(studentDb(), 'q1', 'stu1', '1'));
    await assertFails(set(ref(studentDb(), `sessionAnswers/${ROOM}/q1/stu1`), { choice: 1, at: 1 }));
    await assertFails(set(ref(studentDb(), `sessionAnswers/${ROOM}/q1/stu1`), { choice: 1, at: serverTimestamp(), extra: 1 }));
  });
  it('reflection questions (optionCount 0) accept no answers', async () => {
    await seed('QUESTION_OPEN', { optionCount: 0 });
    await assertFails(answer(studentDb(), 'q1', 'stu1', 0));
  });
  it('cannot answer as someone else or without joining', async () => {
    await seed('QUESTION_OPEN');
    await assertFails(answer(studentDb('stu1'), 'q1', 'stu2'));
    await assertFails(answer(studentDb('outsider'), 'q1', 'outsider'));
  });
  it('students cannot read other pupils’ answers; teacher can read all', async () => {
    await seed('QUESTION_OPEN');
    await answer(studentDb('stu1'));
    await assertSucceeds(get(ref(studentDb('stu1'), `sessionAnswers/${ROOM}/q1/stu1`)));
    await assertFails(get(ref(studentDb('stu2'), `sessionAnswers/${ROOM}/q1/stu1`)));
    await assertFails(get(ref(studentDb('stu2'), `sessionAnswers/${ROOM}/q1`)));
    await assertSucceeds(get(ref(teacherDb(), `sessionAnswers/${ROOM}/q1`)));
  });
  it('students cannot delete or edit an accepted answer', async () => {
    await seed('QUESTION_OPEN');
    await answer(studentDb());
    await assertFails(set(ref(studentDb(), `sessionAnswers/${ROOM}/q1/stu1`), null));
  });
});

describe('participants and presence', () => {
  it('can join with a valid alias; rejoin does not overwrite', async () => {
    await seed();
    const db = studentDb('new');
    await assertSucceeds(set(ref(db, `sessionParticipants/${ROOM}/new`), { alias: '5B-12', joinedAt: serverTimestamp() }));
    await assertFails(set(ref(db, `sessionParticipants/${ROOM}/new`), { alias: 'Other', joinedAt: serverTimestamp() }));
  });
  it('rejects bad aliases, extra fields and joining as another uid', async () => {
    await seed();
    const db = studentDb('new');
    await assertFails(set(ref(db, `sessionParticipants/${ROOM}/new`), { alias: '', joinedAt: serverTimestamp() }));
    await assertFails(set(ref(db, `sessionParticipants/${ROOM}/new`), { alias: 'a'.repeat(13), joinedAt: serverTimestamp() }));
    await assertFails(set(ref(db, `sessionParticipants/${ROOM}/new`), { alias: 'a@b.hk', joinedAt: serverTimestamp() }));
    await assertFails(set(ref(db, `sessionParticipants/${ROOM}/new`), { alias: 'ok', joinedAt: serverTimestamp(), email: 'x' }));
    await assertFails(set(ref(db, `sessionParticipants/${ROOM}/someone`), { alias: 'ok', joinedAt: serverTimestamp() }));
  });
  it('cannot join a finished or expired session', async () => {
    await seed('FINISHED');
    await assertFails(set(ref(studentDb('new'), `sessionParticipants/${ROOM}/new`), { alias: 'ok', joinedAt: serverTimestamp() }));
    await seed('LOBBY', { createdAt: Date.now() - 13 * 3600 * 1000 });
    await assertFails(set(ref(studentDb('new'), `sessionParticipants/${ROOM}/new`), { alias: 'ok', joinedAt: serverTimestamp() }));
  });
  it('students cannot list the class roster', async () => {
    await seed();
    await assertFails(get(ref(studentDb(), `sessionParticipants/${ROOM}`)));
    await assertSucceeds(get(ref(teacherDb(), `sessionParticipants/${ROOM}`)));
  });
  it('participants can write only their own presence', async () => {
    await seed();
    await assertSucceeds(set(ref(studentDb('stu1'), `sessionPresence/${ROOM}/stu1`), { online: true, lastSeen: serverTimestamp() }));
    await assertFails(set(ref(studentDb('stu1'), `sessionPresence/${ROOM}/stu2`), { online: false, lastSeen: serverTimestamp() }));
    await assertFails(set(ref(studentDb('outsider'), `sessionPresence/${ROOM}/outsider`), { online: true, lastSeen: serverTimestamp() }));
  });
});

describe('reveals', () => {
  it('teacher reveal + result in one write; pupils can read the reveal but not results', async () => {
    await seed('QUESTION_CLOSED');
    await assertSucceeds(
      update(ref(teacherDb()), {
        [`sessions/${ROOM}/status`]: 'ANSWER_REVEALED', [`sessions/${ROOM}/rev`]: 6, [`sessions/${ROOM}/updatedAt`]: serverTimestamp(),
        [`sessionReveals/${ROOM}/q1`]: { correct: 1, explanation: 'x' },
        [`sessionResults/${ROOM}/q1`]: { total: 2, correct: 1, counts: [0, 1, 1, 0] },
      }),
    );
    await assertSucceeds(get(ref(studentDb(), `sessionReveals/${ROOM}/q1`)));
    await assertFails(get(ref(studentDb('outsider'), `sessionReveals/${ROOM}/q1`)));
    await assertFails(get(ref(studentDb(), `sessionResults/${ROOM}`)));
  });
});
