'use client';

/**
 * Stress (morning) / daytime stress (evening, shared component per the
 * task's own instruction) — "concentric rings that compress toward the
 * centre as stress rises: loose and open at Very Calm, tight and dense
 * at Overwhelmed." Open sage -> deep clay ramp (never red).
 */

import { triggerHaptic } from '@/lib/haptics';
import { STRESS_RAMP, rampColorAt } from '@/lib/checkin-color-ramps';
import { SCALE_LABEL } from './shared';

/** Ring radii per level — evenly spaced (loose) at level 1, bunched toward the center (compressed) at level 5. 3 rings each. */
function ringRadii(index: number, levelCount: number): number[] {
  const t = levelCount <= 1 ? 0 : index / (levelCount - 1);
  const spread = 11 - t * 7; // 11 (loose) down to 4 (tight)
  const outer = 13;
  return [outer, outer - spread, outer - spread * 2].map((r) => Math.max(r, 2));
}

export function CompressingRings({
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
          const color = rampColorAt(STRESS_RAMP.from, STRESS_RAMP.to, index, labels.length);
          const radii = ringRadii(index, labels.length);
          const strokeWidth = 1.25 + (index / Math.max(labels.length - 1, 1)) * 1.5;
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
              <svg viewBox="0 0 28 28" className="h-7 w-7" aria-hidden="true">
                {radii.map((r, ringIndex) => (
                  <circle
                    key={ringIndex}
                    cx="14"
                    cy="14"
                    r={r}
                    fill="none"
                    stroke={color}
                    strokeWidth={strokeWidth}
                    opacity={isSelected ? 1 : 0.45}
                  />
                ))}
              </svg>
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
