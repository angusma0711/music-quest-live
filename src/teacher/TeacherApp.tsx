import { useEffect, useState, type FormEvent } from 'react';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getTeacherClient, usingEmulators } from '../services/firebase';
import { readLocal, useAuthUser, useConnected, useDbValue, writeLocal } from '../services/hooks';
import { ActionError, createSession, isTeacher, loadAnswerKeys } from '../services/session';
import { demoBank } from '../content/demoBank';
import type { AnswerKeys, Session } from '../shared/types';
import { Console } from './Console';

const { auth, db } = getTeacherClient();

const ROOM_KEY = 'mq.teacher.room';

export default function TeacherApp() {
  const { user, ready } = useAuthUser(auth);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user || user.isAnonymous) return;
    isTeacher(db, user.uid).then(setAllowed, () => setAllowed(false));
  }, [user]);

  if (!ready) return <div className="center-screen">Loading…</div>;
  if (!user || user.isAnonymous) return <SignIn />;
  if (allowed === null) return <div className="center-screen">Checking teacher access…</div>;
  if (!allowed)
    return (
      <div className="center-screen">
        <p>This account is not on the teacher allowlist. 此帳戶未獲老師權限。</p>
        <p className="muted">UID: {user.uid}</p>
        <button className="btn" onClick={() => signOut(auth)}>Sign out 登出</button>
      </div>
    );
  return <TeacherHome uid={user.uid} />;
}

function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setError('Sign-in failed. 登入失敗。');
    }
  }
  return (
    <main className="teacher-signin">
      <form onSubmit={submit} className="card">
        <h1>Teacher sign-in 老師登入</h1>
        {usingEmulators && <p className="notice">Local emulator mode — use the seeded teacher account (see README).</p>}
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></label>
        <label>Password 密碼<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary">Sign in 登入</button>
      </form>
    </main>
  );
}

function TeacherHome({ uid }: { uid: string }) {
  const [roomId, setRoomId] = useState<string | null>(() => readLocal(ROOM_KEY));
  const [keys, setKeys] = useState<AnswerKeys | null | undefined>(undefined);
  const [error, setError] = useState('');
  const connected = useConnected(db);
  const { value: session, loading } = useDbValue<Session>(db, roomId ? `sessions/${roomId}` : null);

  useEffect(() => {
    loadAnswerKeys(db, demoBank.id).then(setKeys, () => setKeys(null));
  }, []);

  async function newSession() {
    setError('');
    try {
      const { roomId: id } = await createSession(db, uid, demoBank.id);
      writeLocal(ROOM_KEY, id);
      setRoomId(id);
    } catch (err) {
      setError(err instanceof ActionError ? err.message : 'Could not create room.');
    }
  }

  function leave() {
    writeLocal(ROOM_KEY, null);
    setRoomId(null);
  }

  if (roomId && loading) return <div className="center-screen">Loading session…</div>;
  if (roomId && session && session.owner === uid)
    return <Console roomId={roomId} session={session} bank={demoBank} keys={keys ?? null} connected={connected} onLeave={leave} />;

  return (
    <main className="teacher-home">
      <div className="card">
        <h1>音樂王國：失落的四大家族</h1>
        <p>Question bank 題庫：{demoBank.title}</p>
        {demoBank.demo && <p className="notice">⚠️ Demo content — confirm the 4 Nov lesson scope and replace before use. 示範內容，並非已確認的課程範圍。</p>}
        {keys === null && <p className="error">Answer keys not loaded (answerKeys/{demoBank.id}). Reveal will show no correct answer. 答案鍵未載入。</p>}
        {!connected && <p className="error">Offline — check Wi-Fi. 未連線。</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-xl" onClick={newSession} disabled={!connected}>
          Create new session 建立新房間
        </button>
        <button className="btn btn-ghost" onClick={() => signOut(auth)}>Sign out 登出</button>
      </div>
    </main>
  );
}
