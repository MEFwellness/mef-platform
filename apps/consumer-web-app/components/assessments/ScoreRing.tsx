'use client';

/**
 * Overall Wellness Score ring — the requested "ring" visualization for a
 * completed assessment (deliberately a ring, unlike RootScoreCard's
 * breathing-glow object: different feature, different visual language is
 * fine here). The ring's fill direction is inverted from the raw score on
 * purpose: every registered questionnaire scores higher-is-worse, but a
 * fuller/greener ring reading as "healthier" is the universal Apple/Oura/
 * WHOOP convention this product is explicitly matching — so the ring
 * fills with (1 - score/maxScore), while the number in the center is
 * always the real, unmodified score exactly as the verified engine
 * computed it (never a fabricated 0-100 "wellness score").
 */

import { useEffect, useState } from 'react';
import { priorityToStatus, PRIORITY_LABEL } from '@/lib/assessments/presentation';
import type { PriorityLevel } from '@/lib/assessments/engine/types';

const RING_COLOR: Record<string, string> = {
  good: '#16A34A',
  attention: '#F59E0B',
  poor: '#EF4444',
};

type Props = {
  score: number;
  maxScore: number;
  priority: PriorityLevel;
  size?: number;
};

export function ScoreRing({ score, maxScore, priority, size = 176 }: Props) {
  const status = priorityToStatus(priority);
  const healthRatio = maxScore > 0 ? Math.max(0, Math.min(1, 1 - score / maxScore)) : 0;

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - (mounted ? healthRatio : 0));

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        role="img"
        aria-label={`Score ${score} out of ${maxScore}, ${PRIORITY_LABEL[priority].toLowerCase()}`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#EFE9DB"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={RING_COLOR[status]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="transition-[stroke-dashoffset] duration-[1.1s] ease-out motion-reduce:transition-none"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-none text-[#1B3A2D]">
          {score}
        </span>
        <span className="mt-1 text-xs text-[#6B7A72]">of {maxScore}</span>
      </div>
    </div>
  );
}
