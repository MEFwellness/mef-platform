/**
 * Unit tests for lib/intelligence-engine/trends.ts — pure functions only,
 * no Supabase client, same style as tests/coaching-brain.test.ts. Confirms
 * `direction`/`confidence` are read straight from the Personal Wellness
 * Intelligence Engine's own classifyMetricTrend() (never re-derived), and
 * that the 7/14/30/90-day + since-baseline/since-reassessment `points`
 * array is computed correctly from real check-in data.
 */
import { describe, it, expect } from 'vitest';
import type { DailyCheckin } from '@mef/shared-types-contracts';
import { addDaysToLocalDate } from '../lib/feed/dateMath';
import { buildLongitudinalTrends } from '../lib/intelligence-engine/trends';
import type { ComparisonMetric } from '../lib/onboarding/comparison';

const AS_OF = '2026-06-30';

function checkin(overrides: Partial<DailyCheckin> = {}): DailyCheckin {
  return {
    id: overrides.id ?? 'c1',
    user_id: 'u1',
    timezone: 'America/New_York',
    local_date: '2026-01-01',
    recorded_at: '2026-01-01T08:00:00.000Z',
    checkin_version: 1,
    edited_at: null,
    sleep_observation_period_start: null,
    sleep_observation_period_end: null,
    created_at: '2026-01-01T08:00:00.000Z',
    mood_level: 4,
    sleep_quality: 4,
    sleep_duration: '7-8h',
    energy_level: 4,
    stress_level: 2, // good (score 75)
    water_cups: 8,
    digestion_rating: 4,
    pain_discomfort_level: 0,
    movement_today: 'full_session',
    new_or_worsening_concern: false,
    optional_notes: null,
    ...overrides,
  };
}

/** `count` consecutive days ending `daysAgoFromAsOf` days before AS_OF, oldest first. */
function daysWindow(daysAgoFromAsOf: number, count: number): string[] {
  const dates: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    dates.push(addDaysToLocalDate(AS_OF, -(daysAgoFromAsOf + i)));
  }
  return dates;
}

function comparisonRow(overrides: Partial<ComparisonMetric> = {}): ComparisonMetric {
  return {
    key: 'stress',
    label: 'Stress',
    trackedByAssessment: true,
    baseline: { status: 'poor', displayValue: '5' },
    latest: { status: 'good', displayValue: '2' },
    direction: 'improved',
    ...overrides,
  };
}

describe('buildLongitudinalTrends', () => {
  it('returns insufficient_data with zero-sample points when there is no check-in history', () => {
    const trends = buildLongitudinalTrends([], AS_OF, []);
    const stress = trends.find((t) => t.area === 'stress')!;

    expect(stress.direction).toBe('insufficient_data');
    expect(stress.confidence).toBe(0);
    expect(stress.trendState).toBeNull();
    for (const point of stress.points) {
      expect(point.sampleSize).toBe(0);
      expect(point.averageScore).toBeNull();
    }
  });

  it('reuses classifyMetricTrend for direction/confidence — a sustained stress increase reads as declining', () => {
    // previous 30 days: low stress (good). Last 30 days: high stress (poor).
    const goodDays = daysWindow(30, 30).map((local_date) =>
      checkin({ local_date, stress_level: 2 })
    );
    const poorDays = daysWindow(0, 30).map((local_date) =>
      checkin({ local_date, stress_level: 5 })
    );
    const checkinsOldestFirst = [...goodDays, ...poorDays];

    const trends = buildLongitudinalTrends(checkinsOldestFirst, AS_OF, []);
    const stress = trends.find((t) => t.area === 'stress')!;

    expect(stress.direction).toBe('declining');
    expect(stress.trendState).toBe('declining');
    expect(stress.confidence).toBeGreaterThan(0);
    expect(stress.evidenceRefs.length).toBeGreaterThan(0);

    const last30 = stress.points.find((p) => p.window === 'last_30_days')!;
    expect(last30.sampleSize).toBe(30);
    expect(last30.status).toBe('poor');

    const last90 = stress.points.find((p) => p.window === 'last_90_days')!;
    // last_90_days includes both the 30 good days and the 30 poor days.
    expect(last90.sampleSize).toBe(60);
  });

  it('produces a stable direction when there is no meaningful net change', () => {
    const days = daysWindow(0, 60).map((local_date) => checkin({ local_date, stress_level: 2 }));
    const trends = buildLongitudinalTrends(days, AS_OF, []);
    const stress = trends.find((t) => t.area === 'stress')!;

    expect(stress.direction).toBe('stable');
    expect(stress.trendState).toBe('stable');
  });

  it('sources since_baseline / since_reassessment points from the comparison metric, not from check-ins', () => {
    const comparison = [comparisonRow()];
    const trends = buildLongitudinalTrends([], AS_OF, comparison);
    const stress = trends.find((t) => t.area === 'stress')!;

    const sinceBaseline = stress.points.find((p) => p.window === 'since_baseline')!;
    const sinceReassessment = stress.points.find((p) => p.window === 'since_reassessment')!;

    expect(sinceBaseline.status).toBe('poor');
    expect(sinceBaseline.sampleSize).toBe(1);
    expect(sinceBaseline.averageScore).toBeNull(); // comparison is status-based, not a 0-100 score

    expect(sinceReassessment.status).toBe('good');
    expect(sinceReassessment.sampleSize).toBe(1);
  });

  it('covers every longitudinal metric area exactly once', () => {
    const trends = buildLongitudinalTrends([], AS_OF, []);
    const areas = trends.map((t) => t.area);
    expect(new Set(areas).size).toBe(areas.length);
    expect(areas.sort()).toEqual(
      ['sleep', 'stress', 'energy', 'mood', 'hydration', 'digestion', 'movement', 'pain'].sort()
    );
  });
});
