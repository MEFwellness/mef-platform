/**
 * Date range resolution for the analytics service layer. Pure, no database.
 *
 * The rule these exist to protect: every analytics range is a pair of
 * local_date calendar days. The companion integration test proves the
 * database honours that; this file proves the code that produces the bounds
 * gets them right.
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PERIOD,
  PRESET_DAYS,
  daysBetweenInclusive,
  isCalendarDate,
  resolveAnalyticsRange,
  shiftCalendarDate,
  todayUtc,
} from '../lib/analytics-service/range';

const TODAY = '2026-06-30';

describe('resolveAnalyticsRange presets', () => {
  it('last 7 days means today and the six days before it, inclusive', () => {
    const range = resolveAnalyticsRange({ preset: 'last_7_days' }, TODAY);
    expect(range).toEqual({ preset: 'last_7_days', start: '2026-06-24', end: '2026-06-30' });
    expect(daysBetweenInclusive(range.start!, range.end)).toBe(7);
  });

  it('every preset covers exactly the number of days it claims', () => {
    for (const [preset, days] of Object.entries(PRESET_DAYS)) {
      const range = resolveAnalyticsRange(
        { preset: preset as 'last_7_days' | 'last_30_days' | 'last_90_days' },
        TODAY
      );
      expect(daysBetweenInclusive(range.start!, range.end), preset).toBe(days);
      expect(range.end, preset).toBe(TODAY);
    }
  });

  it('today is always inside the range, so this morning is never silently excluded', () => {
    for (const preset of ['last_7_days', 'last_30_days', 'last_90_days'] as const) {
      const range = resolveAnalyticsRange({ preset }, TODAY);
      expect(range.end).toBe(TODAY);
      expect(range.start! <= TODAY).toBe(true);
    }
  });

  it('all time resolves start to null so the database can use the first real event date', () => {
    const range = resolveAnalyticsRange({ preset: 'all_time' }, TODAY);
    expect(range).toEqual({ preset: 'all_time', start: null, end: TODAY });
  });

  it('defaults to the last 30 days when no period is given', () => {
    expect(resolveAnalyticsRange(undefined, TODAY)).toEqual(
      resolveAnalyticsRange(DEFAULT_PERIOD, TODAY)
    );
    expect(resolveAnalyticsRange(undefined, TODAY).preset).toBe('last_30_days');
  });

  it('crosses a month and a year boundary correctly', () => {
    expect(resolveAnalyticsRange({ preset: 'last_7_days' }, '2026-01-03').start).toBe('2025-12-28');
    expect(resolveAnalyticsRange({ preset: 'last_30_days' }, '2026-03-01').start).toBe(
      '2026-01-31'
    );
  });

  it('handles a leap day without drifting', () => {
    expect(shiftCalendarDate('2028-03-01', -1)).toBe('2028-02-29');
    expect(resolveAnalyticsRange({ preset: 'last_7_days' }, '2028-03-02').start).toBe('2028-02-25');
  });
});

describe('resolveAnalyticsRange explicit ranges', () => {
  it('passes an explicit range through unchanged', () => {
    const range = resolveAnalyticsRange({ start: '2026-01-01', end: '2026-01-31' }, TODAY);
    expect(range).toEqual({ preset: 'custom', start: '2026-01-01', end: '2026-01-31' });
  });

  it('a single day range is one day, not zero', () => {
    const range = resolveAnalyticsRange({ start: '2026-05-05', end: '2026-05-05' }, TODAY);
    expect(daysBetweenInclusive(range.start!, range.end)).toBe(1);
  });

  it('swaps a backwards range rather than returning an empty report that looks like no data', () => {
    const range = resolveAnalyticsRange({ start: '2026-02-10', end: '2026-01-10' }, TODAY);
    expect(range.start).toBe('2026-01-10');
    expect(range.end).toBe('2026-02-10');
  });

  it('falls back to the default rather than throwing on an unparseable range', () => {
    const range = resolveAnalyticsRange({ start: 'not-a-date', end: '2026-01-10' }, TODAY);
    expect(range.preset).toBe('last_30_days');
    expect(range.end).toBe(TODAY);
  });
});

describe('calendar date handling', () => {
  it('accepts only real calendar days', () => {
    expect(isCalendarDate('2026-06-30')).toBe(true);
    expect(isCalendarDate('2026-02-30')).toBe(false);
    expect(isCalendarDate('2026-13-01')).toBe(false);
    expect(isCalendarDate('2026-6-3')).toBe(false);
    expect(isCalendarDate('2026-06-30T00:00:00Z')).toBe(false);
    expect(isCalendarDate(20260630)).toBe(false);
    expect(isCalendarDate(null)).toBe(false);
  });

  it('todayUtc is the UTC calendar day, not the host timezone day', () => {
    // 23:30 UTC on the 30th is already the 1st in Sydney and still the 30th
    // in New York. The administrator's report boundary is UTC, so this is
    // the 30th regardless of where the process runs.
    expect(todayUtc(new Date('2026-06-30T23:30:00.000Z'))).toBe('2026-06-30');
    expect(todayUtc(new Date('2026-07-01T00:30:00.000Z'))).toBe('2026-07-01');
  });

  it('shifting by days is plain calendar arithmetic in both directions', () => {
    expect(shiftCalendarDate('2026-06-30', -30)).toBe('2026-05-31');
    expect(shiftCalendarDate('2026-06-30', 1)).toBe('2026-07-01');
    expect(shiftCalendarDate('2026-06-30', 0)).toBe('2026-06-30');
  });

  it('an unparseable today falls back to the real UTC day rather than producing NaN bounds', () => {
    const range = resolveAnalyticsRange({ preset: 'last_7_days' }, 'nonsense');
    expect(isCalendarDate(range.end)).toBe(true);
    expect(isCalendarDate(range.start!)).toBe(true);
  });
});
