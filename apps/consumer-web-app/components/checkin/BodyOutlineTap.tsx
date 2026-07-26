'use client';

/**
 * Pain location — "a simple body outline she taps." Writes the exact
 * same checkin_probe.pain_location values PAIN_LOCATION_OPTIONS already
 * used (see CheckinForm.tsx), so nothing downstream changes — this
 * replaces only how the location is captured, not what gets stored.
 * "Widespread" and "Other" aren't single points on a body, so they stay
 * two plain pills below the outline rather than being forced onto it.
 */

import { selectWithFeedback } from './scales/shared';

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

const OTHER_OPTIONS = [
  { value: 'widespread', label: 'Widespread' },
  { value: 'other', label: 'Other' },
] as const;

export function BodyOutlineTap({
  question,
  value,
  onChange,
}: {
  question: string;
  value: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p className="text-[13px] leading-relaxed text-[#6B7A72]">{question}</p>
      <div className="mt-3 flex justify-center">
        <svg viewBox="0 0 100 220" className="h-64 w-auto" role="group" aria-label={question}>
          {/* A deliberately plain silhouette — this is a location picker, not an anatomical illustration. */}
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
            const isSelected = value === spot.value;
            return (
              <g key={spot.value}>
                <circle
                  cx={spot.x}
                  cy={spot.y}
                  r="11"
                  fill="transparent"
                  className="cursor-pointer"
                  onClick={() => selectWithFeedback(onChange, spot.value)}
                  role="button"
                  tabIndex={0}
                  aria-label={spot.label}
                  aria-pressed={isSelected}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      selectWithFeedback(onChange, spot.value);
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
          <span key={spot.value} className={value === spot.value ? 'font-semibold text-[#1B3A2D]' : undefined}>
            {spot.label}
          </span>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        {OTHER_OPTIONS.map((option) => {
          const isSelected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => selectWithFeedback(onChange, option.value)}
              aria-pressed={isSelected}
              className={`mef-press flex-1 rounded-full border px-3.5 py-2 text-[13px] font-medium transition-all duration-200 ease-out ${
                isSelected
                  ? 'scale-105 border-[#1B3A2D] bg-[#1B3A2D] text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)]'
                  : 'border-[#1B3A2D]/10 bg-white text-[#6B7A72] hover:border-[#1B3A2D]/25 hover:text-[#1B3A2D]'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
