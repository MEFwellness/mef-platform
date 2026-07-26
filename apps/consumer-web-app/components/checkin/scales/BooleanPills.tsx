'use client';

/** "boolean" — two large pills, side by side, single row by construction (only ever two options). */

import { selectWithFeedback, SCALE_LABEL } from './shared';

export function BooleanPills({
  question,
  value,
  onChange,
  yesLabel = 'Yes',
  noLabel = 'No',
}: {
  question: string;
  value: boolean | null;
  onChange: (value: boolean) => void;
  yesLabel?: string;
  noLabel?: string;
}) {
  return (
    <div>
      <p className={SCALE_LABEL}>{question}</p>
      <div className="mt-3 flex w-full gap-2.5" role="group" aria-label={question}>
        {([
          { value: true, label: yesLabel },
          { value: false, label: noLabel },
        ] as const).map((option) => {
          const isSelected = value === option.value;
          return (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => selectWithFeedback(onChange, option.value)}
              aria-pressed={isSelected}
              className={`mef-press flex-1 rounded-2xl border py-3.5 text-[14px] font-semibold transition-all duration-200 ease-out ${
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
