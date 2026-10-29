import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { canTransition, nextPosition, primaryAction, questStates, TRANSITIONS } from './stateMachine';
import { cleanAlias, generateRoomCode, isValidChoice, isValidRoomCode, normalizeRoomCode, ROOM_CODE_ALPHABET } from './validation';
import { demoBank } from '../content/demoBank';
import { summarize } from '../services/session';
import type { Session, SessionStatus } from './types';

const base: Session = {
  owner: 't', roomCode: 'ABCDEF', bankId: 'demo', status: 'LOBBY', questIndex: 0, questionIndex: -1,
  questionId: '', optionCount: 0, rev: 0, createdAt: 0, updatedAt: 0,
};

describe('state machine', () => {
  it('follows the documented flow and allows resume from pause', () => {
    expect(canTransition('LOBBY', 'QUESTION_OPEN')).toBe(true);
    expect(canTransition('QUESTION_OPEN', 'QUESTION_PAUSED')).toBe(true);
    expect(canTransition('QUESTION_PAUSED', 'QUESTION_OPEN')).toBe(true);
    expect(canTransition('QUESTION_CLOSED', 'ANSWER_REVEALED')).toBe(true);
    expect(canTransition('ANSWER_REVEALED', 'QUEST_COMPLETED')).toBe(true);
  });
  it('blocks skipping stages and leaving FINISHED', () => {
    expect(canTransition('QUESTION_OPEN', 'ANSWER_REVEALED')).toBe(false);
    expect(canTransition('LOBBY', 'ANSWER_REVEALED')).toBe(false);
    expect(canTransition('QUESTION_CLOSED', 'QUESTION_OPEN')).toBe(false);
    for (const to of Object.keys(TRANSITIONS) as SessionStatus[]) expect(canTransition('FINISHED', to)).toBe(false);
  });
  it('every status can reach FINISHED', () => {
    for (const s of Object.keys(TRANSITIONS) as SessionStatus[]) if (s !== 'FINISHED') expect(canTransition(s, 'FINISHED')).toBe(true);
  });
  it('walks the whole bank in order', () => {
    let pos = { questIndex: 0, questionIndex: -1 };
    const seen: string[] = [];
    for (let p = nextPosition(demoBank, pos); p; p = nextPosition(demoBank, pos)) {
      pos = p;
      seen.push(demoBank.quests[p.questIndex].questions[p.questionIndex].id);
    }
    expect(seen).toEqual(demoBank.quests.flatMap((q) => q.questions.map((x) => x.id)));
  });
  it('primary action progresses open → close → reveal → next / clear quest', () => {
    expect(primaryAction(demoBank, base)).toEqual({ kind: 'open', pos: { questIndex: 0, questionIndex: 0 } });
    const open = { ...base, status: 'QUESTION_OPEN' as const, questionIndex: 0 };
    expect(primaryAction(demoBank, open).kind).toBe('close');
    expect(primaryAction(demoBank, { ...open, status: 'QUESTION_CLOSED' }).kind).toBe('reveal');
    expect(primaryAction(demoBank, { ...open, status: 'ANSWER_REVEALED' })).toEqual({ kind: 'open', pos: { questIndex: 0, questionIndex: 1 } });
    const last = { ...open, status: 'ANSWER_REVEALED' as const, questionIndex: demoBank.quests[0].questions.length - 1 };
    expect(primaryAction(demoBank, last).kind).toBe('completeQuest');
    expect(primaryAction(demoBank, { ...last, status: 'QUEST_COMPLETED' })).toEqual({ kind: 'open', pos: { questIndex: 1, questionIndex: 0 } });
    const end = { ...base, status: 'QUEST_COMPLETED' as const, questIndex: 3, questionIndex: demoBank.quests[3].questions.length - 1 };
    expect(primaryAction(demoBank, end).kind).toBe('finish');
  });
  it('quest map states', () => {
    expect(questStates(demoBank, { status: 'QUESTION_OPEN', questIndex: 1, questionIndex: 0 })).toEqual(['done', 'current', 'locked', 'locked']);
    expect(questStates(demoBank, { status: 'QUEST_COMPLETED', questIndex: 1, questionIndex: 2 })).toEqual(['done', 'done', 'locked', 'locked']);
    expect(questStates(demoBank, { status: 'FINISHED', questIndex: 1, questionIndex: 0 })).toEqual(['done', 'done', 'done', 'done']);
  });
});

