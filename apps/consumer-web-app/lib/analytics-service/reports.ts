/**
 * Service groups A through D: overview, funnel, feature usage, drop-off.
 *
 * Each function is a thin, honest wrapper over one database function. The
 * arithmetic lives in SQL (migration 149) because it has to run over the
 * whole event table without loading it; the code here resolves the date
 * range, passes the test-account toggle, and adds the few derived numbers
 * that are genuinely per-report rather than per-row (a funnel stage's
 * percentage of the stage before it, for instance, which needs the whole
 * ordered stage list at once).
 *
 * DEFINITIONS, stated once and used everywhere.
 *
 * SESSION. One session means one active member-day: a calendar day on
 * which a member produced at least one meaningful behavioral event. It does
 * NOT mean one sign-in. session_started only fires on a completed sign-in,
 * and this app keeps a member signed in for weeks, so sign-ins undercount
 * real visits badly. Sign-ins are still reported, as signIns, never as
 * sessions.
 *
 * ACTIVE. A member is active on a day if she produced at least one
 * meaningful event that day, and active in a period if she was active on at
 * least one day in it. Meaningful excludes three things: account creation
 * (not usage), a membership tier change (written by a trigger, usually by
 * an administrator, not by her), and purchases (nothing emits them).
 *
 * RATES ARE NULL, NEVER ZERO, WHEN THERE IS NOTHING TO DIVIDE BY. A period
 * with no Daily Resets started reports a null completion rate, not zero
 * percent. Real member activity is currently very small and a fabricated
 * zero would be read as a failure that did not happen.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { callAnalyticsRpc } from './client';
import { resolveAnalyticsRange, todayUtc } from './range';
import type {
  AnalyticsOptions,
  DropOffReport,
  FeatureUsageReport,
  Funnel,
  FunnelStage,
  OverviewMetrics,
} from './types';

export const SESSION_DEFINITION =
  'One session means one active member-day: a calendar day on which the member did at least one thing in the app. It is not a sign-in count, because members stay signed in for weeks at a time.';

export const ACTIVE_DEFINITION =
  'A member counts as active on a day if she produced at least one behavioral event that day. Creating an account, a membership tier change written by a trigger, and purchases are not activity.';

/** Shared argument building, so no function can accidentally drop the test-account filter. */
function rangeParams(options: AnalyticsOptions | undefined) {
  const range = resolveAnalyticsRange(options?.period, options?.today ?? todayUtc());
  return {
    params: {
      p_start: range.start,
      p_end: range.end,
      p_include_test: options?.includeTestAccounts === true,
    },
    range,
  };
}

// ---------------------------------------------------------------------
// Group A
// ---------------------------------------------------------------------

export async function getOverviewMetrics(
  supabase: SupabaseClient,
  options?: AnalyticsOptions
): Promise<OverviewMetrics> {
  const { params } = rangeParams(options);
  return callAnalyticsRpc<OverviewMetrics>(supabase, 'analytics_overview', params);
}

// ---------------------------------------------------------------------
// Group B
// ---------------------------------------------------------------------

/**
 * Percentages are added here rather than in SQL because each one needs the
 * whole ordered stage list: "percent of the previous stage" has to skip
 * over any unmeasurable stage rather than divide by null and produce a
 * silent zero.
 */
export function addFunnelPercentages(cohortSize: number, stages: FunnelStage[]): FunnelStage[] {
  let previousMeasurable: FunnelStage | null = null;

  return stages.map((stage) => {
    if (!stage.measurable || stage.members === null) {
      return {
        ...stage,
        percentOfCohort: null,
        percentOfPreviousMeasurableStage: null,
        membersLostFromPreviousStage: null,
      };
    }

    const percentOfCohort =
      cohortSize > 0 ? round1((stage.members * 100) / cohortSize) : null;

    const previousMembers = previousMeasurable?.members ?? null;
    const percentOfPrevious =
      previousMembers !== null && previousMembers > 0
        ? round1((stage.members * 100) / previousMembers)
        : null;
    const lost =
      previousMembers !== null ? Math.max(previousMembers - stage.members, 0) : null;

    const enriched: FunnelStage = {
      ...stage,
      percentOfCohort,
      percentOfPreviousMeasurableStage: percentOfPrevious,
      membersLostFromPreviousStage: lost,
    };
    previousMeasurable = enriched;
    return enriched;
  });
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export async function getFunnel(
  supabase: SupabaseClient,
  options?: AnalyticsOptions
): Promise<Funnel> {
  const { params } = rangeParams(options);
  const raw = await callAnalyticsRpc<Funnel>(supabase, 'analytics_funnel', params);
  return { ...raw, stages: addFunnelPercentages(raw.cohortSize, raw.stages) };
}

// ---------------------------------------------------------------------
// Group C
// ---------------------------------------------------------------------

export async function getFeatureUsage(
  supabase: SupabaseClient,
  options?: AnalyticsOptions
): Promise<FeatureUsageReport> {
  const { params } = rangeParams(options);
  return callAnalyticsRpc<FeatureUsageReport>(supabase, 'analytics_feature_usage', params);
}

// ---------------------------------------------------------------------
// Group D
// ---------------------------------------------------------------------

export async function getDropOff(
  supabase: SupabaseClient,
  options?: AnalyticsOptions
): Promise<DropOffReport> {
  const { params } = rangeParams(options);
  return callAnalyticsRpc<DropOffReport>(supabase, 'analytics_drop_off', params);
}
