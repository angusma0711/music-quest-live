import { useEffect, useState, type FormEvent } from 'react';
import { signInAnonymously } from 'firebase/auth';
import { getStudentClient } from '../services/firebase';
import { readLocal, useAuthUser, useConnected, useDbValue, writeLocal } from '../services/hooks';
import { ActionError, findRoom, isParticipant, joinRoom, submitAnswer, trackPresence } from '../services/session';
import { demoBank } from '../content/demoBank';
import { QuestionMedia } from '../shared/QuestionMedia';
import type { Reveal, Session } from '../shared/types';

const { auth, db } = getStudentClient();

const ROOM_KEY = 'mq.student.room';
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export default function StudentApp() {
  const { user, ready } = useAuthUser(auth);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [alias, setAlias] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(() => readLocal(ROOM_KEY) !== null);

  // Anonymous sign-in persists in the browser, so a Safari reload keeps the same uid.
  useEffect(() => {
    if (ready && !user) signInAnonymously(auth).catch(() => setRestoring(false));
  }, [ready, user]);

  useEffect(() => {
    if (!user) return;
    const saved = readLocal(ROOM_KEY);
    if (!saved) return;
    isParticipant(db, saved, user.uid).then((a) => {
      if (a) {
        setRoomId(saved);
        setAlias(a);
      } else writeLocal(ROOM_KEY, null);
      setRestoring(false);
    });
  }, [user]);

  useEffect(() => {
    if (user && roomId && alias) return trackPresence(db, roomId, user.uid);
  }, [user, roomId, alias]);

  if (!user || restoring) return <div className="center-screen">連線中…</div>;
  if (!roomId || !alias)
    return (
      <JoinForm
        uid={user.uid}
        onJoined={(r, a) => {
          writeLocal(ROOM_KEY, r);
          setRoomId(r);
          setAlias(a);
        }}
      />
    );
  return (
    <Play
      roomId={roomId}
      uid={user.uid}
      alias={alias}
      onLeave={() => {
        writeLocal(ROOM_KEY, null);
        setRoomId(null);
        setAlias(null);
      }}
    />
  );
}

function JoinForm({ uid, onJoined }: { uid: string; onJoined: (roomId: string, alias: string) => void }) {
  const [code, setCode] = useState(() => new URLSearchParams(window.location.search).get('code') ?? '');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const roomId = await findRoom(db, code);
      onJoined(roomId, await joinRoom(db, roomId, uid, name));
    } catch (err) {
      setError(err instanceof ActionError ? err.message : '網絡不穩定，請再試一次。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="student join">
      <h1>🎵 加入音樂冒險</h1>
      <form onSubmit={submit} className="card">
        <label>
          房間號碼
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={8}
            placeholder="例如 K7PQ2M"
            required
          />
        </label>
        <label>
          暱稱或學號
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={12} autoComplete="off" placeholder="例如 5B-12" required />
          <small>不要輸入真實全名。</small>
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-xl" disabled={busy}>
          {busy ? '加入中…' : '出發！'}
        </button>
      </form>
    </main>
  );
}