describe('validation', () => {
  it('room codes use the unambiguous alphabet and match the rules pattern', () => {
    for (let i = 0; i < 500; i++) {
      const c = generateRoomCode();
      expect(isValidRoomCode(c)).toBe(true);
      expect([...c].every((ch) => ROOM_CODE_ALPHABET.includes(ch))).toBe(true);
    }
    expect(isValidRoomCode('ABC0EF')).toBe(false);
    expect(isValidRoomCode('ABCDE')).toBe(false);
    expect(normalizeRoomCode(' k7p-q2m ')).toBe('K7PQ2M');
  });
  it('database rules use the same room code pattern', () => {
    const rules = readFileSync(new URL('../../database.rules.json', import.meta.url), 'utf8');
    expect(rules).toContain('[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}');
  });
  it('aliases', () => {
    expect(cleanAlias('  5B  12 ')).toBe('5B 12');
    expect(cleanAlias('小明')).toBe('小明');
    expect(cleanAlias('')).toBeNull();
    expect(cleanAlias('   ')).toBeNull();
    expect(cleanAlias('a'.repeat(13))).toBeNull();
    expect(cleanAlias('me@school.hk')).toBeNull();
    expect(cleanAlias('<b>')).toBeNull();
  });
  it('choices', () => {
    expect(isValidChoice(0, 4)).toBe(true);
    expect(isValidChoice(3, 4)).toBe(true);
    expect(isValidChoice(4, 4)).toBe(false);
    expect(isValidChoice(1.5, 4)).toBe(false);
    expect(isValidChoice('1', 4)).toBe(false);
    expect(isValidChoice(0, 0)).toBe(false);
  });
});

describe('summarize', () => {
  it('counts valid answers only', () => {
    const r = summarize({ a: { choice: 1 }, b: { choice: 1 }, c: { choice: 2 }, d: { choice: 9 } }, 4, 1);
    expect(r).toEqual({ total: 3, correct: 2, counts: [0, 2, 1, 0] });
    expect(summarize(null, 4, null)).toEqual({ total: 0, correct: 0, counts: [0, 0, 0, 0] });
  });
});

describe('demo content', () => {
  const keys = JSON.parse(readFileSync(new URL('../../content/answer-keys.demo.json', import.meta.url), 'utf8'));
  const questions = demoBank.quests.flatMap((q) => q.questions);

  it('public bank contains no answer fields', () => {
    const json = JSON.stringify(demoBank);
    expect(json).not.toMatch(/"correct"|"answer"|"explanation"/);
  });
  it('has four quests with unique question ids', () => {
    expect(demoBank.quests).toHaveLength(4);
    expect(new Set(questions.map((q) => q.id)).size).toBe(questions.length);
  });
  it('every question has a key, and keys are in range', () => {
    for (const q of questions) {
      const k = keys[q.id];
      expect(k, q.id).toBeDefined();
      if (q.kind === 'reflection') expect(q.options).toHaveLength(0);
      else expect(q.options.length).toBeGreaterThanOrEqual(2);
      if (k.correct !== null) expect(isValidChoice(k.correct, q.options.length)).toBe(true);
    }
    expect(Object.keys(keys).sort()).toEqual(questions.map((q) => q.id).sort());
  });
  it('instrument family answers match the standard 吹拉彈打 classification', () => {
    const families = ['吹管樂器', '拉弦樂器', '彈撥樂器', '敲擊樂器'];
    expect(families[keys['gate-1'].correct]).toBe('拉弦樂器'); // 二胡
    expect(families[keys['gate-2'].correct]).toBe('吹管樂器'); // 笛子
    expect(families[keys['gate-3'].correct]).toBe('彈撥樂器'); // 琵琶
    expect(families[keys['gate-4'].correct]).toBe('敲擊樂器'); // 堂鼓
  });
});
