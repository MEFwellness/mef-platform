/**
 * The Coaching Brain's I/O layer — the one place that gathers real
 * signals from the database and calls the pure decision.ts orchestrator.
 * Every fetch here reuses an existing, already-tested data source (the
 * same tables/RPCs lib/feed/service.ts, lib/narrative/service.ts, and
 * app/actions/checkin.ts already read) rather than a second, parallel
 * query path. `getCoachingFocusDecision` is the one function every
 * consumer — the Daily page, the Coach Dashboard, a future notification
 * job, a future AI agent, a future report, a future chat surface — should
 * call instead of deciding coaching independently.
 *
 * Uses the SAME session-scoped SupabaseClient the caller already has;
 * RLS is what actually authorizes each read, exactly like every other
 * read path in this app (a coach calling this for a client they aren't
 * assigned to simply gets back empty/null signals, same as
 * lib/feed/service.ts's own callers).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DailyCheckin, NarrativeItem } from '@mef/shared-types-contracts';
import { calculateWellnessIndex, inputsFromCheckin } from '../wellness/wellness-index';
import { detectInsights } from '../wellness/insights';
import { computeAdherence } from '../feed/adaptiveDifficulty';
import { computeStreakInsight } from '../feed/streakIntelligence';
import {
  buildFeedMemory,
  pickRecentWin,
  type FeedHistoryPair,
  type FeedMemory,
} from '../feed/memory';
import { buildCoachInsight } from '../feed/continuity';
import { dayOfWeekFromLocalDate } from '../feed/timeContext';
import { daysBetweenLocalDates } from '../feed/dateMath';
import { listFeedHistory, getContentItem, getMemberRestrictedTopics } from '../feed/data';
import { listNarrativeItems } from '../narrative/data';
import { listInsightsForMember } from '../intelligence/data';
import { WELLNESS_METRIC_AREAS } from '../intelligence/types';
import { matchMetricInText } from './priorityEngine';
import { buildCoachingDecision } from './decision';
import { listRegistryEntriesForMember } from '../registry/data';
import { buildWearableSnapshot } from '../wearables/snapshot';
import type { CoachingFocusDecision, CoachingSignals } from './types';
import type { WellnessMetricKey } from '../wellness/wellness-index';

const RECENT_CHECKIN_WINDOW_DAYS = 30;

/** Milestone 6's Personal Wellness Intelligence Engine informs the Brain, but a stale confirmed pattern must never keep steering today's coaching indefinitely — 21 days (three weeks) is this module's own freshness cutoff. */
const CONFIRMED_CONCERN_STALE_AFTER_DAYS = 21;
const SEVERITY_RANK: Record<string, number> = { important: 2, notable: 1, info: 0 };
const LONG_TERM_CONCERN_STATES = new Set(['declining', 'recurring_pattern']);

async function fetchConfirmedLongTermConcern(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string
): Promise<WellnessMetricKey | null> {
  const insights = await listInsightsForMember(supabase, memberId, {
    statusFilter: ['active', 'confirmed'],
  });

  const candidates = insights.filter(
    (i) =>
      i.insight_type === 'trend' &&
      i.trend_state !== null &&
      LONG_TERM_CONCERN_STATES.has(i.trend_state) &&
      i.wellness_area !== null &&
      (WELLNESS_METRIC_AREAS as string[]).includes(i.wellness_area) &&
      daysBetweenLocalDates(i.updated_at.slice(0, 10), localDate) <=
        CONFIRMED_CONCERN_STALE_AFTER_DAYS
  );
  if (candidates.length === 0) return null;

  const best = candidates.sort(
    (a, b) => SEVERITY_RANK[b.severity]! - SEVERITY_RANK[a.severity]! || b.confidence - a.confidence
  )[0]!;
  return best.wellness_area as WellnessMetricKey;
}

async function fetchRecentCheckins(
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
    .limit(RECENT_CHECKIN_WINDOW_DAYS);

  if (error) {
    console.error('fetchRecentCheckins failed', error);
    return [];
  }
  return (data as DailyCheckin[]).reverse(); // oldest first
}

