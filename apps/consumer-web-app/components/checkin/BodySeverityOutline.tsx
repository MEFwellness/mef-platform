'use client';

/**
 * "Your body" — location, then severity, combining what used to be two
 * separate scales (soreness, pain) into this one gesture. The single
 * severity value this writes is what both `morning_soreness` and
 * `pain_discomfort_level` are set to (unchanged from the original
 * design). Severity uses the clay/terracotta ramp (never red).
 *
 * 2026-07-27 redesign: the body-silhouette illustration is gone
 * entirely — it offered a third, redundant way to answer the same
 * question the tappable location list and the Widespread/Other buttons
 * already answered, and read as decorative rather than functional.
 * Location is now ONE list of full-width tappable rows (the same
 * StackedOptionRows/TapBleedTile treatment every other long-label
 * option set in this app already uses), with Widespread and Other as
 * two more rows in that same list rather than separate buttons below
 * it. Severity no longer reads as a thin progress bar — each level is
 * now a real, visibly bordered tile that fills solid clay when reached
 * and animates in, the same fill-and-light language section 2 of the
 * task applied to Energy/Stress. locationValue/onLocationChange/
 * severityValue/onSeverityChange/severityLabels are unchanged, so
 * every existing field this writes to is untouched.
 */

import { useEffect, useState } from 'react';
import { triggerHaptic } from '@/lib/haptics';
import { SEVERITY_RAMP, rampColorAt } from '@/lib/checkin-color-ramps';
import { StackedOptionRows } from './scales/StackedOptionRows';

const HOTSPOT_OPTIONS = [
  { value: 'neck', label: 'Neck' },
  { value: 'shoulders', label: 'Shoulders' },
  { value: 'upper_back', label: 'Upper back' },
  { value: 'lower_back', label: 'Lower back' },
  { value: 'hips', label: 'Hips' },
  { value: 'hands_or_wrists', label: 'Hands or wrists' },
  { value: 'knees', label: 'Knees' },
  { value: 'feet_or_ankles', label: 'Feet or ankles' },
  { value: 'widespread', label: 'Widespread' },
  { value: 'other', label: 'Other' },
] as const;

const SEVERITY_SOLID = `rgb(${SEVERITY_RAMP.to[0]}, ${SEVERITY_RAMP.to[1]}, ${SEVERITY_RAMP.to[2]})`;

function SeverityTile({
  index,
  label,
  isSelected,
  isReached,
  onSelect,
}: {
  index: number;
  label: string;
  isSelected: boolean;
  isReached: boolean;
  onSelect: () => void;
}) {
  const color = rampColorAt(SEVERITY_RAMP.from, SEVERITY_RAMP.to, index, 6);
  // Animates the fill in on selection rather than appearing already lit.
  const [lit, setLit] = useState(false);
  useEffect(() => {
    if (!isReached) {
      setLit(false);
      return;
    }
    const raf = requestAnimationFrame(() => setLit(true));
    return () => cancelAnimationFrame(raf);
  }, [isReached]);

  return (
    <button
      type="button"
      onClick={() => {
        triggerHaptic();
        onSelect();
      }}
      aria-pressed={isSelected}
      aria-label={label}
      title={label}
      className={`mef-press flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl border py-2.5 transition-all duration-200 ease-out ${
        isSelected ? 'scale-105 border-transparent shadow-[0_4px_14px_-4px_rgba(124,84,67,0.4)]' : 'border-[#1B3A2D]/10'
      }`}
      style={{ backgroundColor: lit ? (isSelected ? SEVERITY_SOLID : color) : '#FFFFFF' }}
    >
      <span className={`h-4 w-4 rounded-full transition-all duration-200 ease-out ${lit ? 'scale-100' : 'scale-0'}`} />
    </button>
  );
}

export function BodySeverityOutline({
  locationValue,
  onLocationChange,
  severityValue,
  onSeverityChange,
  severityLabels,
}: {
  locationValue: string | null;
  onLocationChange: (value: string) => void;
  severityValue: number | null;
  onSeverityChange: (value: number) => void;
  /** Index 0 = "None"/no severity, through the top of the scale — the same word set CheckinForm's PAIN_MEANING already uses. */
  severityLabels: readonly string[];
}) {
  return (
    <div>
      <p className="text-[13px] leading-relaxed text-[#6B7A72]">
        Where is it? Tap a spot below, then set how much it bothers you.
      </p>
      <div className="mt-3">
        <StackedOptionRows
          question="Where is it, mainly?"
          options={HOTSPOT_OPTIONS}
          value={locationValue}
          onChange={onLocationChange}
        />
      </div>

      {locationValue && (
        <div className="mt-5">
          <p className="text-[13px] leading-relaxed text-[#6B7A72]">How much does it bother you?</p>
          <div className="mt-3 flex w-full gap-1.5" role="group" aria-label="How much does it bother you?">
            {severityLabels.map((label, index) => (
              <SeverityTile
                key={index}
                index={index}
                label={label}
                isSelected={severityValue === index}
                isReached={severityValue !== null && index <= severityValue}
                onSelect={() => onSeverityChange(index)}
              />
            ))}
          </div>
          <p className="mt-2 text-center text-[13px] font-medium text-[#1B3A2D]">
            {severityValue !== null ? severityLabels[severityValue] : 'Tap a level above'}
          </p>
        </div>
      )}
    </div>
  );
}
