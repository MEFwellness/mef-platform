'use client';

/**
 * Weekly-average trend chart for the Progress page's Trends section
 * (check-in metrics only: Energy, Mood, Stress, Sleep Quality, Digestion,
 * Pain). Replaces the old one-dot-per-day MetricTrendChart for this
 * section specifically — MetricTrendChart itself is untouched and still
 * powers the wearable segments on this same page, Home's Energy Trend
 * card, and the coach client view, none of which asked for this change.
 *
 * One point per calendar week (not per day): each real check-in day is
 * bucketed into a 7-day slot counting back from the most recent recorded
 * day, and a week's point is the average of that week's real values —
 * never a single day standing in for a week. Reuses buildSmoothPath from
 * components/EnergyTrendChart.tsx (the same proven line geometry every
 * other trend chart in the app uses) rather than a new curve
 * implementation.
 *
 * Thin-data rules (designed first, not bolted on):
 * - A week with fewer than MIN_CHECKINS_PER_WEEK real values does not get
 *   a point — buildWeeklyBuckets() still allocates that week its slot (so
 *   x-axis spacing stays honest) but its `average` is null. The chart
 *   breaks the connecting line at that slot instead of drawing across it,
 *   so a thin week reads as "not enough logged," not as a smooth trend.
 * - Fewer than MIN_QUALIFYING_WEEKS real weeks anywhere in the fetched
 *   range: no chart at all, a message in the member's own terms instead
 *   (mirrors MetricTrendChart's own <5-day empty state, one floor up).
 *
 * Y-axis labels reuse whatever `levelLabel` function the caller already
 * built for MetricDistributionCard (lib/energy-forecast/scaleLabels.ts's
 * energyLevelLabel/moodLabel/stressLabel/sleepQualityLabel/painLabel, or
 * digestion's plain-number fallback) — one real label set, not a second
 * copy invented for this chart.
 */

import Link from 'next/link';
import { buildSmoothPath } from '@/components/EnergyTrendChart';
import { ScrollDrawIn } from '@/components/ScrollDrawIn';
import type { TrendPoint } from './MetricTrendChart';

export const MIN_CHECKINS_PER_WEEK = 3;
export const MIN_QUALIFYING_WEEKS = 2;

export type WeekBucket = {
  key: string;
  startDate: string; // local_date, inclusive
  endDate: string; // local_date, inclusive
  rangeLabel: string; // "Jun 29-Jul 5"
  average: number | null; // null when count < MIN_CHECKINS_PER_WEEK
  count: number;
};

function parseLocalDate(localDate: string): Date {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(year!, month! - 1, day!);
}

function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Buckets `points` (oldest first) into 7-day weeks counting back from the
 * most recent real value in the set, oldest week first. Every week between
 * the oldest and newest real value gets a slot (even one with zero real
 * check-ins) so gap spacing on the x-axis is honest rather than
 * compressed — a member who skipped a whole week sees a whole week's
 * worth of empty space, not a seamless join between the weeks either side.
 */
export function buildWeeklyBuckets(points: TrendPoint[]): WeekBucket[] {
  const withValues = points.filter((p): p is TrendPoint & { value: number } => p.value !== null);
  if (withValues.length === 0) return [];

  const newest = withValues.reduce(
    (latest, p) => (p.local_date > latest ? p.local_date : latest),
    withValues[0]!.local_date
  );
  const newestDate = parseLocalDate(newest);

  const byIndex = new Map<number, number[]>();
  for (const p of withValues) {
    const daysAgo = Math.round(
      (newestDate.getTime() - parseLocalDate(p.local_date).getTime()) / 86_400_000
    );
    const idx = Math.floor(daysAgo / 7);
    if (!byIndex.has(idx)) byIndex.set(idx, []);
    byIndex.get(idx)!.push(p.value);
  }

  const maxIdx = Math.max(...byIndex.keys());
  const buckets: WeekBucket[] = [];
  for (let idx = maxIdx; idx >= 0; idx--) {
    const endDate = addDays(newestDate, -idx * 7);
    const startDate = addDays(endDate, -6);
    const values = byIndex.get(idx) ?? [];
    const qualifies = values.length >= MIN_CHECKINS_PER_WEEK;
    buckets.push({
      key: `w${idx}`,
      startDate: toLocalDateString(startDate),
      endDate: toLocalDateString(endDate),
      rangeLabel: `${formatShortDate(startDate)}-${formatShortDate(endDate)}`,
      average: qualifies ? values.reduce((sum, v) => sum + v, 0) / values.length : null,
      count: values.length,
    });
  }
  return buckets;
}

export function countQualifyingWeeks(buckets: WeekBucket[]): number {
  return buckets.filter((b) => b.average !== null).length;
}

export function hasEnoughForWeeklyChart(points: TrendPoint[]): boolean {
  return countQualifyingWeeks(buildWeeklyBuckets(points)) >= MIN_QUALIFYING_WEEKS;
}

const PAD_X = 6;
const PAD_TOP = 10;
const PAD_BOTTOM = 10;

type Props = {
  points: TrendPoint[]; // oldest first
  min: number;
  max: number;
  label: string;
  levelLabel: (level: number) => string;
  /** Forces the sweep-in to replay when the active metric pill changes, same pattern MetricDistributionCard uses. */
  resetKey: string;
};

