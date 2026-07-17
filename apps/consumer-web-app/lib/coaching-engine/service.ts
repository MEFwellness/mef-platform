/**
 * Orchestrates the Daily Morning Brief — idempotent per (member,
 * local_date), same "generate once, read forever after" pattern
 * lib/feed/service.ts's getOrCreateTodaysFeed already established for the
 * Daily Coaching Feed. Two callers use this identically:
 *  - on-demand, under the member's own session, the first time they open
 *    Dashboard or Today on a new local_date (app/actions/coaching-engine.ts)
 *  - app/api/cron/daily-coaching-scan's service-role client, which
 *    pre-warms every active member's brief once a day so it's already
 *    waiting rather than generated on their first tap
 * Both paths call this exact function so there is only ever one
 * generation path to keep correct.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MorningBrief, WellnessInsight } from '@mef/shared-types-contracts';
import { getCoachingFocusDecision } from '../brain/service';
import { currentStreakLength } from '../ai/agents/accountability';
import { listInsightsForMember } from '../intelligence/data';
import { listFeedHistory, getContentItem } from '../feed/data';
import { buildFeedMemory, type FeedHistoryPair } from '../feed/memory';
import { buildContinuitySentence } from '../feed/continuity';
import { composeMorningBrief } from './morningBrief';
import {
  getHabitLogsForDateForMember,
  getMorningBrief,
  insertMorningBrief,
  listActiveHabitsForMember,
  listRecentCheckinsForMember,
} from './data';

const FEED_HISTORY_WINDOW_DAYS = 14;

/** Same real trend data the coach dashboard and Conversation Coach already read (lib/intelligence/data.ts) — never re-derived, only filtered down to the 'trend' rows a Morning Brief can meaningfully reference. */
async function fetchActiveTrendInsights(
  supabase: SupabaseClient,
  memberId: string
): Promise<WellnessInsight[]> {
  const insights = await listInsightsForMember(supabase, memberId, {
    statusFilter: ['active', 'confirmed'],
  });
  return insights.filter((i) => i.insight_type === 'trend' && i.member_visible);
}

/** Same FeedMemory Today's "A Note from Root" already builds (lib/feed/continuity.ts's buildContinuitySentence) — reused, not re-derived, so a saved-but-not-completed lesson reads identically wherever it's mentioned. */
async function fetchContinuitySentence(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string
): Promise<string | null> {
  const feedHistory = await listFeedHistory(supabase, memberId, FEED_HISTORY_WINDOW_DAYS);
  const pastItems = feedHistory.filter((item) => item.local_date < localDate);
  const historyPairs: FeedHistoryPair[] = await Promise.all(
    pastItems.map(async (feedItem) => ({
      feedItem,
      content: await getContentItem(supabase, feedItem.content_item_id),
    }))
  );
  return buildContinuitySentence(buildFeedMemory(historyPairs, localDate));
}

export async function getOrCreateTodaysMorningBrief(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string,
  firstName: string
): Promise<MorningBrief | null> {
  const existing = await getMorningBrief(supabase, memberId, localDate);
  if (existing) return existing;

  try {
    const [
      decision,
      recentCheckins,
      activeHabits,
      habitLogsToday,
      activeTrendInsights,
      continuitySentence,
    ] = await Promise.all([
      getCoachingFocusDecision(supabase, memberId, localDate),
      listRecentCheckinsForMember(supabase, memberId, localDate),
      listActiveHabitsForMember(supabase, memberId),
      getHabitLogsForDateForMember(supabase, memberId, localDate),
      fetchActiveTrendInsights(supabase, memberId),
      fetchContinuitySentence(supabase, memberId, localDate),
    ]);

    const composed = composeMorningBrief({
      firstName,
      localDate,
      decision,
      recentCheckins,
      activeHabits,
      habitLogsToday,
      currentStreak: currentStreakLength(recentCheckins),
      activeTrendInsights,
      continuitySentence,
    });

    return await insertMorningBrief(supabase, memberId, localDate, composed);
  } catch (err) {
    // Best-effort, same discipline as recalculateIntelligenceCore /
    // updateNarrativeForEvent — a Morning Brief failing to generate must
    // never break the Dashboard/Today page render that asked for it.
    console.error('getOrCreateTodaysMorningBrief failed', err);
    return null;
  }
}