type CoachingContext = {
  signals: CoachingSignals;
  feedMemory: FeedMemory;
  memberVisibleNarrative: NarrativeItem[];
};

/** One fetch of every real signal the Brain (and its coachInsight, which needs the raw Member Coaching Memory alongside it) reads — never fetched twice for the same decision. */
async function assembleContext(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string
): Promise<CoachingContext> {
  const [
    checkinsOldestFirst,
    feedHistory,
    narrativeItems,
    restrictedTopics,
    confirmedLongTermConcern,
    registryEntries,
  ] = await Promise.all([
    fetchRecentCheckins(supabase, memberId, localDate),
    listFeedHistory(supabase, memberId, RECENT_CHECKIN_WINDOW_DAYS),
    listNarrativeItems(supabase, memberId, { statusFilter: ['active'] }),
    getMemberRestrictedTopics(supabase, memberId),
    fetchConfirmedLongTermConcern(supabase, memberId, localDate),
    listRegistryEntriesForMember(supabase, memberId, { statusFilter: ['active'] }),
  ]);

  const pastFeedItems = feedHistory.filter((item) => item.local_date < localDate);
  const historyPairs: FeedHistoryPair[] = await Promise.all(
    pastFeedItems.map(async (feedItem) => ({
      feedItem,
      content: await getContentItem(supabase, feedItem.content_item_id),
    }))
  );

  const latestCheckin = checkinsOldestFirst[checkinsOldestFirst.length - 1] ?? null;
  const todaysCheckin = latestCheckin?.local_date === localDate ? latestCheckin : null;

  const feedMemory = buildFeedMemory(historyPairs, localDate);
  const memberVisibleNarrative = narrativeItems.filter((item) => item.member_visible);
  const unresolvedConcern = memberVisibleNarrative.find(
    (item) => item.category === 'unresolved_concerns'
  );

  const signals: CoachingSignals = {
    localDate,
    dayOfWeek: dayOfWeekFromLocalDate(localDate),
    wellnessIndex: calculateWellnessIndex(inputsFromCheckin(latestCheckin)),
    insights: detectInsights(checkinsOldestFirst),
    adherence: computeAdherence(historyPairs, localDate),
    streak: computeStreakInsight(checkinsOldestFirst, localDate),
    hasSavedCarryover: feedMemory.savedNotCompleted.length > 0,
    hasActiveSafetyConcern:
      restrictedTopics.length > 0 || todaysCheckin?.new_or_worsening_concern === true,
    unresolvedAssessmentFocus: unresolvedConcern
      ? matchMetricInText(`${unresolvedConcern.title} ${unresolvedConcern.summary}`)
      : null,
    recentWin: pickRecentWin(memberVisibleNarrative),
    confirmedLongTermConcern,
    wearableSnapshot: buildWearableSnapshot(registryEntries),
  };

  return { signals, feedMemory, memberVisibleNarrative };
}

/**
 * Just the real signals, for a caller that only needs the Brain's chosen
 * focus/mode and not the full Daily Decision Object — used by
 * lib/feed/service.ts to ask the Brain for today's priority metric
 * instead of computing a Daily Wellness Index priority independently.
 */
export async function gatherCoachingSignals(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string
): Promise<CoachingSignals> {
  return (await assembleContext(supabase, memberId, localDate)).signals;
}

/**
 * The Brain's full entry point: real signals in, one structured Daily
 * Decision Object out. `coachInsight` is attached here (rather than in
 * decision.ts) because it needs the raw Member Coaching Memory shape,
 * which is an I/O-layer concern — decision.ts stays a pure function of
 * CoachingSignals alone.
 */
export async function getCoachingFocusDecision(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string
): Promise<CoachingFocusDecision> {
  const { signals, feedMemory, memberVisibleNarrative } = await assembleContext(
    supabase,
    memberId,
    localDate
  );
  const decision = buildCoachingDecision(signals);

  const coachInsight = buildCoachInsight({
    memory: feedMemory,
    wellnessInsights: signals.insights,
    narrativeItems: memberVisibleNarrative,
  });

  return { ...decision, coachInsight };
}
