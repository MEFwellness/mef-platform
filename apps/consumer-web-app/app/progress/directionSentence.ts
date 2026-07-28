/**
 * Plain-English direction sentence for the Trends section's weekly-average
 * chart. Reuses lib/intelligence/trendEngine.ts's classifyMetricTrend
 * directly — the exact same 30-vs-previous-30-day comparison that already
 * produces "Digestion has been trending downward over the last month
 * compared to the month before." for Wellness Patterns — rather than
 * writing a second trend detector. Read-only: this never persists
 * anything and never calls recalculateWellnessIntelligence, so it doesn't
 * touch wellness_insights/member_pattern_states or any write path of the
 * trend engine, only its pure classification function.
 *
 * classifyMetricTrend returns null whenever either the last-30-day or the
 * previous-30-day window has fewer than 10 real check-ins for that metric
 * (lib/intelligence/confidence.ts's MIN_SAMPLE_FOR_WINDOW) — in that case
 * this returns null too and no sentence renders, rather than fabricating
 * one. Once enough history exists, a sentence always renders (the engine
 * has a template for every trendState, including "stable"/"inconsistent"
 * for a metric with no strong direction) — but the specific "trending
 * downward/upward" wording only appears for the 'declining'/'improving'
 * states, which are themselves gated on a real threshold (a 10-point
 * change on the normalized 0-100 score). Weaker movement renders
 * "has been inconsistent" / "has stayed steady" instead.
 */

import type { DailyCheckin } from '@mef/shared-types-contracts';
import { classifyMetricTrend } from '@/lib/intelligence/trendEngine';
import type { WellnessMetricKey } from '@/lib/wellness/wellness-index';

/** Trends segment key -> the trend engine's own area key. Digestion and pain match by name; sleep_quality maps to the engine's broader 'sleep' area (the only sleep-related trend area it computes). */
const SEGMENT_TO_WELLNESS_AREA: Record<string, WellnessMetricKey> = {
  energy: 'energy',
  mood: 'mood',
  stress: 'stress',
  sleep_quality: 'sleep',
  digestion: 'digestion',
  pain: 'pain',
};

export function directionSentenceForSegment(
  segmentKey: string,
  checkinsOldestFirst: DailyCheckin[],
  asOfLocalDate: string
): string | null {
  const area = SEGMENT_TO_WELLNESS_AREA[segmentKey];
  if (!area) return null;
  const draft = classifyMetricTrend(checkinsOldestFirst, asOfLocalDate, area);
  return draft?.memberSummary ?? null;
}
