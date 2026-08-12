/**
 * The admin analytics dashboard's view state: which date range is being
 * looked at, and whether test accounts are included.
 *
 * Pure. No I/O, no Supabase client, no React. Every rule about what a URL
 * means is here so it can be tested without a database and so all four
 * views can never disagree about what "?range=30d&test=on" is asking for.
 *
 * THE RANGE IS RESOLVED BY THE SERVICE LAYER, NOT HERE. This module turns
 * search params into an AnalyticsPeriod and then hands that period to
 * resolveAnalyticsRange, the same function every analytics database call
 * uses. The dashboard therefore cannot label a card "last 30 days" while
 * the query underneath it ran over a different 30 days.
 *
 * The test-account toggle defaults to OFF and has to be asked for
 * explicitly, exactly as the service layer's includeTestAccounts does. A
 * URL with no test parameter is always the real-members-only view.
 */

import {
  daysBetweenInclusive,
  isCalendarDate,
  resolveAnalyticsRange,
  shiftCalendarDate,
  todayUtc,
} from '@/lib/analytics-service';
import type { AnalyticsPeriod } from '@/lib/analytics-service';

/** What an admin can choose between. Deliberately not the service layer's all_time: this dashboard always shows a bounded, comparable window. */
export type DashboardRangeKey = '7d' | '30d' | '90d' | 'custom';

export const DASHBOARD_RANGE_KEYS: DashboardRangeKey[] = ['7d', '30d', '90d', 'custom'];

export const DEFAULT_RANGE_KEY = '30d' as const;

export const RANGE_LABELS: Record<DashboardRangeKey, string> = {
  '7d': '7 days',
  '30d': '30 days',
  '90d': '90 days',
  custom: 'Custom',
};

const PRESET_PERIOD: Record<Exclude<DashboardRangeKey, 'custom'>, AnalyticsPeriod> = {
  '7d': { preset: 'last_7_days' },
  '30d': { preset: 'last_30_days' },
  '90d': { preset: 'last_90_days' },
};

/** The one shape the four views and every component read. */
export type DashboardView = {
  rangeKey: DashboardRangeKey;
  /** Handed straight to the service layer. Never re-derived downstream. */
  period: AnalyticsPeriod;
  start: string;
  end: string;
  days: number;
  includeTestAccounts: boolean;
  /**
   * Set when a custom range was asked for and could not be used, so the
   * screen can say so instead of silently showing the default 30 days and
   * letting an admin read the wrong window's numbers.
   */
  rangeNotice: string | null;
};

export type SearchParams = Record<string, string | string[] | undefined>;

function firstValue(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  if (Array.isArray(value)) return value[0];
  return value;
}

function isRangeKey(value: string | undefined): value is DashboardRangeKey {
  return value !== undefined && (DASHBOARD_RANGE_KEYS as string[]).includes(value);
}

/**
 * Turns the URL into a view.
 *
 * A custom range needs both ends and both have to be real calendar days. A
 * half-filled or unparseable one falls back to the default window and says
 * so, rather than throwing (an admin dashboard that will not render is a
 * worse answer than one that says which window it is actually showing).
 *
 * A custom end date in the future is pulled back to today: there are no
 * events after today, and a range that runs into next month would quietly
 * deflate every per-day average by dividing real activity across empty
 * calendar.
 */
