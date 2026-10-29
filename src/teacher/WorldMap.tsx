import type { QuestState } from '../shared/stateMachine';
import type { QuestionBank } from '../shared/types';

// Node positions on a 1000x560 map, following the winding road.
const NODES = [
  { x: 150, y: 420 },
  { x: 390, y: 210 },
  { x: 640, y: 400 },
  { x: 860, y: 160 },
];

interface Props {
  bank: QuestionBank;
  states: QuestState[];
  currentIndex: number;
  onSelect?: (questIndex: number) => void;
}

export function WorldMap({ bank, states, currentIndex, onSelect }: Props) {
  return (
    <section className="map" aria-label="Quest map 冒險地圖">
      <svg viewBox="0 0 1000 560" role="img" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#24345c" />
            <stop offset="1" stopColor="#3f6b5a" />
          </linearGradient>
        </defs>
        <rect width="1000" height="560" fill="url(#sky)" />
        {/* hills */}
        <path d="M0 470 Q180 380 360 460 T720 440 T1000 420 V560 H0Z" fill="#2f5446" />
        <path d="M0 520 Q250 460 500 520 T1000 500 V560 H0Z" fill="#284638" />
        {/* forest */}
        {[300, 340, 380, 430, 470].map((x, i) => (
          <path key={x} d={`M${x} ${300 - (i % 2) * 18} l22 50 h-44z`} fill="#1e3d31" />
        ))}
        {/* castle */}
        <path d="M820 120 h80 v-40 h-14 v14 h-12 v-14 h-14 v14 h-12 v-14 h-14 v14 h-14 z" fill="#1a2440" opacity=".7" />
        {/* stars */}
        {[[80, 60], [260, 40], [520, 70], [700, 30], [950, 90], [430, 120]].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="2" fill="#f4e7b5" opacity=".8" />
        ))}
        {/* road */}
        <path
          d={`M60 500 Q ${NODES[0].x} ${NODES[0].y + 40} ${NODES[0].x} ${NODES[0].y} T ${NODES[1].x} ${NODES[1].y} T ${NODES[2].x} ${NODES[2].y} T ${NODES[3].x} ${NODES[3].y}`}
          fill="none"
          stroke="#e8d6a3"
          strokeWidth="14"
          strokeDasharray="2 22"
          strokeLinecap="round"
          opacity=".7"
        />
      </svg>
      {bank.quests.slice(0, NODES.length).map((quest, i) => {
        const state = states[i];
        const node = NODES[i];
        return (
          <button
            key={quest.id}
            className={`map-node ${state}${i === currentIndex && state === 'current' ? ' here' : ''}`}
            style={{ left: `${node.x / 10}%`, top: `${(node.y / 560) * 100}%` }}
            disabled={!onSelect}
            onClick={() => onSelect?.(i)}
            aria-label={`${quest.title} — ${state === 'done' ? '已完成' : state === 'current' ? '進行中' : '未解鎖'}`}
          >
            <span className="node-icon">{state === 'locked' ? '🔒' : state === 'done' ? '⭐' : quest.icon}</span>
            <span className="node-title">{quest.title}</span>
            <span className="node-sub">{quest.subtitle}</span>
          </button>
        );
      })}
    </section>
  );
}
