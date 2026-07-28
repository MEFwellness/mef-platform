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
 * lib/scoring/rootScoreTrendConfig.ts (not in this file — see that
 * module's own doc comment for why a Server Component can't safely read
 * a constant re-exported from this 'use client' file).
 *
 * Reuses buildSmoothPath and energyBarWidth from EnergyTrendChart.tsx
 * rather than keeping its own copies — this chart used to carry a
 * duplicate local buildSmoothPath; removed, since it's pure point-path
 * math with nothing Root-Score-specific about it.
 *
 * Dot color is a flat forest green `#1B3A2D`, not the graded
 * good/attention/poor scale EnergyTrendChart's dots use — a routine
 * day's Root Score dipping into "attention" or "poor" territory is
 * normal variation, not a genuine concern requiring an alarm color, and
 * red in this app is otherwise reserved for real alert states. This is
 * the one deliberate difference from EnergyTrendChart's configuration;
 * everything else (line, area fill, bars, gridlines, hover tooltip,
 * animation) matches exactly.
 *
 * Animation: no longer handled inside this component. It used to carry
 * its own `animated` prop + components/useChartRevealOnce.ts (a
 * once-per-page-view mechanism built for a prior task that asked for
 * different timing than Home's chart). This task asks both Root Score
 * charts to animate *exactly* as Home's Energy Trend chart does —
 * investigation found Home's actual mechanism (components/ScrollDrawIn.tsx,
 * wrapped externally by components/dashboard/AnimatedEnergyTrendChart.tsx)
 * resets and replays every time the chart scrolls out of and back into
 * view, and reveals the whole card — line, bars, and dots together — as
 * one single left-to-right wipe, not a two-stage "line, then dots after"
 * sequence. So this component went back to being a plain, unanimated
 * chart (matching EnergyTrendChart's own lack of internal animation
 * logic) and components/AnimatedRootScoreTrendChart.tsx now wraps it in
 * the exact same ScrollDrawIn, matching Home's real component and
 * configuration rather than a bespoke variant.
 */

import { useState } from 'react';
import type { RootScoreSnapshot } from '@mef/shared-types-contracts';
import { buildSmoothPath, energyBarWidth } from '@/components/EnergyTrendChart';
import { MIN_SCORED_SNAPSHOTS_FOR_TREND } from '@/lib/scoring/rootScoreTrendConfig';

type Props = {
  /** Oldest first. */
  snapshots: RootScoreSnapshot[];
  /** Vertical bars behind the line/dots — see EnergyTrendChart's own showBars doc comment for the full history. Opt-in, defaults false. */
  showBars?: boolean;
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

export function RootScoreTrendChart({ snapshots, showBars = false }: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

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

        {points.map((p, i) => (
          <button
            key={p.snapshot.id}
            type="button"
            className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#1B3A2D] transition-transform hover:scale-125 focus-visible:scale-125 focus-visible:outline-none"
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
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
