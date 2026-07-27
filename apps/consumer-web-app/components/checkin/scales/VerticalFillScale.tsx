'use client';

/**
 * Energy — "a vertical fill that rises with the level," pale sage ->
 * saturated green. Five bars of increasing preview height (30%/48%/
 * 66%/84%/100%), each its own tap target.
 *
 * 2026-07-27 contrast fix: the selected state used to be a 4%-opacity
 * card tint plus a small internal bar — often unreadable against the
 * page's own beige background, especially since the ramp's own low end
 * (Exhausted) is a pale near-white sage that can't carry contrast as a
 * card fill on its own. The selected card now always fills solid with
 * ENERGY_RAMP's own saturated end (the brand's dark forest green) —
 * never the interpolated, sometimes-pale, per-index ramp color as the
 * *card background* — so contrast against the page is guaranteed at
 * every level. The ramp still does real, visible work: it colors the
 * small accent chip under each label, at full ramp fidelity per index.
 * The inner bar animates its height growth on selection (0 -> target)
 * rather than only swapping color, matching "fills upward ... with a
 * brief animation."
 */

import { useEffect, useState } from 'react';
import { triggerHaptic } from '@/lib/haptics';
import { ENERGY_RAMP, rampColorAt } from '@/lib/checkin-color-ramps';
import { SCALE_LABEL } from './shared';

const FILL_HEIGHTS = ['30%', '48%', '66%', '84%', '100%'] as const;

/** The fixed, always-solid selected-card color — ENERGY_RAMP's own saturated end. Deliberately not the per-index interpolated color: that would make a low-energy selection (Exhausted) fill with a pale, near-white card, reintroducing the exact bug this fix addresses. */
const ENERGY_SOLID = `rgb(${ENERGY_RAMP.to[0]}, ${ENERGY_RAMP.to[1]}, ${ENERGY_RAMP.to[2]})`;

function EnergyBar({ index, isSelected }: { index: number; isSelected: boolean }) {
  // Grows only after the selected flag flips true, so a freshly-tapped
  // level visibly animates from empty up to its target height instead of
  // appearing pre-filled the instant it renders.
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

export function VerticalFillScale({
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
          const accent = rampColorAt(ENERGY_RAMP.from, ENERGY_RAMP.to, index, labels.length);
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
                  ? 'scale-105 border-transparent shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)]'
                  : 'border-[#1B3A2D]/10 bg-white'
              }`}
              style={isSelected ? { backgroundColor: ENERGY_SOLID } : undefined}
            >
              <EnergyBar index={index} isSelected={isSelected} />
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
