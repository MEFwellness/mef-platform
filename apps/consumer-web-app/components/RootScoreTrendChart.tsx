'use client';

/**
 * Root Score history chart — same index-based-spacing, real-points-only
 * approach as components/EnergyTrendChart.tsx (points are spaced evenly
 * by their position in the snapshot list, not by calendar date), so a
 * gap where no snapshot was calculated is simply absent rather than
 * interpolated across. Shared by app/root-score/ and app/progress/ so
 * both surfaces read the same history the same way.
 */

import { useState } from 'react';
import type { RootScoreSnapshot } from '@mef/shared-types-contracts';
import { scoreToStatus } from '@/lib/wellness/wellness-index';
import { STATUS_STYLES } from '@/lib/wellness/status';

type Props = {
  /** Oldest first. */
  snapshots: RootScoreSnapshot[];
};

const PAD_X = 5;
const PAD_TOP = 14;
const PAD_BOTTOM = 14;

const DOT_FILL: Record<string, string> = {
  good: '#16A34A',
  attention: '#F59E0B',
  poor: '#EF4444',
  'no-data': '#EFE9DB',
};

function formatDate(localDate: string): string {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(year!, month! - 1, day!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

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

export function RootScoreTrendChart({ snapshots }: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const withScores = snapshots.filter(
    (s): s is RootScoreSnapshot & { root_score: number } => s.root_score !== null
  );

  if (withScores.length < 2) {
    return (
      <div className="mt-4 flex h-40 items-center justify-center rounded-2xl bg-[#F3F6F4] p-4 text-center">
        <p className="text-sm text-[#1B3A2D]/70">
          Your Root Score trend will appear here after a few real calculations.
        </p>
      </div>
    );
  }

  const points = withScores.map((s, i) => {
    const normalized = s.root_score / 100;
    const x = withScores.length === 1 ? 50 : PAD_X + (i / (withScores.length - 1)) * (100 - 2 * PAD_X);
    const y = PAD_TOP + (1 - normalized) * (100 - PAD_TOP - PAD_BOTTOM);
    return { x, y, snapshot: s, status: scoreToStatus(s.root_score) };
  });

  const linePath = buildSmoothPath(points.map((p) => ({ x: p.x, y: p.y })));
  const baseline = 100 - PAD_BOTTOM;
  const areaPath = `${linePath} L ${points[points.length - 1]!.x} ${baseline} L ${points[0]!.x} ${baseline} Z`;
  const active = activeIndex !== null ? points[activeIndex] : null;

  return (
    <div className="mt-4 rounded-2xl bg-[#F3F6F4] p-4">
      <div className="relative h-40 w-full overflow-hidden rounded-xl">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="h-full w-full"
          role="img"
          aria-label={`Root Score trend over the last ${withScores.length} calculations, from ${withScores[0]!.root_score} to ${withScores[withScores.length - 1]!.root_score}`}
        >
          <defs>
            <linearGradient id="rootScoreAreaFill" x1="0" y1="0" x2="0" y2="1">
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

          <path d={areaPath} fill="url(#rootScoreAreaFill)" stroke="none" />
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

        {points.map((p, i) => (
          <button
            key={p.snapshot.id}
            type="button"
            className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white transition-transform hover:scale-125 focus-visible:scale-125 focus-visible:outline-none"
            style={{ left: `${p.x}%`, top: `${p.y}%`, backgroundColor: DOT_FILL[p.status] }}
            aria-label={`${formatDate(p.snapshot.local_date)}: Root Score ${p.snapshot.root_score}`}
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
            {formatDate(active.snapshot.local_date)} · {active.snapshot.root_score}
          </div>
        )}
      </div>

      <div className="mt-2 flex justify-between text-[11px] text-[#1B3A2D]/70">
        <span>{formatDate(withScores[0]!.local_date)}</span>
        <span>{formatDate(withScores[withScores.length - 1]!.local_date)}</span>
      </div>
    </div>
  );
}
