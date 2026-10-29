import type { QuestionBank, Session, SessionStatus } from './types';

/**
 * Allowed status transitions. database.rules.json enforces the same table server-side;
 * keep them in sync (tests/rules.test.ts checks the rules against this table).
 */
export const TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  LOBBY: ['QUESTION_OPEN', 'FINISHED'],
  QUESTION_OPEN: ['QUESTION_PAUSED', 'QUESTION_CLOSED', 'FINISHED'],
  QUESTION_PAUSED: ['QUESTION_OPEN', 'QUESTION_CLOSED', 'FINISHED'],
  QUESTION_CLOSED: ['ANSWER_REVEALED', 'FINISHED'],
  ANSWER_REVEALED: ['QUESTION_OPEN', 'QUEST_COMPLETED', 'LOBBY', 'FINISHED'],
  QUEST_COMPLETED: ['QUESTION_OPEN', 'LOBBY', 'FINISHED'],
  FINISHED: [],
};

/** Statuses from which the teacher may open a different question. */
export const CAN_CHANGE_QUESTION_FROM: SessionStatus[] = ['LOBBY', 'ANSWER_REVEALED', 'QUEST_COMPLETED'];

export function canTransition(from: SessionStatus, to: SessionStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export interface Position {
  questIndex: number;
  questionIndex: number;
}

/** The question after `pos`, crossing into the next quest; null when the bank is exhausted. */
export function nextPosition(bank: QuestionBank, pos: Position): Position | null {
  const quest = bank.quests[pos.questIndex];
  if (quest && pos.questionIndex + 1 < quest.questions.length) {
    return { questIndex: pos.questIndex, questionIndex: pos.questionIndex + 1 };
  }
  for (let q = pos.questIndex + 1; q < bank.quests.length; q++) {
    if (bank.quests[q].questions.length > 0) return { questIndex: q, questionIndex: 0 };
  }
  return null;
}

export function isLastInQuest(bank: QuestionBank, pos: Position): boolean {
  const quest = bank.quests[pos.questIndex];
  return !quest || pos.questionIndex >= quest.questions.length - 1;
}

export type QuestState = 'done' | 'current' | 'locked';

/** Map display state of each quest, derived from session position. */
export function questStates(bank: QuestionBank, s: Pick<Session, 'status' | 'questIndex' | 'questionIndex'>): QuestState[] {
  return bank.quests.map((_, i) => {
    if (s.status === 'FINISHED') return 'done';
    if (i < s.questIndex) return 'done';
    if (i === s.questIndex) {
      if (s.status === 'QUEST_COMPLETED') return 'done';
      if (s.status === 'LOBBY' && isLastInQuest(bank, s) && s.questionIndex >= 0) return 'done';
      return 'current';
    }
    return 'locked';
  });
}

/** The single "main" next action for the teacher's big button. */
export type PrimaryAction =
  | { kind: 'open'; pos: Position }
  | { kind: 'close' }
  | { kind: 'reveal' }
  | { kind: 'completeQuest' }
  | { kind: 'finish' };

export function primaryAction(bank: QuestionBank, s: Session): PrimaryAction {
  const pos = { questIndex: s.questIndex, questionIndex: s.questionIndex };
  switch (s.status) {
    case 'QUESTION_OPEN':
    case 'QUESTION_PAUSED':
      return { kind: 'close' };
    case 'QUESTION_CLOSED':
      return { kind: 'reveal' };
    case 'ANSWER_REVEALED':
      if (isLastInQuest(bank, pos)) return { kind: 'completeQuest' };
      return { kind: 'open', pos: nextPosition(bank, pos)! };
    case 'LOBBY':
    case 'QUEST_COMPLETED': {
      const next = nextPosition(bank, pos);
      return next ? { kind: 'open', pos: next } : { kind: 'finish' };
    }
    case 'FINISHED':
      return { kind: 'finish' };
  }
}
