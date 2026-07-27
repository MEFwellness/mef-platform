'use client';

/**
 * Stress (morning) / daytime stress (evening, shared component) —
 * concentric rings that light up from the centre outward as stress
 * rises: one ring lit at the calmest level, all five at the most
 * stressed. Open sage -> deep clay ramp (never red, never green — kept
 * a distinct hue family from Energy on purpose, so a high-stress answer
 * never reads as something the app is rewarding).
 *
 * 2026-07-27 contrast fix: the selected card used to be a 4%-opacity
 * tint with faint rings drawn at a fixed tightness pattern — often
 * unreadable against the page background. The selected card now always
 * fills solid with STRESS_RAMP's own saturated end (deep clay), never
 * the interpolated per-index color as a *background* (which is pale at
 * the calm end and would reintroduce the same contrast failure). Rings
 * are now a real count — level N lights exactly N of 5 concentric
 * rings, white against the clay card, revealed one at a time from the
 * centre outward via a staggered transition.
 */

import { useEffect, useState } from 'react';
import { triggerHaptic } from '@/lib/haptics';
import { STRESS_RAMP, rampColorAt } from '@/lib/checkin-color-ramps';
import { SCALE_LABEL } from './shared';

const RING_COUNT = 5;
/** Evenly spaced radii, innermost first — the same 5 slots regardless of scale length, since every scale this renders is a 5-point one. */
const RING_RADII = [3, 6, 9, 12, 15];
const STAGGER_MS = 90;

const STRESS_SOLID = `rgb(${STRESS_RAMP.to[0]}, ${STRESS_RAMP.to[1]}, ${STRESS_RAMP.to[2]})`;

function RingStack({ litCount, isSelected }: { litCount: number; isSelected: boolean }) {
  // Rings reveal one at a time, centre outward, only once this option
  // becomes selected -- a fresh tap animates in rather than appearing
  // fully lit the instant it renders.
  const [revealed, setRevealed] = useState(0);
  useEffect(() => {
    if (!isSelected) {
      setRevealed(0);
      return;
    }
    setRevealed(0);
    const timers = Array.from({ length: litCount }, (_, i) =>
      setTimeout(() => setRevealed((prev) => Math.max(prev, i + 1)), i * STAGGER_MS)
    );
    return () => timers.forEach(clearTimeout);
  }, [isSelected, litCount]);

  return (
    <svg viewBox="0 0 28 28" className="h-7 w-7" aria-hidden="true">
      {RING_RADII.map((r, ringIndex) => {
        const shouldBeLit = ringIndex < litCount;
        const isRevealed = isSelected ? ringIndex < revealed : shouldBeLit;
        return (
          <circle
            key={ringIndex}
            cx="14"
            cy="14"
            r={r}
            fill="none"
            stroke={isSelected ? '#FFFFFF' : '#1B3A2D'}
            strokeWidth={isSelected ? 2 : 1.5}
            opacity={isSelected ? (isRevealed ? 1 : 0) : shouldBeLit ? 0.35 : 0.08}
            style={{ transition: `opacity 0.25s ease-out, stroke-width 0.2s ease-out` }}
          />
        );
      })}
    </svg>
  );
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
          const litCount = Math.round(((index + 1) / labels.length) * RING_COUNT) || 1;
          const accent = rampColorAt(STRESS_RAMP.from, STRESS_RAMP.to, index, labels.length);
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
                  ? 'scale-105 border-transparent shadow-[0_4px_16px_-4px_rgba(124,84,67,0.45)]'
                  : 'border-[#1B3A2D]/10 bg-white'
              }`}
              style={isSelected ? { backgroundColor: STRESS_SOLID } : undefined}
            >
              <RingStack litCount={litCount} isSelected={isSelected} />
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
