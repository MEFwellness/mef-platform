/**
 * Plain-English direction sentence for the Trends section's weekly-average
 * chart (WeeklyAverageTrendChart.tsx, untouched by this file).
 *
 * Chart-window fix (2026-07-28): this used to reuse
 * lib/intelligence/trendEngine.ts's classifyMetricTrend — a month-over-
 * month comparison (last 30 days vs. the previous 30) that isn't drawn on
 * the chart at all. That produced real, reported contradictions: on the
 * Pain tab, the sentence said "trending upward over the last month
 * compared to the month before" (worsening) while the four weeks actually
 * plotted ran Mild-moderate -> Mild -> Mild-moderate -> None (improving).
 * Both numbers were correct — they just measured different windows. This
 * file no longer touches the trend engine at all (per this task's own
 * instruction) — it computes strictly from buildWeeklyBuckets, the exact
 * same pure function WeeklyAverageTrendChart.tsx calls to draw the line,
 * applied to the exact same `points` prop, so the sentence can never
 * disagree with the chart beneath it. The month-over-month comparison
 * itself is untouched and still powers the insight cards higher up the
 * page (WellnessPatternsPanel / lib/intelligence/trendEngine.ts) — this is
 * a second, narrower calculation for the chart's own caption, not a
 * replacement for that one.
 *
 * Endpoints are the first and last ACTUAL plotted weeks (average !==
 * null) — a week skipped for thin data has no point on the chart, so it
 * is never treated as an endpoint either. Fewer than 2 plotted weeks:
 * null (no sentence), matching the chart's own "not enough weeks yet"
 * floor (MIN_QUALIFYING_WEEKS in WeeklyAverageTrendChart.tsx).
 *
 * Wording never says "upward"/"downward" — those read as good news
 * regardless of what actually moved, which is backwards for a metric
 * where higher is worse (Pain, Stress). Polarity comes from
 * lib/wellness/status.ts's TRENDS_METRIC_POLARITY (derived from the same
 * classifier functions the dashboard's own status colors already use —
 * not a second, hand-copied assumption).
 */

import { buildWeeklyBuckets, type WeekBucket } from './WeeklyAverageTrendChart';
import type { TrendPoint } from './MetricTrendChart';
import { TRENDS_METRIC_POLARITY, type MetricPolarity } from '@/lib/wellness/status';

type TrendsSegmentKey = keyof typeof TRENDS_METRIC_POLARITY;

/**
 * A change smaller than half a scale step, in either direction, reads as
 * "steady" rather than forcing a direction. Each whole level on these
 * scales spans exactly 1 point (e.g. Pain's None/Mild/Mild-moderate/...),
 * so a half-point move is the natural midpoint: anything smaller is
 * closer to "the same level" than to "the next one," and calling that a
 * real trend would overstate a difference the member's own week-to-week
 * labels wouldn't even show as different.
 */
export const STEADY_CHANGE_THRESHOLD = 0.5;

/**
 * Per-metric wording for "moved toward the better end of its scale" vs
 * "moved toward the worse end" — plain, specific language (never
 * upward/downward) rather than one generic template for every metric.
 */
const METRIC_DIRECTION_PHRASE: Record<TrendsSegmentKey, { better: string; worse: string }> = {
  energy: { better: 'increasing', worse: 'decreasing' },
  mood: { better: 'improving', worse: 'dipping' },
  stress: { better: 'easing', worse: 'increasing' },
  sleep_quality: { better: 'improving', worse: 'declining' },
  digestion: { better: 'improving', worse: 'declining' },
  pain: { better: 'easing', worse: 'increasing' },
};

function isTrendsSegmentKey(key: string): key is TrendsSegmentKey {
  return key in TRENDS_METRIC_POLARITY;
}

function describesImprovement(delta: number, polarity: MetricPolarity): boolean {
  return polarity === 'higher_is_better' ? delta > 0 : delta < 0;
}

/**
 * `points` is exactly the same `active.points` WeeklyAverageTrendChart
 * receives for this segment — same input, same buildWeeklyBuckets call,
 * so the same weeks with the same averages. Returns null (no sentence)
 * whenever fewer than 2 real weeks are plotted, or for a segment this
 * file doesn't have wording for (e.g. a wearable metric — this sentence
 * is check-in-metric only, matching the chart's own scope).
 */
export function chartWindowDirectionSentence(
  points: TrendPoint[],
  segmentKey: string,
  label: string
): string | null {
  if (!isTrendsSegmentKey(segmentKey)) return null;

  const buckets = buildWeeklyBuckets(points);
  const qualifying = buckets.filter(
    (b): b is WeekBucket & { average: number } => b.average !== null
  );
  if (qualifying.length < 2) return null;

  const first = qualifying[0]!;
  const last = qualifying[qualifying.length - 1]!;
  const delta = last.average - first.average;
  const windowPhrase = `from ${first.rangeLabel} to ${last.rangeLabel}`;

  if (Math.abs(delta) < STEADY_CHANGE_THRESHOLD) {
    return `${label} has held steady ${windowPhrase}.`;
  }

  const polarity = TRENDS_METRIC_POLARITY[segmentKey];
  const phrase = METRIC_DIRECTION_PHRASE[segmentKey];
  const word = describesImprovement(delta, polarity) ? phrase.better : phrase.worse;
  return `${label} has been ${word} ${windowPhrase}.`;
}
