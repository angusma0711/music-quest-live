import {
  get,
  onDisconnect,
  onValue,
  push,
  ref,
  serverTimestamp,
  set,
  update,
  type Database,
} from 'firebase/database';
import { canTransition, CAN_CHANGE_QUESTION_FROM, type Position } from '../shared/stateMachine';
import type { AnswerKeys, QuestionBank, QuestionResult, Session, SessionStatus } from '../shared/types';
import { cleanAlias, generateRoomCode, isValidChoice, normalizeRoomCode, isValidRoomCode } from '../shared/validation';

export class ActionError extends Error {}

// ---------- Teacher ----------

export async function isTeacher(db: Database, uid: string): Promise<boolean> {
  return (await get(ref(db, `teachers/${uid}`))).val() === true;
}

export async function loadAnswerKeys(db: Database, bankId: string): Promise<AnswerKeys | null> {
  return (await get(ref(db, `answerKeys/${bankId}`))).val();
}

/** Creates a session and claims a unique room code atomically (rules reject an existing code). */
export async function createSession(db: Database, uid: string, bankId: string): Promise<{ roomId: string; roomCode: string }> {
  const roomId = push(ref(db, 'sessions')).key!;
  for (let attempt = 0; attempt < 5; attempt++) {
    const roomCode = generateRoomCode();
    try {
      await update(ref(db), {
        [`sessions/${roomId}`]: {
          owner: uid,
          roomCode,
          bankId,
          status: 'LOBBY',
          questIndex: 0,
          questionIndex: -1,
          questionId: '',
          optionCount: 0,
          rev: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        [`roomCodes/${roomCode}`]: { roomId, owner: uid },
      });
      return { roomId, roomCode };
    } catch {
      // Most likely a code collision; try another code.
    }
  }
  throw new ActionError('未能建立房間，請檢查網絡後再試。');
}

function guard(s: Session, to: SessionStatus) {
  if (!canTransition(s.status, to)) throw new ActionError(`不能由 ${s.status} 轉到 ${to}`);
}

/** Every teacher write bumps `rev`; the rules reject writes based on a stale session. */
function sessionPatch(roomId: string, s: Session, fields: Partial<Session> & { status: SessionStatus }) {
  const patch: Record<string, unknown> = {
    [`sessions/${roomId}/rev`]: s.rev + 1,
    [`sessions/${roomId}/updatedAt`]: serverTimestamp(),
  };
  for (const [k, v] of Object.entries(fields)) patch[`sessions/${roomId}/${k}`] = v;
  return patch;
}

export async function setStatus(db: Database, roomId: string, s: Session, to: SessionStatus) {
  guard(s, to);
  await update(ref(db), sessionPatch(roomId, s, { status: to }));
}

export async function openQuestion(db: Database, roomId: string, s: Session, bank: QuestionBank, pos: Position) {
  if (!CAN_CHANGE_QUESTION_FROM.includes(s.status)) throw new ActionError('請先揭曉答案。');
  const q = bank.quests[pos.questIndex]?.questions[pos.questionIndex];
  if (!q) throw new ActionError('找不到題目。');
  await update(
    ref(db),
    sessionPatch(roomId, s, {
      status: 'QUESTION_OPEN',
      questIndex: pos.questIndex,
      questionIndex: pos.questionIndex,
      questionId: q.id,
      optionCount: q.kind === 'reflection' ? 0 : q.options.length,
    }),
  );
}

export function summarize(answers: Record<string, { choice: number }> | null, optionCount: number, correct: number | null): QuestionResult {
  const counts = Array.from({ length: optionCount }, () => 0);
  let total = 0;
  let right = 0;
  for (const a of Object.values(answers ?? {})) {
    if (!isValidChoice(a?.choice, optionCount)) continue;
    counts[a.choice]++;
    total++;
    if (a.choice === correct) right++;
  }
  return { total, correct: right, counts };
}

/** Publishes the answer + explanation to pupils and stores the aggregate result, in one write. */
export async function revealAnswer(db: Database, roomId: string, s: Session, keys: AnswerKeys | null) {
  guard(s, 'ANSWER_REVEALED');
  const key = keys?.[s.questionId];
  const answers = (await get(ref(db, `sessionAnswers/${roomId}/${s.questionId}`))).val();
  const correct = key && typeof key.correct === 'number' ? key.correct : null;
  const reveal: Record<string, unknown> = { explanation: key?.explanation ?? '' };
  if (correct !== null) reveal.correct = correct;
  await update(ref(db), {
    ...sessionPatch(roomId, s, { status: 'ANSWER_REVEALED' }),
    [`sessionReveals/${roomId}/${s.questionId}`]: reveal,
    [`sessionResults/${roomId}/${s.questionId}`]: summarize(answers, s.optionCount, correct),
  });
}

export async function endSession(db: Database, roomId: string, s: Session) {
  await update(ref(db), {
    ...sessionPatch(roomId, s, { status: 'FINISHED' }),
    [`roomCodes/${s.roomCode}`]: null,
  });
}

// ---------- Student ----------

export async function findRoom(db: Database, codeInput: string): Promise<string> {
  const code = normalizeRoomCode(codeInput);
  if (!isValidRoomCode(code)) throw new ActionError('房間號碼應該有 6 個字母或數字。');
  const snap = await get(ref(db, `roomCodes/${code}`));
  if (!snap.exists()) throw new ActionError('找不到這個房間，請再檢查號碼。');
  return snap.val().roomId as string;
}

/** Idempotent: an existing participant (same anonymous uid after reload) keeps their alias. */
export async function joinRoom(db: Database, roomId: string, uid: string, aliasInput: string): Promise<string> {
  const existing = await get(ref(db, `sessionParticipants/${roomId}/${uid}`));
  if (existing.exists()) return existing.val().alias as string;
  const alias = cleanAlias(aliasInput);
  if (!alias) throw new ActionError('請輸入 1–12 個字的暱稱或學號（不要輸入真實全名）。');
  try {
    await set(ref(db, `sessionParticipants/${roomId}/${uid}`), { alias, joinedAt: serverTimestamp() });
  } catch {
    throw new ActionError('未能加入：房間可能已結束。');
  }
  return alias;
}

export async function isParticipant(db: Database, roomId: string, uid: string): Promise<string | null> {
  try {
    const snap = await get(ref(db, `sessionParticipants/${roomId}/${uid}`));
    return snap.exists() ? (snap.val().alias as string) : null;
  } catch {
    return null;
  }
}

/** Keeps `sessionPresence` up to date, including after Wi-Fi drops. Returns an unsubscribe. */
export function trackPresence(db: Database, roomId: string, uid: string): () => void {
  const presenceRef = ref(db, `sessionPresence/${roomId}/${uid}`);
  return onValue(ref(db, '.info/connected'), (snap) => {
    if (snap.val() !== true) return;
    onDisconnect(presenceRef)
      .set({ online: false, lastSeen: serverTimestamp() })
      .then(() => set(presenceRef, { online: true, lastSeen: serverTimestamp() }))
      .catch(() => {});
  });
}

export type SubmitResult = 'accepted' | 'duplicate' | 'rejected';

export async function submitAnswer(db: Database, roomId: string, questionId: string, uid: string, choice: number): Promise<SubmitResult> {
  const answerRef = ref(db, `sessionAnswers/${roomId}/${questionId}/${uid}`);
  try {
    await set(answerRef, { choice, at: serverTimestamp() });
    return 'accepted';
  } catch {
    // The rules refuse a second answer, a closed/paused question, or an invalid choice.
    const mine = await get(answerRef).catch(() => null);
    return mine?.exists() ? 'duplicate' : 'rejected';
  }
}
