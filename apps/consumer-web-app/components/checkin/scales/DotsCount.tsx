'use client';

/**
 * "count" — dots that fill left to right, tapping a dot sets the count
 * to its position.
 *
 * 2026-07-27 audit fix (found while fixing the sleep-quality moons'
 * identical fault): every filled dot up to the count used to render
 * identically — solid dark green, scaled, shadowed — so there was no
 * way to tell "the count is 3" from "dots 1, 2, and 3 are each their
 * own selection." Only the truly selected dot (the one matching the
 * actual count) now gets the full solid-fill/scale/shadow container;
 * dots filled only for cumulative magnitude get a softer, unmistakably
 * lesser tint of the same color, never the identical treatment as the
 * selection itself.
 */

import { triggerHaptic } from '@/lib/haptics';
import { SCALE_LABEL } from './shared';

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
              onClick={() => {
                triggerHaptic();
                onChange(optionValue);
              }}
              aria-pressed={isSelected}
              aria-label={String(optionValue)}
              className="mef-press flex min-w-0 flex-1 flex-col items-center gap-1"
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full border text-[12px] font-semibold transition-all duration-200 ease-out ${
                  isSelected
                    ? 'scale-110 border-transparent bg-[#1B3A2D] text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.5)]'
                    : isFilled
                      ? 'border-transparent bg-[#1B3A2D]/30 text-[#1B3A2D]'
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
