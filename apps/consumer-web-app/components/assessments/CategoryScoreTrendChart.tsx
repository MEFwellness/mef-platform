'use client';

/**
 * Historical score trend for one category (or the overall total) across a
 * member's completed assessments. Same index-based-spacing, real-points-
 * only approach as components/RootScoreTrendChart.tsx: points are spaced
 * evenly by their position in the list, not by calendar date, so a gap
 * between assessments is simply absent rather than interpolated across.
 *
 * Plotted as (1 - score/maxScore) rather than the raw score, so "the line
 * goes up" reads as "getting better" everywhere in this feature — the
 * same visual convention as ScoreRing and CategoryRadarChart — even
 * though the underlying CHEK scale is higher-is-worse. The real score is
 * still what's shown in the point tooltip.
 */

import { useState } from 'react';
import { priorityToStatus } from '@/lib/assessments/presentation';
import { STATUS_STYLES } from '@/lib/wellness/status';
import type { PriorityLevel } from '@/lib/assessments/engine/types';

export type TrendPoint = {
  id: string;
  dateLabel: string;
  score: number;
  maxScore: number;
  priority: PriorityLevel;
};

const PAD_X = 5;
const PAD_TOP = 14;
const PAD_BOTTOM = 14;

const DOT_FILL: Record<string, string> = {
  good: '#16A34A',
  attention: '#F59E0B',
  poor: '#EF4444',
};

function buildSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0]!.x} ${points[0]!.y}`;
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i]!;
    const p1 = points[i + 1]!;
    const midX = (p0.x + p1.x) / 2;
    d += ` C ${midX} ${p0.y}, ${midX} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

export function CategoryScoreTrendChart({ points, emptyLabel }: { points: TrendPoint[]; emptyLabel: string }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (points.length < 2) {
    return (
      <div className="mt-4 flex h-40 items-center justify-center rounded-2xl bg-[#F3F6F4] p-4 text-center">
        <p className="text-sm text-[#1B3A2D]/70">{emptyLabel}</p>
      </div>
    );
  }

  const plotted = points.map((p, i) => {
    const ratio = p.maxScore > 0 ? Math.max(0, Math.min(1, 1 - p.score / p.maxScore)) : 0;
    const x = PAD_X + (i / (points.length - 1)) * (100 - 2 * PAD_X);
    const y = PAD_TOP + (1 - ratio) * (100 - PAD_TOP - PAD_BOTTOM);
    return { x, y, point: p, status: priorityToStatus(p.priority) };
  });

  const linePath = buildSmoothPath(plotted.map((p) => ({ x: p.x, y: p.y })));
  const baseline = 100 - PAD_BOTTOM;
  const areaPath = `${linePath} L ${plotted[plotted.length - 1]!.x} ${baseline} L ${plotted[0]!.x} ${baseline} Z`;
  const active = activeIndex !== null ? plotted[activeIndex] : null;
  const gradientId = 'assessmentTrendAreaFill';

  return (
    <div className="mt-4 rounded-2xl bg-[#F3F6F4] p-4">
      <div className="relative h-40 w-full overflow-hidden rounded-xl">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="h-full w-full"
          role="img"
          aria-label={`Trend over ${points.length} assessments, from ${points[0]!.score} to ${points[points.length - 1]!.score}`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1B3A2D" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#1B3A2D" stopOpacity="0" />
            </linearGradient>
          </defs>

          {[0, 25, 50, 75, 100].map((n) => {
            const y = PAD_TOP + (1 - n / 100) * (100 - PAD_TOP - PAD_BOTTOM);
            return (
              <line
                key={n}
                x1={PAD_X}
                x2={100 - PAD_X}
                y1={y}
                y2={y}
                stroke="#1B3A2D"
                strokeOpacity={0.06}
                strokeWidth={0.5}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}

          <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
          <path
            d={linePath}
            fill="none"
            stroke="#1B3A2D"
            strokeOpacity={0.45}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {plotted.map((p, i) => (
          <button
            key={p.point.id}
            type="button"
            className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white transition-transform hover:scale-125 focus-visible:scale-125 focus-visible:outline-none"
            style={{ left: `${p.x}%`, top: `${p.y}%`, backgroundColor: DOT_FILL[p.status] }}
            aria-label={`${p.point.dateLabel}: ${p.point.score} of ${p.point.maxScore}`}
            onMouseEnter={() => setActiveIndex(i)}
            onMouseLeave={() => setActiveIndex((current) => (current === i ? null : current))}
            onFocus={() => setActiveIndex(i)}
            onBlur={() => setActiveIndex((current) => (current === i ? null : current))}
            onClick={() => setActiveIndex(i)}
          />
        ))}

        {active && (
          <div
            className={`pointer-events-none absolute -translate-x-1/2 rounded-xl px-3 py-1.5 text-xs font-medium shadow-[0_4px_16px_-4px_rgba(27,58,45,0.25)] ${STATUS_STYLES[active.status].bg} ${STATUS_STYLES[active.status].text}`}
            style={{ left: `${active.x}%`, top: `${Math.max(active.y - 14, 4)}%` }}
          >
            {active.point.dateLabel} · {active.point.score}
          </div>
        )}
      </div>

      <div className="mt-2 flex justify-between text-[11px] text-[#1B3A2D]/70">
        <span>{points[0]!.dateLabel}</span>
        <span>{points[points.length - 1]!.dateLabel}</span>
      </div>
    </div>
  );
}
