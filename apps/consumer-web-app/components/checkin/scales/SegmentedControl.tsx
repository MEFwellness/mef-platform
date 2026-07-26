'use client';

/** The generic "scale" default — a single-row segmented control, equal-width segments, never wrapping. Used for any scale question with no more purpose-built treatment (pain, soreness, sleep duration, and every non-mood/energy/stress/sleep-quality scale a coach adds later). */

import { selectWithFeedback, SCALE_LABEL } from './shared';

export function SegmentedControl<T extends string | number>({
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
        className="mt-3 flex w-full items-stretch gap-1 rounded-full border border-[#1B3A2D]/10 bg-white p-1"
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
              title={option.label}
              className={`mef-press min-w-0 flex-1 truncate rounded-full px-1.5 py-2 text-[12px] font-medium transition-all duration-200 ease-out ${
                isSelected
                  ? 'scale-105 bg-[#1B3A2D] text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)]'
                  : 'text-[#6B7A72] hover:text-[#1B3A2D]'
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
