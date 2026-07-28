/**
 * Weekly-average trend chart (2026-07-28): the Progress page's Trends
 * section replaces its one-dot-per-day chart with one point per week —
 * real unit tests for the pure bucketing math (buildWeeklyBuckets) and
 * the chart-window direction sentence (chartWindowDirectionSentence,
 * 2026-07-28 follow-up — see directionSentence.ts's own doc comment for
 * why this no longer reuses the trend engine's month-over-month
 * comparison), plus static-source checks confirming the scope limit
 * held: MetricTrendChart.tsx (daily-dot) is untouched and still powers
 * wearable segments on this page, Home's Energy Trend card, and the
 * coach client view. No component-rendering harness exists in this repo
 * (plain 'node' vitest environment), same standing limitation every
 * other chart test file in this suite states.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildWeeklyBuckets,
  countQualifyingWeeks,
  hasEnoughForWeeklyChart,
  MIN_CHECKINS_PER_WEEK,
  MIN_QUALIFYING_WEEKS,
} from '../app/progress/WeeklyAverageTrendChart';
import type { TrendPoint } from '../app/progress/MetricTrendChart';
import { chartWindowDirectionSentence, STEADY_CHANGE_THRESHOLD } from '../app/progress/directionSentence';
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

/** One point per week, oldest first, from an array of weekly averages (each week gets exactly 3 identical daily values so it always qualifies). */
function weeklyPoints(weekAverages: number[]): TrendPoint[] {
  const pts: TrendPoint[] = [];
  const totalWeeks = weekAverages.length;
  weekAverages.forEach((value, weekIndex) => {
    const daysAgo = (totalWeeks - 1 - weekIndex) * 7;
    pts.push(...dailyPoints(daysAgo, 3, value));
  });
  return pts;
}

describe('chartWindowDirectionSentence', () => {
  it('the exact reported Pain case: month-over-month says worsening, but the plotted weeks (Mild-moderate -> Mild -> Mild-moderate -> None) are genuinely improving — the chart-window sentence must agree with the chart, not the month-over-month figure', () => {
    const points = weeklyPoints([2, 1, 2, 0]); // Mild-moderate, Mild, Mild-moderate, None
    const sentence = chartWindowDirectionSentence(points, 'pain', 'Pain');
    expect(sentence).not.toBeNull();
    expect(sentence).not.toMatch(/upward|downward/i);
    expect(sentence!.toLowerCase()).toContain('easing'); // first (2) -> last (0): less pain, described as improvement
  });

  it('fewer than 2 plotted weeks -> no sentence at all', () => {
    const onePlottedWeek = weeklyPoints([3]);
    expect(chartWindowDirectionSentence(onePlottedWeek, 'pain', 'Pain')).toBeNull();
    expect(chartWindowDirectionSentence([], 'pain', 'Pain')).toBeNull();
  });

  it('a thin-data week skipped at the START of the range is not treated as the first endpoint', () => {
    // Oldest week (days 21-23 ago): only 1 real check-in -> doesn't qualify, must not
    // be used as the "first" point. Two real, non-overlapping qualifying weeks follow
    // it, both averaging 1 -> if the thin week is correctly skipped, the real
    // endpoints (1 and 1) are identical -> steady. If it were wrongly used as the
    // first endpoint (value 5), this would instead describe a real decline (5 -> 1).
    const thinOldestWeek = dailyPoints(21, 1, 5); // one lone day, 21 days ago
    const realWeekA = dailyPoints(14, 3, 1); // days 14-16 ago
    const realWeekB = dailyPoints(7, 3, 1); // days 7-9 ago
    const points = [...thinOldestWeek, ...realWeekA, ...realWeekB];
    const sentence = chartWindowDirectionSentence(points, 'pain', 'Pain');
    expect(sentence).toContain('held steady');
  });

  it('a thin-data week skipped at the END of the range is not treated as the last endpoint', () => {
    // Newest week (today only): 1 real check-in -> doesn't qualify, must not be used
    // as the "last" point. Two real, non-overlapping qualifying weeks precede it,
    // both averaging 1 -> steady if the thin week is correctly excluded.
    const realWeekA = dailyPoints(14, 3, 1); // days 14-16 ago
    const realWeekB = dailyPoints(7, 3, 1); // days 7-9 ago
    const thinNewestWeek = dailyPoints(0, 1, 5); // one lone day, today
    const points = [...realWeekA, ...realWeekB, ...thinNewestWeek];
    const sentence = chartWindowDirectionSentence(points, 'pain', 'Pain');
    expect(sentence).toContain('held steady');
  });

  it(`a change smaller than the ${STEADY_CHANGE_THRESHOLD}-point steady threshold reads as holding steady, not a forced direction`, () => {
    const points = weeklyPoints([2, 2.2]); // delta 0.2, well under the 0.5 threshold
    const buckets = buildWeeklyBuckets(points);
    const sentence = chartWindowDirectionSentence(points, 'pain', 'Pain');
    expect(sentence).toBe(`Pain has held steady from ${buckets[0]!.rangeLabel} to ${buckets[1]!.rangeLabel}.`);
  });

  it('a change at or above the steady threshold is a real direction, not steady', () => {
    const points = weeklyPoints([2, 2.5]); // delta exactly 0.5
    const sentence = chartWindowDirectionSentence(points, 'pain', 'Pain');
    expect(sentence).not.toContain('held steady');
  });

  it('higher-is-better metric (Energy): an increase reads as improvement, never "upward"', () => {
    const points = weeklyPoints([2, 4]); // Low -> Good, a real rise
    const sentence = chartWindowDirectionSentence(points, 'energy', 'Energy');
    expect(sentence).not.toMatch(/upward|downward/i);
    expect(sentence!.toLowerCase()).toContain('increasing');
  });

  it('higher-is-worse metric (Stress): a rise reads as worsening ("increasing"), a fall reads as "easing"/"calmer" territory, never "upward"', () => {
    const worse = chartWindowDirectionSentence(weeklyPoints([1, 4]), 'stress', 'Stress');
    expect(worse).not.toMatch(/upward|downward/i);
    expect(worse!.toLowerCase()).toContain('increasing');

    const better = chartWindowDirectionSentence(weeklyPoints([4, 1]), 'stress', 'Stress');
    expect(better).not.toMatch(/upward|downward/i);
    expect(better!.toLowerCase()).toContain('easing');
  });

  it('names the window using the same week-range labels the chart itself uses', () => {
    const points = weeklyPoints([1, 3]);
    const buckets = buildWeeklyBuckets(points);
    const sentence = chartWindowDirectionSentence(points, 'energy', 'Energy');
    expect(sentence).toContain(buckets[0]!.rangeLabel);
    expect(sentence).toContain(buckets[buckets.length - 1]!.rangeLabel);
  });

  it('an unrecognized segment key (e.g. a wearable metric) returns null rather than throwing', () => {
    expect(chartWindowDirectionSentence(weeklyPoints([1, 3]), 'readiness', 'Readiness')).toBeNull();
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
