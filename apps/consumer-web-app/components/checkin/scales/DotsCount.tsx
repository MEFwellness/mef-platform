'use client';

/** "count" — dots that fill left to right, tapping a dot sets the count to its position (a 0-based count question's first dot is 0, matching how a rating widget's first star still means "one"). */

import { selectWithFeedback, SCALE_LABEL } from './shared';

export function DotsCount({
  question,
  options,
  value,
  onChange,
}: {
  question: string;
  options: readonly number[];
  value: number | null;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <p className={SCALE_LABEL}>{question}</p>
      <div className="mt-3 flex w-full items-center gap-2" role="group" aria-label={question}>
        {options.map((optionValue) => {
          const isFilled = value !== null && optionValue <= value;
          const isSelected = value === optionValue;
          return (
            <button
              key={optionValue}
              type="button"
              onClick={() => selectWithFeedback(onChange, optionValue)}
              aria-pressed={isSelected}
              aria-label={String(optionValue)}
              className="mef-press flex min-w-0 flex-1 flex-col items-center gap-1"
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full border text-[12px] font-semibold transition-all duration-200 ease-out ${
                  isFilled
                    ? 'scale-105 border-[#1B3A2D] bg-[#1B3A2D] text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.4)]'
                    : 'border-[#1B3A2D]/15 bg-white text-[#6B7A72]'
                }`}
              >
                {optionValue}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
