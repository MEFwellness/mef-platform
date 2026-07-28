'use client';

/**
 * Distribution card for the Trends section — added directly below the
 * existing per-metric line chart (app/progress/MetricTrendChart.tsx,
 * untouched). Answers a different question than the line chart: not
 * "how has this moved over time" but "what does a typical day look like
 * for her" — one horizontal bar per real level of whichever check-in
 * metric pill is currently active, counted across her last 30 recorded
 * days for that specific field.
 *
 * Scoped to check-in metrics only (Energy/Mood/Stress/Sleep Quality/
 * Digestion/Pain) — TrendsPanel.tsx renders this only when the active
 * segment's group is 'checkin'; a wearable metric (readiness/sleep
 * minutes/steps/wearable stress) is continuous, not a small fixed set of
 * levels, so "distribution across levels" doesn't apply the same way and
 * was never asked for here.
 *
 * Real scales, not assumed: energy/mood/stress/sleep_quality/digestion
 * are 1-5 and pain is 0-5, per daily_checkins' own Postgres CHECK
 * constraints (confirmed by reading the live schema, not guessed).
 * Level labels reuse lib/energy-forecast/scaleLabels.ts's word sets —
 * the same verbatim wording CheckinForm.tsx's sliders/tiles show her
 * (energyLevelLabel/moodLabel/stressLabel/sleepQualityLabel/painLabel) —
 * rather than inventing new copy that could drift from what she actually
 * answered. Digestion has no real word scale anywhere in the check-in UI
 * today (components/checkin/DriverProbeField.tsx renders it as a bare
 * numbered row with no SCALE_ANCHOR_LABELS entry) — so its level labels
 * here are the plain numbers she saw, not invented words.
 *
 * Below-threshold gating fix (2026-07-28 follow-up): this component used
 * to render its own dark-green "not enough data yet" message whenever
 * hasEnoughForDistribution(points) was false — which, whenever the
 * check-in segment also fell below MetricTrendChart's own separate
 * 5-point floor, stacked directly underneath that chart's own gray "not
 * enough data yet" box, showing two separate messages for one real fact.
 * That branch is gone. TrendsPanel.tsx now checks hasEnoughForDistribution
 * itself *before* ever rendering this component at all — below the
 * threshold, neither this component nor MetricTrendChart render; a single
 * combined message (styled like MetricTrendChart's own gray box) covers
 * both. This component can now assume its caller has already confirmed
 * enough real data exists.
 */

import { ScrollDrawIn } from '@/components/ScrollDrawIn';
import type { TrendPoint } from './MetricTrendChart';

export const MIN_DAYS_FOR_DISTRIBUTION = 7;

const CARD_BG = '#1B3A2D'; // the same forest green used for this page's one other dark card (CoachingInsightsPanel.tsx) — pulled, not reinvented
const CREAM = '#F5F0E4';
const GOLD = '#C4A050';

/** Lightest-to-darkest tints of the brand green, generated rather than hand-picked so any level count (5 for most metrics, 6 for pain) gets an evenly spaced ramp. Anchored well clear of CARD_BG at both ends so no tint reads as "invisible against the card" or "identical to the card itself." */
const TINT_LIGHT: [number, number, number] = [215, 231, 220];
const TINT_DARK: [number, number, number] = [58, 122, 92];

export function distributionTint(index: number, count: number): string {
  if (count <= 1) return `rgb(${TINT_DARK.join(',')})`;
  const t = index / (count - 1);
  const rgb = TINT_LIGHT.map((light, i) => Math.round(light + (TINT_DARK[i]! - light) * t));
  return `rgb(${rgb.join(',')})`;
}

export type DistributionLevel = {
  level: number;
  label: string;
  count: number;
  percent: number;
};

/** Every real (non-null) value for this metric among the points handed in — the "recorded days" this card's copy and threshold both refer to. */
export function recordedValues(points: TrendPoint[]): number[] {
  return points.filter((p): p is TrendPoint & { value: number } => p.value !== null).map((p) => p.value);
}

export function hasEnoughForDistribution(points: TrendPoint[]): boolean {
  return recordedValues(points).length >= MIN_DAYS_FOR_DISTRIBUTION;
}

/** One bucket per real level in [min, max], ordered by level (not by size) — real zero-count levels above the floor are honest, not fabricated; only the floor itself (checked separately) decides whether to draw bars at all. */
export function computeDistribution(
  points: TrendPoint[],
  min: number,
  max: number,
  levelLabel: (level: number) => string
): DistributionLevel[] {
  const values = recordedValues(points);
  const total = values.length;
  const levels: DistributionLevel[] = [];
  for (let level = min; level <= max; level++) {
    const count = values.filter((v) => v === level).length;
    levels.push({ level, label: levelLabel(level), count, percent: total > 0 ? (count / total) * 100 : 0 });
  }
  return levels;
}

/** The level she lands on most often — ties broken toward the lower level so exactly one bar is ever gold, deterministically. Returns null when every count is zero (shouldn't happen once the 7-day floor is cleared, but never crashes if it does). */
export function modalLevelIndex(levels: DistributionLevel[]): number | null {
  let bestIndex: number | null = null;
  let bestCount = 0;
  for (let i = 0; i < levels.length; i++) {
    if (levels[i]!.count > bestCount) {
      bestCount = levels[i]!.count;
      bestIndex = i;
    }
  }
  return bestIndex;
}

type Props = {
  points: TrendPoint[]; // oldest first, last 30 recorded check-ins for this metric's field
  min: number;
  max: number;
  levelLabel: (level: number) => string;
  metricLabel: string;
  /** Forces the sweep-in to replay when the active metric pill changes, same pattern components/TrendChartCard.tsx uses for its range pills. */
  resetKey: string;
};

/**
 * Assumes the caller (TrendsPanel.tsx) has already confirmed
 * hasEnoughForDistribution(points) is true — this component no longer
 * has its own below-threshold rendering branch, so it should never be
 * mounted with insufficient data. See this file's own doc comment for why.
 */
export function MetricDistributionCard({ points, min, max, levelLabel, metricLabel, resetKey }: Props) {
  const levels = computeDistribution(points, min, max, levelLabel);
  const modalIndex = modalLevelIndex(levels);

  return (
    <section className="mt-4 rounded-2xl p-5" style={{ backgroundColor: CARD_BG }}>
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: CREAM, opacity: 0.75 }}>
        {metricLabel}
      </p>
      <h3
        className="mt-1 font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-tight"
        style={{ color: CREAM }}
      >
        What a typical day looks like for you
      </h3>

      <ScrollDrawIn resetKey={resetKey}>
        <div className="mt-4 space-y-3">
          {levels.map((lvl, i) => {
            const fill = i === modalIndex ? GOLD : distributionTint(i, levels.length);
            return (
              <div key={lvl.level}>
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="font-medium" style={{ color: CREAM }}>
                    {lvl.label}
                  </span>
                  <span className="shrink-0" style={{ color: CREAM, opacity: 0.75 }}>
                    {lvl.count} day{lvl.count === 1 ? '' : 's'} · {Math.round(lvl.percent)}%
                  </span>
                </div>
                <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${lvl.percent}%`, backgroundColor: fill }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </ScrollDrawIn>
    </section>
  );
}
