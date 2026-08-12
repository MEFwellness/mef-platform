/**
 * Date range resolution for the analytics service layer. Pure, no I/O, so
 * every range rule is testable without a database.
 *
 * THE CALENDAR-DAY RULE. Every range here is a pair of local_date values,
 * never a pair of timestamps. local_date is the member's own calendar day,
 * computed at write time in her timezone. occurred_at is the member's wall
 * clock stamped as UTC and is correct only for ordering events relative to
 * each other, never for "which day was this". Filtering analytics by
 * occurred_at was a real bug once. Nothing in this layer does it.
 */

import type { AnalyticsPeriod, AnalyticsPeriodPreset, ResolvedRange } from './types';

/** Days each preset covers, counting today as day one. */
export const PRESET_DAYS: Record<Exclude<AnalyticsPeriodPreset, 'all_time'>, number> = {
  last_7_days: 7,
  last_30_days: 30,
  last_90_days: 90,
};

export const DEFAULT_PERIOD: AnalyticsPeriod = { preset: 'last_30_days' };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * The current UTC calendar day. Deliberately UTC rather than any member's
 * timezone: this is the administrator's "today", the outer bound of a
 * report, not a member's own day. Individual members' days are already
 * baked into local_date at write time.
 */
export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Shifts a calendar date by whole days. Pure UTC arithmetic, no timezone involved. */
export function shiftCalendarDate(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/** Inclusive day count between two calendar dates. */
export function daysBetweenInclusive(start: string, end: string): number {
  const from = new Date(`${start}T00:00:00.000Z`).getTime();
  const to = new Date(`${end}T00:00:00.000Z`).getTime();
  return Math.round((to - from) / 86_400_000) + 1;
}

/**
 * Turns a period into concrete bounds.
 *
 * "Last 7 days" means today and the six days before it, inclusive: seven
 * calendar days, ending today. Not "the previous seven days not counting
 * today", which would silently hide everything that happened this morning.
 *
 * all_time resolves start to null, which the database turns into the first
 * day anything was ever recorded. A hardcoded floor would make every
 * per-day average a fabricated number divided by decades of empty calendar.
 *
 * An explicit range whose start is after its end is corrected by swapping,
 * not rejected: an admin dragging a date picker backwards means the range
 * between the two dates, and returning an empty report instead would look
 * like an absence of data rather than a mistake.
 */
export function resolveAnalyticsRange(
  period: AnalyticsPeriod | undefined,
  today: string = todayUtc()
): ResolvedRange {
  const end = isCalendarDate(today) ? today : todayUtc();
  const chosen = period ?? DEFAULT_PERIOD;

  if ('preset' in chosen) {
    if (chosen.preset === 'all_time') {
      return { preset: 'all_time', start: null, end };
    }
    const days = PRESET_DAYS[chosen.preset];
    return { preset: chosen.preset, start: shiftCalendarDate(end, -(days - 1)), end };
  }

  if (!isCalendarDate(chosen.start) || !isCalendarDate(chosen.end)) {
    // An unparseable custom range falls back to the default rather than
    // throwing: an analytics screen showing the last 30 days is a better
    // outcome than an admin dashboard that will not render.
    return resolveAnalyticsRange(DEFAULT_PERIOD, end);
  }

  const [start, finish] =
    chosen.start <= chosen.end ? [chosen.start, chosen.end] : [chosen.end, chosen.start];
  return { preset: 'custom', start, end: finish };
}
