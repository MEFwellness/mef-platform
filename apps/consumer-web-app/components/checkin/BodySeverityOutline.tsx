'use client';

/**
 * "Your body" — a simple body outline she taps for location, then
 * severity, combining what used to be two separate scales (soreness,
 * pain) into this one gesture. The single severity value this writes
 * is what both `morning_soreness` and `pain_discomfort_level` are set
 * to — the task's own explicit instruction ("combine them into this one
 * gesture, writing to both existing fields"). Severity uses the
 * clay/terracotta ramp (never red), per the task's hard constraint on
 * pain/soreness coloring.
 */

import { triggerHaptic } from '@/lib/haptics';
import { SEVERITY_RAMP, rampColorAt } from '@/lib/checkin-color-ramps';

const HOTSPOTS: { value: string; label: string; x: number; y: number }[] = [
  { value: 'neck', label: 'Neck', x: 50, y: 26 },
  { value: 'shoulders', label: 'Shoulders', x: 50, y: 40 },
  { value: 'upper_back', label: 'Upper back', x: 50, y: 58 },
  { value: 'lower_back', label: 'Lower back', x: 50, y: 88 },
  { value: 'hips', label: 'Hips', x: 50, y: 108 },
  { value: 'hands_or_wrists', label: 'Hands or wrists', x: 15, y: 98 },
  { value: 'knees', label: 'Knees', x: 50, y: 152 },
  { value: 'feet_or_ankles', label: 'Feet or ankles', x: 50, y: 198 },
];

const OTHER_LOCATIONS = [
  { value: 'widespread', label: 'Widespread' },
  { value: 'other', label: 'Other' },
] as const;

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
        Where is it, and how much? Tap a spot, then set how much it bothers you.
      </p>
      <div className="mt-3 flex justify-center">
        <svg viewBox="0 0 100 220" className="h-56 w-auto" role="group" aria-label="Where is it, mainly?">
          <g fill="#1B3A2D" fillOpacity={0.06}>
            <circle cx="50" cy="16" r="11" />
            <rect x="32" y="30" width="36" height="66" rx="14" />
            <rect x="16" y="34" width="13" height="60" rx="6" />
            <rect x="71" y="34" width="13" height="60" rx="6" />
            <rect x="33" y="96" width="15" height="60" rx="7" />
            <rect x="52" y="96" width="15" height="60" rx="7" />
            <ellipse cx="40" cy="204" rx="9" ry="6" />
            <ellipse cx="60" cy="204" rx="9" ry="6" />
          </g>

          {HOTSPOTS.map((spot) => {
            const isSelected = locationValue === spot.value;
            return (
              <g key={spot.value}>
                <circle
                  cx={spot.x}
                  cy={spot.y}
                  r="11"
                  fill="transparent"
                  className="cursor-pointer"
                  onClick={() => {
                    triggerHaptic();
                    onLocationChange(spot.value);
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={spot.label}
                  aria-pressed={isSelected}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      triggerHaptic();
                      onLocationChange(spot.value);
                    }
                  }}
                />
                <circle
                  cx={spot.x}
                  cy={spot.y}
                  r={isSelected ? 6 : 4.5}
                  fill={isSelected ? '#1B3A2D' : '#C4A050'}
                  className="pointer-events-none transition-all duration-200 ease-out"
                  opacity={isSelected ? 1 : 0.8}
                />
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[10px] text-[#6B7A72]">
        {HOTSPOTS.map((spot) => (
          <span key={spot.value} className={locationValue === spot.value ? 'font-semibold text-[#1B3A2D]' : undefined}>
            {spot.label}
          </span>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        {OTHER_LOCATIONS.map((option) => {
          const isSelected = locationValue === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                triggerHaptic();
                onLocationChange(option.value);
              }}
              aria-pressed={isSelected}
              className={`mef-press flex-1 rounded-full border px-3.5 py-2 text-[13px] font-medium transition-all duration-200 ease-out ${
                isSelected
                  ? 'border-transparent bg-[#1B3A2D] text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)]'
                  : 'border-[#1B3A2D]/10 bg-white text-[#1B3A2D]/75'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {locationValue && (
        <div className="mt-5">
          <p className="text-[13px] leading-relaxed text-[#6B7A72]">How much does it bother you?</p>
          <div className="mt-3 flex w-full items-end gap-1.5" role="group" aria-label="How much does it bother you?">
            {severityLabels.map((_, index) => {
              const isSelected = severityValue === index;
              const isFilled = severityValue !== null && index <= severityValue;
              const color = rampColorAt(SEVERITY_RAMP.from, SEVERITY_RAMP.to, index, severityLabels.length);
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => {
                    triggerHaptic();
                    onSeverityChange(index);
                  }}
                  aria-pressed={isSelected}
                  aria-label={severityLabels[index]}
                  className="mef-press flex min-w-0 flex-1 flex-col items-center gap-1"
                >
                  <span
                    className="block h-2.5 w-full rounded-full transition-all duration-200 ease-out"
                    style={{
                      backgroundColor: isFilled ? color : 'rgba(27,58,45,0.08)',
                      transform: isSelected ? 'scaleY(1.6)' : undefined,
                    }}
                  />
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-center text-[13px] font-medium text-[#1B3A2D]">
            {severityValue !== null ? severityLabels[severityValue] : 'Tap a level above'}
          </p>
        </div>
      )}
    </div>
  );
}
