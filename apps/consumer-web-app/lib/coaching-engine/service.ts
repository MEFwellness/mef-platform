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
import type { DailyCheckin, MorningBrief, WellnessInsight } from '@mef/shared-types-contracts';
import { getCoachingFocusDecision } from '../brain/service';
import { currentStreakLength } from '../ai/agents/accountability';
import { listInsightsForMember } from '../intelligence/data';
import { listFeedHistory, getContentItemsByIds } from '../feed/data';
import { buildFeedMemory, type FeedHistoryPair } from '../feed/memory';
import { buildContinuitySentence } from '../feed/continuity';
import { daysBetweenLocalDates } from '../feed/dateMath';
import { RETURN_GREETING_TEXT } from '../return-greeting/copy';
import { isEligibleForReturnGreeting } from '../return-greeting/gate';
import { tryMarkReturnGreetingShown } from '../return-greeting/data';
import {
  fetchTenureCallbackContext,
  fetchDay3ContrastCallbackContext,
  fetchFindingCallbackContext,
} from '../memory-callback/data';
import { buildTenureCallback, buildDay3ContrastCallback, buildFindingCallback, pickMemoryCallback } from '../memory-callback/copy';
import { composeMorningBrief, recomposeCheckinLines } from './morningBrief';
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
  const contentById = await getContentItemsByIds(
    supabase,
    pastItems.map((item) => item.content_item_id)
  );
  const historyPairs: FeedHistoryPair[] = pastItems.map((feedItem) => ({
    feedItem,
    content: contentById.get(feedItem.content_item_id) ?? null,
  }));
  return buildContinuitySentence(buildFeedMemory(historyPairs, localDate));
}

/**
 * Root Presence System, requirement 5: non-null only when this is a real,
 * just-confirmed-new multi-day gap. `recentCheckins` is oldest-first and
 * already captures the member's true most-recent check-in regardless of
 * how long ago it was (listRecentCheckinsForMember takes the 30 most
 * recent rows by date, not a 30-calendar-day window), so its last element
 * is a real "last real check-in" date, not an artifact of a bounded
 * window. `tryMarkReturnGreetingShown` is the atomic, race-safe claim —
 * see its own doc comment for why this call, not a separate check, is
 * what decides whether the greeting is included.
 */
async function resolveReturnGreeting(
  supabase: SupabaseClient,
  memberId: string,
  recentCheckins: DailyCheckin[],
  localDate: string
): Promise<string | null> {
  const latest = recentCheckins[recentCheckins.length - 1] ?? null;
  if (!latest) return null;

  const daysSinceLastCheckin = daysBetweenLocalDates(latest.local_date, localDate);
  if (!isEligibleForReturnGreeting(daysSinceLastCheckin)) return null;

  const wonThisGap = await tryMarkReturnGreetingShown(supabase, memberId, latest.local_date);
  return wonThisGap ? RETURN_GREETING_TEXT : null;
}

/**
 * Home updates after a check-in instead of freezing at first open.
 *
 * `coach_morning_briefs` is a per-day cache, written once on the member's
 * first open of the day and never rewritten, which is normally before she
 * has checked in. So the two lines that speak about her latest check-in
 * stayed at "Yesterday you logged moderate stress" for the rest of the day,
 * even after she checked in. Home did not move.
 *
 * Read-time composition, not a rewrite. The alternative was an UPDATE or
 * DELETE policy on this table so the row could be regenerated; migration 53
 * grants a member insert and select only, and adding a write permission to
 * fix a display staleness is a larger change with a larger blast radius
 * than composing two sentences on the way out. See recomposeCheckinLines
 * for how narrow the substitution is.
 */
export async function getOrCreateTodaysMorningBrief(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string,
  firstName: string
): Promise<MorningBrief | null> {
  const existing = await getMorningBrief(supabase, memberId, localDate);
  if (existing) {
    // getCoachingFocusDecision is request-memoized (lib/brain/service.ts), and
    // every page that renders this brief already asks for the decision, so
    // this costs one shared computation rather than a second one.
    const [recentCheckins, decision] = await Promise.all([
      listRecentCheckinsForMember(supabase, memberId, localDate),
      getCoachingFocusDecision(supabase, memberId, localDate).catch(() => null),
    ]);
    return recomposeCheckinLines(
      existing,
      recentCheckins[recentCheckins.length - 1] ?? null,
      localDate,
      decision ? (decision.coachInsight ?? decision.reasonText) : null
    );
  }

  try {
    const [
      decision,
      recentCheckins,
      activeHabits,
      habitLogsToday,
      activeTrendInsights,
      continuitySentence,
      tenureContext,
      day3ContrastContext,
      findingContext,
    ] = await Promise.all([
      getCoachingFocusDecision(supabase, memberId, localDate),
      listRecentCheckinsForMember(supabase, memberId, localDate),
      listActiveHabitsForMember(supabase, memberId),
      getHabitLogsForDateForMember(supabase, memberId, localDate),
      fetchActiveTrendInsights(supabase, memberId),
      fetchContinuitySentence(supabase, memberId, localDate),
      fetchTenureCallbackContext(supabase, memberId, localDate),
      fetchDay3ContrastCallbackContext(supabase, memberId),
      fetchFindingCallbackContext(supabase, memberId, localDate),
    ]);

    // Sequential, not joined into the Promise.all above: this atomically
    // claims the return-greeting slot (a write), and only needs
    // recentCheckins, which the Promise.all above already resolved.
    const returnGreeting = await resolveReturnGreeting(supabase, memberId, recentCheckins, localDate);

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
      returnGreeting,
      // Dashboard Evolution (Prompt 5), requirement 7: wires the two
      // memory-callback types built and tested in Prompt 4 but never
      // spoken anywhere — a day-3 contrast and a resurfaced finding —
      // into this same, already-live slot alongside tenure, in priority
      // order (see pickMemoryCallback's own doc comment). Same
      // conservative gating as before: each builder still returns null
      // on its own whenever its real backing data doesn't exist.
      memoryCallback: pickMemoryCallback(
        buildDay3ContrastCallback(day3ContrastContext),
        buildFindingCallback(findingContext),
        buildTenureCallback(tenureContext)
      ),
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
