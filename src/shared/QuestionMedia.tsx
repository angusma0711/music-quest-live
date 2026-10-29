import { useState } from 'react';
import type { Question } from './types';

/** Image / rhythm display with a fallback that never blocks the lesson. */
export function QuestionMedia({ question }: { question: Question }) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <>
      {question.kind === 'image' &&
        (question.imageUrl && !imageFailed ? (
          <img className="q-image" src={question.imageUrl} alt={question.imageAlt ?? ''} onError={() => setImageFailed(true)} />
        ) : (
          <div className="media-fallback" role="img" aria-label={question.imageAlt ?? '圖片'}>
            🖼️ {question.imageAlt ?? '圖片'}
            <small>請看老師的大螢幕</small>
          </div>
        ))}
      {question.rhythm && (
        <div className="rhythm" aria-label={`節奏：${question.rhythm}`}>
          {question.rhythm}
        </div>
      )}
    </>
  );
}
