'use client';

/**
 * "single_select" — pills constrained to one row. Options never wrap:
 * each pill is `shrink-0 whitespace-nowrap` and the row scrolls
 * horizontally instead, so this holds regardless of how many options a
 * question has or how long its labels are (some single_select rows have
 * 6-7 multi-word options that would never fit a 375px screen on one
 * line otherwise).
 */

import { selectWithFeedback, SCALE_LABEL } from './shared';

export function PillRow<T extends string>({
  question,
  options,
  value,
  onChange,
}: {
  question: string;
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <p className={SCALE_LABEL}>{question}</p>
      <div
        className="mef-scrollbar-hidden mt-3 flex w-full gap-2 overflow-x-auto pb-0.5"
        role="group"
        aria-label={question}
      >
        {options.map((option) => {
          const isSelected = value === option.value;
          return (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => selectWithFeedback(onChange, option.value)}
              aria-pressed={isSelected}
              className={`mef-press shrink-0 whitespace-nowrap rounded-full border px-3.5 py-2 text-[13px] font-medium transition-all duration-200 ease-out ${
                isSelected
                  ? 'scale-105 border-[#1B3A2D] bg-[#1B3A2D] text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)]'
                  : 'border-[#1B3A2D]/10 bg-white text-[#6B7A72] hover:border-[#1B3A2D]/25 hover:text-[#1B3A2D]'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
