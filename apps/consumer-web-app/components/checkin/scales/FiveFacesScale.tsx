'use client';

/**
 * Mood — "five faces along a warm-to-cool gradient." The gradient is
 * built entirely from the two locked brand colors (warm gold at the low
 * end, forest green at the high end, cream as the midpoint) rather than
 * introducing new hues, so it reads as warm-to-cool while staying inside
 * the same palette used everywhere else in the app.
 */

import { selectWithFeedback, SCALE_LABEL } from './shared';

const GOLD = [196, 160, 80] as const; // #C4A050
const CREAM = [245, 240, 228] as const; // #F5F0E4
const GREEN = [27, 58, 45] as const; // #1B3A2D

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/** 5 steps, warm (gold) -> cream -> cool (green), matching MOOD_MEANING's Very Low..Excellent order. */
function faceBackground(index: number): string {
  const t = index / 4; // 0, 0.25, 0.5, 0.75, 1
  const [from, to, localT] = t <= 0.5 ? [GOLD, CREAM, t / 0.5] : [CREAM, GREEN, (t - 0.5) / 0.5];
  const [r, g, b] = [lerp(from[0], to[0], localT), lerp(from[1], to[1], localT), lerp(from[2], to[2], localT)];
  return `rgb(${r}, ${g}, ${b})`;
}

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
          return (
            <button
              key={word}
              type="button"
              onClick={() => selectWithFeedback(onChange, optionValue)}
              aria-pressed={isSelected}
              aria-label={word}
              title={word}
              className={`mef-press flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl border py-2.5 transition-all duration-200 ease-out ${
                isSelected
                  ? 'scale-105 border-transparent shadow-[0_4px_16px_-4px_rgba(27,58,45,0.35)]'
                  : 'border-[#1B3A2D]/10 bg-white hover:scale-[1.03]'
              }`}
              style={isSelected ? { backgroundColor: faceBackground(index) } : undefined}
            >
              <FaceIcon index={index} isDark={isSelected && index >= 2} />
              <span
                className={`truncate text-[10px] font-medium ${isSelected && index >= 2 ? 'text-white' : isSelected ? 'text-[#1B3A2D]' : 'text-[#6B7A72]'}`}
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