export function WeeklyAverageTrendChart({ points, min, max, label, levelLabel, resetKey }: Props) {
  const buckets = buildWeeklyBuckets(points);
  const qualifyingCount = countQualifyingWeeks(buckets);

  if (qualifyingCount < MIN_QUALIFYING_WEEKS) {
    return (
      <div className="mt-4 rounded-2xl bg-[#F3F6F4] p-5 text-center">
        <p className="text-sm leading-relaxed text-[#1B3A2D]/70">
          {qualifyingCount === 0
            ? `Once you've logged check-ins on at least ${MIN_CHECKINS_PER_WEEK} days in a week, that week's ${label.toLowerCase()} average will start showing up here.`
            : `You have ${qualifyingCount} full ${qualifyingCount === 1 ? 'week' : 'weeks'} logged so far. Your ${label.toLowerCase()} trend appears once you have ${MIN_QUALIFYING_WEEKS}, keep checking in.`}
        </p>
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
  const levels: number[] = [];
  for (let level = min; level <= max; level++) levels.push(level);

  const yForLevel = (level: number) =>
    PAD_TOP + (1 - (level - min) / range) * (100 - PAD_TOP - PAD_BOTTOM);

  const xForIndex = (i: number) =>
    buckets.length === 1 ? 50 : PAD_X + (i / (buckets.length - 1)) * (100 - 2 * PAD_X);

  const plotted = buckets.map((b, i) => ({
    bucket: b,
    x: xForIndex(i),
    y: b.average !== null ? PAD_TOP + (1 - (b.average - min) / range) * (100 - PAD_TOP - PAD_BOTTOM) : null,
  }));

  // Contiguous runs of qualifying weeks — the line connects within a run
  // and stops dead at a gap, rather than skipping over it.
  const runs: { x: number; y: number }[][] = [];
  let currentRun: { x: number; y: number }[] = [];
  for (const p of plotted) {
    if (p.y === null) {
      if (currentRun.length > 0) runs.push(currentRun);
      currentRun = [];
    } else {
      currentRun.push({ x: p.x, y: p.y });
    }
  }
  if (currentRun.length > 0) runs.push(currentRun);

  return (
    <div className="mt-4 rounded-2xl bg-[#F3F6F4] p-4">
      <div className="flex gap-1">
        <div className="relative w-[62px] shrink-0" style={{ height: '176px' }}>
          {levels.map((level) => (
            <span
              key={level}
              className="absolute right-2 -translate-y-1/2 text-right text-[10px] font-medium leading-tight text-[#1B3A2D]/60"
              style={{ top: `${yForLevel(level)}%` }}
            >
              {levelLabel(level)}
            </span>
          ))}
        </div>

        <div className="relative h-44 flex-1">
          <ScrollDrawIn resetKey={resetKey}>
            <div className="relative h-44 w-full overflow-visible">
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="h-full w-full overflow-visible"
                role="img"
                aria-label={`${label} weekly average trend across ${qualifyingCount} recorded weeks`}
              >
                <defs>
                  <linearGradient id="weeklyAreaFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1B3A2D" stopOpacity="0.14" />
                    <stop offset="100%" stopColor="#1B3A2D" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {levels.map((level) => (
                  <line
                    key={level}
                    x1={PAD_X}
                    x2={100 - PAD_X}
                    y1={yForLevel(level)}
                    y2={yForLevel(level)}
                    stroke="#1B3A2D"
                    strokeOpacity={0.08}
                    strokeWidth={0.5}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}

                {runs.map((run, i) => {
                  const linePath = buildSmoothPath(run);
                  const baseline = 100 - PAD_BOTTOM;
                  const areaPath =
                    run.length > 1
                      ? `${linePath} L ${run[run.length - 1]!.x} ${baseline} L ${run[0]!.x} ${baseline} Z`
                      : '';
                  return (
                    <g key={i}>
                      {areaPath && <path d={areaPath} fill="url(#weeklyAreaFill)" stroke="none" />}
                      <path
                        d={linePath}
                        fill="none"
                        stroke="#1B3A2D"
                        strokeWidth={3}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                      />
                    </g>
                  );
                })}
              </svg>

              {plotted.map((p) =>
                p.y === null ? (
                  <div
                    key={p.bucket.key}
                    className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-[#1B3A2D]/30"
                    style={{ left: `${p.x}%`, top: '50%' }}
                    title={`${p.bucket.rangeLabel}: not enough logged that week`}
                  />
                ) : (
                  <div
                    key={p.bucket.key}
                    className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-[#F3F6F4] bg-[#1B3A2D]"
                    style={{ left: `${p.x}%`, top: `${p.y}%` }}
                    title={`${p.bucket.rangeLabel}: ${levelLabel(Math.round(p.bucket.average!))} (avg ${p.bucket.average!.toFixed(1)})`}
                  />
                )
              )}
            </div>
          </ScrollDrawIn>
        </div>
      </div>

      <div className="mt-2 flex pl-[66px]">
        {buckets.map((b) => (
          <div key={b.key} className="flex-1 text-center">
            <p className="text-[10px] leading-tight text-[#1B3A2D]/70">{b.rangeLabel}</p>
            {b.average === null && (
              <p className="text-[9px] italic leading-tight text-[#1B3A2D]/40">not enough logged</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
