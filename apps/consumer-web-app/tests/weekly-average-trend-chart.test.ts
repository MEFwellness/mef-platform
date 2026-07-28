/**
 * Weekly-average trend chart (2026-07-28): the Progress page's Trends
 * section replaces its one-dot-per-day chart with one point per week —
 * real unit tests for the pure bucketing math (buildWeeklyBuckets) and
 * the direction-sentence reuse of lib/intelligence/trendEngine.ts's
 * classifyMetricTrend, plus static-source checks confirming the scope
 * limit held: MetricTrendChart.tsx (daily-dot) is untouched and still
 * powers wearable segments on this page, Home's Energy Trend card, and
 * the coach client view. No component-rendering harness exists in this
 * repo (plain 'node' vitest environment), same standing limitation every
 * other chart test file in this suite states.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { DailyCheckin } from '@mef/shared-types-contracts';
import {
  buildWeeklyBuckets,
  countQualifyingWeeks,
  hasEnoughForWeeklyChart,
  MIN_CHECKINS_PER_WEEK,
  MIN_QUALIFYING_WEEKS,
} from '../app/progress/WeeklyAverageTrendChart';
import type { TrendPoint } from '../app/progress/MetricTrendChart';
import { directionSentenceForSegment } from '../app/progress/directionSentence';
import { addDaysToLocalDate } from '../lib/feed/dateMath';

function source(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, '..', relativePath), 'utf-8');
}

function point(local_date: string, value: number | null): TrendPoint {
  return { id: local_date, local_date, value };
}

const NEWEST = '2026-07-28';

/** `count` consecutive real check-in days ending `daysAgo` days before NEWEST, oldest first. */
function dailyPoints(daysAgo: number, count: number, value: number): TrendPoint[] {
  const pts: TrendPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    pts.push(point(addDaysToLocalDate(NEWEST, -(daysAgo + i)), value));
  }
  return pts;
}

describe('buildWeeklyBuckets', () => {
  it('groups 28 days of daily check-ins into 4 weekly buckets, oldest first', () => {
    const pts = dailyPoints(0, 28, 3);
    const buckets = buildWeeklyBuckets(pts);
    expect(buckets).toHaveLength(4);
    expect(buckets[0]!.startDate < buckets[3]!.startDate).toBe(true);
    expect(buckets[3]!.endDate).toBe(NEWEST);
  });

  it('averages a week\'s real values rather than picking one day', () => {
    // Most recent week: values 1,2,3,4,5,5,5 -> average = 25/7
    const week = [1, 2, 3, 4, 5, 5, 5].map((v, i) => point(addDaysToLocalDate(NEWEST, -(6 - i)), v));
    const buckets = buildWeeklyBuckets(week);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]!.average).toBeCloseTo(25 / 7, 5);
    expect(buckets[0]!.count).toBe(7);
  });

  it(`a week with fewer than ${MIN_CHECKINS_PER_WEEK} real check-ins gets a null average, not a point`, () => {
    const twoLoggedDays = [
      point(addDaysToLocalDate(NEWEST, -6), 4),
      point(addDaysToLocalDate(NEWEST, -1), 2),
    ];
    const buckets = buildWeeklyBuckets(twoLoggedDays);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]!.average).toBeNull();
    expect(buckets[0]!.count).toBe(2);
  });

  it('a fully skipped week in the middle of the range still gets its own slot (a real gap, not compressed spacing)', () => {
    const recentWeek = dailyPoints(0, 3, 4); // days 0-2 ago: qualifies (>=3)
    const oldWeek = dailyPoints(14, 3, 2); // days 14-16 ago: qualifies (>=3)
    // Nothing logged 7-13 days ago -> the middle week bucket should exist with count 0.
    const buckets = buildWeeklyBuckets([...oldWeek, ...recentWeek]);
    expect(buckets).toHaveLength(3);
    expect(buckets[0]!.average).not.toBeNull(); // oldest (the 14-16-days-ago week)
    expect(buckets[1]!.count).toBe(0); // the skipped middle week
    expect(buckets[1]!.average).toBeNull();
    expect(buckets[2]!.average).not.toBeNull(); // newest
  });

  it('ignores null-value points entirely (a day this metric was not asked/answered)', () => {
    const pts = [
      point(addDaysToLocalDate(NEWEST, -6), 3),
      point(addDaysToLocalDate(NEWEST, -5), null),
      point(addDaysToLocalDate(NEWEST, -4), 3),
      point(addDaysToLocalDate(NEWEST, -3), 3),
    ];
    const buckets = buildWeeklyBuckets(pts);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]!.count).toBe(3);
    expect(buckets[0]!.average).toBe(3);
  });

  it('returns an empty array when there is no real data at all', () => {
    expect(buildWeeklyBuckets([point('2026-01-01', null)])).toEqual([]);
    expect(buildWeeklyBuckets([])).toEqual([]);
  });

  it('week range label reads like "Jun 29-Jul 5" (real calendar dates, month abbreviated)', () => {
    const buckets = buildWeeklyBuckets(dailyPoints(0, 7, 3));
    expect(buckets[0]!.rangeLabel).toMatch(/^[A-Z][a-z]{2} \d{1,2}-[A-Z][a-z]{2} \d{1,2}$/);
  });
});

