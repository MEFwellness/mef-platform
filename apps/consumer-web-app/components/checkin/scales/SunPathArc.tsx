'use client';

/**
 * Evening's "Overall, how was your day?" — a sun-path arc, low to high.
 * Five points along one continuous arc; the sun sits at whichever point
 * she taps, low near the horizon on one end, high overhead on the
 * other. The full label for whichever point is selected is shown as one
 * caption below the arc (never a per-point label that could clip).
 */

import { useId } from 'react';
import { triggerHaptic } from '@/lib/haptics';
import { SCALE_LABEL } from './shared';

const WIDTH = 260;
const HEIGHT = 120;
// Quadratic bezier from the left horizon point through a high apex to the right horizon point.
const START = { x: 20, y: 100 };
const APEX = { x: 130, y: 14 };
const END = { x: 240, y: 100 };

function pointAt(t: number): { x: number; y: number } {
  const x = (1 - t) ** 2 * START.x + 2 * (1 - t) * t * APEX.x + t ** 2 * END.x;
  const y = (1 - t) ** 2 * START.y + 2 * (1 - t) * t * APEX.y + t ** 2 * END.y;
  return { x, y };
}

export function SunPathArc({
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
  const gradientId = useId();
  const points = labels.map((_, index) => pointAt(index / (labels.length - 1)));
  const selectedIndex = value !== null ? value - 1 : null;
  const selectedPoint = selectedIndex !== null ? points[selectedIndex] : null;
  const brightness = selectedIndex !== null ? selectedIndex / Math.max(labels.length - 1, 1) : 0.5;

  return (
    <div>
      <p className={SCALE_LABEL}>{question}</p>
      <div className="mt-3 flex justify-center">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-28 w-full max-w-xs" role="group" aria-label={question}>
          <defs>
            <radialGradient id={gradientId}>
              <stop offset="0%" stopColor="#C4A050" stopOpacity={0.9} />
              <stop offset="100%" stopColor="#C4A050" stopOpacity={0} />
            </radialGradient>
          </defs>
          <path
            d={`M ${START.x} ${START.y} Q ${APEX.x} ${APEX.y} ${END.x} ${END.y}`}
            fill="none"
            stroke="#1B3A2D"
            strokeOpacity={0.12}
            strokeWidth={3}
            strokeLinecap="round"
          />
          {selectedPoint && (
            <circle
              cx={selectedPoint.x}
              cy={selectedPoint.y}
              r={18 + brightness * 10}
              fill={`url(#${gradientId})`}
            />
          )}
          {points.map((point, index) => {
            const isSelected = selectedIndex === index;
            return (
              <circle
                key={index}
                cx={point.x}
                cy={point.y}
                r={isSelected ? 9 : 7}
                fill={isSelected ? '#C4A050' : '#FFFFFF'}
                stroke="#1B3A2D"
                strokeOpacity={isSelected ? 0 : 0.2}
                strokeWidth={1.5}
                className="cursor-pointer transition-all duration-200 ease-out"
                onClick={() => {
                  triggerHaptic();
                  onChange(index + 1);
                }}
                role="button"
                tabIndex={0}
                aria-label={labels[index]}
                aria-pressed={isSelected}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    triggerHaptic();
                    onChange(index + 1);
                  }
                }}
              />
            );
          })}
        </svg>
      </div>
      <p className="mt-1 text-center text-[13px] font-medium text-[#1B3A2D]">
        {selectedIndex !== null ? labels[selectedIndex] : 'Tap a point along the day'}
      </p>
    </div>
  );
}
