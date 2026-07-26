'use client';

/** Stress — "a shape that visibly tightens at higher values." A rounded square whose corners sharpen and whose border thickens as the level rises, from a loose, open shape (very calm) to a tight, hard-edged one (overwhelmed). */

import { selectWithFeedback, SCALE_LABEL } from './shared';

const CORNER_RADIUS = [13, 10, 7, 4, 1.5] as const;
const STROKE_WIDTH = [1.5, 2, 2.5, 3, 3.5] as const;

export function TighteningShapeScale({
  question,
  labels,
  value,
  onChange,
}: {
  question: string;
  labels: readonly string[];
  value: number | null;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <p className={SCALE_LABEL}>{question}</p>
      <div className="mt-3 flex w-full items-stretch gap-1.5" role="group" aria-label={question}>
        {labels.map((word, index) => {
          const optionValue = index + 1;
          const isSelected = value === optionValue;
          return (
            <button
              key={word}
              type="button"
              onClick={() => selectWithFeedback(onChange, optionValue)}
              aria-pressed={isSelected}
              aria-label={word}
              title={word}
              className={`mef-press flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-2xl border py-2.5 transition-all duration-200 ease-out ${
                isSelected
                  ? 'scale-105 border-[#1B3A2D] bg-[#1B3A2D]/[0.04] shadow-[0_4px_16px_-4px_rgba(27,58,45,0.25)]'
                  : 'border-[#1B3A2D]/10 bg-white hover:scale-[1.03]'
              }`}
            >
              <svg viewBox="0 0 28 28" className="h-6 w-6" aria-hidden="true">
                <rect
                  x="3"
                  y="3"
                  width="22"
                  height="22"
                  rx={CORNER_RADIUS[index]}
                  fill="none"
                  stroke={isSelected ? '#1B3A2D' : '#1B3A2D'}
                  strokeOpacity={isSelected ? 1 : 0.4}
                  strokeWidth={STROKE_WIDTH[index]}
                />
              </svg>
              <span className={`truncate text-[10px] font-medium ${isSelected ? 'text-[#1B3A2D]' : 'text-[#6B7A72]'}`}>
                {word}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