export function parseDashboardView(
  searchParams: SearchParams | undefined,
  today: string = todayUtc()
): DashboardView {
  const params = searchParams ?? {};
  const requested = firstValue(params, 'range');
  const includeTestAccounts = firstValue(params, 'test') === 'on';
  const end = isCalendarDate(today) ? today : todayUtc();

  let rangeKey: DashboardRangeKey = isRangeKey(requested) ? requested : DEFAULT_RANGE_KEY;
  let rangeNotice: string | null = null;
  let period: AnalyticsPeriod;

  if (rangeKey === 'custom') {
    const from = firstValue(params, 'from');
    const to = firstValue(params, 'to');

    if (!isCalendarDate(from) || !isCalendarDate(to)) {
      rangeKey = DEFAULT_RANGE_KEY;
      period = PRESET_PERIOD[DEFAULT_RANGE_KEY];
      rangeNotice =
        'That custom range could not be read, so this is the last 30 days. A custom range needs a start date and an end date.';
    } else {
      const [rawStart, rawEnd] = from <= to ? [from, to] : [to, from];
      const cappedEnd = rawEnd > end ? end : rawEnd;
      if (rawEnd > end) {
        rangeNotice = `That range ended in the future, so it stops at today (${end}). Nothing has been recorded past today.`;
      }
      if (rawStart > cappedEnd) {
        rangeKey = DEFAULT_RANGE_KEY;
        period = PRESET_PERIOD[DEFAULT_RANGE_KEY];
        rangeNotice = `That range started after today (${end}), so this is the last 30 days instead.`;
      } else {
        period = { start: rawStart, end: cappedEnd };
      }
    }
  } else {
    period = PRESET_PERIOD[rangeKey];
  }

  const resolved = resolveAnalyticsRange(period, end);
  // A preset always resolves to a real start. all_time is not offered here.
  const start = resolved.start ?? resolved.end;

  return {
    rangeKey,
    period,
    start,
    end: resolved.end,
    days: daysBetweenInclusive(start, resolved.end),
    includeTestAccounts,
    rangeNotice,
  };
}

/**
 * The equally long window immediately before this one, for trend against
 * the previous equivalent period. It ends the day before the current range
 * starts, so the two windows never share a day and no activity is counted
 * on both sides of the comparison.
 */
export function previousPeriodOf(view: DashboardView): { start: string; end: string; days: number } {
  const end = shiftCalendarDate(view.start, -1);
  const start = shiftCalendarDate(end, -(view.days - 1));
  return { start, end, days: view.days };
}

/** The service layer options for the window being viewed. */
export function analyticsOptionsFor(view: DashboardView) {
  return { period: view.period, includeTestAccounts: view.includeTestAccounts };
}

/** The service layer options for the previous equivalent window. */
export function previousAnalyticsOptionsFor(view: DashboardView) {
  const previous = previousPeriodOf(view);
  return {
    period: { start: previous.start, end: previous.end },
    includeTestAccounts: view.includeTestAccounts,
  };
}

/**
 * A URL for the same view with something changed. Everything not being
 * changed is carried over, so flipping the test-account toggle never
 * silently resets the date range and vice versa.
 */
export function dashboardHref(
  pathname: string,
  view: DashboardView,
  overrides: Partial<{
    rangeKey: DashboardRangeKey;
    from: string;
    to: string;
    includeTestAccounts: boolean;
  }> = {}
): string {
  const rangeKey = overrides.rangeKey ?? view.rangeKey;
  const includeTestAccounts = overrides.includeTestAccounts ?? view.includeTestAccounts;
  const query = new URLSearchParams();

  query.set('range', rangeKey);
  if (rangeKey === 'custom') {
    query.set('from', overrides.from ?? view.start);
    query.set('to', overrides.to ?? view.end);
  }
  if (includeTestAccounts) query.set('test', 'on');

  return `${pathname}?${query.toString()}`;
}

/** Plain language for the window a number covers. No em dashes anywhere in this file's copy. */
export function rangeSummary(view: DashboardView): string {
  const label =
    view.rangeKey === 'custom' ? `${view.days} days` : `the last ${RANGE_LABELS[view.rangeKey]}`;
  return `${view.rangeKey === 'custom' ? label : label}, ${view.start} to ${view.end}`;
}

/** How a previous-period comparison is described next to a number. */
export function previousPeriodLabel(view: DashboardView): string {
  const previous = previousPeriodOf(view);
  return `the previous ${previous.days} days (${previous.start} to ${previous.end})`;
}
