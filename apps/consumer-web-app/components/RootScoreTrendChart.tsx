'use client';

/**
 * Root Score history chart — same index-based-spacing, real-points-only
 * approach as components/EnergyTrendChart.tsx (points are spaced evenly
 * by their position in the snapshot list, not by calendar date), so a
 * gap where no snapshot was calculated is simply absent rather than
 * interpolated across. Shared by app/root-score/ and app/progress/ so
 * both surfaces read the same history the same way.
 *
 * MIN_SCORED_SNAPSHOTS_FOR_TREND is the real, single-source-of-truth
 * minimum this component itself requires to draw a line — you cannot
 * plot a line through fewer than 2 points. app/root-score/'s own call
 * site relies on this exact gate with no wrapper (confirmed by reading
 * that page directly); app/progress/ProgressRootScorePanel.tsx imports
 * this same constant rather than hand-copying the number, so the two
 * surfaces can never silently drift out of sync on what "enough data"
 * means for this chart. The constant itself lives in
 * lib/scoring/rootScoreTrendConfig.ts, not in this file — this file has
 * `'use client'`, and a Server Component reading a plain constant
 * re-exported from a client module gets an opaque client-reference
 * placeholder instead of the real value (arithmetic on it silently
 * produces NaN), found the hard way while building the progress-to-unlock
 * state that needs to do real arithmetic with this number server-side.
 *
 * "Your Wellness Story" rework: dot color used to be driven by
 * `scoreToStatus` (good/attention/poor, rendering as green/amber/red) —
 * removed. A routine day's Root Score dipping into "attention" or "poor"
 * territory is normal variation, not a genuine concern requiring an
 * alarm color; red in this app is otherwise reserved for real alert
 * states, and having it fire on ordinary score movement implied a
 * meaning that didn't exist. Every data point is now a flat forest green
 * `#1B3A2D`, matching the Energy Trend segment on the same page
 * (app/progress/MetricTrendChart.tsx), which got the identical fix in
 * the same task.
 *
 * `animated` (opt-in, defaults false): the line/area draw in over ~900ms
 * once the chart scrolls into view, then the dots fade and scale in.
 * Fires once per page view — it does not replay on a later scroll pass,
 * unlike components/ScrollDrawIn.tsx's deliberately-replayable behavior
 * (see components/useChartRevealOnce.ts's own doc comment for why this
 * is a second, narrower hook rather than a change to that one).
 * app/root-score/'s own call site does not pass this prop and is
 * completely unaffected; only app/progress/ProgressRootScorePanel.tsx
 * (via AnimatedRootScoreTrendChart) opts in.
 */

import { useState } from 'react';
import type { RootScoreSnapshot } from '@mef/shared-types-contracts';
import { energyBarWidth } from '@/components/EnergyTrendChart';
import { useChartRevealOnce } from '@/components/useChartRevealOnce';
import { MIN_SCORED_SNAPSHOTS_FOR_TREND } from '@/lib/scoring/rootScoreTrendConfig';

type Props = {
  /** Oldest first. */
  snapshots: RootScoreSnapshot[];
  /** Vertical bars behind the line/dots — see EnergyTrendChart's own showBars doc comment for the full history. Opt-in, defaults false. */
  showBars?: boolean;
  /** Scroll-triggered, once-per-page-view draw-in animation. Opt-in, defaults false. */
  animated?: boolean;
};

const PAD_X = 5;
const PAD_TOP = 14;
const PAD_BOTTOM = 14;
const LINE_DRAW_MS = 900;
const DOT_REVEAL_MS = 300;

function formatDate(localDate: string): string {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(year!, month! - 1, day!).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
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

export function RootScoreTrendChart({ snapshots, showBars = false, animated = false }: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const { ref, drawn, reducedMotion } = useChartRevealOnce();

  const withScores = snapshots.filter(
    (s): s is RootScoreSnapshot & { root_score: number } => s.root_score !== null
  );

  if (withScores.length < MIN_SCORED_SNAPSHOTS_FOR_TREND) {
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
    const x =
      withScores.length === 1 ? 50 : PAD_X + (i / (withScores.length - 1)) * (100 - 2 * PAD_X);
    const y = PAD_TOP + (1 - normalized) * (100 - PAD_TOP - PAD_BOTTOM);
    return { x, y, snapshot: s };
  });

  const linePath = buildSmoothPath(points.map((p) => ({ x: p.x, y: p.y })));
  const baseline = 100 - PAD_BOTTOM;
  const areaPath = `${linePath} L ${points[points.length - 1]!.x} ${baseline} L ${points[0]!.x} ${baseline} Z`;
  const active = activeIndex !== null ? points[activeIndex] : null;

  const revealed = !animated || reducedMotion || drawn;

  return (
    <div ref={animated ? ref : undefined} className="mt-4 rounded-2xl bg-[#F3F6F4] p-4">
      <div className="relative h-40 w-full overflow-hidden rounded-xl">
        <div
          style={
            animated && !reducedMotion
              ? {
                  clipPath: drawn ? 'inset(0 0% 0 0)' : 'inset(0 100% 0 0)',
                  transition: drawn ? `clip-path ${LINE_DRAW_MS}ms ease-out` : 'none',
                }
              : undefined
          }
        >
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

            {/* Vertical bars: subtle, fixed on-palette color/opacity,
                rendered before the area fill/line/dots so they sit
                furthest back. Real bars, not decoration: height is
                exactly baseline-to-point, same geometry the line
                already plots. */}
            {showBars &&
              points.map((p) => {
                const barWidth = energyBarWidth(withScores.length);
                return (
                  <rect
                    key={`bar-${p.snapshot.id}`}
                    x={p.x - barWidth / 2}
                    y={p.y}
                    width={barWidth}
                    height={Math.max(baseline - p.y, 0)}
                    rx={Math.min(barWidth * 0.3, 1.5)}
                    fill="#1B3A2D"
                    fillOpacity={0.14}
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
        </div>

        {points.map((p, i) => (
          <button
            key={p.snapshot.id}
            type="button"
            className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#1B3A2D] hover:scale-125 focus-visible:scale-125 focus-visible:outline-none"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              opacity: revealed ? 1 : 0,
              // Two independently-timed transitions on one element: opacity
              // (the delayed post-line-draw fade-in) and transform (the
              // existing fast hover/focus scale-up) can't be expressed as
              // one shorthand without one silently overriding the other, so
              // both are spelled out longhand here rather than split
              // between this inline style and a `transition-transform`
              // class — that split was tried first and does not survive:
              // whichever sets `transition-property` last wins outright,
              // it doesn't merge across the two.
              transitionProperty: 'opacity, transform',
              transitionDuration: animated && !reducedMotion ? `${DOT_REVEAL_MS}ms, 150ms` : '0ms, 150ms',
              transitionTimingFunction: 'ease-out',
              transitionDelay: animated && !reducedMotion ? `${LINE_DRAW_MS}ms, 0ms` : '0ms, 0ms',
            }}
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
            className="pointer-events-none absolute -translate-x-1/2 rounded-xl bg-[#1B3A2D] px-3 py-1.5 text-xs font-medium text-[#F5F0E4] shadow-[0_4px_16px_-4px_rgba(27,58,45,0.25)]"
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
