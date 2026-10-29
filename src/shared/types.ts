export type SessionStatus =
  | 'LOBBY'
  | 'QUESTION_OPEN'
  | 'QUESTION_PAUSED'
  | 'QUESTION_CLOSED'
  | 'ANSWER_REVEALED'
  | 'QUEST_COMPLETED'
  | 'FINISHED';

/** Shape of `sessions/{roomId}` in the Realtime Database. Contains no answer keys. */
export interface Session {
  owner: string;
  roomCode: string;
  bankId: string;
  status: SessionStatus;
  /** Position of the most recently opened question (questionIndex -1 = nothing opened yet). */
  questIndex: number;
  questionIndex: number;
  questionId: string;
  /** Number of valid choices for the current question; 0 = not auto-scored (reflection). */
  optionCount: number;
  /** Incremented on every teacher write; rules reject stale writes. */
  rev: number;
  createdAt: number;
  updatedAt: number;
}

export type QuestionKind = 'choice' | 'image' | 'listening' | 'rhythm' | 'reflection';

/** Public question content. Safe to ship to every device — no correct answer here. */
export interface Question {
  id: string;
  kind: QuestionKind;
  prompt: string;
  options: string[];
  imageUrl?: string;
  imageAlt?: string;
  audioUrl?: string;
  /** Large notation text shown to the class, e.g. "♩ ♩ ♫ ♩". */
  rhythm?: string;
  /** Teacher-only hint for follow-up activity (clap, perform, discuss). */
  teacherNote?: string;
}

export interface Quest {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  questions: Question[];
}

export interface QuestionBank {
  id: string;
  title: string;
  /** True for the shipped demo bank; the UI shows a "demo content" notice. */
  demo: boolean;
  quests: Quest[];
}

/** Stored separately at `answerKeys/{bankId}/{questionId}`; readable by teachers only. */
export interface AnswerKey {
  correct: number | null;
  explanation: string;
}

export type AnswerKeys = Record<string, AnswerKey>;

export interface Reveal {
  correct: number | null;
  explanation: string;
}

export interface QuestionResult {
  total: number;
  correct: number;
  counts: number[];
}

export interface Participant {
  alias: string;
  joinedAt: number;
}

export interface Presence {
  online: boolean;
  lastSeen: number;
}
