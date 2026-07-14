/**
 * Longitudinal Analysis (section: 7/14/30/90 days, since baseline, since
 * reassessment). Deliberately does NOT re-derive a second "is this
 * improving or declining" algorithm — `direction`/`confidence` for each
 * area come straight from lib/intelligence/trendEngine.ts's already-tested
 * classifyMetricTrend() (the exact same classification the Personal
 * Wellness Intelligence Engine persists), so this engine's read of "sleep
 * is declining" can never disagree with wellness_insights' own read. What
 * this module adds is purely the surrounding window-by-window average —
 * the 7/14/30/90-day and since-baseline/since-reassessment data points a
 * longitudinal report/chart needs — computed with the exact same
 * per-check-in scoring (computeMetricCandidates) every other metric
 * calculation in this app already shares.
 */

import type { DailyCheckin } from '@mef/shared-types-contracts';
import {
  computeMetricCandidates,
  inputsFromCheckin,
  scoreToStatus,
  type WellnessMetricKey,
} from '../wellness/wellness-index';
import { classifyMetricTrend } from '../intelligence/trendEngine';
import { windowRange, sliceByLocalDate, type FixedWindow } from '../intelligence/windows';
import { average } from '../intelligence/confidence';
import type { ComparisonMetric } from '../onboarding/comparison';
import {
  LONGITUDINAL_METRIC_AREAS,
  type LongitudinalDirection,
  type LongitudinalTrend,
  type LongitudinalTrendPoint,
  type LongitudinalWindowKey,
} from './types';
import type { WellnessTrendState } from '@mef/shared-types-contracts';

const FIXED_WINDOWS: { key: LongitudinalWindowKey; window: FixedWindow }[] = [
  { key: 'last_7_days', window: 'last_7_days' },
  { key: 'last_14_days', window: 'last_14_days' },
  { key: 'last_30_days', window: 'last_30_days' },
  { key: 'last_90_days', window: 'last_90_days' },
];

const DIRECTION_BY_TREND_STATE: Record<WellnessTrendState, LongitudinalDirection> = {
  improving: 'improving',
  resolved_or_inactive: 'improving',
  declining: 'declining',
  recurring_pattern: 'declining',
  newly_emerging: 'declining',
  stable: 'stable',
  inconsistent: 'stable',
  insufficient_data: 'insufficient_data',
};

function scoreForCheckin(c: DailyCheckin, area: WellnessMetricKey): number | null {
  return computeMetricCandidates(inputsFromCheckin(c)).find((m) => m.key === area)?.score ?? null;
}

function windowPoint(
  checkinsOldestFirst: DailyCheckin[],
  asOfLocalDate: string,
  area: WellnessMetricKey,
  key: LongitudinalWindowKey,
  window: FixedWindow
): LongitudinalTrendPoint {
  const range = windowRange(asOfLocalDate, window);
  const scores = sliceByLocalDate(checkinsOldestFirst, range)
    .map((c) => scoreForCheckin(c, area))
    .filter((v): v is number => v !== null);
  const avg = average(scores);

  return {
    window: key,
    averageScore: avg !== null ? Math.round(avg) : null,
    sampleSize: scores.length,
    status: avg !== null ? scoreToStatus(avg) : null,
  };
}

function assessmentPoints(
  comparisonRow: ComparisonMetric | undefined
): [LongitudinalTrendPoint, LongitudinalTrendPoint] {
  return [
    {
      window: 'since_baseline',
      averageScore: null,
      sampleSize: comparisonRow?.baseline ? 1 : 0,
      status: comparisonRow?.baseline?.status ?? null,
    },
    {
      window: 'since_reassessment',
      averageScore: null,
      sampleSize: comparisonRow?.latest ? 1 : 0,
      status: comparisonRow?.latest?.status ?? null,
    },
  ];
}

export function buildLongitudinalTrends(
  checkinsOldestFirst: DailyCheckin[],
  asOfLocalDate: string,
  comparison: ComparisonMetric[]
): LongitudinalTrend[] {
  return LONGITUDINAL_METRIC_AREAS.map((area) => {
    const classification = classifyMetricTrend(checkinsOldestFirst, asOfLocalDate, area);
    const comparisonRow = comparison.find((m) => m.key === area);

    const fixedPoints = FIXED_WINDOWS.map(({ key, window }) =>
      windowPoint(checkinsOldestFirst, asOfLocalDate, area, key, window)
    );

    return {
      area,
      direction: classification
        ? DIRECTION_BY_TREND_STATE[classification.trendState!]
        : 'insufficient_data',
      confidence: classification?.confidence ?? 0,
      points: [...fixedPoints, ...assessmentPoints(comparisonRow)],
      evidenceRefs: classification?.evidenceRefs ?? [],
      trendState: classification?.trendState ?? null,
      trendStrength: classification?.trendStrength ?? null,
    };
  });
}
