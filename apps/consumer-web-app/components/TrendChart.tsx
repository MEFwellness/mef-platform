'use client';

/**
 * Generic, metric-agnostic trend chart — the one shared component behind
 * all three member-platform trend charts (Home's Energy Trend, Progress's
 * Root Score, and the Root Score detail page's Root Score Trend). Reuses
 * components/EnergyTrendChart.tsx's proven pure geometry helpers
 * (buildSmoothPath, energyBarWidth) rather than re-deriving them — same
 * discipline components/RootScoreTrendChart.tsx and
 * app/progress/MetricTrendChart.tsx already followed.
 *
 * What this adds beyond the pre-existing per-metric charts:
 *  - A real value axis (3-5 evenly spaced labels anchored to the metric's
 *    true range, e.g. 1-5 for energy, 0-100 for Root Score — never
 *    rescaled to the data's own min/max, so a flat stretch reads as flat).
 *  - A date label under every point at short ranges, automatically
 *    thinned (never overlapping/truncated) at longer ones.
 *  - Calendar-accurate point positions within the selected window (not
 *    index-based spacing) so a gap between non-consecutive check-ins
 *    reads as real empty space — the connecting line breaks across any
 *    gap wider than one day instead of smoothing over missing data.
 *  - Flat, single-color dots everywhere (no red/amber grading) — every
 *    caller of this component is a routine value, not an alert state.
 *
 * The scroll-triggered draw-in animation (components/ScrollDrawIn.tsx)
 * wraps this component from the outside, exactly as it already wrapped
 * EnergyTrendChart/RootScoreTrendChart — nothing about that mechanism
 * changes here.
 */

import { useLayoutEffect, useRef, useState } from 'react';
import { buildSmoothPath, energyBarWidth } from '@/components/EnergyTrendChart';

export type TrendChartPoint = {
  id: string;
  local_date: string; // YYYY-MM-DD, member-local
  value: number;
};

const PAD_X = 5;
const PAD_TOP = 14;
const PAD_BOTTOM = 14;
const MS_PER_DAY = 86_400_000;

// ---- Pure date/window math — exported for unit coverage ----

export function parseLocalDate(localDate: string): Date {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(year!, month! - 1, day!);
}

export function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dayDiff(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / MS_PER_DAY);
}

