import type { QuestionBank } from '../shared/types';

/**
 * DEMO question bank — NOT the confirmed 4 November lesson scope.
 *
 * - This file ships to every device, so it must never contain correct answers.
 *   Answers and explanations live in content/answer-keys.demo.json, which is uploaded to
 *   the teacher-only `answerKeys/demo` path (see README → "Replacing content").
 * - Listening questions have no audioUrl yet: add your own licensed recordings
 *   (e.g. files in public/audio/) before the lesson.
 * - Keep question ids stable once a lesson has started; answers are stored by id.
 */
export const demoBank: QuestionBank = {
  id: 'demo',
  title: '示範題庫（待老師確認）',
  demo: true,
  quests: [
    {
      id: 'gate',
      title: '樂器分類之門',
      subtitle: '把樂器放回吹、拉、彈、打四大家族',
      icon: '🚪',
      questions: [
        {
          id: 'gate-1',
          kind: 'choice',
          prompt: '二胡屬於哪一個樂器家族？',
          options: ['吹管樂器', '拉弦樂器', '彈撥樂器', '敲擊樂器'],
          teacherNote: '可以請同學模仿拉弓的動作。',
        },
        {
          id: 'gate-2',
          kind: 'choice',
          prompt: '笛子屬於哪一個樂器家族？',
          options: ['吹管樂器', '拉弦樂器', '彈撥樂器', '敲擊樂器'],
        },
        {
          id: 'gate-3',
          kind: 'choice',
          prompt: '琵琶屬於哪一個樂器家族？',
          options: ['吹管樂器', '拉弦樂器', '彈撥樂器', '敲擊樂器'],
        },
        {
          id: 'gate-4',
          kind: 'image',
          prompt: '老師展示的樂器是堂鼓。它屬於哪一個家族？',
          options: ['吹管樂器', '拉弦樂器', '彈撥樂器', '敲擊樂器'],
          imageUrl: '',
          imageAlt: '堂鼓圖片（請老師加入圖片）',
          teacherNote: '在 demoBank.ts 加入 imageUrl（例如 /images/tanggu.jpg）。',
        },
        {
          id: 'gate-5',
          kind: 'choice',
          prompt: '下面哪一件樂器「不是」吹管樂器？',
          options: ['嗩吶', '笙', '古箏', '簫'],
        },
      ],
    },
    {
      id: 'forest',
      title: '神秘音色森林',
      subtitle: '用耳朵分辨樂器的聲音',
      icon: '🌲',
      questions: [
        {
          id: 'forest-1',
          kind: 'listening',
          prompt: '聽一聽，這是哪一件樂器的聲音？',
          options: ['二胡', '笛子', '琵琶', '鑼'],
          audioUrl: '',
          teacherNote: '請在大螢幕播放錄音（學生 iPad 不會播放）。尚未加入音檔。',
        },
        {
          id: 'forest-2',
          kind: 'listening',
          prompt: '聽一聽，這件樂器屬於哪一個家族？',
          options: ['吹管樂器', '拉弦樂器', '彈撥樂器', '敲擊樂器'],
          audioUrl: '',
          teacherNote: '尚未加入音檔。',
        },
        {
          id: 'forest-3',
          kind: 'reflection',
          prompt: '你覺得剛才的聲音像甚麼？用一個形容詞說說看。',
          options: [],
          teacherNote: '討論題：不計分。可邀請兩三位同學分享。',
        },
      ],
    },
    {
      id: 'rhythm',
      title: '節奏試煉場',
      subtitle: '看節奏、數拍子、一起拍出來',
      icon: '🥁',
      questions: [
        {
          id: 'rhythm-1',
          kind: 'rhythm',
          prompt: '這組節奏一共有多少拍？',
          rhythm: '♩  ♩  ♫  ♩',
          options: ['3 拍', '4 拍', '5 拍', '6 拍'],
          teacherNote: '揭曉後請全班一起拍一次。',
        },
        {
          id: 'rhythm-2',
          kind: 'rhythm',
          prompt: '「♫」在一拍裏有多少個音？',
          rhythm: '♫',
          options: ['1 個', '2 個', '3 個', '4 個'],
        },
        {
          id: 'rhythm-3',
          kind: 'rhythm',
          prompt: '下面哪一組節奏剛好是 3 拍？',
          options: ['♩ ♩ ♩', '♩ ♫ ♩ ♩', '♫ ♫ ♫ ♫', '♩ ♩'],
          teacherNote: '可以請一位同學拍出正確答案。',
        },
      ],
    },
    {
      id: 'boss',
      title: '音樂守護者',
      subtitle: '最終挑戰：綜合運用',
      icon: '🐉',
      questions: [
        {
          id: 'boss-1',
          kind: 'choice',
          prompt: '用手指撥弦發聲的樂器屬於哪一個家族？',
          options: ['吹管樂器', '拉弦樂器', '彈撥樂器', '敲擊樂器'],
        },
        {
          id: 'boss-2',
          kind: 'choice',
          prompt: '下面哪一組樂器全部都是敲擊樂器？',
          options: ['鑼、鈸、木魚', '二胡、鑼、笙', '笛子、簫、琵琶', '古箏、中阮、二胡'],
        },
        {
          id: 'boss-3',
          kind: 'reflection',
          prompt: '如果要為「勇士打敗守護者」配音樂，你會選哪一個樂器家族？為甚麼？',
          options: [],
          teacherNote: '討論題：不計分。',
        },
      ],
    },
  ],
};
