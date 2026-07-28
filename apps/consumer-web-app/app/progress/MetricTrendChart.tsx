'use client';

/**
 * Generic single-metric trend chart for the Progress page's unified Trends
 * card — one chart shape shared by every segment (check-in metrics and
 * wearable metrics alike) instead of a bespoke chart per metric. Reuses
 * the exact line/area/dot geometry helpers already proven by
 * components/EnergyTrendChart.tsx (buildSmoothPath, energyBarWidth) rather
 * than re-deriving them, so this is presentation-only — no new scoring or
 * intelligence logic, just normalization + rendering.
 *
 * Minimum-data floor (UX audit follow-up, Progress restructure task): a
 * line drawn from fewer than 5 real points isn't a trend. Below that
 * floor this renders an empty state — an observational line plus a link
 * to today's check-in — instead of a misleadingly sparse chart.
 */

import Link from 'next/link';
import { buildSmoothPath, energyBarWidth } from '@/components/EnergyTrendChart';
import { STATUS_STYLES, type MetricStatus } from '@/lib/wellness/status';

const MIN_POINTS_FOR_TREND = 5;

export type TrendPoint = {
  id: string;
  local_date: string;
  value: number | null;
};

type Props = {
  points: TrendPoint[]; // oldest first
  min: number;
  max: number;
  unit: string;
  label: string;
  emptyStateCopy: string;
  statusFor?: ((value: number) => MetricStatus) | undefined;
};

const PAD_X = 5;
const PAD_TOP = 14;
const PAD_BOTTOM = 14;

function formatDate(localDate: string): string {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(year!, month! - 1, day!).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function hasEnoughDataForTrend(points: TrendPoint[]): boolean {
  return points.filter((p) => p.value !== null).length >= MIN_POINTS_FOR_TREND;
}

export function MetricTrendChart({ points, min, max, unit, label, emptyStateCopy, statusFor }: Props) {
  const withValues = points.filter(
    (p): p is TrendPoint & { value: number } => p.value !== null
  );

  if (withValues.length < MIN_POINTS_FOR_TREND) {
    return (
      <div className="mt-4 rounded-2xl bg-[#F3F6F4] p-5 text-center">
        <p className="text-sm leading-relaxed text-[#1B3A2D]/70">{emptyStateCopy}</p>
        <Link
          href="/checkin"
          className="mt-3 inline-block text-sm font-medium text-[#1B3A2D] hover:underline"
        >
          Go to today&apos;s check-in
        </Link>
      </div>
    );
  }

  const range = max - min || 1;
  const points2d = withValues.map((p, i) => {
    const normalized = (p.value - min) / range;
    const x =
      withValues.length === 1 ? 50 : PAD_X + (i / (withValues.length - 1)) * (100 - 2 * PAD_X);
    const y = PAD_TOP + (1 - normalized) * (100 - PAD_TOP - PAD_BOTTOM);
    const status = statusFor ? statusFor(p.value) : 'no-data';
    return { x, y, point: p, status };
  });

  const linePath = buildSmoothPath(points2d.map((p) => ({ x: p.x, y: p.y })));
  const baseline = 100 - PAD_BOTTOM;
  const areaPath = `${linePath} L ${points2d[points2d.length - 1]!.x} ${baseline} L ${points2d[0]!.x} ${baseline} Z`;
  const barWidth = energyBarWidth(withValues.length);
  const dotColor = (status: MetricStatus) =>
    statusFor ? STATUS_STYLES[status].dot : 'bg-[#1B3A2D]';

  return (
    <div className="mt-4 rounded-2xl bg-[#F3F6F4] p-4">
      <div className="relative h-40 w-full overflow-hidden rounded-xl">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="h-full w-full"
          role="img"
          aria-label={`${label} trend over the last ${withValues.length} recorded days`}
        >
          <defs>
            <linearGradient id="metricAreaFill" x1="0" y1="0" x2="0" y2="1">
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

          {points2d.map((p) => (
            <rect
              key={`bar-${p.point.id}`}
              x={p.x - barWidth / 2}
              y={p.y}
              width={barWidth}
              height={Math.max(baseline - p.y, 0)}
              rx={Math.min(barWidth * 0.3, 1.5)}
              fill="#1B3A2D"
              fillOpacity={0.14}
            />
          ))}

          <path d={areaPath} fill="url(#metricAreaFill)" stroke="none" />
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

        {points2d.map((p) => (
          <div
            key={p.point.id}
            className={`absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white ${dotColor(p.status)}`}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            title={`${formatDate(p.point.local_date)}: ${p.point.value}${unit}`}
          />
        ))}
      </div>

      <div className="mt-2 flex justify-between text-[11px] text-[#1B3A2D]/70">
        <span>{formatDate(withValues[0]!.local_date)}</span>
        <span>{formatDate(withValues[withValues.length - 1]!.local_date)}</span>
      </div>
    </div>
  );
}
