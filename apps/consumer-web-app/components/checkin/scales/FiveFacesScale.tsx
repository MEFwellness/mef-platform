'use client';

/** Mood — "five faces along its hue ramp": cool muted -> warm gold, the same two-stop family every scale in this redesign uses, never a red/green good-bad axis. */

import { triggerHaptic } from '@/lib/haptics';
import { MOOD_RAMP, rampColorAt } from '@/lib/checkin-color-ramps';
import { SCALE_LABEL } from './shared';

function FaceIcon({ index, isDark }: { index: number; isDark: boolean }) {
  const curve = -6 + index * 3; // frown (-6) through smile (+6)
  const stroke = isDark ? '#FFFFFF' : '#1B3A2D';
  return (
    <svg viewBox="0 0 32 32" className="h-6 w-6" aria-hidden="true">
      <circle cx="16" cy="16" r="13" fill="none" stroke={stroke} strokeWidth="2" opacity={0.85} />
      <circle cx="11.5" cy="13" r="1.5" fill={stroke} opacity={0.85} />
      <circle cx="20.5" cy="13" r="1.5" fill={stroke} opacity={0.85} />
      <path
        d={`M 10 20 Q 16 ${20 + curve} 22 20`}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        opacity={0.85}
      />
    </svg>
  );
}

export function FiveFacesScale({
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
          const fill = rampColorAt(MOOD_RAMP.from, MOOD_RAMP.to, index, labels.length);
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
              className={`mef-press flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl border py-2.5 transition-all duration-200 ease-out ${
                isSelected
                  ? 'scale-105 border-transparent shadow-[0_4px_16px_-4px_rgba(27,58,45,0.35)]'
                  : 'border-[#1B3A2D]/10 bg-white'
              }`}
              style={isSelected ? { backgroundColor: fill } : undefined}
            >
              <FaceIcon index={index} isDark={isSelected && index >= 2} />
              <span
                className={`whitespace-normal break-words text-center text-[10px] font-medium leading-tight ${
                  isSelected && index >= 2 ? 'text-white' : isSelected ? 'text-[#1B3A2D]' : 'text-[#6B7A72]'
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
