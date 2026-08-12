/**
 * apps/consumer-web-app/app/actions/analyticsAdmin.ts
 *
 * The only application entry point into the Admin Analytics service layer.
 * Same shape as app/actions/resetPlanAdmin.ts and
 * app/actions/coreValuesSnapshotAdmin.ts: every function calls requireAdmin
 * first, using the same hasActiveRole check against the same
 * has_active_role database function the RLS policies themselves use.
 *
 * Authorization is enforced three times over, deliberately:
 *
 *   1. Here, by requireAdmin, which returns an error result rather than
 *      data for anyone who is not a platform administrator.
 *   2. Inside every analytics database function, by
 *      analytics_assert_admin(), which raises 42501. A bug in this file
 *      could not get past it.
 *   3. By row level security. The analytics functions are security invoker,
 *      so a member who somehow reached them would still only be able to see
 *      her own rows.
 *
 * There is no UI in this build. These exist so the admin dashboard (the
 * next build) and the future Engagement Agent have one authorized surface
 * to call rather than each opening their own database connection.
 *
 * Nothing here returns health content. The service layer physically cannot
 * read it: every query goes through product_analytics_events, which
 * excludes the health-content event types by construction.
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { hasActiveRole } from '@/lib/auth/guards';
import {
  findDisengagedMembers,
  findFeaturesWithUnusualUsageDrops,
  findMembersForCoachFollowUp,
  findMembersNotReturnedRecently,
  findMembersWithIncompleteFlows,
  findMembersWithReducedUsage,
  findWeakestFunnelStage,
  getDropOff,
  getFeatureUsage,
  getFunnel,
  getMemberEngagementStates,
  getMemberFrictionSignals,
  getMemberWindowComparison,
  getOverviewMetrics,
} from '@/lib/analytics-service';
import type {
  AnalyticsOptions,
  DropOffReport,
  FeatureChangeDetection,
  FeatureUsageReport,
  Funnel,
  IncompleteFlowDetection,
  MemberEngagement,
  MemberFollowUpCandidate,
  MemberFrictionReport,
  MemberWindowComparison,
  OverviewMetrics,
  PlatformFeatureTrend,
  WeakestFunnelStage,
} from '@/lib/analytics-service';

type SupabaseServerClient = ReturnType<typeof createClient>;

/** Every result is either the data or a stated reason there is none. A caller can always tell "denied" from "empty". */
export type AnalyticsActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function requireAdmin(): Promise<
  { ok: true; supabase: SupabaseServerClient } | { ok: false; error: string }
> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  const isAdmin = await hasActiveRole(supabase, user.id, 'platform_administrator');
  if (!isAdmin) return { ok: false, error: 'Admin access required.' };
  return { ok: true, supabase };
}

/** One wrapper so no action can forget the guard or leak a raw database error message to a caller. */
async function guarded<T>(
  label: string,
  run: (supabase: SupabaseServerClient) => Promise<T>
): Promise<AnalyticsActionResult<T>> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  try {
    return { ok: true, data: await run(guard.supabase) };
  } catch (error) {
    console.error(`${label} failed`, error);
    return { ok: false, error: 'That analytics query could not be completed.' };
  }
}

// ---------------------------------------------------------------------
// Groups A to D
// ---------------------------------------------------------------------

export async function getOverviewMetricsAction(
  options?: AnalyticsOptions
): Promise<AnalyticsActionResult<OverviewMetrics>> {
  return guarded('getOverviewMetricsAction', (supabase) => getOverviewMetrics(supabase, options));
}

export async function getFunnelAction(
  options?: AnalyticsOptions
): Promise<AnalyticsActionResult<Funnel>> {
  return guarded('getFunnelAction', (supabase) => getFunnel(supabase, options));
}

export async function getFeatureUsageAction(
  options?: AnalyticsOptions
): Promise<AnalyticsActionResult<FeatureUsageReport>> {
  return guarded('getFeatureUsageAction', (supabase) => getFeatureUsage(supabase, options));
}

