/**
 * The detection layer: the single source of truth for every behavioral
 * condition this service can observe.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE. Where an agent-ready query
 * (lib/analytics-service/queries.ts) and a friction signal
 * (lib/analytics-service/friction.ts) detect the same condition, they both
 * call the SAME function here. There is exactly one implementation of
 * "started something and did not finish it", one of "has been away a long
 * time", one of "is doing less than she used to". Two implementations of
 * the same condition would eventually disagree, and an admin dashboard and
 * a coaching prompt disagreeing about whether a member has disengaged is
 * worse than either of them being wrong on its own.
 *
 * Everything here is a thin wrapper over one database function. The
 * aggregation is in SQL because it runs across every member and the whole
 * event history; nothing here counts rows in JavaScript.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { callAnalyticsRpc } from './client';
import { resolveAnalyticsRange, todayUtc } from './range';
import type {
  AnalyticsOptions,
  ConsistentUseDetection,
  FeatureChangeDetection,
  IncompleteFlowDetection,
  MemberEngagementFacts,
  MemberEngagement,
  PlatformFeatureTrendReport,
  ViewWithoutEngagementDetection,
} from './types';
import { toMemberEngagement } from './engagementState';

/** Default comparison window for the "recent versus her own baseline" detections. */
export const DEFAULT_CHANGE_WINDOW_DAYS = 14;

function baseParams(options: AnalyticsOptions | undefined) {
  const range = resolveAnalyticsRange(options?.period, options?.today ?? todayUtc());
  return { range, includeTest: options?.includeTestAccounts === true };
}

/**
 * DETECTION 1: absence, decline, and how much history exists.
 *
 * One call answers all three, because they are three readings of the same
 * measurements and splitting them would be the first step towards two
 * implementations. Consumed by: the engagement states (group E), the
 * disengaged / not-returned / reduced-usage agent queries (group F), and
 * the long-absence, activity-decline, returned-after-absence and
 * insufficient-history friction signals.
 *
 * Returns one row per in-scope member, including members with no activity
 * at all. A member who has never opened the app is a real and important
 * result, not a missing row.
 */
export async function getMemberEngagementFacts(
  supabase: SupabaseClient,
  options?: AnalyticsOptions & { memberId?: string }
): Promise<MemberEngagementFacts[]> {
  const { range, includeTest } = baseParams(options);
  return callAnalyticsRpc<MemberEngagementFacts[]>(
    supabase,
    'analytics_member_engagement_facts',
    { p_end: range.end, p_include_test: includeTest, p_member: options?.memberId ?? null }
  );
}

/** The same facts, with the documented engagement rules applied. Group E. */
export async function getMemberEngagementStates(
  supabase: SupabaseClient,
  options?: AnalyticsOptions & { memberId?: string }
): Promise<MemberEngagement[]> {
  const facts = await getMemberEngagementFacts(supabase, options);
  return facts.map(toMemberEngagement);
}

/**
 * DETECTION 2: started something and did not finish it.
 *
 * One row per member per flow that she started at least once inside the
 * range. Only flows that genuinely emit both a start and a completion
 * event appear; a flow whose events exist in the vocabulary but have no
 * call site is excluded here and reported as unmeasurable by the drop-off
 * report, never as a zero.
 *
 * Consumed by: the "started but did not finish" agent query, and the
 * repeated-incomplete-flow and onboarding-not-completed friction signals.
 */
export async function getIncompleteFlows(
  supabase: SupabaseClient,
  options?: AnalyticsOptions & { memberId?: string }
): Promise<IncompleteFlowDetection[]> {
  const { range, includeTest } = baseParams(options);
  return callAnalyticsRpc<IncompleteFlowDetection[]>(
    supabase,
    'analytics_detect_incomplete_flows',
    {
      p_start: range.start,
      p_end: range.end,
      p_include_test: includeTest,
      p_member: options?.memberId ?? null,
    }
  );
}

/**
 * DETECTION 3: one member's use of one feature, recently versus her own
 * earlier baseline. The baseline window is twice the recent window and sits
 * immediately before it, so a single quiet week inside a normal rhythm does
 * not read as a decline.
 *
 * Consumed by: the reduced-usage agent query and the feature-decline
 * friction signal.
 */
export async function getMemberFeatureChanges(
  supabase: SupabaseClient,
  options?: AnalyticsOptions & { memberId?: string; windowDays?: number }
): Promise<FeatureChangeDetection[]> {
  const { range, includeTest } = baseParams(options);
  return callAnalyticsRpc<FeatureChangeDetection[]>(
    supabase,
    'analytics_detect_feature_change',
    {
      p_end: range.end,
      p_window_days: options?.windowDays ?? DEFAULT_CHANGE_WINDOW_DAYS,
      p_include_test: includeTest,
      p_member: options?.memberId ?? null,
    }
  );
}

/**
 * DETECTION 4: the same question across everybody. Which features are being
 * used less than they were. Deliberately a separate function from detection
 * 3: "this member stopped using Food Lens" and "everyone stopped using Food
 * Lens" are different conditions with different consequences.
 */
export async function getPlatformFeatureTrend(
  supabase: SupabaseClient,
  options?: AnalyticsOptions & { windowDays?: number }
): Promise<PlatformFeatureTrendReport> {
  const { range, includeTest } = baseParams(options);
  return callAnalyticsRpc<PlatformFeatureTrendReport>(supabase, 'analytics_feature_trend', {
    p_end: range.end,
    p_window_days: options?.windowDays ?? DEFAULT_CHANGE_WINDOW_DAYS,
    p_include_test: includeTest,
  });
}

/**
 * DETECTION 5: opened it and never did anything in it. Only for the
 * features where opening and acting are genuinely separate events, which is
 * why the registry behind it is short. Inferring this for a screen that
 * emits only a view would be invention.
 */
export async function getViewsWithoutEngagement(
  supabase: SupabaseClient,
  options?: AnalyticsOptions & { memberId?: string }
): Promise<ViewWithoutEngagementDetection[]> {
  const { range, includeTest } = baseParams(options);
  return callAnalyticsRpc<ViewWithoutEngagementDetection[]>(
    supabase,
    'analytics_detect_view_without_engagement',
    {
      p_start: range.start,
      p_end: range.end,
      p_include_test: includeTest,
      p_member: options?.memberId ?? null,
    }
  );
}

/**
 * DETECTION 6: she keeps coming back to the same thing. The opposite of
 * friction, and worth detecting for the same reason: a coaching layer
 * should know what is already working before it suggests anything.
 */
export async function getConsistentFeatureUse(
  supabase: SupabaseClient,
  options?: AnalyticsOptions & { memberId?: string }
): Promise<ConsistentUseDetection[]> {
  const { range, includeTest } = baseParams(options);
  return callAnalyticsRpc<ConsistentUseDetection[]>(
    supabase,
    'analytics_detect_consistent_feature_use',
    {
      p_start: range.start,
      p_end: range.end,
      p_include_test: includeTest,
      p_member: options?.memberId ?? null,
    }
  );
}
