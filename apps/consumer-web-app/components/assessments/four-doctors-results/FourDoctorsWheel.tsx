'use client';

/**
 * The centerpiece of the Four Doctors results page: four equal (25% each)
 * segments, one per doctor, colored by that doctor's zone (see
 * lib/assessments/four-doctors/premium/zones.ts), with the overall total
 * and zone in the center. Segments are deliberately equal-width regardless
 * of score, per the brief, this is an identity wheel ("here's your
 * standing in each of the four areas"), not a proportional chart, that's
 * what CategoryRadarChart.tsx already does elsewhere. Same "mount, then
 * animate on next frame" pattern as ScoreRing.tsx, staggered per segment
 * so each one draws into place in doctor order rather than all at once.
 */

import { useEffect, useState } from 'react';
import { zoneForPriority } from '@/lib/assessments/four-doctors/premium/zones';
import type { CategoryScoreResult, PriorityLevel } from '@/lib/assessments/engine/types';

type Props = {
  /** Exactly 4 entries, already ordered Dr. Happiness, Dr. Quiet, Dr. Diet, Dr. Movement. */
  categories: CategoryScoreResult[];
  totalScore: number;
  totalMaxScore: number;
  totalPriority: PriorityLevel;
  size?: number;
};

export function FourDoctorsWheel({
  categories,
  totalScore,
  totalMaxScore,
  totalPriority,
  size = 260,
}: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const stroke = size * 0.1;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const segmentLength = circumference / categories.length;
  const gap = segmentLength * 0.08;
  const drawLength = segmentLength - gap;
  const overallZone = zoneForPriority(totalPriority);

  const wheelLabel = categories
    .map((c) => `${c.categoryName}: ${zoneForPriority(c.priority).label}`)
    .join(', ');

  return (
    <div className="relative mx-auto w-full" style={{ maxWidth: size }}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="h-auto w-full -rotate-90"
        role="img"
        aria-label={`Four Doctors wheel. ${wheelLabel}. Overall total ${totalScore} of ${totalMaxScore}, ${overallZone.label} zone.`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#EFE9DB"
          strokeWidth={stroke}
        />
        {categories.map((category, index) => {
          const zone = zoneForPriority(category.priority);
          const targetOffset = -(index * segmentLength);
          return (
            <circle
              key={category.categoryId}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={zone.color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${drawLength} ${circumference - drawLength}`}
              strokeDashoffset={mounted ? targetOffset : circumference + targetOffset}
              className="transition-[stroke-dashoffset] duration-[900ms] ease-out motion-reduce:transition-none"
              style={{ transitionDelay: `${index * 140}ms` }}
            />
          );
        })}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
        <span className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-none text-[#1B3A2D] sm:text-5xl">
          {totalScore}
        </span>
        <span className="mt-1 text-xs text-[#6B7A72]">of {totalMaxScore}</span>
        <span
          className="mt-3 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: overallZone.color, backgroundColor: overallZone.tint }}
        >
          {overallZone.label}
        </span>
      </div>
    </div>
  );
}