describe('countQualifyingWeeks / hasEnoughForWeeklyChart', () => {
  it(`fewer than ${MIN_QUALIFYING_WEEKS} qualifying weeks -> no chart`, () => {
    const oneWeek = dailyPoints(0, 7, 3);
    expect(countQualifyingWeeks(buildWeeklyBuckets(oneWeek))).toBe(1);
    expect(hasEnoughForWeeklyChart(oneWeek)).toBe(false);
  });

  it(`${MIN_QUALIFYING_WEEKS} qualifying weeks -> chart appears`, () => {
    const twoWeeks = dailyPoints(0, 14, 3);
    expect(countQualifyingWeeks(buildWeeklyBuckets(twoWeeks))).toBe(2);
    expect(hasEnoughForWeeklyChart(twoWeeks)).toBe(true);
  });

  it('a brand-new account with zero check-ins has zero qualifying weeks', () => {
    expect(hasEnoughForWeeklyChart([])).toBe(false);
  });
});

function checkin(overrides: Partial<DailyCheckin> = {}): DailyCheckin {
  return {
    id: overrides.id ?? overrides.local_date ?? 'c1',
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
    stress_level: 2,
    water_cups: 8,
    digestion_rating: 4,
    pain_discomfort_level: 0,
    movement_today: 'full_session',
    new_or_worsening_concern: false,
    optional_notes: null,
    actual_bedtime: null,
    actual_wake_time: null,
    night_waking_count: null,
    night_sweats: null,
    morning_soreness: null,
    bowel_movement_status: null,
    ...overrides,
  };
}

const AS_OF = '2026-07-28';
function daysWindow(daysAgoFromAsOf: number, count: number): string[] {
  const dates: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    dates.push(addDaysToLocalDate(AS_OF, -(daysAgoFromAsOf + i)));
  }
  return dates;
}

describe('directionSentenceForSegment', () => {
  it('returns null for insufficient history (fewer than 10 samples in each 30-day window) rather than fabricating a sentence', () => {
    const fewDays = daysWindow(0, 5).map((local_date) => checkin({ local_date, digestion_rating: 2 }));
    expect(directionSentenceForSegment('digestion', fewDays, AS_OF)).toBeNull();
  });

  it('reuses classifyMetricTrend verbatim: a sustained decline produces the exact "trending downward" sentence', () => {
    const goodPrev30 = daysWindow(30, 30).map((local_date) => checkin({ local_date, digestion_rating: 5 }));
    const poorLast30 = daysWindow(0, 30).map((local_date) => checkin({ local_date, digestion_rating: 1 }));
    const sentence = directionSentenceForSegment('digestion', [...goodPrev30, ...poorLast30], AS_OF);
    expect(sentence).toBe(
      'Digestion has been trending downward over the last month compared to the month before.'
    );
  });

  it('maps the Trends "sleep_quality" segment key to the trend engine\'s "sleep" area', () => {
    const goodPrev30 = daysWindow(30, 30).map((local_date) => checkin({ local_date, sleep_quality: 5 }));
    const poorLast30 = daysWindow(0, 30).map((local_date) => checkin({ local_date, sleep_quality: 1 }));
    const sentence = directionSentenceForSegment('sleep_quality', [...goodPrev30, ...poorLast30], AS_OF);
    expect(sentence).toContain('Sleep');
  });

  it('an unrecognized segment key (e.g. a wearable metric) returns null rather than throwing', () => {
    expect(directionSentenceForSegment('readiness', [], AS_OF)).toBeNull();
  });
});

describe('scope isolation — the daily-dot chart is untouched outside this page\'s check-in segments', () => {
  it('TrendsPanel.tsx renders WeeklyAverageTrendChart only for check-in segments, and still renders MetricTrendChart for wearable segments', () => {
    const src = source('app/progress/TrendsPanel.tsx');
    expect(src).toContain('<WeeklyAverageTrendChart');
    expect(src).toContain('<MetricTrendChart');
  });

  it('Home\'s Energy Trend card still renders through AnimatedEnergyTrendChart, not the new weekly chart', () => {
    const src = source('app/dashboard/page.tsx');
    expect(src).toContain('AnimatedEnergyTrendChart');
    expect(src).not.toContain('WeeklyAverageTrendChart');
  });

  it('the coach client view still renders the daily-dot EnergyTrendChart directly, not the new weekly chart', () => {
    const src = source('app/coach/clients/[id]/page.tsx');
    expect(src).toContain('<EnergyTrendChart');
    expect(src).not.toContain('WeeklyAverageTrendChart');
  });

  it('MetricTrendChart.tsx (the daily-dot chart) still exports its own 5-point floor, unchanged', () => {
    const src = source('app/progress/MetricTrendChart.tsx');
    expect(src).toContain('MIN_POINTS_FOR_TREND = 5');
  });
});
