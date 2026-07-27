'use client';

/**
 * Sleep quality — "five moons that fill." Tapping a moon fills it and
 * every moon before it (magnitude), but only one moon is ever actually
 * *selected* — its value also colors the sleep arc (dim/muted for a low
 * rating, clear/luminous for a high one) via onChange, wired by the
 * caller.
 *
 * 2026-07-27 fix: the cumulative fill alone made this read as
 * multi-select — selecting "Terrible" then changing to "Good" left
 * several moons visibly lit with no way to tell only one was actually
 * chosen (a bold label was the only differentiator, too subtle to
 * notice). The data was never actually multi-value (`sleepQuality` is a
 * single `number | null`, replaced on every `onChange`, confirmed by
 * reading CheckinForm.tsx directly and via a real query after a live
 * selection) — this is a pure rendering fix. The selected option now
 * sits inside the same solid, unmistakable filled-container treatment
 * mood/energy/stress already use on screen 1 (a fixed, always-solid
 * gold card — this component's own existing gold, `#C4A050`, not a new
 * color), while every other moon (filled-for-magnitude or not) stays a
 * plain white card. The cumulative fill itself is unchanged.
 */

import { Moon } from 'lucide-react';
import { triggerHaptic } from '@/lib/haptics';
import { SCALE_LABEL } from './shared';

const SLEEP_QUALITY_SOLID = '#C4A050';

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
      <div className="mt-3 flex w-full items-stretch gap-1.5" role="group" aria-label={question}>
        {labels.map((word, index) => {
          const optionValue = index + 1;
          const isFilled = value !== null && optionValue <= value;
          const isSelected = value === optionValue;
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
                  ? 'scale-105 border-transparent shadow-[0_4px_16px_-4px_rgba(196,160,80,0.5)]'
                  : 'border-[#1B3A2D]/10 bg-white'
              }`}
              style={isSelected ? { backgroundColor: SLEEP_QUALITY_SOLID } : undefined}
            >
              <Moon
                className={`h-6 w-6 transition-all duration-200 ease-out ${isSelected ? 'scale-110' : ''}`}
                fill={isSelected ? '#FFFFFF' : isFilled ? '#C4A050' : 'none'}
                stroke={isSelected ? '#FFFFFF' : '#1B3A2D'}
                strokeWidth={1.5}
                strokeOpacity={isSelected ? 1 : isFilled ? 1 : 0.4}
                aria-hidden="true"
              />
              <span
                className={`whitespace-normal break-words text-center text-[10px] font-medium leading-tight ${
                  isSelected ? 'text-white' : 'text-[#6B7A72]'
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
