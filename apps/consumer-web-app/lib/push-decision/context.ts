/**
 * The Priority Card's inputs, for a member who is not signed in.
 *
 * WHY THIS EXISTS. buildPriorityView takes a PriorityContext because its
 * callers are page renders that already hold those four facts and must
 * not pay for them twice. The notification job holds nothing: it runs on a
 * schedule, under the service role, for a member who may be asleep. So it
 * has to gather the same four facts, and the ONE thing it must not do is
 * decide any of them differently from the way the card decides them.
 *
 * So every fact below comes from the same source the signed-in path uses,
 * reached through a member-scoped accessor rather than a session-scoped
 * one:
 *
 *   recentCheckins    daily_checkins_current, thirty rows, OLDEST FIRST,
 *                     which is getRecentCheckins' own contract and is
 *                     load-bearing (buildPriorityView takes the LAST
 *                     element as the latest check-in).
 *   todaysFocus       lib/brain/composition.ts's getFullCoachingDecision,
 *                     the exact function app/actions/coaching-brain.ts's
 *                     getMyCoachingDecision now calls, mapped through
 *                     lib/priority/service.ts's own toTodaysFocusInput so
 *                     the shape can never drift.
 *   checkinDoneToday  the same one-row lookup app/actions/checkin.ts's
 *                     getTodaysCheckin performs.
 *   totalCheckins     lib/member-counts/checkinCounts.ts, which is where
 *                     the Today page, Root's tenure line and Case View all
 *                     get theirs.
 *
 * NOTHING HERE IS A SECOND OPINION ABOUT ANYTHING. It is the same reads,
 * addressed by member id instead of by cookie.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DailyCheckin } from '@mef/shared-types-contracts';
import { getFullCoachingDecision } from '../brain/composition';
import { getLoggedDayTotals } from '../member-counts/checkinCounts';
import { toTodaysFocusInput, type PriorityContext } from '../priority/service';

/** Her last N check-ins, OLDEST FIRST. Same shape and same order as getRecentCheckins. */
export async function readRecentCheckinsForMember(
  supabase: SupabaseClient,
  memberId: string,
  days: number
): Promise<DailyCheckin[]> {
  const { data, error } = await supabase
    .from('daily_checkins_current')
    .select('*')
    .eq('user_id', memberId)
    .order('local_date', { ascending: false })
    .limit(days);

  if (error || !data) {
    if (error) console.error('readRecentCheckinsForMember failed', error);
    return [];
  }
  return (data as DailyCheckin[]).reverse();
}

/** Whether today's Daily Reset already exists. The single fact the safety recheck turns on. */
export async function readCheckinDoneToday(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('daily_checkins_current')
    .select('id')
    .eq('user_id', memberId)
    .eq('local_date', localDate)
    .maybeSingle();

  if (error) {
    console.error('readCheckinDoneToday failed', error);
    // Fail towards "already done", which means send nothing. A read that
    // failed must never be the reason a phone buzzes.
    return true;
  }
  return data !== null;
}

/** The four facts buildPriorityView needs, for one named member. */
export async function buildPriorityContextForMember(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string
): Promise<PriorityContext> {
  const [recentCheckins, decision, checkinDoneToday, totals] = await Promise.all([
    readRecentCheckinsForMember(supabase, memberId, 30),
    getFullCoachingDecision(supabase, memberId, localDate),
    readCheckinDoneToday(supabase, memberId, localDate),
    getLoggedDayTotals(supabase, memberId),
  ]);

  return {
    recentCheckins,
    todaysFocus: toTodaysFocusInput(decision),
    checkinDoneToday,
    totalCheckins: totals.allTimeLoggedDays,
  };
}
