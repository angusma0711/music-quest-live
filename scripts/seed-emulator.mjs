// Seeds the LOCAL emulators with a teacher account, the teacher allowlist and the demo answer keys.
// Usage: npm run emulators   (in one terminal)   then   npm run seed:emulator
// Never point this at a real project: it uses the emulator-only "owner" bypass token.
import { readFileSync } from 'node:fs';

const PROJECT = 'demo-music-quest';
const DB = `http://127.0.0.1:9000`;
const NS = `${PROJECT}-default-rtdb`;
const AUTH = 'http://127.0.0.1:9099';
const email = process.env.TEACHER_EMAIL ?? 'teacher@example.test';
const password = process.env.TEACHER_PASSWORD ?? 'music-quest-dev';

async function json(res) {
  const body = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(body));
  return body;
}

async function ensureTeacher() {
  const signUp = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  if (signUp.ok) return (await signUp.json()).localId;
  const signIn = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  return (await json(signIn)).localId;
}

async function put(path, value) {
  await json(
    await fetch(`${DB}/${path}.json?ns=${NS}`, {
      method: 'PUT',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    }),
  );
}

const uid = await ensureTeacher();
await put(`teachers/${uid}`, true);
await put('answerKeys/demo', JSON.parse(readFileSync(new URL('../content/answer-keys.demo.json', import.meta.url), 'utf8')));
console.log(`Seeded emulator. Teacher login: ${email} / ${password} (uid ${uid})`);