export function formatDate(localDate: string): string {
  return parseLocalDate(localDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/** The trailing [start, end] calendar window for a given range length, anchored to the member's real local "today" — never the data's own last point, so an empty tail (no check-in yet today) shows as a real gap, not a shifted window. */
export function computeRangeWindow(
  todayLocalDate: string,
  totalDays: number
): { start: Date; end: Date; totalDays: number } {
  const end = parseLocalDate(todayLocalDate);
  const start = addDays(end, -(totalDays - 1));
  return { start, end, totalDays };
}

/** Real data points only, filtered to the window — nothing fabricated to fill gaps. */
export function sliceToWindow<T extends { local_date: string }>(
  points: T[],
  start: Date,
  end: Date
): T[] {
  const startStr = toLocalDateString(start);
  const endStr = toLocalDateString(end);
  return points.filter((p) => p.local_date >= startStr && p.local_date <= endStr);
}

function dayOffset(localDate: string, start: Date): number {
  return dayDiff(parseLocalDate(localDate), start);
}

function xForOffset(offset: number, totalDays: number): number {
  return totalDays <= 1 ? 50 : PAD_X + (offset / (totalDays - 1)) * (100 - 2 * PAD_X);
}

/** Groups point indices into contiguous runs — a run breaks wherever two neighboring real points are more than one calendar day apart, so the line never smooths across a missing day. */
export function groupContiguousRuns(offsets: number[]): number[][] {
  const runs: number[][] = [];
  let current: number[] = [];
  for (let i = 0; i < offsets.length; i++) {
    if (i > 0 && offsets[i]! - offsets[i - 1]! > 1) {
      runs.push(current);
      current = [];
    }
    current.push(i);
  }
  if (current.length) runs.push(current);
  return runs;
}

/**
 * Picks which point indices get a printed date label. Spacing is measured
 * in real rendered x-percent (the same 0-100 coordinate space every point
 * is already plotted in), with a minimum gap derived from the chart's
 * actual measured pixel width — not calendar days, and not a per-range
 * guess. An earlier day-based version looked safe in the common
 * dense/daily case, but real check-ins are sparse and can cluster
 * unevenly within a wide window (e.g. several days in a row recently, then
 * nothing for two weeks); day-based spacing doesn't account for how many
 * pixels a "Jul 22"-sized label actually needs, so it still let two
 * labels collide at some viewport widths. Reasoning directly in the
 * chart's own x-percent space, against a real measured container width,
 * is what actually prevents overlap regardless of range or viewport.
 */
export function selectDateLabelIndices(xPercents: number[], minGapPercent: number): Set<number> {
  const count = xPercents.length;
  if (count === 0) return new Set();
  if (count === 1) return new Set([0]);

  const selected: number[] = [0];
  for (let i = 1; i < count; i++) {
    const lastX = xPercents[selected[selected.length - 1]!]!;
    if (xPercents[i]! - lastX >= minGapPercent) selected.push(i);
  }

  const lastIndex = count - 1;
  if (selected[selected.length - 1] !== lastIndex) {
    const prevIndex = selected[selected.length - 1]!;
    if (xPercents[lastIndex]! - xPercents[prevIndex]! < minGapPercent && selected.length > 1) {
      selected.pop();
    }
    selected.push(lastIndex);
  }
  return new Set(selected);
}

/** A "Jul 22"-shaped label in 10px DM Sans measures ~27-28px wide in practice (measured live via Playwright). */
const ASSUMED_LABEL_WIDTH_PX = 28;
/** The minimum anchor-to-anchor pitch between two center-anchored labels: label width plus real breathing room (measured live — a bare label-width pitch still touched by under a pixel at some viewport widths). */
const DATE_LABEL_PITCH_PX = ASSUMED_LABEL_WIDTH_PX + 10;
/** Assumed narrowest-viewport gap used only until the real container width is measured (this component's first paint) — conservative enough that the very first render never flashes an overlapping set before the layout effect corrects it. */
const FALLBACK_MIN_GAP_PERCENT = 22;

type Props = {
  /** Real data points inside the already-selected window, oldest first. */
  points: TrendChartPoint[];
  windowStart: Date;
  totalDays: number;
  /** The metric's true, fixed range — never derived from the data itself. */
  min: number;
  max: number;
  /** Ascending value ticks to render as gridlines + axis labels (roughly 3-5). */
  axisTicks: number[];
  formatValue: (value: number) => string;
  formatTooltip: (point: TrendChartPoint) => string;
  ariaLabel: string;
  emptyRangeMessage: string;
};

export function TrendChart({
  points,
  windowStart,
  totalDays,
  min,
  max,
  axisTicks,
  formatValue,
  formatTooltip,
  ariaLabel,
  emptyRangeMessage,
}: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const dateLabelsRef = useRef<HTMLDivElement>(null);
  const [containerWidthPx, setContainerWidthPx] = useState(0);

  useLayoutEffect(() => {
    const node = dateLabelsRef.current;
    if (!node) return;
    const measure = () => {
      const width = node.clientWidth;
      if (width > 0) setContainerWidthPx(width);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Every date label is center-anchored (-translate-x-1/2) uniformly, so
  // the overlap requirement is simply "anchors at least one label-width
  // apart" everywhere — no special-cased edge anchoring with a different
  // (and, as measured live, insufficient) spacing requirement. Off-screen
  // clipping at the very first/last point is prevented separately by
  // clamping the anchor itself (edgeMarginPercent below), not by switching
  // how the label is anchored.
  const minGapPercent =
    containerWidthPx > 0 ? (DATE_LABEL_PITCH_PX / containerWidthPx) * 100 : FALLBACK_MIN_GAP_PERCENT;
  const edgeMarginPercent =
    containerWidthPx > 0
      ? (ASSUMED_LABEL_WIDTH_PX / 2 / containerWidthPx) * 100
      : FALLBACK_MIN_GAP_PERCENT / 2;

  if (points.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl bg-white/40 p-4 text-center">
        <p className="text-sm text-[#1B3A2D]/70">{emptyRangeMessage}</p>
      </div>
    );
  }

  const range = max - min || 1;
  const valueY = (value: number) => PAD_TOP + (1 - (value - min) / range) * (100 - PAD_TOP - PAD_BOTTOM);

  const offsets = points.map((p) => dayOffset(p.local_date, windowStart));
  const plotted = points.map((p, i) => ({
    x: xForOffset(offsets[i]!, totalDays),
    y: valueY(p.value),
    point: p,
  }));

  const runs = groupContiguousRuns(offsets);
  const baseline = 100 - PAD_BOTTOM;
  const barWidth = energyBarWidth(totalDays);
  const labelIndices = selectDateLabelIndices(plotted.map((p) => p.x), minGapPercent);
  const active = activeIndex !== null ? plotted[activeIndex] : null;

  return (
    <div>
      <div className="flex gap-1.5">
        {/* Value axis labels — small, muted, never competing with the data. */}
        <div className="relative h-40 w-8 shrink-0">
          {axisTicks.map((tick) => (
            <span
              key={tick}
              className="absolute right-0 -translate-y-1/2 whitespace-nowrap font-[family-name:var(--font-dm-sans)] text-[10px] text-[#1B3A2D]/60"
              style={{ top: `${valueY(tick)}%` }}
            >
              {formatValue(tick)}
            </span>
          ))}
        </div>

        <div className="relative h-40 w-full overflow-hidden rounded-xl">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="h-full w-full"
            role="img"
            aria-label={ariaLabel}
          >
            <defs>
              <linearGradient id="trendChartAreaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1B3A2D" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#1B3A2D" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Gridlines aligned to the same value ticks as the axis labels. */}
            {axisTicks.map((tick) => (
              <line
                key={tick}
                x1={PAD_X}
                x2={100 - PAD_X}
                y1={valueY(tick)}
                y2={valueY(tick)}
                stroke="#1B3A2D"
                strokeOpacity={0.06}
                strokeWidth={0.5}
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {plotted.map((p) => (
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

            {/* One area/line segment per contiguous run — a gap between
                non-consecutive check-ins is genuinely blank space, never
                a smoothed-over line implying data that doesn't exist. */}
            {runs.map((run, runIndex) => {
              const runPoints = run.map((i) => ({ x: plotted[i]!.x, y: plotted[i]!.y }));
              const linePath = buildSmoothPath(runPoints);
              if (runPoints.length < 2) return null;
              const areaPath = `${linePath} L ${runPoints[runPoints.length - 1]!.x} ${baseline} L ${runPoints[0]!.x} ${baseline} Z`;
              return (
                <g key={`run-${runIndex}`}>
                  <path d={areaPath} fill="url(#trendChartAreaFill)" stroke="none" />
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
                </g>
              );
            })}
          </svg>

          {plotted.map((p, i) => (
            <button
              key={p.point.id}
              type="button"
              className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#1B3A2D] transition-transform hover:scale-125 focus-visible:scale-125 focus-visible:outline-none"
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
              aria-label={formatTooltip(p.point)}
              onMouseEnter={() => setActiveIndex(i)}
              onMouseLeave={() => setActiveIndex((current) => (current === i ? null : current))}
              onFocus={() => setActiveIndex(i)}
              onBlur={() => setActiveIndex((current) => (current === i ? null : current))}
              onClick={() => setActiveIndex((current) => (current === i ? null : i))}
            />
          ))}

          {active && (
            <div
              className="pointer-events-none absolute -translate-x-1/2 rounded-xl bg-[#1B3A2D] px-3 py-1.5 text-xs font-medium text-[#F5F0E4] shadow-[0_4px_16px_-4px_rgba(27,58,45,0.25)]"
              style={{
                left: `${Math.min(Math.max(active.x, 12), 88)}%`,
                top: `${Math.max(active.y - 14, 4)}%`,
              }}
            >
              {formatTooltip(active.point)}
            </div>
          )}
        </div>
      </div>

      {/* Date labels — every point keeps its date; only which labels are
          printed thins out at longer ranges, so nothing overlaps or
          truncates. */}
      <div ref={dateLabelsRef} className="relative ml-[38px] mt-2 h-3.5">
        {plotted.map((p, i) => {
          if (!labelIndices.has(i)) return null;
          const clampedX = Math.min(Math.max(p.x, edgeMarginPercent), 100 - edgeMarginPercent);
          return (
            <span
              key={`label-${p.point.id}`}
              className="absolute -translate-x-1/2 whitespace-nowrap font-[family-name:var(--font-dm-sans)] text-[10px] text-[#1B3A2D]/60"
              style={{ left: `${clampedX}%` }}
            >
              {formatDate(p.point.local_date)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
