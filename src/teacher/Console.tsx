import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { getTeacherClient } from '../services/firebase';
import { useDbValue } from '../services/hooks';
import { ActionError, endSession, openQuestion, revealAnswer, setStatus, summarize } from '../services/session';
import { CAN_CHANGE_QUESTION_FROM, primaryAction, questStates } from '../shared/stateMachine';
import { QuestionMedia } from '../shared/QuestionMedia';
import type { AnswerKeys, Participant, Presence, QuestionBank, QuestionResult, Reveal, Session } from '../shared/types';
import { WorldMap } from './WorldMap';

const { db } = getTeacherClient();

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

const STATUS_LABEL: Record<Session['status'], string> = {
  LOBBY: 'Waiting 等候中',
  QUESTION_OPEN: 'Answering 作答中',
  QUESTION_PAUSED: 'Paused 已暫停',
  QUESTION_CLOSED: 'Closed 已截止',
  ANSWER_REVEALED: 'Revealed 已揭曉',
  QUEST_COMPLETED: 'Quest cleared 關卡完成',
  FINISHED: 'Finished 已結束',
};

interface Props {
  roomId: string;
  session: Session;
  bank: QuestionBank;
  keys: AnswerKeys | null;
  connected: boolean;
  onLeave: () => void;
}

