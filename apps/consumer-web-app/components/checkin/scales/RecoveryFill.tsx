'use client';

/** Evening's "How recovered do you feel?" — a vertical fill rising with the level, dim -> luminous ramp. Same visual family as VerticalFillScale, its own ramp. */

import { triggerHaptic } from '@/lib/haptics';
import { RECOVERY_RAMP, rampColorAt } from '@/lib/checkin-color-ramps';
import { SCALE_LABEL } from './shared';

const FILL_HEIGHTS = ['30%', '48%', '66%', '84%', '100%'] as const;

export function RecoveryFill({
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
          const fill = rampColorAt(RECOVERY_RAMP.from, RECOVERY_RAMP.to, index, labels.length);
          return (
            <button
              key={word}
              type="button"
              onClick={() => {
                triggerHaptic();
                onChange(optionValue);
              }}
              aria-pressed={isSelected}
              aria-label={word}
              title={word}
              className={`mef-press flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-2xl border py-2.5 transition-all duration-200 ease-out ${
                isSelected
                  ? 'scale-105 border-[#1B3A2D]/20 bg-[#1B3A2D]/[0.04] shadow-[0_4px_16px_-4px_rgba(27,58,45,0.2)]'
                  : 'border-[#1B3A2D]/10 bg-white'
              }`}
            >
              <div className="relative h-12 w-4 overflow-hidden rounded-full bg-[#1B3A2D]/[0.08]">
                <div
                  className="absolute inset-x-0 bottom-0 rounded-full transition-all duration-300 ease-out"
                  style={{ height: FILL_HEIGHTS[index], backgroundColor: isSelected ? fill : 'rgba(27,58,45,0.25)' }}
                />
              </div>
              <span
                className={`whitespace-normal break-words text-center text-[10px] font-medium leading-tight ${
                  isSelected ? 'text-[#1B3A2D]' : 'text-[#6B7A72]'
                }`}
              >
                {word}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
