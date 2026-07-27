'use client';

/**
 * Evening's "How recovered do you feel?" — a vertical fill rising with
 * the level, dim -> luminous ramp. Same visual family as
 * VerticalFillScale, its own ramp.
 *
 * 2026-07-27 audit fix: found during the Energy/Stress contrast pass —
 * this component shared the identical low-contrast selected state (a
 * 4%-opacity card tint, a small muted-color internal bar). Fixed with
 * the same treatment: a solid, always-legible card fill using
 * RECOVERY_RAMP's own saturated (luminous gold) end regardless of
 * level, an animated white fill bar growing to the selected height, and
 * the true per-index ramp color kept as a visible accent rather than
 * discarded.
 */

import { useEffect, useState } from 'react';
import { triggerHaptic } from '@/lib/haptics';
import { RECOVERY_RAMP, rampColorAt } from '@/lib/checkin-color-ramps';
import { SCALE_LABEL } from './shared';

const FILL_HEIGHTS = ['30%', '48%', '66%', '84%', '100%'] as const;

const RECOVERY_SOLID = `rgb(${RECOVERY_RAMP.to[0]}, ${RECOVERY_RAMP.to[1]}, ${RECOVERY_RAMP.to[2]})`;

function RecoveryBar({ index, isSelected }: { index: number; isSelected: boolean }) {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    if (!isSelected) {
      setGrown(false);
      return;
    }
    const raf = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(raf);
  }, [isSelected]);

  return (
    <div className={`relative h-14 w-5 overflow-hidden rounded-full ${isSelected ? 'bg-black/15' : 'bg-[#1B3A2D]/[0.08]'}`}>
      {isSelected ? (
        <div
          className="absolute inset-x-0 bottom-0 rounded-full bg-white transition-all duration-[450ms] ease-out"
          style={{ height: grown ? FILL_HEIGHTS[index] : '0%' }}
        />
      ) : (
        <div className="absolute inset-x-0 bottom-0 rounded-full bg-[#1B3A2D]/25" style={{ height: FILL_HEIGHTS[index] }} />
      )}
    </div>
  );
}

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
          const accent = rampColorAt(RECOVERY_RAMP.from, RECOVERY_RAMP.to, index, labels.length);
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
                  ? 'scale-105 border-transparent shadow-[0_4px_16px_-4px_rgba(196,160,80,0.45)]'
                  : 'border-[#1B3A2D]/10 bg-white'
              }`}
              style={isSelected ? { backgroundColor: RECOVERY_SOLID } : undefined}
            >
              <RecoveryBar index={index} isSelected={isSelected} />
              <span
                className={`whitespace-normal break-words text-center text-[10px] font-medium leading-tight ${
                  isSelected ? 'text-white' : 'text-[#6B7A72]'
                }`}
              >
                {word}
              </span>
              <span
                aria-hidden="true"
                className="h-1 w-4 rounded-full"
                style={{ backgroundColor: isSelected ? '#FFFFFF' : accent, opacity: isSelected ? 0.6 : 1 }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
