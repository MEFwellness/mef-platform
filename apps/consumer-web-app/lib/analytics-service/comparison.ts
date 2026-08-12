/**
 * The before/after comparison primitive.
 *
 * Given one member and a reference date, this returns the same behavioral
 * measurements for the window before that date and the window after it.
 * Two callers, one today and one later:
 *
 *   - The friction signals use it to answer "is this different from how she
 *     was", with a reference date chosen as the pivot of interest.
 *   - A future coaching layer will use it to answer "did the thing we did
 *     on this day change anything", by comparing the fortnight before an
 *     intervention with the fortnight after it.
 *
 * It is deterministic arithmetic and nothing else. It reports what changed.
 * It never says why, and it never says whether the change was good.
 *
 * THE REFERENCE DAY BELONGS TO NEITHER WINDOW. It is the pivot: the day the
 * thing being observed happened. Counting it in the "after" window would
 * mean an intervention's own day counts as its own result.
 *
 * ALWAYS CHECK afterWindowComplete. An after window that has not finished
 * elapsing yet contains fewer days of opportunity than the before window,
 * so it will look like a decline whether or not anything declined. The
 * primitive tells the caller rather than quietly returning the smaller
 * number.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { callAnalyticsRpc } from './client';
import type { MemberWindowComparison, WindowMetrics } from './types';

export const DEFAULT_COMPARISON_WINDOW_DAYS = 14;

export type WindowComparisonOptions = {
  windowDays?: number;
  includeTestAccounts?: boolean;
};

export async function getMemberWindowComparison(
  supabase: SupabaseClient,
  memberId: string,
  referenceDate: string,
  options?: WindowComparisonOptions
): Promise<MemberWindowComparison> {
  return callAnalyticsRpc<MemberWindowComparison>(
    supabase,
    'analytics_member_window_comparison',
    {
      p_member: memberId,
      p_reference_date: referenceDate,
      p_window_days: options?.windowDays ?? DEFAULT_COMPARISON_WINDOW_DAYS,
      p_include_test: options?.includeTestAccounts === true,
    }
  );
}

export type MetricDelta = {
  metric: string;
  before: number | null;
  after: number | null;
  /** after minus before. null when either side is null. */
  change: number | null;
  /** after divided by before. null when before is zero or either side is null, never Infinity. */
  changeRatio: number | null;
};

/**
 * The plain differences between the two windows, for a caller that wants
 * the deltas rather than the two raw sides. Pure, so a coaching layer can
 * use it on a comparison it already fetched.
 *
 * changeRatio is null rather than Infinity when the before window is zero.
 * "She went from nothing to something" is a real and useful observation;
 * expressing it as an infinite percentage increase is not.
 */
export function compareWindows(comparison: MemberWindowComparison): MetricDelta[] {
  const metrics: Array<[string, (w: WindowMetrics) => number | null]> = [
    ['activeDays', (w) => w.activeDays],
    ['activeDayRate', (w) => w.activeDayRate],
    ['signIns', (w) => w.signIns],
    ['dailyResetStarted', (w) => w.dailyResetStarted],
    ['dailyResetCompleted', (w) => w.dailyResetCompleted],
    ['dailyResetCompletionRate', (w) => w.dailyResetCompletionRate],
    ['totalEvents', (w) => w.totalEvents],
    ['averageDaysBetweenVisits', (w) => w.averageDaysBetweenVisits],
  ];

  return metrics.map(([metric, read]) => {
    const before = read(comparison.before);
    const after = read(comparison.after);
    const change = before !== null && after !== null ? round3(after - before) : null;
    const changeRatio =
      before !== null && after !== null && before !== 0 ? round3(after / before) : null;
    return { metric, before, after, change, changeRatio };
  });
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
