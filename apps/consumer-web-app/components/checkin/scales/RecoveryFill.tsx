'use client';

/**
 * Evening's "How recovered do you feel?" — a vertical fill rising with
 * the level.
 *
 * 2026-07-27 audit fix: found during the Energy/Stress contrast pass —
 * this component shared the identical low-contrast selected state (a
 * 4%-opacity card tint, a small muted-color internal bar). Fixed with
 * the same treatment: a solid, always-legible card fill using
 * RECOVERY_RAMP's own saturated (luminous gold) end regardless of
 * level, and an animated white fill bar growing to the selected height.
 *
 * 2026-07-27 UX audit fix (batch 1, item 2): the small accent dot below
 * each label used to be RECOVERY_RAMP's own per-index interpolated
 * color — dim gray-green at the low end, luminous gold at the high end.
 * Same problem the stress scale had (see CompressingRings.tsx): a
 * dim-to-bright hue ramp still reads as an implied "worse to better"
 * axis. Fixed the same way — one fixed on-palette hue (RECOVERY_RAMP's
 * own gold "to" endpoint) for every option, magnitude conveyed only by
 * the dot's opacity (fainter at the low end) and by the bar's own
 * height (already real, unaffected). RECOVERY_RAMP itself is untouched
 * in lib/checkin-color-ramps.ts — still used for this component's fixed
 * solid selected-card fill above, and by the check-in ending screen's
 * color blend, out of scope here.
 */

import { useEffect, useState } from 'react';
import { triggerHaptic } from '@/lib/haptics';
import { RECOVERY_RAMP } from '@/lib/checkin-color-ramps';
import { SCALE_LABEL } from './shared';

const FILL_HEIGHTS = ['30%', '48%', '66%', '84%', '100%'] as const;

const RECOVERY_SOLID = `rgb(${RECOVERY_RAMP.to[0]}, ${RECOVERY_RAMP.to[1]}, ${RECOVERY_RAMP.to[2]})`;
const RECOVERY_ACCENT = RECOVERY_SOLID;
const MIN_ACCENT_OPACITY = 0.3;

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
          // Magnitude via intensity, not hue: every option's accent dot is
          // the same gold, just fainter at the low end and fuller at the
          // high end — the same solution used on the stress scale.
          const accentOpacity =
            labels.length <= 1 ? 1 : MIN_ACCENT_OPACITY + (index / (labels.length - 1)) * (1 - MIN_ACCENT_OPACITY);
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
                style={{
                  backgroundColor: isSelected ? '#FFFFFF' : RECOVERY_ACCENT,
                  opacity: isSelected ? 0.6 : accentOpacity,
                }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
