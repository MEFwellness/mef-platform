/**
 * Member Health Profile — the Intelligence Engine's I/O layer. The one
 * place that gathers real history from every subsystem this milestone
 * lists as an input (baseline, reassessments, check-ins, conversation
 * history and coaching decisions via the Brain, reflections and coach
 * notes via the Narrative/coach_notes tables, wellness intelligence,
 * daily coaching completion/streaks, and safety events). Every fetch here
 * reuses an existing, already-tested data source — lib/feed/data.ts,
 * lib/narrative/data.ts, lib/intelligence/data.ts, lib/brain/service.ts,
 * lib/onboarding/* — rather than a second, parallel query path, same
 * discipline lib/brain/service.ts and lib/intelligence/service.ts already
 * established.
 *
 * This function only reads. It never writes anything — "never overwrite
 * history" is satisfied by construction: nothing here mutates a prior
 * value, and the only persistence in this milestone
 * (intelligence_profile_snapshots) is a strictly-append log written by
 * data.ts, not by this module.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DailyCheckin } from '@mef/shared-types-contracts';
import { fetchBaselineAssessment } from '../onboarding/baseline';
import { fetchLatestReassessment } from '../onboarding/reassessment';
import { buildComparison, buildProgressSummary } from '../onboarding/comparison';
import { listNarrativeItems } from '../narrative/data';
import { listInsightsForMember } from '../intelligence/data';
import { getMemberRestrictedTopics, listFeedHistory, getContentItem } from '../feed/data';
import type { FeedHistoryPair } from '../feed/memory';
import { computeStreakInsight } from '../feed/streakIntelligence';
import { computeAdherence } from '../feed/adaptiveDifficulty';
import { getCoachingFocusDecision } from '../brain/service';
import { daysBetweenLocalDates } from '../feed/dateMath';
import { listRegistryEntriesForMember } from '../registry/data';
import type { MemberHealthProfile } from './types';

const HISTORY_WINDOW_DAYS = 95; // covers last_90_days with a small buffer, same window lib/intelligence/service.ts uses
const OPEN_REVIEW_STATUSES = ['new', 'reviewing', 'urgent_follow_up'];

async function fetchHistoryCheckins(
  supabase: SupabaseClient,
  memberId: string,
  asOfLocalDate: string
): Promise<DailyCheckin[]> {
  const { data, error } = await supabase
    .from('daily_checkins_current')
    .select('*')
    .eq('user_id', memberId)
    .lte('local_date', asOfLocalDate)
    .order('local_date', { ascending: false })
    .limit(HISTORY_WINDOW_DAYS);

  if (error) {
    console.error('fetchHistoryCheckins failed', error);
    return [];
  }
  return (data as DailyCheckin[]).reverse(); // oldest first
}

/**
 * Only ever non-zero when this profile is gathered under a coach or
 * platform_administrator session — safety_review_queue (migration 28) has
 * no member SELECT policy at all. A member-triggered recalculation
 * correctly sees 0 here (deny-by-default, not an error), same caveat the
 * type's own docblock explains.
 */
async function fetchOpenSafetyReviewCount(
  supabase: SupabaseClient,
  memberId: string
): Promise<number> {
  const { count, error } = await supabase
    .from('safety_review_queue')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', memberId)
    .in('status', OPEN_REVIEW_STATUSES);

  if (error) return 0; // RLS denying the read looks identical to "none" — both are handled the same way here
  return count ?? 0;
}

/** Same coach-only-visibility caveat — coach_notes (migration 23) is never member-readable by any RLS policy. */
async function fetchCoachNotesCount(supabase: SupabaseClient, memberId: string): Promise<number> {
  const { count, error } = await supabase
    .from('coach_notes')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', memberId);

  if (error) return 0;
  return count ?? 0;
}

function daysSinceLastAssessment(
  baseline: { localDate: string } | null,
  latestReassessment: { localDate: string } | null,
  asOfLocalDate: string
): number | null {
  const mostRecent = latestReassessment?.localDate ?? baseline?.localDate ?? null;
  if (!mostRecent) return null;
  return daysBetweenLocalDates(mostRecent, asOfLocalDate);
}

export async function gatherMemberHealthProfile(
  supabase: SupabaseClient,
  memberId: string,
  asOfLocalDate: string
): Promise<MemberHealthProfile> {
  const [
    checkinsOldestFirst,
    baseline,
    latestReassessment,
    narrativeItems,
    wellnessInsights,
    restrictedTopics,
    feedHistory,
    brainDecision,
    openSafetyReviewCount,
    coachNotesCount,
    registryEntries,
  ] = await Promise.all([
    fetchHistoryCheckins(supabase, memberId, asOfLocalDate),
    fetchBaselineAssessment(supabase, memberId),
    fetchLatestReassessment(supabase, memberId),
    listNarrativeItems(supabase, memberId, { statusFilter: ['active'] }),
    listInsightsForMember(supabase, memberId, { statusFilter: ['active', 'confirmed'] }),
    getMemberRestrictedTopics(supabase, memberId),
    listFeedHistory(supabase, memberId, 100),
    getCoachingFocusDecision(supabase, memberId, asOfLocalDate),
    fetchOpenSafetyReviewCount(supabase, memberId),
    fetchCoachNotesCount(supabase, memberId),
    listRegistryEntriesForMember(supabase, memberId, { statusFilter: ['active'] }),
  ]);

  const pastFeedItems = feedHistory.filter((item) => item.local_date < asOfLocalDate);
  const feedHistoryPairs: FeedHistoryPair[] = await Promise.all(
    pastFeedItems.map(async (feedItem) => ({
      feedItem,
      content: await getContentItem(supabase, feedItem.content_item_id),
    }))
  );

  const comparison = buildComparison(baseline, latestReassessment);
  const progressSummary = buildProgressSummary(comparison);

  return {
    memberId,
    localDate: asOfLocalDate,
    checkinsOldestFirst,
    baseline,
    latestReassessment,
    comparison,
    progressSummary,
    narrativeItems,
    wellnessInsights,
    feedHistoryPairs,
    brainDecision,
    streak: computeStreakInsight(checkinsOldestFirst, asOfLocalDate),
    adherence: computeAdherence(feedHistoryPairs, asOfLocalDate),
    restrictedTopics,
    openSafetyReviewCount,
    coachNotesCount,
    daysSinceLastReassessmentOrBaseline: daysSinceLastAssessment(
      baseline,
      latestReassessment,
      asOfLocalDate
    ),
    registryEntries,
  };
}
