/**
 * Progress page restructure ("Your Wellness Story") — real unit tests for
 * the pure logic behind the new section structure: the minimum-data floor
 * (fewer than 5 real points is not a trend) applied to both the unified
 * Trends card and the Root Score trend chart, and the Trends card's
 * wearable-segment-group visibility rule. The Consistency card's former
 * streak calculation (app/progress/streak.ts) was deleted in the
 * distribution-card task (2026-07-28) along with its dedicated tests here
 * — see app/progress/ConsistencyPanel.tsx's own doc comment. Not
 * component-rendering tests — SSR component tests
 * don't work in this repo (React Server Components can't be rendered by
 * vitest's node environment) — so this covers the same behavior the way
 * every other page in this app's test suite does: by testing the
 * extracted pure functions the components call.
 */
import { describe, it, expect } from 'vitest';
import { hasEnoughDataForTrend, type TrendPoint } from '@/app/progress/MetricTrendChart';
import {
  hasEnoughSnapshotsForTrend,
  countScoredSnapshots,
} from '@/app/progress/ProgressRootScorePanel';
import { MIN_SCORED_SNAPSHOTS_FOR_TREND } from '@/lib/scoring/rootScoreTrendConfig';
import { hasWearableData, dynamicBounds } from '@/app/progress/TrendsPanel';
import type { RootScoreSnapshot } from '@mef/shared-types-contracts';
import type { WearableDailyMetric } from '@mef/shared-types-contracts';

function point(localDate: string, value: number | null): TrendPoint {
  return { id: localDate, local_date: localDate, value };
}

function snapshot(localDate: string, root_score: number | null): RootScoreSnapshot {
  return {
    id: localDate,
    local_date: localDate,
    root_score,
    momentum_score: null,
    momentum_state: 'insufficient_data',
    resilience_score: null,
    resilience_state: 'building_baseline',
    explanation_summary: null,
  } as unknown as RootScoreSnapshot;
}

function wearableMetric(localDate: string, value: number): WearableDailyMetric {
  return {
    id: localDate,
    member_id: 'm',
    connection_id: 'c',
    provider: 'garmin',
    local_date: localDate,
    metric_domain: 'recovery',
    metric_code: 'readiness_score',
    numeric_value: value,
  } as unknown as WearableDailyMetric;
}

describe('minimum-data floor — Trends card (MetricTrendChart.hasEnoughDataForTrend)', () => {
  it('fewer than 5 real points is not a trend', () => {
    const points = [point('2026-01-01', 3), point('2026-01-02', 4), point('2026-01-03', 2)];
    expect(hasEnoughDataForTrend(points)).toBe(false);
  });

  it('exactly 5 real points clears the floor', () => {
    const points = [1, 2, 3, 4, 5].map((n) => point(`2026-01-0${n}`, n));
    expect(hasEnoughDataForTrend(points)).toBe(true);
  });

  it('null values (not logged that day) do not count toward the floor', () => {
    const points = [
      point('2026-01-01', 3),
      point('2026-01-02', null),
      point('2026-01-03', 4),
      point('2026-01-04', null),
      point('2026-01-05', 2),
      point('2026-01-06', null),
    ];
    expect(hasEnoughDataForTrend(points)).toBe(false); // only 3 real values
  });
});

describe('minimum-data floor — Root Score trend (ProgressRootScorePanel.hasEnoughSnapshotsForTrend)', () => {
  // The real threshold is MIN_SCORED_SNAPSHOTS_FOR_TREND, from
  // lib/scoring/rootScoreTrendConfig.ts — ProgressRootScorePanel's own
  // page-level gate on whether to show the Root Score trend chart card at
  // all (below it, the shared components/AnimatedRootScoreTrendChart.tsx
  // chart has its own separate, honest per-range empty/single-point
  // handling once it does render).
  it('a brand-new member with one calculation does not get a trend chart', () => {
    expect(hasEnoughSnapshotsForTrend([snapshot('2026-01-01', 62)])).toBe(false);
  });

  it('2 real calculations clears the floor', () => {
    const history = [1, 2].map((n) => snapshot(`2026-01-0${n}`, 60 + n));
    expect(hasEnoughSnapshotsForTrend(history)).toBe(true);
  });

  it('snapshots with a null root_score (no calculation that day) do not count', () => {
    const history = [
      snapshot('2026-01-01', 60),
      snapshot('2026-01-02', null),
      snapshot('2026-01-03', null),
    ];
    expect(hasEnoughSnapshotsForTrend(history)).toBe(false); // only 1 real score
  });
});

describe('Root Score card — progress-to-unlock state (ProgressRootScorePanel.countScoredSnapshots)', () => {
  it('the real threshold is imported, not a locally invented number', () => {
    expect(MIN_SCORED_SNAPSHOTS_FOR_TREND).toBe(2);
  });

  it('counts only real (non-null) calculations, same rule hasEnoughSnapshotsForTrend uses', () => {
    const history = [
      snapshot('2026-01-01', 55),
      snapshot('2026-01-02', null),
      snapshot('2026-01-03', 58),
    ];
    expect(countScoredSnapshots(history)).toBe(2);
  });

  it('zero real calculations is zero, not an error', () => {
    expect(countScoredSnapshots([])).toBe(0);
  });

  it('crossing the real threshold flips hasEnoughSnapshotsForTrend from false to true', () => {
    const below = [snapshot('2026-01-01', 55)];
    const atThreshold = [snapshot('2026-01-01', 55), snapshot('2026-01-02', 57)];
    expect(countScoredSnapshots(below)).toBeLessThan(MIN_SCORED_SNAPSHOTS_FOR_TREND);
    expect(hasEnoughSnapshotsForTrend(below)).toBe(false);
    expect(countScoredSnapshots(atThreshold)).toBe(MIN_SCORED_SNAPSHOTS_FOR_TREND);
    expect(hasEnoughSnapshotsForTrend(atThreshold)).toBe(true);
  });
});

describe('Trends card — wearable segment group visibility (TrendsPanel.hasWearableData)', () => {
  it('a member who has never connected a wearable gets no wearable segment group', () => {
    expect(hasWearableData([], [], [], [])).toBe(false);
  });

  it('any single wearable metric having data is enough to show the wearable group', () => {
    expect(hasWearableData([wearableMetric('2026-01-01', 82)], [], [], [])).toBe(true);
  });
});

describe('Trends card — dynamic chart bounds for wearable metrics (TrendsPanel.dynamicBounds)', () => {
  it('pads around the real min/max so the line never touches the chart edges', () => {
    const bounds = dynamicBounds([100, 200, 300]);
    expect(bounds.min).toBeLessThan(100);
    expect(bounds.max).toBeGreaterThan(300);
  });

  it('a single repeated value still produces a real, non-zero range', () => {
    const bounds = dynamicBounds([50, 50, 50]);
    expect(bounds.max).toBeGreaterThan(bounds.min);
  });

  it('no data at all falls back to a safe default range, not NaN', () => {
    const bounds = dynamicBounds([]);
    expect(Number.isFinite(bounds.min)).toBe(true);
    expect(Number.isFinite(bounds.max)).toBe(true);
    expect(bounds.max).toBeGreaterThan(bounds.min);
  });
});
