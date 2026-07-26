'use client';

/** Sleep quality — "five moons that fill." Tapping a moon fills it and every moon before it, the same cumulative-rating convention a star rating uses. */

import { Moon } from 'lucide-react';
import { selectWithFeedback, SCALE_LABEL } from './shared';

export function FiveMoonsScale({
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
      <div className="mt-3 flex w-full items-center gap-1.5" role="group" aria-label={question}>
        {labels.map((word, index) => {
          const optionValue = index + 1;
          const isFilled = value !== null && optionValue <= value;
          const isSelected = value === optionValue;
          return (
            <button
              key={word}
              type="button"
              onClick={() => selectWithFeedback(onChange, optionValue)}
              aria-pressed={isSelected}
              aria-label={word}
              title={word}
              className="mef-press flex min-w-0 flex-1 flex-col items-center gap-1.5 py-1"
            >
              <Moon
                className={`h-6 w-6 transition-all duration-200 ease-out ${isSelected ? 'scale-110' : ''}`}
                fill={isFilled ? '#C4A050' : 'none'}
                stroke="#1B3A2D"
                strokeWidth={1.5}
                strokeOpacity={isFilled ? 1 : 0.4}
                aria-hidden="true"
              />
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