export function Console({ roomId, session, bank, keys, connected, onLeave }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showDist, setShowDist] = useState(false);
  const [view, setView] = useState<'play' | 'results'>('play');
  const { value: participants } = useDbValue<Record<string, Participant>>(db, `sessionParticipants/${roomId}`);
  const { value: presence } = useDbValue<Record<string, Presence>>(db, `sessionPresence/${roomId}`);
  const qid = session.questionId || null;
  const { value: answers } = useDbValue<Record<string, { choice: number }>>(db, qid ? `sessionAnswers/${roomId}/${qid}` : null);
  const { value: reveal } = useDbValue<Reveal>(db, qid && session.status === 'ANSWER_REVEALED' ? `sessionReveals/${roomId}/${qid}` : null);

  const quest = bank.quests[session.questIndex];
  const question = quest?.questions[session.questionIndex];
  const joined = Object.keys(participants ?? {}).length;
  const online = Object.entries(presence ?? {}).filter(([uid, p]) => p.online && participants?.[uid]).length;
  const live = summarize(answers, session.optionCount, null);
  const states = questStates(bank, session);
  const primary = primaryAction(bank, session);
  const showQuestion = question && session.status !== 'LOBBY' && session.status !== 'QUEST_COMPLETED' && session.status !== 'FINISHED';

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      // A rejected write usually means another tab advanced first; the live listener re-syncs.
      setError(err instanceof ActionError ? err.message : 'Action rejected — screen refreshed with the latest state. 操作未完成，請再按一次。');
    } finally {
      setBusy(false);
    }
  }

  function doPrimary() {
    switch (primary.kind) {
      case 'open':
        return run(() => openQuestion(db, roomId, session, bank, primary.pos));
      case 'close':
        return run(() => setStatus(db, roomId, session, 'QUESTION_CLOSED'));
      case 'reveal':
        return run(() => revealAnswer(db, roomId, session, keys));
      case 'completeQuest':
        return run(() => setStatus(db, roomId, session, 'QUEST_COMPLETED'));
      case 'finish':
        if (session.status !== 'FINISHED' && confirm('End the session? 結束這節課的房間？')) return run(() => endSession(db, roomId, session));
    }
  }

  const primaryLabel = {
    open: session.questionIndex < 0 ? 'Start adventure 開始冒險 ▶' : 'Next question 下一題 ▶',
    close: 'Close answers 截止作答',
    reveal: 'Reveal answer 揭曉答案',
    completeQuest: 'Clear quest 完成關卡 🏁',
    finish: 'Finish 結束冒險',
  }[primary.kind];

  const canJump = CAN_CHANGE_QUESTION_FROM.includes(session.status);

  return (
    <main className="console">
      <header className="console-bar">
        <JoinInfo code={session.roomCode} />
        <div className="stats">
          <span><b>{joined}</b> joined 已加入</span>
          <span><b>{online}</b> online 在線</span>
          <span className={connected ? 'dot online' : 'dot offline'}>{connected ? 'Connected' : 'Reconnecting… 重新連線中'}</span>
        </div>
        <div className="bar-actions">
          <button className="btn btn-ghost" onClick={() => setView(view === 'play' ? 'results' : 'play')}>
            {view === 'play' ? 'Results 結果' : 'Back to map 返回'}
          </button>
          {session.status === 'FINISHED' ? (
            <button className="btn" onClick={onLeave}>New session 新房間</button>
          ) : (
            <button className="btn btn-danger" disabled={busy} onClick={() => confirm('End the session? 結束房間？') && run(() => endSession(db, roomId, session))}>
              End 結束
            </button>
          )}
        </div>
      </header>

      {bank.demo && <p className="notice slim">Demo question bank — not the confirmed lesson scope. 示範題庫</p>}
      {error && <p className="error slim" role="alert">{error}</p>}

      {view === 'results' ? (
        <Results roomId={roomId} bank={bank} />
      ) : (
        <div className="console-main">
          <WorldMap
            bank={bank}
            states={states}
            currentIndex={session.questIndex}
            onSelect={
              canJump && session.status !== 'FINISHED'
                ? (i) => {
                    if (confirm(`Jump to ${bank.quests[i].title}? 前往這一關？`))
                      run(() => openQuestion(db, roomId, session, bank, { questIndex: i, questionIndex: 0 }));
                  }
                : undefined
            }
          />

          <section className="panel">
            <div className="panel-head">
              <span className={`badge s-${session.status}`}>{STATUS_LABEL[session.status]}</span>
              {quest && session.questionIndex >= 0 && <span className="muted">{quest.icon} {quest.title} · Q{session.questionIndex + 1}/{quest.questions.length}</span>}
            </div>

            {showQuestion ? (
              <>
                <h2 className="t-prompt">{question.prompt}</h2>
                <QuestionMedia question={question} />
                {question.kind === 'listening' && <AudioPlayer url={question.audioUrl} />}
                {question.kind !== 'reflection' && (
                  <ol className="t-options">
                    {question.options.map((opt, i) => {
                      const isCorrect = session.status === 'ANSWER_REVEALED' && reveal?.correct === i;
                      const visible = session.status === 'ANSWER_REVEALED' || showDist;
                      const pct = live.total ? Math.round((live.counts[i] / live.total) * 100) : 0;
                      return (
                        <li key={i} className={isCorrect ? 'correct' : ''}>
                          <span className="letter">{LETTERS[i]}</span>
                          <span className="opt-text">{opt}</span>
                          {visible && (
                            <span className="bar" aria-label={`${live.counts[i]} answers`}>
                              <span style={{ width: `${pct}%` }} />
                              <em>{live.counts[i]}</em>
                            </span>
                          )}
                          {isCorrect && <span aria-label="correct">✔</span>}
                        </li>
                      );
                    })}
                  </ol>
                )}
                {question.kind !== 'reflection' && (
                  <p className="count-line">
                    <b>{live.total}</b> / {joined} answered 已作答
                    {session.status !== 'ANSWER_REVEALED' && (
                      <label className="toggle">
                        <input type="checkbox" checked={showDist} onChange={(e) => setShowDist(e.target.checked)} /> show distribution 顯示分佈
                      </label>
                    )}
                  </p>
                )}
                {session.status === 'ANSWER_REVEALED' && (
                  <div className="explanation">
                    {question.kind !== 'reflection' && reveal?.correct === undefined && <p className="error">No answer key for this question.</p>}
                    {reveal?.explanation && <p>💡 {reveal.explanation}</p>}
                    {live.total > 0 && typeof reveal?.correct === 'number' && (
                      <p>
                        Correct 答對：<b>{live.counts[reveal.correct] ?? 0}</b> / {live.total}
                      </p>
                    )}
                  </div>
                )}
                {question.teacherNote && <p className="teacher-note">📝 {question.teacherNote}</p>}
              </>
            ) : (
              <div className="stage-msg">
                {session.status === 'FINISHED' ? (
                  <h2>🏆 Adventure complete 冒險完成</h2>
                ) : session.status === 'QUEST_COMPLETED' ? (
                  <h2>{quest?.icon} {quest?.title} cleared! 關卡完成</h2>
                ) : (
                  <h2>Waiting screen 等候畫面 — pupils join with the code above</h2>
                )}
              </div>
            )}

            <div className="controls">
              {session.status !== 'FINISHED' && (
                <button className="btn btn-primary btn-xl" disabled={busy || !connected} onClick={doPrimary}>
                  {primaryLabel}
                </button>
              )}
              {session.status === 'QUESTION_OPEN' && (
                <button className="btn btn-xl" disabled={busy} onClick={() => run(() => setStatus(db, roomId, session, 'QUESTION_PAUSED'))}>
                  ⏸ Pause 暫停
                </button>
              )}
              {session.status === 'QUESTION_PAUSED' && (
                <button className="btn btn-xl" disabled={busy} onClick={() => run(() => setStatus(db, roomId, session, 'QUESTION_OPEN'))}>
                  ▶ Resume 繼續
                </button>
              )}
              {(session.status === 'ANSWER_REVEALED' || session.status === 'QUEST_COMPLETED') && (
                <button className="btn" disabled={busy} onClick={() => run(() => setStatus(db, roomId, session, 'LOBBY'))}>
                  Waiting screen 等候畫面
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function JoinInfo({ code }: { code: string }) {
  const url = `${window.location.origin}/join?code=${code}`;
  const [qr, setQr] = useState('');
  const [big, setBig] = useState(false);
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 360 }).then(setQr, () => setQr(''));
  }, [url]);
  return (
    <>
      <button className="join-info" onClick={() => setBig(true)} aria-label={`Room code ${code}. Show QR code`}>
        {qr && <img src={qr} alt="" width={56} height={56} />}
        <span>
          <small>{window.location.host}/join</small>
          <strong className="code">{code}</strong>
        </span>
      </button>
      {big && (
        <div className="overlay" role="dialog" aria-label="Join code" onClick={() => setBig(false)}>
          <div className="overlay-card">
            {qr ? <img src={qr} alt={`QR code for ${url}`} width={360} height={360} /> : <p>{url}</p>}
            <p className="code huge">{code}</p>
            <p>{window.location.host}/join</p>
            <button className="btn">Close 關閉</button>
          </div>
        </div>
      )}
    </>
  );
}

/** Classroom listening happens on the projector only; pupils' iPads never autoplay. */
function AudioPlayer({ url }: { url?: string }) {
  const [failed, setFailed] = useState(false);
  if (!url) return <p className="media-fallback">🔇 No audio file yet — add audioUrl in the question bank. 尚未加入音檔，可現場示範或播放其他錄音。</p>;
  if (failed) return <p className="media-fallback">⚠️ Audio failed to load. Play from another source and continue. 音檔未能載入。</p>;
  return <audio className="audio" controls preload="auto" src={url} onError={() => setFailed(true)} />;
}

function Results({ roomId, bank }: { roomId: string; bank: QuestionBank }) {
  const { value } = useDbValue<Record<string, QuestionResult>>(db, `sessionResults/${roomId}`);
  const rows = useMemo(() => bank.quests.flatMap((q) => q.questions.map((question) => ({ quest: q, question, result: value?.[question.id] }))), [bank, value]);
  return (
    <section className="results card">
      <h2>Formative results 課堂結果 (class totals only)</h2>
      <table>
        <thead>
          <tr>
            <th>Quest</th>
            <th>Question 題目</th>
            <th>Answered</th>
            <th>Correct</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ quest, question, result }) => (
            <tr key={question.id}>
              <td>{quest.icon}</td>
              <td>{question.prompt}</td>
              <td>{result ? result.total : '—'}</td>
              <td>{result && question.kind !== 'reflection' ? `${result.correct} (${result.total ? Math.round((result.correct / result.total) * 100) : 0}%)` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