function Play({ roomId, uid, alias, onLeave }: { roomId: string; uid: string; alias: string; onLeave: () => void }) {
  const connected = useConnected(db);
  const { value: session, loading } = useDbValue<Session>(db, `sessions/${roomId}`);
  const qid = session?.questionId || null;
  const { value: mine } = useDbValue<{ choice: number }>(db, qid ? `sessionAnswers/${roomId}/${qid}/${uid}` : null);
  const showReveal = session?.status === 'ANSWER_REVEALED';
  const { value: reveal } = useDbValue<Reveal>(db, showReveal && qid ? `sessionReveals/${roomId}/${qid}` : null);
  // Local "submitting…" state is scoped to one question + stage, so it resets when the teacher moves on.
  const stageKey = `${qid}|${session?.status}`;
  const [local, setLocal] = useState<{ key: string; pending: number | null; message: string }>({ key: '', pending: null, message: '' });
  const pending = local.key === stageKey ? local.pending : null;
  const message = local.key === stageKey ? local.message : '';

  if (loading) return <div className="center-screen">載入中…</div>;
  if (!session)
    return (
      <div className="center-screen">
        <p>找不到房間，可能已經結束。</p>
        <button className="btn" onClick={onLeave}>重新加入</button>
      </div>
    );

  const quest = demoBank.quests[session.questIndex];
  const question = quest?.questions[session.questionIndex];
  const answered = mine?.choice ?? null;
  const canAnswer = session.status === 'QUESTION_OPEN' && answered === null && pending === null && connected;

  async function choose(i: number) {
    if (!canAnswer || !question) return;
    setLocal({ key: stageKey, pending: i, message: '' });
    const result = await submitAnswer(db, roomId, question.id, uid, i);
    if (result === 'rejected') setLocal({ key: stageKey, pending: null, message: '現在不能作答，請看老師的指示。' });
  }

  let body;
  if (session.status === 'FINISHED') {
    body = (
      <div className="stage-msg">
        <div className="big-icon">🏆</div>
        <h2>冒險完成！</h2>
        <p>謝謝你，{alias}！</p>
      </div>
    );
  } else if (session.status === 'LOBBY' || !question) {
    body = (
      <div className="stage-msg">
        <div className="big-icon">🗺️</div>
        <h2>等待老師開始冒險…</h2>
        <p>請看大螢幕。</p>
      </div>
    );
  } else if (session.status === 'QUEST_COMPLETED') {
    body = (
      <div className="stage-msg">
        <div className="big-icon">{quest.icon}</div>
        <h2>完成關卡：{quest.title}！</h2>
        <p>等待老師打開下一關。</p>
      </div>
    );
  } else {
    const chosen = answered ?? pending;
    const correct = showReveal && typeof reveal?.correct === 'number' ? reveal.correct : null;
    body = (
      <section className="question" aria-live="polite">
        <p className="quest-tag">{quest.icon} {quest.title}</p>
        <h2>{question.prompt}</h2>
        <QuestionMedia question={question} />
        {question.kind === 'listening' && <p className="hint">🔊 請留心聽老師播放的聲音。</p>}
        {question.kind === 'reflection' ? (
          <p className="stage-msg-inline">💬 請和老師、同學一起討論。</p>
        ) : (
          <div className="options">
            {question.options.map((opt, i) => {
              const cls = ['option'];
              if (chosen === i) cls.push('chosen');
              if (correct !== null && i === correct) cls.push('correct');
              if (correct !== null && chosen === i && i !== correct) cls.push('wrong');
              return (
                <button key={i} className={cls.join(' ')} disabled={!canAnswer} onClick={() => choose(i)} aria-pressed={chosen === i}>
                  <span className="letter">{LETTERS[i]}</span>
                  {opt}
                </button>
              );
            })}
          </div>
        )}
        <StatusLine status={session.status} answered={chosen !== null} confirmed={answered !== null} correct={correct} chosen={chosen} />
        {message && <p className="error" role="alert">{message}</p>}
        {showReveal && reveal?.explanation && <p className="explanation">💡 {reveal.explanation}</p>}
      </section>
    );
  }

  return (
    <main className="student">
      <header className="student-bar">
        <span>👤 {alias}</span>
        <span className={connected ? 'dot online' : 'dot offline'}>{connected ? '已連線' : '重新連線中…'}</span>
      </header>
      {body}
    </main>
  );
}

function StatusLine(p: { status: Session['status']; answered: boolean; confirmed: boolean; correct: number | null; chosen: number | null }) {
  if (p.status === 'ANSWER_REVEALED') {
    if (p.correct === null) return <p className="status">老師已揭曉。</p>;
    if (p.chosen === null) return <p className="status">你這題沒有作答。</p>;
    return p.chosen === p.correct ? <p className="status good">✨ 答對了！</p> : <p className="status">再想想看，聽聽老師的解說。</p>;
  }
  if (p.status === 'QUESTION_PAUSED') return <p className="status warn">⏸️ 老師暫停了作答。</p>;
  if (p.status === 'QUESTION_CLOSED') return <p className="status">{p.confirmed ? '已提交，等待老師揭曉答案。' : '作答時間結束。'}</p>;
  if (p.confirmed) return <p className="status good">✅ 已提交！等待老師揭曉答案。</p>;
  if (p.answered) return <p className="status">提交中…</p>;
  return <p className="status">選一個答案。</p>;
}