export async function getDropOffAction(
  options?: AnalyticsOptions
): Promise<AnalyticsActionResult<DropOffReport>> {
  return guarded('getDropOffAction', (supabase) => getDropOff(supabase, options));
}

// ---------------------------------------------------------------------
// Group E
// ---------------------------------------------------------------------

export async function getEngagementStatesAction(
  options?: AnalyticsOptions
): Promise<AnalyticsActionResult<MemberEngagement[]>> {
  return guarded('getEngagementStatesAction', (supabase) =>
    getMemberEngagementStates(supabase, options)
  );
}

// ---------------------------------------------------------------------
// Group F
// ---------------------------------------------------------------------

export async function findDisengagedMembersAction(
  options?: AnalyticsOptions
): Promise<AnalyticsActionResult<MemberEngagement[]>> {
  return guarded('findDisengagedMembersAction', (supabase) =>
    findDisengagedMembers(supabase, options)
  );
}

export async function findMembersNotReturnedRecentlyAction(
  thresholdDays: number,
  options?: AnalyticsOptions
): Promise<AnalyticsActionResult<MemberEngagement[]>> {
  return guarded('findMembersNotReturnedRecentlyAction', (supabase) =>
    findMembersNotReturnedRecently(supabase, thresholdDays, options)
  );
}

export async function findMembersWithIncompleteFlowsAction(
  options?: AnalyticsOptions
): Promise<AnalyticsActionResult<IncompleteFlowDetection[]>> {
  return guarded('findMembersWithIncompleteFlowsAction', (supabase) =>
    findMembersWithIncompleteFlows(supabase, options)
  );
}

export async function findMembersWithReducedUsageAction(
  options?: AnalyticsOptions
): Promise<AnalyticsActionResult<MemberEngagement[]>> {
  return guarded('findMembersWithReducedUsageAction', (supabase) =>
    findMembersWithReducedUsage(supabase, options)
  );
}

export async function findFeaturesWithUnusualUsageDropsAction(
  options?: AnalyticsOptions & { windowDays?: number; dropThreshold?: number }
): Promise<AnalyticsActionResult<PlatformFeatureTrend[]>> {
  return guarded('findFeaturesWithUnusualUsageDropsAction', (supabase) =>
    findFeaturesWithUnusualUsageDrops(supabase, options)
  );
}

export async function findWeakestFunnelStageAction(
  options?: AnalyticsOptions
): Promise<AnalyticsActionResult<WeakestFunnelStage>> {
  return guarded('findWeakestFunnelStageAction', (supabase) =>
    findWeakestFunnelStage(supabase, options)
  );
}

export async function findMembersForCoachFollowUpAction(
  options?: AnalyticsOptions & { limit?: number }
): Promise<AnalyticsActionResult<MemberFollowUpCandidate[]>> {
  return guarded('findMembersForCoachFollowUpAction', (supabase) =>
    findMembersForCoachFollowUp(supabase, options)
  );
}

// ---------------------------------------------------------------------
// Friction signals and the before/after primitive
// ---------------------------------------------------------------------

export async function getMemberFrictionSignalsAction(
  memberId: string,
  options?: AnalyticsOptions
): Promise<AnalyticsActionResult<MemberFrictionReport>> {
  if (!memberId) return { ok: false, error: 'A member is required.' };
  return guarded('getMemberFrictionSignalsAction', (supabase) =>
    getMemberFrictionSignals(supabase, memberId, options)
  );
}

export async function getMemberWindowComparisonAction(
  memberId: string,
  referenceDate: string,
  options?: { windowDays?: number; includeTestAccounts?: boolean }
): Promise<AnalyticsActionResult<MemberWindowComparison>> {
  if (!memberId) return { ok: false, error: 'A member is required.' };
  if (!referenceDate) return { ok: false, error: 'A reference date is required.' };
  return guarded('getMemberWindowComparisonAction', (supabase) =>
    getMemberWindowComparison(supabase, memberId, referenceDate, options)
  );
}

/** Exported for the dashboard build: the per-feature decline list for one member. */
export type { FeatureChangeDetection };
