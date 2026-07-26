'use client';

/**
 * Evening's "How did your energy move through the day?" — four small
 * line drawings as the options (flat steady, dipping mid-way, falling
 * off at the end, rising through); the line draws itself when selected.
 * A 2x2 grid rather than one cramped row, so each label has real width
 * to wrap onto — never truncated.
 */

import { triggerHaptic } from '@/lib/haptics';
import { SCALE_LABEL } from './shared';
import type { EnergyPattern } from '@mef/shared-types-contracts';

const PATTERNS: { value: EnergyPattern; label: string; path: string }[] = [
  { value: 'steady', label: 'Steady all day', path: 'M4 12 L56 12' },
  { value: 'dipped', label: 'Dipped in the afternoon', path: 'M4 8 Q20 8 30 18 Q40 8 56 8' },
  { value: 'crashed', label: 'Crashed', path: 'M4 6 L36 6 L56 20' },
  { value: 'improved', label: 'Improved through the day', path: 'M4 20 Q30 20 56 4' },
];

function LineTile({
  pattern,
  isSelected,
  onSelect,
}: {
  pattern: (typeof PATTERNS)[number];
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        triggerHaptic();
        onSelect();
      }}
      aria-pressed={isSelected}
      className={`mef-press flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition-all duration-200 ease-out ${
        isSelected
          ? 'scale-[1.02] border-transparent bg-[#1B3A2D] shadow-[0_4px_16px_-4px_rgba(27,58,45,0.4)]'
          : 'border-[#1B3A2D]/10 bg-white'
      }`}
    >
      <svg viewBox="0 0 60 24" className="h-6 w-14" aria-hidden="true">
        <path
          d={pattern.path}
          fill="none"
          stroke={isSelected ? '#FFFFFF' : '#1B3A2D'}
          strokeOpacity={isSelected ? 1 : 0.5}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={100}
          strokeDasharray={100}
          strokeDashoffset={isSelected ? 0 : 100}
          style={{ transition: 'stroke-dashoffset 0.6s ease-out, stroke 0.2s ease-out, stroke-opacity 0.2s ease-out' }}
        />
      </svg>
      <span
        className={`whitespace-normal break-words text-[12px] font-medium leading-snug ${
          isSelected ? 'text-white' : 'text-[#1B3A2D]/75'
        }`}
      >
        {pattern.label}
      </span>
    </button>
  );
}

export function EnergyPatternLines({
  question,
  value,
  onChange,
}: {
  question: string;
  value: EnergyPattern | null;
  onChange: (value: EnergyPattern) => void;
}) {
  return (
    <div>
      <p className={SCALE_LABEL}>{question}</p>
      <div className="mt-3 grid grid-cols-2 gap-2.5" role="group" aria-label={question}>
        {PATTERNS.map((pattern) => (
          <LineTile
            key={pattern.value}
            pattern={pattern}
            isSelected={value === pattern.value}
            onSelect={() => onChange(pattern.value)}
          />
        ))}
      </div>
    </div>
  );
}
