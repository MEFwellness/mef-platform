'use client';

/** Energy — "a vertical fill that rises with the level." Five bars of increasing height (20%/40%/60%/80%/100%), each its own tap target, so the row itself reads as a rising bar chart before anything is even selected. */

import { selectWithFeedback, SCALE_LABEL } from './shared';

const FILL_HEIGHTS = ['30%', '48%', '66%', '84%', '100%'] as const;

export function VerticalFillScale({
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
      <div className="mt-3 flex w-full items-end gap-1.5" role="group" aria-label={question}>
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
              <div className="relative h-12 w-4 overflow-hidden rounded-full bg-[#1B3A2D]/[0.08]">
                <div
                  className={`absolute inset-x-0 bottom-0 rounded-full transition-all duration-300 ease-out ${
                    isSelected ? 'bg-[#1B3A2D]' : 'bg-[#1B3A2D]/25'
                  }`}
                  style={{ height: FILL_HEIGHTS[index] }}
                />
              </div>
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
